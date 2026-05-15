import { Pool, PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton PostgreSQL connection pool
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

// In development, reuse the pool across hot-reloads
const pool: Pool =
  process.env.NODE_ENV === "development"
    ? (global._pgPool ??= createPool())
    : createPool();

if (process.env.NODE_ENV === "development") {
  global._pgPool = pool;
}

export { pool };

// ── Helper: run a query ───────────────────────────────────────────────────────

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<T>(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// ── Helper: run multiple queries in a transaction ─────────────────────────────

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Helper: single row ────────────────────────────────────────────────────────

export async function queryOne<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
