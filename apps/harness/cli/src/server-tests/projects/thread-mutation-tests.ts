import { expect } from "bun:test";
import { createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerThreadMutationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("renames a thread while it is streaming", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-thread-rename-streaming-1",
            projectId,
            threadId,
            content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === threadId);
        const renamedPromise = waitForEvent(socket, "thread.renamed");
        const completePromise = waitForEvent(socket, "chat.complete", (event) => event.payload.projectId === projectId && event.payload.threadId === threadId, 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-rename-streaming-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await runningRunPromise;
        await deltaPromise;
        socket.send(JSON.stringify({
            type: "thread.rename",
            requestId: "req-thread-rename-streaming-rename",
            payload: {
                projectId,
                threadId,
                title: "Renamed during stream"
            }
        }));
        const renamed = await renamedPromise;
        expect(renamed.payload.thread.id).toBe(threadId);
        expect(renamed.payload.thread.title).toBe("Renamed during stream");
        const completed = await completePromise;
        expect(completed.payload.threadId).toBe(threadId);
        expect(repository.getProject(projectId).threads.find((thread) => thread.id === threadId)?.title).toBe("Renamed during stream");
        expect(repository.getThreadMessages(projectId, threadId).at(-1)?.content).toBe("main execution result\n\nVerification unverified: no task-specific checks were established.");
        socket.close();
    }, 10000);
    serverTest("starts a second thread run while another thread is still working", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-thread-blocked-1",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const secondReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.threadId !== originalThreadId && event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-blocked-execute",
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
            requestId: "req-thread-blocked-create",
            payload: {
                projectId
            }
        }));
        const created = await createThreadPromise;
        const newThreadId = created.payload.project.activeThreadId;
        const secondPlanMessagePromise = waitForEvent(socket, "chat.message-appended", (event) =>
            event.payload.threadId === newThreadId && event.payload.message.kind === "plan-summary", 10000);
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-thread-parallel-send",
            payload: {
                projectId,
                threadId: newThreadId,
                agentId: "pi",
                content: "second thread work",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const secondReady = await secondReadyPromise;
        const secondPlanMessage = await secondPlanMessagePromise;
        expect(secondReady.payload.threadId).toBe(newThreadId);
        expect(secondReady.payload.run.threadId).toBe(newThreadId);
        const secondThreadMessages = repository.getThreadMessages(projectId, newThreadId);
        expect(secondThreadMessages.some((message) => message.content === "second thread work")).toBe(true);
        expect(secondThreadMessages.find((message) => message.id === secondPlanMessage.payload.message.id)?.kind)
            .toBe("plan-summary");
        socket.close();
    }, 10000);
    serverTest("stops a background-thread run by run id after switching threads", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-thread-stop-1",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh"
        });
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        const stoppedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped");
        const errorPromise = waitForEvent(socket, "chat.error", (event) => event.payload.projectId === projectId && event.payload.threadId === originalThreadId);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-thread-stop-execute",
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
            requestId: "req-thread-stop-create",
            payload: {
                projectId
            }
        }));
        await createThreadPromise;
        socket.send(JSON.stringify({
            type: "chat.stop",
            requestId: "req-thread-stop-stop",
            payload: {
                projectId,
                threadId: originalThreadId,
                runId: ready.payload.run.id
            }
        }));
        await stoppedRunPromise;
        const errorEvent = await errorPromise;
        expect(errorEvent.payload.message).toContain("stopped");
        socket.close();
    }, 10000);
}
