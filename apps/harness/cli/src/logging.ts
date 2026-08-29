type LogFields = Record<string, string | number | boolean | undefined>;
const DEBUG_ENABLED = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

export function isDebugEnabled() {
  return DEBUG_ENABLED;
}

export function debugLog(event: string, fields: LogFields = {}) {
  if (!isDebugEnabled()) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: "harness",
      level: "debug",
      event,
      ...fields
    })
  );
}

export function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown assistant error";
}

export function serializeError(error: unknown) {
  return error instanceof Error ? { message: error.message } : { value: error };
}
