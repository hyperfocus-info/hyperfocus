import { expect } from "bun:test";
import { buildExecutionPlan } from "../../pi-orchestrator";
import { createChatSendCommand, createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerBackgroundThreadRoutingTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("routes auto correctness follow-up stream to owning thread after focus changes", async () => {
        let { repository, projectRoot, port } = fixture;
        let reviewCount = 0;
        await fixture.restartWithCustomOsAdapters({
            async runCorrectnessReview(_rootPath, executionPlan) {
                reviewCount += 1;
                if (reviewCount > 1) {
                    return {
                        status: "pass",
                        summary: "Structural review found no known gaps. Runtime behavior and domain correctness remain unverified.",
                        gaps: []
                    };
                }
                return {
                    status: "needs-iteration",
                    summary: "Need one follow-up stream.",
                    gaps: [
                        {
                            id: "follow-up-stream",
                            category: "runnable-gap",
                            severity: "high",
                            description: "Initial output needs one streaming follow-up.",
                            suggestedFix: "Run a follow-up on the same thread.",
                            canParallelize: false,
                            ownedPaths: []
                        }
                    ],
                    recommendedPlan: buildExecutionPlan({
                        runId: executionPlan.runId,
                        planningModelId: executionPlan.planningModelId,
                        plannerResult: {
                            type: "ready",
                            difficultyScore: 20,
                            summary: "Follow-up stream",
                            executionModelId: executionPlan.executionModelId,
                            usesSubagents: false,
                            subtasks: [],
                            finalExecutionBrief: "streaming refresh"
                        },
                        subagentWorktreeStrategy: "same-worktree",
                        planExecutionMode: "immediate",
                        planExecutionDelaySeconds: 0,
                        correctnessIterationMode: "auto-once",
                        ruleSources: executionPlan.ruleSources,
                        iteration: executionPlan.iteration + 1,
                        origin: "correctness-followup"
                    })
                };
            }
        });
        port = fixture.port;
        repository.setCorrectnessIterationModeDefault("auto-once");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-correctness-followup-route-send",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh"
        });
        const firstDeltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId && event.payload.delta === "working", 10000);
        const completePromise = waitForEvent(socket, "chat.complete", (event) => event.payload.projectId === projectId && event.payload.threadId === originalThreadId, 10000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-correctness-followup-route-execute",
            payload: {
                projectId,
                threadId: originalThreadId,
                runId: ready.payload.run.id
            }
        }));
        await firstDeltaPromise;
        const createThreadPromise = waitForEvent(socket, "thread.created");
        socket.send(JSON.stringify({
            type: "thread.create",
            requestId: "req-correctness-followup-route-create",
            payload: {
                projectId
            }
        }));
        const created = await createThreadPromise;
        const focusedThreadId = created.payload.project.activeThreadId;
        expect(focusedThreadId).not.toBe(originalThreadId);
        const followUpDelta = await waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId && event.payload.delta === "working", 10000);
        expect(followUpDelta.payload.sessionId).toBe(originalThreadId);
        expect(repository.getProject(projectId).activeThreadId).toBe(focusedThreadId);
        await completePromise;
        const milestones = repository.getThreadMessages(projectId, originalThreadId)
            .filter((message) => message.kind === "run-milestones")
            .map((message) => message.content).join("\n");
        expect(milestones).toContain("Runtime behavior and domain correctness remain unverified.");
        expect(milestones).not.toContain("Correctness review passed.");
        socket.close();
    }, 15000);
    serverTest("deleting a background streaming thread stops its active agents", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const readyPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-delete-streaming-thread-send",
            projectId,
            threadId: originalThreadId,
            content: "streaming refresh"
        })));
        const ready = await readyPromise;
        const runningRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "running-main");
        const deltaPromise = waitForEvent(socket, "chat.delta", (event) => event.payload.threadId === originalThreadId);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-delete-streaming-thread-execute",
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
            requestId: "req-delete-streaming-thread-create",
            payload: {
                projectId
            }
        }));
        await createThreadPromise;
        const stoppedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "stopped", 10000);
        const projectUpdatedPromise = waitForEvent(socket, "project.updated", (event) => event.payload.project.threads.some((thread: any) => thread.id === originalThreadId && thread.status === "archived"), 10000);
        socket.send(JSON.stringify({
            type: "thread.archive",
            requestId: "req-delete-streaming-thread-archive",
            payload: {
                projectId,
                threadId: originalThreadId
            }
        }));
        const stoppedRun = await stoppedRunPromise;
        await projectUpdatedPromise;
        expect(stoppedRun.payload.run.failureMessage).toBe("Thread deleted; active agents stopped");
        expect(repository.getRun(projectId, ready.payload.run.id)?.status).toBe("stopped");
        expect(repository.getProject(projectId).threads.find((thread) => thread.id === originalThreadId)?.status).toBe("archived");
        socket.close();
    }, 10000);
    serverTest("planner question from background thread stays on owning thread after focus changes", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const originalThreadId = opened.payload.project.activeThreadId;
        const questionRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.threadId === originalThreadId && event.payload.run.status === "awaiting-user-input", 10000);
        const questionMessagePromise = waitForEvent(socket, "thread.message-appended", (event) => event.payload.threadId === originalThreadId &&
            event.payload.message.content.includes("Which route should handle this?"), 10000);
        const createThreadPromise = waitForEvent(socket, "thread.created");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-background-question-send",
            projectId,
            threadId: originalThreadId,
            content: "slow needs clarification",
            modeId: "plan",
            modeLocked: true
        })));
        socket.send(JSON.stringify({
            type: "thread.create",
            requestId: "req-background-question-create",
            payload: {
                projectId
            }
        }));
        const created = await createThreadPromise;
        const focusedThreadId = created.payload.project.activeThreadId;
        expect(focusedThreadId).not.toBe(originalThreadId);
        const questionRun = await questionRunPromise;
        const questionMessage = await questionMessagePromise;
        expect(questionRun.payload.run.threadId).toBe(originalThreadId);
        expect(questionMessage.payload.threadId).toBe(originalThreadId);
        expect(repository.getProject(projectId).activeThreadId).toBe(focusedThreadId);
        const persistedQuestion = repository.getThreadMessages(projectId, originalThreadId)
            .find((message) => message.id === questionMessage.payload.message.id);
        expect(persistedQuestion?.content).toContain("Which route should handle this?");
        expect(repository.getThreadMessages(projectId, focusedThreadId).some((message) => message.content.includes("Which route should handle this?"))).toBe(false);
        socket.close();
    }, 10000);
}
