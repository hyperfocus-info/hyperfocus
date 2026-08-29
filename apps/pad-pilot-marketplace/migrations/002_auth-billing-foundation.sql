ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN pilot_token_balance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS padpilot_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  lifetime_price_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  remaining_balance_cents INTEGER NOT NULL DEFAULT 0,
  billing_anchor_at TEXT,
  last_successful_payment_at TEXT,
  next_billing_at TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS first_class_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  billing_anchor_at TEXT,
  last_successful_payment_at TEXT,
  next_billing_at TEXT,
  discount_percent INTEGER NOT NULL DEFAULT 20,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pilot_token_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL UNIQUE,
  delta_tokens INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  notes_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS billing_checkouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  checkout_kind TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_price_id TEXT,
  amount_cents_snapshot INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
