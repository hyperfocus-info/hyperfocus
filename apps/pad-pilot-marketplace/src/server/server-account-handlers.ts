import type { Database } from "bun:sqlite";
import { createCheckoutSessionBody } from "@hyperfocus/pad-pilot/marketplace-schema";
import { authDto, subscriptionDto } from "../auth/account";
import { refreshSessionIfNeeded } from "../auth/session";
import { processStripeWebhook } from "../billing/billing-webhooks";
import {
  cancelStripeSubscription,
  createStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from "../billing/stripe";
import {
  createBillingCheckout,
  createModuleOrder,
  findActiveBillingCheckoutByScope,
  getModuleById,
  getOrderById,
  listModulesForUser,
  nowIso,
  updateBillingCheckoutSession,
  updateBillingCheckoutStatusById,
  updateModuleOrder,
  type UserRow,
} from "../db";
import type { MarketplaceEnv } from "../env";
import {
  canDownloadModule,
  effectiveModulePriceCents,
  moduleListDto,
} from "../modules";
import { fail, json } from "../responses";
import {
  maxStripeWebhookBytes,
  readBoundedBody,
  readBoundedJson,
  requireAuthUser,
} from "../server-utils";

type AccountServices = {
  cancelStripeSubscription: typeof cancelStripeSubscription;
  createStripeCheckoutSession: typeof createStripeCheckoutSession;
  processStripeWebhook: typeof processStripeWebhook;
  verifyStripeWebhookSignature: typeof verifyStripeWebhookSignature;
};
type AccountStore = { db: Database; env: MarketplaceEnv; services: AccountServices };
type AccountContext = { authUser: UserRow | null; store: AccountStore };
type AccountRequestContext = AccountContext & { request: Request };

type AccountHandlerDependencies = {
  clientIdentity: (request: Request) => string;
  enforceRateLimit: (scope: string, identity: string, limit: number, windowMs: number) => Response | null;
};

export function createAccountRouteHandlers(dependencies: AccountHandlerDependencies) {
  const subscription = ({ request, store, authUser }: AccountRequestContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const refreshedCookie = refreshSessionIfNeeded(request, store.db, store.env);
    return json(
      subscriptionDto(store.db, auth.user, store.env),
      refreshedCookie ? { headers: { "set-cookie": refreshedCookie } } : undefined,
    );
  };

  const modules = ({ store, authUser }: AccountContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const accessible = listModulesForUser(store.db, auth.user).filter((moduleRow) =>
      moduleRow.owner_user_id === auth.user!.id || canDownloadModule(store.db, auth.user, moduleRow));
    return json({
      modules: accessible.map((moduleRow) =>
        moduleListDto(store.db, moduleRow, auth.user, store.env.firstClassDiscountPercent)),
    });
  };

  const checkout = async ({ request, store, authUser }: AccountRequestContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const limited = dependencies.enforceRateLimit("checkout", auth.user!.id, 12, 600000);
    if (limited) return limited;
    if (!store.env.isStripeConfigured) return fail(503, "stripe_not_configured", "Stripe is not configured for this environment.");
    if (!store.env.publicOrigin && !store.env.isDevelopment) {
      return fail(503, "public_origin_not_configured", "Marketplace public origin is not configured.");
    }

    const requestBody = await readBoundedJson(request, 4096);
    if (requestBody.response) return requestBody.response;
    const parsed = createCheckoutSessionBody.safeParse(requestBody.data);
    if (!parsed.success) return fail(400, "invalid_checkout_kind", "A supported checkout kind is required.");

    const account = authDto(store.db, auth.user, store.env);
    const { checkoutKind, moduleId } = parsed.data;
    const pricing = account.pricing;
    let amountCents = 0;
    let mode: "payment" | "subscription" = "payment";
    let moduleRow: ReturnType<typeof getModuleById> = null;
    let scopeKey = "padpilot-access";
    if (checkoutKind === "first_class_start") {
      amountCents = pricing.padpilotFinancingMonthlyPriceCents;
      mode = "subscription";
      scopeKey = "first-class";
      if (account.entitlements.firstClass?.status === "active" || account.entitlements.firstClass?.status === "past_due") {
        return fail(409, "first_class_active", "First Class already has an active billing relationship.");
      }
    } else if (checkoutKind === "module_purchase") {
      moduleRow = getModuleById(store.db, moduleId!);
      if (!moduleRow || moduleRow.visibility !== "published") return fail(404, "module_not_found", "Module not found.");
      if (moduleRow.owner_user_id === auth.user!.id) return fail(409, "module_owned", "Module owners already have download access.");
      if (moduleRow.price_cents <= 0) return fail(409, "module_free", "This module does not require a purchase.");
      if (canDownloadModule(store.db, auth.user, moduleRow)) {
        return fail(409, "module_entitled", "This account already owns the module.");
      }
      amountCents = effectiveModulePriceCents(moduleRow, auth.user, store.env.firstClassDiscountPercent);
      scopeKey = `module:${moduleRow.id}`;
    } else if (checkoutKind === "padpilot_financing_start") {
      amountCents = pricing.padpilotFinancingMonthlyPriceCents;
      mode = "subscription";
      if (account.entitlements.padpilotAccess?.status === "lifetime") return fail(409, "already_lifetime", "PadPilot lifetime is already active.");
      if (account.entitlements.padpilotAccess?.status === "financing" || account.entitlements.padpilotAccess?.status === "past_due") {
        return fail(409, "already_financing", "PadPilot financing already has an active billing relationship.");
      }
    } else if (checkoutKind === "padpilot_lifetime_outright") {
      if (account.entitlements.padpilotAccess?.status === "lifetime") return fail(409, "already_lifetime", "PadPilot lifetime is already active.");
      if (account.entitlements.padpilotAccess && account.entitlements.padpilotAccess.amountPaidCents > 0) {
        return fail(409, "buyout_required", "Use the remaining-balance buyout for an existing financing account.");
      }
      amountCents = pricing.padpilotLifetimePriceCents;
    } else {
      const remaining = account.entitlements.padpilotAccess?.remainingBalanceCents ?? 0;
      if (!account.entitlements.padpilotAccess?.canBuyout || remaining <= 0) {
        return fail(409, "buyout_unavailable", "A lifetime buyout is not available for this account.");
      }
      amountCents = remaining;
    }

    const timestamp = nowIso();
    let checkoutRow: ReturnType<typeof createBillingCheckout>;
    try {
      checkoutRow = store.db.transaction(() => {
        let active = findActiveBillingCheckoutByScope(store.db, auth.user!.id, scopeKey);
        const activeCreatedAt = active ? Date.parse(active.created_at) : Number.NaN;
        if (active && (!Number.isFinite(activeCreatedAt) || Date.now() - activeCreatedAt > 86400000)) {
          updateBillingCheckoutStatusById(store.db, active.id, "expired", timestamp);
          if (active.order_id) updateModuleOrder(store.db, active.order_id, { status: "expired", updatedAt: timestamp });
          active = null;
        }
        if (active) {
          if (
            active.checkout_kind !== checkoutKind || active.amount_cents_snapshot !== amountCents ||
            (checkoutKind === "module_purchase" && getOrderById(store.db, active.order_id ?? "")?.module_id !== moduleRow!.id)
          ) throw new Error("A different Checkout is already in progress for this purchase.");
          return active;
        }
        const order = moduleRow ? createModuleOrder(store.db, {
          amountCents,
          createdAt: timestamp,
          currency: "usd",
          moduleId: moduleRow.id,
          status: "created",
          userId: auth.user!.id,
        }) : null;
        return createBillingCheckout(store.db, {
          amountCentsSnapshot: amountCents,
          checkoutKind,
          createdAt: timestamp,
          currency: "usd",
          orderId: order?.id,
          scopeKey,
          status: "created",
          userId: auth.user!.id,
        });
      }).immediate();
    } catch (error) {
      return fail(409, "checkout_in_progress", error instanceof Error ? error.message : "A Checkout is already in progress.");
    }

    if (checkoutRow.status === "pending" && checkoutRow.stripe_checkout_url) {
      return json({ amountCents, checkoutId: checkoutRow.id, checkoutUrl: checkoutRow.stripe_checkout_url, pricing });
    }
    const origin = store.env.publicOrigin ?? new URL(request.url).origin;
    let stripeSession: Awaited<ReturnType<typeof createStripeCheckoutSession>>;
    try {
      stripeSession = await store.services.createStripeCheckoutSession({
        amountCents,
        cancelUrl: `${origin}/?checkout=cancelled`,
        checkoutId: checkoutRow.id,
        checkoutKind,
        env: store.env,
        mode,
        moduleId: moduleRow?.id,
        orderId: checkoutRow.order_id ?? undefined,
        productName: moduleRow?.name,
        successUrl: `${origin}/?checkout=success`,
        userId: auth.user!.id,
      });
    } catch (error) {
      return fail(502, "stripe_checkout_failed", error instanceof Error ? error.message : "Stripe Checkout failed.");
    }
    store.db.transaction(() => {
      updateBillingCheckoutSession(store.db, checkoutRow.id, stripeSession.id, "pending", timestamp, stripeSession.url);
      if (checkoutRow.order_id) {
        updateModuleOrder(store.db, checkoutRow.order_id, {
          providerCheckoutSessionId: stripeSession.id,
          status: "pending",
          updatedAt: timestamp,
        });
      }
    })();
    return json({ amountCents, checkoutId: checkoutRow.id, checkoutUrl: stripeSession.url, pricing });
  };

  const stripeWebhook = async ({ request, store }: { request: Request; store: AccountStore }) => {
    const limited = dependencies.enforceRateLimit("stripe-webhook", dependencies.clientIdentity(request), 600, 60000);
    if (limited) return limited;
    const body = await readBoundedBody(request, maxStripeWebhookBytes);
    if (!body) return fail(413, "stripe_webhook_too_large", "Stripe webhook exceeded the request limit.");
    const payload = new TextDecoder().decode(body);
    try {
      store.services.verifyStripeWebhookSignature(payload, request.headers.get("stripe-signature"), store.env);
    } catch (error) {
      return fail(400, "invalid_stripe_signature", error instanceof Error ? error.message : "Invalid Stripe signature.");
    }
    let event: Record<string, unknown>;
    try {
      const parsedEvent = JSON.parse(payload);
      if (typeof parsedEvent !== "object" || parsedEvent === null || Array.isArray(parsedEvent)) throw new Error();
      event = Object.fromEntries(Object.entries(parsedEvent));
    } catch {
      return fail(400, "invalid_stripe_payload", "Stripe webhook payload was not valid JSON.");
    }
    try {
      const result = store.services.processStripeWebhook(store.db, event, payload, store.env);
      if (result.cancelSubscriptionId) await store.services.cancelStripeSubscription(result.cancelSubscriptionId, store.env);
      return json({ duplicate: result.duplicate, ok: result.ok });
    } catch (error) {
      return fail(500, "stripe_webhook_failed", error instanceof Error ? error.message : "Stripe webhook processing failed.");
    }
  };

  return { checkout, modules, stripeWebhook, subscription };
}
