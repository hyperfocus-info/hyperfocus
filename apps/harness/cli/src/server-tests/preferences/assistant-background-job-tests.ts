import { expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createAssistantAssetRefId, createAssistantTodoId, type Assistant, type BackgroundJob, type NotificationInboxItem } from "@hyperfocus/ai-core/protocol";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFakeCodexRuntime } from "../../test-support/fake-codex-runtime";
import { createFakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { buildAssistantJobBootstrapQuestion } from "../../assistant-job-bootstrap";
import { createSocket, openProject, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerAssistantBackgroundJobTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerAssistantOutcomeTests(serverTest, fixture);
    registerAssistantExecutionTests(serverTest, fixture);
    registerAssistantLifecycleTests(serverTest, fixture);
}

function registerAssistantOutcomeTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("background prerequisites persist verified progress and block dependent execution on failure", async () => {
        const { repository, projectRoot, adapter } = fixture;
        await Bun.write(`${projectRoot}/prereq-ok.ts`, "process.exit(0);");
        await Bun.write(`${projectRoot}/prereq-fail.ts`, "process.exit(7);");
        let prerequisiteCalls = 0;
        let dependentCalls = 0;
        await fixture.restart({ adapter: { ...adapter, async runPrompt(request) {
            if (request.kind !== "planner") { prerequisiteCalls++; return { text: "Setup complete." }; }
            return { text: JSON.stringify({ type: "ready", summary: "Run after setup", difficultyScore: 20,
                executionModelId: "openai/gpt-5.4", usesSubagents: false, subtasks: [], finalExecutionBrief: "Run after setup",
                prerequisites: ["ok", "fail"].map((id) => ({ id, title: id, instruction: `Prepare ${id}`,
                    reason: "Required setup", owner: "main", status: "pending", requiredForTaskIds: [],
                    verificationCommands: [`bun prereq-${id}.ts`] })) }) };
        }, async startExecution(request) { dependentCalls++; return adapter.startExecution(request); } } });
        const socket = createSocket(fixture.port);
        await waitForEvent(socket, "connection.ready");
        const projectId = (await openProject(socket, projectRoot)).payload.project.id;
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({ id: jobId, projectId, automationThreadId: crypto.randomUUID(),
            kind: "ai-routine", name: "Prerequisite guard", status: "enabled", riskLevel: "safe",
            definition: { kind: "ai-routine", prompt: "Run after verified setup.", modeId: "implement" },
            schedule: { type: "one-off", runAt: now, sourceText: "now" }, scheduleInput: "now",
            nextRunAt: now, createdAt: now, updatedAt: now });
        const failed = waitForEvent(socket, "background-job-run.updated", (event) =>
            event.payload.run.jobId === jobId && event.payload.run.status === "failed", 10000);
        socket.send(JSON.stringify({ type: "background-job.run-now", requestId: "prerequisite-guard", payload: { projectId, jobId } }));
        const run = (await failed).payload.run;
        expect(run.failureMessage).toContain("exit 7");
        expect(prerequisiteCalls).toBe(2);
        expect(dependentCalls).toBe(0);
        expect(repository.getRun(projectId, run.linkedAgentRunId!)?.plan?.prerequisites.map((entry) => entry.status))
            .toEqual(["completed", "pending"]);
        socket.close();
    }, 60000);
    for (const scenario of ["runtime failure", "unresolved planner batch", "unanswered assistant question"] as const) {
        serverTest(`assistant background ${scenario} never becomes successful from question policy`, async () => {
            const { repository, projectRoot, adapter } = fixture;
            let plannerCalls = 0;
            const choices = ["Continue", "Wait", "Review"].map((label, index) => ({
                id: `choice-${index}`, label, description: label, answerText: label, recommended: index === 0
            }));
            await fixture.restart({ adapter: { ...adapter, async runPrompt(request) {
                if (request.kind !== "planner") return adapter.runPrompt(request);
                plannerCalls++;
                if (scenario === "runtime failure") throw new Error("Connection refused. Is the service running?");
                return { text: JSON.stringify({ type: "question", summary: "Need input", questions: [
                    { id: "target", prompt: "Which project should I inspect?", choices, required: true },
                    ...(scenario === "unresolved planner batch"
                        ? [{ id: "destructive", prompt: "Should I delete production data?", choices, required: true }] : [])
                ] }) };
            } } });
            const socket = createSocket(fixture.port);
            await waitForEvent(socket, "connection.ready");
            const projectId = (await openProject(socket, projectRoot)).payload.project.id;
            const now = new Date().toISOString();
            const assistantId = crypto.randomUUID();
            const jobId = crypto.randomUUID();
            const questionId = crypto.randomUUID();
            repository.saveAssistant({ id: assistantId, name: "Outcome guard", scope: "project", projectId,
                personalityPrompt: "Be concise.", jobPrompt: "Inspect requested work.", agentId: "pi",
                runState: "active", bootstrapState: "completed", failureStreakCount: 0,
                circuitBreakerState: "closed", unreadQuestionCount: 0, createdAt: now, updatedAt: now });
            if (scenario === "unanswered assistant question") repository.saveAssistantQuestion({ id: questionId,
                assistantId, prompt: "Which project should I inspect?", status: "deferred", askedAt: now });
            repository.saveBackgroundJob({ id: jobId, projectId, assistantId, automationThreadId: crypto.randomUUID(),
                kind: "ai-routine", name: "Outcome guard", status: "enabled", riskLevel: "safe",
                definition: { kind: "ai-routine", prompt: "Inspect requested work.", modeId: "implement" },
                schedule: { type: "one-off", runAt: now, sourceText: "now" }, scheduleInput: "now",
                nextRunAt: now, createdAt: now, updatedAt: now });
            const status = scenario === "runtime failure" ? "failed" : "awaiting-user-input";
            const notification = waitForEvent(socket, "notifications.updated", (event) => event.payload.notifications.items.some(
                (item: NotificationInboxItem) => item.kind === "background-run-status" && item.jobId === jobId &&
                    item.title === (status === "failed" ? "Background task failed" : "Background task needs input")), 10000);
            socket.send(JSON.stringify({ type: "background-job.run-now", requestId: "outcome-guard", payload: { projectId, jobId } }));
            await notification;
            const run = repository.loadBackgroundJobsState().runs.find((entry) => entry.jobId === jobId);
            expect(run?.status).toBe(status);
            expect(run?.events.some((event) => event.stage === "done")).toBe(false);
            if (scenario === "runtime failure") {
                expect(run?.failureMessage).toContain("Connection refused");
                expect(repository.getAssistant(assistantId)?.failureStreakCount).toBe(1);
            } else {
                expect(run?.linkedAgentRunId).toBeDefined();
                const linked = repository.getRun(projectId, run!.linkedAgentRunId!);
                expect(linked?.questions.filter((question) => question.status === "deferred"))
                    .toHaveLength(scenario === "unresolved planner batch" ? 2 : 1);
                expect(plannerCalls).toBe(1);
                if (scenario === "unanswered assistant question") {
                    expect(repository.getAssistantQuestion(questionId)?.status).toBe("deferred");
                    expect(run?.events.some((event) => event.stage === "question-auto-resolved")).toBe(false);
                }
            }
            socket.close();
        }, 60000);
    }
}

function registerAssistantExecutionTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("assistant-owned background jobs use the assistant runtime", async () => {
        let { adapter, repository, projectRoot, port } = fixture;
        const codexAdapter = createFakePiAgentAdapter();
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            runtimeRegistry: createAgentRuntimeRegistry([createPiRuntime(adapter), createFakeCodexRuntime(codexAdapter)]),
            serverOnly: true
        });
        port = fixture.port;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const assistantId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        const assistant = repository.saveAssistant({
            id: assistantId,
            name: "Codex job helper",
            scope: "project",
            projectId,
            personalityPrompt: "Run background work.",
            jobPrompt: "Handle background job prompts.",
            agentId: "codex-cli",
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
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            assistantId: assistant.id,
            automationThreadId: crypto.randomUUID(),
            kind: "ai-routine",
            name: "Codex assistant job",
            status: "enabled",
            riskLevel: "unsafe",
            definition: {
                kind: "ai-routine",
                prompt: "single background task",
                modeId: "implement"
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
        const codexPlannerPromise = codexAdapter.waitForCall("planner");
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-codex-assistant-job",
            payload: {
                projectId,
                jobId
            }
        }));
        const plannerCall = await codexPlannerPromise;
        expect(plannerCall.modelId).toBe("openai/gpt-5.4");
        expect(adapter.calls).toHaveLength(0);
        socket.close();
    }, 60000);
    serverTest("background job run updates stream execution log events", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            automationThreadId: crypto.randomUUID(),
            kind: "ai-routine",
            name: "Streaming log job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "streaming refresh background job",
                modeId: "implement",
                subagentWorktreeStrategy: "separate-worktrees"
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
        const streamingLogPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.jobId === jobId &&
            event.payload.run.status === "running" &&
            event.payload.run.events.some((entry: {
                stage: string;
            }) => entry.stage === "input"), 10000);
        const completedPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.jobId === jobId && event.payload.run.status === "succeeded", 10000);
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-streaming-job-log",
            payload: {
                projectId,
                jobId
            }
        }));
        const streamingLog = await streamingLogPromise;
        expect(streamingLog.payload.run.events.some((entry: {
            message: string;
        }) => entry.message === "Background AI prompt")).toBe(true);
        await completedPromise;
        socket.close();
    }, 60000);
    serverTest("background job usage updates app token counters", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            automationThreadId: crypto.randomUUID(),
            kind: "ai-routine",
            name: "Usage counter job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "usage counter background job",
                modeId: "implement"
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
        const usageUpdatedPromise = waitForEvent(socket, "usage.updated", (event) => event.payload.tokenUsage.session.totalTokensIncludingCached > 0, 10000);
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-background-usage",
            payload: {
                projectId,
                jobId
            }
        }));
        const usageUpdated = await usageUpdatedPromise;
        expect(usageUpdated.payload.tokenUsage.session.events).toBeGreaterThan(0);
        expect(usageUpdated.payload.tokenUsage.lifetime.totalTokensIncludingCached).toBeGreaterThan(0);
        socket.close();
    }, 60000);
}

function registerAssistantLifecycleTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("background job run-now repairs policy-suppressed planning questions before queuing", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const assistantId = crypto.randomUUID();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveAssistant({
            id: assistantId,
            name: "Kojima helper",
            scope: "project",
            projectId,
            personalityPrompt: "Run browser game sweeps.",
            jobPrompt: "Use durable guidance without asking repeat target-selection questions.",
            agentId: "pi",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
        });
        repository.saveAssistantLearning({
            id: crypto.randomUUID(),
            assistantId,
            summary: "For sweep passes, pick a random browser-playable game unless told otherwise.",
            source: "test",
            confidence: "high",
            createdAt: now
        });
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            assistantId,
            automationThreadId,
            kind: "ai-routine",
            name: "Kojima patrol",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "Run browser game sweep",
                modeId: "implement"
            },
            schedule: {
                type: "interval",
                intervalSeconds: 600,
                nextRunAt: now,
                sourceText: "10m"
            },
            scheduleInput: "10m",
            nextRunAt: now,
            createdAt: now,
            updatedAt: now
        });
        repository.createAgentRun(projectId, "Run browser game sweep", "openai/gpt-5.4", automationThreadId);
        const linkedRun = repository.getLatestThreadRun(projectId, automationThreadId);
        if (!linkedRun) {
            throw new Error("Expected linked run");
        }
        repository.appendPlanningQuestion(projectId, linkedRun.id, {
            id: "target-selection",
            prompt: "What should I use as the concrete sweep input for this pass?",
            choices: [
                {
                    id: "choice-1",
                    label: "Guidance",
                    description: "Use durable guidance.",
                    answerText: "Use durable target guidance.",
                    recommended: true
                },
                {
                    id: "choice-2",
                    label: "Current context",
                    description: "Use current context.",
                    answerText: "Use current context.",
                    recommended: false
                },
                {
                    id: "choice-3",
                    label: "Ask",
                    description: "Ask the user.",
                    answerText: "Ask the user.",
                    recommended: false
                }
            ],
            required: true
        }, "deferred");
        const staleRun = repository.createBackgroundJobRun({
            jobId,
            projectId,
            assistantId,
            automationThreadId,
            triggerSource: "schedule",
            status: "awaiting-user-input",
            riskLevel: "safe",
            approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(staleRun.id, "awaiting-user-input", { linkedAgentRunId: linkedRun.id });
        const completedPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.jobId === jobId && event.payload.run.id !== staleRun.id && event.payload.run.status === "succeeded", 10000);
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-repair-question-job",
            payload: {
                projectId,
                jobId
            }
        }));
        await completedPromise;
        const repairedRun = repository.getBackgroundJobRun(staleRun.id);
        expect(repairedRun?.status).toBe("skipped");
        expect(repairedRun?.summary).toBe("Planning question auto-resolved; run will retry on next cadence");
        expect(repository.getActiveBackgroundJobRuns(jobId)).toHaveLength(0);
        socket.close();
    }, 60000);
    serverTest("direct and bulk assistant deletion broadcast archived question notifications", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const projectId = (await openProject(socket, projectRoot)).payload.project.id;
        const now = new Date().toISOString();
        const saveAssistantWithQuestion = (name: string) => {
            const assistantId = crypto.randomUUID();
            const questionId = crypto.randomUUID();
            const assistant: Assistant = { id: assistantId, name, scope: "project", projectId,
                personalityPrompt: "Be exact.", jobPrompt: "Exercise deletion.", agentId: "pi", runState: "active",
                bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
                unreadQuestionCount: 0, createdAt: now, updatedAt: now };
            repository.saveAssistant(assistant);
            repository.saveAssistantQuestion({ id: questionId, assistantId, prompt: "Delete me?", status: "pending", askedAt: now });
            repository.syncAssistantQuestionNotifications(assistantId);
            const job = savePagedJob(repository, projectId, assistantId, `${name} job`, 0);
            repository.createAgentRun(projectId, "Linked deletion run", "openai/gpt-5.4", job.automationThreadId);
            const linkedRun = repository.getLatestThreadRun(projectId, job.automationThreadId);
            if (!linkedRun) throw new Error("Expected linked deletion run");
            repository.setAgentRunStatus(projectId, linkedRun.id, "running-main");
            const backgroundRun = repository.createBackgroundJobRun({ jobId: job.id, projectId,
                assistantId, automationThreadId: job.automationThreadId, triggerSource: "manual", status: "running",
                riskLevel: "safe", approvalStatus: "approved" });
            repository.setBackgroundJobRunStatus(backgroundRun.id, "running", { linkedAgentRunId: linkedRun.id });
            const jobId = job.id;
            return { assistantId, questionId, jobId };
        };
        const direct = saveAssistantWithQuestion("Direct delete");
        const bulk = saveAssistantWithQuestion("Bulk delete");
        const getProject = repository.getProject.bind(repository);
        repository.getProject = (id) => {
            if (id === projectId) throw new Error("post-commit rehydration failed");
            return getProject(id);
        };
        const directNotifications = waitForEvent(socket, "notifications.updated", (event) => event.requestId === "req-delete-assistant");
        const directDeleted = waitForEvent(socket, "background-jobs.deleted", (event) => event.requestId === "req-delete-assistant");
        socket.send(JSON.stringify({ type: "assistant.delete", requestId: "req-delete-assistant",
            payload: { assistantId: direct.assistantId } }));
        expect((await directDeleted).payload.deletedJobIds).toEqual([direct.jobId]);
        expect((await directNotifications).payload.notifications.items.some((item: NotificationInboxItem) =>
            item.kind === "assistant-question" && item.questionId === direct.questionId && !item.archivedAt)).toBe(false);

        const bulkNotifications = waitForEvent(socket, "notifications.updated", (event) => event.requestId === "req-bulk-delete-assistant");
        const bulkApplied = waitForEvent(socket, "bulk-operation.applied", (event) => event.requestId === "req-bulk-delete-assistant");
        const bulkDeleted = waitForEvent(socket, "background-jobs.deleted", (event) => event.requestId === "req-bulk-delete-assistant");
        socket.send(JSON.stringify({ type: "bulk-operation.apply", requestId: "req-bulk-delete-assistant",
            payload: { operationId: "bulk-delete-assistant", action: "delete",
                targets: [{ kind: "assistant", assistantId: bulk.assistantId }] } }));
        expect((await bulkApplied).payload.results[0]?.status).toBe("applied");
        expect((await bulkDeleted).payload.deletedJobIds).toEqual([bulk.jobId]);
        expect((await bulkNotifications).payload.notifications.items.some((item: NotificationInboxItem) =>
            item.kind === "assistant-question" && item.questionId === bulk.questionId && !item.archivedAt)).toBe(false);
        repository.getProject = getProject;
        socket.close();
    });
}

