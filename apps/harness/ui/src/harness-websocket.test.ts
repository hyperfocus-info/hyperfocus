import { beforeEach, expect, it } from "bun:test";
import {
  SERVER_EVENT_FRAME_MAX_BYTES,
  type BackgroundJob,
  type BackgroundJobRun,
  type CliSession,
  type ClientCommand,
  type ServerEvent
} from "@hyperfocus/ai-core/protocol";
import { createEmptyBackgroundJobsState, harnessStore, reduceServerEvent } from "./harness-store";
import {
  acceptsControlPong,
  hasLocalServerPreferenceOverride,
  authorizeTerminalEvent,
  getDemandedRunDetailScopes,
  getRuntimeResyncReconnectDelay,
  notifyBackgroundRun,
  ownsControlHeartbeat,
  parseServerEventData
} from "./harness-websocket";
import { createControlCommandQueue, restoreQueuedControlCommandOwnership } from "./control-command-queue";
import { openAgentRunSource, openBackgroundRunSource } from "./source-navigation";
import { toastStore } from "./toast-store";
import { acceptCliAttachRequest, acceptTerminalAttachRequest, claimTerminalReplayRetry, ownCliAttachRequest,
  ownCliStartingRequest, ownTerminalAttachRequest, ownTerminalCreatingAttachRequest, ownsSessionSocket, rejectCliAttachRequest,
  rejectTerminalAttachRequest, requestCliAttach, requestTerminalAttach, resetCliAttachRequests, resetTerminalAttachRequests,
  resetTerminalReplayRetry, revokeCliAttachRequest, revokeTerminalAttachRequest } from "./terminal/terminal-transport";
import { terminalStore } from "./terminal/terminal-store";
import { createAssistantFixture, createBackgroundJobFixture, createBackgroundJobRunFixture, createHarnessStateFixture, createRunFixture,
  createViewProjectFixture, defaultPreferencesFixture } from "./utils/tests/test-fixtures";
import { createUiTest } from "./utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "./utils/tests/store-test-utils";

function isoNow() {
  return new Date().toISOString();
}

it("backs runtime resync reconnects off to a stable cap", () => {
  expect([1, 2, 3, 4, 5, 10].map(getRuntimeResyncReconnectDelay))
    .toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);
});

it("demands run detail only for the selected project", () => {
  const selectedRun = createRunFixture({ id: "selected-detail", detailState: "summary" });
  const hiddenRun = createRunFixture({ id: "hidden-detail", detailState: "summary" });
  const selected = createViewProjectFixture({ id: "selected", activeRun: selectedRun, lastRun: selectedRun });
  const hidden = createViewProjectFixture({ id: "hidden", activeRun: hiddenRun, lastRun: hiddenRun });
  const scopes = getDemandedRunDetailScopes({ activeProjectId: selected.id, projects: [selected, hidden] });
  expect(scopes.map(({ run }) => run?.id)).toEqual([selectedRun.id]);
});

function createCliSession(id: string, projectId = "project", threadId = "thread"): CliSession {
  const now = isoNow();
  return { id, projectId, threadId, agentId: "codex-cli", cwd: "/workspace", status: "running",
    cols: 120, rows: 32, attachState: "attached", idleTimeoutMs: 60_000, startedAt: now, updatedAt: now };
}

