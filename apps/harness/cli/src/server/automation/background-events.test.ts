import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BACKGROUND_JOB_DELETION_CHUNK_LIMIT, createAssistantId, createBackgroundJobId, createProjectId, createThreadId,
  parseServerEventFrame, type BackgroundJob } from "@hyperfocus/ai-core/protocol";
import type { BackgroundRunControl, HarnessConnection } from "../core/contracts";
import { controlEventBatcher } from "../transport/events";
import type { ControlEventSocket } from "../transport/events";
import { resolveHarnessTestTempRoot } from "../../test-support/test-temp-root";
import { createWorkspaceRepository } from "../../workspace-repository";
import { createWorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { commitAssistantDeletion, commitBackgroundJobDeletion, commitProjectDeletion, stopBackgroundRunsForJob } from "./background-run-cancellation";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsDeletedToAll,
  emitBackgroundJobsUpdatedToAll } from "./background-events";
import { assistantChatPumps, discardAssistantChatPumps, emitAssistantChatFailedToAll, emitAssistantChatMessageAppendedToAll,
  getAssistantChatPump } from "./assistant-actions";

function createSocket(kind: HarnessConnection["kind"]) {
  const sent: string[] = [];
  const socket: ControlEventSocket = {
    data: { clientId: `${kind}-client`, clientKind: "native", kind },
    send(data: string | Uint8Array) {
      if (typeof data === "string") sent.push(data);
      return 1;
    },
    close() {}
  };
  return { socket, sent };
}

test("deletion chunks and authoritative snapshot stay ordered on control sockets only", () => {
  const control = createSocket("control");
  const pty = createSocket("pty");
  const terminal = createSocket("terminal");
  const connections = new Set([control.socket, pty.socket, terminal.socket]);
  const deletedJobIds = Array.from({ length: BACKGROUND_JOB_DELETION_CHUNK_LIMIT + 1 }, (_, index) => `job-${index}`);

  emitBackgroundJobsDeletedToAll(connections, "delete-many", [{ kind: "project", projectId: "project-1" }], deletedJobIds);
  emitBackgroundJobsUpdatedToAll(connections, { jobs: [], runs: [], templates: [] });
  controlEventBatcher.flush(control.socket);

  expect(pty.sent).toHaveLength(0);
  expect(terminal.sent).toHaveLength(0);
  expect(control.sent).toHaveLength(1);
  const events = parseServerEventFrame(JSON.parse(control.sent[0]!));
  expect(events.map((event) => event.type)).toEqual([
    "background-jobs.deleted", "background-jobs.deleted", "background-jobs.updated"
  ]);
  const deletionEvents = events.filter((event) => event.type === "background-jobs.deleted");
  expect(deletionEvents.map((event) => event.payload.deletedJobIds.length)).toEqual([
    BACKGROUND_JOB_DELETION_CHUNK_LIMIT, 1
  ]);
  expect(deletionEvents.flatMap((event) => event.payload.deletedJobIds)).toEqual(deletedJobIds);
});

test("background run updates publish synchronously", () => {
  const control = createSocket("control");
  const { repository, project, job } = deletionFixture();
  const run = repository.createBackgroundJobRun({ jobId: job.id, projectId: project.id,
    automationThreadId: job.automationThreadId, triggerSource: "manual", status: "queued", riskLevel: "safe",
    approvalStatus: "not-needed" });

  expect(emitBackgroundJobRunUpdatedToAll(new Set([control.socket]), run)).toBeUndefined();
  controlEventBatcher.flush(control.socket);
  const events = parseServerEventFrame(JSON.parse(control.sent[0]!));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "background-job-run.updated", payload: { run: { id: run.id } } });
});

function controlledRun() {
  let settle!: () => void;
  const control: BackgroundRunControl = { abortController: new AbortController(), controllerInstanceId: "controller-1",
    controllerLeaseId: "lease-1", settled: new Promise<void>((resolve) => { settle = resolve; }) };
  return { control, settle };
}

