import { describe, expect, test } from "bun:test";
import type { BackgroundJob, BackgroundJobRun, ServerEvent } from "@hyperfocus/ai-core/protocol";
import { ASSISTANT_JOB_CACHE_LIMIT, ASSISTANT_WORKLOAD_SCOPE_LIMIT, clearAssistantWorkloadRequestState,
  failPendingAssistantWorkloads, isAssistantJobBootstrapAvailable, markAssistantWorkloadLoading } from "./assistant-workload-pages";
import { assistantWorkloadEmptyMessage } from "../components/assistants-panel";
import { createEmptyAssistantsState, createHarnessStore, createInitialViewState, reduceServerEvent } from "../harness-store";

describe("assistant workload page reducer", () => {
  test("clears request ownership with an explicit idle transition policy", () => {
    const dirty = { status: "idle" as const, request: { id: "request" }, retryCursor: "retry", error: "failed",
      nextCursor: "next", hasRequestedMore: true };
    expect(clearAssistantWorkloadRequestState(dirty, "preserve-idle")).toEqual({ status: "idle", hasRequestedMore: true });
    expect(clearAssistantWorkloadRequestState(dirty, "force-stale")).toEqual({ status: "stale", hasRequestedMore: true });
  });

  test("replaces only the requested assistant workload on the first page", () => {
    const oldTargetJob = createJob("job-target-old", "assistant-target");
    const otherJob = createJob("job-other", "assistant-other");
    const oldTargetRun = createRun("run-target-old", oldTargetJob);
    const otherRun = createRun("run-other", otherJob);
    const state = createInitialViewState();
    state.assistants = {
      ...createEmptyAssistantsState(),
      jobs: [oldTargetJob, otherJob],
      runs: [oldTargetRun, otherRun],
      workloadPagesByAssistantId: {
        "assistant-target": {
          jobs: { status: "loading", request: { id: "req-assistant-workload" } },
          runs: { status: "loading", request: { id: "req-assistant-workload" } }
        }
      }
    };
    const firstJob = createJob("job-target-first", "assistant-target");
    const firstRun = createRun("run-target-first", firstJob);

    const nextState = reduceServerEvent(state, listedEvent({
      assistantId: "assistant-target",
      jobs: { items: [firstJob], nextCursor: "jobs-page-2" },
      runs: { items: [firstRun], nextCursor: "runs-page-2" }
    }));

    expect(nextState.assistants.jobs.map((job) => job.id)).toEqual([firstJob.id, otherJob.id]);
    expect(nextState.assistants.runs.map((run) => run.id)).toEqual([firstRun.id, otherRun.id]);
    expect(nextState.assistants.workloadPagesByAssistantId["assistant-target"]).toEqual({
      jobs: { status: "loaded", nextCursor: "jobs-page-2" },
      runs: { status: "loaded", nextCursor: "runs-page-2" }
    });
  });

  test("appends cursor pages without duplicates and leaves an omitted resource unchanged", () => {
    const firstJob = createJob("job-target-first", "assistant-target", "First version");
    const otherJob = createJob("job-other", "assistant-other");
    const existingRun = createRun("run-target-first", firstJob);
    const state = createInitialViewState();
    state.assistants = {
      ...createEmptyAssistantsState(),
      jobs: [firstJob, otherJob],
      runs: [existingRun],
      workloadPagesByAssistantId: {
        "assistant-target": {
          jobs: { status: "loading", request: { id: "req-assistant-workload", cursor: "jobs-page-2" } },
          runs: { status: "loaded", nextCursor: "runs-page-2" }
        }
      }
    };
    const updatedFirstJob = createJob(firstJob.id, "assistant-target", "Updated first version");
    const secondJob = createJob("job-target-second", "assistant-target");

    const nextState = reduceServerEvent(state, listedEvent({
      assistantId: "assistant-target",
      jobsCursor: "jobs-page-2",
      jobs: { items: [updatedFirstJob, secondJob] }
    }));

    expect(nextState.assistants.jobs.map((job) => job.id)).toEqual([firstJob.id, secondJob.id, otherJob.id]);
    expect(nextState.assistants.jobs[0]?.name).toBe("Updated first version");
    expect(nextState.assistants.runs).toEqual([existingRun]);
    expect(nextState.assistants.workloadPagesByAssistantId["assistant-target"]).toEqual({
      jobs: { status: "loaded", nextCursor: undefined, hasRequestedMore: true },
      runs: { status: "loaded", nextCursor: "runs-page-2" }
    });
  });

  test("ignores a stale response after a newer request takes ownership", () => {
    const state = createInitialViewState();
    state.assistants = {
      ...createEmptyAssistantsState(),
      workloadPagesByAssistantId: {
        "assistant-target": {
          jobs: { status: "loading", request: { id: "request-new" } },
          runs: { status: "idle" }
        }
      }
    };
    const staleJob = createJob("job-stale", "assistant-target");
    const stale = reduceServerEvent(state, listedEvent({
      assistantId: "assistant-target",
      jobs: { items: [staleJob] }
    }, "request-old"));
    expect(stale.assistants).toBe(state.assistants);
    expect(stale.assistants.jobs).toEqual([]);

    const freshJob = createJob("job-fresh", "assistant-target");
    const accepted = reduceServerEvent(stale, listedEvent({
      assistantId: "assistant-target",
      jobs: { items: [freshJob] }
    }, "request-new"));
    expect(accepted.assistants.jobs.map((job) => job.id)).toEqual([freshJob.id]);
  });

  test("turns rejected and disconnected requests into retryable errors", () => {
    const state = createInitialViewState();
    state.assistants = {
      ...createEmptyAssistantsState(),
      workloadPagesByAssistantId: {
        "assistant-target": {
          jobs: { status: "loading", request: { id: "request-rejected", cursor: "jobs-page-2" } },
          runs: { status: "loading", request: { id: "request-disconnected", cursor: "runs-page-2" } }
        }
      }
    };
    const rejected = reduceServerEvent(state, {
      type: "command.rejected",
      requestId: "request-rejected",
      payload: { message: "Harness command failed", detail: "Invalid page cursor", code: "invalid-cursor" }
    });
    expect(rejected.assistants.workloadPagesByAssistantId["assistant-target"]?.jobs).toEqual({
      status: "error",
      retryCursor: undefined,
      error: "Invalid page cursor"
    });

    const disconnected = failPendingAssistantWorkloads(rejected.assistants, "Connection dropped");
    expect(disconnected.workloadPagesByAssistantId["assistant-target"]?.runs).toEqual({
      status: "error",
      retryCursor: "runs-page-2",
      error: "Connection dropped"
    });
  });

  test("ignores live runs before a page is requested and bounds updates for a loaded assistant", () => {
    const unloaded = createInitialViewState();
    const ignoredRun = createRun("run-ignored", createJob("job-ignored", "assistant-target"));
    const ignored = reduceServerEvent(unloaded, runUpdatedEvent(ignoredRun));
    expect(ignored.assistants.runs).toEqual([]);

    let loaded = createInitialViewState();
    loaded.assistants = {
      ...createEmptyAssistantsState(),
      workloadPagesByAssistantId: {
        "assistant-target": { jobs: { status: "loaded" }, runs: { status: "loaded" } }
      }
    };
    for (let index = 0; index < 75; index += 1) {
      const run = createRun(`run-live-${index}`, createJob(`job-live-${index}`, "assistant-target"));
      run.updatedAt = new Date(Date.parse(run.updatedAt) + index * 1_000).toISOString();
      loaded = reduceServerEvent(loaded, runUpdatedEvent(run));
    }
    expect(loaded.assistants.runs).toHaveLength(61);
    expect(loaded.assistants.runs[0]?.id).toBe("run-live-74");
    expect(loaded.assistants.runs.at(-1)?.id).toBe("run-live-14");
    expect(loaded.assistants.workloadPagesByAssistantId["assistant-target"]?.runs).toEqual({ status: "stale" });
  });

  test("rebases a cursor page without evicting its anchor when a new live run arrives", () => {
    let state = createInitialViewState();
    const pagedRuns = Array.from({ length: 60 }, (_, index) =>
      createRun(`run-page-${index}`, createJob(`job-page-${index}`, "assistant-target"))
    );
    state.assistants = {
      ...createEmptyAssistantsState(),
      runs: pagedRuns,
      workloadPagesByAssistantId: {
        "assistant-target": {
          jobs: { status: "loaded" },
          runs: { status: "loaded", nextCursor: "runs-page-2" }
        }
      }
    };

    const liveRun = createRun("run-live-new", createJob("job-live-new", "assistant-target"));
    const rebasing = reduceServerEvent(state, runUpdatedEvent(liveRun));
    expect(rebasing.assistants.runs).toHaveLength(61);
    expect(rebasing.assistants.runs.some((run) => run.id === "run-page-59")).toBe(true);
    expect(rebasing.assistants.workloadPagesByAssistantId["assistant-target"]?.runs).toEqual({ status: "stale" });

    const loading = markAssistantWorkloadLoading(
      rebasing.assistants,
      "assistant-target",
      "runs",
      { id: "request-rebase" }
    );
    const refreshed = reduceServerEvent(
      { ...rebasing, assistants: loading },
      listedEvent({ assistantId: "assistant-target", runs: { items: [liveRun, ...pagedRuns.slice(0, 59)], nextCursor: "runs-rebased-page-2" } }, "request-rebase")
    );
    expect(refreshed.assistants.runs).toHaveLength(60);
    expect(refreshed.assistants.workloadPagesByAssistantId["assistant-target"]?.runs.nextCursor).toBe("runs-rebased-page-2");
  });

  test("distinguishes incomplete and filtered empty workload pages", () => {
    const page = { jobs: { status: "loaded" as const, nextCursor: "more-jobs" }, runs: { status: "loaded" as const } };
    expect(assistantWorkloadEmptyMessage("assistant jobs", "none", page.jobs, false, false)).toBe("No assistant jobs in this page; load more to continue.");
    expect(assistantWorkloadEmptyMessage("assistant jobs", "none", page.jobs, true, true)).toBe("No matching assistant jobs in the loaded results; load more to continue searching.");
    expect(isAssistantJobBootstrapAvailable(page, 0, false)).toBe(false);
    expect(isAssistantJobBootstrapAvailable({ ...page, jobs: { status: "loaded" } }, 0, false)).toBe(true);
    expect(isAssistantJobBootstrapAvailable({ ...page, jobs: { status: "loaded" } }, 0, true)).toBe(false);
  });

  test("bounds cached assistant scopes while retaining the actively loaded page", () => {
    let state = createInitialViewState();
    for (let index = 0; index < ASSISTANT_WORKLOAD_SCOPE_LIMIT + 2; index += 1) {
      const assistantId = `assistant-${index}`;
      state.assistants = markAssistantWorkloadLoading(state.assistants, assistantId, "jobs", { id: `request-${index}` });
      state = reduceServerEvent(state, listedEvent({ assistantId, jobs: { items: [createJob(`job-${index}`, assistantId)] } },
        `request-${index}`));
    }
    expect(Object.keys(state.assistants.workloadPagesByAssistantId)).toHaveLength(ASSISTANT_WORKLOAD_SCOPE_LIMIT);
    expect(state.assistants.workloadPagesByAssistantId["assistant-0"]).toBeUndefined();
    expect(state.assistants.workloadPagesByAssistantId[`assistant-${ASSISTANT_WORKLOAD_SCOPE_LIMIT + 1}`]).toBeDefined();
    expect(state.assistants.jobs).toHaveLength(ASSISTANT_WORKLOAD_SCOPE_LIMIT);
  });

  test("bounds pending and failed store requests while refreshing revisited scope recency", () => {
    const store = createHarnessStore();
    for (let index = 0; index < ASSISTANT_WORKLOAD_SCOPE_LIMIT; index += 1) {
      store.actions.startAssistantWorkloadRequest(`assistant-${index}`, "jobs", { id: `request-${index}` });
      if (index % 2 === 1) store.actions.rejectAssistantWorkloadRequest(`request-${index}`, "offline");
    }
    store.actions.startAssistantWorkloadRequest("assistant-0", "runs", { id: "request-revisit" });
    store.actions.startAssistantWorkloadRequest("assistant-new", "jobs", { id: "request-new" });

    const scopes = store.state.assistants.workloadPagesByAssistantId;
    expect(Object.keys(scopes)).toHaveLength(ASSISTANT_WORKLOAD_SCOPE_LIMIT);
    expect(scopes["assistant-0"]?.runs.status).toBe("loading");
    expect(scopes["assistant-1"]).toBeUndefined();
    expect(scopes["assistant-3"]?.jobs.status).toBe("error");
    expect(scopes["assistant-new"]?.jobs.status).toBe("loading");
  });

  test("refreshes scope recency when selecting an already-loaded assistant", () => {
    const store = createHarnessStore();
    for (let index = 0; index < ASSISTANT_WORKLOAD_SCOPE_LIMIT; index += 1) {
      store.actions.startAssistantWorkloadRequest(`assistant-${index}`, "jobs", { id: `request-${index}` });
    }
    store.setSelectedAssistantId("assistant-0");
    store.actions.startAssistantWorkloadRequest("assistant-new", "jobs", { id: "request-new" });

    const scopes = store.state.assistants.workloadPagesByAssistantId;
    expect(scopes["assistant-0"]).toBeDefined();
    expect(scopes["assistant-1"]).toBeUndefined();
    expect(scopes["assistant-new"]).toBeDefined();
  });

  test("bounds each assistant job page without evicting its newest loaded anchor", () => {
    const assistantId = "assistant-bounded";
    let state = createInitialViewState();
    const firstPage = Array.from({ length: ASSISTANT_JOB_CACHE_LIMIT - 12 }, (_, index) =>
      createJob(`job-${index}`, assistantId));
    state.assistants = { ...createEmptyAssistantsState(), jobs: firstPage, workloadPagesByAssistantId: {
      [assistantId]: { jobs: { status: "loading", request: { id: "load-more", cursor: "cursor" } }, runs: { status: "idle" } }
    } };
    const olderPage = Array.from({ length: 60 }, (_, index) => createJob(`older-job-${index}`, assistantId));
    state = reduceServerEvent(state, listedEvent({ assistantId, jobsCursor: "cursor",
      jobs: { items: olderPage, nextCursor: "more" } }, "load-more"));
    expect(state.assistants.jobs).toHaveLength(ASSISTANT_JOB_CACHE_LIMIT);
    expect(state.assistants.jobs[0]?.id).toBe("job-0");
    expect(state.assistants.workloadPagesByAssistantId[assistantId]?.jobs).toEqual({
      status: "loaded", nextCursor: undefined, hasRequestedMore: true
    });
  });
});

