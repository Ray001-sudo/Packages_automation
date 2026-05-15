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

export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const products = await query<Product>(
    `SELECT * FROM products ORDER BY category, selling_price ASC`
  );
  return NextResponse.json({ success: true, data: products });
}

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

export async function DELETE(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "0", 10);
  if (!id) {
    return NextResponse.json({ success: false, error: "Product ID required" }, { status: 400 });
  }
  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM transactions WHERE product_id = $1`, [id]
  );
  if (parseInt(count, 10) > 0) {
    await query(`UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ success: true, message: "Product deactivated (has transactions)" });
  }
  await query(`DELETE FROM products WHERE id = $1`, [id]);
  return NextResponse.json({ success: true, message: "Product deleted" });
}

// ── PATCH: Bulk import/upsert from Ray Tech APK JSON export ───────────────────
interface RayTechProduct {
  id: number;
  name: string;
  ussd: string;
  sellingPrice: number;
  safaricomPrice: number;
  category: string;
  status: string | number;
  [key: string]: unknown;
}

export async function PATCH(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { updates?: unknown[] }).updates)
    ? (raw as { updates: unknown[] }).updates
    : [];

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, error: "JSON must be a non-empty array of products" },
      { status: 400 }
    );
  }

  const results: {
    id: number;
    name: string;
    action: "inserted" | "updated" | "skipped";
    error?: string;
  }[] = [];

  for (const item of items) {
    const p = item as RayTechProduct;

    if (
      typeof p.id !== "number" ||
      typeof p.name !== "string" ||
      typeof p.ussd !== "string" ||
      typeof p.sellingPrice !== "number" ||
      typeof p.safaricomPrice !== "number"
    ) {
      results.push({
        id: p.id ?? -1,
        name: p.name ?? "unknown",
        action: "skipped",
        error: "Missing required fields (id, name, ussd, sellingPrice, safaricomPrice)",
      });
      continue;
    }

    // Normalise: bare "pn" → "{pn}"
    const ussdTemplate = p.ussd
      .replace(/\{pn\}/gi, "__PH__")
      .replace(/\bpn\b/g, "{pn}")
      .replace(/__PH__/g, "{pn}");

    const isActive = String(p.status) === "1";
    const category = (p.category ?? "DATA").toUpperCase();

    try {
      await query(
        `INSERT INTO products
           (id, name, category, selling_price, cost_price, ussd_code_template, is_active, description, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name               = EXCLUDED.name,
           category           = EXCLUDED.category,
           selling_price      = EXCLUDED.selling_price,
           cost_price         = EXCLUDED.cost_price,
           ussd_code_template = EXCLUDED.ussd_code_template,
           is_active          = EXCLUDED.is_active,
           description        = EXCLUDED.description,
           updated_at         = NOW()`,
        [p.id, p.name.trim(), category, Number(p.sellingPrice), Number(p.safaricomPrice), ussdTemplate, isActive, p.name.trim()]
      );
      results.push({ id: p.id, name: p.name, action: "updated" });
    } catch (err) {
      results.push({ id: p.id, name: p.name, action: "skipped", error: (err as Error).message });
    }
  }

  await query(
    `SELECT setval('products_id_seq', GREATEST((SELECT MAX(id) FROM products), 1))`
  ).catch(() => null);

  return NextResponse.json({
    success: true,
    data: {
      total: items.length,
      updated: results.filter((r) => r.action === "updated").length,
      inserted: results.filter((r) => r.action === "inserted").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      results,
    },
  });
}