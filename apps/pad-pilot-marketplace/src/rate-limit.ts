type RateLimitRule = {
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(maxEntries = 10_000) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new Error("Rate limiter identity capacity must be a positive integer.");
  }
  const entries = new Map<string, RateLimitEntry>();
  const globalEntries = new Map<string, RateLimitEntry>();

  function removeExpired(target: Map<string, RateLimitEntry>, now: number) {
    for (const [key, entry] of target) {
      if (entry.resetAt <= now) {
        target.delete(key);
      }
    }
  }

  function consumeEntry(target: Map<string, RateLimitEntry>, key: string, rule: RateLimitRule, now: number) {
    let entry = target.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rule.windowMs };
      target.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= rule.limit,
      remaining: Math.max(0, rule.limit - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  return {
    consume(scope: string, identity: string, rule: RateLimitRule, now = Date.now()) {
      const key = `${scope}:${identity}`;
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        if (entries.size >= maxEntries) {
          removeExpired(entries, now);
        }
        while (entries.size >= maxEntries) {
          const oldestKey = entries.keys().next().value;
          if (typeof oldestKey !== "string") {
            break;
          }
          entries.delete(oldestKey);
        }
        entry = { count: 0, resetAt: now + rule.windowMs };
        entries.set(key, entry);
      }
      return consumeEntry(entries, key, rule, now);
    },
    consumeGlobal(scope: string, rule: RateLimitRule, now = Date.now()) {
      removeExpired(globalEntries, now);
      return consumeEntry(globalEntries, scope, rule, now);
    },
  };
}
