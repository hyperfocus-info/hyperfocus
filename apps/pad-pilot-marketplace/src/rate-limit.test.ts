import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("never evicts a global bucket during identity-cardinality churn", () => {
    const limiter = createRateLimiter(2);
    const rule = { limit: 1, windowMs: 60_000 };

    expect(limiter.consumeGlobal("authentication", rule, 1_000).allowed).toBe(true);
    limiter.consume("authentication", "client-a", rule, 1_001);
    limiter.consume("authentication", "client-b", rule, 1_002);
    limiter.consume("authentication", "client-c", rule, 1_003);

    expect(limiter.consumeGlobal("authentication", rule, 1_004).allowed).toBe(false);
  });

  it("rejects capacities that cannot retain any identity bucket", () => {
    expect(() => createRateLimiter(0)).toThrow("positive integer");
  });
});
