import type { BackgroundJob, BackgroundJobRun, BackgroundJobsState, ServerEvent } from "@hyperfocus/ai-core/protocol";
import type { PendingBackgroundJobSource } from "../background-job-source-state";
import { clearAssistantWorkloadRequestState, type AssistantWorkloadPageState } from "./assistant-workload-pages";
import { BACKGROUND_JOB_CACHE_LIMIT, BACKGROUND_RUN_CACHE_LIMIT } from "./workload-cache-limits";

export { BACKGROUND_JOB_CACHE_LIMIT, BACKGROUND_RUN_CACHE_LIMIT } from "./workload-cache-limits";

type DeletionPayload = Extract<ServerEvent, { type: "background-jobs.deleted" }>["payload"];
type DeletionTarget = DeletionPayload["targets"][number];
type SourcePreferences = { selectedJobId?: string; selectedRunId?: string };
type CacheState<TPreferences extends SourcePreferences> = {
  backgroundJobs: BackgroundJobsState;
  backgroundJobDeletionTombstones: BackgroundJobDeletionTombstones;
  backgroundJobDetailsRunId?: string;
  jobsPanePreferences: TPreferences;
  pendingBackgroundJobSource?: PendingBackgroundJobSource;
};
export type BackgroundJobDeletionTombstones = {
  jobIds: Record<string, true>;
  assistantIds: Record<string, true>;
  projectIds: Record<string, true>;
};
export function createBackgroundJobDeletionTombstones(): BackgroundJobDeletionTombstones {
  return { jobIds: {}, assistantIds: {}, projectIds: {} };
}

export function mergeBackgroundJobsSnapshot<TPreferences extends SourcePreferences>(state: CacheState<TPreferences>,
  incoming: BackgroundJobsState): BackgroundJobsState {
  const visible = filterDeletedBackgroundWorkloads(incoming.jobs, incoming.runs, state.backgroundJobDeletionTombstones);
  const jobIds = new Set([state.jobsPanePreferences.selectedJobId].filter((id): id is string => !!id));
  const runIds = new Set([state.jobsPanePreferences.selectedRunId, state.backgroundJobDetailsRunId]
    .filter((id): id is string => !!id));
  return { ...incoming,
    jobs: preserveSelected(visible.jobs, state.backgroundJobs.jobs, jobIds, BACKGROUND_JOB_CACHE_LIMIT),
    runs: preserveSelected(visible.runs, state.backgroundJobs.runs, runIds, BACKGROUND_RUN_CACHE_LIMIT) };
}

export function getBackgroundJobsUpdatedPatch<TPreferences extends SourcePreferences>(state: CacheState<TPreferences>,
  incoming: BackgroundJobsState) {
  // Deletion chunks and this snapshot are emitted synchronously and WebSocket frames are ordered. Page/source request
  // ownership is cleared by the deletion reducer, so the first reconciled snapshot is the safe retirement boundary.
  return { backgroundJobs: mergeBackgroundJobsSnapshot(state, incoming),
    backgroundJobDeletionTombstones: createBackgroundJobDeletionTombstones() };
}

