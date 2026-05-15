import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne, withTransaction } from "@/lib/db";
import { initiateSTKPush, normalisePhone } from "@/lib/daraja";
import { checkRateLimit } from "@/lib/rate-limiter";
import { Product, SystemStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mpesa/stk
// Initiates an M-Pesa STK Push.
// Security:
//   - Price is NEVER taken from the client; always looked up from DB by product_id
//   - Rate limited: 1 request per phone per 60 seconds (anti PIN-bombing)
//   - Worker dead-man check: warns if APK hasn't reported in 2 minutes
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  phone: z.string().min(9).max(15),
  product_id: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
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

  const { phone, product_id } = parsed.data;

  // ── 1. Normalise & validate phone ─────────────────────────────────────────
  let normalisedPhone: string;
  try {
    normalisedPhone = normalisePhone(phone);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 }
    );
  }

  // ── 2. Rate limiting ──────────────────────────────────────────────────────
  const rateCheck = await checkRateLimit(normalisedPhone);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many requests. Please wait ${rateCheck.retryAfterSeconds}s before trying again.`,
        code: "RATE_LIMITED",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  // ── 3. Look up product price from DB (never trust client price) ───────────
  const product = await queryOne<Product>(
    `SELECT id, name, selling_price, ussd_code_template, is_active
     FROM products WHERE id = $1`,
    [product_id]
  );

  if (!product) {
    return NextResponse.json(
      { success: false, error: "Product not found" },
      { status: 404 }
    );
  }

  if (!product.is_active) {
    return NextResponse.json(
      { success: false, error: "This package is currently unavailable" },
      { status: 400 }
    );
  }

  // ── 4. Check worker heartbeat (dead-man switch) ───────────────────────────
  const status = await queryOne<SystemStatus>(
    `SELECT worker_last_heartbeat, is_phone_online FROM system_status WHERE id = 1`
  );

  const workerIsAlive =
    status?.worker_last_heartbeat &&
    new Date().getTime() -
      new Date(status.worker_last_heartbeat).getTime() <
      2 * 60 * 1000;

  // ── 5. Create PENDING transaction ─────────────────────────────────────────
  const [transaction] = await query<{ id: number }>(
    `INSERT INTO transactions (user_phone, product_id, amount, status)
     VALUES ($1, $2, $3, 'PENDING')
     RETURNING id`,
    [normalisedPhone, product_id, product.selling_price]
  );

  // ── 6. Initiate STK Push ──────────────────────────────────────────────────
  try {
    const stkResponse = await initiateSTKPush(
      normalisedPhone,
      Number(product.selling_price),
      `ORDER-${transaction.id}`,
      `Payment for ${product.name}`
    );

    // Store checkout & merchant request IDs for callback matching
    await query(
      `UPDATE transactions
       SET checkout_request_id = $1,
           merchant_request_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        stkResponse.CheckoutRequestID,
        stkResponse.MerchantRequestID,
        transaction.id,
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        checkout_request_id: stkResponse.CheckoutRequestID,
        message: stkResponse.CustomerMessage,
        worker_online: !!workerIsAlive,
        system_busy: !workerIsAlive,
      },
    });
  } catch (err) {
    // Mark transaction as FAILED if STK initiation fails
    await query(
      `UPDATE transactions SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [(err as Error).message, transaction.id]
    );

    console.error("[/api/mpesa/stk] STK Push failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Could not initiate payment. Please try again.",
        code: "STK_FAILED",
      },
      { status: 502 }
    );
  }
}
