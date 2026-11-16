import { expect, test } from "bun:test";
import { z } from "zod";
import { swarmSubscriptionFailure } from "./subscription-failure";

test("subscription failures retain exact safe transport causes and fail closed", () => {
  for (const cause of ["Codex account check cancelled or timed out.", "Codex account service exited before completing the check.", "Codex account service rejected the request; authenticate with ChatGPT on the trusted host."]) {
    const reason = swarmSubscriptionFailure(Error(cause));
    expect(reason).toContain(cause);
    expect(reason).toContain("No paid fallback or new sandbox execution is allowed.");
  }
});

test("subscription diagnostics exclude native credentials and validation inputs", () => {
  const secret = "Bearer fixture-private-token sk-fixture-secret";
  const native = Object.assign(new SyntaxError(secret), { code: "EPIPE" });
  expect(swarmSubscriptionFailure(native)).toContain("SyntaxError (EPIPE)");
  expect(swarmSubscriptionFailure(native)).not.toContain(secret);
  const result = z.object({ rateLimits: z.object({ primary: z.number() }) }).safeParse({ rateLimits: { primary: secret } });
  if (result.success) throw Error("Invalid fixture unexpectedly parsed.");
  const reason = swarmSubscriptionFailure(result.error);
  expect(reason).toContain('"code":"invalid_type"');
  expect(reason).toContain('"path":["rateLimits","primary"]');
  expect(reason).not.toContain(secret);
  expect(swarmSubscriptionFailure(secret)).not.toContain(secret);
  const unsafePath = new z.ZodError([{ code: "custom", path: [secret, "privateToken123456"], message: secret }]);
  const sanitized = swarmSubscriptionFailure(unsafePath);
  expect(sanitized).toContain('"path":["unknown","unknown"]');
  expect(sanitized).not.toContain(secret);
  expect(sanitized).not.toContain("privateToken123456");
});
