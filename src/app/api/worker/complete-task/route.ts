import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import {
  sendFulfillmentSuccessMessage,
  sendPaymentFailedMessage,
} from "@/lib/whatsapp";
import { Transaction, Product } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/worker/complete-task
// Called by the Ray Tech APK after it has attempted USSD dialling.
// Marks the transaction SUCCESS or FAILED and notifies the user via WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  transaction_id: z.number().int().positive(),
  success: z.boolean(),
  failure_reason: z.string().max(500).optional(),
});

function authGuard(req: NextRequest): boolean {
  const key = req.headers.get("x-worker-api-key");
  return key === process.env.WORKER_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { transaction_id, success, failure_reason } = parsed.data;

  // Fetch transaction + product
  const tx = await queryOne<Transaction & { product_name: string }>(
    `SELECT t.*, p.name as product_name
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     WHERE t.id = $1 AND t.status = 'FULFILLING'`,
    [transaction_id]
  );

  if (!tx) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Transaction not found or not in FULFILLING state. Possible duplicate completion.",
      },
      { status: 404 }
    );
  }

  const newStatus = success ? "SUCCESS" : "FAILED";

  await query(
    `UPDATE transactions
     SET status = $1,
         failure_reason = $2,
         whatsapp_notified = false,
         updated_at = NOW()
     WHERE id = $3`,
    [newStatus, failure_reason ?? null, transaction_id]
  );

  // Send WhatsApp notification
  if (tx.user_phone.startsWith("254")) {
    try {
      if (success) {
        await sendFulfillmentSuccessMessage(tx.user_phone, tx.product_name);
      } else {
        await sendPaymentFailedMessage(
          tx.user_phone,
          failure_reason ?? "Bundle activation failed. Please contact support."
        );
      }

      // Mark as notified
      await query(
        `UPDATE transactions SET whatsapp_notified = true WHERE id = $1`,
        [transaction_id]
      );
    } catch (err) {
      console.error(
        `[/api/worker/complete-task] WhatsApp notification failed for tx ${transaction_id}:`,
        err
      );
      // Don't fail the whole request if notification fails
    }
  }

  return NextResponse.json({ success: true, status: newStatus });
}
