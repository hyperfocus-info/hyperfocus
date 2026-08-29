import { Database } from "bun:sqlite";

import type { VerifiedClerkIdentity } from "./auth";
import type { AccountSnapshot, FirstClassMembershipRow, FirstClassMembershipStatus, PadPilotAccessRow, PadPilotAccessStatus, PilotTokenLedgerRow, SessionRow, TokenSourceKind, UserRow } from "./db";
const selectUserColumns =
  "users.id, users.clerk_user_id, users.email, users.username, users.display_name, users.subscription_status, users.pilot_token_balance";

function getUserById(db: Database, userId: string) {
  return db.query(`SELECT ${selectUserColumns} FROM users WHERE id = ?`).get(userId) as UserRow | null;
}

export function computeSubscriptionStatus(
  padpilotAccess: PadPilotAccessRow | null,
  firstClass: FirstClassMembershipRow | null,
) {
  const firstClassActive = firstClass?.status === "active";
  const padpilotPastDue = padpilotAccess?.status === "past_due";
  const firstClassPastDue = firstClass?.status === "past_due";

  if (padpilotPastDue || firstClassPastDue) {
    return "past_due";
  }
  if (padpilotAccess?.status === "lifetime" && firstClassActive) {
    return "lifetime_and_first_class";
  }
  if (padpilotAccess?.status === "lifetime") {
    return "lifetime";
  }
  if (padpilotAccess?.status === "financing") {
    return "active_financing";
  }
  if (firstClassActive) {
    return "first_class_active";
  }
  if (padpilotAccess?.status === "canceled" || firstClass?.status === "canceled") {
    return "canceled";
  }
  return "free";
}

export function getPadPilotAccessByUserId(db: Database, userId: string) {
  return db.query("SELECT * FROM padpilot_access WHERE user_id = ?").get(userId) as PadPilotAccessRow | null;
}

export function getFirstClassMembershipByUserId(db: Database, userId: string) {
  return db.query("SELECT * FROM first_class_memberships WHERE user_id = ?").get(userId) as FirstClassMembershipRow | null;
}

export function getPadPilotAccessByProviderSubscriptionId(db: Database, providerSubscriptionId: string) {
  return db.query("SELECT * FROM padpilot_access WHERE provider_subscription_id = ?").get(providerSubscriptionId) as PadPilotAccessRow | null;
}

export function getFirstClassMembershipByProviderSubscriptionId(db: Database, providerSubscriptionId: string) {
  return db.query("SELECT * FROM first_class_memberships WHERE provider_subscription_id = ?").get(providerSubscriptionId) as FirstClassMembershipRow | null;
}

