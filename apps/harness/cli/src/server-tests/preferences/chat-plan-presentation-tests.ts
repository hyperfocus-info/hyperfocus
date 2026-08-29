import { expect } from "bun:test";
import { createChatSendCommand, createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerChatPlanPresentationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("emits an initial fast mode status message when enabled", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const fastModeMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.role === "system" && event.payload.message.content.includes("Fast mode enabled"), 10000);
        const readyPromise = sendChatUntilReady(socket, {
            requestId: "req-fast-mode-status",
            projectId,
            threadId,
            content: "complex task",
            fastMode: true
        }, 10000);
        const fastModeMessage = await fastModeMessagePromise;
        const ready = await readyPromise;
        expect(fastModeMessage.payload.message.content).toContain("Fast mode enabled");
        expect(ready.payload.run.status).toBe("ready");
        socket.close();
    }, 60000);
    serverTest("chat.send message append includes refreshed generated thread title", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const appendPromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.threadId === threadId && event.payload.message.role === "user", 10000);
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-generated-title-refresh",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "build sidebar sorting"
            }
        }));
        const appended = await appendPromise;
        expect(appended.payload.thread?.title).toBe("build sidebar sorting");
        expect(appended.payload.thread?.lastUserMessageAt).toBe(appended.payload.message.createdAt);
        socket.close();
    }, 60000);
    serverTest("chat.send presents a ready plan before execution", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
        const planPromise = waitForEvent(socket, "agent.plan");
        const planMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.kind === "plan-summary");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-plan-first",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "simple task",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const ready = await readyPromise;
        const plan = await planPromise;
        const planMessage = await planMessagePromise;
        expect(ready.payload.run.status).toBe("ready");
        expect(plan.payload.projectId).toBe(projectId);
        expect(planMessage.payload.message.kind).toBe("plan-summary");
        expect(planMessage.payload.state.isStreaming).toBe(false);
        expect(adapter.calls.map((call) => call.kind)).toEqual(["planner"]);
        socket.close();
    });
    serverTest("chat.send creates explicit project assistants without running project planner", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        repository.setProviderBrand("gemini");
        const assistantUpdatePromise = waitForEvent(socket, "assistants.updated", (event) => event.payload.assistants.assistants.some((assistant: {
            name: string;
        }) => assistant.name === "Catalog builder"), 10000);
        const cardPromise = waitForEvent(socket, "assistant.created-card", (event) => event.payload.assistant.name === "Catalog builder", 10000);
        const messagePromise = waitForEvent(socket, "thread.message-appended", (event) => event.payload.message.role === "assistant" && event.payload.message.content.includes("Created project assistant"), 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-create-assistant-chat",
            projectId,
            threadId,
            content: "Create a project assistant named Catalog builder to execute todo-games.md",
            executionModelId: "google/gemini-2.5-flash",
            fastMode: true
        })));
        const assistantUpdate = await assistantUpdatePromise;
        const card = await cardPromise;
        await messagePromise;
        expect(card.payload.assistant.scope).toBe("project");
        expect(card.payload.assistant.projectId).toBe(projectId);
        expect(card.payload.assistant.agentId).toBe("pi");
        expect(card.payload.assistant.providerBrand).toBe("gemini");
        expect(card.payload.assistant.executionModelId).toBe("google/gemini-2.5-flash");
        expect(card.payload.assistant.fastMode).toBe(true);
        expect(assistantUpdate.payload.assistants.assistants.some((assistant: {
            name: string;
        }) => assistant.name === "Catalog builder")).toBe(true);
        expect(adapter.calls.some((call) => call.kind === "executor")).toBe(false);
        const reconnectSocket = createSocket(port);
        const reconnectReady = await waitForEvent(reconnectSocket, "connection.ready");
        expect(reconnectReady.payload.assistants.assistants.some((assistant: {
            name: string;
            scope: string;
            projectId?: string;
            providerBrand?: string;
            executionModelId?: string;
            fastMode?: boolean;
        }) => assistant.name === "Catalog builder" &&
            assistant.scope === "project" &&
            assistant.projectId === projectId &&
            assistant.providerBrand === "gemini" &&
            assistant.executionModelId === "google/gemini-2.5-flash" &&
            assistant.fastMode === true)).toBe(true);
        reconnectSocket.close();
        socket.close();
    }, 60000);
}