function createBackgroundJob(): BackgroundJob {
  const now = isoNow();
  return {
    id: "bg-job-toast",
    projectId: "project-1",
    automationThreadId: "thread-1",
    kind: "ai-routine",
    name: "Nightly scan",
    status: "enabled",
    riskLevel: "safe",
    definition: {
      kind: "ai-routine",
      prompt: "Scan project",
      planExecutionMode: "immediate",
      subagentWorktreeStrategy: "same-worktree"
    },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function createBackgroundRun(overrides: Partial<BackgroundJobRun> = {}): BackgroundJobRun {
  const now = isoNow();
  return {
    id: "bg-run-toast",
    jobId: "bg-job-toast",
    projectId: "project-1",
    automationThreadId: "thread-1",
    triggerSource: "manual",
    status: "failed",
    riskLevel: "safe",
    approvalStatus: "not-needed",
    skippedOccurrenceCount: 0,
    failureMessage: "Exit code 1",
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
    events: [],
    ...overrides
  };
}

function readyEvent(assistants = createHarnessStateFixture().assistants): Extract<ServerEvent, { type: "connection.ready" }> {
  const state = createHarnessStateFixture();
  return { type: "connection.ready", payload: {
    agents: state.availableAgents, availableSkillPaths: state.availableSkillPaths, setup: state.setup,
    workspace: state.workspace, assistants, backgroundJobs: state.backgroundJobs,
    notifications: state.notifications, executionControl: state.executionControl, tokenUsage: state.tokenUsage,
    preferences: defaultPreferencesFixture
  } };
}

it("rejects oversized websocket text before attempting JSON parsing", () => {
  const oversizedInvalidJson = "{".repeat(SERVER_EVENT_FRAME_MAX_BYTES + 1);
  expect(() => parseServerEventData(oversizedInvalidJson)).toThrow("Server event frame exceeds");
});

it("ignores stale socket ownership and bounds replay recovery", () => {
  const oldSocket = {}, replacement = {}, owners = new Map([["session", replacement]]);
  expect(ownsSessionSocket(owners, "session", oldSocket)).toBe(false);
  expect(ownsSessionSocket(owners, "session", replacement)).toBe(true);
  const sessionId = `retry-${crypto.randomUUID()}`;
  expect([claimTerminalReplayRetry(sessionId), claimTerminalReplayRetry(sessionId),
    claimTerminalReplayRetry(sessionId)]).toEqual([true, true, false]);
  resetTerminalReplayRetry(sessionId);
  expect(claimTerminalReplayRetry(sessionId)).toBe(true);
});

it("does not authorize a terminal attach rejected during command admission", () => {
  const sessionId = `admission-${crypto.randomUUID()}`, requestId = "not-admitted";
  expect(requestTerminalAttach(() => false, { requestId, projectId: "project", sessionId })).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, requestId)).toBe(false);
});

it("keeps terminal attach rejection and success scoped to the latest request", () => {
  const sessionId = `attach-${crypto.randomUUID()}`;
  ownTerminalAttachRequest(sessionId, "old"); ownTerminalAttachRequest(sessionId, "current");
  expect(rejectTerminalAttachRequest("old")).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, "old")).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, "current")).toBe(true);
  expect(rejectTerminalAttachRequest("current")).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, "ownerless-stale")).toBe(false);
  ownTerminalCreatingAttachRequest("create");
  expect(acceptTerminalAttachRequest("created-session", "create")).toBe(true);
  expect(acceptTerminalAttachRequest("created-session", "create")).toBe(false);
  ownTerminalAttachRequest(sessionId, "lost-on-close"); terminalStore.setTransportStatus(sessionId, "connecting");
  resetTerminalAttachRequests();
  expect(terminalStore.state.transportStatusBySessionId[sessionId]).toBe("disconnected");
  expect(acceptTerminalAttachRequest(sessionId, "lost-on-close")).toBe(false);
});

it("rejects stale attach-ready before it can replace terminal output", () => {
  const sessionId = `stale-ready-${crypto.randomUUID()}`;
  terminalStore.appendOutput(sessionId, "current output"); ownTerminalAttachRequest(sessionId, "latest");
  if (acceptTerminalAttachRequest(sessionId, "stale")) terminalStore.applyServerEvent({
    type: "terminal.session.attach-ready", requestId: "stale", payload: { sessionId, snapshot: "stale output",
      attachToken: { token: "0123456789abcdef", sessionId, clientId: "client", expiresAt: isoNow() } }
  });
  expect(terminalStore.state.outputBySessionId[sessionId]).toBe("current output");
});

it("filters a stale attach-ready without dropping later batched events", () => {
  const sessionId = `mixed-${crypto.randomUUID()}`; ownTerminalAttachRequest(sessionId, "current");
  const stale: ServerEvent = { type: "terminal.session.attach-ready", requestId: "stale", payload: { sessionId, snapshot: "stale",
    attachToken: { token: "0123456789abcdef", sessionId, clientId: "client", expiresAt: isoNow() } } };
  const pong: ServerEvent = { type: "connection.pong", requestId: "pong", payload: { timestamp: Date.now() } };
  expect([stale, pong].filter(authorizeTerminalEvent)).toEqual([pong]);
});

