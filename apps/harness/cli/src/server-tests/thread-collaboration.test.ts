import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createWorkspaceRepository } from "../workspace-repository";
import { useServerSuiteFixture } from "./support/server-suite-fixture";
import { createSocket, openProject, waitForEvent, sendChatUntilReady, executeReadyRun } from "./support/server-test-client";

setDefaultTimeout(20000);
describe("thread collaboration", () => {
  const fixture = useServerSuiteFixture({ fixtureName: "thread-collaboration", persistentDatabase: true });

  test("subagent ancestry survives reopen, does not change selection, and retries reuse the child", () => {
    const { repository, projectRoot } = fixture;
    const project = repository.addProject(projectRoot);
    const run = repository.createAgentRun(project.id, "delegate", "openai/gpt-5.4", project.activeThreadId).activeRun!;
    const input = { projectId: project.id, parentThreadId: project.activeThreadId, runId: run.id, subagentId: "worker", title: "Inspect parser", instruction: "Inspect parser and report" };
    const child = repository.ensureSubagentThread(input);
    expect(repository.ensureSubagentThread(input)).toBe(child);
    repository.finishSubagentThread({ runId: run.id, subagentId: "worker", status: "completed", output: "Parser checked" });
    const reopened = createWorkspaceRepository(fixture.dbPath, projectRoot);
    try {
      const snapshot = reopened.getProject(project.id);
      expect(snapshot.activeThreadId).toBe(project.activeThreadId);
      expect(snapshot.threads.find(thread => thread.id === child)?.lineage).toEqual({ parentThreadId: project.activeThreadId, relationship: "subagent", runId: run.id, subagentId: "worker", status: "completed" });
      expect(reopened.getThreadMessages(project.id, child).at(-1)?.content).toBe("Parser checked");
      const fork = reopened.forkThread(project.id, child);
      expect(fork.threads.find(thread => thread.id === fork.activeThreadId)?.lineage).toEqual({ parentThreadId: child, relationship: "fork" });
    } finally { reopened.close(); }
  });

  test("messages persist attribution, deduplicate retries and reject cross-project or archived recipients", () => {
    const { repository } = fixture;
    const project = repository.addProject(fixture.projectRoot);
    const target = repository.createThread(project.id).activeThreadId;
    const input = { projectId: project.id, sourceThreadId: project.activeThreadId, targetThreadId: target, message: "Check the parser", deliveryId: crypto.randomUUID() };
    repository.sendThreadMessage(input);
    repository.renameThread(project.id, project.activeThreadId, "Renamed sender");
    repository.sendThreadMessage(input);
    expect(repository.getThreadMessages(project.id, target).filter(message => message.metadata?.type === "thread-message")).toHaveLength(1);
    expect(repository.listQueuedThreadMessages()).toHaveLength(1);
    expect(repository.getThreadMessages(project.id, target)[0]?.metadata).toMatchObject({ sourceThreadId: project.activeThreadId, direction: "received" });
    expect(() => repository.sendThreadMessage({ ...input, message: "Changed" })).toThrow("conflicts");
    const other = repository.addProject(fixture.extraProjectRoot);
    expect(() => repository.sendThreadMessage({ ...input, targetThreadId: other.activeThreadId, deliveryId: crypto.randomUUID() })).toThrow("project");
    repository.activateThread(project.id, project.activeThreadId);
    repository.archiveThread(project.id, target);
    expect(() => repository.sendThreadMessage({ ...input, deliveryId: crypto.randomUUID() })).toThrow("archived");
  });

  test("sending to an idle thread automatically executes there without stealing selection", async () => {
    const { repository, adapter } = fixture;
    repository.setPlanExecutionModeDefault("immediate");
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, fixture.projectRoot);
      const project = opened.payload.project;
      const target = repository.createThread(project.id).activeThreadId;
      repository.activateThread(project.id, project.activeThreadId);
      const complete = waitForEvent(socket, "chat.complete", event => event.payload.threadId === target, 15000);
      socket.send(JSON.stringify({ type: "thread.message", requestId: "send-to-thread", payload: {
        projectId: project.id, sourceThreadId: project.activeThreadId, targetThreadId: target,
        message: "Inspect README", deliveryId: crypto.randomUUID()
      } }));
      await complete;
      expect(repository.getProject(project.id).activeThreadId).toBe(project.activeThreadId);
      expect(adapter.calls.some(call => call.kind === "executor" && call.prompt.includes("Inspect README"))).toBe(true);
      expect(repository.getLatestThreadRun(project.id, target)?.status).toBe("completed");
    } finally { socket.close(); }
  });

  test("paused queues survive restart and run after resume", async () => {
    const { repository } = fixture;
    repository.setPlanExecutionModeDefault("immediate");
    repository.setGlobalExecutionPaused(true);
    const project = repository.addProject(fixture.projectRoot);
    repository.enqueueThreadMessage({ id: crypto.randomUUID(), projectId: project.id, threadId: project.activeThreadId, content: "Inspect README" });
    await fixture.restart();
    expect(repository.listQueuedThreadMessages()).toHaveLength(1);
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const complete = waitForEvent(socket, "chat.complete", undefined, 15000);
      repository.setGlobalExecutionPaused(false);
      await complete;
      expect(repository.getLatestThreadRun(project.id, project.activeThreadId)?.status).toBe("completed");
    } finally { socket.close(); }
  });

  test("busy input queues a later turn, and unsupported steering leaves it unsent", async () => {
    const { repository, adapter } = fixture;
    repository.setPlanExecutionModeDefault("immediate");
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const project = (await openProject(socket, fixture.projectRoot)).payload.project;
      const ready = await sendChatUntilReady(socket, { requestId: "hold-plan", projectId: project.id, threadId: project.activeThreadId, content: "streaming refresh hold" });
      const first = executeReadyRun(socket, { requestId: "hold-run", projectId: project.id, threadId: project.activeThreadId, runId: ready.payload.run.id }, 15000);
      await adapter.waitForCall("executor");
      const rejected = waitForEvent(socket, "thread.inputRejected", event => event.requestId === "steer-unavailable");
      socket.send(JSON.stringify({ type: "thread.input", requestId: "steer-unavailable", payload: {
        projectId: project.id, threadId: project.activeThreadId, message: "Do not lose this draft", deliveryId: crypto.randomUUID(), mode: "steer"
      } }));
      expect((await rejected).payload.reason).toContain("Queue it with Enter");
      expect(repository.getThreadMessages(project.id, project.activeThreadId).some(entry => entry.content === "Do not lose this draft")).toBe(false);
      const queued = waitForEvent(socket, "thread.inputAccepted");
      socket.send(JSON.stringify({ type: "thread.input", requestId: "queue-followup", payload: {
        projectId: project.id, threadId: project.activeThreadId, message: "Inspect README after finishing", deliveryId: crypto.randomUUID(), mode: "queue"
      } }));
      await queued;
      expect(adapter.calls.filter(call => call.kind === "executor")).toHaveLength(1);
      await first;
      const complete = waitForEvent(socket, "chat.complete", event => event.payload.runId !== ready.payload.run.id, 15000);
      await complete;
      expect(adapter.calls.filter(call => call.kind === "executor")).toHaveLength(2);
    } finally { socket.close(); }
  });

  test("steering reaches the live controller through runtime and budget wrappers", async () => {
    const steered: string[] = [];
    const base = fixture.adapter;
    await fixture.restart({ adapter: { ...base, async startExecution(request) {
      return { ...await base.startExecution(request), steer: async message => { steered.push(message); } };
    } } });
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const project = (await openProject(socket, fixture.projectRoot)).payload.project;
      const ready = await sendChatUntilReady(socket, { requestId: "steer-plan", projectId: project.id, threadId: project.activeThreadId, content: "streaming refresh hold" });
      const completed = executeReadyRun(socket, { requestId: "steer-run", projectId: project.id, threadId: project.activeThreadId, runId: ready.payload.run.id }, 15000);
      await base.waitForCall("executor");
      const accepted = waitForEvent(socket, "thread.inputAccepted");
      socket.send(JSON.stringify({ type: "thread.input", requestId: "steer", payload: {
        projectId: project.id, threadId: project.activeThreadId, message: "Check the edge case too", deliveryId: crypto.randomUUID(), mode: "steer"
      } }));
      expect((await accepted).payload.mode).toBe("steer");
      expect(steered).toEqual(["Check the edge case too"]);
      await completed;
      expect(base.calls.filter(call => call.kind === "executor")).toHaveLength(1);
    } finally { socket.close(); }
  });
});
