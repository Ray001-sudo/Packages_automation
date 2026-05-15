import { NextRequest, NextResponse } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import {
  sendConfirmationMessage,
  sendPaymentFailedMessage,
  sendSystemBusyMessage,
} from "@/lib/whatsapp";
import { DarajaCallback, Transaction, Product, SystemStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mpesa/callback
// Receives the Daraja STK Push result from Safaricom.
//
// Security Protocols:
//   1. Idempotency: If CheckoutRequestID already has status PAID/SUCCESS,
//      the callback is silently acknowledged (prevents double-fulfillment).
//   2. Price Integrity: ResultCode 0 success is ONLY accepted if the amount
//      in the callback matches the price stored in the DB for that product.
//   3. MerchantRequestID Validation: Must match what we sent — spoofed
//      callbacks that don't reference a real PENDING transaction are rejected.
// ─────────────────────────────────────────────────────────────────────────────

// Safaricom requires a 200 response within 5 seconds or it retries
export async function POST(req: NextRequest) {
  let body: DarajaCallback;
  try {
    body = (await req.json()) as DarajaCallback;
  } catch {
    // Must still return 200 to Safaricom
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const { stkCallback } = body?.Body ?? {};
  if (!stkCallback) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const {
    MerchantRequestID,
    CheckoutRequestID,
    ResultCode,
    ResultDesc,
    CallbackMetadata,
  } = stkCallback;

  console.log(
    `[Callback] CheckoutRequestID=${CheckoutRequestID} ResultCode=${ResultCode}`
  );

  try {
    await withTransaction(async (client) => {
      // ── 1. Find transaction by CheckoutRequestID ────────────────────────
      const { rows: txRows } = await client.query<
        Transaction & { product: Product }
      >(
        `SELECT t.*, p.selling_price, p.name as product_name, p.cost_price
         FROM transactions t
         JOIN products p ON p.id = t.product_id
         WHERE t.checkout_request_id = $1
         FOR UPDATE`,
        [CheckoutRequestID]
      );

      if (txRows.length === 0) {
        // No matching transaction — could be a spoofed callback
        console.warn(
          `[Callback] No transaction found for CheckoutRequestID=${CheckoutRequestID}. Possible spoof.`
        );
        return; // Silently accept to not alert attacker
      }

      const tx = txRows[0];

      // ── 2. Idempotency check ────────────────────────────────────────────
      if (
        tx.status === "PAID" ||
        tx.status === "FULFILLING" ||
        tx.status === "SUCCESS"
      ) {
        console.log(
          `[Callback] Duplicate callback for transaction ${tx.id}, status=${tx.status}. Ignoring.`
        );
        return;
      }

      // ── 3. MerchantRequestID validation ────────────────────────────────
      if (tx.merchant_request_id !== MerchantRequestID) {
        console.error(
          `[Callback] MerchantRequestID mismatch! tx=${tx.merchant_request_id} callback=${MerchantRequestID}`
        );
        // Do NOT update status — transaction remains PENDING for manual review
        return;
      }

      // ── 4. Handle failure ───────────────────────────────────────────────
      if (ResultCode !== 0) {
        await client.query(
          `UPDATE transactions
           SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
           WHERE id = $2`,
          [ResultDesc, tx.id]
        );

        // Notify user via WhatsApp if applicable
        if (tx.user_phone.startsWith("254")) {
          await sendPaymentFailedMessage(tx.user_phone, ResultDesc).catch(
            (e) => console.error("[Callback] WhatsApp send failed:", e)
          );
        }
        return;
      }

      // ── 5. Extract callback metadata ────────────────────────────────────
      const getMetaValue = (name: string) =>
        CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;

      const paidAmount = Number(getMetaValue("Amount") ?? 0);
      const mpesaReceipt = String(getMetaValue("MpesaReceiptNumber") ?? "");
      const phoneFromCallback = String(
        getMetaValue("PhoneNumber") ?? tx.user_phone
      );

      // ── 6. Price Integrity Guard ────────────────────────────────────────
      const expectedAmount = Number(
        (tx as unknown as Record<string, number>).selling_price
      );
      const tolerance = 0.01; // Allow 1-cent floating point tolerance

      if (Math.abs(paidAmount - expectedAmount) > tolerance) {
        console.error(
          `[Callback] PRICE MISMATCH! Expected=${expectedAmount} Paid=${paidAmount} tx=${tx.id}`
        );
        await client.query(
          `UPDATE transactions
           SET status = 'FAILED',
               failure_reason = 'Price mismatch: expected ${expectedAmount}, received ${paidAmount}',
               updated_at = NOW()
           WHERE id = $1`,
          [tx.id]
        );
        return;
      }

      // ── 7. Mark as PAID ─────────────────────────────────────────────────
      await client.query(
        `UPDATE transactions
         SET status = 'PAID',
             mpesa_receipt = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [mpesaReceipt, tx.id]
      );

      // ── 8. Check worker status for user notification ─────────────────────
      const { rows: statusRows } = await client.query<SystemStatus>(
        `SELECT worker_last_heartbeat FROM system_status WHERE id = 1`
      );
      const workerLastSeen = statusRows[0]?.worker_last_heartbeat;
      const workerIsAlive =
        workerLastSeen &&
        new Date().getTime() - new Date(workerLastSeen).getTime() < 2 * 60 * 1000;

      // ── 9. Send WhatsApp confirmation ─────────────────────────────────────
      if (tx.user_phone.startsWith("254")) {
        const productName =
          (tx as unknown as Record<string, string>).product_name;

        if (workerIsAlive) {
          await sendConfirmationMessage(
            tx.user_phone,
            productName,
            paidAmount,
            mpesaReceipt
          ).catch((e) => console.error("[Callback] WhatsApp confirm failed:", e));
        } else {
          await sendSystemBusyMessage(tx.user_phone).catch((e) =>
            console.error("[Callback] WhatsApp busy failed:", e)
          );
        }
      }
    });
  } catch (err) {
    console.error("[/api/mpesa/callback] Error:", err);
  }

  // Always return 200 to Safaricom
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
