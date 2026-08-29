import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { processStripeWebhook } from "./billing-webhooks";
import {
  createBillingCheckout,
  createModule,
  createModuleOrder,
  getAccountSnapshot,
  getFirstClassMembershipByUserId,
  getOrderById,
  getPadPilotAccessByUserId,
  hasActiveModuleEntitlement,
  openMarketplaceDatabase,
  updateBillingCheckoutSession,
  updateModuleOrder,
  upsertFirstClassMembership,
  upsertPadPilotAccess,
  upsertUserFromClerk,
  type UserRow,
} from "./db";
import { loadMarketplaceEnv } from "./env";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      try {
        rmSync(tempRoot, { force: true, recursive: true });
      } catch {
        // SQLite can hold a short-lived lock on Windows after close; ignore temp cleanup failure in tests.
      }
    }
  }
});

function createTestContext() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-billing-"));
  tempRoots.push(tempRoot);
  const runtimeEnv = {
    ...loadMarketplaceEnv(),
    dbPath: path.join(tempRoot, "db", "padpilot-billing.sqlite"),
    padpilotFinancingMonthlyPriceCents: 1000,
    padpilotLifetimePriceCents: 6000,
    uploadRoot: path.join(tempRoot, "uploads"),
  };
  return { db: openMarketplaceDatabase(runtimeEnv), runtimeEnv };
}

function createUser(db: ReturnType<typeof openMarketplaceDatabase>, suffix: string) {
  return upsertUserFromClerk(db, {
    clerkUserId: `clerk_user_${suffix}`,
    displayName: "Billing User",
    email: `${suffix}@example.com`,
    username: `billing-${suffix}`,
  }, "2026-03-21T12:00:00.000Z");
}

function getUser(db: ReturnType<typeof openMarketplaceDatabase>, userId: string) {
  return db.query<UserRow, string>("SELECT * FROM users WHERE id = ?").get(userId);
}

function checkoutCompletedEvent(input: {
  checkoutId?: string;
  eventId: string;
  kind: "first_class_start" | "module_purchase" | "padpilot_financing_start" | "padpilot_lifetime_buyout" | "padpilot_lifetime_outright";
  orderId?: string;
  paymentIntentId?: string;
  sessionId: string;
  subscriptionId?: string;
  userId: string;
  amount?: number;
}) {
  return {
    id: input.eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        amount_total: input.amount ?? 1000,
        created: 1774094400,
        currency: "usd",
        customer: "cus_123",
        metadata: {
          checkout_id: input.checkoutId,
          checkout_kind: input.kind,
          order_id: input.orderId,
          user_id: input.userId,
        },
        payment_intent: input.paymentIntentId ?? null,
        payment_status: "paid",
        subscription: input.subscriptionId ?? null,
      },
    },
  };
}

function paidInvoiceEvent(input: {
  checkoutId: string;
  eventId: string;
  invoiceId: string;
  kind: "first_class_start" | "padpilot_financing_start";
  subscriptionId: string;
  userId: string;
  eventCreated?: number;
}) {
  return {
    created: input.eventCreated,
    id: input.eventId,
    type: "invoice.paid",
    data: {
      object: {
        id: input.invoiceId,
        amount_paid: 1000,
        created: 1774094401,
        currency: "usd",
        customer: "cus_123",
        lines: { data: [{ period: { end: 1776772800 } }] },
        parent: {
          subscription_details: {
            metadata: {
              checkout_id: input.checkoutId,
              checkout_kind: input.kind,
              user_id: input.userId,
            },
          },
        },
        subscription: input.subscriptionId,
      },
    },
  };
}

function refundedChargeEvent(input: {
  amount: number;
  amountRefunded: number;
  chargeId: string;
  eventId: string;
  paymentIntentId: string;
}) {
  return {
    id: input.eventId,
    type: "charge.refunded",
    data: {
      object: {
        id: input.chargeId,
        amount: input.amount,
        amount_refunded: input.amountRefunded,
        created: 1774094500,
        currency: "usd",
        payment_intent: input.paymentIntentId,
      },
    },
  };
}

