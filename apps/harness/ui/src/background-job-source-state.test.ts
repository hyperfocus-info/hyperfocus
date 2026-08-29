import { expect, test } from "bun:test";
import type { BackgroundJobRun, ServerEvent } from "@hyperfocus/ai-core/protocol";
import { getBackgroundJobSourcePatch } from "./background-job-source-state";
import { BACKGROUND_JOB_CACHE_LIMIT, BACKGROUND_RUN_CACHE_LIMIT, mergeBackgroundJobsSnapshot } from "./store/background-workload-cache";
import { createHarnessStore, createInitialViewState, reduceServerEvent } from "./harness-store";
import { createAssistantFixture, createBackgroundJobFixture, createBackgroundJobRunFixture, createHarnessStateFixture,
  defaultPreferencesFixture } from "./utils/tests/test-fixtures";

test("authoritative workload sources survive later bounded snapshots", () => {
  const job = createBackgroundJobFixture({ id: "old-job", assistantId: "assistant-1", name: "Old job" });
  const run = createBackgroundJobRunFixture({ id: "old-run", jobId: job.id, projectId: job.projectId,
    assistantId: job.assistantId, events: [{ id: "event-1", stage: "complete",
      message: "Done", createdAt: "2026-08-23T12:00:00.000Z" }] });
  const initial = createHarnessStateFixture({ backgroundJobs: { jobs: [], runs: [], templates: [] },
    pendingBackgroundJobSource: { requestId: "source-run", kind: "run", projectId: job.projectId, runId: run.id } });
  const opened = { ...initial, ...getBackgroundJobSourcePatch(initial, "source-run", { kind: "run", job, run }) };
  expect(opened.activeLeftTab).toBe("runs");
  expect(opened.jobsPanePreferences).toMatchObject({ selectedJobId: job.id, selectedRunId: run.id });
  expect(opened.backgroundJobs.runs[0]?.events).toEqual(run.events);

  const jobs = Array.from({ length: BACKGROUND_JOB_CACHE_LIMIT }, (_, index) => ({ ...job, id: `new-job-${index}` }));
  const runs = Array.from({ length: 256 }, (_, index) => ({ ...run, id: `new-run-${index}` }));
  const refreshed = mergeBackgroundJobsSnapshot(opened, { jobs, runs, templates: [] });
  expect(refreshed.jobs).toHaveLength(BACKGROUND_JOB_CACHE_LIMIT);
  expect(refreshed.runs).toHaveLength(257);
  expect(refreshed.jobs.at(-1)).toEqual(job);
  expect(refreshed.runs.at(-1)).toEqual(run);
});

test("tombstone filtering preserves the raw bounded capacity for selected jobs and runs", () => {
  const job = (id: string) => createBackgroundJobFixture({ id });
  const run = (id: string, jobId: string) => createBackgroundJobRunFixture({ id, jobId });
  const selectedJob = job("selected-job");
  const selectedRun = run("selected-run", "selected-run-job");
  const visibleJobs = Array.from({ length: BACKGROUND_JOB_CACHE_LIMIT - 1 }, (_, index) => job(`job-${index}`));
  const visibleRuns = Array.from({ length: BACKGROUND_RUN_CACHE_LIMIT - 1 }, (_, index) => run(`run-${index}`, `run-job-${index}`));
  const initial = createHarnessStateFixture({
    backgroundJobs: { jobs: [selectedJob], runs: [selectedRun], templates: [] },
    backgroundJobDeletionTombstones: { jobIds: { "deleted-job": true, "deleted-run-job": true }, assistantIds: {}, projectIds: {} },
    jobsPanePreferences: { ...createInitialViewState().jobsPanePreferences,
      selectedJobId: selectedJob.id, selectedRunId: selectedRun.id } });
  const merged = mergeBackgroundJobsSnapshot(initial, { templates: [],
    jobs: [job("deleted-job"), ...visibleJobs], runs: [run("deleted-run", "deleted-run-job"), ...visibleRuns] });
  expect(merged.jobs).toHaveLength(BACKGROUND_JOB_CACHE_LIMIT);
  expect(merged.runs).toHaveLength(BACKGROUND_RUN_CACHE_LIMIT);
  expect(new Set(merged.jobs.map((entry) => entry.id))).toEqual(new Set([selectedJob.id, ...visibleJobs.map((entry) => entry.id)]));
  expect(new Set(merged.runs.map((entry) => entry.id))).toEqual(new Set([selectedRun.id, ...visibleRuns.map((entry) => entry.id)]));
});

