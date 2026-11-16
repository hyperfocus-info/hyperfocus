import { createEffect, createMemo, type Accessor } from "solid-js";
import { createRequestId, type Assistant, type BackgroundJob, type BackgroundJobRun, type ClientCommand } from "@hyperfocus/ai-core/protocol";
import type { PendingBackgroundJobSource } from "./background-job-source-state";
import { ASSISTANT_WORKLOAD_PAGE_SIZE, isAssistantJobBootstrapAvailable,
  type AssistantWorkloadState } from "./store/assistant-workload-pages";
export type { AssistantWorkloadCollectionState, AssistantWorkloadPageState } from "./store/assistant-workload-pages";

type AssistantWorkloadControllerOptions = {
  selectedAssistant: Accessor<Assistant | undefined>;
  activeTab: Accessor<string>;
  workloads: AssistantWorkloadState & { detailSearch: string };
  activeProjectId: Accessor<string | undefined>;
  sendCommand: (command: ClientCommand) => boolean;
  startRequest: (assistantId: string, collection: "jobs" | "runs", request: { id: string; cursor?: string }) => void;
  rejectRequest: (requestId: string, error: string) => void;
  startSourceRequest: (request: PendingBackgroundJobSource) => void;
  rejectSourceRequest: (requestId: string) => void;
  setJobsTab: () => void;
  matchesSearch: (haystack: string, query: string) => boolean;
  reportMissingProject: () => void;
};

