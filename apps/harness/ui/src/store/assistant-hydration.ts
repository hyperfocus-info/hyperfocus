import type { AssistantsState, CommandRejectionCode, ServerEvent } from "@hyperfocus/ai-core/protocol";
import type { ViewAssistantsState } from "./assistant-view-state";
import * as assistantDetails from "./assistant-detail-state";
import * as assistantRoster from "./assistant-roster-state";
import * as assistantWorkloads from "./assistant-workload-pages";

export function hydrateAssistants(existing: ViewAssistantsState, incoming: AssistantsState,
  preserveEmptyDetails = true): ViewAssistantsState {
  const activeAssistantIds = new Set(incoming.assistants.map((assistant) => assistant.id));
  const keepActive = <T extends { assistantId: string }>(entries: T[]) =>
    entries.filter((entry) => activeAssistantIds.has(entry.assistantId));
  const retainIfSummaryOnly = <T extends { assistantId: string }>(entries: T[], existingEntries: T[]) =>
    entries.length > 0 || !preserveEmptyDetails ? keepActive(entries) : keepActive(existingEntries);
  const nextThreads = retainIfSummaryOnly(incoming.threads, existing.threads);
  const nextTodos = retainIfSummaryOnly(incoming.todos, existing.todos);
  const nextLearnings = retainIfSummaryOnly(incoming.learnings, existing.learnings);
  const nextQuestions = retainIfSummaryOnly(incoming.questions, existing.questions);
  const nextLogs = retainIfSummaryOnly(incoming.logs, existing.logs);
  const nextAssetRefs = retainIfSummaryOnly(incoming.assetRefs, existing.assetRefs);
  const nextVisibleId = existing.selectedAssistantId && incoming.assistants.some(
    (assistant) => assistant.id === existing.selectedAssistantId) ? existing.selectedAssistantId : incoming.assistants[0]?.id;
  return {
    ...existing,
    assistants: incoming.assistants,
    threads: nextThreads,
    todos: nextTodos,
    learnings: nextLearnings,
    questions: nextQuestions,
    logs: nextLogs,
    assetRefs: nextAssetRefs,
    ...assistantWorkloads.invalidateLoadedAssistantWorkloadPages(
      assistantWorkloads.pruneAssistantWorkloads(existing, activeAssistantIds)),
    selectedAssistantId: nextVisibleId,
    selectedLogDetailsId: existing.selectedLogDetailsId && nextLogs.some(
      (entry) => entry.id === existing.selectedLogDetailsId) ? existing.selectedLogDetailsId : undefined,
    streamingByAssistantId: preserveEmptyDetails ? Object.fromEntries(Object.entries(existing.streamingByAssistantId)
      .filter(([assistantId]) => activeAssistantIds.has(assistantId) &&
        existing.loadedDetailAssistantIds.includes(assistantId))) : {},
    provisionalReconnectAssistantIds: existing.provisionalReconnectAssistantIds.filter((id) => activeAssistantIds.has(id)),
    rosterPage: preserveEmptyDetails ? existing.rosterPage : {
      ...assistantRoster.createAssistantRosterPageState(), status: "loaded", nextCursor: incoming.assistantsNextCursor,
      firstPageAssistantIds: incoming.assistants.map(({ id }) => id)
    },
    ...assistantDetails.retainAssistantDetailRequestState(existing, activeAssistantIds, preserveEmptyDetails)
  };
}

export function hydrateAssistantsForReconnect(existing: ViewAssistantsState, incoming: AssistantsState) {
  const selected = existing.selectedAssistantId && existing.assistants.find(({ id }) => id === existing.selectedAssistantId);
  if (!selected || incoming.assistants.some(({ id }) => id === selected.id))
    return { ...hydrateAssistants(existing, incoming, false), provisionalReconnectAssistantIds: [] };
  return { ...hydrateAssistants(existing, { ...incoming, assistants: [...incoming.assistants, selected] }, false),
    provisionalReconnectAssistantIds: [selected.id] };
}

export function resolveReconnectAssistants<T extends ViewAssistantsState>(state: T, assistantIds: string[]): T {
  if (state.provisionalReconnectAssistantIds.length === 0) return state;
  const resolved = new Set(assistantIds);
  return { ...state, provisionalReconnectAssistantIds: state.provisionalReconnectAssistantIds.filter((id) => !resolved.has(id)) };
}

export function resolveMissingReconnectAssistant(state: ViewAssistantsState, requestId: string, error: string) {
  const assistantId = assistantDetails.getAssistantDetailRequestAssistantId(state, requestId);
  if (!assistantId || !state.provisionalReconnectAssistantIds.includes(assistantId) || !error.startsWith("Unknown assistant:")) return state;
  return hydrateAssistants({ ...state, provisionalReconnectAssistantIds: state.provisionalReconnectAssistantIds.filter(
    (id) => id !== assistantId) }, { ...state, assistants: state.assistants.filter(({ id }) => id !== assistantId) });
}

export function applyAssistantSummaryDelta(state: ViewAssistantsState,
  payload: Extract<ServerEvent, { type: "assistants.updated" }>["payload"]) {
  const deletedAssistantIds = payload.deletedAssistantIds ?? [];
  const assistants = assistantRoster.mergeAssistantSummaryDelta(state.assistants,
    payload.assistants.assistants, deletedAssistantIds);
  const resolved = resolveReconnectAssistants(hydrateAssistants(state, { ...payload.assistants, assistants }),
    payload.assistants.assistants.map(({ id }) => id));
  return assistantDetails.invalidateAssistantDetails(resolved,
    [...deletedAssistantIds, ...(payload.invalidatedDetailAssistantIds ?? [])]);
}

export function rejectAssistantRequests(state: ViewAssistantsState, requestId: string, error: string,
  code?: CommandRejectionCode) {
  const workloadsRejected = assistantWorkloads.rejectAssistantWorkloadRequest(state, requestId, error, code);
  const detailRejected = assistantDetails.rejectAssistantDetailRequestById(workloadsRejected, requestId);
  const detailPageRejected = assistantDetails.rejectAssistantDetailPageRequest(detailRejected, requestId, error, code);
  return assistantRoster.rejectAssistantRosterRequestInState(detailPageRejected, requestId, error, code);
}
