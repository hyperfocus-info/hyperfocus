import { Database } from "bun:sqlite";

import type { BillingCheckoutKind, BillingCheckoutRow, BillingPaymentRow, OrderRow } from "./db";
export function createBillingCheckout(
  db: Database,
  input: {
    amountCentsSnapshot: number;
    checkoutKind: BillingCheckoutKind;
    createdAt: string;
    currency: string;
    orderId?: string | null;
    scopeKey?: string | null;
    status: string;
    stripeCheckoutSessionId?: string | null;
    stripeCheckoutUrl?: string | null;
    stripePriceId?: string | null;
    userId: string;
  },
) {
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO billing_checkouts (
       id, user_id, checkout_kind, stripe_checkout_session_id, stripe_checkout_url,
       stripe_price_id, amount_cents_snapshot, currency, scope_key, order_id, status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.checkoutKind,
    input.stripeCheckoutSessionId ?? null,
    input.stripeCheckoutUrl ?? null,
    input.stripePriceId ?? null,
    input.amountCentsSnapshot,
    input.currency,
    input.scopeKey ?? null,
    input.orderId ?? null,
    input.status,
    input.createdAt,
    input.createdAt,
  );
  return db.query("SELECT * FROM billing_checkouts WHERE id = ?").get(id) as BillingCheckoutRow;
}

export function updateBillingCheckoutSession(
  db: Database,
  checkoutId: string,
  stripeCheckoutSessionId: string,
  status: string,
  updatedAt: string,
  stripeCheckoutUrl: string | null = null,
) {
  const updated = db.query(
    `UPDATE billing_checkouts
     SET stripe_checkout_session_id = ?,
         stripe_checkout_url = COALESCE(?, stripe_checkout_url),
         status = CASE
           WHEN status IN ('completed', 'failed', 'expired') THEN status
           ELSE ?
         END,
         updated_at = CASE WHEN updated_at > ? THEN updated_at ELSE ? END
     WHERE id = ? AND (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id = ?)`,
  ).run(
    stripeCheckoutSessionId,
    stripeCheckoutUrl,
    status,
    updatedAt,
    updatedAt,
    checkoutId,
    stripeCheckoutSessionId,
  );
  if (updated.changes !== 1) {
    throw new Error("Stripe returned conflicting sessions for one Checkout.");
  }
}

export function findActiveBillingCheckoutByScope(db: Database, userId: string, scopeKey: string) {
  return db.query(
    `SELECT * FROM billing_checkouts
     WHERE user_id = ? AND scope_key = ? AND status IN ('created', 'pending')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(userId, scopeKey) as BillingCheckoutRow | null;
}

export function updateBillingCheckoutStatusById(
  db: Database,
  checkoutId: string,
  status: string,
  updatedAt: string,
) {
  db.query("UPDATE billing_checkouts SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, checkoutId);
}

export function createModuleOrder(
  db: Database,
  input: {
    amountCents: number;
    createdAt: string;
    currency: string;
    moduleId: string;
    status: string;
    userId: string;
  },
) {
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO orders (
       id, user_id, module_id, provider, provider_checkout_session_id,
       provider_payment_intent_id, status, amount_cents, currency, created_at, updated_at
     ) VALUES (?, ?, ?, 'stripe', NULL, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.moduleId,
    input.status,
    input.amountCents,
    input.currency,
    input.createdAt,
    input.createdAt,
  );
  return getOrderById(db, id)!;
}

export function getOrderById(db: Database, orderId: string) {
  return db.query("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | null;
}

export function updateModuleOrder(
  db: Database,
  orderId: string,
  input: {
    providerCheckoutSessionId?: string | null;
    providerPaymentIntentId?: string | null;
    status: string;
    updatedAt: string;
  },
) {
  const existing = getOrderById(db, orderId);
  if (!existing) {
    return null;
  }
  const allowedTransition =
    existing.status === input.status ||
    (existing.status === "created" && ["pending", "paid", "failed", "expired"].includes(input.status)) ||
    (existing.status === "pending" && ["paid", "failed", "expired"].includes(input.status)) ||
    (["failed", "expired"].includes(existing.status) && input.status === "paid") ||
    (existing.status === "paid" && ["partially_refunded", "refunded"].includes(input.status)) ||
    (existing.status === "partially_refunded" && input.status === "refunded");
  const nextStatus = allowedTransition ? input.status : existing.status;
  const nextUpdatedAt = existing.updated_at > input.updatedAt ? existing.updated_at : input.updatedAt;
  db.query(
    `UPDATE orders SET provider_checkout_session_id = ?, provider_payment_intent_id = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.providerCheckoutSessionId ?? existing.provider_checkout_session_id,
    input.providerPaymentIntentId ?? existing.provider_payment_intent_id,
    nextStatus,
    nextUpdatedAt,
    orderId,
  );
  return getOrderById(db, orderId);
}