test("exact source handoff is latest-wins and clears job filters", () => {
  const job = createBackgroundJobFixture({ id: "job-2", projectId: "project-2", assistantId: "assistant-2", name: "Exact job" });
  const initial = createHarnessStateFixture({ activeSurface: "assistants", activeLeftTab: "assistants",
    jobsPanePreferences: { ...createInitialViewState().jobsPanePreferences, jobSearch: "hidden", runSearch: "hidden", kind: "shell",
      status: "paused", risk: "unsafe" },
    pendingBackgroundJobSource: { requestId: "latest", kind: "job", projectId: job.projectId, jobId: job.id } });

  expect(getBackgroundJobSourcePatch(initial, "stale", { kind: "job", job })).toEqual({});
  const opened = { ...initial, ...getBackgroundJobSourcePatch(initial, "latest", { kind: "job", job }) };
  expect(opened.pendingBackgroundJobSource).toBeUndefined();
  expect(opened.activeLeftTab).toBe("jobs");
  expect(opened.jobsPanePreferences).toMatchObject({ segment: "jobs",
    selectedJobId: job.id, selectedRunId: undefined, jobSearch: "", kind: undefined, status: undefined, risk: undefined });
  expect(opened.jobsPanePreferences).not.toHaveProperty("projectId");
  expect(opened.jobsPanePreferences).not.toHaveProperty("assistantId");
});

test("committed deletion converges every client without treating bounded absence as deletion", () => {
  const job = createBackgroundJobFixture({ id: "deleted-job", updatedAt: "2026-01-01T00:00:00.000Z" });
  const run = createBackgroundJobRunFixture({ id: "deleted-run", jobId: job.id, updatedAt: job.updatedAt });
  const state = { ...createInitialViewState(), backgroundJobs: { jobs: [job], runs: [run], templates: [] },
    jobsPanePreferences: { ...createInitialViewState().jobsPanePreferences, selectedJobId: job.id, selectedRunId: run.id } };
  const unrelatedSnapshot: ServerEvent = { type: "background-jobs.updated", requestId: "unrelated-auto-snapshot", payload: {
    backgroundJobs: { jobs: Array.from({ length: BACKGROUND_JOB_CACHE_LIMIT }, (_, index) => ({ ...job, id: `other-job-${index}` })),
      runs: Array.from({ length: BACKGROUND_RUN_CACHE_LIMIT }, (_, index) => ({ ...run, id: `other-run-${index}`, jobId: `other-job-${index % BACKGROUND_JOB_CACHE_LIMIT}` })), templates: [] }
  } };
  const firstClient = reduceServerEvent(state, unrelatedSnapshot);
  const secondClient = reduceServerEvent(state, unrelatedSnapshot);
  expect(firstClient.jobsPanePreferences.selectedJobId).toBe(job.id);
  expect(reduceServerEvent(firstClient, { type: "command.rejected", requestId: "delete-job", payload: { message: "Still active" } })
    .jobsPanePreferences.selectedJobId).toBe(job.id);
  const committed: ServerEvent = { type: "background-jobs.deleted", requestId: "delete-job", payload: {
    targets: [{ kind: "background-job", jobId: job.id }], deletedJobIds: [job.id]
  } };
  for (const client of [firstClient, secondClient].map((entry) => reduceServerEvent(entry, committed))) {
    expect(client.jobsPanePreferences.selectedJobId).toBeUndefined();
    expect(client.jobsPanePreferences.selectedRunId).toBeUndefined();
    expect(client.backgroundJobs.jobs.some((entry) => entry.id === job.id)).toBe(false);
    expect(client.backgroundJobs.runs.some((entry) => entry.id === run.id)).toBe(false);
    const staleSnapshot = reduceServerEvent(client, { type: "background-jobs.updated", requestId: "stale", payload: {
      backgroundJobs: { jobs: [job], runs: [run], templates: [] }
    } });
    expect(staleSnapshot.backgroundJobs).toMatchObject({ jobs: [], runs: [] });
    expect(staleSnapshot.backgroundJobDeletionTombstones).toEqual({ jobIds: {}, assistantIds: {}, projectIds: {} });
  }
});

