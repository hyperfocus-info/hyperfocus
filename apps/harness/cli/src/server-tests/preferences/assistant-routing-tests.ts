import { expect } from "bun:test";
import { createChatSendCommand, createSocket, openProject, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerAssistantRoutingTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("chat.send asks for purpose before creating underspecified project assistants", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions.some((question: {
                prompt: string;
                responseKind?: string;
            }) => question.responseKind === "freeform" && question.prompt.includes("What should kojima do for this project?")), 10000);
        const questionMessagePromise = waitForEvent(socket, "thread.message-appended", (event) => event.payload.message.role === "assistant" && event.payload.message.content.includes("What should kojima do"), 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-create-assistant-needs-purpose",
            projectId,
            threadId,
            content: "create a new local project assistant kojima"
        })));
        const questionRun = await questionRunPromise;
        await questionMessagePromise;
        const question = questionRun.payload.run.questions[0];
        expect(question.responseKind).toBe("freeform");
        expect(question.choices).toBeUndefined();
        expect(adapter.calls).toHaveLength(0);
        const cardPromise = waitForEvent(socket, "assistant.created-card", (event) => event.payload.assistant.name === "kojima", 10000);
        const actionMessagePromise = waitForEvent(socket, "thread.message-appended", (event) => event.payload.message.metadata?.type === "assistant-action" && event.payload.message.metadata.actionKind === "create", 10000);
        const completedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === questionRun.payload.run.id && event.payload.run.status === "completed", 10000);
        socket.send(JSON.stringify({
            type: "planning.answer",
            requestId: "req-create-assistant-purpose-answer",
            payload: {
                projectId,
                threadId,
                runId: questionRun.payload.run.id,
                questionId: question.id,
                content: "Maintain project docs and surface stale todos."
            }
        }));
        await cardPromise;
        await actionMessagePromise;
        await completedRunPromise;
        const assistant = repository.loadAssistantsState().assistants.find((entry) => entry.name === "kojima");
        expect(assistant?.jobPrompt).toContain("Maintain project docs and surface stale todos.");
        socket.close();
    }, 60000);
    serverTest("chat.send purpose question can cancel assistant creation", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-create-assistant-cancel-start",
            projectId,
            threadId,
            content: "create a new local project assistant cancelbot"
        })));
        const questionRun = await questionRunPromise;
        const question = questionRun.payload.run.questions[0];
        const stoppedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === questionRun.payload.run.id && event.payload.run.status === "stopped", 10000);
        socket.send(JSON.stringify({
            type: "planning.answer",
            requestId: "req-create-assistant-cancel-answer",
            payload: {
                projectId,
                threadId,
                runId: questionRun.payload.run.id,
                questionId: question.id,
                content: "cancel"
            }
        }));
        await stoppedRunPromise;
        expect(repository.loadAssistantsState().assistants.some((assistant) => assistant.name === "cancelbot")).toBe(false);
        socket.close();
    }, 60000);
    serverTest("chat.send runs unknown assistant-like prompts as normal project chat", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-ambiguous-assistant-chat",
            projectId,
            threadId,
            content: "Catalog builder start executing todos"
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.questions).toHaveLength(0);
        expect(repository.loadAssistantsState().assistants.some((assistant) => assistant.name === "Catalog builder")).toBe(false);
        socket.close();
    }, 60000);
    serverTest("chat.send keeps assistant-choice complaints in normal project chat flow", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === threadId &&
            event.payload.run.status === "ready" &&
            event.payload.run.latestUserPrompt.includes("I keep running into an issue"), 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-assistant-complaint-normal-chat",
            projectId,
            threadId,
            content: `I keep running into an issue where this product wants me to choose and assistant but I just want to run the code.
  Thread Id
  '''
  5ea22a55-1dd0-4ec7-9371-129c67f4dd4e
  ec32e89b-08a3-41a5-80bf-6823701343f0
  8e40122a-4916-4f36-b9fc-f883f30801da
  '''`
        })));
        const ready = await readyPromise;
        expect(ready.payload.run.questions).toHaveLength(0);
        expect(ready.payload.run.plan?.mode?.id).toBe("implement");
        expect(ready.payload.run.plan?.gating.mode).toBe("immediate");
        socket.close();
    }, 60000);
    serverTest("assistant.create-from-thread creates and dedupes project assistants", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const cardPromise = waitForEvent(socket, "assistant.created-card", (event) => event.payload.assistant.name === "Catalog builder", 10000);
        socket.send(JSON.stringify({
            type: "assistant.create-from-thread",
            requestId: "req-create-from-thread",
            payload: {
                projectId,
                threadId,
                sourcePrompt: "Catalog builder start executing todos",
                name: "Catalog builder"
            }
        }));
        await cardPromise;
        const secondCardPromise = waitForEvent(socket, "assistant.created-card", (event) => event.payload.assistant.name === "Catalog builder", 10000);
        socket.send(JSON.stringify({
            type: "assistant.create-from-thread",
            requestId: "req-create-from-thread-repeat",
            payload: {
                projectId,
                threadId,
                sourcePrompt: "Catalog builder start executing todos",
                name: "Catalog builder"
            }
        }));
        await secondCardPromise;
        expect(repository.loadAssistantsState().assistants.filter((assistant) => assistant.name === "Catalog builder")).toHaveLength(1);
        socket.close();
    }, 60000);
}
