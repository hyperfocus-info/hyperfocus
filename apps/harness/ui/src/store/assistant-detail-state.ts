import { ASSISTANT_DETAIL_PAGE_SIZE,
  type AssistantDetail, type AssistantLiveThreadMetadata, type AssistantsState, type ChatMessage, type ClientCommand,
  type CommandRejectionCode, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { ownsAssistantPageRequest, rejectAssistantPageRequest, resetAssistantPageRequest, startAssistantPageRequest,
  type AssistantPageRequestState } from "./assistant-page-request-state";
import { compareTimestampInstants } from "./assistant-event-order";

export type AssistantDetailCollection = "messages" | "todos" | "learnings" | "questions" | "logs";
export type AssistantDetailCollectionState = AssistantPageRequestState<"loaded" | "loading" | "error"> & {
  nextCursor?: string;
  hasRequestedMore?: boolean;
  hasMore?: boolean;
  cacheLimitReached?: boolean;
};
export type AssistantDetailPageState = Record<AssistantDetailCollection, AssistantDetailCollectionState>;

export type AssistantDetailRequestState = {
  loadedDetailAssistantIds: string[];
  pendingDetailRequestByAssistantId: Record<string, string>;
  queuedDetailRequestByAssistantId: Record<string, string>;
  detailPagesByAssistantId: Record<string, AssistantDetailPageState>;
};
type AssistantStreamingState = { streamingByAssistantId: Record<string, string> };

export { ASSISTANT_DETAIL_PAGE_SIZE };
export const ASSISTANT_DETAIL_CACHE_LIMIT = 2_048;
const ASSISTANT_DETAIL_SCOPE_LIMIT = 8;
const ASSISTANT_STREAM_TEXT_LIMIT = 131_072;

export function assistantDetailCollectionForTab(tab: string): AssistantDetailCollection | undefined {
  if (tab === "chat") return "messages";
  if (tab === "todos" || tab === "questions" || tab === "learnings") return tab;
  return tab === "log" ? "logs" : undefined;
}

export function createAssistantDetailPageCommand(collection: AssistantDetailCollection, assistantId: string,
  requestId: string, cursor?: string): ClientCommand {
  const base = { requestId, payload: { assistantId, cursor, limit: ASSISTANT_DETAIL_PAGE_SIZE } };
  if (collection === "messages") return { type: "assistant.thread.messages.list", ...base };
  if (collection === "logs") return { type: "assistant.logs.list", ...base };
  if (collection === "todos") return { type: "assistant.todos.list", ...base };
  if (collection === "learnings") return { type: "assistant.learnings.list", ...base };
  return { type: "assistant.questions.list", ...base };
}

export function createAssistantDetailRequestState(): AssistantDetailRequestState {
  return { loadedDetailAssistantIds: [], pendingDetailRequestByAssistantId: {}, queuedDetailRequestByAssistantId: {},
    detailPagesByAssistantId: {} };
}

export function getAssistantDetailRequestId(state: AssistantDetailRequestState & {
  assistants: Array<{ id: string }>;
  selectedAssistantId?: string;
}) {
  const assistantId = state.selectedAssistantId;
  if (!assistantId || !state.assistants.some((assistant) => assistant.id === assistantId) ||
    state.loadedDetailAssistantIds.includes(assistantId) || state.pendingDetailRequestByAssistantId[assistantId]) return undefined;
  return assistantId;
}

export function retainAssistantDetailRequestState(state: AssistantDetailRequestState, activeIds: Set<string>, preserve: boolean) {
  const queued = Object.fromEntries(Object.entries(state.queuedDetailRequestByAssistantId).filter(([id]) => activeIds.has(id)));
  if (!preserve) return { loadedDetailAssistantIds: [], pendingDetailRequestByAssistantId: queued,
    queuedDetailRequestByAssistantId: queued, detailPagesByAssistantId: {} };
  return { loadedDetailAssistantIds: state.loadedDetailAssistantIds.filter((id) => activeIds.has(id)),
    pendingDetailRequestByAssistantId: Object.fromEntries(Object.entries(state.pendingDetailRequestByAssistantId)
      .filter(([id]) => activeIds.has(id))), queuedDetailRequestByAssistantId: queued,
    detailPagesByAssistantId: Object.fromEntries(Object.entries(state.detailPagesByAssistantId).filter(([id]) => activeIds.has(id))) };
}

export function startAssistantDetailRequest(state: AssistantDetailRequestState, assistantId: string, requestId: string) {
  return { ...state, pendingDetailRequestByAssistantId: { ...state.pendingDetailRequestByAssistantId, [assistantId]: requestId } };
}

export function rejectAssistantDetailRequest(state: AssistantDetailRequestState, assistantId: string, requestId: string) {
  if (state.pendingDetailRequestByAssistantId[assistantId] !== requestId) return state;
  const pendingDetailRequestByAssistantId = { ...state.pendingDetailRequestByAssistantId };
  delete pendingDetailRequestByAssistantId[assistantId];
  return { ...state, pendingDetailRequestByAssistantId };
}

export function markAssistantDetailRequestQueued(state: AssistantDetailRequestState, assistantId: string, requestId: string) {
  if (state.pendingDetailRequestByAssistantId[assistantId] !== requestId) return state;
  return { ...state, queuedDetailRequestByAssistantId: { ...state.queuedDetailRequestByAssistantId, [assistantId]: requestId } };
}

export function restoreQueuedAssistantDetailRequest(state: AssistantDetailRequestState, assistantId: string, requestId: string) {
  const queuedDetailRequestByAssistantId = { ...state.queuedDetailRequestByAssistantId };
  if (queuedDetailRequestByAssistantId[assistantId] === requestId) delete queuedDetailRequestByAssistantId[assistantId];
  return { ...state, pendingDetailRequestByAssistantId: { ...state.pendingDetailRequestByAssistantId, [assistantId]: requestId },
    queuedDetailRequestByAssistantId };
}

export function rejectAssistantDetailRequestById<T extends AssistantDetailRequestState>(state: T, requestId: string): T {
  const assistantId = Object.entries(state.pendingDetailRequestByAssistantId).find(([, id]) => id === requestId)?.[0];
  if (!assistantId) return state;
  const pendingDetailRequestByAssistantId = { ...state.pendingDetailRequestByAssistantId };
  delete pendingDetailRequestByAssistantId[assistantId];
  return { ...state, pendingDetailRequestByAssistantId,
    queuedDetailRequestByAssistantId: Object.fromEntries(Object.entries(state.queuedDetailRequestByAssistantId)
      .filter(([, id]) => id !== requestId)) };
}

export function getAssistantDetailRequestAssistantId(state: AssistantDetailRequestState, requestId: string) {
  return Object.entries(state.pendingDetailRequestByAssistantId).find(([, id]) => id === requestId)?.[0];
}

export function completeAssistantDetailRequest(state: AssistantDetailRequestState, detail: AssistantDetail) {
  const assistantId = detail.assistant.id;
  const pendingDetailRequestByAssistantId = { ...state.pendingDetailRequestByAssistantId };
  const queuedDetailRequestByAssistantId = { ...state.queuedDetailRequestByAssistantId };
  delete pendingDetailRequestByAssistantId[assistantId];
  delete queuedDetailRequestByAssistantId[assistantId];
  const loadedDetailAssistantIds = [...state.loadedDetailAssistantIds.filter((id) => id !== assistantId), assistantId]
    .slice(-ASSISTANT_DETAIL_SCOPE_LIMIT);
  return { loadedDetailAssistantIds, pendingDetailRequestByAssistantId, queuedDetailRequestByAssistantId,
    detailPagesByAssistantId: { ...state.detailPagesByAssistantId, [assistantId]: createDetailPageState(detail) } };
}

export function startAssistantDetailPageRequest<T extends AssistantDetailRequestState>(state: T, assistantId: string,
  collection: AssistantDetailCollection, request: { id: string; cursor?: string }): T {
  const page = state.detailPagesByAssistantId[assistantId];
  if (!page) return state;
  return { ...state, detailPagesByAssistantId: { ...state.detailPagesByAssistantId, [assistantId]: { ...page,
    [collection]: { ...page[collection], status: "loading", ...startAssistantPageRequest(request) } } } };
}

export function completeAssistantDetailPage<T extends AssistantDetailRequestState & Partial<AssistantsState>>(state: T, assistantId: string,
  collection: AssistantDetailCollection, requestId: string, nextCursor?: string): T {
  const page = state.detailPagesByAssistantId[assistantId];
  if (page?.[collection].request?.id !== requestId) return state;
  const cachedCount = collection === "messages" ? state.threads?.find((entry) => entry.assistantId === assistantId)?.messages.length ?? 0
    : state[collection]?.filter((entry) => entry.assistantId === assistantId).length ?? 0;
  return { ...state, detailPagesByAssistantId: { ...state.detailPagesByAssistantId, [assistantId]: { ...page,
    [collection]: resetAssistantPageRequest("loaded", { nextCursor: cachedCount >= ASSISTANT_DETAIL_CACHE_LIMIT ? undefined : nextCursor,
      hasMore: cachedCount < ASSISTANT_DETAIL_CACHE_LIMIT && nextCursor !== undefined,
      cacheLimitReached: cachedCount >= ASSISTANT_DETAIL_CACHE_LIMIT && nextCursor !== undefined, hasRequestedMore: true }) } } };
}

export function getAssistantDetailPageRequest(state: AssistantDetailRequestState, assistantId: string,
  collection: AssistantDetailCollection) { return state.detailPagesByAssistantId[assistantId]?.[collection].request; }

export function rejectAssistantDetailPageRequest<T extends AssistantDetailRequestState>(state: T, requestId: string,
  error: string, code?: CommandRejectionCode): T {
  let matched = false;
  const detailPagesByAssistantId = Object.fromEntries(Object.entries(state.detailPagesByAssistantId).map(([id, page]) => {
    const reject = (collection: AssistantDetailCollectionState): AssistantDetailCollectionState => {
      const rejected = rejectAssistantPageRequest(collection, requestId, error, code);
      if (!rejected) return collection;
      matched = true;
      return { ...collection, ...rejected };
    };
    return [id, { messages: reject(page.messages), todos: reject(page.todos), learnings: reject(page.learnings),
      questions: reject(page.questions), logs: reject(page.logs) }];
  }));
  return matched ? { ...state, detailPagesByAssistantId } : state;
}

export function ownsAssistantDetailPageResponse(state: AssistantDetailRequestState, assistantId: string,
  collection: AssistantDetailCollection, requestId: string) {
  const page = state.detailPagesByAssistantId[assistantId]?.[collection];
  return page ? ownsAssistantPageRequest(page, requestId) : false;
}

export function retainAssistantDetailScopes<T extends AssistantsState & AssistantDetailRequestState & Partial<AssistantStreamingState>>(state: T): T {
  const keep = new Set(state.loadedDetailAssistantIds.slice(-ASSISTANT_DETAIL_SCOPE_LIMIT));
  const scoped = <E extends { assistantId: string }>(entries: E[]) => entries.filter((entry) => keep.has(entry.assistantId));
  const streamingByAssistantId = state.streamingByAssistantId
    ? Object.fromEntries(Object.entries(state.streamingByAssistantId).filter(([id]) => keep.has(id)))
    : undefined;
  return { ...state, threads: scoped(state.threads), todos: scoped(state.todos), learnings: scoped(state.learnings),
    questions: scoped(state.questions), logs: scoped(state.logs), assetRefs: scoped(state.assetRefs),
    detailPagesByAssistantId: Object.fromEntries(Object.entries(state.detailPagesByAssistantId).filter(([id]) => keep.has(id))),
    ...(streamingByAssistantId ? { streamingByAssistantId } : {}) };
}

export function touchAssistantDetailScope<T extends AssistantsState & AssistantDetailRequestState>(state: T, assistantId: string): T {
  if (!state.loadedDetailAssistantIds.includes(assistantId)) return state;
  return retainAssistantDetailScopes({ ...state,
    loadedDetailAssistantIds: [...state.loadedDetailAssistantIds.filter((id) => id !== assistantId), assistantId] });
}

export function isAssistantDetailDemanded(state: AssistantDetailRequestState, assistantId: string) {
  return state.loadedDetailAssistantIds.includes(assistantId) ||
    state.pendingDetailRequestByAssistantId[assistantId] !== undefined ||
    state.queuedDetailRequestByAssistantId[assistantId] !== undefined;
}

export function mergeAssistantLiveThreadMessage<T extends AssistantsState & AssistantDetailRequestState>(state: T,
  assistantId: string, incomingThread: AssistantLiveThreadMetadata, message: ChatMessage): T {
  if (!isAssistantDetailDemanded(state, assistantId)) return state;
  const scopedThread = state.threads.find((entry) => entry.assistantId === assistantId);
  if (scopedThread && (scopedThread.id !== incomingThread.id || scopedThread.sessionId !== incomingThread.sessionId)) return state;
  const threadOrder = scopedThread ? compareTimestampInstants(incomingThread.updatedAt, scopedThread.updatedAt) : 1;
  if (threadOrder < 0) return state;
  const mergedMessages = threadOrder > 0 ? mergeById([message], scopedThread?.messages ?? [])
    : mergeById(scopedThread?.messages ?? [], [message]);
  const messages = mergedMessages
    .sort(compareAssistantMessages).slice(-ASSISTANT_DETAIL_CACHE_LIMIT);
  const page = state.detailPagesByAssistantId[assistantId];
  const messagesPage = page?.messages;
  const evicted = mergedMessages.length > ASSISTANT_DETAIL_CACHE_LIMIT;
  const reachedLimit = messages.length >= ASSISTANT_DETAIL_CACHE_LIMIT;
  const nextMessagesPage = messagesPage && (evicted || reachedLimit && messagesPage.nextCursor)
    ? { ...messagesPage, nextCursor: undefined, hasMore: false, cacheLimitReached: true }
    : messagesPage;
  const threadMetadata = { id: incomingThread.id, assistantId: incomingThread.assistantId,
    sessionId: incomingThread.sessionId,
    messageCount: Math.max(incomingThread.messageCount, scopedThread?.messageCount ?? 0, messages.length),
    memorySummary: threadOrder > 0 ? incomingThread.memorySummary : scopedThread?.memorySummary,
    updatedAt: threadOrder > 0 ? incomingThread.updatedAt : scopedThread?.updatedAt ?? incomingThread.updatedAt };
  const nextThread = { ...threadMetadata, messages };
  return { ...state, threads: scopedThread ? state.threads.map((entry) => entry.id === scopedThread.id ? nextThread : entry)
    : [nextThread, ...state.threads], detailPagesByAssistantId: page && nextMessagesPage
      ? { ...state.detailPagesByAssistantId, [assistantId]: { ...page, messages: nextMessagesPage } }
      : state.detailPagesByAssistantId };
}

export function ownsAssistantLiveThreadSession(state: AssistantsState, assistantId: string, sessionId: string) {
  return state.threads.some((thread) => thread.assistantId === assistantId && thread.sessionId === sessionId);
}

type AssistantLiveChatEvent = Extract<ServerEvent, { type: "assistant.chat.delta" | "assistant.chat.message-appended" |
  "assistant.chat.complete" | "assistant.chat.failed" }>;

export function reduceAssistantLiveChatEvent<T extends AssistantsState & AssistantDetailRequestState & {
  streamingByAssistantId: Record<string, string> }>(state: T,
  event: AssistantLiveChatEvent): T {
  const { assistantId, sessionId } = event.payload;
  if (!state.assistants.some((assistant) => assistant.id === assistantId) || !isAssistantDetailDemanded(state, assistantId) ||
    !ownsAssistantLiveThreadSession(state, assistantId, sessionId) && event.type !== "assistant.chat.message-appended") return state;
  if (event.type === "assistant.chat.delta") return { ...state, streamingByAssistantId: { ...state.streamingByAssistantId,
    [assistantId]: ((state.streamingByAssistantId[assistantId] ?? "") + event.payload.delta).slice(-ASSISTANT_STREAM_TEXT_LIMIT) } };
  if (event.type === "assistant.chat.failed") return clearAssistantStreaming(state, assistantId);
  const next = mergeAssistantLiveThreadMessage(state, assistantId, event.payload.thread,
    event.type === "assistant.chat.complete" ? event.payload.assistantMessage : event.payload.message);
  return next === state ? state : clearAssistantStreaming(next, assistantId);
}

function clearAssistantStreaming<T extends AssistantsState & { streamingByAssistantId: Record<string, string> }>(state: T,
  assistantId: string): T {
  return { ...state, streamingByAssistantId: { ...state.streamingByAssistantId, [assistantId]: "" } };
}

type AssistantDetailPageEvent = Extract<ServerEvent, { type: "assistant.thread.messages.listed" | "assistant.logs.listed" |
  "assistant.todos.listed" | "assistant.learnings.listed" | "assistant.questions.listed" }>;

export function reduceAssistantDetailPageEvent<T extends AssistantsState & AssistantDetailRequestState>(state: T,
  event: AssistantDetailPageEvent): T {
  const collection = detailCollectionForListedEvent(event.type);
  if (!ownsAssistantDetailPageResponse(state, event.payload.assistantId, collection, event.requestId)) return state;
  if (event.type === "assistant.thread.messages.listed") {
    const thread = state.threads.find((entry) => entry.id === event.payload.threadId && entry.assistantId === event.payload.assistantId);
    if (!thread) return state;
    const replace = getAssistantDetailPageRequest(state, event.payload.assistantId, collection)?.cursor === undefined;
    const messages = mergeById(event.payload.messages.items, replace ? [] : thread.messages)
      .sort(compareAssistantMessages).slice(-ASSISTANT_DETAIL_CACHE_LIMIT);
    return completeAssistantDetailPage({ ...state, threads: state.threads.map((entry) => entry.id === thread.id
      ? { ...entry, messages, messageCount: Math.max(entry.messageCount, messages.length) } : entry) },
    event.payload.assistantId, collection, event.requestId, event.payload.messages.nextCursor);
  }
  const replace = getAssistantDetailPageRequest(state, event.payload.assistantId, collection)?.cursor === undefined;
  if (event.type === "assistant.logs.listed") return completeAssistantDetailPage({ ...state,
    logs: mergeOwnedPage(state.logs, event.payload.logs.items, event.payload.assistantId, replace) },
  event.payload.assistantId, collection, event.requestId, event.payload.logs.nextCursor);
  if (event.type === "assistant.todos.listed") return completeAssistantDetailPage({ ...state,
    todos: mergeOwnedPage(state.todos, event.payload.todos.items, event.payload.assistantId, replace) },
  event.payload.assistantId, collection, event.requestId, event.payload.todos.nextCursor);
  if (event.type === "assistant.learnings.listed") return completeAssistantDetailPage({ ...state,
    learnings: mergeOwnedPage(state.learnings, event.payload.learnings.items, event.payload.assistantId, replace) },
  event.payload.assistantId, collection, event.requestId, event.payload.learnings.nextCursor);
  return completeAssistantDetailPage({ ...state,
    questions: mergeOwnedPage(state.questions, event.payload.questions.items, event.payload.assistantId, replace) },
  event.payload.assistantId, collection, event.requestId, event.payload.questions.nextCursor);
}

function detailCollectionForListedEvent(type: AssistantDetailPageEvent["type"]): AssistantDetailCollection {
  if (type === "assistant.thread.messages.listed") return "messages";
  if (type === "assistant.logs.listed") return "logs";
  if (type === "assistant.todos.listed") return "todos";
  return type === "assistant.learnings.listed" ? "learnings" : "questions";
}

function mergeById<T extends { id: string }>(first: T[], second: T[]) {
  const seen = new Set<string>();
  return [...first, ...second].filter((entry) => !seen.has(entry.id) && !!seen.add(entry.id));
}

function compareAssistantMessages(left: ChatMessage, right: ChatMessage) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function mergeOwnedPage<T extends { id: string; assistantId: string }>(existing: T[], incoming: T[], assistantId: string,
  replace: boolean) {
  const scoped = replace ? [] : existing.filter((entry) => entry.assistantId === assistantId);
  return [...mergeById(scoped, incoming.filter((entry) => entry.assistantId === assistantId)).slice(0, ASSISTANT_DETAIL_CACHE_LIMIT),
    ...existing.filter((entry) => entry.assistantId !== assistantId)];
}

function createDetailPageState(detail: AssistantDetail): AssistantDetailPageState {
  const loaded = (nextCursor?: string): AssistantDetailCollectionState => resetAssistantPageRequest("loaded", { nextCursor,
    hasMore: nextCursor !== undefined });
  return { messages: resetAssistantPageRequest("loaded", { nextCursor: detail.threadMessagesNextCursor,
      hasMore: detail.threadMessagesNextCursor !== undefined }),
    todos: loaded(detail.todos.nextCursor), learnings: loaded(detail.learnings.nextCursor),
    questions: loaded(detail.questions.nextCursor), logs: loaded(detail.logs.nextCursor) };
}

export function invalidateAssistantDetails<T extends AssistantsState & AssistantDetailRequestState & Partial<AssistantStreamingState>>(state: T, assistantIds: string[]): T {
  if (assistantIds.length === 0) return state;
  const invalidated = new Set(assistantIds);
  const pendingDetailRequestByAssistantId = { ...state.pendingDetailRequestByAssistantId };
  const queuedDetailRequestByAssistantId = { ...state.queuedDetailRequestByAssistantId };
  for (const assistantId of invalidated) {
    delete pendingDetailRequestByAssistantId[assistantId];
    delete queuedDetailRequestByAssistantId[assistantId];
  }
  const streamingByAssistantId = state.streamingByAssistantId
    ? Object.fromEntries(Object.entries(state.streamingByAssistantId)
      .filter(([id]) => !invalidated.has(id))) : undefined;
  return { ...state, threads: state.threads.filter((entry) => !invalidated.has(entry.assistantId)),
    todos: state.todos.filter((entry) => !invalidated.has(entry.assistantId)),
    learnings: state.learnings.filter((entry) => !invalidated.has(entry.assistantId)),
    questions: state.questions.filter((entry) => !invalidated.has(entry.assistantId)),
    logs: state.logs.filter((entry) => !invalidated.has(entry.assistantId)),
    assetRefs: state.assetRefs.filter((entry) => !invalidated.has(entry.assistantId)),
    loadedDetailAssistantIds: state.loadedDetailAssistantIds.filter((id) => !invalidated.has(id)),
    pendingDetailRequestByAssistantId, queuedDetailRequestByAssistantId,
    detailPagesByAssistantId: Object.fromEntries(Object.entries(state.detailPagesByAssistantId).filter(([id]) => !invalidated.has(id))),
    ...(streamingByAssistantId ? { streamingByAssistantId } : {}) };
}

export function appendAssistantLiveLog<T extends AssistantsState & AssistantDetailRequestState>(state: T,
  entry: T["logs"][number]): T {
  if (!state.loadedDetailAssistantIds.includes(entry.assistantId)) return state;
  const scoped = state.logs.filter((item) => item.assistantId === entry.assistantId);
  const merged = mergeById([entry], scoped);
  const evicted = merged.length > ASSISTANT_DETAIL_CACHE_LIMIT;
  const logs = [...merged.slice(0, ASSISTANT_DETAIL_CACHE_LIMIT),
    ...state.logs.filter((item) => item.assistantId !== entry.assistantId)];
  const page = state.detailPagesByAssistantId[entry.assistantId];
  return { ...state, logs, detailPagesByAssistantId: page && evicted
    ? { ...state.detailPagesByAssistantId, [entry.assistantId]: { ...page,
      logs: { ...page.logs, nextCursor: undefined, hasMore: false, cacheLimitReached: true } } }
    : state.detailPagesByAssistantId };
}
