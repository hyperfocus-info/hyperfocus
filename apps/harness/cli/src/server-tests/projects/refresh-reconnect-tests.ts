import { expect } from "bun:test";
import { createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerRefreshReconnectTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("defers run.refresh while active main execution is streaming", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-refresh-deferred-1",
            projectId,
            threadId,
            content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta");
        const completePromise = waitForEvent(socket, "chat.complete", undefined, 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-refresh-deferred-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const runningRun = await runningRunPromise;
        await deltaPromise;
        const deferredTracePromise = waitForEvent(socket, "agent.trace", (event) => event.payload.trace.stage === "refresh-deferred", 10000);
        socket.send(JSON.stringify({
            type: "run.refresh",
            requestId: "req-refresh-deferred-2",
            payload: {
                projectId,
                threadId,
                runId: runningRun.payload.run.id
            }
        }));
        await deferredTracePromise;
        await completePromise;
        expect(adapter.calls.filter((call) => call.kind === "executor")).toHaveLength(1);
        socket.close();
    }, 10000);
    serverTest("stops stale active runs when refresh has no live execution", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-refresh-stale-1",
            projectId,
            threadId,
            content: "simple task"
        });
        repository.setAgentRunStatus(projectId, ready.payload.run.id, "running-main");
        const stoppedPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "stopped", 10000);
        const systemMessagePromise = waitForEvent(socket, "thread.message-appended", (event) => event.payload.threadId === threadId &&
            event.payload.message.content.includes("no live execution controller"), 10000);
        socket.send(JSON.stringify({
            type: "run.refresh",
            requestId: "req-refresh-stale-2",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const stopped = await stoppedPromise;
        await systemMessagePromise;
        expect(stopped.payload.run.failureCategory).toBe("controller-lost");
        expect(repository.getRun(projectId, ready.payload.run.id)?.status).toBe("stopped");
        socket.close();
    }, 10000);
    serverTest("restores persisted in-flight assistant text after reconnect during streaming", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-stream-reconnect-1",
            projectId,
            threadId,
            content: "streaming refresh"
        });
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-stream-reconnect-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await waitForEvent(socket, "chat.delta", (event) => event.payload.delta === "working", 10000);
        socket.close();
        const reconnectSocket = createSocket(port);
        const reconnectReady = await waitForEvent(reconnectSocket, "connection.ready");
        const restoredProject = reconnectReady.payload.workspace.projects.find((project: {
            id: string;
        }) => project.id === projectId);
        expect(restoredProject?.activeRun?.id).toBe(ready.payload.run.id);
        expect(restoredProject?.session.isStreaming).toBe(true);
        expect(restoredProject?.session.messages.at(-1)?.content).toBe("working");
        const complete = await waitForEvent(reconnectSocket, "chat.complete", (event) => event.payload.projectId === projectId && event.payload.threadId === threadId, 10000);
        expect(complete.payload.assistantMessage.content).toBe("main execution result");
        expect(complete.payload.state.messages.at(-1)?.content).toBe("main execution result");
        reconnectSocket.close();
    }, 10000);
    serverTest("creates a new thread while another thread is still streaming", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-thread-during-stream-1",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const completePromise = waitForEvent(socket, "chat.complete", (event) => event.payload.projectId === projectId && event.payload.threadId === originalThreadId, 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-during-stream-execute",
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
            requestId: "req-thread-during-stream-create",
            payload: {
                projectId
            }
        }));
        const created = await createThreadPromise;
        const newThreadId = created.payload.project.activeThreadId;
        expect(newThreadId).not.toBe(originalThreadId);
        const completed = await completePromise;
        expect(completed.payload.threadId).toBe(originalThreadId);
        expect(repository.getProject(projectId).activeThreadId).toBe(newThreadId);
        expect(repository.getThreadMessages(projectId, originalThreadId).at(-1)?.content).toBe("main execution result");
        socket.close();
    }, 10000);
}
