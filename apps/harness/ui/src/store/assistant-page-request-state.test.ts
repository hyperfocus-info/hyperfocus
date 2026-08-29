import { expect, test } from "bun:test";
import { ownsAssistantPageRequest, ownsAssistantPageResponse, rejectAssistantPageRequest,
  resetAssistantPageRequest, startAssistantPageRequest } from "./assistant-page-request-state";

test("assistant page request helpers preserve ownership and retry semantics", () => {
  const request = { id: "request-1", cursor: "page-2", kind: "load-more" as const };
  const loading = { status: "loading" as const, ...startAssistantPageRequest(request) };
  expect(loading.request).toEqual(request);
  expect(ownsAssistantPageRequest(loading, request.id)).toBe(true);
  expect(ownsAssistantPageResponse(loading, request.id, request.cursor)).toBe(true);
  expect(ownsAssistantPageResponse(loading, request.id, undefined)).toBe(false);
  expect(rejectAssistantPageRequest(loading, "stale", "ignored")).toBeUndefined();
  expect(rejectAssistantPageRequest(loading, request.id, "failed")).toEqual({
    status: "error", request: undefined, retryCursor: request.cursor, error: "failed"
  });
  expect(rejectAssistantPageRequest(loading, request.id, "expired", "invalid-cursor")).toEqual({
    status: "error", request: undefined, retryCursor: undefined, error: "expired"
  });
  expect(resetAssistantPageRequest("loaded", { nextCursor: "page-3" })).toEqual({ status: "loaded", nextCursor: "page-3" });
  const dirtyRuntimeState = { status: "error", request, retryCursor: request.cursor, error: "stale", nextCursor: "page-3" };
  expect(Reflect.apply(resetAssistantPageRequest, undefined, ["loaded", dirtyRuntimeState])).toEqual({
    status: "loaded", nextCursor: "page-3"
  });
});
