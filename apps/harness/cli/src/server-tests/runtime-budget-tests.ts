import { beforeEach, describe, expect } from "bun:test";
import { createWorkspaceRepository, type WorkspaceRepository } from "../workspace-repository";
import { createFakePiAgentAdapter, type FakePiAgentAdapter } from "../test-support/fake-pi-agent-adapter";
import {
  createSocket,
  openProject,
  startServerForTest,
  stopServerForTest,
  waitForEvent
} from "./support/server-test-client";
import { createServerTestRegistrar, type ServerTestShardOptions } from "./support/server-test-sharding";
import { useGitProjectFixture } from "../test-support/git-project-fixture";

export function registerServerRuntimeBudgetTests(options: ServerTestShardOptions = {}) {
  describe("harness server runtime budget", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useGitProjectFixture({
      fixtureName: "server-runtime-budget",
      packageName: "runtime-budget-test",
      readmeTitle: "# Runtime Budget Test\n",
      gitIgnore: ".local\nnode_modules\ndist\n"
    });

    let adapter: FakePiAgentAdapter;
    let repository: WorkspaceRepository;

    beforeEach(() => {
      adapter = createFakePiAgentAdapter();
      repository = createWorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    });

    serverTest("budgeted run fails with turn-budget-exhausted before next model call", async () => {
      const projectRoot = await fixture.createRepoClone("budget-exhausted");
      const { server, port } = await startServerForTest({ port: 0, adapter, repository });
      const socket = createSocket(port);
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot, "req-budget-open");

      const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
      socket.send(
        JSON.stringify({
          type: "chat.send",
          requestId: "req-budget-send",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            agentId: "pi",
            content: "Do budgeted work",
            modeId: "plan",
            modeLocked: true,
            runtimeBudget: { maxTurns: 1 }
          }
        })
      );
      const ready = await readyPromise;
      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0]?.prompt).toContain("Remaining turns after this: 0");

      const failedPromise = waitForEvent(
        socket,
        "run.updated",
        (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "failed"
      );
      const errorPromise = waitForEvent(socket, "chat.error", (event) => event.payload.detail.includes("turn-budget-exhausted"));
      socket.send(
        JSON.stringify({
          type: "run.execute",
          requestId: "req-budget-execute",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id
          }
        })
      );

      const failed = await failedPromise;
      await errorPromise;
      expect(failed.payload.run.failureCategory).toBe("turn-budget-exhausted");
      expect(adapter.calls).toHaveLength(1);
      socket.close();
      await stopServerForTest(server);
    });

    serverTest("client completion cannot finish ready, running, or terminal runs", async () => {
      const projectRoot = await fixture.createRepoClone("run-complete");
      const release = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      const startExecution = adapter.startExecution;
      adapter.startExecution = async (request) => {
        const controller = await startExecution(request);
        return { ...controller, result: controller.result.then(async (result) => {
          started.resolve();
          await release.promise;
          return result;
        }) };
      };
      const { server, port } = await startServerForTest({ port: 0, adapter, repository });
      const socket = createSocket(port);
      try {
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-complete-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify({ type: "chat.send", requestId: "req-complete-send",
          payload: { projectId, threadId, agentId: "pi", content: "Prepare completion", modeId: "plan", modeLocked: true } }));
        const ready = await readyPromise;
        const runId = ready.payload.run.id;
        async function rejectCompletion(requestId: string, targetThread = threadId) {
          const rejected = waitForEvent(socket, "command.rejected", (event) => event.requestId === requestId);
          socket.send(JSON.stringify({ type: "run.complete", requestId,
            payload: { projectId, threadId: targetThread, runId, assistantMessageContent: "Forged completion" } }));
          return (await rejected).payload.detail;
        }
        expect(await rejectCompletion("stale-thread", "thread-stale-complete")).toContain("not active for project");
        expect(await rejectCompletion("ready-complete")).toContain("owned by execution");
        expect(repository.getRun(projectId, runId)?.status).toBe("ready");
        const completed = waitForEvent(socket, "chat.complete");
        socket.send(JSON.stringify({ type: "run.execute", requestId: "execute-owned", payload: { projectId, threadId, runId } }));
        await started.promise;
        expect(await rejectCompletion("running-complete")).toContain("owned by execution");
        expect(repository.getRun(projectId, runId)?.status).toBe("running-main");
        release.resolve();
        const result = await completed;
        expect(result.payload.assistantMessage.content).toContain("main execution result");
        expect(repository.getRun(projectId, runId)?.status).toBe("completed");
        expect(await rejectCompletion("terminal-complete")).toContain("owned by execution");
        expect(repository.getThreadMessages(projectId, threadId).some((message) => message.content === "Forged completion")).toBe(false);
      } finally {
        release.resolve();
        socket.close();
        await stopServerForTest(server);
        repository.close();
      }
    });
  });
}