export function grantModuleEntitlement(
  db: Database,
  input: {
    grantedAt: string;
    moduleId: string;
    providerPaymentId: string;
    userId: string;
  },
) {
  db.query(
    `INSERT INTO entitlements (id, user_id, module_id, source, provider_payment_id, granted_at, revoked_at)
     VALUES (?, ?, ?, 'stripe', ?, ?, NULL)
     ON CONFLICT(user_id, module_id) DO UPDATE SET
       source = excluded.source,
       provider_payment_id = excluded.provider_payment_id,
       granted_at = excluded.granted_at,
       revoked_at = NULL`,
  ).run(
    crypto.randomUUID(),
    input.userId,
    input.moduleId,
    input.providerPaymentId,
    input.grantedAt,
  );
}

export function revokeModuleEntitlement(db: Database, moduleId: string, userId: string, revokedAt: string) {
  db.query(
    "UPDATE entitlements SET revoked_at = ? WHERE module_id = ? AND user_id = ? AND revoked_at IS NULL",
  ).run(revokedAt, moduleId, userId);
}

export function updateBillingCheckoutStatusBySessionId(
  db: Database,
  stripeCheckoutSessionId: string,
  status: string,
  updatedAt: string,
) {
  db.query("UPDATE billing_checkouts SET status = ?, updated_at = ? WHERE stripe_checkout_session_id = ?").run(
    status,
    updatedAt,
    stripeCheckoutSessionId,
  );
  return db.query("SELECT * FROM billing_checkouts WHERE stripe_checkout_session_id = ?").get(stripeCheckoutSessionId) as BillingCheckoutRow | null;
}

export function findBillingCheckoutBySessionId(db: Database, stripeCheckoutSessionId: string) {
  return db.query("SELECT * FROM billing_checkouts WHERE stripe_checkout_session_id = ?").get(stripeCheckoutSessionId) as BillingCheckoutRow | null;
}

export function findBillingCheckoutById(db: Database, checkoutId: string) {
  return db.query("SELECT * FROM billing_checkouts WHERE id = ?").get(checkoutId) as BillingCheckoutRow | null;
}

export function recordWebhookEvent(
  db: Database,
  input: {
    eventType: string;
    payloadJson: string;
    processedAt: string;
    provider: string;
    providerEventId: string;
  },
) {
  try {
    db.query(
      "INSERT INTO webhook_events (id, provider, provider_event_id, event_type, processed_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      input.provider,
      input.providerEventId,
      input.eventType,
      input.processedAt,
      input.payloadJson,
    );
    return true;
  } catch (error) {
    const existing = db.query(
      "SELECT 1 FROM webhook_events WHERE provider = ? AND provider_event_id = ?",
    ).get(input.provider, input.providerEventId);
    if (existing) {
      return false;
    }
    throw error;
  }
}

export function recordBillingPayment(
  db: Database,
  input: {
    accessDeltaCents: number;
    amountCents: number;
    createdAt: string;
    currency: string;
    orderId?: string | null;
    paymentKind: string;
    providerChargeId?: string | null;
    providerCheckoutSessionId?: string | null;
    providerInvoiceId?: string | null;
    providerPaymentId: string;
    providerPaymentIntentId?: string | null;
    providerSubscriptionId?: string | null;
    tokenDelta: number;
    userId: string;
  },
) {
  const existing = db.query(
    "SELECT * FROM billing_payments WHERE provider = 'stripe' AND provider_payment_id = ?",
  ).get(input.providerPaymentId) as BillingPaymentRow | null;
  if (existing) {
    return { created: false, payment: existing };
  }

  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO billing_payments (
       id, provider, provider_payment_id, user_id, payment_kind, amount_cents,
       currency, access_delta_cents, token_delta, refunded_cents,
       reversed_access_cents, reversed_tokens, provider_checkout_session_id,
       provider_invoice_id, provider_payment_intent_id, provider_charge_id,
       provider_subscription_id, order_id, created_at, updated_at
     ) VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.providerPaymentId,
    input.userId,
    input.paymentKind,
    input.amountCents,
    input.currency,
    input.accessDeltaCents,
    input.tokenDelta,
    input.providerCheckoutSessionId ?? null,
    input.providerInvoiceId ?? null,
    input.providerPaymentIntentId ?? null,
    input.providerChargeId ?? null,
    input.providerSubscriptionId ?? null,
    input.orderId ?? null,
    input.createdAt,
    input.createdAt,
  );
  return {
    created: true,
    payment: db.query("SELECT * FROM billing_payments WHERE id = ?").get(id) as BillingPaymentRow,
  };
}

