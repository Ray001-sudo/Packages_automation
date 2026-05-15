import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Product } from "@/types";

// GET /api/products — returns all active products (public endpoint)
export async function GET(_req: NextRequest) {
  try {
    const products = await query<Product>(
      `SELECT id, name, category, selling_price, description, is_active
       FROM products
       WHERE is_active = true
       ORDER BY category, selling_price ASC`
    );

    return NextResponse.json({ success: true, data: products });
  } catch (err) {
    console.error("[/api/products] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
