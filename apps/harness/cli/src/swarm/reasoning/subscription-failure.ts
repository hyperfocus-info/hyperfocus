import { ZodError } from "zod";

// These messages originate in our account reader, never from remote payloads.
const safeCauses = new Set([
  "Codex account check cancelled or timed out.",
  "Codex account response exceeds limit.",
  "Unexpected Codex server request during account check.",
  "Codex account service rejected the request; authenticate with ChatGPT on the trusted host.",
  "Codex account service exited before completing the check.",
  "Coordinator authentication is unavailable while draining.",
  "Coordinator inference is unavailable while draining.",
  "Codex subscription inference preflight failed.",
]);
const safeCodes = new Set(["ENOENT", "EACCES", "EPERM", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"]);
const safeFields = new Set(["account", "type", "planType", "rateLimits", "primary", "secondary", "usedPercent", "windowDurationMins", "resetsAt", "rateLimitReachedType", "credits", "hasCredits", "unlimited", "balance", "authenticated", "plan", "available", "reason", "limits", "checkedAt", "separatelyBilledUsd"]);
const safeIssueCodes = new Set(["invalid_type", "too_big", "too_small", "invalid_format", "not_multiple_of", "unrecognized_keys", "invalid_union", "invalid_key", "invalid_element", "invalid_value", "custom"]);

/** Retain diagnosable causes without putting native output, tokens or account data in run receipts. */
export function swarmSubscriptionFailure(error: unknown) {
  let cause: string;
  if (error instanceof Error && safeCauses.has(error.message)) cause = error.message;
  else if (error instanceof ZodError) {
    const issues = error.issues.slice(0, 8).map(issue => ({ code: safeIssueCodes.has(issue.code) ? issue.code : "unknown",
      path: issue.path.slice(0, 8).map(part => typeof part === "string" && safeFields.has(part) ? part : "unknown") }));
    cause = `Account response validation failed: ${JSON.stringify(issues)}.`;
  } else {
    const name = error instanceof Error && ["Error", "TypeError", "SyntaxError", "AbortError"].includes(error.name) ? error.name : "UnknownError";
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && safeCodes.has(error.code) ? ` (${error.code})` : "";
    cause = `${name}${code}; unrecognized native diagnostic withheld.`;
  }
  return `Codex subscription verification failed: ${cause} No paid fallback or new sandbox execution is allowed.`;
}