test("connection ready authoritatively evicts missed deletions and resets session tombstones", () => {
  const job = createBackgroundJobFixture({ id: "missed-job" });
  const run = createBackgroundJobRunFixture({ id: "missed-run", jobId: job.id });
  const initial = createInitialViewState();
  const assistantId = "assistant-reconnected";
  const assistant = createAssistantFixture({ id: assistantId, name: "Reconnect", projectId: job.projectId });
  const stale = createHarnessStateFixture({ ...initial, backgroundJobs: { jobs: [job], runs: [run], templates: [] },
    assistants: { ...initial.assistants, assistants: [assistant],
      threads: [{ id: "thread", assistantId, sessionId: "session", messageCount: 0, messages: [], updatedAt: "now" }],
      todos: [{ id: "todo", assistantId, title: "Deleted", state: "pending", sortOrder: 0, workKind: "unspecified", createdAt: "now", updatedAt: "now" }],
      learnings: [{ id: "learning", assistantId, summary: "Deleted", source: "test", confidence: "medium", createdAt: "now" }],
      questions: [{ id: "question", assistantId, prompt: "Deleted?", status: "pending", askedAt: "now" }],
      logs: [{ id: "log", assistantId, level: "info", summary: "Deleted", createdAt: "now" }],
      assetRefs: [{ id: "asset", assistantId, kind: "skill", label: "Deleted", value: "deleted", resolutionStatus: "resolved", createdAt: "now" }] },
    jobsPanePreferences: { ...initial.jobsPanePreferences, selectedJobId: job.id, selectedRunId: run.id } });
  const readyEvent: Extract<ServerEvent, { type: "connection.ready" }> = { type: "connection.ready", payload: {
    agents: initial.availableAgents, availableSkillPaths: initial.availableSkillPaths, setup: initial.setup,
    workspace: initial.workspace, assistants: { ...initial.assistants, assistants: [assistant] },
    backgroundJobs: { jobs: [], runs: [], templates: [] },
    notifications: initial.notifications, executionControl: initial.executionControl, tokenUsage: initial.tokenUsage,
    preferences: defaultPreferencesFixture
  } };
  const ready = reduceServerEvent(stale, readyEvent);
  expect(ready.backgroundJobs).toMatchObject({ jobs: [], runs: [] });
  expect(ready.jobsPanePreferences).toMatchObject({ selectedJobId: undefined, selectedRunId: undefined });
  expect(ready.backgroundJobDeletionTombstones).toEqual({ jobIds: {}, assistantIds: {}, projectIds: {} });
  expect(ready.assistants).toMatchObject({ threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] });
});

test("committed assistant and project deletion scopes remove cascade workloads", () => {
  const assistantJob = createBackgroundJobFixture({ id: "assistant-job", assistantId: "assistant-1" });
  const projectJob = createBackgroundJobFixture({ id: "project-job", projectId: "project-2" });
  const runs: BackgroundJobRun[] = [
    createBackgroundJobRunFixture({ id: "assistant-run", jobId: assistantJob.id,
      assistantId: "historical-owner", projectId: assistantJob.projectId }),
    createBackgroundJobRunFixture({ id: "project-run", jobId: projectJob.id, projectId: projectJob.projectId })
  ];
  const state = { ...createInitialViewState(), backgroundJobs: { jobs: [assistantJob, projectJob], runs, templates: [] } };
  const afterAssistant = reduceServerEvent(state, { type: "background-jobs.deleted", requestId: "bulk-assistant", payload: {
    targets: [{ kind: "assistant", assistantId: "assistant-1" }], deletedJobIds: [assistantJob.id]
  } });
  expect(afterAssistant.backgroundJobs.jobs.map((entry) => entry.id)).toEqual([projectJob.id]);
  expect(afterAssistant.backgroundJobs.runs.map((entry) => entry.id)).toEqual(["project-run"]);
  const afterProject = reduceServerEvent(afterAssistant, { type: "background-jobs.deleted", requestId: "bulk-project", payload: {
    targets: [{ kind: "project", projectId: "project-2" }], deletedJobIds: [projectJob.id]
  } });
  expect(afterProject.backgroundJobs).toMatchObject({ jobs: [], runs: [] });
});

