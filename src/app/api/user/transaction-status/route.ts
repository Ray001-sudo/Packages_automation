import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { Transaction } from "@/types";

// GET /api/user/transaction-status?id=123
// Public endpoint — only exposes status and failure_reason (no sensitive data)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "0", 10);

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Transaction ID required" },
      { status: 400 }
    );
  }

  const tx = await queryOne<Pick<Transaction, "id" | "status" | "failure_reason">>(
    `SELECT id, status, failure_reason FROM transactions WHERE id = $1`,
    [id]
  );

  if (!tx) {
    return NextResponse.json(
      { success: false, error: "Transaction not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: tx });
}
