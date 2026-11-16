import { expect } from "bun:test";
import { type BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { createChatSendCommand, createSocket, openProject, parseMessageEventPayloads, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerBackgroundRunControlTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerBackgroundRunGuardTests(serverTest, fixture);
    registerForegroundBackgroundRunTests(serverTest, fixture);
    registerBackgroundRunDeletionTests(serverTest, fixture);
}

function registerBackgroundRunGuardTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("restart fails interrupted queued work and the user can retry it", async () => {
        const { repository, projectRoot } = fixture;
        const firstSocket = createSocket(fixture.port);
        await waitForEvent(firstSocket, "connection.ready");
        const projectId = (await openProject(firstSocket, projectRoot)).payload.project.id;
        firstSocket.close();
        const now = new Date().toISOString();
        const later = new Date(Date.now() + 3600000).toISOString();
        const jobId = crypto.randomUUID();
        const automationThreadId = crypto.randomUUID();
        repository.saveBackgroundJob({ id: jobId, projectId, automationThreadId, kind: "ai-routine",
            name: "Interrupted job", status: "enabled", riskLevel: "safe",
            definition: { kind: "ai-routine", prompt: "Report a brief summary.", modeId: "implement" },
            schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: later, sourceText: "1h" },
            scheduleInput: "1h", nextRunAt: later, createdAt: now, updatedAt: now });
        const interrupted = repository.createBackgroundJobRun({ jobId, projectId, automationThreadId,
            triggerSource: "schedule", status: "queued", riskLevel: "safe", approvalStatus: "approved" });
        repository.setGlobalExecutionPaused(true);
        await fixture.restart();
        const socket = createSocket(fixture.port);
        await waitForEvent(socket, "connection.ready");
        try {
            expect(repository.getBackgroundJobRun(interrupted.id)?.status).toBe("failed");
            expect(repository.loadBackgroundJobsState().runs.filter((run) => run.jobId === jobId)).toHaveLength(1);
            expect(repository.loadNotificationInboxState().items.some((item) => item.kind === "background-run-status" &&
                item.backgroundRunId === interrupted.id && item.severity === "error")).toBe(true);
            const resumed = waitForEvent(socket, "execution-control.updated", (event) => !event.payload.executionControl.isPaused);
            socket.send(JSON.stringify({ type: "execution.resume-all", requestId: "resume-after-restart" }));
            await resumed;
            const queued = waitForEvent(socket, "background-job-run.updated", (event) =>
                event.payload.run.jobId === jobId && event.payload.run.triggerSource === "retry");
            socket.send(JSON.stringify({ type: "background-job.retry-run", requestId: "retry-interrupted",
                payload: { projectId, runId: interrupted.id } }));
            const retry = (await queued).payload.run;
            expect(retry.id).not.toBe(interrupted.id);
            expect(repository.getBackgroundJobRun(interrupted.id)?.status).toBe("failed");
            expect(repository.loadBackgroundJobsState().runs.filter((run) => run.jobId === jobId)).toHaveLength(2);
        } finally { socket.close(); }
    }, 60000);
    serverTest("background job run-now refuses true active blockers with status detail", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            automationThreadId,
            kind: "ai-routine",
            name: "Active blocker job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "active blocker test",
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
        const activeRun = repository.createBackgroundJobRun({
            jobId,
            projectId,
            automationThreadId,
            triggerSource: "schedule",
            status: "running",
            riskLevel: "safe",
            approvalStatus: "not-needed"
        });
        const leaseExpiresAt = new Date(Date.now() + 900000).toISOString();
        repository.setBackgroundJobRunStatus(activeRun.id, "running", {
            summary: "Still executing",
            controllerInstanceId: "controller-1",
            controllerLeaseId: "lease-1",
            controllerLeaseExpiresAt: leaseExpiresAt
        });
        const rejectedPromise = waitForEvent(socket, "command.rejected", (event) => event.requestId === "req-active-blocker-job");
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-active-blocker-job",
            payload: {
                projectId,
                jobId
            }
        }));
        const rejected = await rejectedPromise;
        expect(rejected.payload.detail).toContain(`Background job already has active run ${activeRun.id} in status running`);
        expect(rejected.payload.detail).toContain(`controller lease active until ${leaseExpiresAt}`);
        expect(rejected.payload.detail).toContain("Still executing");
        expect(repository.getActiveBackgroundJobRuns(jobId)).toHaveLength(1);
        socket.close();
    }, 60000);
    serverTest("background job runtime contract mismatch is classified", async () => {
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
            name: "Runtime contract job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "runtime contract test",
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
        Object.defineProperty(repository, "setBackgroundJobRunStatusIfOwned", {
            value: undefined,
            configurable: true
        });
        try {
            const failedPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.jobId === jobId &&
                event.payload.run.status === "failed" &&
                event.payload.run.failureCategory === "runtime-contract-mismatch", 10000);
            socket.send(JSON.stringify({
                type: "background-job.run-now",
                requestId: "req-runtime-contract-job",
                payload: {
                    projectId,
                    jobId
                }
            }));
            const failed = await failedPromise;
            expect(failed.payload.run.failureMessage).toContain("runtime contract mismatch");
            expect(repository.getBackgroundJob(jobId)?.lastFailureCategory).toBe("runtime-contract-mismatch");
        }
        finally {
            Reflect.deleteProperty(repository, "setBackgroundJobRunStatusIfOwned");
            socket.close();
        }
    }, 60000);
    serverTest("background job stop-run stops stale linked agent run", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const now = new Date().toISOString();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            automationThreadId,
            kind: "ai-routine",
            name: "Stale linked run job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "stale linked run test",
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
        repository.createAgentRun(projectId, "stale linked run", "openai/gpt-5.4", threadId);
        const linkedRun = repository.getLatestThreadRun(projectId, threadId);
        expect(linkedRun).toBeTruthy();
        repository.setAgentRunStatus(projectId, linkedRun!.id, "running-main");
        const activeRun = repository.createBackgroundJobRun({
            jobId,
            projectId,
            automationThreadId,
            triggerSource: "schedule",
            status: "running",
            riskLevel: "safe",
            approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(activeRun.id, "running", { linkedAgentRunId: linkedRun!.id });
        const stoppedBackgroundRunPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.id === activeRun.id && event.payload.run.status === "cancelled");
        const stoppedAgentRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === linkedRun!.id && event.payload.run.status === "stopped");
        socket.send(JSON.stringify({
            type: "background-job.stop-run",
            requestId: "req-stop-stale-linked-run",
            payload: {
                projectId,
                runId: activeRun.id
            }
        }));
        await stoppedBackgroundRunPromise;
        await stoppedAgentRunPromise;
        expect(repository.getBackgroundJobRun(activeRun.id)?.status).toBe("cancelled");
        expect(repository.getRun(projectId, linkedRun!.id)?.status).toBe("stopped");
        socket.close();
    }, 60000);
}

function registerForegroundBackgroundRunTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("foreground chat keeps active background runs while planning", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const now = new Date().toISOString();
        const automationThreadId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        repository.saveBackgroundJob({
            id: jobId,
            projectId,
            automationThreadId,
            kind: "ai-routine",
            name: "Yielded background job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "background work",
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
        repository.createAgentRun(projectId, "background linked work", "openai/gpt-5.4", automationThreadId);
        const linkedRun = repository.getLatestThreadRun(projectId, automationThreadId);
        expect(linkedRun).toBeTruthy();
        repository.setAgentRunStatus(projectId, linkedRun!.id, "running-main");
        const activeRun = repository.createBackgroundJobRun({
            jobId,
            projectId,
            automationThreadId,
            triggerSource: "schedule",
            status: "running",
            riskLevel: "safe",
            approvalStatus: "not-needed"
        });
        repository.setBackgroundJobRunStatus(activeRun.id, "running", { linkedAgentRunId: linkedRun!.id });
        let sawBackgroundCancellation = false;
        let sawLinkedRunStopped = false;
        socket.addEventListener("message", (event) => {
            for (const payload of parseMessageEventPayloads(event)) {
                if (payload.type === "background-job-run.updated" &&
                    payload.payload.run.id === activeRun.id &&
                    payload.payload.run.status === "cancelled") {
                    sawBackgroundCancellation = true;
                }
                if (payload.type === "run.updated" && payload.payload.run.id === linkedRun!.id && payload.payload.run.status === "stopped") {
                    sawLinkedRunStopped = true;
                }
            }
        });
        const readyRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id !== linkedRun!.id && event.payload.run.status === "ready", 10000);
        socket.send(JSON.stringify(createChatSendCommand({
            requestId: "req-foreground-preserves-background",
            projectId,
            threadId,
            content: "simple foreground task",
            modeId: "plan",
            modeLocked: true
        })));
        const readyRun = await readyRunPromise;
        expect(repository.getBackgroundJobRun(activeRun.id)?.status).toBe("running");
        expect(repository.getBackgroundJobRun(activeRun.id)?.failureMessage).toBeUndefined();
        expect(repository.getRun(projectId, linkedRun!.id)?.status).toBe("running-main");
        expect(sawBackgroundCancellation).toBe(false);
        expect(sawLinkedRunStopped).toBe(false);
        expect(readyRun.payload.run.status).toBe("ready");
        socket.close();
    }, 60000);
}

function registerBackgroundRunDeletionTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerBackgroundDeletionTest(serverTest, fixture);
}

function registerBackgroundDeletionTest(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("background job delete cancels an active run before removing the job", async () => {
        const { repository, projectRoot, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        const bulkJobId = crypto.randomUUID();
        repository.setBackgroundJobApprovalPolicyDefault("allow-all");
        const directJob: BackgroundJob = {
            id: jobId,
            projectId,
            automationThreadId: crypto.randomUUID(),
            kind: "ai-routine",
            name: "Delete active run job",
            status: "enabled",
            riskLevel: "safe",
            definition: {
                kind: "ai-routine",
                prompt: "slow request",
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
        };
        const bulkJob: BackgroundJob = { ...directJob, id: bulkJobId, automationThreadId: crypto.randomUUID(),
            name: "Bulk delete active run job", status: "paused" };
        repository.saveBackgroundJob(directJob);
        repository.saveBackgroundJob(bulkJob);
        repository.createAgentRun(projectId, "Bulk linked deletion run", "openai/gpt-5.4", bulkJob.automationThreadId);
        const bulkLinkedRun = repository.getLatestThreadRun(projectId, bulkJob.automationThreadId);
        if (!bulkLinkedRun) throw new Error("Expected bulk linked deletion run");
        repository.setAgentRunStatus(projectId, bulkLinkedRun.id, "running-main");
        const bulkBackgroundRun = repository.createBackgroundJobRun({ jobId: bulkJob.id, projectId,
            automationThreadId: bulkJob.automationThreadId, triggerSource: "manual", status: "running",
            riskLevel: "safe", approvalStatus: "approved" });
        repository.setBackgroundJobRunStatus(bulkBackgroundRun.id, "running", { linkedAgentRunId: bulkLinkedRun.id });
        const runningRunPromise = waitForEvent(socket, "background-job-run.updated", (event) => event.payload.run.jobId === jobId && event.payload.run.status === "running", 10000);
        socket.send(JSON.stringify({
            type: "background-job.run-now",
            requestId: "req-delete-active-run-now",
            payload: {
                projectId,
                jobId
            }
        }));
        const runningRun = await runningRunPromise;
        const getProject = repository.getProject.bind(repository);
        let rehydrationAttempted = false;
        repository.getProject = (id) => {
            if (id === projectId) {
                rehydrationAttempted = true;
                throw new Error("post-commit rehydration failed");
            }
            return getProject(id);
        };
        const committedDeletionPromise = waitForEvent(socket, "background-jobs.deleted", (event) =>
            event.requestId === "req-delete-active-job" && event.payload.targets.some((target: { kind: string; jobId?: string }) => target.kind === "background-job" && target.jobId === jobId), 10000);
        const deletedJobsPromise = waitForEvent(socket, "background-jobs.updated", (event) => !event.payload.backgroundJobs.jobs.some((job: BackgroundJob) => job.id === jobId), 10000);
        socket.send(JSON.stringify({
            type: "background-job.delete",
            requestId: "req-delete-active-job",
            payload: {
                projectId,
                jobId
            }
        }));
        expect((await committedDeletionPromise).payload.deletedJobIds).toEqual([jobId]);
        await deletedJobsPromise;
        expect(repository.getBackgroundJob(jobId)).toBeUndefined();
        expect(repository.getBackgroundJobRun(runningRun.payload.run.id)).toBeUndefined();
        expect(rehydrationAttempted).toBe(true);
        rehydrationAttempted = false;
        const bulkDeletedPromise = waitForEvent(socket, "background-jobs.deleted", (event) =>
            event.requestId === "req-bulk-delete-active-job" && event.payload.deletedJobIds.includes(bulkJobId), 10000);
        const bulkAppliedPromise = waitForEvent(socket, "bulk-operation.applied", (event) =>
            event.requestId === "req-bulk-delete-active-job", 10000);
        socket.send(JSON.stringify({ type: "bulk-operation.apply", requestId: "req-bulk-delete-active-job",
            payload: { operationId: "bulk-delete-active-job", action: "delete",
                targets: [{ kind: "background-job", projectId, jobId: bulkJobId }] } }));
        expect((await bulkDeletedPromise).payload.deletedJobIds).toEqual([bulkJobId]);
        expect((await bulkAppliedPromise).payload.results[0]?.status).toBe("applied");
        expect(rehydrationAttempted).toBe(true);
        repository.getProject = getProject;
        socket.close();
    }, 60000);
}