test("authoritative cascade ids remove historical runs when the reassigned job is outside the client cache", () => {
  const state = createInitialViewState();
  const run = createBackgroundJobRunFixture({ id: "historical-run", jobId: "omitted-reassigned-job",
    assistantId: "former-owner" });
  state.backgroundJobs.runs = [run];
  state.jobsPanePreferences.selectedRunId = run.id;
  const deleted = reduceServerEvent(state, { type: "background-jobs.deleted", requestId: "delete-current-owner", payload: {
    targets: [{ kind: "assistant", assistantId: "current-owner" }], deletedJobIds: [run.jobId]
  } });
  expect(deleted.backgroundJobs.runs).toEqual([]);
  expect(deleted.jobsPanePreferences.selectedRunId).toBeUndefined();
  expect(deleted.backgroundJobDeletionTombstones.jobIds[run.jobId]).toBe(true);
});

test("run source responses must preserve the requested immutable job relation", () => {
  const expectedJob = createBackgroundJobFixture({ id: "expected-job" });
  const reboundJob = { ...expectedJob, id: "rebound-job" };
  const run = createBackgroundJobRunFixture({ id: "requested-run", jobId: reboundJob.id, projectId: reboundJob.projectId });
  const state = createHarnessStateFixture({ pendingBackgroundJobSource: { requestId: "source", kind: "run",
    projectId: expectedJob.projectId, runId: run.id, jobId: expectedJob.id } });
  expect(getBackgroundJobSourcePatch(state, "source", { kind: "run", job: reboundJob, run })).toEqual({});
});

test("ordered deletion frames retire at the authoritative snapshot without reviving requests beyond one frame", () => {
  const assistantId = "assistant-deleted";
  const job = createBackgroundJobFixture({ id: "deleted-job-0", assistantId });
  const run = createBackgroundJobRunFixture({ id: "deleted-run", jobId: job.id, assistantId: "historical-owner" });
  let state = createInitialViewState();
  state.backgroundJobs.runs = [run];
  state.pendingBackgroundJobSource = { requestId: "late-source", kind: "run", projectId: job.projectId,
    runId: run.id, jobId: job.id, assistantId: run.assistantId };
  state.assistants.workloadPagesByAssistantId[assistantId] = {
    jobs: { status: "loading", request: { id: "late-page" } }, runs: { status: "loading", request: { id: "late-page" } }
  };
  for (let batch = 0; batch < 10; batch += 1) {
    const deletedJobIds = Array.from({ length: 512 }, (_, index) => `deleted-job-${batch * 512 + index}`);
    state = reduceServerEvent(state, { type: "background-jobs.deleted", requestId: `delete-${batch}`, payload: {
      targets: [{ kind: "assistant", assistantId: `assistant-${batch}` }], deletedJobIds
    } });
    expect(Object.keys(state.backgroundJobDeletionTombstones.jobIds).length).toBeLessThanOrEqual(512);
  }
  expect(state.backgroundJobDeletionTombstones.jobIds["deleted-job-5119"]).toBe(true);
  expect(state.backgroundJobs.runs).toEqual([]);
  expect(state.pendingBackgroundJobSource).toBeUndefined();
  expect(state.assistants.workloadPagesByAssistantId[assistantId]).toEqual({
    jobs: { status: "stale" }, runs: { status: "stale" }
  });
  const reconciled = reduceServerEvent(state, { type: "background-jobs.updated", requestId: "post-delete-snapshot",
    payload: { backgroundJobs: { jobs: [], runs: [], templates: [] } } });
  expect(reconciled.backgroundJobDeletionTombstones).toEqual({ jobIds: {}, assistantIds: {}, projectIds: {} });
  const afterPage = reduceServerEvent(reconciled, { type: "assistant.workloads.listed", requestId: "late-page", payload: {
    assistantId, jobs: { items: [job] }, runs: { items: [run] }
  } });
  const afterSource = reduceServerEvent(afterPage, { type: "background-job.source.loaded", requestId: "late-source",
    payload: { kind: "run", job, run } });
  expect(afterSource.backgroundJobs).toMatchObject({ jobs: [], runs: [] });
  expect(afterSource.assistants).toMatchObject({ jobs: [], runs: [] });
});

