import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { Product } from "@/types";

function authGuard(req: NextRequest): boolean {
  const key =
    req.headers.get("x-admin-key") ??
    req.cookies.get("admin_key")?.value;
  return key === process.env.ADMIN_SECRET_KEY;
}

const productSchema = z.object({
  name: z.string().min(2).max(255),
  category: z.string().min(2).max(100),
  selling_price: z.number().positive(),
  cost_price: z.number().min(0),
  ussd_code_template: z.string().min(3).max(255),
  is_active: z.boolean().default(true),
  description: z.string().max(500).optional(),
});

// ── GET all products (admin sees all including inactive) ───────────────────────
export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const products = await query<Product>(
    `SELECT * FROM products ORDER BY category, selling_price ASC`
  );

  return NextResponse.json({ success: true, data: products });
}

// ── POST: create new product ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
  }

  const d = parsed.data;
  const [product] = await query<Product>(
    `INSERT INTO products (name, category, selling_price, cost_price, ussd_code_template, is_active, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.name, d.category, d.selling_price, d.cost_price, d.ussd_code_template, d.is_active, d.description ?? null]
  );

  return NextResponse.json({ success: true, data: product }, { status: 201 });
}

// ── PUT: update product ────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "0", 10);
  if (!id) {
    return NextResponse.json({ success: false, error: "Product ID required" }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
  }

  const d = parsed.data;
  const existing = await queryOne<Product>(`SELECT * FROM products WHERE id = $1`, [id]);
  if (!existing) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
  }

  const [product] = await query<Product>(
    `UPDATE products SET
       name = $1, category = $2, selling_price = $3, cost_price = $4,
       ussd_code_template = $5, is_active = $6, description = $7, updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [
      d.name ?? existing.name,
      d.category ?? existing.category,
      d.selling_price ?? existing.selling_price,
      d.cost_price ?? existing.cost_price,
      d.ussd_code_template ?? existing.ussd_code_template,
      d.is_active ?? existing.is_active,
      d.description ?? existing.description,
      id,
    ]
  );

  return NextResponse.json({ success: true, data: product });
}

// ── DELETE: remove product ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "0", 10);
  if (!id) {
    return NextResponse.json({ success: false, error: "Product ID required" }, { status: 400 });
  }

  // Check if product has transactions
  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM transactions WHERE product_id = $1`, [id]
  );

  if (parseInt(count, 10) > 0) {
    // Soft delete instead
    await query(`UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ success: true, message: "Product deactivated (has transactions)" });
  }

  await query(`DELETE FROM products WHERE id = $1`, [id]);
  return NextResponse.json({ success: true, message: "Product deleted" });
}

// ── PATCH: Bulk update USSD codes from JSON upload ────────────────────────────
// Body: { updates: [{ id: number, ussd_code_template: string }] }
export async function PATCH(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { updates: { id: number; ussd_code_template: string }[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ success: false, error: "updates array is required" }, { status: 400 });
  }

  const results: { id: number; success: boolean; error?: string }[] = [];

  for (const update of body.updates) {
    if (typeof update.id !== "number" || typeof update.ussd_code_template !== "string") {
      results.push({ id: update.id, success: false, error: "Invalid format" });
      continue;
    }

    const rows = await query(
      `UPDATE products SET ussd_code_template = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [update.ussd_code_template, update.id]
    );

    results.push({ id: update.id, success: rows.length > 0 });
  }

  const successCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    success: true,
    data: { updated: successCount, total: results.length, results },
  });
}
