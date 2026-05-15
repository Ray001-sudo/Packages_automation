import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/worker/heartbeat
// Called by the Ray Tech APK every 30 seconds to report it is alive.
// Secured by WORKER_API_KEY header.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  battery_level: z.number().int().min(0).max(100),
  is_phone_online: z.boolean(),
  device_model: z.string().max(100).optional(),
  android_version: z.string().max(20).optional(),
  app_version: z.string().max(20).optional(),
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

  const {
    battery_level,
    is_phone_online,
    device_model,
    android_version,
    app_version,
  } = parsed.data;

  await query(
    `UPDATE system_status
     SET worker_last_heartbeat = NOW(),
         battery_level = $1,
         is_phone_online = $2,
         device_model = COALESCE($3, device_model),
         android_version = COALESCE($4, android_version),
         app_version = COALESCE($5, app_version),
         updated_at = NOW()
     WHERE id = 1`,
    [battery_level, is_phone_online, device_model, android_version, app_version]
  );

  return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
}