test("assistant deletion tombstones assistant-cache job relations against every late event", () => {
  const assistantId = "assistant-deleted";
  const job = createBackgroundJobFixture({ id: "assistant-cache-job", assistantId });
  const run = createBackgroundJobRunFixture({ id: "historical-run", jobId: job.id, assistantId: "historical-owner" });
  const initial = createInitialViewState();
  const state = { ...initial, backgroundJobs: { jobs: [], runs: [], templates: [] },
    pendingBackgroundJobSource: { requestId: "late-source", kind: "run" as const, projectId: job.projectId,
      runId: run.id, jobId: job.id, assistantId: run.assistantId },
    assistants: { ...initial.assistants, jobs: [job], runs: [run], workloadPagesByAssistantId: {
      [assistantId]: { jobs: { status: "loading" as const, request: { id: "late-page" } },
        runs: { status: "loading" as const, request: { id: "late-page" } } }
    } } };
  const deleted = reduceServerEvent(state, { type: "background-jobs.deleted", requestId: "delete-assistant", payload: {
    targets: [{ kind: "assistant", assistantId }], deletedJobIds: [job.id]
  } });
  expect(deleted.backgroundJobDeletionTombstones).toMatchObject({ jobIds: { [job.id]: true }, assistantIds: { [assistantId]: true } });
  expect(deleted.pendingBackgroundJobSource).toBeUndefined();
  expect(deleted.assistants).toMatchObject({ jobs: [], runs: [], workloadPagesByAssistantId: {} });

  const afterPage = reduceServerEvent(deleted, { type: "assistant.workloads.listed", requestId: "late-page", payload: {
    assistantId, jobs: { items: [job] }, runs: { items: [run] }
  } });
  const afterLive = reduceServerEvent(afterPage, { type: "background-job-run.updated", requestId: "late-live", payload: { run } });
  const afterSource = reduceServerEvent({ ...afterLive, pendingBackgroundJobSource: state.pendingBackgroundJobSource }, {
    type: "background-job.source.loaded", requestId: "late-source", payload: { kind: "run", job, run }
  });
  expect(afterPage.assistants).toMatchObject({ jobs: [], runs: [] });
  expect(afterLive.backgroundJobs.runs).toEqual([]);
  expect(afterLive.assistants.runs).toEqual([]);
  expect(afterSource.pendingBackgroundJobSource).toBeUndefined();
  expect(afterSource.backgroundJobs).toMatchObject({ jobs: [], runs: [] });
});

test("live run cache stays bounded while retaining the selected run", () => {
  const run = (id: string, updatedAt: string) => createBackgroundJobRunFixture({ id, updatedAt });
  const selected = run("selected", "2020-01-01T00:00:00.000Z");
  const current = [selected, ...Array.from({ length: BACKGROUND_RUN_CACHE_LIMIT - 1 }, (_, index) => run(`run-${index}`, `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`))];
  const state = { ...createInitialViewState(), backgroundJobs: { jobs: [], runs: current, templates: [] },
    jobsPanePreferences: { ...createInitialViewState().jobsPanePreferences, selectedRunId: selected.id } };
  const next = reduceServerEvent(state, { type: "background-job-run.updated", requestId: "live", payload: { run: run("novel", "2027-01-01T00:00:00.000Z") } });
  expect(next.backgroundJobs.runs).toHaveLength(BACKGROUND_RUN_CACHE_LIMIT);
  expect(next.backgroundJobs.runs[0]?.id).toBe("novel");
  expect(next.backgroundJobs.runs.at(-1)?.id).toBe(selected.id);
});