describe("processStripeWebhook", () => {
  it("grants First Class tokens once from the invoice, not again from Checkout", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "fc");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "first_class_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_test_first_class",
      userId,
    });
    const checkoutEvent = checkoutCompletedEvent({
      eventId: "evt_fc_complete",
      kind: "first_class_start",
      sessionId: "cs_test_first_class",
      subscriptionId: "sub_fc_123",
      userId,
    });

    processStripeWebhook(db, checkoutEvent, JSON.stringify(checkoutEvent), runtimeEnv);
    let snapshot = getAccountSnapshot(db, getUser(db, userId));
    expect(snapshot.firstClass?.status).toBe("active");
    expect(snapshot.tokenBalance).toBe(0);

    const invoiceEvent = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventId: "evt_fc_invoice",
      invoiceId: "in_fc_123",
      kind: "first_class_start",
      subscriptionId: "sub_fc_123",
      userId,
    });
    processStripeWebhook(db, invoiceEvent, JSON.stringify(invoiceEvent), runtimeEnv);
    processStripeWebhook(db, invoiceEvent, JSON.stringify(invoiceEvent), runtimeEnv);

    snapshot = getAccountSnapshot(db, getUser(db, userId));
    expect(snapshot.firstClass?.provider_subscription_id).toBe("sub_fc_123");
    expect(snapshot.tokenBalance).toBe(100);
    expect(snapshot.subscriptionStatus).toBe("first_class_active");
    expect((db.query("SELECT COUNT(*) AS count FROM pilot_token_ledger").get() as { count: number }).count).toBe(1);
    db.close(false);
  });

  it("handles invoice delivery before Checkout completion without losing payment", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "reordered");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "padpilot_financing_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_test_reordered",
      userId,
    });
    const invoiceEvent = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventId: "evt_reordered_invoice",
      invoiceId: "in_reordered",
      kind: "padpilot_financing_start",
      subscriptionId: "sub_reordered",
      userId,
    });
    processStripeWebhook(db, invoiceEvent, JSON.stringify(invoiceEvent), runtimeEnv);
    expect(getPadPilotAccessByUserId(db, userId)?.amount_paid_cents).toBe(1000);

    const checkoutEvent = checkoutCompletedEvent({
      eventId: "evt_reordered_checkout",
      kind: "padpilot_financing_start",
      sessionId: "cs_test_reordered",
      subscriptionId: "sub_reordered",
      userId,
    });
    processStripeWebhook(db, checkoutEvent, JSON.stringify(checkoutEvent), runtimeEnv);
    const access = getPadPilotAccessByUserId(db, userId);
    expect(access?.amount_paid_cents).toBe(1000);
    expect(access?.status).toBe("financing");
    db.close(false);
  });

  it("rolls back the event marker when signed payment data does not match Checkout", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "rollback");
    createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "first_class_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_test_rollback",
      userId,
    });
    const badEvent = checkoutCompletedEvent({
      amount: 999,
      eventId: "evt_rollback",
      kind: "first_class_start",
      sessionId: "cs_test_rollback",
      subscriptionId: "sub_rollback",
      userId,
    });
    expect(() => processStripeWebhook(db, badEvent, JSON.stringify(badEvent), runtimeEnv)).toThrow("does not match");
    expect((db.query("SELECT COUNT(*) AS count FROM webhook_events").get() as { count: number }).count).toBe(0);
    expect((db.query("SELECT status FROM billing_checkouts WHERE stripe_checkout_session_id = ?").get("cs_test_rollback") as { status: string }).status).toBe("pending");

    badEvent.data.object.amount_total = 1000;
    processStripeWebhook(db, badEvent, JSON.stringify(badEvent), runtimeEnv);
    expect((db.query("SELECT COUNT(*) AS count FROM webhook_events").get() as { count: number }).count).toBe(1);
    db.close(false);
  });

  it("makes lifetime terminal and asks for retry-safe financing cancellation", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "lifetime");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "padpilot_financing_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "completed",
      stripeCheckoutSessionId: "cs_test_lifetime",
      userId,
    });
    upsertPadPilotAccess(db, userId, {
      amountPaidCents: 5000,
      billingAnchorAt: "2026-01-01T00:00:00.000Z",
      lastSuccessfulPaymentAt: "2026-02-01T00:00:00.000Z",
      lifetimePriceCents: 6000,
      nextBillingAt: "2026-04-01T00:00:00.000Z",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_lifetime",
      status: "financing",
    }, "2026-03-01T00:00:00.000Z");
    const invoiceEvent = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventId: "evt_lifetime_invoice",
      invoiceId: "in_lifetime",
      kind: "padpilot_financing_start",
      subscriptionId: "sub_lifetime",
      userId,
    });
    const firstResult = processStripeWebhook(db, invoiceEvent, JSON.stringify(invoiceEvent), runtimeEnv);
    const retryResult = processStripeWebhook(db, invoiceEvent, JSON.stringify(invoiceEvent), runtimeEnv);
    expect(firstResult.cancelSubscriptionId).toBe("sub_lifetime");
    expect(retryResult.cancelSubscriptionId).toBe("sub_lifetime");
    expect(retryResult.duplicate).toBe(true);
    expect(getPadPilotAccessByUserId(db, userId)?.status).toBe("lifetime");

    const subscriptionUpdate = {
      id: "evt_lifetime_update",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_lifetime", created: 1774094402, current_period_end: 1776772800, status: "active" } },
    };
    const updateResult = processStripeWebhook(db, subscriptionUpdate, JSON.stringify(subscriptionUpdate), runtimeEnv);
    expect(updateResult.cancelSubscriptionId).toBe("sub_lifetime");
    expect(getPadPilotAccessByUserId(db, userId)?.status).toBe("lifetime");
    db.close(false);
  });

  it("does not apply the same invoice twice under different Stripe event ids", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "invoice-idempotent");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "padpilot_financing_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "completed",
      stripeCheckoutSessionId: "cs_invoice_idempotent",
      userId,
    });
    const first = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventId: "evt_invoice_first",
      invoiceId: "in_same_payment",
      kind: "padpilot_financing_start",
      subscriptionId: "sub_invoice_idempotent",
      userId,
    });
    const replay = {
      ...first,
      id: "evt_invoice_replayed_under_new_id",
    };

    processStripeWebhook(db, first, JSON.stringify(first), runtimeEnv);
    processStripeWebhook(db, replay, JSON.stringify(replay), runtimeEnv);

    expect(getPadPilotAccessByUserId(db, userId)?.amount_paid_cents).toBe(1000);
    expect((db.query("SELECT COUNT(*) AS count FROM billing_payments").get() as { count: number }).count).toBe(1);
    db.close(false);
  });

  it("credits a late invoice from an old subscription without replacing the current membership", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "detached-first-class-invoice");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "first_class_start",
      createdAt: "2026-03-01T12:00:00.000Z",
      currency: "usd",
      status: "completed",
      stripeCheckoutSessionId: "cs_old_first_class",
      userId,
    });
    upsertFirstClassMembership(db, userId, {
      billingAnchorAt: "2026-04-01T00:00:00.000Z",
      discountPercent: 20,
      lastSuccessfulPaymentAt: "2026-04-01T00:00:00.000Z",
      nextBillingAt: "2026-05-01T00:00:00.000Z",
      providerCustomerId: "cus_current",
      providerSubscriptionId: "sub_current",
      status: "active",
    }, "2026-04-01T00:00:00.000Z");
    const lateInvoice = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventId: "evt_late_old_first_class_invoice",
      invoiceId: "in_late_old_first_class",
      kind: "first_class_start",
      subscriptionId: "sub_old",
      userId,
    });
    lateInvoice.data.object.customer = "cus_old";

    processStripeWebhook(db, lateInvoice, JSON.stringify(lateInvoice), runtimeEnv);

    const membership = getFirstClassMembershipByUserId(db, userId);
    expect(membership?.provider_subscription_id).toBe("sub_current");
    expect(membership?.provider_customer_id).toBe("cus_current");
    expect(membership?.status).toBe("active");
    expect(getAccountSnapshot(db, getUser(db, userId)).tokenBalance).toBe(100);
    db.close(false);
  });

  it("ignores an older payment failure delivered after a newer successful invoice", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "stale-failure");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "padpilot_financing_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "completed",
      stripeCheckoutSessionId: "cs_stale_failure",
      userId,
    });
    const paid = paidInvoiceEvent({
      checkoutId: checkout.id,
      eventCreated: 200,
      eventId: "evt_newer_paid",
      invoiceId: "in_newer_paid",
      kind: "padpilot_financing_start",
      subscriptionId: "sub_stale_failure",
      userId,
    });
    const failed = {
      created: 100,
      id: "evt_older_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_older_failed",
          created: 1774094300,
          subscription: "sub_stale_failure",
        },
      },
    };

    processStripeWebhook(db, paid, JSON.stringify(paid), runtimeEnv);
    processStripeWebhook(db, failed, JSON.stringify(failed), runtimeEnv);

    expect(getPadPilotAccessByUserId(db, userId)?.status).toBe("financing");
    db.close(false);
  });

  it("preserves a cancellation delivered before older Checkout completion", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "canceled-before-checkout");
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1000,
      checkoutKind: "padpilot_financing_start",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_canceled_before_checkout",
      userId,
    });
    const canceled = {
      created: 200,
      id: "evt_subscription_canceled_first",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_canceled_before_checkout",
          created: 1774094500,
          customer: "cus_canceled_before_checkout",
          metadata: {
            checkout_id: checkout.id,
            checkout_kind: "padpilot_financing_start",
            user_id: userId,
          },
        },
      },
    };
    const completed = {
      ...checkoutCompletedEvent({
        eventId: "evt_older_checkout_completed",
        kind: "padpilot_financing_start",
        sessionId: "cs_canceled_before_checkout",
        subscriptionId: "sub_canceled_before_checkout",
        userId,
      }),
      created: 100,
    };

    processStripeWebhook(db, canceled, JSON.stringify(canceled), runtimeEnv);
    processStripeWebhook(db, completed, JSON.stringify(completed), runtimeEnv);
    const activeAtSameSecond = {
      created: 200,
      id: "evt_active_same_second",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_canceled_before_checkout",
          created: 1774094500,
          current_period_end: 1776772800,
          status: "active",
        },
      },
    };
    processStripeWebhook(db, activeAtSameSecond, JSON.stringify(activeAtSameSecond), runtimeEnv);

    expect(getPadPilotAccessByUserId(db, userId)?.status).toBe("canceled");
    db.close(false);
  });

  it("grants a paid module exactly once and revokes it after a full cumulative refund", () => {
    const { db, runtimeEnv } = createTestContext();
    const sellerId = createUser(db, "module-seller");
    const buyerId = createUser(db, "module-buyer");
    const moduleId = "module_paid_fixture";
    createModule(
      db,
      moduleId,
      sellerId,
      "paid-fixture",
      "Paid Fixture",
      "",
      1200,
      "2026-03-21T12:00:00.000Z",
    );
    const order = createModuleOrder(db, {
      amountCents: 1200,
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      moduleId,
      status: "pending",
      userId: buyerId,
    });
    createBillingCheckout(db, {
      amountCentsSnapshot: 1200,
      checkoutKind: "module_purchase",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      orderId: order.id,
      status: "pending",
      stripeCheckoutSessionId: "cs_module_purchase",
      userId: buyerId,
    });
    const checkout = checkoutCompletedEvent({
      amount: 1200,
      eventId: "evt_module_purchase",
      kind: "module_purchase",
      orderId: order.id,
      paymentIntentId: "pi_module_purchase",
      sessionId: "cs_module_purchase",
      userId: buyerId,
    });

    processStripeWebhook(db, checkout, JSON.stringify(checkout), runtimeEnv);
    expect(hasActiveModuleEntitlement(db, moduleId, buyerId)).toBe(true);
    expect(getOrderById(db, order.id)?.status).toBe("paid");

    const partialRefund = refundedChargeEvent({
      amount: 1200,
      amountRefunded: 400,
      chargeId: "ch_module_purchase",
      eventId: "evt_module_partial_refund",
      paymentIntentId: "pi_module_purchase",
    });
    processStripeWebhook(db, partialRefund, JSON.stringify(partialRefund), runtimeEnv);
    expect(hasActiveModuleEntitlement(db, moduleId, buyerId)).toBe(true);
    expect(getOrderById(db, order.id)?.status).toBe("partially_refunded");

    const fullRefund = refundedChargeEvent({
      amount: 1200,
      amountRefunded: 1200,
      chargeId: "ch_module_purchase",
      eventId: "evt_module_full_refund",
      paymentIntentId: "pi_module_purchase",
    });
    processStripeWebhook(db, fullRefund, JSON.stringify(fullRefund), runtimeEnv);
    expect(hasActiveModuleEntitlement(db, moduleId, buyerId)).toBe(false);
    expect(getOrderById(db, order.id)?.status).toBe("refunded");
    db.close(false);
  });

  it("recovers Checkout completion before session persistence without later status downgrade", () => {
    const { db, runtimeEnv } = createTestContext();
    const sellerId = createUser(db, "recovery-seller");
    const buyerId = createUser(db, "recovery-buyer");
    const moduleId = "module_checkout_recovery";
    createModule(
      db,
      moduleId,
      sellerId,
      "checkout-recovery",
      "Checkout Recovery",
      "",
      1200,
      "2026-03-21T12:00:00.000Z",
    );
    db.query("UPDATE modules SET visibility = 'published' WHERE id = ?").run(moduleId);
    const order = createModuleOrder(db, {
      amountCents: 1200,
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      moduleId,
      status: "created",
      userId: buyerId,
    });
    const checkout = createBillingCheckout(db, {
      amountCentsSnapshot: 1200,
      checkoutKind: "module_purchase",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      orderId: order.id,
      status: "created",
      userId: buyerId,
    });
    const completed = checkoutCompletedEvent({
      amount: 1200,
      checkoutId: checkout.id,
      eventId: "evt_checkout_recovery",
      kind: "module_purchase",
      orderId: order.id,
      paymentIntentId: "pi_checkout_recovery",
      sessionId: "cs_checkout_recovery",
      userId: buyerId,
    });
    processStripeWebhook(db, completed, JSON.stringify(completed), runtimeEnv);
    expect(hasActiveModuleEntitlement(db, moduleId, buyerId)).toBe(true);
    expect(getOrderById(db, order.id)?.status).toBe("paid");
    expect((db.query("SELECT status FROM billing_checkouts WHERE id = ?").get(checkout.id) as { status: string }).status).toBe("completed");

    updateBillingCheckoutSession(
      db,
      checkout.id,
      "cs_checkout_recovery",
      "pending",
      "2026-03-21T12:00:00.000Z",
      "https://stripe.test/checkout/cs_checkout_recovery",
    );
    updateModuleOrder(db, order.id, {
      providerCheckoutSessionId: "cs_checkout_recovery",
      status: "pending",
      updatedAt: "2026-03-21T12:00:00.000Z",
    });

    expect(getOrderById(db, order.id)?.status).toBe("paid");
    expect((db.query("SELECT status FROM billing_checkouts WHERE id = ?").get(checkout.id) as { status: string }).status).toBe("completed");
    db.close(false);
  });

  it("reverses lifetime access and token credit when its charge is refunded", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "lifetime-refund");
    createBillingCheckout(db, {
      amountCentsSnapshot: 6000,
      checkoutKind: "padpilot_lifetime_outright",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_lifetime_refund",
      userId,
    });
    const checkout = checkoutCompletedEvent({
      amount: 6000,
      eventId: "evt_lifetime_purchase",
      kind: "padpilot_lifetime_outright",
      paymentIntentId: "pi_lifetime_refund",
      sessionId: "cs_lifetime_refund",
      userId,
    });
    processStripeWebhook(db, checkout, JSON.stringify(checkout), runtimeEnv);
    expect(getAccountSnapshot(db, getUser(db, userId)).tokenBalance).toBe(600);

    const refund = {
      id: "evt_lifetime_refund_created",
      type: "refund.created",
      data: {
        object: {
          id: "re_lifetime_refund",
          amount: 6000,
          charge: "ch_lifetime_refund",
          created: 1774094500,
          currency: "usd",
          payment_intent: "pi_lifetime_refund",
          status: "succeeded",
        },
      },
    };
    processStripeWebhook(db, refund, JSON.stringify(refund), runtimeEnv);

    const cumulativeCharge = refundedChargeEvent({
      amount: 6000,
      amountRefunded: 6000,
      chargeId: "ch_lifetime_refund",
      eventId: "evt_lifetime_charge_refunded",
      paymentIntentId: "pi_lifetime_refund",
    });
    processStripeWebhook(db, cumulativeCharge, JSON.stringify(cumulativeCharge), runtimeEnv);

    const snapshot = getAccountSnapshot(db, getUser(db, userId));
    expect(snapshot.padpilotAccess?.status).toBe("past_due");
    expect(snapshot.padpilotAccess?.amount_paid_cents).toBe(0);
    expect(snapshot.tokenBalance).toBe(0);
    db.close(false);
  });

  it("does not double-apply a refund object delivered after its cumulative charge update", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "charge-before-refund-object");
    createBillingCheckout(db, {
      amountCentsSnapshot: 6000,
      checkoutKind: "padpilot_lifetime_outright",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_charge_before_refund",
      userId,
    });
    const checkout = checkoutCompletedEvent({
      amount: 6000,
      eventId: "evt_charge_before_refund_purchase",
      kind: "padpilot_lifetime_outright",
      paymentIntentId: "pi_charge_before_refund",
      sessionId: "cs_charge_before_refund",
      userId,
    });
    processStripeWebhook(db, checkout, JSON.stringify(checkout), runtimeEnv);

    const cumulativeCharge = refundedChargeEvent({
      amount: 6000,
      amountRefunded: 6000,
      chargeId: "ch_charge_before_refund",
      eventId: "evt_charge_before_refund_charge",
      paymentIntentId: "pi_charge_before_refund",
    });
    processStripeWebhook(db, cumulativeCharge, JSON.stringify(cumulativeCharge), runtimeEnv);
    const refund = {
      id: "evt_charge_before_refund_object",
      type: "refund.created",
      data: {
        object: {
          id: "re_charge_before_refund",
          amount: 6000,
          charge: "ch_charge_before_refund",
          created: 1774094600,
          currency: "usd",
          payment_intent: "pi_charge_before_refund",
          status: "succeeded",
        },
      },
    };
    processStripeWebhook(db, refund, JSON.stringify(refund), runtimeEnv);

    const snapshot = getAccountSnapshot(db, getUser(db, userId));
    expect(snapshot.padpilotAccess?.amount_paid_cents).toBe(0);
    expect(snapshot.tokenBalance).toBe(0);
    expect((db.query("SELECT refunded_cents FROM billing_payments WHERE provider_payment_intent_id = ?").get("pi_charge_before_refund") as { refunded_cents: number }).refunded_cents).toBe(6000);
    db.close(false);
  });

  it("retries financing cancellation when a completed buyout webhook is redelivered", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "buyout-cancel-retry");
    upsertPadPilotAccess(db, userId, {
      amountPaidCents: 3000,
      billingAnchorAt: "2026-01-01T00:00:00.000Z",
      lastSuccessfulPaymentAt: "2026-03-01T00:00:00.000Z",
      lifetimePriceCents: 6000,
      nextBillingAt: "2026-04-01T00:00:00.000Z",
      providerCustomerId: "cus_buyout",
      providerSubscriptionId: "sub_buyout",
      status: "financing",
    }, "2026-03-01T00:00:00.000Z");
    createBillingCheckout(db, {
      amountCentsSnapshot: 3000,
      checkoutKind: "padpilot_lifetime_buyout",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_buyout_retry",
      userId,
    });
    const event = checkoutCompletedEvent({
      amount: 3000,
      eventId: "evt_buyout_retry",
      kind: "padpilot_lifetime_buyout",
      paymentIntentId: "pi_buyout_retry",
      sessionId: "cs_buyout_retry",
      userId,
    });

    expect(processStripeWebhook(db, event, JSON.stringify(event), runtimeEnv).cancelSubscriptionId).toBe("sub_buyout");
    const duplicate = processStripeWebhook(db, event, JSON.stringify(event), runtimeEnv);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.cancelSubscriptionId).toBe("sub_buyout");
    db.close(false);
  });

  it("waits for asynchronous Checkout payment success before granting access", () => {
    const { db, runtimeEnv } = createTestContext();
    const userId = createUser(db, "async-checkout");
    createBillingCheckout(db, {
      amountCentsSnapshot: 6000,
      checkoutKind: "padpilot_lifetime_outright",
      createdAt: "2026-03-21T12:00:00.000Z",
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: "cs_async_checkout",
      userId,
    });
    const completed = checkoutCompletedEvent({
      amount: 6000,
      eventId: "evt_async_checkout_completed",
      kind: "padpilot_lifetime_outright",
      paymentIntentId: "pi_async_checkout",
      sessionId: "cs_async_checkout",
      userId,
    });
    completed.data.object.payment_status = "unpaid";
    processStripeWebhook(db, completed, JSON.stringify(completed), runtimeEnv);
    expect(getPadPilotAccessByUserId(db, userId)).toBeNull();

    const succeeded = {
      ...completed,
      id: "evt_async_checkout_succeeded",
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: { ...completed.data.object, payment_status: "paid" },
      },
    };
    processStripeWebhook(db, succeeded, JSON.stringify(succeeded), runtimeEnv);
    expect(getPadPilotAccessByUserId(db, userId)?.status).toBe("lifetime");
    db.close(false);
  });
});
