import { ASSISTANT_WORKLOAD_PAGE_SIZE,
  type BackgroundJob, type BackgroundJobRun, type CommandRejectionCode, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { ownsAssistantPageResponse, rejectAssistantPageRequest, resetAssistantPageRequest, startAssistantPageRequest,
  type AssistantPageRequestState } from "./assistant-page-request-state";
import { BACKGROUND_JOB_CACHE_LIMIT, BACKGROUND_RUN_CACHE_LIMIT } from "./workload-cache-limits";

export type AssistantWorkloadCollectionState = AssistantPageRequestState<
  "idle" | "loading" | "loaded" | "stale" | "error",
  { id: string; cursor?: string; kind?: "initial" | "load-more" | "refresh" | "retry" }
> & {
  nextCursor?: string;
  hasRequestedMore?: boolean;
};
export type AssistantWorkloadPageState = { jobs: AssistantWorkloadCollectionState; runs: AssistantWorkloadCollectionState };
export type AssistantWorkloadState = {
  jobs: BackgroundJob[];
  runs: BackgroundJobRun[];
  workloadPagesByAssistantId: Record<string, AssistantWorkloadPageState>;
};

type WorkloadPagePayload = Extract<ServerEvent, { type: "assistant.workloads.listed" }>["payload"];
export { ASSISTANT_WORKLOAD_PAGE_SIZE };
export const ASSISTANT_WORKLOAD_SCOPE_LIMIT = 8;
export const ASSISTANT_JOB_CACHE_LIMIT = BACKGROUND_JOB_CACHE_LIMIT;
export const ASSISTANT_RUN_CACHE_LIMIT = BACKGROUND_RUN_CACHE_LIMIT;

export function createEmptyAssistantWorkloadState(): AssistantWorkloadState {
  return { jobs: [], runs: [], workloadPagesByAssistantId: {} };
}

export function isAssistantJobBootstrapAvailable(page: AssistantWorkloadPageState | undefined, scopedJobCount: number, hasSearch: boolean) {
  return page?.jobs.status === "loaded" && scopedJobCount === 0 && !page.jobs.nextCursor && !hasSearch;
}

export function markAssistantWorkloadLoading<T extends AssistantWorkloadState>(existing: T, assistantId: string,
  collection: "jobs" | "runs", request: { id: string; cursor?: string }): T {
  const bounded = retainAssistantWorkloadScopes(existing, assistantId);
  const current = bounded.workloadPagesByAssistantId[assistantId] ?? createEmptyPageState();
  return { ...bounded, workloadPagesByAssistantId: { ...bounded.workloadPagesByAssistantId, [assistantId]: { ...current,
    [collection]: { ...current[collection], status: current[collection].status === "stale" ? "stale" : "loading",
      ...startAssistantPageRequest({ ...request, kind: current[collection].status === "error" ? "retry" : request.cursor
        ? "load-more" : current[collection].status === "stale" ? "refresh" : "initial" }) } } } };
}

export function touchAssistantWorkloadScope<T extends AssistantWorkloadState>(existing: T, assistantId: string): T {
  return existing.workloadPagesByAssistantId[assistantId] ? retainAssistantWorkloadScopes(existing, assistantId) : existing;
}

export function mergeAssistantWorkloadPage<T extends AssistantWorkloadState>(existing: T, requestId: string,
  payload: WorkloadPagePayload): T {
  const currentPage = existing.workloadPagesByAssistantId[payload.assistantId] ?? createEmptyPageState();
  const acceptJobs = payload.jobs !== undefined && ownsResponse(currentPage.jobs, requestId, payload.jobsCursor);
  const acceptRuns = payload.runs !== undefined && ownsResponse(currentPage.runs, requestId, payload.runsCursor);
  if (!acceptJobs && !acceptRuns) return existing;
  const jobs = acceptJobs ? mergePage(existing.jobs, payload.jobs!.items, payload.assistantId, !!payload.jobsCursor,
    ASSISTANT_JOB_CACHE_LIMIT) : existing.jobs;
  const runs = acceptRuns ? mergePage(existing.runs, payload.runs!.items, payload.assistantId, !!payload.runsCursor,
    ASSISTANT_RUN_CACHE_LIMIT) : existing.runs;
  return retainAssistantWorkloadScopes({ ...existing, jobs, runs, workloadPagesByAssistantId: {
    ...existing.workloadPagesByAssistantId, [payload.assistantId]: { ...currentPage,
      ...(acceptJobs ? { jobs: completedCollection(payload.jobs!, currentPage.jobs,
        jobs.filter((entry) => entry.assistantId === payload.assistantId).length, ASSISTANT_JOB_CACHE_LIMIT) } : {}),
      ...(acceptRuns ? { runs: completedCollection(payload.runs!, currentPage.runs,
        runs.filter((entry) => entry.assistantId === payload.assistantId).length, ASSISTANT_RUN_CACHE_LIMIT) } : {}) }
  } }, payload.assistantId);
}

export function rejectAssistantWorkloadRequest<T extends AssistantWorkloadState>(existing: T, requestId: string,
  error: string, code?: CommandRejectionCode): T {
  let matched = false;
  const pages = Object.fromEntries(Object.entries(existing.workloadPagesByAssistantId).map(([assistantId, page]) => {
    const reject = (collection: AssistantWorkloadCollectionState) => {
      const rejected = rejectAssistantPageRequest(collection, requestId, error, code);
      if (!rejected) return collection;
      matched = true;
      return { ...collection, ...rejected };
    };
    return [assistantId, { jobs: reject(page.jobs), runs: reject(page.runs) }];
  }));
  return matched ? { ...existing, workloadPagesByAssistantId: pages } : existing;
}

export function failPendingAssistantWorkloads<T extends AssistantWorkloadState>(existing: T, error: string): T {
  let next = existing;
  for (const page of Object.values(existing.workloadPagesByAssistantId)) for (const collection of [page.jobs, page.runs]) {
    if (collection.request) next = rejectAssistantWorkloadRequest(next, collection.request.id, error);
  }
  return next;
}

export function invalidateLoadedAssistantWorkloadPages<T extends AssistantWorkloadState>(existing: T): T {
  return { ...existing, workloadPagesByAssistantId: Object.fromEntries(Object.entries(existing.workloadPagesByAssistantId)
    .map(([id, page]) => [id, { jobs: clearAssistantWorkloadRequestState(page.jobs, "preserve-idle"),
      runs: clearAssistantWorkloadRequestState(page.runs, "preserve-idle") }])) };
}

export function clearAssistantWorkloadRequestState(collection: AssistantWorkloadCollectionState,
  idlePolicy: "preserve-idle" | "force-stale"): AssistantWorkloadCollectionState {
  return { status: idlePolicy === "preserve-idle" && collection.status === "idle" ? "idle" : "stale",
    ...(collection.hasRequestedMore ? { hasRequestedMore: true } : {}) };
}

export function applyLiveAssistantRun<T extends AssistantWorkloadState>(existing: T, run: BackgroundJobRun): T {
  if (!run.assistantId) return existing;
  const page = existing.workloadPagesByAssistantId[run.assistantId];
  if (!page || page.runs.status === "idle" || page.runs.status === "error") return existing;
  const scoped = existing.runs.filter((entry) => entry.assistantId === run.assistantId);
  const isNewRun = !scoped.some((entry) => entry.id === run.id);
  const requiresRebase = isNewRun && (page.runs.nextCursor !== undefined ||
    (page.runs.status === "loaded" && scoped.length >= ASSISTANT_WORKLOAD_PAGE_SIZE));
  const capacity = Math.min(ASSISTANT_RUN_CACHE_LIMIT,
    requiresRebase ? scoped.length + 1 : Math.max(scoped.length, ASSISTANT_WORKLOAD_PAGE_SIZE));
  const runs = [run, ...scoped.filter((entry) => entry.id !== run.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, capacity);
  return { ...existing, runs: [...runs, ...existing.runs.filter((entry) => entry.assistantId !== run.assistantId)],
    workloadPagesByAssistantId: requiresRebase ? { ...existing.workloadPagesByAssistantId,
      [run.assistantId]: { ...page, runs: clearAssistantWorkloadRequestState(page.runs, "force-stale") } }
      : existing.workloadPagesByAssistantId };
}

export function pruneAssistantWorkloads(existing: AssistantWorkloadState, activeIds: Set<string>): AssistantWorkloadState {
  const keep = <T extends { assistantId?: string }>(entries: T[]) => entries.filter((entry) =>
    entry.assistantId !== undefined && activeIds.has(entry.assistantId));
  return { jobs: keep(existing.jobs), runs: keep(existing.runs), workloadPagesByAssistantId: Object.fromEntries(
    Object.entries(existing.workloadPagesByAssistantId).filter(([id]) => activeIds.has(id))) };
}

function retainAssistantWorkloadScopes<T extends AssistantWorkloadState>(existing: T, retainedAssistantId: string): T {
  const existingIds = Object.keys(existing.workloadPagesByAssistantId);
  const orderedIds = [...existingIds.filter((id) => id !== retainedAssistantId), retainedAssistantId];
  const keepIds = new Set(orderedIds.slice(-ASSISTANT_WORKLOAD_SCOPE_LIMIT));
  if (existingIds.every((id) => keepIds.has(id)) && existingIds.at(-1) === retainedAssistantId) return existing;
  return { ...existing, jobs: existing.jobs.filter((entry) => entry.assistantId && keepIds.has(entry.assistantId)),
    runs: existing.runs.filter((entry) => entry.assistantId && keepIds.has(entry.assistantId)),
    workloadPagesByAssistantId: Object.fromEntries(orderedIds.filter((id) => keepIds.has(id) && existing.workloadPagesByAssistantId[id])
      .map((id) => [id, existing.workloadPagesByAssistantId[id]])) };
}

function createEmptyPageState(): AssistantWorkloadPageState {
  return { jobs: { status: "idle" }, runs: { status: "idle" } };
}
function ownsResponse(collection: AssistantWorkloadCollectionState, requestId: string, cursor: string | undefined) {
  return ownsAssistantPageResponse(collection, requestId, cursor);
}
function completedCollection(page: { nextCursor?: string }, current: AssistantWorkloadCollectionState,
  scopedCount: number, limit: number): AssistantWorkloadCollectionState {
  const hasRequestedMore = current.hasRequestedMore || Boolean(current.request?.cursor);
  return resetAssistantPageRequest("loaded", { nextCursor: scopedCount >= limit ? undefined : page.nextCursor,
    ...(hasRequestedMore ? { hasRequestedMore: true } : {}) });
}
function mergePage<T extends { id: string; assistantId?: string }>(existing: T[], incoming: T[], assistantId: string,
  append: boolean, limit: number) {
  const otherScopes = existing.filter((entry) => entry.assistantId !== assistantId);
  const incomingById = new Map(incoming.map((entry) => [entry.id, entry]));
  const current = existing.filter((entry) => entry.assistantId === assistantId);
  const currentIds = new Set(current.map((entry) => entry.id));
  const candidates = append ? [...current.map((entry) => incomingById.get(entry.id) ?? entry),
    ...incoming.filter((entry) => !currentIds.has(entry.id))] : incoming;
  const seen = new Set<string>();
  const scoped = candidates.filter((entry) => !seen.has(entry.id) && !!seen.add(entry.id)).slice(0, limit);
  return [...scoped, ...otherScopes];
}