describe("committed background deletion lifecycle", () => {
  test("a stopped control remains registered so a later delete waits for launcher settlement", async () => {
    const { repository, project, job } = deletionFixture();
    const run = repository.createBackgroundJobRun({ jobId: job.id, projectId: project.id,
      automationThreadId: job.automationThreadId, triggerSource: "manual", status: "running", riskLevel: "safe",
      approvalStatus: "approved" });
    const { control, settle } = controlledRun();
    const controllers = new Map([[run.id, control]]);
    const socket = createSocket("control").socket;
    await stopBackgroundRunsForJob({ ws: socket, requestId: "stop-then-delete", repository,
      runtime: createWorkspaceRuntimeStore(repository.loadWorkspace()), connections: new Set(),
      backgroundRunControllers: controllers, jobId: job.id, reason: "Stopped before deletion" });
    expect(control.abortController.signal.aborted).toBe(true);
    expect(controllers.has(run.id)).toBe(true);

    let completed = false;
    const deletion = commitBackgroundJobDeletion({ repository,
      runtime: { abortRun: () => {}, clearProjectTransients: () => {}, hasProject: () => false,
        upsertPersistedProject: () => {} }, backgroundRunControllers: controllers,
      projectId: project.id, jobId: job.id }).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    settle();
    await deletion;
    expect(controllers.has(run.id)).toBe(false);
  });

  test("waits for deleted controls to settle and leaves them live when persistence fails", async () => {
    const projectId = createProjectId();
    const { control, settle } = controlledRun();
    const controllers = new Map([["run-1", control]]);
    let completed = false;
    const deletion = commitBackgroundJobDeletion({
      repository: { deleteBackgroundJob: () => ({ deletedJobIds: ["job-1"], deletedRunIds: ["run-1"], linkedAgentRuns: [] }),
        getProject: () => { throw new Error("unmounted"); } },
      runtime: { abortRun: () => {}, clearProjectTransients: () => {}, hasProject: () => false, upsertPersistedProject: () => {} },
      backgroundRunControllers: controllers, projectId, jobId: "job-1"
    }).then(() => { completed = true; });
    await Promise.resolve();
    expect(control.abortController.signal.aborted).toBe(true);
    expect(completed).toBe(false);
    settle();
    await deletion;
    expect(controllers.has("run-1")).toBe(false);

    const failed = controlledRun();
    const failedControllers = new Map([["run-2", failed.control]]);
    await expect(commitProjectDeletion({ repository: { removeProject: () => { throw new Error("disk write failed"); } },
      runtime: { removeProject: () => {} }, backgroundRunControllers: failedControllers, projectId })).rejects.toThrow("disk write failed");
    expect(failed.control.abortController.signal.aborted).toBe(false);
    failed.settle();
  });

  test("removes project runtime only after its run settles", async () => {
    const projectId = createProjectId();
    const { control, settle } = controlledRun();
    let removed = false;
    const postCommitIds: string[][] = [];
    const deletion = commitProjectDeletion({
      repository: { removeProject: () => ({ activeProjectId: undefined, deletedAssistantIds: ["assistant-1"], deletedJobIds: ["job-1"], deletedRunIds: ["run-1"] }) },
      runtime: { removeProject: () => { removed = true; } }, backgroundRunControllers: new Map([["run-1", control]]), projectId,
      afterCommit: (ids) => postCommitIds.push(ids)
    });
    await Promise.resolve();
    expect(removed).toBe(false);
    expect(postCommitIds).toEqual([["assistant-1"]]);
    settle();
    await deletion;
    expect(removed).toBe(true);
  });

  test("committed job deletion quiesces controls despite every runtime reconciliation failure", async () => {
    const projectId = createProjectId();
    const { control, settle } = controlledRun();
    const controllers = new Map([["run-1", control]]);
    const calls: string[] = [];
    let completed = false;
    const deletion = commitBackgroundJobDeletion({
      repository: {
        deleteBackgroundJob: () => ({ deletedJobIds: ["job-1"], deletedRunIds: ["run-1"],
          linkedAgentRuns: [{ projectId, runId: "agent-1", threadId: "thread-1" }] }),
        getProject: () => { calls.push("rehydrate"); throw new Error("rehydration failed"); }
      },
      runtime: {
        abortRun: () => { calls.push("abort"); throw new Error("abort failed"); },
        clearProjectTransients: () => { calls.push("clear"); throw new Error("clear failed"); },
        hasProject: () => true,
        upsertPersistedProject: () => { calls.push("upsert"); }
      },
      backgroundRunControllers: controllers, projectId, jobId: "job-1"
    }).then(() => { completed = true; });

    expect(control.abortController.signal.aborted).toBe(true);
    expect(calls).toEqual(["abort", "clear", "rehydrate"]);
    await Promise.resolve();
    expect(completed).toBe(false);
    settle();
    await deletion;
    expect(controllers.has("run-1")).toBe(false);
  });

  test("committed assistant and project deletions cannot be rejected by runtime reconciliation", async () => {
    const projectId = createProjectId();
    const assistantControl = controlledRun();
    const assistantControllers = new Map([["assistant-run", assistantControl.control]]);
    const assistantDeletion = commitAssistantDeletion({
      repository: {
        deleteAssistant: () => ({ deletedJobIds: ["assistant-job"], deletedRunIds: ["assistant-run"],
          linkedAgentRuns: [{ projectId, runId: "agent-1", threadId: "thread-1" }] }),
        getProject: () => { throw new Error("rehydration failed"); }
      },
      runtime: { abortRun: () => { throw new Error("abort failed"); },
        clearProjectTransients: () => { throw new Error("clear failed"); }, hasProject: () => true,
        upsertPersistedProject: () => { throw new Error("upsert failed"); } },
      backgroundRunControllers: assistantControllers, assistantId: "assistant-1"
    });
    expect(assistantControl.control.abortController.signal.aborted).toBe(true);
    assistantControl.settle();
    expect((await assistantDeletion).deletedJobIds).toEqual(["assistant-job"]);
    expect(assistantControllers.has("assistant-run")).toBe(false);

    const projectControl = controlledRun();
    const projectControllers = new Map([["project-run", projectControl.control]]);
    const projectDeletion = commitProjectDeletion({
      repository: { removeProject: () => ({ activeProjectId: undefined, deletedAssistantIds: [], deletedJobIds: ["project-job"],
        deletedRunIds: ["project-run"] }) },
      runtime: { removeProject: () => { throw new Error("runtime removal failed"); } },
      backgroundRunControllers: projectControllers, projectId
    });
    expect(projectControl.control.abortController.signal.aborted).toBe(true);
    projectControl.settle();
    expect((await projectDeletion).deletedJobIds).toEqual(["project-job"]);
    expect(projectControllers.has("project-run")).toBe(false);
  });

  test("assistant deletion runs post-commit cancellation before background settlement", async () => {
    const control = controlledRun();
    const order: string[] = [];
    const deletion = commitAssistantDeletion({ repository: { deleteAssistant: () => {
      order.push("commit"); return { deletedJobIds: [], deletedRunIds: ["run"], linkedAgentRuns: [] }; },
      getProject: () => { throw new Error("unused"); } }, runtime: { abortRun() {}, clearProjectTransients() {},
      hasProject: () => false, upsertPersistedProject() {} }, backgroundRunControllers: new Map([["run", control.control]]),
      assistantId: "assistant", afterCommit: () => order.push("cancel-chat") });
    expect(order).toEqual(["commit", "cancel-chat"]);
    expect(control.control.abortController.signal.aborted).toBe(true);
    control.settle();
    await deletion;
  });

  test("assistant chat publication discards same-session replacement and deletion buffers", async () => {
    const control = createSocket("control");
    const connections = new Set([control.socket]);
    const oldPump = getAssistantChatPump(connections, "assistant-pump", "same-session");
    oldPump.push("stale");
    const createdAt = new Date().toISOString();
    const message = { id: "replacement-message", role: "user" as const, kind: "plain" as const,
      content: "Replacement", createdAt };
    await emitAssistantChatMessageAppendedToAll(connections, { assistantId: "assistant-pump", sessionId: "same-session", message,
      thread: { id: "thread-pump", assistantId: "assistant-pump", sessionId: "same-session", messageCount: 1,
        latestMessageId: message.id, updatedAt: createdAt } });
    expect(assistantChatPumps.has("assistant-pump:same-session")).toBe(false);
    await oldPump.flush();
    const currentPump = getAssistantChatPump(connections, "assistant-pump", "same-session");
    currentPump.push("also-stale");
    await emitAssistantChatFailedToAll(connections, { assistantId: "assistant-pump", sessionId: "same-session" });
    await currentPump.flush();
    const deletionPump = getAssistantChatPump(connections, "assistant-pump", "delete-session");
    deletionPump.push("deleted"); discardAssistantChatPumps("assistant-pump"); await deletionPump.flush();
    controlEventBatcher.flush(control.socket);
    const events = parseServerEventFrame(JSON.parse(control.sent[0]!));
    expect(events.map((event) => event.type)).toEqual(["assistant.chat.delta", "assistant.chat.message-appended",
      "assistant.chat.delta", "assistant.chat.failed"]);
    const event = events[1];
    if (event?.type !== "assistant.chat.message-appended") throw new Error("Missing replacement event");
    expect(event.payload.thread.latestMessageId).toBe(message.id);
    expect("messages" in event.payload.thread).toBe(false);
    expect([...assistantChatPumps.keys()].some((key) => key.startsWith("assistant-pump:"))).toBe(false);
  });

  test("assistant chat failure remains authoritative after stream overflow", async () => {
    const control = createSocket("control");
    const connections = new Set([control.socket]);
    const pump = getAssistantChatPump(connections, "overflow-assistant", "overflow-session");
    pump.push("x".repeat(1_000_001));

    await emitAssistantChatFailedToAll(connections, {
      assistantId: "overflow-assistant",
      sessionId: "overflow-session"
    });
    controlEventBatcher.flush(control.socket);

    expect(assistantChatPumps.has("overflow-assistant:overflow-session")).toBe(false);
    expect(parseServerEventFrame(JSON.parse(control.sent[0]!)).map((event) => event.type)).toEqual([
      "assistant.chat.failed"
    ]);
  });

  test("assistant message replacement remains authoritative after prior stream overflow", async () => {
    const control = createSocket("control");
    const connections = new Set([control.socket]);
    getAssistantChatPump(connections, "overflow-assistant", "old-session").push("x".repeat(1_000_001));
    const createdAt = new Date().toISOString();
    const message = { id: "replacement-message", role: "user" as const, kind: "plain" as const,
      content: "Replacement", createdAt };

    await emitAssistantChatMessageAppendedToAll(connections, {
      assistantId: "overflow-assistant",
      sessionId: "new-session",
      message,
      thread: { id: "thread-pump", assistantId: "overflow-assistant", sessionId: "new-session", messageCount: 1,
        latestMessageId: message.id, updatedAt: createdAt }
    });
    controlEventBatcher.flush(control.socket);

    expect([...assistantChatPumps.keys()].some((key) => key.startsWith("overflow-assistant:"))).toBe(false);
    expect(parseServerEventFrame(JSON.parse(control.sent[0]!)).map((event) => event.type)).toEqual([
      "assistant.chat.message-appended"
    ]);
  });

});

