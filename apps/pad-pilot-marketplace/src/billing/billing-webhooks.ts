import type { Database } from "bun:sqlite";
import {
  applyPilotTokenDelta,
  findBillingCheckoutById,
  findBillingCheckoutBySessionId,
  findBillingPaymentByProviderReferences,
  getAppliedBillingRefundTotal,
  getOrderById,
  getFirstClassMembershipByProviderSubscriptionId,
  getFirstClassMembershipByUserId,
  getPadPilotAccessByProviderSubscriptionId,
  getPadPilotAccessByUserId,
  grantModuleEntitlement,
  recordWebhookEvent,
  recordBillingPayment,
  recordBillingRefund,
  revokeModuleEntitlement,
  syncUserSubscriptionStatus,
  updateBillingCheckoutStatusBySessionId,
  updateBillingCheckoutSession,
  updateBillingPaymentRefund,
  updateModuleOrder,
  upsertFirstClassMembership,
  upsertPadPilotAccess,
  type BillingPaymentRow,
} from "../db";
import { marketplaceEnv, type MarketplaceEnv } from "../env";
import {
  asObject,
  claimSubscriptionState,
  laterTimestamp,
  readCreatedAt,
  readEventCreated,
  readIdReference,
  readMetadata,
  readMoney,
  readOptionalString,
  readPaymentReferences,
  readPeriodEnd,
  readRefundStatus,
  readRequiredString,
  readSubscriptionMetadata,
  readSubscriptionStatus,
  requireCheckoutPayment,
  requireInvoicePayment,
  requireMatchingMetadata,
  stripeEventPriority,
  tokensForAmount,
} from "./billing-webhook-values";

const maxStripePayloadCharacters = 1_048_576;

function ensureTokenGrant(db: Database, userId: string, input: Parameters<typeof applyPilotTokenDelta>[2]) {
  const ledgerEntry = applyPilotTokenDelta(db, userId, input);
  if (!ledgerEntry) {
    throw new Error("Stripe payment references an unknown user.");
  }
}