export function getRecentPilotTokenLedger(db: Database, userId: string, limit = 10) {
  return db.query("SELECT * FROM pilot_token_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as PilotTokenLedgerRow[];
}

export function getAccountSnapshot(db: Database, user: UserRow | null) {
  if (!user) {
    const guestSnapshot: AccountSnapshot = {
      firstClass: null,
      padpilotAccess: null,
      subscriptionStatus: "guest",
      tokenBalance: 0,
      user: null,
    };
    return guestSnapshot;
  }

  const padpilotAccess = getPadPilotAccessByUserId(db, user.id);
  const firstClass = getFirstClassMembershipByUserId(db, user.id);
  const subscriptionStatus = computeSubscriptionStatus(padpilotAccess, firstClass);
  if (subscriptionStatus !== user.subscription_status) {
    db.query("UPDATE users SET subscription_status = ? WHERE id = ?").run(subscriptionStatus, user.id);
    user.subscription_status = subscriptionStatus;
  }

  const snapshot: AccountSnapshot = {
    firstClass,
    padpilotAccess,
    subscriptionStatus,
    tokenBalance: user.pilot_token_balance,
    user,
  };
  return snapshot;
}

export function findUserByTokenHash(db: Database, tokenHash: string, nowIsoVal: string) {
  return db
    .query(
      `SELECT ${selectUserColumns}
       FROM api_sessions
       JOIN users ON users.id = api_sessions.user_id
       WHERE api_sessions.token_hash = ? AND api_sessions.expires_at > ?`,
    )
    .get(tokenHash, nowIsoVal) as UserRow | null;
}

export function findSessionByTokenHash(db: Database, tokenHash: string, nowIsoVal: string) {
  return db
    .query("SELECT user_id, token_hash, expires_at FROM api_sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash, nowIsoVal) as SessionRow | null;
}

export function updateSessionLastSeen(db: Database, tokenHash: string, nowIsoVal: string) {
  const nowMs = Date.parse(nowIsoVal);
  const cutoff = Number.isFinite(nowMs)
    ? new Date(nowMs - 60_000).toISOString()
    : nowIsoVal;
  db.query(
    "UPDATE api_sessions SET last_seen_at = ? WHERE token_hash = ? AND last_seen_at < ?",
  ).run(nowIsoVal, tokenHash, cutoff);
}

export function updateSessionExpiry(db: Database, tokenHash: string, expiresAt: string, nowIsoVal: string) {
  db.query("UPDATE api_sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?").run(expiresAt, nowIsoVal, tokenHash);
}

export function deleteSessionsByUserId(db: Database, userId: string) {
  db.query("DELETE FROM api_sessions WHERE user_id = ?").run(userId);
}

export function upsertUserFromClerk(db: Database, identity: VerifiedClerkIdentity, timestamp: string) {
  const candidateId = crypto.randomUUID();
  db.query(
    `INSERT INTO users (
       id, clerk_user_id, email, username, display_name, subscription_status,
       pilot_token_balance, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'free', 0, ?, ?)
     ON CONFLICT(clerk_user_id) DO UPDATE SET
       email = excluded.email,
       username = excluded.username,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
  ).run(
    candidateId,
    identity.clerkUserId,
    identity.email,
    identity.username,
    identity.displayName,
    timestamp,
    timestamp,
  );
  return (db.query("SELECT id FROM users WHERE clerk_user_id = ?").get(identity.clerkUserId) as { id: string }).id;
}

export function createSession(
  db: Database,
  userId: string,
  tokenHash: string,
  expiresAt: string,
  timestamp: string,
) {
  db.query("INSERT INTO api_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    timestamp,
    timestamp,
  );
}

export function deleteSessionByTokenHash(db: Database, tokenHash: string) {
  db.query("DELETE FROM api_sessions WHERE token_hash = ?").run(tokenHash);
}

export function upsertPadPilotAccess(
  db: Database,
  userId: string,
  input: {
    amountPaidCents: number;
    billingAnchorAt: string | null;
    lastSuccessfulPaymentAt: string | null;
    lifetimePriceCents: number;
    nextBillingAt: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    status: PadPilotAccessStatus;
  },
  timestamp: string,
) {
  const existing = getPadPilotAccessByUserId(db, userId);
  const remainingBalanceCents = Math.max(0, input.lifetimePriceCents - input.amountPaidCents);
  if (existing) {
    db.query(
      `UPDATE padpilot_access
       SET status = ?, lifetime_price_cents = ?, amount_paid_cents = ?, remaining_balance_cents = ?, billing_anchor_at = ?, last_successful_payment_at = ?, next_billing_at = ?, provider_customer_id = ?, provider_subscription_id = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(
      input.status,
      input.lifetimePriceCents,
      input.amountPaidCents,
      remainingBalanceCents,
      input.billingAnchorAt,
      input.lastSuccessfulPaymentAt,
      input.nextBillingAt,
      input.providerCustomerId,
      input.providerSubscriptionId,
      timestamp,
      userId,
    );
  } else {
    db.query(
      `INSERT INTO padpilot_access (id, user_id, status, lifetime_price_cents, amount_paid_cents, remaining_balance_cents, billing_anchor_at, last_successful_payment_at, next_billing_at, provider_customer_id, provider_subscription_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      userId,
      input.status,
      input.lifetimePriceCents,
      input.amountPaidCents,
      remainingBalanceCents,
      input.billingAnchorAt,
      input.lastSuccessfulPaymentAt,
      input.nextBillingAt,
      input.providerCustomerId,
      input.providerSubscriptionId,
      timestamp,
      timestamp,
    );
  }

  return getPadPilotAccessByUserId(db, userId)!;
}

export function upsertFirstClassMembership(
  db: Database,
  userId: string,
  input: {
    billingAnchorAt: string | null;
    discountPercent: number;
    lastSuccessfulPaymentAt: string | null;
    nextBillingAt: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    status: FirstClassMembershipStatus;
  },
  timestamp: string,
) {
  const existing = getFirstClassMembershipByUserId(db, userId);
  if (existing) {
    db.query(
      `UPDATE first_class_memberships
       SET status = ?, provider_customer_id = ?, provider_subscription_id = ?, billing_anchor_at = ?, last_successful_payment_at = ?, next_billing_at = ?, discount_percent = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(
      input.status,
      input.providerCustomerId,
      input.providerSubscriptionId,
      input.billingAnchorAt,
      input.lastSuccessfulPaymentAt,
      input.nextBillingAt,
      input.discountPercent,
      timestamp,
      userId,
    );
  } else {
    db.query(
      `INSERT INTO first_class_memberships (id, user_id, status, provider_customer_id, provider_subscription_id, billing_anchor_at, last_successful_payment_at, next_billing_at, discount_percent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      userId,
      input.status,
      input.providerCustomerId,
      input.providerSubscriptionId,
      input.billingAnchorAt,
      input.lastSuccessfulPaymentAt,
      input.nextBillingAt,
      input.discountPercent,
      timestamp,
      timestamp,
    );
  }

  return getFirstClassMembershipByUserId(db, userId)!;
}

export function syncUserSubscriptionStatus(db: Database, userId: string) {
  const user = getUserById(db, userId);
  const next = computeSubscriptionStatus(getPadPilotAccessByUserId(db, userId), getFirstClassMembershipByUserId(db, userId));
  db.query("UPDATE users SET subscription_status = ? WHERE id = ?").run(next, userId);
  if (user) {
    user.subscription_status = next;
  }
  return next;
}

export function applyPilotTokenDelta(
  db: Database,
  userId: string,
  input: {
    createdAt: string;
    deltaTokens: number;
    notesJson?: string;
    sourceKind: TokenSourceKind;
    sourceRef: string;
  },
) {
  try {
    return db.transaction(() => {
      const existing = db.query("SELECT * FROM pilot_token_ledger WHERE source_ref = ?")
        .get(input.sourceRef) as PilotTokenLedgerRow | null;
      if (existing) {
        return existing;
      }
      if (!getUserById(db, userId)) {
        return null;
      }

      db.query("UPDATE users SET pilot_token_balance = pilot_token_balance + ? WHERE id = ?")
        .run(input.deltaTokens, userId);
      const nextBalance = (getUserById(db, userId)?.pilot_token_balance) ?? 0;
      const ledgerId = crypto.randomUUID();
      db.query(
        "INSERT INTO pilot_token_ledger (id, user_id, source_kind, source_ref, delta_tokens, balance_after, created_at, notes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        ledgerId,
        userId,
        input.sourceKind,
        input.sourceRef,
        input.deltaTokens,
        nextBalance,
        input.createdAt,
        input.notesJson ?? "{}",
      );
      return db.query("SELECT * FROM pilot_token_ledger WHERE id = ?").get(ledgerId) as PilotTokenLedgerRow;
    })();
  } catch (error) {
    const existing = db.query("SELECT * FROM pilot_token_ledger WHERE source_ref = ?")
      .get(input.sourceRef) as PilotTokenLedgerRow | null;
    if (existing) {
      return existing;
    }
    throw error;
  }
}

