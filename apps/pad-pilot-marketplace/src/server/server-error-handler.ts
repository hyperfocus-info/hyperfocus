import { apiError, fail, isApiPath } from "../responses";

type MarketplaceErrorContext = {
  code: number | string;
  error: unknown;
  request: Request;
  set: { status?: number | string };
};

export function handleMarketplaceError({ code, error, request, set }: MarketplaceErrorContext) {
  const pathname = new URL(request.url).pathname;
  if (!isApiPath(pathname)) return;
  if (code === "NOT_FOUND") return fail(404, "route_not_found", "API route not found.");
  if (code === "PARSE") {
    return apiError(400, "invalid_request", error, "The request body could not be parsed.");
  }
  if (code === "VALIDATION") {
    const status = typeof set.status === "number" && set.status >= 400 ? set.status : 422;
    return apiError(status, "invalid_request", error, "The request payload was invalid.");
  }
  if (typeof code === "number" && code >= 400 && code < 500) {
    return apiError(code, "request_failed", error, "The API request failed.");
  }

  console.error(`[marketplace] ${request.method} ${pathname}`, error);
  return fail(500, "internal_error", "The API request failed unexpectedly.");
}
