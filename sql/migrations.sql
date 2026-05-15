-- ─────────────────────────────────────────────────────────────────────────────
-- Fintech Fulfillment System — PostgreSQL Migration
-- Run: psql -U postgres -d fintech_fulfillment -f sql/migrations.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── PRODUCTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  category      VARCHAR(100) NOT NULL DEFAULT 'DATA',
  selling_price NUMERIC(10, 2) NOT NULL CHECK (selling_price > 0),
  cost_price    NUMERIC(10, 2) NOT NULL CHECK (cost_price >= 0),
  ussd_code_template VARCHAR(255) NOT NULL,   -- e.g. *180*5*2*{pn}*1*1#
  is_active     BOOLEAN NOT NULL DEFAULT true,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRANSACTIONS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                    SERIAL PRIMARY KEY,
  checkout_request_id   VARCHAR(255) UNIQUE,   -- from Daraja STK push (idempotency key)
  merchant_request_id   VARCHAR(255),
  user_phone            VARCHAR(20) NOT NULL,
  product_id            INTEGER NOT NULL REFERENCES products(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PAID','FULFILLING','SUCCESS','FAILED')),
  mpesa_receipt         VARCHAR(255),
  amount                NUMERIC(10, 2) NOT NULL,
  failure_reason        TEXT,
  whatsapp_notified     BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_phone  ON transactions(user_phone);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- ── SYSTEM STATUS (single-row config) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_status (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  worker_last_heartbeat TIMESTAMPTZ,
  battery_level         INTEGER CHECK (battery_level BETWEEN 0 AND 100),
  is_phone_online       BOOLEAN NOT NULL DEFAULT false,
  device_model          VARCHAR(100),
  android_version       VARCHAR(20),
  app_version           VARCHAR(20),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO system_status (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── RATE LIMITS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  phone        VARCHAR(20) PRIMARY KEY,
  last_request TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AUTO-UPDATE updated_at TRIGGER ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_system_status_updated_at
  BEFORE UPDATE ON system_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── SEED SAMPLE PRODUCTS ──────────────────────────────────────────────────────
INSERT INTO products (name, category, selling_price, cost_price, ussd_code_template, description) VALUES
  ('1GB Daily',    'DATA',  20.00, 14.00, '*180*5*2*{pn}*1*1#', '1GB valid for 24 hours'),
  ('2GB Weekly',   'DATA',  50.00, 35.00, '*180*5*2*{pn}*2*1#', '2GB valid for 7 days'),
  ('5GB Monthly',  'DATA', 100.00, 70.00, '*180*5*2*{pn}*3*1#', '5GB valid for 30 days'),
  ('Nightly 1GB',  'DATA',  15.00, 10.00, '*180*5*2*{pn}*4*1#', '1GB valid midnight–6 AM'),
  ('Youtube 1GB',  'DATA',  30.00, 20.00, '*180*5*2*{pn}*5*1#', '1GB YouTube-only bundle'),
  ('Airtime 50',   'AIRTIME', 50.00, 48.00, '*180*1*{pn}*50#',  'Ksh 50 airtime top-up'),
  ('Airtime 100',  'AIRTIME', 100.00, 96.00, '*180*1*{pn}*100#', 'Ksh 100 airtime top-up'),
  ('SMS 100',      'SMS',   10.00,  7.00, '*180*3*{pn}*100#',  '100 SMS to all networks')
ON CONFLICT DO NOTHING;
