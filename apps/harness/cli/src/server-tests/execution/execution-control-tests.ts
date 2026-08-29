import { expect } from "bun:test";
import {  type BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { createChatSendCommand, createSocket, openProject, waitForCondition, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerExecutionControlTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("pauses globally, persists state, and rejects new execution starts until resume", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const secondSocket = createSocket(port);
        await waitForEvent(secondSocket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-pause-open");
        const pausedOnFirst = waitForEvent(socket, "execution-control.updated", (event) => event.payload.executionControl.isPaused === true);
        const pausedOnSecond = waitForEvent(secondSocket, "execution-control.updated", (event) => event.payload.executionControl.isPaused === true);
        socket.send(JSON.stringify({
            type: "execution.pause-all",
            requestId: "req-pause-all"
        }));
        await pausedOnFirst;
        await pausedOnSecond;
        expect(repository.getGlobalExecutionPaused()).toBe(true);
        const rejectedPromise = waitForEvent(socket, "command.rejected");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-paused-send",
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            content: "single-step while paused"
        })));
        const rejected = await rejectedPromise;
        expect(rejected.payload.message).toBe("Harness command failed");
        expect(rejected.payload.detail).toContain("Global execution is paused");
        const resumePromise = waitForEvent(socket, "execution-control.updated", (event) => event.payload.executionControl.isPaused === false);
        socket.send(JSON.stringify({
            type: "execution.resume-all",
            requestId: "req-resume-all"
        }));
        await resumePromise;
        expect(repository.getGlobalExecutionPaused()).toBe(false);
        secondSocket.close();
        socket.close();
    });
    serverTest("pauses assistant-owned jobs while global execution pause is active", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-assistant-job-pause-open");
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const assistantId = crypto.randomUUID();
        const assistant = repository.saveAssistant({
            id: assistantId,
            name: "Job pauser",
            scope: "project",
            projectId,
            personalityPrompt: "Keep jobs orderly.",
            jobPrompt: "Run assistant work.",
            agentId: "pi",
            providerBrand: "gpt",
            modeId: "implement",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
        });
        const assistantJobId = crypto.randomUUID();
        const standaloneJobId = crypto.randomUUID();
        const disabledAssistantJobId = crypto.randomUUID();
        const createJob = (input: {
            id: string;
            assistantId?: string;
            status: BackgroundJob["status"];
            name: string;
        }) => repository.saveBackgroundJob({
            id: input.id,
            projectId,
            ...(input.assistantId ? { assistantId: input.assistantId } : {}),
            automationThreadId: crypto.randomUUID(),
            kind: "ai-routine",
            name: input.name,
            status: input.status,
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "Check work."
            },
            schedule: {
                type: "one-off",
                runAt: now,
                sourceText: "now"
            },
            scheduleInput: "now",
            nextRunAt: now,
            createdAt: now,
            updatedAt: now
        });
        createJob({ id: assistantJobId, assistantId: assistant.id, status: "enabled", name: "Assistant enabled job" });
        createJob({ id: standaloneJobId, status: "enabled", name: "Standalone enabled job" });
        createJob({ id: disabledAssistantJobId, assistantId: assistant.id, status: "disabled", name: "Assistant disabled job" });
        repository.setGlobalExecutionPaused(true);
        const updatedPromise = waitForEvent(socket, "background-jobs.updated", (event) => event.payload.backgroundJobs.jobs.some((job: BackgroundJob) => job.id === assistantJobId && job.status === "paused"));
        socket.send(JSON.stringify({
            type: "background-job.pause-assistant-jobs",
            requestId: "req-pause-assistant-jobs"
        }));
        const updated = await updatedPromise;
        const statuses = new Map(updated.payload.backgroundJobs.jobs.map((job: BackgroundJob) => [job.id, job.status]));
        expect(statuses.get(assistantJobId)).toBe("paused");
        expect(statuses.get(standaloneJobId)).toBe("enabled");
        expect(statuses.get(disabledAssistantJobId)).toBe("disabled");
        expect(repository.getGlobalExecutionPaused()).toBe(true);
        socket.close();
    }, 15000);
    serverTest("defers planner questions raised during pause and surfaces them on resume", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot, "req-deferred-question-open");
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-slow-question",
            projectId: opened.payload.project.id,
            threadId: opened.payload.project.activeThreadId,
            content: "slow needs clarification",
            modeId: "plan",
            modeLocked: true
        })));
        const pausedPromise = waitForEvent(socket, "execution-control.updated", (event) => event.payload.executionControl.isPaused === true);
        socket.send(JSON.stringify({
            type: "execution.pause-all",
            requestId: "req-pause-before-question"
        }));
        await pausedPromise;
        await waitForCondition(() => {
            const deferredRun = repository.getProject(opened.payload.project.id).activeRun;
            return deferredRun?.status === "awaiting-user-input" && deferredRun.questions[0]?.status === "deferred";
        });
        const deferredRun = repository.getProject(opened.payload.project.id).activeRun;
        expect(deferredRun?.status).toBe("awaiting-user-input");
        expect(deferredRun?.questions[0]?.status).toBe("deferred");
        expect(repository
            .getProject(opened.payload.project.id)
            .session.messages.some((message) => message.role === "assistant" && message.content.includes("Which route should handle this?"))).toBe(false);
        const resumedPromise = waitForEvent(socket, "execution-control.updated", (event) => event.payload.executionControl.isPaused === false &&
            event.payload.executionControl.deferredPlanningQuestionCount === 0);
        const pendingRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.projectId === opened.payload.project.id &&
            event.payload.run.status === "awaiting-user-input" &&
            event.payload.run.questions[0]?.status === "pending");
        const questionMessagePromise = waitForEvent(socket, "chat.message-appended", (event) => event.payload.message.content.includes("Which route should handle this?"));
        socket.send(JSON.stringify({
            type: "execution.resume-all",
            requestId: "req-resume-question"
        }));
        await resumedPromise;
        await pendingRunPromise;
        await questionMessagePromise;
        socket.close();
    });
}
