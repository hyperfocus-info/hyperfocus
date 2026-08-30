import type { Database } from "bun:sqlite";
import {
  getAccountSnapshot,
  getRecentPilotTokenLedger,
  type AccountSnapshot,
  type UserRow,
} from "../db";
import { marketplaceEnv, type MarketplaceEnv } from "../env";

function entitlementsDto(snapshot: AccountSnapshot) {
  return {
    firstClass: snapshot.firstClass
      ? {
          discountPercent: snapshot.firstClass.discount_percent,
          nextBillingAt: snapshot.firstClass.next_billing_at,
          status: snapshot.firstClass.status,
        }
      : null,
    padpilotAccess: snapshot.padpilotAccess
      ? {
          amountPaidCents: snapshot.padpilotAccess.amount_paid_cents,
          canBuyout:
            (snapshot.padpilotAccess.status === "financing" || snapshot.padpilotAccess.status === "past_due") &&
            snapshot.padpilotAccess.remaining_balance_cents > 0,
          lifetimePriceCents: snapshot.padpilotAccess.lifetime_price_cents,
          nextBillingAt: snapshot.padpilotAccess.next_billing_at,
          remainingBalanceCents: snapshot.padpilotAccess.remaining_balance_cents,
          status: snapshot.padpilotAccess.status,
        }
      : null,
  };
}

export function accountPricingDto(runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  return {
    firstClassDiscountPercent: runtimeEnv.firstClassDiscountPercent,
    padpilotFinancingMonthlyPriceCents: runtimeEnv.padpilotFinancingMonthlyPriceCents,
    padpilotLifetimePriceCents: runtimeEnv.padpilotLifetimePriceCents,
  };
}

export function authDto(db: Database, user: UserRow | null, runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  const snapshot = getAccountSnapshot(db, user);
  return {
    authenticated: Boolean(snapshot.user),
    configured: {
      clerk: runtimeEnv.isClerkConfigured,
      stripe: runtimeEnv.isStripeConfigured,
    },
    entitlements: entitlementsDto(snapshot),
    pilotTokenBalance: snapshot.tokenBalance,
    pricing: accountPricingDto(runtimeEnv),
    publishableKey: runtimeEnv.clerkPublishableKey,
    subscriptionStatus: snapshot.subscriptionStatus,
    user: snapshot.user
      ? {
          clerkUserId: snapshot.user.clerk_user_id,
          displayName: snapshot.user.display_name,
          email: snapshot.user.email,
          id: snapshot.user.id,
          username: snapshot.user.username,
        }
      : null,
  };
}

export function subscriptionDto(db: Database, user: UserRow | null, runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  const snapshot = getAccountSnapshot(db, user);
  return {
    entitlements: entitlementsDto(snapshot),
    pilotTokenBalance: snapshot.tokenBalance,
    pricing: accountPricingDto(runtimeEnv),
    recentTokenLedger: snapshot.user ? getRecentPilotTokenLedger(db, snapshot.user.id, 10) : [],
    subscriptionStatus: snapshot.subscriptionStatus,
  };
}
