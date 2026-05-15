import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { WorkerTask } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/worker/next-task
// Polled by the Ray Tech APK to get the next PAID transaction to fulfil.
// Returns one task at a time; atomically moves it to FULFILLING status to
// prevent two APK instances from picking the same task.
// ─────────────────────────────────────────────────────────────────────────────

function authGuard(req: NextRequest): boolean {
  const key = req.headers.get("x-worker-api-key");
  return key === process.env.WORKER_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const task = await withTransaction(async (client) => {
      // SELECT ... FOR UPDATE SKIP LOCKED: atomic claim — safe with multiple workers
      const { rows } = await client.query<{
        id: number;
        user_phone: string;
        ussd_code_template: string;
        product_name: string;
      }>(
        `SELECT t.id, t.user_phone, p.ussd_code_template, p.name as product_name
         FROM transactions t
         JOIN products p ON p.id = t.product_id
         WHERE t.status = 'PAID'
         ORDER BY t.updated_at ASC
         LIMIT 1
         FOR UPDATE OF t SKIP LOCKED`
      );

      if (rows.length === 0) return null;

      const tx = rows[0];

      // Move to FULFILLING
      await client.query(
        `UPDATE transactions SET status = 'FULFILLING', updated_at = NOW() WHERE id = $1`,
        [tx.id]
      );

      // Replace {pn} placeholder with the actual phone number
      const ussdCode = tx.ussd_code_template.replace(
        /\{pn\}/gi,
        tx.user_phone
      );

      return {
        transaction_id: tx.id,
        user_phone: tx.user_phone,
        ussd_code: ussdCode,
        product_name: tx.product_name,
      } as WorkerTask & { product_name: string };
    });

    if (!task) {
      return NextResponse.json({ success: true, data: null }); // No pending tasks
    }

    return NextResponse.json({ success: true, data: task });
  } catch (err) {
    console.error("[/api/worker/next-task] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
