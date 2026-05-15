import { pool } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter — persisted in PostgreSQL
// Prevents PIN bombing: 1 STK request per phone per 60 seconds
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_SECONDS = 60;

export async function checkRateLimit(
  phone: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ last_request: Date }>(
      `SELECT last_request FROM rate_limits WHERE phone = $1 FOR UPDATE`,
      [phone]
    );

    if (rows.length > 0) {
      const lastRequest = rows[0].last_request;
      const secondsSince = (Date.now() - lastRequest.getTime()) / 1000;

      if (secondsSince < WINDOW_SECONDS) {
        await client.query("ROLLBACK");
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(WINDOW_SECONDS - secondsSince),
        };
      }

      // Update existing record
      await client.query(
        `UPDATE rate_limits SET last_request = NOW() WHERE phone = $1`,
        [phone]
      );
    } else {
      // Insert new record
      await client.query(
        `INSERT INTO rate_limits (phone, last_request) VALUES ($1, NOW())`,
        [phone]
      );
    }

    await client.query("COMMIT");
    return { allowed: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Clean up old rate limit entries (call periodically) ───────────────────────

export async function cleanupRateLimits(): Promise<void> {
  await pool.query(
    `DELETE FROM rate_limits WHERE last_request < NOW() - INTERVAL '10 minutes'`
  );
}
