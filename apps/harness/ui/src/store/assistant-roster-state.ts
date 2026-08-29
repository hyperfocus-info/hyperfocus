import type { Assistant, AssistantSummaryPage, CommandRejectionCode } from "@hyperfocus/ai-core/protocol";
import { rejectAssistantPageRequest, resetAssistantPageRequest, startAssistantPageRequest,
  type AssistantPageRequestState } from "./assistant-page-request-state";

export const ASSISTANT_ROSTER_PAGE_SIZE = 256;

export type AssistantRosterPageState = AssistantPageRequestState<"idle" | "loading" | "loaded" | "error"> & {
  nextCursor?: string;
  firstPageAssistantIds: string[];
};

export function createAssistantRosterPageState(): AssistantRosterPageState {
  return { status: "idle", firstPageAssistantIds: [] };
}

export function startAssistantRosterRequest(state: AssistantRosterPageState,
  request: { id: string; cursor?: string }): AssistantRosterPageState {
  return { ...state, status: "loading", ...startAssistantPageRequest(request) };
}

export function rejectAssistantRosterRequest(state: AssistantRosterPageState, requestId: string,
  error: string, code?: CommandRejectionCode): AssistantRosterPageState {
  const rejected = rejectAssistantPageRequest(state, requestId, error, code);
  return rejected ? { ...state, ...rejected } : state;
}

export function rejectAssistantRosterRequestInState<T extends { rosterPage: AssistantRosterPageState }>(state: T,
  requestId: string, error: string, code?: CommandRejectionCode): T {
  const rosterPage = rejectAssistantRosterRequest(state.rosterPage, requestId, error, code);
  return rosterPage === state.rosterPage ? state : { ...state, rosterPage };
}

export function mergeAssistantSummaryDelta(existing: Assistant[], incoming: Assistant[], deletedIds: string[] = []) {
  const byId = new Map(existing.map((assistant) => [assistant.id, assistant]));
  for (const assistantId of deletedIds) byId.delete(assistantId);
  for (const assistant of incoming) byId.set(assistant.id, assistant);
  return [...byId.values()];
}

export function mergeAssistantRosterPage(existing: Assistant[], state: AssistantRosterPageState,
  requestId: string, page: AssistantSummaryPage): { assistants: Assistant[]; page: AssistantRosterPageState } | undefined {
  if (state.request?.id !== requestId) return undefined;
  const replacingFirstPage = state.request.cursor === undefined;
  const replacedIds = replacingFirstPage ? new Set(state.firstPageAssistantIds) : new Set<string>();
  const retained = existing.filter((assistant) => !replacedIds.has(assistant.id));
  const byId = new Map(retained.map((assistant) => [assistant.id, assistant]));
  for (const assistant of page.items) byId.set(assistant.id, assistant);
  return {
    assistants: [...byId.values()],
    page: resetAssistantPageRequest("loaded", { nextCursor: page.nextCursor,
      firstPageAssistantIds: replacingFirstPage ? page.items.map((assistant) => assistant.id) : state.firstPageAssistantIds })
  };
}
