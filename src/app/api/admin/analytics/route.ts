import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { Analytics, SystemStatus } from "@/types";

// Admin auth middleware
function authGuard(req: NextRequest): boolean {
  const key =
    req.headers.get("x-admin-key") ??
    req.cookies.get("admin_key")?.value;
  return key === process.env.ADMIN_SECRET_KEY;
}

// GET /api/admin/analytics
export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Aggregated stats ──────────────────────────────────────────────────────
    const stats = await queryOne<{
      total_revenue: string;
      total_cost: string;
      total_transactions: string;
      success_count: string;
      failed_count: string;
      pending_count: string;
      fulfilling_count: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN t.amount ELSE 0 END), 0)       AS total_revenue,
         COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN p.cost_price ELSE 0 END), 0)   AS total_cost,
         COUNT(*)                                                                          AS total_transactions,
         COUNT(*) FILTER (WHERE t.status = 'SUCCESS')                                     AS success_count,
         COUNT(*) FILTER (WHERE t.status = 'FAILED')                                      AS failed_count,
         COUNT(*) FILTER (WHERE t.status = 'PENDING')                                     AS pending_count,
         COUNT(*) FILTER (WHERE t.status = 'FULFILLING')                                  AS fulfilling_count
       FROM transactions t
       JOIN products p ON p.id = t.product_id`
    );

    // ── Today's stats ─────────────────────────────────────────────────────────
    const todayStats = await queryOne<{
      today_revenue: string;
      today_transactions: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS today_revenue,
         COUNT(*) AS today_transactions
       FROM transactions
       WHERE created_at >= CURRENT_DATE`
    );

    // ── Revenue by category ───────────────────────────────────────────────────
    const revenueByCategory = await query<{ category: string; revenue: string }>(
      `SELECT p.category, COALESCE(SUM(t.amount), 0) AS revenue
       FROM transactions t
       JOIN products p ON p.id = t.product_id
       WHERE t.status = 'SUCCESS'
       GROUP BY p.category
       ORDER BY revenue DESC`
    );

    // ── Daily revenue (last 14 days) ─────────────────────────────────────────
    const dailyRevenue = await query<{
      date: string;
      revenue: string;
      transactions: string;
    }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS revenue,
         COUNT(*) AS transactions
       FROM transactions
       WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY date ASC`
    );

    // ── System status ─────────────────────────────────────────────────────────
    const systemStatus = await queryOne<SystemStatus>(
      `SELECT * FROM system_status WHERE id = 1`
    );

    const totalRevenue = Number(stats?.total_revenue ?? 0);
    const totalCost = Number(stats?.total_cost ?? 0);
    const totalTransactions = Number(stats?.total_transactions ?? 0);
    const successCount = Number(stats?.success_count ?? 0);

    const analytics: Analytics = {
      total_revenue: totalRevenue,
      total_cost: totalCost,
      net_profit: totalRevenue - totalCost,
      total_transactions: totalTransactions,
      success_count: successCount,
      failed_count: Number(stats?.failed_count ?? 0),
      pending_count: Number(stats?.pending_count ?? 0),
      fulfilling_count: Number(stats?.fulfilling_count ?? 0),
      success_rate:
        totalTransactions > 0
          ? Math.round((successCount / totalTransactions) * 100)
          : 0,
      today_revenue: Number(todayStats?.today_revenue ?? 0),
      today_transactions: Number(todayStats?.today_transactions ?? 0),
      revenue_by_category: revenueByCategory.map((r) => ({
        category: r.category,
        revenue: Number(r.revenue),
      })),
      daily_revenue: dailyRevenue.map((d) => ({
        date: d.date,
        revenue: Number(d.revenue),
        transactions: Number(d.transactions),
      })),
    };

    return NextResponse.json({
      success: true,
      data: { analytics, system_status: systemStatus },
    });
  } catch (err) {
    console.error("[/api/admin/analytics] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
