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

    serverTest("run.complete emits run.updated and chat.complete then rejects terminal repeat", async () => {
      const projectRoot = await fixture.createRepoClone("run-complete");
      const { server, port } = await startServerForTest({ port: 0, adapter, repository });
      const socket = createSocket(port);
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot, "req-complete-open");

      const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
      socket.send(
        JSON.stringify({
          type: "chat.send",
          requestId: "req-complete-send",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            agentId: "pi",
            content: "Prepare completion"
          }
        })
      );
      const ready = await readyPromise;

      const staleThreadRejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-complete-stale-thread");
      socket.send(
        JSON.stringify({
          type: "run.complete",
          requestId: "req-complete-stale-thread",
          payload: {
            projectId: opened.payload.project.id,
            threadId: "thread-stale-complete",
            runId: ready.payload.run.id,
            assistantMessageContent: "wrong thread"
          }
        })
      );
      const staleThreadRejected = await staleThreadRejectedPromise;
      expect(staleThreadRejected.payload.detail).toContain("not active for project");

      const completedPromise = waitForEvent(
        socket,
        "run.updated",
        (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "completed"
      );
      const chatCompletePromise = waitForEvent(socket, "chat.complete");
      socket.send(
        JSON.stringify({
          type: "run.complete",
          requestId: "req-complete-command",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id,
            assistantMessageContent: "Completed by lifecycle command."
          }
        })
      );

      await completedPromise;
      const complete = await chatCompletePromise;
      expect(complete.payload.assistantMessage.content).toBe("Completed by lifecycle command.");

      const rejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-complete-repeat");
      socket.send(
        JSON.stringify({
          type: "run.complete",
          requestId: "req-complete-repeat",
          payload: {
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            runId: ready.payload.run.id,
            assistantMessageContent: "repeat"
          }
        })
      );
      const rejected = await rejectedPromise;
      expect(rejected.payload.detail).toContain("already terminal");
      socket.close();
      await stopServerForTest(server);
    });
  });
}