export function getBackgroundJobsDeletedPatch<TPreferences extends SourcePreferences>(state: CacheState<TPreferences>,
  payload: DeletionPayload, additionalDeletedJobIds: ReadonlySet<string> = new Set()) {
  const removed = removeDeletedBackgroundWorkloads(state.backgroundJobs.jobs, state.backgroundJobs.runs, payload.targets,
    new Set(payload.deletedJobIds));
  const deletedJobIds = new Set([...removed.deletedJobIds, ...payload.deletedJobIds, ...additionalDeletedJobIds]);
  const tombstones = createDeletionFrameTombstones(payload.targets, new Set(payload.deletedJobIds));
  const pending = state.pendingBackgroundJobSource;
  const pendingDeleted = pending && ((pending.jobId && deletedJobIds.has(pending.jobId)) || payload.targets.some((target) =>
    target.kind === "background-job" ? target.jobId === pending.jobId : target.kind === "assistant"
      ? target.assistantId === pending.assistantId : target.projectId === pending.projectId));
  return { backgroundJobs: { ...state.backgroundJobs, jobs: removed.jobs, runs: removed.runs },
    backgroundJobDeletionTombstones: tombstones,
    jobsPanePreferences: { ...state.jobsPanePreferences,
      selectedJobId: state.jobsPanePreferences.selectedJobId && deletedJobIds.has(state.jobsPanePreferences.selectedJobId)
        ? undefined : state.jobsPanePreferences.selectedJobId,
      selectedRunId: state.jobsPanePreferences.selectedRunId && removed.deletedRunIds.has(state.jobsPanePreferences.selectedRunId)
        ? undefined : state.jobsPanePreferences.selectedRunId },
    backgroundJobDetailsRunId: state.backgroundJobDetailsRunId && removed.deletedRunIds.has(state.backgroundJobDetailsRunId)
      ? undefined : state.backgroundJobDetailsRunId,
    ...(pendingDeleted ? { pendingBackgroundJobSource: undefined } : {}) };
}

export function getBackgroundJobsDeletedViewPatch<TPreferences extends SourcePreferences,
  TAssistants extends { jobs: BackgroundJob[]; runs: BackgroundJobRun[];
    workloadPagesByAssistantId: Record<string, AssistantWorkloadPageState> }>(
  state: CacheState<TPreferences> & { assistants: TAssistants }, payload: DeletionPayload) {
  const deletedJobIds = new Set(payload.deletedJobIds);
  const workloads = removeDeletedBackgroundWorkloads(state.assistants.jobs, state.assistants.runs, payload.targets,
    deletedJobIds);
  const deletedAssistants = new Set(payload.targets.flatMap((target) => target.kind === "assistant" ? [target.assistantId] : []));
  const workloadPagesByAssistantId: Record<string, AssistantWorkloadPageState> = {};
  for (const [assistantId, page] of Object.entries(state.assistants.workloadPagesByAssistantId)) {
    if (!deletedAssistants.has(assistantId)) workloadPagesByAssistantId[assistantId] = clearAssistantWorkloadRequestOwnership(page);
  }
  return { ...getBackgroundJobsDeletedPatch(state, payload, workloads.deletedJobIds),
    assistants: { ...state.assistants, jobs: workloads.jobs, runs: workloads.runs, workloadPagesByAssistantId } };
}

export function filterDeletedBackgroundWorkloads(jobs: BackgroundJob[], runs: BackgroundJobRun[],
  tombstones: BackgroundJobDeletionTombstones) {
  return { jobs: jobs.filter((job) => !isDeletedBackgroundJob(job, tombstones)),
    runs: runs.filter((run) => !isDeletedBackgroundRun(run, tombstones)) };
}

export function filterDeletedAssistantWorkloadPage(payload: Extract<ServerEvent, { type: "assistant.workloads.listed" }>["payload"],
  tombstones: BackgroundJobDeletionTombstones) {
  const visible = filterDeletedBackgroundWorkloads(payload.jobs?.items ?? [], payload.runs?.items ?? [], tombstones);
  return { ...payload, ...(payload.jobs ? { jobs: { ...payload.jobs, items: visible.jobs } } : {}),
    ...(payload.runs ? { runs: { ...payload.runs, items: visible.runs } } : {}) };
}

export function isDeletedBackgroundRun(run: BackgroundJobRun, tombstones: BackgroundJobDeletionTombstones) {
  return !!(tombstones.jobIds[run.jobId] || (run.assistantId && tombstones.assistantIds[run.assistantId]) ||
    tombstones.projectIds[run.projectId]);
}