export function registerAssistantJobPageTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerAssistantWorkloadPaginationTests(serverTest, fixture);
    registerAssistantWorkloadMutationTests(serverTest, fixture);
}

function registerAssistantWorkloadPaginationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("assistant job listing paginates assistant-owned jobs and runs", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const targetAssistant = savePagedAssistant(repository, projectId, "Target assistant");
        const otherAssistant = savePagedAssistant(repository, projectId, "Other assistant");
        const targetJobs = Array.from({ length: 3 }, (_, index) =>
            savePagedJob(repository, projectId, targetAssistant.id, `Target job ${index + 1}`, index)
        );
        const otherJob = savePagedJob(repository, projectId, otherAssistant.id, "Other job", 10);
        const targetRuns = targetJobs.map((job) =>
            repository.createBackgroundJobRun({
                jobId: job.id,
                projectId,
                assistantId: job.assistantId,
                automationThreadId: job.automationThreadId,
                triggerSource: "manual",
                status: "succeeded",
                riskLevel: "safe",
                approvalStatus: "not-needed"
            })
        );
        for (let index = 0; index < 513; index += 1) {
            repository.appendBackgroundJobRunEvent(targetRuns[0].id, "done", `Event ${index}`);
        }
        expect(repository.getBackgroundJobRun(targetRuns[0].id)?.events).toHaveLength(512);
        repository.createBackgroundJobRun({
            jobId: otherJob.id, projectId, assistantId: otherJob.assistantId,
            automationThreadId: otherJob.automationThreadId, triggerSource: "manual",
            status: "succeeded", riskLevel: "safe", approvalStatus: "not-needed"
        });
        const firstPagePromise = waitForEvent(socket, "assistant.workloads.listed", (event) =>
            event.requestId === "req-assistant-workload-first"
        );
        socket.send(JSON.stringify({
            type: "assistant.workloads.list",
            requestId: "req-assistant-workload-first",
            payload: {
                assistantId: targetAssistant.id,
                jobs: { limit: 2 },
                runs: { limit: 2 }
            }
        }));
        const firstPage = await firstPagePromise;
        expect(firstPage.payload.jobs.items).toHaveLength(2);
        expect(firstPage.payload.runs.items).toHaveLength(2);
        expect(firstPage.payload.jobs.nextCursor).toBeString();
        expect(firstPage.payload.runs.nextCursor).toBeString();
        expect(firstPage.payload.jobs.items.every((job: BackgroundJob) => job.assistantId === targetAssistant.id)).toBe(true);
        expect(firstPage.payload.runs.items.every((run: { assistantId?: string }) => run.assistantId === targetAssistant.id)).toBe(true);
        expect(firstPage.payload.runs.items.every((run: { events: unknown[] }) => run.events.length === 0)).toBe(true);
        const unseenJob = targetJobs.find((job) => !firstPage.payload.jobs.items.some((item: BackgroundJob) => item.id === job.id))!;
        const unseenRun = targetRuns.find((run) => !firstPage.payload.runs.items.some((item: { id: string }) => item.id === run.id))!;
        repository.saveBackgroundJob({ ...unseenJob, status: "enabled" });
        repository.setBackgroundJobRunPromptStats(unseenRun.id, { promptChars: 1, promptHash: "inter-page-update" });
        const secondPagePromise = waitForEvent(socket, "assistant.workloads.listed", (event) =>
            event.requestId === "req-assistant-workload-second"
        );
        socket.send(JSON.stringify({
            type: "assistant.workloads.list",
            requestId: "req-assistant-workload-second",
            payload: {
                assistantId: targetAssistant.id,
                jobs: { cursor: firstPage.payload.jobs.nextCursor, limit: 2 },
                runs: { cursor: firstPage.payload.runs.nextCursor, limit: 2 }
            }
        }));
        const secondPage = await secondPagePromise;
        expect(secondPage.payload.jobsCursor).toBe(firstPage.payload.jobs.nextCursor);
        expect(secondPage.payload.runsCursor).toBe(firstPage.payload.runs.nextCursor);
        expect(secondPage.payload.jobs.items).toHaveLength(1);
        expect(secondPage.payload.runs.items).toHaveLength(1);
        expect(secondPage.payload.jobs.nextCursor).toBeUndefined();
        expect(secondPage.payload.runs.nextCursor).toBeUndefined();
        expect(secondPage.payload.runs.items.every((run: { events: unknown[] }) => run.events.length === 0)).toBe(true);
        expect(new Set([...firstPage.payload.jobs.items, ...secondPage.payload.jobs.items].map((job: BackgroundJob) => job.id))).toEqual(
            new Set(targetJobs.map((job) => job.id))
        );
        expect(new Set([...firstPage.payload.runs.items, ...secondPage.payload.runs.items].map((run: { id: string }) => run.id))).toEqual(
            new Set(targetRuns.map((run) => run.id))
        );

        for (const [requestId, assistantId, jobs] of [
            ["req-assistant-workload-malformed", targetAssistant.id, { cursor: "not-json", limit: 2 }],
            ["req-assistant-workload-cross-owner", otherAssistant.id, { cursor: firstPage.payload.jobs.nextCursor, limit: 2 }],
            ["req-assistant-workload-oversized", targetAssistant.id, { cursor: "z".repeat(4097), limit: 2 }]
        ] as const) {
            const rejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === requestId);
            socket.send(JSON.stringify({ type: "assistant.workloads.list", requestId, payload: { assistantId, jobs } }));
            expect((await rejectedPromise).payload.code).toBe("invalid-cursor");
        }
        const swappedRejectedPromise = waitForEvent(socket, "command.rejected", (event) =>
            event.requestId === "req-assistant-workload-swapped"
        );
        socket.send(JSON.stringify({
            type: "assistant.workloads.list",
            requestId: "req-assistant-workload-swapped",
            payload: { assistantId: targetAssistant.id, runs: { cursor: firstPage.payload.jobs.nextCursor, limit: 2 } }
        }));
        expect((await swappedRejectedPromise).payload.code).toBe("invalid-cursor");
        const sourcePromise = waitForEvent(socket, "background-job.source.loaded", (event) =>
            event.requestId === "req-assistant-workload-source"
        );
        socket.send(JSON.stringify({
            type: "background-job.source.open",
            requestId: "req-assistant-workload-source",
            payload: { kind: "run", projectId, runId: targetRuns[0].id }
        }));
        const source = await sourcePromise;
        expect(source.payload.kind).toBe("run");
        expect(source.payload.job.id).toBe(targetRuns[0].jobId);
        expect(source.payload.run.id).toBe(targetRuns[0].id);
        expect(source.payload.run.events).toHaveLength(512);
        expect(source.payload.run.events[0]?.message).toBe("Event 1");
        expect(source.payload.run.events.at(-1)?.message).toBe("Event 512");
        socket.close();
    });
}

function registerAssistantWorkloadMutationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("assistant job bootstrap dedupes an owned job outside the bounded snapshot", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const targetAssistant = savePagedAssistant(repository, projectId, "Bootstrap target");
        const otherAssistant = savePagedAssistant(repository, projectId, "Snapshot filler");
        const targetJob = savePagedJob(repository, projectId, targetAssistant.id, "Existing target job", 0);
        const fillerJob = savePagedJob(repository, projectId, otherAssistant.id, "Filler job", 1);
        insertBackgroundJobCopies(repository, fillerJob.id, 512);
        expect(repository.loadBackgroundJobsState().jobs.some((job) => job.id === targetJob.id)).toBe(false);
        const question = repository.saveAssistantQuestion(buildAssistantJobBootstrapQuestion(targetAssistant, "pending"));
        repository.syncAssistantQuestionNotifications();
        expect(repository.loadNotificationInboxState().items.some((item) => item.kind === "assistant-question" && !item.archivedAt)).toBe(true);

        const updatedPromise = waitForEvent(socket, "background-jobs.updated");
        const invalidatedPromise = waitForEvent(socket, "assistants.updated", (event) =>
            event.payload.invalidatedDetailAssistantIds?.includes(targetAssistant.id)
        );
        socket.send(JSON.stringify({
            type: "assistant.jobs.bootstrap",
            requestId: "req-assistant-bootstrap-dedupe",
            payload: { assistantId: targetAssistant.id }
        }));
        await updatedPromise;
        expect((await invalidatedPromise).payload.invalidatedDetailAssistantIds).toEqual([targetAssistant.id]);

        expect(repository.listAssistantBackgroundJobs({ assistantId: targetAssistant.id, limit: 10 }).items.map((job) => job.id))
            .toEqual([targetJob.id]);
        expect(repository.getAssistantQuestion(question.id)?.status).toBe("answered");
        expect(repository.loadNotificationInboxState().items.some((item) => item.kind === "assistant-question" && !item.archivedAt)).toBe(false);
        socket.close();
    });
    serverTest("assistant asset and todo mutations invalidate owned detail", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const projectId = (await openProject(socket, projectRoot)).payload.project.id;
        const assistant = savePagedAssistant(repository, projectId, "Detail publication");
        const now = new Date().toISOString();
        const assetRef = { id: createAssistantAssetRefId(), assistantId: assistant.id, kind: "background-template" as const,
            label: "Scheduled task", value: "scheduled-task", resolutionStatus: "resolved" as const, createdAt: now };
        const assetInvalidated = waitForEvent(socket, "assistants.updated", (event) =>
            event.payload.invalidatedDetailAssistantIds?.includes(assistant.id)
        );
        socket.send(JSON.stringify({ type: "assistant.update", requestId: "req-assistant-assets",
            payload: { assistant: { ...assistant, updatedAt: now }, assetRefs: [assetRef] } }));
        expect((await assetInvalidated).payload.invalidatedDetailAssistantIds).toEqual([assistant.id]);
        expect(repository.getAssistantAssetRefs(assistant.id)).toEqual([
            expect.objectContaining(assetRef)
        ]);

        const todo = repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId: assistant.id,
            title: "Publish todo", state: "pending", sortOrder: 0, createdAt: now, updatedAt: now });
        const todoInvalidated = waitForEvent(socket, "assistants.updated", (event) =>
            event.payload.invalidatedDetailAssistantIds?.includes(assistant.id)
        );
        socket.send(JSON.stringify({ type: "assistant.todo.update", requestId: "req-assistant-todo",
            payload: { assistantId: assistant.id, todoId: todo.id, patch: { state: "completed" } } }));
        expect((await todoInvalidated).payload.invalidatedDetailAssistantIds).toEqual([assistant.id]);
        expect(repository.getAssistantTodos(assistant.id).find((item) => item.id === todo.id)?.state).toBe("completed");
        socket.close();
    });
    serverTest("assistant batch answers roll back, replay idempotently, and reject conflicts", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const projectId = (await openProject(socket, projectRoot)).payload.project.id;
        const assistant = savePagedAssistant(repository, projectId, "Atomic answers");
        const now = new Date().toISOString();
        const questions = ["First?", "Second?"].map((prompt) => repository.saveAssistantQuestion({
            id: crypto.randomUUID(), assistantId: assistant.id, prompt, status: "pending", askedAt: now
        }));
        withFixtureDatabase(repository, (db) => db.exec(`CREATE TRIGGER reject_question_answer_log BEFORE INSERT ON assistant_log_entries
          WHEN NEW.summary = 'Question answered' BEGIN SELECT RAISE(ABORT, 'answer log failed'); END;`));
        const payload = { assistantId: assistant.id, answers: questions.map((question, index) => ({
            questionId: question.id, content: `Answer ${index + 1}`
        })) };
        const failed = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-answer-fail");
        socket.send(JSON.stringify({ type: "assistant.question.answer-batch", requestId: "req-answer-fail", payload }));
        expect((await failed).payload.message).toBe("Harness command failed");
        expect(questions.map((question) => repository.getAssistantQuestion(question.id)?.status)).toEqual(["pending", "pending"]);
        withFixtureDatabase(repository, (db) => db.exec("DROP TRIGGER reject_question_answer_log;"));

        const answered = waitForEvent(socket, "notifications.updated", (event) => event.requestId === "req-answer-ok");
        const invalidated = waitForEvent(socket, "assistants.updated", (event) => event.payload.invalidatedDetailAssistantIds?.includes(assistant.id));
        socket.send(JSON.stringify({ type: "assistant.question.answer-batch", requestId: "req-answer-ok", payload }));
        await answered; expect((await invalidated).payload.invalidatedDetailAssistantIds).toEqual([assistant.id]);
        expect(questions.map((question) => repository.getAssistantQuestion(question.id)?.status)).toEqual(["answered", "answered"]);
        const logCount = repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Question answered").length;
        const learningCount = repository.getAssistantLearnings(assistant.id).filter((entry) => entry.source.startsWith("question:")).length;

        const replayed = waitForEvent(socket, "notifications.updated", (event) => event.requestId === "req-answer-replay");
        socket.send(JSON.stringify({ type: "assistant.question.answer-batch", requestId: "req-answer-replay", payload }));
        await replayed;
        expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Question answered")).toHaveLength(logCount);
        expect(repository.getAssistantLearnings(assistant.id).filter((entry) => entry.source.startsWith("question:"))).toHaveLength(learningCount);

        const conflict = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-answer-conflict");
        socket.send(JSON.stringify({ type: "assistant.question.answer", requestId: "req-answer-conflict",
            payload: { assistantId: assistant.id, questionId: questions[0].id, content: "Different" } }));
        expect((await conflict).payload.message).toBe("Harness command failed");
        expect(repository.getAssistantQuestion(questions[0].id)?.answerText).toBe("Answer 1");
        socket.close();
    });
}

