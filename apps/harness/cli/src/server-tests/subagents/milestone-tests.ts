import { expect } from "bun:test";
import { createSocket, openProject, parseMessageEventPayloads, pingServer, sendChatAndExecute, sendChatUntilReady, waitForAdapterCall, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerSubagentMilestoneTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerSubagentMilestoneWindowTests(serverTest, fixture);
    registerSubagentMilestoneStateTests(serverTest, fixture);
}

function registerSubagentMilestoneWindowTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("emits live Harness milestone windows and hides aggregation noise", async () => {
        let { adapter, repository, projectRoot, port } = fixture;
        await fixture.restartWithRealOsAdapters();
        port = fixture.port;
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const appendedMessages: Array<{
            role: string;
            kind?: string;
            content: string;
        }> = [];
        const updatedMessages: Array<{
            role: string;
            kind?: string;
            content: string;
        }> = [];
        const streamingTailContents: string[] = [];
        const listener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "chat.message-appended" || payload.type === "thread.message-appended") {
                    appendedMessages.push(payload.payload.message);
                }
                if (payload.type === "chat.message-updated") {
                    updatedMessages.push(payload.payload.message);
                }
                if (payload.type === "chat.streaming-tail-updated") {
                    streamingTailContents.push(payload.payload.segments.map((segment: {
                        content: string;
                    }) => segment.content).join("\n"));
                }
            }
        };
        socket.addEventListener("message", listener);
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-milestone-only",
            projectId,
            threadId,
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        const harnessMessagePromise = waitForEvent(socket, "chat.streaming-tail-updated", (event) => event.payload.segments.some((segment: {
            content: string;
        }) => segment.content.includes("Subagent Inspect files: started.")), 30000);
        const retryMessagePromise = waitForEvent(socket, "chat.streaming-tail-updated", (event) => event.payload.segments.some((segment: {
            content: string;
        }) => segment.content.includes("retrying attempt 2")), 30000);
        const completePromise = waitForEvent(socket, "chat.complete", undefined, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-milestone-only-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await harnessMessagePromise;
        await retryMessagePromise;
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const complete = await completePromise;
        await pingServer(socket, "req-milestone-drain");
        socket.removeEventListener("message", listener);
        expect(appendedMessages.some((message) => message.kind === "run-milestones")).toBe(false);
        expect(updatedMessages.some((message) => message.kind === "run-milestones")).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent Inspect files: started."))).toBe(true);
        expect(streamingTailContents.some((message) => message.includes("Subagent Patch code: retrying attempt 2."))).toBe(true);
        expect(streamingTailContents.some((message) => message.includes("shell running 5s+"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Aggregator: shell"))).toBe(false);
        expect(appendedMessages.some((message) => message.role === "system" && message.content.includes("Subagent"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent progress:"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Aggregating subagent results"))).toBe(false);
        expect(streamingTailContents.some((message) => message.includes("Subagent aggregation completed"))).toBe(false);
        const milestoneRows = [...appendedMessages, ...updatedMessages].filter((message) => message.kind === "run-milestones");
        expect(milestoneRows).toHaveLength(0);
        const finalMessages = complete.payload.state.messages;
        const finalAssistantIndex = finalMessages.findLastIndex((message: {
            role: string;
            kind?: string;
        }) => message.role === "assistant" && message.kind !== "run-milestones");
        const lastMilestoneIndex = finalMessages.findLastIndex((message: {
            kind?: string;
        }) => message.kind === "run-milestones");
        expect(lastMilestoneIndex).toBeGreaterThan(-1);
        expect(finalAssistantIndex).toBeGreaterThan(lastMilestoneIndex);
        socket.close();
    }, 60000);
    serverTest("aggregates repeated subagent shell failure milestones", async () => {
        const { repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-tool-failure-burst",
            projectId,
            threadId,
            content: "complex tool failure burst",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-tool-failure-burst-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const completed = await waitForEvent(socket, "chat.complete", undefined, 30000);
        expect(completed.payload.state.messages.some((message: {
            content: string;
        }) => message.content.includes("Subagent Tool failure task: shell failed"))).toBe(false);
        socket.close();
    }, 60000);
}

function registerSubagentMilestoneStateTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("reports subagent failures before slower siblings finish", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-early-fail",
            projectId,
            threadId,
            content: "complex early fail",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        let completeResolved = false;
        const completeListener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "chat.complete") {
                    completeResolved = true;
                }
            }
        };
        socket.addEventListener("message", completeListener);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-early-fail-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const failMessage = await waitForEvent(socket, "chat.streaming-tail-updated", (event) => event.payload.segments.some((segment: {
            content: string;
        }) => segment.content.includes("Subagent fail: Patch code.")), 30000);
        expect(failMessage.payload.segments.map((segment: {
            content: string;
        }) => segment.content).join("\n")).toContain("Progress 0/2, 1 failed.");
        await adapter.waitForCall("subagent", (call) => call.prompt.includes("Inspect files slow"), 30000);
        expect(completeResolved).toBe(false);
        adapter.releaseDeferredSubagents();
        socket.removeEventListener("message", completeListener);
        socket.close();
    }, 60000);
    serverTest("surfaces aggregating run status before final completion", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-aggregating-status",
            projectId,
            threadId,
            content: "complex status window",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        const aggregatingPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "aggregating", 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-aggregating-status-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const aggregating = await aggregatingPromise;
        expect(aggregating.payload.run.status).toBe("aggregating");
        adapter.releaseDeferredAggregators();
        socket.close();
    }, 60000);
    serverTest("does not append harness connect or tool lifecycle noise to chat", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const chatMessages: string[] = [];
        const listener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "chat.message-appended" || payload.type === "thread.message-appended") {
                    chatMessages.push(payload.payload.message.content);
                }
            }
        };
        socket.addEventListener("message", listener);
        await sendChatAndExecute(socket, {
            requestId: "req-browser-noise",
            projectId,
            threadId,
            content: "browser noise"
        }, 30000);
        socket.removeEventListener("message", listener);
        expect(chatMessages.some((message) => message.includes("Harness connected. Working."))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness using"))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness finished"))).toBe(false);
        expect(chatMessages.some((message) => message.includes("Harness tool failed"))).toBe(false);
        socket.close();
    }, 60000);
}
