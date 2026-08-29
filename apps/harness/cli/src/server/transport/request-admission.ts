import { timingSafeEqual } from "node:crypto";

export const HARNESS_SESSION_TOKEN_QUERY = "harnessSession";
export const HARNESS_SESSION_TOKEN_HEADER = "x-harness-session-token";
export const TEST_HARNESS_SESSION_TOKEN = "test-harness-session-token-000000000000000000000000";

const MINIMUM_SESSION_TOKEN_LENGTH = 32;

export function createHarnessSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateHarnessSessionToken(token: string) {
  if (token.length < MINIMUM_SESSION_TOKEN_LENGTH || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Harness session token must be 32-256 URL-safe characters");
  }
  return token;
}

export function authorizePrivilegedRequest(input: {
  request: Request;
  sessionToken: string;
  tokenSource: "header" | "query";
}) {
  const origin = input.request.headers.get("origin");
  if (origin !== null && !isExpectedBrowserOrigin(origin, input.request.url)) {
    return { allowed: false as const, response: forbidden("Browser origin is not authorized") };
  }

  const suppliedToken = input.tokenSource === "header"
    ? input.request.headers.get(HARNESS_SESSION_TOKEN_HEADER)
    : new URL(input.request.url).searchParams.get(HARNESS_SESSION_TOKEN_QUERY);
  if (!suppliedToken || !tokensMatch(suppliedToken, input.sessionToken)) {
    return { allowed: false as const, response: forbidden("Harness session capability is missing or invalid") };
  }

  return { allowed: true as const, clientKind: origin === null ? "native" as const : "browser" as const };
}

export function isExpectedBrowserOrigin(origin: string, requestUrl: string) {
  if (origin === "null") return false;
  let parsedOrigin: URL;
  let parsedRequest: URL;
  try {
    parsedOrigin = new URL(origin);
    parsedRequest = new URL(requestUrl);
  } catch {
    return false;
  }
  return (parsedRequest.protocol === "http:" || parsedRequest.protocol === "https:")
    && parsedOrigin.origin === origin
    && parsedOrigin.origin === parsedRequest.origin;
}

function tokensMatch(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function forbidden(message: string) {
  return new Response(message, {
    status: 403,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8"
    }
  });
}
