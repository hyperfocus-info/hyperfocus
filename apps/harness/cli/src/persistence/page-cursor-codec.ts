import { BOUNDED_PAGE_CURSOR_MAX_LENGTH } from "@hyperfocus/ai-core/protocol";

export type PageCursorError = Error & { code: "invalid-cursor" };

export function createPageCursorError(message = "Invalid or stale page cursor"): PageCursorError {
  return Object.assign(new Error(message), { code: "invalid-cursor" as const });
}

export function isPageCursorError(error: unknown): error is PageCursorError {
  return error instanceof Error && "code" in error && error.code === "invalid-cursor";
}

export function encodePageCursor(input: {
  identity: Record<string, string | number>;
  position: unknown;
  format?: "base64url" | "json";
}) {
  const json = JSON.stringify({ version: 1, ...input.identity, position: input.position });
  const encoded = input.format === "json" ? json : Buffer.from(json).toString("base64url");
  if (encoded.length > BOUNDED_PAGE_CURSOR_MAX_LENGTH) {
    throw createPageCursorError(`Page cursor exceeds ${BOUNDED_PAGE_CURSOR_MAX_LENGTH} characters`);
  }
  return encoded;
}

export function decodePageCursor(input: {
  encoded: string | undefined;
  identity: Record<string, string | number>;
  format?: "base64url" | "json";
  startToken?: string;
}) {
  if (!input.encoded || input.encoded === input.startToken) return undefined;
  if (input.encoded.length > BOUNDED_PAGE_CURSOR_MAX_LENGTH) {
    throw createPageCursorError(`Page cursor exceeds ${BOUNDED_PAGE_CURSOR_MAX_LENGTH} characters`);
  }
  try {
    const json = input.format === "json" ? input.encoded : Buffer.from(input.encoded, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed) || parsed.version !== 1 ||
      Object.entries(input.identity).some(([key, value]) => parsed[key] !== value)) {
      throw createPageCursorError("Page cursor does not match the requested resource");
    }
    return parsed.position;
  } catch (error) {
    if (isPageCursorError(error)) throw error;
    throw createPageCursorError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
