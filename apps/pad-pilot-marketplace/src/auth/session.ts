import { marketplaceEnv as env, type MarketplaceEnv } from "../env";
import type { Database } from "bun:sqlite";
import {
  findSessionByTokenHash,
  findUserByTokenHash,
  nowIso,
  sha256,
  updateSessionExpiry,
  updateSessionLastSeen,
} from "../db";

/**
 * Parses the Cookie header into a Map of name -> value.
 *
 * @param request - Incoming request
 * @returns Map of cookie names to values
 */
export function cookies(request: Request) {
  const values = new Map<string, string>();
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      if (!name || values.has(name)) {
        continue;
      }
      try {
        values.set(name, decodeURIComponent(pair.slice(idx + 1).trim()));
      } catch {
        continue;
      }
    }
  }
  return values;
}

/**
 * Resolves the current user from the pp_session cookie.
 * Updates last_seen_at if session is valid.
 *
 * @param request - Incoming request
 * @param db - Database instance
 * @returns UserRow if authenticated, null otherwise
 */
export function userFromRequest(request: Request, db: Database) {
  const token = cookies(request).get("pp_session");
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const now = nowIso();
  const user = findUserByTokenHash(db, tokenHash, now);

  if (user) {
    updateSessionLastSeen(db, tokenHash, now);
  }

  return user;
}

export function refreshSessionIfNeeded(request: Request, db: Database, runtimeEnv: MarketplaceEnv = env) {
  const token = cookies(request).get("pp_session");
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const session = findSessionByTokenHash(db, tokenHash, nowIso());
  if (!session) {
    return null;
  }

  const thresholdMs = runtimeEnv.sessionRefreshThresholdHours * 60 * 60 * 1000;
  const expiresAtMs = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() > thresholdMs) {
    return null;
  }

  const now = nowIso();
  const nextExpiresAt = new Date(Date.now() + runtimeEnv.sessionTtlHours * 60 * 60 * 1000).toISOString();
  updateSessionExpiry(db, tokenHash, nextExpiresAt, now);
  return makeCookieHeader(token, nextExpiresAt, runtimeEnv);
}

/**
 * Builds Set-Cookie header value for session cookie.
 *
 * @param token - Raw session token
 * @param expiresAt - ISO timestamp when cookie expires
 * @param env - Marketplace environment with explicit cookie transport policy
 * @returns Set-Cookie header value string
 */
export function makeCookieHeader(token: string, expiresAt: string, runtimeEnv: MarketplaceEnv = env) {
  const parts = [
    `pp_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (runtimeEnv.cookieSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Returns Set-Cookie header value to clear the session cookie.
 *
 * @returns Set-Cookie header value string
 */
export function clearSessionCookie(runtimeEnv: MarketplaceEnv = env) {
  const secure = runtimeEnv.cookieSecure ? "; Secure" : "";
  return `pp_session=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
