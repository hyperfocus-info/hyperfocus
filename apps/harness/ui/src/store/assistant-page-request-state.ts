import type { CommandRejectionCode } from "@hyperfocus/ai-core/protocol";

export type AssistantPageRequest = { id: string; cursor?: string };
export type AssistantPageRequestState<Status extends string, Request extends AssistantPageRequest = AssistantPageRequest> = {
  status: Status;
  request?: Request;
  retryCursor?: string;
  error?: string;
};
type AssistantPageRequestStateKey = keyof AssistantPageRequestState<string>;
type AssistantPageResetExtras<State extends object> = State & Partial<Record<AssistantPageRequestStateKey, never>>;

export function startAssistantPageRequest<Request extends AssistantPageRequest>(request: Request) {
  return { request, retryCursor: undefined, error: undefined };
}

export function resetAssistantPageRequest<Status extends string, State extends object>(status: Status,
  state: AssistantPageResetExtras<State>) {
  const { status: ignoredStatus, request: ignoredRequest, retryCursor: ignoredRetryCursor, error: ignoredError,
    ...extras } = state;
  void ignoredStatus;
  void ignoredRequest;
  void ignoredRetryCursor;
  void ignoredError;
  return { ...extras, status };
}

export function ownsAssistantPageRequest(state: AssistantPageRequestState<string>, requestId: string) {
  return state.request?.id === requestId;
}

export function ownsAssistantPageResponse(state: AssistantPageRequestState<string>, requestId: string,
  cursor: string | undefined) {
  return ownsAssistantPageRequest(state, requestId) && state.request?.cursor === cursor;
}

export function rejectAssistantPageRequest(state: AssistantPageRequestState<string>, requestId: string,
  error: string, code?: CommandRejectionCode) {
  if (!ownsAssistantPageRequest(state, requestId)) return undefined;
  return { status: "error" as const, request: undefined,
    retryCursor: code === "invalid-cursor" ? undefined : state.request?.cursor, error };
}