it("defensively rejects mismatched attach token session ownership", () => {
  const sessionId = `outer-${crypto.randomUUID()}`; ownTerminalAttachRequest(sessionId, "request");
  const mismatch: ServerEvent = { type: "terminal.session.attach-ready", requestId: "request", payload: { sessionId,
    snapshot: "wrong", attachToken: { token: "0123456789abcdef", sessionId: "other", clientId: "client", expiresAt: isoNow() } } };
  expect(authorizeTerminalEvent(mismatch)).toBe(false);
  expect(terminalStore.state.outputBySessionId[sessionId]).toBeUndefined();
  expect(acceptTerminalAttachRequest(sessionId, "request")).toBe(true);
});

it("keeps CLI start and attach-ready ownership exact", () => {
  const sessionId = `cli-${crypto.randomUUID()}`;
  ownCliStartingRequest("start", "project", "thread");
  const startReady: ServerEvent = { type: "cli-session.attach-ready", requestId: "start", payload: { projectId: "project", threadId: "thread", sessionId,
    attachToken: { token: "0123456789abcdef", sessionId, clientId: "client", expiresAt: isoNow() } } };
  expect(authorizeTerminalEvent({ ...startReady, payload: { ...startReady.payload, projectId: "wrong" } })).toBe(false);
  expect(authorizeTerminalEvent(startReady)).toBe(true);
  ownCliAttachRequest(sessionId, "latest", "project", "thread");
  const stale: ServerEvent = { type: "cli-session.attach-ready", requestId: "start", payload: { projectId: "project", threadId: "thread", sessionId,
    attachToken: { token: "0123456789abcdef", sessionId, clientId: "client", expiresAt: isoNow() } } };
  const latest: ServerEvent = { type: "cli-session.attach-ready", requestId: "latest", payload: { projectId: "project", threadId: "thread", sessionId,
    attachToken: { token: "0123456789abcdef", sessionId, clientId: "client", expiresAt: isoNow() } } };
  const mismatched: ServerEvent = { ...stale, requestId: "latest", payload: { ...stale.payload, projectId: "wrong" } };
  expect(authorizeTerminalEvent(stale)).toBe(false);
  expect(authorizeTerminalEvent(mismatched)).toBe(false);
  expect(authorizeTerminalEvent(latest)).toBe(true);
  expect(authorizeTerminalEvent(latest)).toBe(false);
});

it("always accepts broadcast CLI lifecycle while binding only the requesting owner", () => {
  const session = createCliSession(`cli-broadcast-${crypto.randomUUID()}`);
  const event: ServerEvent = { type: "cli-session.started", requestId: "remote-request",
    payload: { projectId: session.projectId, threadId: session.threadId, session } };
  expect(authorizeTerminalEvent(event)).toBe(true);
  expect(acceptCliAttachRequest({ sessionId: session.id, requestId: "remote-request",
    projectId: session.projectId, threadId: session.threadId })).toBe(false);
  ownCliStartingRequest("local-request", session.projectId, session.threadId);
  expect(authorizeTerminalEvent({ ...event, requestId: "local-request" })).toBe(true);
  expect(authorizeTerminalEvent({ ...event, requestId: "local-request",
    payload: { ...event.payload, session: createCliSession("remote-session") } })).toBe(true);
  expect(acceptCliAttachRequest({ sessionId: session.id, requestId: "local-request",
    projectId: session.projectId, threadId: session.threadId })).toBe(true);
});

it("defensively ignores cross-scope CLI lifecycle events", () => {
  const project = createViewProjectFixture();
  const state = createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id } });
  const session = createCliSession("cross-scope", "other-project", "other-thread");
  for (const type of ["cli-session.updated", "cli-session.exited"] as const) {
    const hostile = { type, requestId: "hostile", payload: { projectId: state.workspace.projects[0]!.id,
      threadId: state.workspace.projects[0]!.activeThreadId, session } };
    expect(Reflect.apply(reduceServerEvent, undefined, [state, hostile])).toBe(state);
  }
});