function listedEvent(
  payload: Extract<ServerEvent, { type: "assistant.workloads.listed" }>["payload"],
  requestId: string = "req-assistant-workload"
): Extract<ServerEvent, { type: "assistant.workloads.listed" }> {
  return {
    type: "assistant.workloads.listed",
    requestId,
    payload
  };
}

function runUpdatedEvent(run: BackgroundJobRun): Extract<ServerEvent, { type: "background-job-run.updated" }> {
  return { type: "background-job-run.updated", requestId: `request-${run.id}`, payload: { run } };
}

function createJob(id: string, assistantId: string, name: string = id): BackgroundJob {
  const now = "2026-08-23T12:00:00.000Z";
  return {
    id,
    projectId: "project-one",
    assistantId,
    automationThreadId: `thread-${id}`,
    kind: "ai-routine",
    name,
    status: "enabled",
    riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: `Run ${name}.` },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function createRun(id: string, job: BackgroundJob): BackgroundJobRun {
  const now = "2026-08-23T12:00:00.000Z";
  return {
    id,
    jobId: job.id,
    projectId: job.projectId,
    assistantId: job.assistantId,
    automationThreadId: job.automationThreadId,
    triggerSource: "manual",
    status: "succeeded",
    riskLevel: "safe",
    approvalStatus: "not-needed",
    skippedOccurrenceCount: 0,
    queuedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    events: []
  };
}
