import { expect } from "bun:test";
import { createChatSendCommand, createSocket, executeReadyRun, openProject, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerIntentRoutingTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("chat.send auto-switches project mode when prompt intent strongly matches a builtin mode", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-auto-mode-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const projectUpdatedPromise = waitForEvent(socket, "project.updated", (event) => event.payload.projectId === projectId && event.payload.project.selectedModeId === "ask");
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-auto-mode-send",
            projectId,
            threadId,
            content: "What do each of the different modes do?"
        })));
        const projectUpdated = await projectUpdatedPromise;
        const ready = await readyPromise;
        expect(projectUpdated.payload.project.selectedModeId).toBe("ask");
        expect(ready.payload.run.plan?.mode?.id).toBe("ask");
        socket.close();
    });
    serverTest("chat.send honors explicitly locked mode over auto-detect", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-mode-lock-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-mode-lock-send",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "Create readme.md",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.mode?.id).toBe("plan");
        expect(ready.payload.run.plan?.origin).toBe("initial");
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
    });
    serverTest("chat.send auto mode detects implementation and skips planner below difficulty threshold", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-mode-auto-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-mode-auto-send",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "Create readme.md",
                modeId: "auto",
                modeLocked: false
            }
        }));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(adapter.calls.map((call) => call.kind)).toEqual([]);
        socket.close();
    });
    serverTest("chat.send correction follow-up overrides sticky ask mode for direct workspace actions", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-auto-followup-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const initialReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt === "create folder /tetris try 10 different ways if blocked");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-auto-followup-initial",
            projectId,
            threadId,
            content: "create folder /tetris try 10 different ways if blocked",
            modeId: "ask"
        })));
        const initialReady = await initialReadyPromise;
        expect(initialReady.payload.run.plan?.mode?.id).toBe("implement");
        expect(initialReady.payload.run.plan?.origin).toBe("quick-task");
        await executeReadyRun(socket, {
            requestId: "req-auto-followup-initial-execute",
            projectId,
            threadId,
            runId: initialReady.payload.run.id
        }, 10000);
        const implementReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt === "no inside the cwd");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-auto-followup-implement",
            projectId,
            threadId,
            content: "no inside the cwd",
            modeId: "ask"
        })));
        const implementReady = await implementReadyPromise;
        expect(implementReady.payload.run.plan?.mode?.id).toBe("implement");
        expect(implementReady.payload.run.plan?.origin).toBe("quick-task");
        expect(implementReady.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
    });
    serverTest("chat.send bypasses planner for direct workspace tasks even when review mode was selected", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-quick-task-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-quick-task-send",
            projectId,
            threadId,
            content: "Make folder /pacman",
            modeId: "review"
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        expect(ready.payload.run.plan?.finalExecutionBrief).toBe("Make folder pacman");
        expect(adapter.calls).toHaveLength(0);
        socket.close();
    });
    serverTest("review mode executes runs with read-only requests", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-review-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-review-send",
            projectId,
            threadId,
            content: "Review this repo for bugs and missing tests",
            modeId: "review"
        })));
        const ready = await readyPromise;
        await executeReadyRun(socket, {
            requestId: "req-review-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        }, 10000);
        const executorCall = adapter.calls.find((call) => call.kind === "executor");
        expect(executorCall?.readOnly).toBe(true);
        socket.close();
    }, 15000);
}