it("revokes rejected and disconnected CLI owners before stale responses", () => {
  const sessionId = `cli-reset-${crypto.randomUUID()}`;
  expect(requestCliAttach(() => false, { requestId: "not-admitted", projectId: "project", threadId: "thread", sessionId })).toBe(false);
  expect(acceptCliAttachRequest({ sessionId, requestId: "not-admitted", projectId: "project", threadId: "thread" })).toBe(false);
  ownCliAttachRequest(sessionId, "rejected", "project", "thread");
  expect(rejectCliAttachRequest("rejected")).toBe(sessionId);
  expect(acceptCliAttachRequest({ sessionId, requestId: "rejected", projectId: "project", threadId: "thread" })).toBe(false);
  ownCliAttachRequest(sessionId, "lost", "project", "thread");
  expect(resetCliAttachRequests()).toContain(sessionId);
  expect(acceptCliAttachRequest({ sessionId, requestId: "lost", projectId: "project", threadId: "thread" })).toBe(false);
});

it("deduplicates queued CLI attaches and restores only the latest authority after send", () => {
  const queue = createControlCommandQueue(10), sent: string[] = [], sessionId = `cli-queued-${crypto.randomUUID()}`;
  queue.enqueue({ type: "cli-session.attach", requestId: "old", payload: { projectId: "project", threadId: "thread", sessionId } });
  ownCliAttachRequest(sessionId, "old", "project", "thread");
  queue.enqueue({ type: "cli-session.stop", requestId: "stop", payload: { projectId: "project", threadId: "thread", sessionId } });
  queue.enqueue({ type: "cli-session.attach", requestId: "latest", payload: { projectId: "project", threadId: "thread", sessionId } },
    (command) => revokeCliAttachRequest(command.requestId));
  queue.markServerReady();
  queue.flush((command) => { sent.push(command.requestId); return true; }, (command) =>
    restoreQueuedControlCommandOwnership(command, harnessStore.actions, {
      ownSession: () => undefined,
      ownCreating: () => undefined,
      ownCliSession: (ownedSessionId, requestId, projectId, threadId) =>
        ownCliAttachRequest(ownedSessionId, requestId, projectId, threadId)
    }));
  expect(sent).toEqual(["stop", "latest"]);
  expect(acceptCliAttachRequest({ sessionId, requestId: "old", projectId: "project", threadId: "thread" })).toBe(false);
  expect(acceptCliAttachRequest({ sessionId, requestId: "latest", projectId: "project", threadId: "thread" })).toBe(true);
});

it("deduplicates queued terminal owners and restores authority only when sent", () => {
  const queue = createControlCommandQueue(10), sent: ClientCommand[] = [], owned: string[] = [];
  queue.enqueue({ type: "terminal.session.attach", requestId: "old", payload: { projectId: "project", sessionId: "session" } });
  queue.enqueue({ type: "terminal.session.attach", requestId: "latest", payload: { projectId: "project", sessionId: "session" } });
  queue.enqueue({ type: "terminal.session.create", requestId: "create", payload: { projectId: "project", cols: 80, rows: 24 } });
  queue.enqueue({ type: "terminal.session.restart", requestId: "restart", payload: { projectId: "project", sessionId: "session", cols: 80, rows: 24 } });
  queue.markServerReady();
  queue.flush((command) => { sent.push(command); return true; }, (command) =>
    restoreQueuedControlCommandOwnership(command, harnessStore.actions, {
      ownSession: (sessionId, requestId) => owned.push(`${sessionId}:${requestId}`),
      ownCreating: (requestId) => owned.push(requestId)
    }));
  expect(sent.map((command) => command.requestId)).toEqual(["latest", "create", "restart"]);
  expect(owned).toEqual(["session:latest", "create", "restart"]);
});

it("revokes superseded restart owners and preserves intervening command order", () => {
  const queue = createControlCommandQueue(10), sent: string[] = [], sessionId = `restart-${crypto.randomUUID()}`;
  queue.enqueue({ type: "terminal.session.restart", requestId: "old", payload: { projectId: "project", sessionId, cols: 80, rows: 24 } });
  ownTerminalCreatingAttachRequest("old");
  queue.enqueue({ type: "terminal.session.stop", requestId: "stop", payload: { projectId: "project", sessionId } });
  for (let index = 0; index < 100; index += 1) {
    const requestId = `new-${index}`;
    queue.enqueue({ type: "terminal.session.restart", requestId, payload: { projectId: "project", sessionId, cols: 80, rows: 24 } },
      (command) => revokeTerminalAttachRequest(command.requestId));
    ownTerminalCreatingAttachRequest(requestId);
  }
  queue.markServerReady();
  queue.flush((command) => { sent.push(command.requestId); return true; }, () => undefined);
  expect(sent).toEqual(["stop", "new-99"]);
  expect(acceptTerminalAttachRequest(sessionId, "old")).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, "new-0")).toBe(false);
  expect(acceptTerminalAttachRequest(sessionId, "new-99")).toBe(true);
});

