import { expect } from "bun:test";
import { createChatSendCommand, createSocket, openProject, parseMessageEventPayloads, pingServer, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerModeGatingTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("ask mode auto-runs immediately without appending a plan summary message", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-ask-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        let planMessageSeen = false;
        socket.addEventListener("message", (event) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if ((payload.type === "chat.message-appended" || payload.type === "thread.message-appended") &&
                    payload.payload.message.kind === "plan-summary") {
                    planMessageSeen = true;
                }
            }
        });
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-ask-send",
            projectId,
            threadId,
            content: "What do each of the different modes do?",
            modeId: "ask"
        })));
        const ready = await readyPromise;
        await pingServer(socket, "req-ask-drain");
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        expect(planMessageSeen).toBe(false);
        expect(ready.payload.run.plan?.origin).toBe("quick-task");
        expect(adapter.calls.map((call) => call.kind)).toEqual([]);
        socket.close();
    });
    serverTest("plan mode preserves approval-first gating", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-plan-mode-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-plan-mode-send",
            projectId,
            threadId,
            content: "Plan the safest rollout strategy before implementing anything.",
            modeId: "plan"
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        socket.close();
    });
    serverTest("saved plan gate preference overrides plan mode approval default", async () => {
        const { repository, projectRoot, port } = fixture;
        repository.setPlanExecutionModeDefault("immediate");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-plan-mode-immediate-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-plan-mode-immediate-send",
            projectId,
            threadId,
            content: "Plan the safest rollout strategy before implementing anything.",
            modeId: "plan"
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
    });
    serverTest("implement mode uses immediate gating for main-route plans", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-impl-main-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-impl-main-send",
            projectId,
            threadId,
            content: "simple task"
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
    });
    serverTest("implement mode upgrades multi-subagent plans to approval-first gating", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-impl-subagents-open");
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const planMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.kind === "plan-summary");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-impl-subagents-send",
            projectId,
            threadId,
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        })));
        const ready = await readyPromise;
        const planMessage = await planMessagePromise;
        expect(ready.payload.run.plan?.gating.mode).toBe("approve");
        expect(ready.payload.run.plan?.actualSubagentCount).toBeGreaterThan(1);
        expect(planMessage.payload.message.kind).toBe("plan-summary");
        socket.close();
    });
    serverTest("debug and review modes default to immediate gating", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-debug-review-open");
        const projectId = opened.payload.project.id;
        const debugThreadId = opened.payload.project.activeThreadId;
        const debugReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-debug-send",
            projectId,
            threadId: debugThreadId,
            content: "Debug this flaky login bug and find root cause.",
            modeId: "debug"
        })));
        const debugReady = await debugReadyPromise;
        expect(debugReady.payload.run.plan?.gating.mode).toBe("immediate");
        const reopened = await openProject(socket, projectRoot, "req-debug-review-reopen");
        const reviewThreadId = reopened.payload.project.activeThreadId;
        const reviewReadyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-review-send",
            projectId,
            threadId: reviewThreadId,
            content: "Review this PR diff for regressions and missing tests.",
            modeId: "review"
        })));
        const reviewReady = await reviewReadyPromise;
        expect(reviewReady.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
    });
}
