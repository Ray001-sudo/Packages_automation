import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Transaction } from "@/types";

function authGuard(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key") ?? req.cookies.get("admin_key")?.value;
  return key === process.env.ADMIN_SECRET_KEY;
}

// GET /api/admin/transactions?page=1&limit=50&status=ALL&phone=
export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const status = searchParams.get("status") ?? "ALL";
  const phone = searchParams.get("phone") ?? "";

  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status !== "ALL") {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (phone) {
    params.push(`%${phone}%`);
    conditions.push(`t.user_phone LIKE $${params.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [{ total }] = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM transactions t ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const transactions = await query<Transaction & { product_name: string }>(
    `SELECT t.*, p.name AS product_name, p.category
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return NextResponse.json({
    success: true,
    data: {
      transactions,
      pagination: {
        page,
        limit,
        total: parseInt(total, 10),
        pages: Math.ceil(parseInt(total, 10) / limit),
      },
    },
  });
}
