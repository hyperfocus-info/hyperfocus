import { expect } from "bun:test";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFakeCodexRuntime } from "../../test-support/fake-codex-runtime";
import { createSocket, openProject, sendChatUntilReady, waitForAdapterCall, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerRuntimeModelSelectionTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("uses gemini planning and subagent defaults when provider brand is gemini", async () => {
        const { adapter, repository, projectRoot, port } = fixture;
        repository.setStoredGoogleApiKey("AIza-gemini-123");
        repository.setProviderBrand("gemini");
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        adapter.setApiKey("google", "AIza-gemini-123");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-gemini",
            projectId,
            threadId,
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-gemini-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id
            }
        }));
        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);
        expect(adapter.calls[0]?.modelId).toBe("google/gemini-3-flash-preview");
        expect(adapter.calls.filter((call) => call.kind === "subagent").every((call) => call.modelId === "google/gemini-2.5-flash-lite")).toBe(true);
        expect(adapter.calls.some((call) => call.kind === "aggregator")).toBe(true);
        socket.close();
    }, 60000);
    serverTest("uses codex planning default even when provider brand is gemini", async () => {
        let { adapter, repository, extraProjectRoot, projectRoot, port } = fixture;
        repository.setProviderBrand("gemini");
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            runtimeRegistry: createAgentRuntimeRegistry([createPiRuntime(adapter), createFakeCodexRuntime(adapter)]),
            pickFolder: async () => extraProjectRoot,
            serverOnly: true
        });
        port = fixture.port;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-codex-planner-model",
            projectId,
            threadId,
            agentId: "codex-cli",
            content: "Implement a protocol migration with database persistence, concurrency handling, integration tests, and end to end verification."
        }, 30000);
        expect(adapter.calls[0]?.kind).toBe("planner");
        expect(adapter.calls[0]?.modelId).toBe("openai/gpt-5.4");
        expect(ready.payload.run.planningModelId).toBe("openai/gpt-5.4");
        socket.close();
    }, 60000);
    serverTest("uses same-family codex subagent defaults with low reasoning", async () => {
        let { adapter, repository, extraProjectRoot, projectRoot, port } = fixture;
        repository.setProviderBrand("gemini");
        repository.setSubagentWorktreeStrategyDefault("separate-worktrees");
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            runtimeRegistry: createAgentRuntimeRegistry([createPiRuntime(adapter), createFakeCodexRuntime(adapter)]),
            pickFolder: async () => extraProjectRoot,
            serverOnly: true
        });
        port = fixture.port;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-codex-subagents",
            projectId,
            threadId,
            agentId: "codex-cli",
            content: "complex task",
            modeId: "plan",
            modeLocked: true
        }, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-codex-subagents-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id,
                reasoningStrength: "extra-high"
            }
        }));
        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const subagentCalls = adapter.calls.filter((call) => call.kind === "subagent");
        expect(subagentCalls.length).toBeGreaterThan(0);
        expect(subagentCalls.every((call) => call.modelId === "openai/gpt-5.4-mini")).toBe(true);
        socket.close();
    }, 60000);
    serverTest("passes fast mode and low reasoning to same-worktree subagents", async () => {
        let { adapter, repository, extraProjectRoot, projectRoot, port } = fixture;
        repository.setProviderBrand("gemini");
        repository.setSubagentWorktreeStrategyDefault("same-worktree");
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            runtimeRegistry: createAgentRuntimeRegistry([createPiRuntime(adapter), createFakeCodexRuntime(adapter)]),
            pickFolder: async () => extraProjectRoot,
            serverOnly: true
        });
        port = fixture.port;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const opened = await openProject(socket, projectRoot);
        const projectId = opened.payload.project.id;
        const threadId = opened.payload.project.activeThreadId;
        const ready = await sendChatUntilReady(socket, {
            requestId: "req-codex-same-worktree",
            projectId,
            threadId,
            agentId: "codex-cli",
            content: "complex task",
            modeId: "plan",
            modeLocked: true,
            reasoningStrength: "extra-high"
        }, 30000);
        socket.send(JSON.stringify({
            type: "run.execute",
            requestId: "req-codex-same-worktree-execute",
            payload: {
                projectId,
                threadId,
                runId: ready.payload.run.id,
                fastMode: true
            }
        }));
        await waitForAdapterCall(adapter, "subagent", 30000);
        await waitForAdapterCall(adapter, "aggregator", 30000);
        const subagentCalls = adapter.calls.filter((call) => call.kind === "subagent");
        expect(subagentCalls.length).toBeGreaterThan(0);
        expect(subagentCalls.every((call) => call.modelId === "openai/gpt-5.4-mini")).toBe(true);
        expect(subagentCalls.every((call) => call.reasoningStrength === "low")).toBe(true);
        expect(subagentCalls.every((call) => call.fastMode === true)).toBe(true);
        socket.close();
    }, 60000);
}
