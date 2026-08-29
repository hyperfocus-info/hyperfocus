import { expect } from "bun:test";
import { type SubagentTaskState } from "@hyperfocus/ai-core/protocol";
import { createSocket, executeReadyRun, openProject, sendChatUntilReady, waitForAdapterCall, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerSubagentOrchestrationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerSubagentExecutionTests(serverTest, fixture);
    registerSubagentPrerequisiteTests(serverTest, fixture);
}

function registerSubagentExecutionTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("runs high difficulty tasks with subagents and aggregation", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const planPromise = waitForEvent(socket, "agent.plan");
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-high",
            projectId,
            threadId,
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-high-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const plan = await planPromise;
        expect(plan.payload.projectId).toBe(projectId);
        expect(plan.payload.plan.usesSubagents).toBe(true);
        const callKinds = adapter.calls.map((call) => call.kind);
        expect(callKinds[0]).toBe("planner");
        expect(callKinds.includes("subagent")).toBe(true);
        expect(callKinds.includes("aggregator")).toBe(true);
        expect(callKinds.indexOf("aggregator")).toBeGreaterThan(callKinds.indexOf("subagent"));
        socket.close();
    }, 60000);
    serverTest("resumes partial subagent runs by reactivating the same run", async () => {
        const { repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-resume-partial",
            projectId,
            threadId,
            content: "please resume task",
            modeId: "plan",
            modeLocked: true
        }, 30000).catch((error) => {
            throw new Error(`Timed out waiting for resume test ready run: ${error instanceof Error ? error.message : String(error)}`);
        });
        const partialPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "partial-complete", 30000);
        await executeReadyRun(socket, {
            requestId: "req-resume-partial-execute",
            projectId,
            threadId,
            runId: ready.payload.run.id
        }, 30000);
        expect(repository.getRun(projectId, ready.payload.run.id)?.status).toBe("partial-complete");
        const partial = await partialPromise.catch((error) => {
            throw new Error(`Timed out waiting for resume test partial run: ${error instanceof Error ? error.message : String(error)}`);
        });
        expect(partial.payload.run.subtasks.find((task: SubagentTaskState) => task.id === "task-1")?.status).toBe("completed");
        expect(partial.payload.run.subtasks.find((task: SubagentTaskState) => task.id === "task-2")?.status).toBe("failed");
        const runningPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "running-subagents", 30000);
        const completedPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "completed", 30000);
        const completePromise = waitForEvent(socket, "chat.complete", (event) => event.payload.projectId === projectId && event.payload.threadId === threadId, 30000);
        socket.send(JSON.stringify({
            type: "run.resume",
            requestId: "req-resume-partial-resume",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const running = await runningPromise.catch((error) => {
            throw new Error(`Timed out waiting for resume test running run: ${error instanceof Error ? error.message : String(error)}`);
        });
        expect(running.payload.run.completedAt).toBeUndefined();
        const completed = await completedPromise.catch((error) => {
            throw new Error(`Timed out waiting for resume test completed run: ${error instanceof Error ? error.message : String(error)}`);
        });
        await completePromise.catch((error) => {
            throw new Error(`Timed out waiting for resume test chat complete: ${error instanceof Error ? error.message : String(error)}`);
        });
        expect(completed.payload.run.subtasks.find((task: SubagentTaskState) => task.id === "task-1")?.status).toBe("completed");
        expect(completed.payload.run.subtasks.find((task: SubagentTaskState) => task.id === "task-2")?.status).toBe("completed");
        socket.close();
    }, 60000);
}

function registerSubagentPrerequisiteTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("runs prerequisites before subagent fan-out and persists completion", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-prereq",
            projectId,
            threadId,
            content: "complex prerequisite task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        const prerequisiteTracePromise = waitForEvent(socket, "agent.trace", (event) => event.payload.trace.stage === "prerequisite-complete", 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await prerequisiteTracePromise;
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const callKinds = adapter.calls.map((call) => call.kind);
        const prerequisiteIndex = callKinds.indexOf("executor");
        const firstSubagentIndex = callKinds.indexOf("subagent");
        expect(prerequisiteIndex).toBeGreaterThan(-1);
        expect(firstSubagentIndex).toBeGreaterThan(-1);
        expect(prerequisiteIndex).toBeLessThan(firstSubagentIndex);
        expect(repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0]?.status).toBe("completed");
        socket.close();
    }, 60000);
    serverTest("normalizes planner prerequisite owner aliases before persisting and executing", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-prereq-alias",
            projectId,
            threadId,
            content: "complex aliased prerequisite task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        expect(repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0]?.owner).toBe("main");
        const prerequisiteTracePromise = waitForEvent(socket, "agent.trace", (event) => event.payload.trace.stage === "prerequisite-complete", 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-alias-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await prerequisiteTracePromise;
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const callKinds = adapter.calls.map((call) => call.kind);
        const prerequisiteIndex = callKinds.indexOf("executor");
        const firstSubagentIndex = callKinds.indexOf("subagent");
        expect(prerequisiteIndex).toBeGreaterThan(-1);
        expect(firstSubagentIndex).toBeGreaterThan(-1);
        expect(prerequisiteIndex).toBeLessThan(firstSubagentIndex);
        const persistedPrerequisite = repository.getRun(projectId, ready.payload.run.id)?.plan?.prerequisites[0];
        expect(persistedPrerequisite?.owner).toBe("main");
        expect(persistedPrerequisite?.status).toBe("completed");
        socket.close();
    }, 60000);
    serverTest("fails run when prerequisite execution fails before subagents start", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-prereq-fail",
            projectId,
            threadId,
            content: "complex failing prerequisite task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        const failedRunPromise = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "failed", 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-prereq-fail-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        const failedRun = await failedRunPromise;
        expect(failedRun.payload.run.failureMessage).toContain("prerequisite setup failed");
        const callKinds = adapter.calls.map((call) => call.kind);
        expect(callKinds).toContain("executor");
        expect(callKinds).not.toContain("subagent");
        socket.close();
    }, 60000);
}
