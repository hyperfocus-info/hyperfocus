import type { BackgroundJobsState, ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";
import { boundBackgroundJobs, boundBackgroundRuns, type BackgroundJobDeletionTombstones } from "./store/background-workload-cache";
import { getBackgroundRunFilter } from "./store/background-jobs-pane-state";

type SourcePayload = Extract<ServerEvent, { type: "background-job.source.loaded" }>["payload"];
type SourcePreferences = { selectedJobId?: string; selectedRunId?: string };
type BackgroundJobSourceState<TPreferences extends SourcePreferences> = {
  backgroundJobs: BackgroundJobsState;
  backgroundJobDeletionTombstones: BackgroundJobDeletionTombstones;
  backgroundJobDetailsRunId?: string;
  jobsPanePreferences: TPreferences;
  pendingBackgroundJobSource?: PendingBackgroundJobSource;
};
export type PendingBackgroundJobSource = Extract<ClientCommand, { type: "background-job.source.open" }>["payload"] & {
  requestId: string;
  assistantId?: string;
  jobId?: string;
};

export function getBackgroundJobSourcePatch<TPreferences extends SourcePreferences>(state: BackgroundJobSourceState<TPreferences>,
  requestId: string, payload: SourcePayload) {
  if (!ownsSourceResponse(state.pendingBackgroundJobSource, requestId, payload)) return {};
  if (isDeletedSource(payload, state.backgroundJobDeletionTombstones)) return { pendingBackgroundJobSource: undefined };
  const jobs = boundBackgroundJobs(state.backgroundJobs.jobs, payload.job, new Set([payload.job.id]));
  const common = { ...state.jobsPanePreferences, kind: undefined, status: undefined, jobState: "all" as const,
    risk: undefined, selectedJobId: payload.job.id, selectedNotificationId: undefined };
  if (payload.kind === "job") return { pendingBackgroundJobSource: undefined, activeLeftTab: "jobs" as const,
    activeSurface: "background-jobs" as const, backgroundJobs: { ...state.backgroundJobs, jobs },
    backgroundJobDetailsRunId: undefined,
    jobsPanePreferences: { ...common, segment: "jobs", jobSearch: "", selectedRunId: undefined } };
  return { pendingBackgroundJobSource: undefined, activeLeftTab: "runs" as const, activeSurface: "background-jobs" as const,
    backgroundJobs: { ...state.backgroundJobs, jobs,
      runs: boundBackgroundRuns(state.backgroundJobs.runs, payload.run, new Set([payload.run.id])) },
    backgroundJobDetailsRunId: undefined, jobsRunFilter: getBackgroundRunFilter(payload.run),
    jobsPanePreferences: { ...common, segment: "inbox", runSearch: "", selectedRunId: payload.run.id } };
}

export function getClearPendingBackgroundJobSourcePatch(
  state: Pick<BackgroundJobSourceState<SourcePreferences>, "pendingBackgroundJobSource">, requestId?: string
) {
  return state.pendingBackgroundJobSource && (!requestId || state.pendingBackgroundJobSource.requestId === requestId)
    ? { pendingBackgroundJobSource: undefined } : {};
}

function ownsSourceResponse(pending: PendingBackgroundJobSource | undefined, requestId: string, payload: SourcePayload) {
  if (!pending || pending.requestId !== requestId || pending.kind !== payload.kind || pending.projectId !== payload.job.projectId) return false;
  return payload.kind === "job" ? pending.kind === "job" && pending.jobId === payload.job.id
    : pending.kind === "run" && pending.runId === payload.run.id && (!pending.jobId || pending.jobId === payload.job.id);
}

function isDeletedSource(payload: SourcePayload, tombstones: BackgroundJobDeletionTombstones) {
  if (tombstones.jobIds[payload.job.id] || (payload.job.assistantId && tombstones.assistantIds[payload.job.assistantId]) ||
    tombstones.projectIds[payload.job.projectId]) return true;
  return payload.kind === "run" && (tombstones.jobIds[payload.run.jobId] ||
    (payload.run.assistantId && tombstones.assistantIds[payload.run.assistantId]) || tombstones.projectIds[payload.run.projectId]);
}
