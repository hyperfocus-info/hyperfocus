import { expect } from "bun:test";
import { createSocket, executeReadyRun, openProject, parseMessageEventPayloads, sendChatAndExecute, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerRetryContextTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("retries completed main run with a fresh planner + executor pass", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const firstRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "completed");
        const firstReady = await sendChatUntilReady(socket, {
            requestId: "req-retry-main-1",
            projectId,
            threadId,
            content: "simple task",
            modeId: "plan",
            modeLocked: true
        });
        await executeReadyRun(socket, {
            requestId: "req-retry-main-1-execute",
            projectId,
            threadId,
            runId: firstReady.payload.run.id
        });
        const firstRun = await firstRunPromise;
        const secondReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify({
            type: "run.retry",
            requestId: "req-retry-main-2",
            payload: {
                projectId,
                threadId,
                runId: firstRun.payload.run.id
            }
        }));
        const secondReady = await secondReadyPromise;
        await executeReadyRun(socket, {
            requestId: "req-retry-main-2-execute",
            projectId,
            threadId,
            runId: secondReady.payload.run.id
        });
        expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "executor", "planner", "executor"]);
        socket.close();
    });
    serverTest("planning.refine replaces the ready plan with a fresh run", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const rejectedEvents: any[] = [];
        const rejectListener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "command.rejected") rejectedEvents.push(payload);
            }
        };
        socket.addEventListener("message", rejectListener);
        const firstReady = await sendChatUntilReady(socket, {
            requestId: "req-refine-1",
            projectId,
            threadId,
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        });
        const refinedReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready" &&
            event.payload.run.id !== firstReady.payload.run.id &&
            event.payload.run.latestUserPrompt === "make it runnable", 10000);
        const refinedPlanMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.kind === "plan-summary" &&
            event.payload.message.metadata?.type === "plan-summary" &&
            event.payload.message.metadata.runId !== firstReady.payload.run.id, 10000);
        socket.send(JSON.stringify({
            type: "planning.refine",
            requestId: "req-refine-2",
            payload: {
                projectId,
                threadId,
                runId: firstReady.payload.run.id,
                content: "make it runnable"
            }
        }));
        const refinedReady = await refinedReadyPromise;
        const refinedPlanMessage = await refinedPlanMessagePromise;
        expect(refinedReady.payload.run.id).not.toBe(firstReady.payload.run.id);
        expect(refinedPlanMessage.payload.message.metadata.runId).toBe(refinedReady.payload.run.id);
        expect(adapter.calls.filter((call) => call.kind === "planner")).toHaveLength(2);
        expect(adapter.calls.some((call) => call.kind === "executor" || call.kind === "subagent")).toBe(false);
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
    });
    serverTest("allows a second top-level send after a completed run in the same thread", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const rejectedEvents: any[] = [];
        const rejectListener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "command.rejected") rejectedEvents.push(payload);
            }
        };
        socket.addEventListener("message", rejectListener);
        await sendChatAndExecute(socket, {
            requestId: "req-first-complete",
            projectId,
            threadId,
            content: "simple task"
        });
        const secondReady = await sendChatUntilReady(socket, {
            requestId: "req-second-followup",
            projectId,
            threadId,
            content: "another task"
        });
        expect(secondReady.payload.run.status).toBe("ready");
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
    });
    serverTest("emits project context usage updates for planner and executor", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const contextEvents: any[] = [];
        const listener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "project.context") {
                    contextEvents.push(payload);
                }
            }
        };
        socket.addEventListener("message", listener);
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-context",
            projectId,
            threadId,
            content: "simple task",
            modeId: "plan",
            modeLocked: true
        });
        await executeReadyRun(socket, {
            requestId: "req-context-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        });
        socket.removeEventListener("message", listener);
        expect(contextEvents.some((event) => event.payload.contextUsage.sourceKind === "planner")).toBe(true);
        expect(contextEvents.some((event) => event.payload.contextUsage.sourceKind === "main")).toBe(true);
        expect(contextEvents.every((event) => event.payload.contextUsage.contextWindow === 200000)).toBe(true);
        expect(contextEvents.every((event) => typeof event.payload.contextUsage.modelId === "string")).toBe(true);
        expect(contextEvents.every((event) => event.payload.tokenUsage?.session.totalTokensIncludingCached > 0)).toBe(true);
        expect(contextEvents.at(-1)?.payload.tokenUsage.lifetime.totalTokensIncludingCached).toBeGreaterThanOrEqual(contextEvents.at(-1)?.payload.tokenUsage.session.totalTokensIncludingCached);
        socket.close();
    });
}
