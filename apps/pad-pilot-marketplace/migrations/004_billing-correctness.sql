ALTER TABLE billing_checkouts ADD COLUMN scope_key TEXT;
ALTER TABLE billing_checkouts ADD COLUMN stripe_checkout_url TEXT;
ALTER TABLE billing_checkouts ADD COLUMN order_id TEXT REFERENCES orders(id);

CREATE UNIQUE INDEX IF NOT EXISTS padpilot_access_provider_subscription
ON padpilot_access(provider_subscription_id)
WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS first_class_provider_subscription
ON first_class_memberships(provider_subscription_id)
WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkouts_active_scope
ON billing_checkouts(user_id, scope_key)
WHERE scope_key IS NOT NULL AND status IN ('created', 'pending');

UPDATE orders
SET status = 'superseded'
WHERE status IN ('created', 'pending', 'paid', 'partially_refunded')
  AND rowid NOT IN (
    SELECT MAX(rowid)
    FROM orders
    WHERE status IN ('created', 'pending', 'paid', 'partially_refunded')
    GROUP BY user_id, module_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_active_module_purchase
ON orders(user_id, module_id)
WHERE status IN ('created', 'pending', 'paid', 'partially_refunded');

CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payment_kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  access_delta_cents INTEGER NOT NULL DEFAULT 0,
  token_delta INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  reversed_access_cents INTEGER NOT NULL DEFAULT 0,
  reversed_tokens INTEGER NOT NULL DEFAULT 0,
  provider_checkout_session_id TEXT,
  provider_invoice_id TEXT,
  provider_payment_intent_id TEXT,
  provider_charge_id TEXT,
  provider_subscription_id TEXT,
  order_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_payment_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_checkout
ON billing_payments(provider, provider_checkout_session_id)
WHERE provider_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_invoice
ON billing_payments(provider, provider_invoice_id)
WHERE provider_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_intent
ON billing_payments(provider, provider_payment_intent_id)
WHERE provider_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_charge
ON billing_payments(provider, provider_charge_id)
WHERE provider_charge_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_resource_cursors (
  resource_key TEXT PRIMARY KEY,
  event_created INTEGER NOT NULL,
  event_priority INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_refunds (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_refund_id TEXT NOT NULL,
  billing_payment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  applied_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_refund_id),
  FOREIGN KEY (billing_payment_id) REFERENCES billing_payments(id)
);

CREATE TABLE IF NOT EXISTS module_draft_deletions (
  module_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