function duplicateResult(db: Database, eventType: string, object: Record<string, unknown> | null) {
  if (
    (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") &&
    object
  ) {
    const sessionId = readOptionalString(object.id, "checkout session id");
    const checkout = sessionId ? findBillingCheckoutBySessionId(db, sessionId) : null;
    const access = checkout ? getPadPilotAccessByUserId(db, checkout.user_id) : null;
    if (access?.status === "lifetime" && access.provider_subscription_id) {
      return {
        cancelSubscriptionId: access.provider_subscription_id,
        duplicate: true,
        ok: true,
      };
    }
  }
  if (eventType === "invoice.paid" && object) {
    const subscriptionId = readOptionalString(object.subscription, "subscription id");
    const access = subscriptionId ? getPadPilotAccessByProviderSubscriptionId(db, subscriptionId) : null;
    if (access?.status === "lifetime") {
      return { cancelSubscriptionId: subscriptionId, duplicate: true, ok: true };
    }
  }
  if (
    (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") &&
    object
  ) {
    const subscriptionId = readOptionalString(object.id, "subscription id");
    const access = subscriptionId ? getPadPilotAccessByProviderSubscriptionId(db, subscriptionId) : null;
    if (access?.status === "lifetime" && eventType !== "customer.subscription.deleted") {
      return { cancelSubscriptionId: subscriptionId, duplicate: true, ok: true };
    }
  }
  return { cancelSubscriptionId: null, duplicate: true, ok: true };
}

function processCheckoutCompletion(
  db: Database,
  object: Record<string, unknown>,
  runtimeEnv: MarketplaceEnv,
  eventType: string,
  eventContext: { eventCreated: number; eventId: string; eventPriority: number },
) {
  const sessionId = readRequiredString(object.id, "checkout session id");
  const metadata = readMetadata(object.metadata);
  const createdAt = readCreatedAt(object);
  let checkout = findBillingCheckoutBySessionId(db, sessionId);
  if (!checkout && metadata.checkout_id) {
    checkout = findBillingCheckoutById(db, metadata.checkout_id);
    if (checkout) {
      if (!metadata.user_id || !metadata.checkout_kind) {
        throw new Error("Stripe checkout recovery metadata is incomplete.");
      }
      requireMatchingMetadata(metadata, checkout);
      updateBillingCheckoutSession(db, checkout.id, sessionId, checkout.status, createdAt);
    }
  }
  if (!checkout) {
    return { cancelSubscriptionId: null };
  }

  requireMatchingMetadata(metadata, checkout);
  const subscriptionId = readOptionalString(object.subscription, "subscription id");
  if (checkout.status === "completed") {
    const access = getPadPilotAccessByUserId(db, checkout.user_id);
    return {
      cancelSubscriptionId: access?.status === "lifetime"
        ? access.provider_subscription_id
        : null,
    };
  }

  const amountTotal = requireCheckoutPayment(
    object,
    checkout,
    eventType === "checkout.session.completed",
  );
  if (amountTotal === null) {
    return { cancelSubscriptionId: null };
  }
  const customerId = readOptionalString(object.customer, "customer id");
  const periodEnd = readPeriodEnd(object);

  if (checkout.checkout_kind === "module_purchase") {
    if (subscriptionId) {
      throw new Error("Stripe module purchase unexpectedly created a subscription.");
    }
    if (!checkout.order_id) {
      throw new Error("Stripe module purchase has no recorded order.");
    }
    const order = getOrderById(db, checkout.order_id);
    if (
      !order ||
      order.user_id !== checkout.user_id ||
      order.amount_cents !== checkout.amount_cents_snapshot ||
      order.currency.toLowerCase() !== checkout.currency.toLowerCase()
    ) {
      throw new Error("Stripe module purchase does not match the recorded order.");
    }
    const paymentIntentId = readIdReference(object.payment_intent, "payment intent id") ??
      (amountTotal === 0 ? `no_payment:${sessionId}` : null);
    if (!paymentIntentId) {
      throw new Error("Stripe module purchase is missing its payment intent id.");
    }
    const payment = recordBillingPayment(db, {
      accessDeltaCents: 0,
      amountCents: amountTotal,
      createdAt,
      currency: checkout.currency,
      orderId: order.id,
      paymentKind: "module_purchase",
      providerCheckoutSessionId: sessionId,
      providerPaymentId: `checkout:${sessionId}`,
      providerPaymentIntentId: paymentIntentId,
      tokenDelta: 0,
      userId: checkout.user_id,
    });
    if (!payment.created) {
      throw new Error("Stripe module purchase payment was already bound to another event.");
    }
    updateModuleOrder(db, order.id, {
      providerCheckoutSessionId: sessionId,
      providerPaymentIntentId: paymentIntentId,
      status: "paid",
      updatedAt: createdAt,
    });
    grantModuleEntitlement(db, {
      grantedAt: createdAt,
      moduleId: order.module_id,
      providerPaymentId: paymentIntentId,
      userId: checkout.user_id,
    });
  } else if (checkout.checkout_kind === "first_class_start") {
    if (!subscriptionId || !customerId) {
      throw new Error("Stripe subscription checkout is missing its customer or subscription id.");
    }
    const boundAccess = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
    const boundMembership = getFirstClassMembershipByProviderSubscriptionId(db, subscriptionId);
    if (boundAccess || (boundMembership && boundMembership.user_id !== checkout.user_id)) {
      throw new Error("Stripe subscription is already bound to another product or user.");
    }
    const existing = getFirstClassMembershipByUserId(db, checkout.user_id);
    if (existing?.status === "active" && existing.provider_subscription_id && existing.provider_subscription_id !== subscriptionId) {
      throw new Error("Stripe checkout would replace an active First Class subscription.");
    }
    const canMutateStatus = claimSubscriptionState(db, { ...eventContext, subscriptionId });
    upsertFirstClassMembership(
      db,
      checkout.user_id,
      {
        billingAnchorAt: existing?.billing_anchor_at ?? createdAt,
        discountPercent: existing?.discount_percent ?? runtimeEnv.firstClassDiscountPercent,
        lastSuccessfulPaymentAt: existing?.last_successful_payment_at ?? null,
        nextBillingAt: canMutateStatus
          ? periodEnd ?? existing?.next_billing_at ?? null
          : existing?.next_billing_at ?? null,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        status: canMutateStatus ? "active" : existing?.status ?? "active",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, checkout.user_id);
  } else if (checkout.checkout_kind === "padpilot_financing_start") {
    if (!subscriptionId || !customerId) {
      throw new Error("Stripe subscription checkout is missing its customer or subscription id.");
    }
    const boundMembership = getFirstClassMembershipByProviderSubscriptionId(db, subscriptionId);
    const boundAccess = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
    if (boundMembership || (boundAccess && boundAccess.user_id !== checkout.user_id)) {
      throw new Error("Stripe subscription is already bound to another product or user.");
    }
    const existing = getPadPilotAccessByUserId(db, checkout.user_id);
    if (existing?.status === "financing" && existing.provider_subscription_id && existing.provider_subscription_id !== subscriptionId) {
      throw new Error("Stripe checkout would replace an active PadPilot financing subscription.");
    }
    if (existing?.status !== "lifetime") {
      const canMutateStatus = claimSubscriptionState(db, { ...eventContext, subscriptionId });
      upsertPadPilotAccess(
        db,
        checkout.user_id,
        {
          amountPaidCents: existing?.amount_paid_cents ?? 0,
          billingAnchorAt: existing?.billing_anchor_at ?? createdAt,
          lastSuccessfulPaymentAt: existing?.last_successful_payment_at ?? null,
          lifetimePriceCents: existing?.lifetime_price_cents ?? runtimeEnv.padpilotLifetimePriceCents,
          nextBillingAt: canMutateStatus
            ? periodEnd ?? existing?.next_billing_at ?? null
            : existing?.next_billing_at ?? null,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          status: canMutateStatus ? "financing" : existing?.status ?? "financing",
        },
        createdAt,
      );
      syncUserSubscriptionStatus(db, checkout.user_id);
    }
  } else {
    if (subscriptionId) {
      throw new Error("Stripe one-time checkout unexpectedly created a subscription.");
    }
    const existing = getPadPilotAccessByUserId(db, checkout.user_id);
    if (checkout.checkout_kind === "padpilot_lifetime_buyout" && !existing) {
      throw new Error("Stripe buyout checkout has no financing balance to settle.");
    }
    const lifetimePrice = checkout.checkout_kind === "padpilot_lifetime_buyout"
      ? existing!.lifetime_price_cents
      : checkout.amount_cents_snapshot;
    const priorAmount = existing?.amount_paid_cents ?? 0;
    const accessDeltaCents = Math.min(amountTotal, Math.max(0, lifetimePrice - priorAmount));
    const paymentIntentId = readIdReference(object.payment_intent, "payment intent id");
    if (!paymentIntentId) {
      throw new Error("Stripe lifetime purchase is missing its payment intent id.");
    }
    const tokenDelta = tokensForAmount(amountTotal);
    const payment = recordBillingPayment(db, {
      accessDeltaCents,
      amountCents: amountTotal,
      createdAt,
      currency: checkout.currency,
      paymentKind: checkout.checkout_kind,
      providerCheckoutSessionId: sessionId,
      providerPaymentId: `checkout:${sessionId}`,
      providerPaymentIntentId: paymentIntentId,
      providerSubscriptionId: existing?.provider_subscription_id ?? null,
      tokenDelta,
      userId: checkout.user_id,
    });
    if (!payment.created) {
      throw new Error("Stripe lifetime payment was already bound to another event.");
    }
    upsertPadPilotAccess(
      db,
      checkout.user_id,
      {
        amountPaidCents: lifetimePrice,
        billingAnchorAt: existing?.billing_anchor_at ?? createdAt,
        lastSuccessfulPaymentAt: createdAt,
        lifetimePriceCents: lifetimePrice,
        nextBillingAt: null,
        providerCustomerId: customerId ?? existing?.provider_customer_id ?? null,
        providerSubscriptionId: existing?.provider_subscription_id ?? null,
        status: "lifetime",
      },
      createdAt,
    );
    ensureTokenGrant(db, checkout.user_id, {
      createdAt,
      deltaTokens: tokensForAmount(amountTotal),
      sourceKind: checkout.checkout_kind === "padpilot_lifetime_buyout" ? "lifetime_buyout" : "lifetime_purchase",
      sourceRef: `stripe:checkout:${sessionId}:tokens`,
    });
    syncUserSubscriptionStatus(db, checkout.user_id);
  }

  updateBillingCheckoutStatusBySessionId(db, sessionId, "completed", createdAt);
  const access = getPadPilotAccessByUserId(db, checkout.user_id);
  return {
    cancelSubscriptionId: access?.status === "lifetime"
      ? access.provider_subscription_id
      : null,
  };
}

function processCheckoutTermination(
  db: Database,
  object: Record<string, unknown>,
  status: "expired" | "failed",
) {
  const sessionId = readRequiredString(object.id, "checkout session id");
  const checkout = findBillingCheckoutBySessionId(db, sessionId);
  if (!checkout || checkout.status === "completed") {
    return { cancelSubscriptionId: null };
  }
  const createdAt = readCreatedAt(object);
  updateBillingCheckoutStatusBySessionId(db, sessionId, status, createdAt);
  if (checkout.order_id) {
    updateModuleOrder(db, checkout.order_id, { status, updatedAt: createdAt });
  }
  return { cancelSubscriptionId: null };
}

function invoiceCheckout(db: Database, metadata: Record<string, string>) {
  if (!metadata.checkout_id) {
    return null;
  }
  const checkout = findBillingCheckoutById(db, metadata.checkout_id);
  if (!checkout) {
    throw new Error("Stripe invoice references an unknown PadPilot checkout.");
  }
  requireMatchingMetadata(metadata, checkout);
  if (checkout.checkout_kind !== "first_class_start" && checkout.checkout_kind !== "padpilot_financing_start") {
    throw new Error("Stripe invoice references a non-subscription checkout.");
  }
  return checkout;
}

function processPaidInvoice(
  db: Database,
  object: Record<string, unknown>,
  runtimeEnv: MarketplaceEnv,
  eventContext: { eventCreated: number; eventId: string; eventPriority: number },
) {
  const invoiceId = readRequiredString(object.id, "invoice id");
  const subscriptionId = readRequiredString(object.subscription, "subscription id");
  const metadata = readSubscriptionMetadata(object);
  const checkout = invoiceCheckout(db, metadata);
  let padpilot = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
  let firstClass = getFirstClassMembershipByProviderSubscriptionId(db, subscriptionId);
  let detachedPadPilotPayment = false;
  let detachedFirstClassPayment = false;
  if (padpilot && firstClass) {
    throw new Error("Stripe subscription is bound to multiple PadPilot products.");
  }
  if (checkout && padpilot && checkout.user_id !== padpilot.user_id) {
    throw new Error("Stripe invoice user does not match PadPilot financing access.");
  }
  if (checkout && firstClass && checkout.user_id !== firstClass.user_id) {
    throw new Error("Stripe invoice user does not match First Class membership.");
  }
  if (checkout?.checkout_kind === "padpilot_financing_start" && firstClass) {
    throw new Error("Stripe invoice kind does not match First Class membership.");
  }
  if (checkout?.checkout_kind === "first_class_start" && padpilot) {
    throw new Error("Stripe invoice kind does not match PadPilot financing access.");
  }
  if (!checkout && !padpilot && !firstClass) {
    return { cancelSubscriptionId: null };
  }

  const expectedAmount = checkout?.amount_cents_snapshot ?? runtimeEnv.padpilotFinancingMonthlyPriceCents;
  const expectedCurrency = checkout?.currency ?? "usd";
  const amountPaid = requireInvoicePayment(object, expectedAmount, expectedCurrency);
  const createdAt = readCreatedAt(object);
  const periodEnd = readPeriodEnd(object);
  const customerId = readOptionalString(object.customer, "customer id");
  const paymentReferences = readPaymentReferences(object);
  const canMutateStatus = claimSubscriptionState(db, {
    ...eventContext,
    subscriptionId,
  });

  if (checkout?.checkout_kind === "padpilot_financing_start" && !padpilot) {
    const existing = getPadPilotAccessByUserId(db, checkout.user_id);
    detachedPadPilotPayment = Boolean(
      existing?.provider_subscription_id && existing.provider_subscription_id !== subscriptionId,
    );
    padpilot = existing;
  }
  if (checkout?.checkout_kind === "first_class_start" && !firstClass) {
    const existing = getFirstClassMembershipByUserId(db, checkout.user_id);
    detachedFirstClassPayment = Boolean(
      existing?.provider_subscription_id && existing.provider_subscription_id !== subscriptionId,
    );
    firstClass = existing;
  }

  if (padpilot || checkout?.checkout_kind === "padpilot_financing_start") {
    const userId = padpilot?.user_id ?? checkout!.user_id;
    const lifetimePrice = padpilot?.lifetime_price_cents ?? runtimeEnv.padpilotLifetimePriceCents;
    const priorAmount = padpilot?.amount_paid_cents ?? 0;
    const accessDeltaCents = Math.min(amountPaid, Math.max(0, lifetimePrice - priorAmount));
    const payment = recordBillingPayment(db, {
      accessDeltaCents,
      amountCents: amountPaid,
      createdAt,
      currency: expectedCurrency,
      paymentKind: "padpilot_financing",
      providerChargeId: paymentReferences.chargeId,
      providerInvoiceId: invoiceId,
      providerPaymentId: `invoice:${invoiceId}`,
      providerPaymentIntentId: paymentReferences.paymentIntentId,
      providerSubscriptionId: subscriptionId,
      tokenDelta: 0,
      userId,
    });
    if (!payment.created) {
      return { cancelSubscriptionId: padpilot?.status === "lifetime" ? subscriptionId : null };
    }
    const nextAmount = Math.min(lifetimePrice, priorAmount + accessDeltaCents);
    const reachedLifetime = padpilot?.status === "lifetime" || nextAmount >= lifetimePrice;
    const canApplyStatus = canMutateStatus && !detachedPadPilotPayment;
    const nextStatus = reachedLifetime
      ? "lifetime"
      : canApplyStatus
        ? "financing"
        : padpilot?.status ?? "financing";
    upsertPadPilotAccess(
      db,
      userId,
      {
        amountPaidCents: reachedLifetime ? lifetimePrice : nextAmount,
        billingAnchorAt: padpilot?.billing_anchor_at ?? createdAt,
        lastSuccessfulPaymentAt: laterTimestamp(padpilot?.last_successful_payment_at ?? null, createdAt),
        lifetimePriceCents: lifetimePrice,
        nextBillingAt: reachedLifetime
          ? null
          : canApplyStatus
            ? periodEnd
            : padpilot?.next_billing_at ?? periodEnd,
        providerCustomerId: detachedPadPilotPayment
          ? padpilot?.provider_customer_id ?? customerId
          : customerId ?? padpilot?.provider_customer_id ?? null,
        providerSubscriptionId: detachedPadPilotPayment
          ? padpilot?.provider_subscription_id ?? subscriptionId
          : subscriptionId,
        status: nextStatus,
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, userId);
    return {
      cancelSubscriptionId: reachedLifetime
        ? detachedPadPilotPayment
          ? padpilot?.provider_subscription_id ?? subscriptionId
          : subscriptionId
        : null,
    };
  }

  const userId = firstClass?.user_id ?? checkout!.user_id;
  const tokenDelta = tokensForAmount(amountPaid);
  const payment = recordBillingPayment(db, {
    accessDeltaCents: 0,
    amountCents: amountPaid,
    createdAt,
    currency: expectedCurrency,
    paymentKind: "first_class_monthly",
    providerChargeId: paymentReferences.chargeId,
    providerInvoiceId: invoiceId,
    providerPaymentId: `invoice:${invoiceId}`,
    providerPaymentIntentId: paymentReferences.paymentIntentId,
    providerSubscriptionId: subscriptionId,
    tokenDelta,
    userId,
  });
  if (!payment.created) {
    return { cancelSubscriptionId: null };
  }
  const canApplyStatus = canMutateStatus && !detachedFirstClassPayment;
  upsertFirstClassMembership(
    db,
    userId,
    {
      billingAnchorAt: firstClass?.billing_anchor_at ?? createdAt,
      discountPercent: firstClass?.discount_percent ?? runtimeEnv.firstClassDiscountPercent,
      lastSuccessfulPaymentAt: laterTimestamp(firstClass?.last_successful_payment_at ?? null, createdAt),
      nextBillingAt: canApplyStatus ? periodEnd : firstClass?.next_billing_at ?? periodEnd,
      providerCustomerId: detachedFirstClassPayment
        ? firstClass?.provider_customer_id ?? customerId
        : customerId ?? firstClass?.provider_customer_id ?? null,
      providerSubscriptionId: detachedFirstClassPayment
        ? firstClass?.provider_subscription_id ?? subscriptionId
        : subscriptionId,
      status: canApplyStatus ? "active" : firstClass?.status ?? "active",
    },
    createdAt,
  );
  ensureTokenGrant(db, userId, {
    createdAt,
    deltaTokens: tokenDelta,
    sourceKind: "first_class_monthly",
    sourceRef: `stripe:invoice:${invoiceId}:tokens`,
  });
  syncUserSubscriptionStatus(db, userId);
  return { cancelSubscriptionId: null };
}

function processFailedInvoice(
  db: Database,
  object: Record<string, unknown>,
  eventContext: { eventCreated: number; eventId: string; eventPriority: number },
) {
  readRequiredString(object.id, "invoice id");
  const subscriptionId = readRequiredString(object.subscription, "subscription id");
  if (!claimSubscriptionState(db, { ...eventContext, subscriptionId })) {
    const access = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
    return { cancelSubscriptionId: access?.status === "lifetime" ? subscriptionId : null };
  }
  const createdAt = readCreatedAt(object);
  const padpilot = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
  const firstClass = getFirstClassMembershipByProviderSubscriptionId(db, subscriptionId);
  if (padpilot?.status === "lifetime") {
    return { cancelSubscriptionId: subscriptionId };
  }
  if (padpilot) {
    upsertPadPilotAccess(
      db,
      padpilot.user_id,
      {
        amountPaidCents: padpilot.amount_paid_cents,
        billingAnchorAt: padpilot.billing_anchor_at,
        lastSuccessfulPaymentAt: padpilot.last_successful_payment_at,
        lifetimePriceCents: padpilot.lifetime_price_cents,
        nextBillingAt: padpilot.next_billing_at,
        providerCustomerId: padpilot.provider_customer_id,
        providerSubscriptionId: padpilot.provider_subscription_id,
        status: "past_due",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, padpilot.user_id);
  }
  if (firstClass) {
    upsertFirstClassMembership(
      db,
      firstClass.user_id,
      {
        billingAnchorAt: firstClass.billing_anchor_at,
        discountPercent: firstClass.discount_percent,
        lastSuccessfulPaymentAt: firstClass.last_successful_payment_at,
        nextBillingAt: firstClass.next_billing_at,
        providerCustomerId: firstClass.provider_customer_id,
        providerSubscriptionId: firstClass.provider_subscription_id,
        status: "past_due",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, firstClass.user_id);
  }
  return { cancelSubscriptionId: null };
}

function processSubscriptionChange(
  db: Database,
  eventType: string,
  object: Record<string, unknown>,
  runtimeEnv: MarketplaceEnv,
  eventContext: { eventCreated: number; eventId: string; eventPriority: number },
) {
  const subscriptionId = readRequiredString(object.id, "subscription id");
  const stripeStatus = eventType === "customer.subscription.deleted"
    ? "canceled"
    : readSubscriptionStatus(object.status);
  const createdAt = readCreatedAt(object);
  if (!claimSubscriptionState(db, { ...eventContext, subscriptionId })) {
    const access = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
    return { cancelSubscriptionId: access?.status === "lifetime" ? subscriptionId : null };
  }
  const nextBillingAt = readPeriodEnd(object);
  const active = stripeStatus === "active" || stripeStatus === "trialing";
  const subscriptionStatus = active
    ? "active"
    : stripeStatus === "past_due" || stripeStatus === "unpaid"
      ? "past_due"
      : "canceled";
  let padpilot = getPadPilotAccessByProviderSubscriptionId(db, subscriptionId);
  let firstClass = getFirstClassMembershipByProviderSubscriptionId(db, subscriptionId);
  if (!padpilot && !firstClass) {
    const checkout = invoiceCheckout(db, readMetadata(object.metadata));
    const customerId = readOptionalString(object.customer, "customer id");
    if (checkout?.checkout_kind === "padpilot_financing_start") {
      const existing = getPadPilotAccessByUserId(db, checkout.user_id);
      if (
        existing?.provider_subscription_id &&
        existing.provider_subscription_id !== subscriptionId &&
        existing.status === "financing"
      ) {
        throw new Error("Stripe subscription would replace active PadPilot financing access.");
      }
      if (existing?.status !== "lifetime") {
        padpilot = upsertPadPilotAccess(
          db,
          checkout.user_id,
          {
            amountPaidCents: existing?.amount_paid_cents ?? 0,
            billingAnchorAt: existing?.billing_anchor_at ?? createdAt,
            lastSuccessfulPaymentAt: existing?.last_successful_payment_at ?? null,
            lifetimePriceCents: existing?.lifetime_price_cents ?? runtimeEnv.padpilotLifetimePriceCents,
            nextBillingAt: subscriptionStatus === "canceled" ? null : nextBillingAt,
            providerCustomerId: customerId ?? existing?.provider_customer_id ?? null,
            providerSubscriptionId: subscriptionId,
            status: subscriptionStatus === "active" ? "financing" : subscriptionStatus,
          },
          createdAt,
        );
      } else {
        padpilot = existing;
      }
    } else if (checkout?.checkout_kind === "first_class_start") {
      const existing = getFirstClassMembershipByUserId(db, checkout.user_id);
      if (
        existing?.provider_subscription_id &&
        existing.provider_subscription_id !== subscriptionId &&
        existing.status === "active"
      ) {
        throw new Error("Stripe subscription would replace an active First Class membership.");
      }
      firstClass = upsertFirstClassMembership(
        db,
        checkout.user_id,
        {
          billingAnchorAt: existing?.billing_anchor_at ?? createdAt,
          discountPercent: existing?.discount_percent ?? runtimeEnv.firstClassDiscountPercent,
          lastSuccessfulPaymentAt: existing?.last_successful_payment_at ?? null,
          nextBillingAt: subscriptionStatus === "canceled" ? null : nextBillingAt,
          providerCustomerId: customerId ?? existing?.provider_customer_id ?? null,
          providerSubscriptionId: subscriptionId,
          status: subscriptionStatus,
        },
        createdAt,
      );
    }
  }
  if (padpilot?.status === "lifetime") {
    upsertPadPilotAccess(
      db,
      padpilot.user_id,
      {
        amountPaidCents: padpilot.lifetime_price_cents,
        billingAnchorAt: padpilot.billing_anchor_at,
        lastSuccessfulPaymentAt: padpilot.last_successful_payment_at,
        lifetimePriceCents: padpilot.lifetime_price_cents,
        nextBillingAt: null,
        providerCustomerId: padpilot.provider_customer_id,
        providerSubscriptionId: padpilot.provider_subscription_id,
        status: "lifetime",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, padpilot.user_id);
  } else if (padpilot) {
    upsertPadPilotAccess(
      db,
      padpilot.user_id,
      {
        amountPaidCents: padpilot.amount_paid_cents,
        billingAnchorAt: padpilot.billing_anchor_at,
        lastSuccessfulPaymentAt: padpilot.last_successful_payment_at,
        lifetimePriceCents: padpilot.lifetime_price_cents,
        nextBillingAt: active || stripeStatus === "past_due" ? nextBillingAt : null,
        providerCustomerId: padpilot.provider_customer_id,
        providerSubscriptionId: padpilot.provider_subscription_id,
        status: active ? "financing" : stripeStatus === "past_due" || stripeStatus === "unpaid" ? "past_due" : "canceled",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, padpilot.user_id);
  }
  if (firstClass) {
    upsertFirstClassMembership(
      db,
      firstClass.user_id,
      {
        billingAnchorAt: firstClass.billing_anchor_at,
        discountPercent: firstClass.discount_percent,
        lastSuccessfulPaymentAt: firstClass.last_successful_payment_at,
        nextBillingAt: active || stripeStatus === "past_due" ? nextBillingAt : null,
        providerCustomerId: firstClass.provider_customer_id,
        providerSubscriptionId: firstClass.provider_subscription_id,
        status: active ? "active" : stripeStatus === "past_due" || stripeStatus === "unpaid" ? "past_due" : "canceled",
      },
      createdAt,
    );
    syncUserSubscriptionStatus(db, firstClass.user_id);
  }
  return {
    cancelSubscriptionId: padpilot?.status === "lifetime" && stripeStatus !== "canceled" ? subscriptionId : null,
  };
}

function reversePadPilotPayment(
  db: Database,
  payment: BillingPaymentRow,
  reversedAccessDelta: number,
  createdAt: string,
) {
  if (reversedAccessDelta <= 0) {
    return;
  }
  const access = getPadPilotAccessByUserId(db, payment.user_id);
  if (!access) {
    throw new Error("Stripe refund references missing PadPilot access.");
  }
  const nextAmount = Math.max(0, access.amount_paid_cents - reversedAccessDelta);
  upsertPadPilotAccess(
    db,
    payment.user_id,
    {
      amountPaidCents: nextAmount,
      billingAnchorAt: access.billing_anchor_at,
      lastSuccessfulPaymentAt: access.last_successful_payment_at,
      lifetimePriceCents: access.lifetime_price_cents,
      nextBillingAt: access.status === "lifetime" ? null : access.next_billing_at,
      providerCustomerId: access.provider_customer_id,
      providerSubscriptionId: access.provider_subscription_id,
      status: nextAmount >= access.lifetime_price_cents ? "lifetime" : "past_due",
    },
    createdAt,
  );
  syncUserSubscriptionStatus(db, payment.user_id);
}

function reverseModulePurchase(
  db: Database,
  payment: BillingPaymentRow,
  fullyRefunded: boolean,
  createdAt: string,
) {
  if (!payment.order_id) {
    throw new Error("Stripe module refund references a payment without an order.");
  }
  const order = getOrderById(db, payment.order_id);
  if (!order || order.user_id !== payment.user_id) {
    throw new Error("Stripe module refund references a missing order.");
  }
  updateModuleOrder(db, order.id, {
    status: fullyRefunded ? "refunded" : "partially_refunded",
    updatedAt: createdAt,
  });
  if (fullyRefunded) {
    revokeModuleEntitlement(db, order.module_id, order.user_id, createdAt);
  }
}

function applyCumulativeRefund(
  db: Database,
  input: {
    chargeId: string | null;
    createdAt: string;
    eventId: string;
    payment: BillingPaymentRow;
    refundedCents: number;
  },
) {
  if (input.refundedCents <= input.payment.refunded_cents) {
    return { cancelSubscriptionId: null };
  }

  const targetAccessReversal = Math.min(input.payment.access_delta_cents, input.refundedCents);
  const targetTokenReversal = input.refundedCents === input.payment.amount_cents
    ? input.payment.token_delta
    : Math.floor(input.payment.token_delta * input.refundedCents / input.payment.amount_cents);
  const reversedAccessDelta = targetAccessReversal - input.payment.reversed_access_cents;
  const reversedTokenDelta = targetTokenReversal - input.payment.reversed_tokens;

  if (reversedTokenDelta > 0) {
    ensureTokenGrant(db, input.payment.user_id, {
      createdAt: input.createdAt,
      deltaTokens: -reversedTokenDelta,
      notesJson: JSON.stringify({
        chargeId: input.chargeId,
        paymentId: input.payment.provider_payment_id,
      }),
      sourceKind: "refund_reversal",
      sourceRef: `stripe:refund:${input.eventId}:tokens`,
    });
  }

  if (input.payment.payment_kind === "module_purchase") {
    reverseModulePurchase(
      db,
      input.payment,
      input.refundedCents === input.payment.amount_cents,
      input.createdAt,
    );
  } else if (
    input.payment.payment_kind === "padpilot_financing" ||
    input.payment.payment_kind === "padpilot_lifetime_buyout" ||
    input.payment.payment_kind === "padpilot_lifetime_outright"
  ) {
    reversePadPilotPayment(db, input.payment, reversedAccessDelta, input.createdAt);
  }

  updateBillingPaymentRefund(db, input.payment.id, {
    providerChargeId: input.chargeId,
    refundedCents: input.refundedCents,
    reversedAccessCents: targetAccessReversal,
    reversedTokens: targetTokenReversal,
    updatedAt: input.createdAt,
  });
  return { cancelSubscriptionId: null };
}

function processRefundedCharge(
  db: Database,
  object: Record<string, unknown>,
  eventId: string,
) {
  const chargeId = readRequiredString(object.id, "charge id");
  const references = readPaymentReferences({ ...object, charge: chargeId });
  const payment = findBillingPaymentByProviderReferences(db, references);
  if (!payment) {
    return { cancelSubscriptionId: null };
  }

  const chargeAmount = readMoney(object.amount, "charge amount");
  const refundedCents = readMoney(object.amount_refunded, "refunded amount");
  const currency = readRequiredString(object.currency, "refund currency", 10).toLowerCase();
  if (
    chargeAmount !== payment.amount_cents ||
    currency !== payment.currency.toLowerCase() ||
    refundedCents > payment.amount_cents
  ) {
    throw new Error("Stripe refund does not match the recorded payment.");
  }
  return applyCumulativeRefund(db, {
    chargeId,
    createdAt: readCreatedAt(object),
    eventId,
    payment,
    refundedCents,
  });
}

function processRefund(
  db: Database,
  object: Record<string, unknown>,
  eventId: string,
) {
  const refundId = readRequiredString(object.id, "refund id");
  const amountCents = readMoney(object.amount, "refund amount");
  const status = readRefundStatus(object.status);
  const references = readPaymentReferences(object);
  const payment = findBillingPaymentByProviderReferences(db, references);
  if (!payment) {
    return { cancelSubscriptionId: null };
  }
  const currency = readRequiredString(object.currency, "refund currency", 10).toLowerCase();
  if (amountCents <= 0 || currency !== payment.currency.toLowerCase()) {
    throw new Error("Stripe refund does not match the recorded payment.");
  }
  const createdAt = readCreatedAt(object);
  const shouldApply = recordBillingRefund(db, {
    amountCents,
    billingPaymentId: payment.id,
    createdAt,
    providerRefundId: refundId,
    status,
  });
  if (!shouldApply) {
    return { cancelSubscriptionId: null };
  }
  const refundedCents = Math.max(
    payment.refunded_cents,
    getAppliedBillingRefundTotal(db, payment.id),
  );
  if (refundedCents > payment.amount_cents) {
    throw new Error("Stripe refunds exceed the recorded payment.");
  }
  return applyCumulativeRefund(db, {
    chargeId: references.chargeId,
    createdAt,
    eventId,
    payment,
    refundedCents,
  });
}

function processStripeWebhookTransaction(
  db: Database,
  event: Record<string, unknown>,
  payloadJson: string,
  runtimeEnv: MarketplaceEnv,
) {
  const eventId = readRequiredString(event.id, "event id", 255);
  const eventType = readRequiredString(event.type, "event type", 255);
  if (payloadJson.length > maxStripePayloadCharacters) {
    throw new Error("Stripe webhook payload exceeded the processing limit.");
  }
  const data = asObject(event.data);
  const object = asObject(data?.object);
  const recorded = recordWebhookEvent(db, {
    eventType,
    payloadJson,
    processedAt: new Date().toISOString(),
    provider: "stripe",
    providerEventId: eventId,
  });
  if (!recorded) {
    return duplicateResult(db, eventType, object);
  }

  const eventContext = {
    eventCreated: object ? readEventCreated(event, object) : 0,
    eventId,
    eventPriority: stripeEventPriority(eventType, object),
  };
  let action: { cancelSubscriptionId: string | null } = { cancelSubscriptionId: null };
  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    if (!object) throw new Error("Stripe checkout event is missing its object.");
    action = processCheckoutCompletion(db, object, runtimeEnv, eventType, eventContext);
  } else if (eventType === "checkout.session.expired") {
    if (!object) throw new Error("Stripe checkout event is missing its object.");
    action = processCheckoutTermination(db, object, "expired");
  } else if (eventType === "checkout.session.async_payment_failed") {
    if (!object) throw new Error("Stripe checkout event is missing its object.");
    action = processCheckoutTermination(db, object, "failed");
  } else if (eventType === "invoice.paid") {
    if (!object) throw new Error("Stripe invoice event is missing its object.");
    action = processPaidInvoice(db, object, runtimeEnv, eventContext);
  } else if (eventType === "invoice.payment_failed") {
    if (!object) throw new Error("Stripe invoice event is missing its object.");
    action = processFailedInvoice(db, object, eventContext);
  } else if (eventType === "customer.subscription.deleted" || eventType === "customer.subscription.updated") {
    if (!object) throw new Error("Stripe subscription event is missing its object.");
    action = processSubscriptionChange(db, eventType, object, runtimeEnv, eventContext);
  } else if (eventType === "charge.refunded") {
    if (!object) throw new Error("Stripe refund event is missing its object.");
    action = processRefundedCharge(db, object, eventId);
  } else if (eventType === "refund.created" || eventType === "refund.updated") {
    if (!object) throw new Error("Stripe refund event is missing its object.");
    action = processRefund(db, object, eventId);
  }
  return { ...action, duplicate: false, ok: true };
}

export function processStripeWebhook(
  db: Database,
  event: Record<string, unknown>,
  payloadJson: string,
  runtimeEnv: MarketplaceEnv = marketplaceEnv,
) {
  return db.transaction(() => processStripeWebhookTransaction(db, event, payloadJson, runtimeEnv))();
}