export function createAssistantWorkloadController(options: AssistantWorkloadControllerOptions) {
  const selectedWorkloadPage = createMemo(() => {
    const assistantId = options.selectedAssistant()?.id;
    return assistantId ? options.workloads.workloadPagesByAssistantId[assistantId] : undefined;
  });
  const scopedJobs = createMemo(() => options.workloads.jobs.filter((job) => job.assistantId === options.selectedAssistant()?.id));
  const scopedRuns = createMemo(() => options.workloads.runs.filter((run) => run.assistantId === options.selectedAssistant()?.id));
  const visibleJobs = createMemo(() =>
    [...scopedJobs()]
      .sort((left, right) =>
        (right.nextRunAt ?? right.updatedAt).localeCompare(left.nextRunAt ?? left.updatedAt)
      )
      .filter((job) => options.matchesSearch(
        [job.name, job.description, job.status, job.kind, job.scheduleInput].filter(Boolean).join(" "),
        options.workloads.detailSearch
      ))
  );
  const visibleRuns = createMemo(() =>
    [...scopedRuns()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .filter((run) => options.matchesSearch(
        [run.summary, run.status, run.failureMessage, run.failureCategory, run.triggerSource].filter(Boolean).join(" "),
        options.workloads.detailSearch
      ))
  );
  const hasSearch = () => options.workloads.detailSearch.trim().length > 0;
  const canBootstrapAssistantJobs = createMemo(() => isAssistantJobBootstrapAvailable(selectedWorkloadPage(), scopedJobs().length, hasSearch()));

  function requestAssistantWorkloads(assistantId: string, requestJobs: boolean, requestRuns: boolean, jobsCursor?: string, runsCursor?: string) {
    const requestId = createRequestId();
    if (requestJobs) options.startRequest(assistantId, "jobs", { id: requestId, cursor: jobsCursor });
    if (requestRuns) options.startRequest(assistantId, "runs", { id: requestId, cursor: runsCursor });
    const sent = options.sendCommand({
      type: "assistant.workloads.list",
      requestId,
      payload: {
        assistantId,
        jobs: requestJobs ? { cursor: jobsCursor, limit: ASSISTANT_WORKLOAD_PAGE_SIZE } : undefined,
        runs: requestRuns ? { cursor: runsCursor, limit: ASSISTANT_WORKLOAD_PAGE_SIZE } : undefined
      }
    });
    if (!sent) options.rejectRequest(requestId, "Connection unavailable. Retry when the workspace reconnects.");
  }

  function requestMissingWorkloads(assistantId: string) {
    const page = options.workloads.workloadPagesByAssistantId[assistantId];
    const requestJobs = !page || page.jobs.status === "idle" || (page.jobs.status === "stale" && !page.jobs.request);
    const requestRuns = !page || page.runs.status === "idle" || (page.runs.status === "stale" && !page.runs.request);
    if (requestJobs || requestRuns) requestAssistantWorkloads(assistantId, requestJobs, requestRuns);
  }

  createEffect(() => {
    const assistantId = options.selectedAssistant()?.id;
    if (assistantId && options.activeTab() === "jobs") requestMissingWorkloads(assistantId);
  });

  function activateJobsTab() {
    options.setJobsTab();
    const assistantId = options.selectedAssistant()?.id;
    if (!assistantId) return;
    const page = options.workloads.workloadPagesByAssistantId[assistantId];
    if (page?.jobs.status === "error" || page?.runs.status === "error") {
      retryAssistantWorkloads();
    } else {
      requestMissingWorkloads(assistantId);
    }
  }

  function bootstrapAssistantJobs() {
    const assistant = options.selectedAssistant();
    if (!assistant) return;
    const projectId = assistant.projectId ?? options.activeProjectId();
    if (!projectId) {
      options.reportMissingProject();
      return;
    }
    options.sendCommand({
      type: "assistant.jobs.bootstrap",
      requestId: createRequestId(),
      payload: { assistantId: assistant.id, projectId }
    });
  }

  function openAssistantBackgroundJob(job: BackgroundJob) {
    requestBackgroundJobSource({ kind: "job", projectId: job.projectId, jobId: job.id }, job.assistantId);
  }

  function openAssistantBackgroundRun(run: BackgroundJobRun) {
    requestBackgroundJobSource({ kind: "run", projectId: run.projectId, runId: run.id }, run.assistantId, run.jobId);
  }

  function requestBackgroundJobSource(
    payload: Extract<ClientCommand, { type: "background-job.source.open" }>["payload"],
    assistantId?: string,
    jobId?: string
  ) {
    const requestId = createRequestId();
    const pending: PendingBackgroundJobSource = payload.kind === "job"
      ? { ...payload, requestId, assistantId }
      : { ...payload, requestId, assistantId, ...(jobId ? { jobId } : {}) };
    options.startSourceRequest(pending);
    const sent = options.sendCommand({ type: "background-job.source.open", requestId, payload });
    if (!sent) options.rejectSourceRequest(requestId);
  }

  function loadMoreAssistantJobs() {
    const assistantId = options.selectedAssistant()?.id;
    const cursor = selectedWorkloadPage()?.jobs.nextCursor;
    if (assistantId && cursor && selectedWorkloadPage()?.jobs.status === "loaded") {
      requestAssistantWorkloads(assistantId, true, false, cursor);
    }
  }

  function loadMoreAssistantRuns() {
    const assistantId = options.selectedAssistant()?.id;
    const cursor = selectedWorkloadPage()?.runs.nextCursor;
    if (assistantId && cursor && selectedWorkloadPage()?.runs.status === "loaded") {
      requestAssistantWorkloads(assistantId, false, true, undefined, cursor);
    }
  }

  function retryAssistantWorkloads() {
    const assistantId = options.selectedAssistant()?.id;
    const page = selectedWorkloadPage();
    if (!assistantId || !page) return;
    const retryJobs = page.jobs.status === "error";
    const retryRuns = page.runs.status === "error";
    if (retryJobs || retryRuns) {
      requestAssistantWorkloads(assistantId, retryJobs, retryRuns, page.jobs.retryCursor, page.runs.retryCursor);
    }
  }

  function retryAssistantJobs() {
    retryAssistantCollection("jobs");
  }

  function retryAssistantRuns() {
    retryAssistantCollection("runs");
  }

  function retryAssistantCollection(collection: "jobs" | "runs") {
    const assistantId = options.selectedAssistant()?.id;
    const state = selectedWorkloadPage()?.[collection];
    if (!assistantId || state?.status !== "error") return;
    requestAssistantWorkloads(
      assistantId,
      collection === "jobs",
      collection === "runs",
      collection === "jobs" ? state.retryCursor : undefined,
      collection === "runs" ? state.retryCursor : undefined
    );
  }

  return { activateJobsTab, bootstrapAssistantJobs, canBootstrapAssistantJobs, hasSearch, loadMoreAssistantJobs, loadMoreAssistantRuns, openAssistantBackgroundJob, openAssistantBackgroundRun, retryAssistantJobs, retryAssistantRuns, retryAssistantWorkloads, scopedJobs, scopedRuns, selectedWorkloadPage, visibleJobs, visibleRuns };
}