it("keeps pong and heartbeat work owned by the exact ready socket epoch", () => {
  const oldSocket = {}, replacement = {};
  expect(acceptsControlPong(false)).toBe(false);
  expect(acceptsControlPong(true)).toBe(true);
  expect(ownsControlHeartbeat(replacement, oldSocket, 2, 1)).toBe(false);
  expect(ownsControlHeartbeat(replacement, replacement, 2, 2)).toBe(true);
});

createUiTest("connectHarnessWebSocket reconnect queue", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    seedHarnessStoreForTests(createHarnessStateFixture());
  });

  it("waits for connection ready before flushing queued reads and mutations with renewed ownership", () => {
    const queue = createControlCommandQueue(100);
    const sent: ClientCommand[] = [];
    const assistant = createAssistantFixture({ id: "assistant-1" });
    const assistants = { ...harnessStore.state.assistants, assistants: [assistant], selectedAssistantId: assistant.id };
    const job = createBackgroundJobFixture({ id: "queued-job", assistantId: "assistant-1" });
    const run = createBackgroundJobRunFixture({ id: "queued-run", jobId: job.id, projectId: job.projectId,
      assistantId: job.assistantId });
    harnessStore.actions.startAssistantWorkloadRequest("assistant-1", "runs", { id: "queued-workload" });
    queue.enqueue({ type: "assistant.workloads.list", requestId: "queued-workload",
      payload: { assistantId: "assistant-1", runs: { limit: 60 } } });
    harnessStore.actions.startBackgroundJobSourceRequest({ requestId: "queued-source", kind: "run",
      projectId: run.projectId, runId: run.id, jobId: job.id, assistantId: job.assistantId });
    queue.enqueue({ type: "background-job.source.open", requestId: "queued-source",
      payload: { kind: "run", projectId: run.projectId, runId: run.id } });
    queue.enqueue({ type: "notifications.mark-all-read", requestId: "queued-mutation" });
    queue.enqueue({ type: "assistant.detail.get", requestId: "queued-detail",
      payload: { assistantId: "assistant-1" } });
    harnessStore.actions.restoreQueuedAssistantDetailRequest(assistant.id, "queued-detail");
    harnessStore.actions.markAssistantDetailRequestQueued(assistant.id, "queued-detail");

    queue.flush((command) => { sent.push(command); return true; }, () => undefined);
    expect(sent).toEqual([]);

    harnessStore.applyServerEvent(readyEvent(assistants));
    expect(harnessStore.state.assistants.pendingDetailRequestByAssistantId[assistant.id]).toBe("queued-detail");
    queue.markServerReady();
    queue.flush((command) => { sent.push(command); return true; },
      (command) => restoreQueuedControlCommandOwnership(command, harnessStore.actions));
    expect(sent.map((command) => command.type)).toEqual([
      "assistant.workloads.list", "background-job.source.open", "notifications.mark-all-read", "assistant.detail.get"
    ]);
    expect(harnessStore.state.assistants.workloadPagesByAssistantId["assistant-1"]?.runs.request?.id).toBe("queued-workload");
    expect(harnessStore.state.pendingBackgroundJobSource?.requestId).toBe("queued-source");
    expect(harnessStore.state.assistants.pendingDetailRequestByAssistantId["assistant-1"]).toBe("queued-detail");

    harnessStore.applyServerEvent({ type: "assistant.workloads.listed", requestId: "queued-workload",
      payload: { assistantId: "assistant-1", runs: { items: [run] } } });
    harnessStore.applyServerEvent({ type: "background-job.source.loaded", requestId: "queued-source", payload: { kind: "run", job, run } });
    harnessStore.applyServerEvent({ type: "notifications.updated", requestId: "queued-mutation", payload: {
      notifications: harnessStore.state.notifications } });
    expect(harnessStore.state.assistants.runs.map((entry) => entry.id)).toEqual([run.id]);
    expect(harnessStore.state.jobsPanePreferences.selectedRunId).toBe(run.id);
    expect(harnessStore.state.pendingBackgroundJobSource).toBeUndefined();
  });

  it("preserves and exactly resolves a selected assistant beyond the reconnect summary window", () => {
    const assistants = Array.from({ length: 513 }, (_, index) => createAssistantFixture({ id: `assistant-${index}`, scope: "global" }));
    const selected = assistants[512]!;
    seedHarnessStoreForTests(createHarnessStateFixture({ assistants: { ...harnessStore.state.assistants,
      assistants, selectedAssistantId: selected.id, loadedDetailAssistantIds: [selected.id], scopeFilter: "global" } }));
    const commands: ClientCommand[] = [];
    captureDispatchedCommands(commands);
    const releaseDemand = harnessStore.actions.registerAssistantDetailDemand();
    expect(harnessStore.state.assistants.selectedAssistantId).toBe(selected.id);

    harnessStore.applyServerEvent(readyEvent({ ...harnessStore.state.assistants, assistants: assistants.slice(0, 512),
      threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] }));

    expect(harnessStore.state.assistants.selectedAssistantId).toBe(selected.id);
    expect(harnessStore.state.assistants.provisionalReconnectAssistantIds).toEqual([selected.id]);
    const detailRequest = commands.find((command): command is Extract<ClientCommand, { type: "assistant.detail.get" }> =>
      command.type === "assistant.detail.get");
    expect(detailRequest?.payload.assistantId).toBe(selected.id);

    harnessStore.actions.startAssistantRosterRequest({ id: "tail-page", cursor: "page-2" });
    harnessStore.applyServerEvent({ type: "assistant.summary.listed", requestId: "tail-page", payload: {
      assistants: { items: [selected], totalApprox: 513 } } });
    expect(harnessStore.state.assistants.selectedAssistantId).toBe(selected.id);
    expect(harnessStore.state.assistants.provisionalReconnectAssistantIds).toEqual([]);

    harnessStore.applyServerEvent(readyEvent({ ...harnessStore.state.assistants, assistants: assistants.slice(0, 512),
      threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] }));
    const missingRequest = commands.filter((command) => command.type === "assistant.detail.get").at(-1);
    if (!missingRequest) throw new Error("Missing exact reconnect detail request");
    harnessStore.applyServerEvent({ type: "command.rejected", requestId: missingRequest.requestId,
      payload: { message: `Unknown assistant: ${selected.id}` } });
    expect(harnessStore.state.assistants.assistants.some(({ id }) => id === selected.id)).toBe(false);
    expect(harnessStore.state.assistants.selectedAssistantId).not.toBe(selected.id);
    releaseDemand();
  });

  it("owns bounded workspace bootstrap pages while keeping older messages demand-driven", () => {
    const active = { ...createViewProjectFixture({ id: "project-active" }), filePathsNextCursor: "files-2",
      threadsNextCursor: "threads-2",
      messagesNextCursor: "messages-2", runSummariesNextCursor: "runs-2" };
    const tail = createViewProjectFixture({ id: "project-tail" });
    const commands: ClientCommand[] = [];
    captureDispatchedCommands(commands);
    const ready = readyEvent();
    harnessStore.applyServerEvent({ ...ready, payload: { ...ready.payload, workspace: {
      activeProjectId: active.id, projects: [active], projectsNextCursor: "projects-2" } } });

    const catalog = commands.find((command) => command.type === "workspace.projects.list");
    const children = commands.find((command) => command.type === "workspace.projectChildren.list");
    expect(catalog?.payload.cursor).toBe("projects-2");
    expect(children?.payload).toEqual({ projectId: active.id,
      filePaths: { cursor: "files-2", limit: 512 },
      threads: { cursor: "threads-2", limit: 256 },
      runSummaries: { threadId: active.activeThreadId, cursor: "runs-2", limit: 128 } });
    harnessStore.applyServerEvent({ type: "workspace.projects.listed", requestId: "stale", payload: {
      projects: { items: [tail] } } });
    expect(harnessStore.state.workspace.projects.some(({ id }) => id === tail.id)).toBe(false);
    if (!catalog || !children) throw new Error("Missing workspace hydration commands");
    harnessStore.applyServerEvent({ type: "workspace.projects.listed", requestId: catalog.requestId, payload: {
      projects: { items: [tail] } } });
    expect(harnessStore.state.workspace.projects.map(({ id }) => id)).toEqual([active.id, tail.id]);

    harnessStore.applyServerEvent({ type: "workspace.projectChildren.listed", requestId: children.requestId, payload: {
      collections: ["filePaths", "threads", "runSummaries"], projectId: active.id,
      filePaths: { items: ["src/older.ts"] }, threads: { items: [] },
      runSummaries: { threadId: active.activeThreadId, page: { items: [] } } } });
    expect(harnessStore.state.workspace.projects[0]?.session.messages).toEqual(active.session.messages);
    expect(harnessStore.state.workspace.projects[0]?.messagesNextCursor).toBe("messages-2");
    expect(harnessStore.state.workspace.projects[0]?.filePaths).toEqual(["src/older.ts"]);
  });

  it("refuses the 101st command without dropping the configured 100 accepted commands", () => {
    const queue = createControlCommandQueue(100);
    const command = (requestId: string): ClientCommand => ({ type: "notifications.mark-all-read", requestId });
    for (let index = 0; index < 100; index += 1) expect(queue.enqueue(command(`accepted-${index}`))).toBe(true);
    expect(queue.enqueue(command("overflow"))).toBe(false);
    const sent: string[] = [];
    queue.markServerReady();
    queue.flush((entry) => { sent.push(entry.requestId); return true; }, () => undefined);
    expect(sent).toEqual(Array.from({ length: 100 }, (_, index) => `accepted-${index}`));
  });

  it("lets source navigation clear ownership when queue admission fails", () => {
    harnessStore.actions.setCommandDispatcher(() => { throw new Error("Reconnect command queue is full; command was not accepted"); });
    const sent = openBackgroundRunSource(harnessStore.state,
      { projectId: "project-1", jobId: "job-1", runId: "run-overflow" }, harnessStore.actions.sendCommand);
    expect(sent).toBe(false);
    expect(harnessStore.state.pendingBackgroundJobSource).toBeUndefined();
    expect(toastStore.toasts.at(-1)?.description).toContain("queue is full");
  });

  it("keeps direct caller state recoverable when reconnect admission overflows", () => {
    const project = createViewProjectFixture({ id: "overflow-project", activeThreadId: "overflow-thread" });
    const retryCommand: ClientCommand = { type: "chat.send", requestId: "blocked-chat", payload: {
      projectId: project.id, threadId: project.activeThreadId, agentId: "pi", content: "Retry me" } };
    seedHarnessStoreForTests(createHarnessStateFixture({ activeSurface: "background-jobs", activeLeftTab: "runs",
      workspace: { activeProjectId: project.id, projects: [project] }, lastActiveProjectId: project.id,
      lastActiveThreadByProjectId: { [project.id]: project.activeThreadId }, tokenUsageResetDialogOpen: true,
      blockingNonGitPreflight: { requestId: retryCommand.requestId, projectId: project.id,
        threadId: project.activeThreadId, preflight: { severity: "blocking", kind: "git-not-repo",
          message: "Git is required", changedFileCount: 0, repairSummary: "Initialize git." }, command: retryCommand },
      pendingPreflightRepairKind: "git-init" }));
    harnessStore.actions.setCommandDispatcher(() => { throw new Error("Reconnect command queue is full; command was not accepted"); });

    harnessStore.setActiveLeftTab("projects");
    harnessStore.resetTokenUsage();
    harnessStore.applyServerEvent({ type: "project.git.initialized", requestId: "git-ready", payload: {
      projectId: project.id, rootPath: project.rootPath, initialized: true, baselineCommitCreated: true } });

    expect(harnessStore.state.tokenUsageResetDialogOpen).toBe(true);
    expect(harnessStore.state.blockingNonGitPreflight?.requestId).toBe(retryCommand.requestId);
    expect(harnessStore.state.pendingPreflightRepairKind).toBe("git-init");
    expect(Object.values(harnessStore.state.pendingPreflightCommands).filter(Boolean)).toEqual([]);
    expect(toastStore.toasts.at(-1)?.description).toContain("queue is full");
  });
});

