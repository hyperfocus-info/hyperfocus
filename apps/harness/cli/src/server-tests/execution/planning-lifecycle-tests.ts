import { expect } from "bun:test";
import { answerPlanningQuestionAndExecute, createChatSendCommand, createSocket, openProject, parseMessageEventPayloads, sendChatAndExecute, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerPlanningLifecycleTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerPlanningEntryTests(serverTest, fixture);
    registerPlanningHeartbeatTests(serverTest, fixture);
    registerRepeatedPlanningQuestionTests(serverTest, fixture);
    registerPlanningStopTests(serverTest, fixture);
}

function registerPlanningEntryTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("runs low difficulty tasks on the main executor only", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const complete = await sendChatAndExecute(socket, {
            requestId: "req-low",
            projectId,
            threadId,
            content: "simple task"
        });
        expect(complete.payload.projectId).toBe(projectId);
        expect(complete.payload.assistantMessage.content).toBe("main execution result");
        expect(adapter.calls.map((call) => call.kind)).toEqual(["executor"]);
        socket.close();
    });
    serverTest("asks planner question before execution and resumes after answer", async () => {
        const { adapter, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const runPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input");
        const questionMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.role === "assistant" && event.payload.message.kind !== "run-milestones");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-question",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "needs clarification",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const runUpdate = await runPromise;
        const questionMessage = await questionMessagePromise;
        expect(runUpdate.payload.run.questions[0].prompt).toContain("Which route");
        expect(questionMessage.payload.message.content).toContain("Which route");
        expect(questionMessage.payload.state.isStreaming).toBe(false);
        expect(adapter.calls.map((call) => call.kind)).toEqual(["planner"]);
        const complete = await answerPlanningQuestionAndExecute(socket, {
            requestId: "req-question-answer",
            projectId,
            threadId,
            runId: runUpdate.payload.run.id,
            questionId: runUpdate.payload.run.questions[0].id,
            content: "api/users/[id]"
        });
        expect(complete.payload.assistantMessage.content).toBe("main execution result");
        expect(adapter.calls.map((call) => call.kind)).toEqual(["planner", "planner", "executor"]);
        socket.close();
    });
}

function registerPlanningHeartbeatTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("emits planner heartbeat milestones while a slow planner turn is still running", async () => {
        let { adapter, repository, extraProjectRoot, projectRoot, port } = fixture;
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            pickFolder: async () => extraProjectRoot,
            serverOnly: true,
            derivedProgressHeartbeatMs: 25
        });
        port = fixture.port;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const plannerHeartbeatPromise = waitForEvent(socket, "chat.streaming-tail-updated", (event) => event.payload.segments.some((segment: {
            content: string;
        }) => segment.content.includes("Planner still working. Scoping execution plan.")), 3000);
        const questionPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input", 3000);
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-planner-heartbeat",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "slow needs clarification",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const heartbeat = await plannerHeartbeatPromise;
        const runUpdate = await questionPromise;
        expect(heartbeat.payload.segments[0]?.content).toContain("**Planning**");
        expect(runUpdate.payload.run.questions[0]?.prompt).toContain("Which route");
        socket.close();
    });
}

function registerRepeatedPlanningQuestionTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("same thread can receive repeated planner questions across separate runs", async () => {
        const { projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-question-repeat-1",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "needs clarification",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const firstRun = await waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input", 10000);
        await answerPlanningQuestionAndExecute(socket, {
            requestId: "req-question-repeat-answer-1",
            projectId,
            threadId,
            runId: firstRun.payload.run.id,
            questionId: firstRun.payload.run.questions[0].id,
            content: "api/users/[id]"
        });
        const rejectedEvents: any[] = [];
        const rejectListener = (event: MessageEvent) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "command.rejected") rejectedEvents.push(payload);
            }
        };
        socket.addEventListener("message", rejectListener);
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-question-repeat-2",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "needs clarification",
                modeId: "plan",
                modeLocked: true
            }
        }));
        const secondRun = await waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.id !== firstRun.payload.run.id, 10000);
        expect(secondRun.payload.run.questions[0].id).not.toBe(firstRun.payload.run.questions[0].id);
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
    });
    serverTest("same run can receive repeated planner question ids after an answer", async () => {
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
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-same-run-repeat-question",
            projectId,
            threadId,
            content: "same-run repeated question",
            modeId: "plan",
            modeLocked: true
        })));
        const firstRun = await waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "awaiting-user-input", 10000);
        socket.send(JSON.stringify({
            type: "planning.answer",
            requestId: "req-same-run-repeat-answer-1",
            payload: {
                projectId,
                threadId,
                runId: firstRun.payload.run.id,
                questionId: firstRun.payload.run.questions[0].id,
                content: "first answer"
            }
        }));
        const secondRun = await waitForEvent(socket, "run.updated", (event) => event.payload.run.id === firstRun.payload.run.id &&
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions.length === 2, 10000);
        expect(secondRun.payload.run.questions[0].id).not.toBe(secondRun.payload.run.questions[1].id);
        expect(secondRun.payload.run.questions[0].logicalQuestionId).toBe("question-1");
        expect(secondRun.payload.run.questions[1].logicalQuestionId).toBe("question-1");
        const complete = await answerPlanningQuestionAndExecute(socket, {
            requestId: "req-same-run-repeat-answer-2",
            projectId,
            threadId,
            runId: firstRun.payload.run.id,
            questionId: secondRun.payload.run.questions[1].id,
            content: "second answer"
        }, 10000);
        expect(complete.payload.threadId).toBe(threadId);
        expect(rejectedEvents).toHaveLength(0);
        socket.removeEventListener("message", rejectListener);
        socket.close();
    }, 15000);
}

function registerPlanningStopTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("chat.stop aborts running work", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const planPromise = waitForEvent(socket, "agent.plan");
        socket.send(JSON.stringify({
            type: "chat.send",
            requestId: "req-stop",
            payload: {
                projectId,
                threadId,
                agentId: "pi",
                content: "slow task",
                modeId: "plan",
                modeLocked: true
            }
        }));
        await planPromise;
        const runId = repository.getProject(projectId).activeRun?.id;
        expect(runId).toBeDefined();
        const errorPromise = waitForEvent(socket, "chat.error");
        socket.send(JSON.stringify({
            type: "chat.stop",
            requestId: "req-stop-2",
            payload: {
                projectId,
                threadId,
                runId
            }
        }));
        const errorEvent = await errorPromise;
        expect(errorEvent.payload.message).toContain("stopped");
        socket.close();
    });
}