function insertBackgroundJobCopies(repository: ServerSuiteFixture["repository"], sourceJobId: string, count: number) {
    withFixtureDatabase(repository, (db) => {
        type SqlValue = string | number | bigint | boolean | Uint8Array | null;
        const source = db.query<Record<string, SqlValue>, [string]>("SELECT * FROM background_jobs WHERE id = ?1").get(sourceJobId);
        if (!source) throw new Error(`Missing source background job: ${sourceJobId}`);
        const columns = Object.keys(source);
        const insert = db.query<never, SqlValue[]>(
            `INSERT INTO background_jobs (${columns.join(", ")}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(", ")})`
        );
        db.transaction(() => {
            for (let index = 0; index < count; index += 1) {
                const values = columns.map((column) => column === "id"
                    ? `${sourceJobId}:snapshot-filler:${index}`
                    : column === "updated_at"
                        ? new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString()
                        : source[column]);
                insert.run(...values);
            }
        })();
    });
}

function savePagedAssistant(repository: ServerSuiteFixture["repository"], projectId: string, name: string) {
    const now = new Date().toISOString();
    const assistant: Assistant = {
        id: crypto.randomUUID(), name, scope: "project", projectId,
        personalityPrompt: "Work carefully.", jobPrompt: "Complete assigned jobs.", agentId: "pi",
        runState: "active", bootstrapState: "completed", failureStreakCount: 0,
        circuitBreakerState: "closed", unreadQuestionCount: 0, createdAt: now, updatedAt: now
    };
    return repository.saveAssistant(assistant);
}

function savePagedJob(repository: ServerSuiteFixture["repository"], projectId: string, assistantId: string, name: string, minuteOffset: number) {
    const timestamp = new Date(Date.UTC(2099, 0, 1, 0, minuteOffset)).toISOString();
    const job: BackgroundJob = {
        id: crypto.randomUUID(), projectId, assistantId, automationThreadId: crypto.randomUUID(),
        kind: "ai-routine", name, status: "paused", riskLevel: "safe",
        definition: { kind: "ai-routine", prompt: `Run ${name}.` },
        schedule: { type: "one-off", runAt: timestamp, sourceText: timestamp },
        scheduleInput: timestamp, nextRunAt: timestamp, createdAt: timestamp, updatedAt: timestamp
    };
    repository.saveBackgroundJob(job);
    return job;
}

function withFixtureDatabase<T>(repository: ServerSuiteFixture["repository"], callback: (database: Database) => T) {
    if (repository.dbPath === ":memory:") throw new Error("Raw fixture database access requires a persistent test database");
    const database = new Database(repository.dbPath, { strict: true });
    try {
        return callback(database);
    } finally {
        database.close(false);
    }
}