createUiTest("notifyBackgroundRun", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("routes status toast clicks to the selected background run", () => {
    const job = createBackgroundJob();
    const run = createBackgroundRun();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeSurface: "chat",
        activeLeftTab: "projects",
        jobsRunFilter: "done",
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );

    notifyBackgroundRun(run.id);

    expect(toastStore.toasts[0]).toMatchObject({
      title: "Background task failed",
      description: "Nightly scan | Exit code 1",
      tone: "error"
    });

    toastStore.toasts[0]?.onClick?.();

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.jobsRunFilter).toBe("failed");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedJobId: job.id,
      selectedRunId: run.id,
      selectedNotificationId: undefined
    });
  });

  it("routes linked agent run source clicks to the background run without activating automation chat", () => {
    const job = createBackgroundJob();
    const run = createBackgroundRun({
      linkedAgentRunId: "agent-run-1",
      automationThreadId: "thread-auto"
    });
    const commands: ClientCommand[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeSurface: "chat",
        activeLeftTab: "projects",
        workspace: {
          activeProjectId: "project-1",
          projects: [
            createViewProjectFixture({
              id: "project-1",
              activeThreadId: "thread-user",
              threads: [
                {
                  id: "thread-user",
                  kind: "user",
                  status: "active",
                  pinned: false,
                  title: "User thread",
                  titleSource: "generated",
                  badgeState: "idle",
                  messageCount: 0,
                  updatedAt: isoNow()
                },
                {
                  id: "thread-auto",
                  kind: "automation",
                  status: "active",
                  pinned: false,
                  title: "Nightly scan",
                  titleSource: "custom",
                  badgeState: "idle",
                  messageCount: 0,
                  updatedAt: isoNow()
                }
              ]
            })
          ]
        },
        backgroundJobs: {
          ...createEmptyBackgroundJobsState(),
          jobs: [job],
          runs: [run]
        }
      })
    );
    captureDispatchedCommands(commands);

    openAgentRunSource(harnessStore.state, "project-1", createRunFixture({ id: "agent-run-1", threadId: "thread-auto" }), "run");

    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.workspace.projects[0]?.activeThreadId).toBe("thread-user");
    expect(commands.map((command) => command.type)).not.toContain("thread.activate");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "inbox",
      selectedJobId: job.id,
      selectedRunId: run.id
    });
  });
});