test("exact source insertions stay bounded while retaining the opened job and run", () => {
  const job = createBackgroundJobFixture({ id: "opened-job" });
  const run = createBackgroundJobRunFixture({ id: "opened-run", jobId: job.id, updatedAt: "2020-01-01" });
  const initial = { ...createInitialViewState(), backgroundJobs: {
    jobs: Array.from({ length: BACKGROUND_JOB_CACHE_LIMIT }, (_, index) => ({ ...job, id: `job-${index}` })),
    runs: Array.from({ length: BACKGROUND_RUN_CACHE_LIMIT }, (_, index) => ({ ...run, id: `run-${index}`, updatedAt: `2026-${String(index).padStart(4, "0")}` })), templates: [] },
    pendingBackgroundJobSource: { requestId: "open", kind: "run" as const, projectId: job.projectId, runId: run.id }
  };
  const opened = { ...initial, ...getBackgroundJobSourcePatch(initial, "open", { kind: "run", job, run }) };
  expect(opened.backgroundJobs.jobs).toHaveLength(BACKGROUND_JOB_CACHE_LIMIT);
  expect(opened.backgroundJobs.runs).toHaveLength(BACKGROUND_RUN_CACHE_LIMIT);
  expect(opened.backgroundJobs.jobs.some((entry) => entry.id === job.id)).toBe(true);
  expect(opened.backgroundJobs.runs.some((entry) => entry.id === run.id)).toBe(true);
});

test("source ownership clears on navigation and matching rejection", () => {
  const store = createHarnessStore();
  store.actions.startBackgroundJobSourceRequest({ requestId: "first", kind: "job", projectId: "project-1", jobId: "job-1" });
  store.actions.startBackgroundJobSourceRequest({ requestId: "latest", kind: "job", projectId: "project-1", jobId: "job-2" });
  expect(store.state.pendingBackgroundJobSource?.requestId).toBe("latest");
  store.setActiveLeftTab("projects");
  expect(store.state.pendingBackgroundJobSource).toBeUndefined();
  const afterLateResponse = reduceServerEvent(store.state, { type: "background-job.source.loaded", requestId: "latest",
    payload: { kind: "job", job: createBackgroundJobFixture({ id: "job-2", assistantId: "assistant-1" }) } });
  expect(afterLateResponse.activeLeftTab).toBe("projects");
  expect(afterLateResponse.backgroundJobs.jobs.some((job) => job.id === "job-2")).toBe(false);

  const pending = { ...createInitialViewState(), pendingBackgroundJobSource: {
    requestId: "rejected", kind: "job" as const, projectId: "project-1", jobId: "job-1"
  } };
  expect(reduceServerEvent(pending, { type: "command.rejected", requestId: "other", payload: { message: "Other" } }).pendingBackgroundJobSource).toBeDefined();
  expect(reduceServerEvent(pending, { type: "command.rejected", requestId: "rejected", payload: { message: "Missing" } }).pendingBackgroundJobSource).toBeUndefined();
});

test("committed deletion cancels a matching source request before its late response", () => {
  const assistantId = "assistant-1";
  const job = createBackgroundJobFixture({ id: "deleted-source-job", assistantId });
  const run = createBackgroundJobRunFixture({ id: "deleted-source-run", jobId: job.id });
  const pending = { ...createInitialViewState(), pendingBackgroundJobSource: {
    requestId: "late-source", kind: "run" as const, projectId: job.projectId, runId: run.id, jobId: job.id, assistantId: job.assistantId
  } };
  const deleted = reduceServerEvent(pending, { type: "background-jobs.deleted", requestId: "delete", payload: {
    targets: [{ kind: "assistant", assistantId }], deletedJobIds: [job.id]
  } });
  const afterLate = reduceServerEvent(deleted, { type: "background-job.source.loaded", requestId: "late-source", payload: { kind: "run", job, run } });
  expect(afterLate.pendingBackgroundJobSource).toBeUndefined();
  expect(afterLate.backgroundJobs.jobs).toEqual([]);
  expect(afterLate.backgroundJobs.runs).toEqual([]);
});