export function removeDeletedBackgroundWorkloads(jobs: BackgroundJob[], runs: BackgroundJobRun[], targets: DeletionTarget[],
  authoritativeDeletedJobIds: ReadonlySet<string> = new Set()) {
  const matchesJob = (job: Pick<BackgroundJob, "id" | "assistantId" | "projectId">) => authoritativeDeletedJobIds.has(job.id) ||
    targets.some((target) => target.kind === "background-job" ? target.jobId === job.id
      : target.kind === "assistant" ? target.assistantId === job.assistantId : target.projectId === job.projectId);
  const deletedJobIds = new Set([...authoritativeDeletedJobIds, ...jobs.filter(matchesJob).map((job) => job.id)]);
  for (const target of targets) if (target.kind === "background-job") deletedJobIds.add(target.jobId);
  const matchesRun = (run: BackgroundJobRun) => deletedJobIds.has(run.jobId) || targets.some((target) =>
    target.kind === "assistant" ? target.assistantId === run.assistantId
      : target.kind === "project" && target.projectId === run.projectId);
  const deletedRunIds = new Set(runs.filter(matchesRun).map((run) => run.id));
  return { jobs: jobs.filter((job) => !matchesJob(job)), runs: runs.filter((run) => !matchesRun(run)),
    deletedJobIds, deletedRunIds };
}

export function boundBackgroundRuns(runs: BackgroundJobRun[], nextRun: BackgroundJobRun,
  retainedIds: ReadonlySet<string>) {
  return retainWithinLimit(upsert(runs, nextRun).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    BACKGROUND_RUN_CACHE_LIMIT, retainedIds);
}
export function boundBackgroundJobs(jobs: BackgroundJob[], nextJob: BackgroundJob, retainedIds: ReadonlySet<string>) {
  return retainWithinLimit(upsert(jobs, nextJob), BACKGROUND_JOB_CACHE_LIMIT, retainedIds);
}

function isDeletedBackgroundJob(job: Pick<BackgroundJob, "id" | "assistantId" | "projectId">,
  tombstones: BackgroundJobDeletionTombstones) {
  return !!(tombstones.jobIds[job.id] || (job.assistantId && tombstones.assistantIds[job.assistantId]) ||
    tombstones.projectIds[job.projectId]);
}
function createDeletionFrameTombstones(targets: DeletionTarget[], deletedJobIds: Set<string>) {
  for (const target of targets) if (target.kind === "background-job") deletedJobIds.add(target.jobId);
  return { jobIds: recordIds(deletedJobIds),
    assistantIds: recordIds(targets.flatMap((target) => target.kind === "assistant" ? [target.assistantId] : [])),
    projectIds: recordIds(targets.flatMap((target) => target.kind === "project" ? [target.projectId] : [])) };
}
function recordIds(ids: Iterable<string>) {
  return Object.fromEntries([...new Set(ids)].map((id) => [id, true as const]));
}
function clearAssistantWorkloadRequestOwnership(page: AssistantWorkloadPageState): AssistantWorkloadPageState {
  return { jobs: clearAssistantWorkloadRequestState(page.jobs, "force-stale"),
    runs: clearAssistantWorkloadRequestState(page.runs, "force-stale") };
}
function preserveSelected<T extends { id: string }>(incoming: T[], existing: T[], selectedIds: Set<string>, capacity: number) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return retainWithinLimit([...incoming, ...existing.filter((item) => selectedIds.has(item.id) && !incomingIds.has(item.id))],
    capacity, selectedIds);
}
function retainWithinLimit<T extends { id: string }>(items: T[], limit: number, retainedIds: ReadonlySet<string>) {
  const retained = items.filter((item) => retainedIds.has(item.id)).slice(0, limit);
  const retainedSet = new Set(retained.map((item) => item.id));
  const keepIds = new Set([...retainedSet, ...items.filter((item) => !retainedSet.has(item.id))
    .slice(0, limit - retained.length).map((item) => item.id)]);
  return items.filter((item) => keepIds.has(item.id));
}
function upsert<T extends { id: string }>(items: T[], item: T) {
  return items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [item, ...items];
}
