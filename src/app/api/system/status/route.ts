import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { SystemStatus } from "@/types";

// GET /api/system/status — returns minimal worker status for the user website
export async function GET() {
  const status = await queryOne<SystemStatus>(
    `SELECT worker_last_heartbeat, is_phone_online FROM system_status WHERE id = 1`
  );

  return NextResponse.json({ success: true, data: status ?? null });
}
