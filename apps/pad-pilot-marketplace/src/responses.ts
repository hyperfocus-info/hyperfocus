/**
 * Returns a JSON Response with application/json content-type.
 *
 * @param data - Data to serialize as JSON
 * @param init - Optional ResponseInit (status, headers)
 * @returns Response with JSON body
 */
export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Returns a JSON error response with the given status, code, and message.
 *
 * @param status - HTTP status code
 * @param code - Error code string
 * @param message - Human-readable error message
 * @returns Response with error JSON body
 */
export function fail(status: number, code: string, message: string) {
  return json({ error: { code, message } }, { status });
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function apiError(status: number, code: string, error: unknown, fallback: string) {
  return fail(status, code, errorMessage(error, fallback));
}