function deletionFixture() {
  const root = resolveHarnessTestTempRoot();
  mkdirSync(root, { recursive: true });
  const dbPath = path.join(root, `workspace-deletion-${crypto.randomUUID()}.sqlite`);
  const repository = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
  const projectRoot = path.join(root, `project-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const project = repository.addProject(projectRoot);
  const now = new Date().toISOString();
  const backgroundJob: BackgroundJob = { id: createBackgroundJobId(), projectId: project.id,
    automationThreadId: createThreadId(), kind: "ai-routine", name: "Atomic deletion", status: "enabled", riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: "Run work." },
    schedule: { type: "one-off", runAt: now, sourceText: "now" }, scheduleInput: "now", nextRunAt: now,
    createdAt: now, updatedAt: now };
  const job = repository.saveBackgroundJob(backgroundJob);
  return { repository, project, job, dbPath };
}

test("workspace deletion transactions roll back all related state", () => {
  const { repository, project, job, dbPath } = deletionFixture();
  repository.createAgentRun(project.id, "linked run", "openai/gpt-5.4", job.automationThreadId);
  const agentRunId = repository.getLatestThreadRun(project.id, job.automationThreadId)!.id;
  repository.setAgentRunStatus(project.id, agentRunId, "running-main");
  const run = repository.createBackgroundJobRun({ jobId: job.id, projectId: project.id,
    automationThreadId: job.automationThreadId, triggerSource: "manual", status: "running", riskLevel: "safe",
    approvalStatus: "approved" });
  repository.setBackgroundJobRunStatus(run.id, "running", { linkedAgentRunId: agentRunId });
  const triggerDb = new Database(dbPath, { strict: true });
  triggerDb.exec(`CREATE TRIGGER reject_background_job_delete BEFORE DELETE ON background_jobs
    BEGIN SELECT RAISE(ABORT, 'background job delete rejected'); END`);
  expect(() => repository.deleteBackgroundJob(project.id, job.id)).toThrow("background job delete rejected");
  expect(repository.getBackgroundJob(job.id)?.id).toBe(job.id);
  expect(repository.getBackgroundJobRun(run.id)?.status).toBe("running");
  expect(repository.getRun(project.id, agentRunId)?.status).toBe("running-main");
  triggerDb.exec(`DROP TRIGGER reject_background_job_delete; CREATE TRIGGER reject_project_delete BEFORE DELETE ON projects
    BEGIN SELECT RAISE(ABORT, 'project delete rejected'); END`);
  expect(() => repository.removeProject(project.id)).toThrow("project delete rejected");
  expect(repository.getProject(project.id).id).toBe(project.id);
  expect(repository.loadWorkspace().activeProjectId).toBe(project.id);
  triggerDb.close();
});

test("removing an inactive project preserves the active project", () => {
  const { repository, project } = deletionFixture();
  const secondRoot = path.join(resolveHarnessTestTempRoot(), `inactive-${crypto.randomUUID()}`);
  const thirdRoot = path.join(resolveHarnessTestTempRoot(), `active-${crypto.randomUUID()}`);
  mkdirSync(secondRoot, { recursive: true });
  mkdirSync(thirdRoot, { recursive: true });
  const inactive = repository.addProject(secondRoot);
  repository.addProject(thirdRoot);
  repository.activateProject(project.id);
  const now = new Date().toISOString(), assistantId = createAssistantId();
  repository.saveAssistant({ id: assistantId, name: "Project assistant", scope: "project", projectId: inactive.id,
    personalityPrompt: "Be precise.", jobPrompt: "Review the project.", agentId: "pi", runState: "active",
    bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed", unreadQuestionCount: 0,
    createdAt: now, updatedAt: now });

  expect(repository.removeProject(inactive.id)).toMatchObject({ activeProjectId: project.id,
    deletedAssistantIds: [assistantId] });
  expect(repository.loadWorkspace().activeProjectId).toBe(project.id);
});