export function findBillingPaymentByProviderReferences(
  db: Database,
  input: {
    chargeId?: string | null;
    invoiceId?: string | null;
    paymentIntentId?: string | null;
  },
) {
  if (!input.chargeId && !input.invoiceId && !input.paymentIntentId) {
    return null;
  }
  const clauses: string[] = [];
  const values: string[] = [];
  if (input.chargeId) {
    clauses.push("provider_charge_id = ?");
    values.push(input.chargeId);
  }
  if (input.invoiceId) {
    clauses.push("provider_invoice_id = ?");
    values.push(input.invoiceId);
  }
  if (input.paymentIntentId) {
    clauses.push("provider_payment_intent_id = ?");
    values.push(input.paymentIntentId);
  }
  const payments = db.query(
    `SELECT * FROM billing_payments WHERE provider = 'stripe' AND (${clauses.join(" OR ")})`,
  ).all(...values) as BillingPaymentRow[];
  if (payments.length > 1) {
    throw new Error("Stripe refund references multiple recorded payments.");
  }
  return payments[0] ?? null;
}

export function updateBillingPaymentRefund(
  db: Database,
  paymentId: string,
  input: {
    providerChargeId?: string | null;
    refundedCents: number;
    reversedAccessCents: number;
    reversedTokens: number;
    updatedAt: string;
  },
) {
  db.query(
    `UPDATE billing_payments
     SET refunded_cents = ?, reversed_access_cents = ?, reversed_tokens = ?,
         provider_charge_id = COALESCE(provider_charge_id, ?), updated_at = ?
     WHERE id = ?`,
  ).run(
    input.refundedCents,
    input.reversedAccessCents,
    input.reversedTokens,
    input.providerChargeId ?? null,
    input.updatedAt,
    paymentId,
  );
}

export function recordBillingRefund(
  db: Database,
  input: {
    amountCents: number;
    billingPaymentId: string;
    createdAt: string;
    providerRefundId: string;
    status: string;
  },
) {
  const existing = db.query(
    "SELECT * FROM billing_refunds WHERE provider = 'stripe' AND provider_refund_id = ?",
  ).get(input.providerRefundId) as {
    amount_cents: number;
    applied_at: string | null;
    billing_payment_id: string;
  } | null;
  if (
    existing &&
    (existing.billing_payment_id !== input.billingPaymentId || existing.amount_cents !== input.amountCents)
  ) {
    throw new Error("Stripe refund identity changed between webhook deliveries.");
  }
  if (!existing) {
    db.query(
      `INSERT INTO billing_refunds (
         id, provider, provider_refund_id, billing_payment_id, amount_cents,
         status, applied_at, created_at, updated_at
       ) VALUES (?, 'stripe', ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      input.providerRefundId,
      input.billingPaymentId,
      input.amountCents,
      input.status,
      input.createdAt,
      input.createdAt,
    );
  } else {
    db.query(
      "UPDATE billing_refunds SET status = ?, updated_at = ? WHERE provider = 'stripe' AND provider_refund_id = ?",
    ).run(input.status, input.createdAt, input.providerRefundId);
  }
  if (input.status !== "succeeded" || existing?.applied_at) {
    return false;
  }
  db.query(
    `UPDATE billing_refunds SET applied_at = ?, updated_at = ?
     WHERE provider = 'stripe' AND provider_refund_id = ? AND applied_at IS NULL`,
  ).run(input.createdAt, input.createdAt, input.providerRefundId);
  return true;
}

export function getAppliedBillingRefundTotal(db: Database, billingPaymentId: string) {
  const row = db.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
     FROM billing_refunds
     WHERE billing_payment_id = ? AND applied_at IS NOT NULL`,
  ).get(billingPaymentId) as { total: number };
  return row.total;
}

export function claimBillingResourceEvent(
  db: Database,
  input: {
    eventCreated: number;
    eventId: string;
    eventPriority: number;
    resourceKey: string;
    updatedAt: string;
  },
) {
  const existing = db.query(
    "SELECT event_created, event_priority FROM billing_resource_cursors WHERE resource_key = ?",
  ).get(input.resourceKey) as { event_created: number; event_priority: number } | null;
  if (
    existing &&
    (existing.event_created > input.eventCreated ||
      (existing.event_created === input.eventCreated && existing.event_priority > input.eventPriority))
  ) {
    return false;
  }
  db.query(
    `INSERT INTO billing_resource_cursors (resource_key, event_created, event_priority, event_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource_key) DO UPDATE SET
       event_created = excluded.event_created,
       event_priority = excluded.event_priority,
       event_id = excluded.event_id,
       updated_at = excluded.updated_at`,
  ).run(
    input.resourceKey,
    input.eventCreated,
    input.eventPriority,
    input.eventId,
    input.updatedAt,
  );
  return true;
}

