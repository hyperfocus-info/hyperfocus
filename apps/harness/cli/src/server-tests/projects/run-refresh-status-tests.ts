import { expect } from "bun:test";
import { createSocket, executeReadyRun, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerRunRefreshStatusTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("refreshes and removal-checks the original run after switching threads", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-thread-refresh-1",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh hold"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-refresh-execute",
            payload: {
                projectId,
                threadId: originalThreadId,
                runId: ready.payload.run.id
            }
        }));
        await runningRunPromise;
        await deltaPromise;
        socket.send(JSON.stringify({
            type: "thread.create",
            requestId: "req-thread-refresh-create",
            payload: {
                projectId
            }
        }));
        await createThreadPromise;
        const deferredTracePromise = waitForEvent(socket, "agent.trace", (event) => event.payload.threadId === originalThreadId && event.payload.trace.stage === "refresh-deferred");
        const rejectedRemovePromise = waitForEvent(socket, "command.rejected");
        const removedPromise = waitForEvent(socket, "project.removed");
        socket.send(JSON.stringify({
            type: "run.refresh",
            requestId: "req-thread-refresh-refresh",
            payload: {
                projectId,
                threadId: originalThreadId,
                runId: ready.payload.run.id
            }
        }));
        await deferredTracePromise;
        socket.send(JSON.stringify({
            type: "project.remove",
            requestId: "req-thread-refresh-remove-blocked",
            payload: {
                projectId
            }
        }));
        const rejected = await rejectedRemovePromise;
        expect(rejected.payload.detail).toContain("streaming");
        socket.send(JSON.stringify({
            type: "chat.stop",
            requestId: "req-thread-refresh-stop",
            payload: {
                projectId,
                threadId: originalThreadId,
                runId: ready.payload.run.id
            }
        }));
        await waitForEvent(socket, "run.updated", (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped");
        socket.send(JSON.stringify({
            type: "project.remove",
            requestId: "req-thread-refresh-remove",
            payload: {
                projectId
            }
        }));
        const removed = await removedPromise;
        expect(removed.payload.projectId).toBe(projectId);
        socket.close();
    }, 10000);
    serverTest("rejects run.refresh for completed runs", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const completedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-refresh-completed-1",
            projectId,
            threadId,
            content: "simple task"
        });
        await executeReadyRun(socket, {
            requestId: "req-refresh-completed-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        const completedRun = await completedRunPromise;
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(JSON.stringify({
            type: "run.refresh",
            requestId: "req-refresh-completed-2",
            payload: {
                projectId,
                threadId,
                runId: completedRun.payload.run.id
            }
        }));
        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain("not refreshable");
        socket.close();
    });
    serverTest("rejects stale completed plan execution by persisted run status", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const completedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-execute-completed-1",
            projectId,
            threadId,
            content: "simple task"
        });
        await executeReadyRun(socket, {
            requestId: "req-execute-completed-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        const completedRun = await completedRunPromise;
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-execute-completed-2",
            payload: {
                projectId,
                threadId,
                runId: completedRun.payload.run.id
            }
        }));
        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain("Run status completed is not executable");
        expect(rejected.payload.detail).not.toContain("Project has no active run");
        socket.close();
    });
}
