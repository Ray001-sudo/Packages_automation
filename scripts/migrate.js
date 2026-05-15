#!/usr/bin/env node
/**
 * Run: node scripts/migrate.js
 * Reads DATABASE_URL from .env or environment
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = fs.readFileSync(
    path.join(__dirname, "../sql/migrations.sql"),
    "utf8"
  );

  console.log("🚀 Running migrations…");
  try {
    await pool.query(sql);
    console.log("✅ Migration complete.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