createUiTest("hasLocalServerPreferenceOverride", () => {
  it("syncs browser-local background approval defaults back to the server", () => {
    expect(
      hasLocalServerPreferenceOverride(
        { backgroundJobApprovalPolicyDefault: "allow-all" },
        { ...defaultPreferencesFixture, backgroundJobApprovalPolicyDefault: "ask-risky" }
      )
    ).toBe(true);

    expect(
      hasLocalServerPreferenceOverride(
        { backgroundJobApprovalPolicyDefault: "allow-all" },
        { ...defaultPreferencesFixture, backgroundJobApprovalPolicyDefault: "allow-all" }
      )
    ).toBe(false);

    expect(
      hasLocalServerPreferenceOverride(
        { assistantAutoApproveNonBlockingQuestionsDefault: false },
        { ...defaultPreferencesFixture, assistantAutoApproveNonBlockingQuestionsDefault: true }
      )
    ).toBe(true);

    expect(
      hasLocalServerPreferenceOverride(
        { assistantAutoApproveNonBlockingQuestionsDefault: false },
        { ...defaultPreferencesFixture, assistantAutoApproveNonBlockingQuestionsDefault: false }
      )
    ).toBe(false);

    expect(
      hasLocalServerPreferenceOverride(
        { maxBackgroundJobsDefault: 25 },
        { ...defaultPreferencesFixture, maxBackgroundJobsDefault: 10 }
      )
    ).toBe(true);

    expect(
      hasLocalServerPreferenceOverride(
        { maxBackgroundJobsDefault: 10 },
        { ...defaultPreferencesFixture, maxBackgroundJobsDefault: 10 }
      )
    ).toBe(false);
  });
});
