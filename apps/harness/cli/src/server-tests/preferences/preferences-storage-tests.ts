import { expect } from "bun:test";
import { createMemoryEntryId, type SetupCheck } from "@hyperfocus/ai-core/protocol";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFakeCodexRuntime } from "../../test-support/fake-codex-runtime";
import { createSocket, parseMessageEventPayloads, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";
export function registerPreferencesStorageTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    registerProviderPreferenceStorageTests(serverTest, fixture);
    registerWorkspacePreferenceStorageTests(serverTest, fixture);
}

function registerProviderPreferenceStorageTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("portable bundled runtime updates reject without an installed acknowledgement", async () => {
        await fixture.restart({ launchMode: "portable-launcher" });
        const socket = createSocket(fixture.port);
        const received: string[] = [];
        socket.addEventListener("message", (event) => {
            for (const payload of parseMessageEventPayloads(event)) received.push(payload.type);
        });
        await waitForEvent(socket, "connection.ready");
        try {
            for (const agentId of ["pi", "codex-cli"] as const) {
                const requestId = `portable-update-${agentId}`;
                const rejected = waitForEvent(socket, "command.rejected", (event) => event.requestId === requestId);
                socket.send(JSON.stringify({ type: "cli-updates.install", requestId, payload: { agentId } }));
                expect((await rejected).payload.detail).toContain("Download a new Harness release");
            }
            expect(received).not.toContain("cli-updates.installed");
        } finally { socket.close(); }
    }, 60000);
    serverTest("saves preferences and persists API key", async () => {
        const { repository, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const savedPromise = waitForEvent(socket, "preferences.saved");
        socket.send(JSON.stringify({
            type: "preferences.save",
            requestId: "req-pref",
            payload: {
                openAiApiKey: "sk-local-123",
                googleApiKey: "AIza-local-456",
                providerBrand: "gemini",
                debugEnabled: true,
                tracePanelDefaultOpen: false,
                subagentWorktreeStrategyDefault: "separate-worktrees",
                blockChatOnDirtyGitDefault: false,
                dirtyGitChangeLimitDefault: 9,
                autoCompactContextThresholdPercentDefault: 55,
                planExecutionModeDefault: "approve",
                planExecutionDelaySecondsDefault: 15,
                correctnessIterationModeDefault: "auto-once",
                backgroundJobApprovalPolicyDefault: "ask-risky",
                assistantAutoApproveNonBlockingQuestionsDefault: false,
                maxBackgroundJobsDefault: 25,
                memoryBankEnabledDefault: false,
                memoryBankRecordRunsDefault: false,
                checkCliUpdatesDefault: false
            }
        }));
        const saved = await savedPromise;
        expect(saved.payload.hasUsableApiKey).toBe(true);
        expect(saved.payload.hasStoredApiKey).toBe(true);
        expect(saved.payload.hasUsableOpenAiApiKey).toBe(true);
        expect(saved.payload.hasUsableGoogleApiKey).toBe(true);
        expect(saved.payload.providerBrand).toBe("gemini");
        expect(saved.payload.debugEnabledDefault).toBe(true);
        expect(saved.payload.tracePanelDefaultOpen).toBe(false);
        expect(saved.payload.attachmentsEnabled).toBe(Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()));
        expect(saved.payload.subagentWorktreeStrategyDefault).toBe("separate-worktrees");
        expect(saved.payload.blockChatOnDirtyGitDefault).toBe(false);
        expect(saved.payload.dirtyGitChangeLimitDefault).toBe(9);
        expect(saved.payload.autoCompactContextThresholdPercentDefault).toBe(55);
        expect(saved.payload.planExecutionModeDefault).toBe("approve");
        expect(saved.payload.planExecutionDelaySecondsDefault).toBe(15);
        expect(saved.payload.correctnessIterationModeDefault).toBe("auto-once");
        expect(saved.payload.backgroundJobApprovalPolicyDefault).toBe("ask-risky");
        expect(saved.payload.assistantAutoApproveNonBlockingQuestionsDefault).toBe(false);
        expect(saved.payload.maxBackgroundJobsDefault).toBe(25);
        expect(saved.payload.memoryBankEnabledDefault).toBe(false);
        expect(saved.payload.memoryBankRecordRunsDefault).toBe(false);
        expect(saved.payload.checkCliUpdatesDefault).toBe(false);
        expect(saved.payload.setup.checks.some((check: {
            id: string;
        }) => check.id === "provider-auth")).toBe(true);
        expect(repository.getStoredOpenAiApiKey()).toBe("sk-local-123");
        expect(repository.getStoredGoogleApiKey()).toBe("AIza-local-456");
        expect(repository.getAutoCompactContextThresholdPercentDefault()).toBe(55);
        expect(repository.getMaxBackgroundJobsDefault()).toBe(25);
        expect(repository.getMemoryBankEnabledDefault()).toBe(false);
        expect(repository.getMemoryBankRecordRunsDefault()).toBe(false);
        expect(repository.getCheckCliUpdatesDefault()).toBe(false);
        socket.close();
    });
    serverTest("saves preferences without API keys", async () => {
        const { repository, port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const savedPromise = waitForEvent(socket, "preferences.saved");
        socket.send(JSON.stringify({
            type: "preferences.save",
            requestId: "req-pref-no-keys",
            payload: {
                providerBrand: "claude",
                debugEnabled: false,
                tracePanelDefaultOpen: true,
                subagentWorktreeStrategyDefault: "same-worktree",
                blockChatOnDirtyGitDefault: true,
                dirtyGitChangeLimitDefault: 12,
                autoCompactContextThresholdPercentDefault: 45,
                planExecutionModeDefault: "countdown",
                planExecutionDelaySecondsDefault: 8,
                correctnessIterationModeDefault: "ask-before-iterate",
                backgroundJobApprovalPolicyDefault: "ask-risky",
                assistantAutoApproveNonBlockingQuestionsDefault: true,
                memoryBankEnabledDefault: true,
                memoryBankRecordRunsDefault: true,
                checkCliUpdatesDefault: true
            }
        }));
        const saved = await savedPromise;
        expect(saved.payload.hasUsableApiKey).toBe(false);
        expect(saved.payload.hasStoredApiKey).toBe(false);
        expect(saved.payload.hasUsableAnthropicApiKey).toBe(false);
        expect(saved.payload.hasStoredAnthropicApiKey).toBe(false);
        expect(saved.payload.providerBrand).toBe("claude");
        expect(saved.payload.dirtyGitChangeLimitDefault).toBe(12);
        expect(repository.getStoredAnthropicApiKey()).toBeUndefined();
        socket.close();
    });
    serverTest("tests provider connection with draft key without persisting it", async () => {
        const { repository, port } = fixture;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = Object.assign(
            async (_url: RequestInfo | URL, init?: RequestInit) => {
                expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-draft-only");
                return new Response(JSON.stringify({ data: [{ id: "model-1" }, { id: "model-2" }] }), { status: 200 });
            },
            { preconnect: originalFetch.preconnect }
        );
        try {
            const socket = createSocket(port);
            await waitForEvent(socket, "connection.ready");
            const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");
            socket.send(JSON.stringify({
                type: "preferences.testProviderConnection",
                requestId: "req-test-openai",
                payload: {
                    provider: "openai",
                    apiKey: "sk-draft-only"
                }
            }));
            const tested = await testedPromise;
            expect(tested.payload.status).toBe("ready");
            expect(tested.payload.modelCount).toBe(2);
            expect(repository.getStoredOpenAiApiKey()).toBeUndefined();
            socket.close();
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    serverTest("provider connection test fails when no key is available", async () => {
        const { port } = fixture;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");
        socket.send(JSON.stringify({
            type: "preferences.testProviderConnection",
            requestId: "req-test-missing-key",
            payload: {
                provider: "anthropic"
            }
        }));
        const tested = await testedPromise;
        expect(tested.payload.provider).toBe("anthropic");
        expect(tested.payload.status).toBe("failed");
        expect(tested.payload.message).toBe("No API key available.");
        socket.close();
    });
    serverTest("provider connection test sanitizes provider failures", async () => {
        const { repository, port } = fixture;
        const originalFetch = globalThis.fetch;
        repository.setStoredGoogleApiKey("AIza-secret");
        globalThis.fetch = Object.assign(
            async () => new Response(JSON.stringify({ error: { message: "Invalid API key AIza-secret" } }), { status: 401 }),
            { preconnect: originalFetch.preconnect }
        );
        try {
            const socket = createSocket(port);
            await waitForEvent(socket, "connection.ready");
            const testedPromise = waitForEvent(socket, "preferences.providerConnectionTested");
            socket.send(JSON.stringify({
                type: "preferences.testProviderConnection",
                requestId: "req-test-google-fail",
                payload: {
                    provider: "google"
                }
            }));
            const tested = await testedPromise;
            expect(tested.payload.status).toBe("failed");
            expect(tested.payload.message).toContain("[redacted]");
            expect(tested.payload.message).not.toContain("AIza-secret");
            socket.close();
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
}

function registerWorkspacePreferenceStorageTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
    serverTest("creates a semantic project note through websocket command", async () => {
        const { repository, projectRoot, port } = fixture;
        const project = repository.addProject(projectRoot);
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const updatedPromise = waitForEvent(socket, "memory.updated");
        socket.send(JSON.stringify({
            type: "memory.create",
            requestId: "req-memory-create",
            payload: {
                projectId: project.id,
                title: "Frontend refactor",
                summary: "Keep workspace contracts framework-neutral.",
                tags: ["feature:frontend-refactor", "area:harness"]
            }
        }));
        const updated = await updatedPromise;
        expect(updated.payload.entry).toMatchObject({
            projectId: project.id,
            kind: "repo-fact",
            title: "Frontend refactor",
            tags: ["feature:frontend-refactor", "area:harness"],
            pinned: true,
            hitCount: 0
        });
        expect(repository.getMemoryEntry(updated.payload.entry.id)?.summary).toBe(
            "Keep workspace contracts framework-neutral."
        );
        repository.saveMemoryEntry({ ...updated.payload.entry, status: "archived" });

        const dedupedPromise = waitForEvent(socket, "memory.updated");
        socket.send(JSON.stringify({
            type: "memory.create",
            requestId: "req-memory-create-update",
            payload: {
                projectId: project.id,
                title: " frontend REFACTOR ",
                summary: "Updated framework-neutral constraint.",
                tags: ["feature:frontend-refactor", "source:user"]
            }
        }));
        const deduped = await dedupedPromise;
        expect(deduped.payload.entry.id).toBe(updated.payload.entry.id);
        expect(deduped.payload.entry.status).toBe("active");
        expect(deduped.payload.entry.tags).toEqual([
            "feature:frontend-refactor",
            "area:harness",
            "source:user"
        ]);
        expect(repository.listMemoryEntries(project.id)).toHaveLength(1);
        expect(repository.getMemoryEntry(updated.payload.entry.id)?.summary).toBe(
            "Updated framework-neutral constraint."
        );
        socket.close();
    });

    serverTest("reorders memory entries through websocket command", async () => {
        const { repository, projectRoot, port } = fixture;
        const project = repository.addProject(projectRoot);
        const now = new Date().toISOString();
        const first = requireValue(repository.saveMemoryEntry({
            id: createMemoryEntryId(),
            projectId: project.id,
            kind: "task-summary",
            status: "active",
            title: "First",
            summary: "First summary",
            tags: [],
            pathGlobs: [],
            confidence: "medium",
            freshness: "fresh",
            pinned: false,
            priority: 100,
            hitCount: 0,
            createdAt: now,
            updatedAt: now
        }), "first memory entry");
        const second = requireValue(repository.saveMemoryEntry({
            id: createMemoryEntryId(),
            projectId: project.id,
            kind: "task-summary",
            status: "active",
            title: "Second",
            summary: "Second summary",
            tags: [],
            pathGlobs: [],
            confidence: "medium",
            freshness: "fresh",
            pinned: false,
            priority: 200,
            hitCount: 0,
            createdAt: now,
            updatedAt: now
        }), "second memory entry");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const reorderedPromise = waitForEvent(socket, "memory.reordered");
        socket.send(JSON.stringify({
            type: "memory.reorder",
            requestId: "req-memory-reorder",
            payload: {
                projectId: project.id,
                memoryEntryId: second.id,
                direction: "up"
            }
        }));
        const reordered = await reorderedPromise;
        expect(reordered.payload.entries.map((entry: {
            id: string;
        }) => entry.id)).toEqual([second.id, first.id]);
        socket.close();
    });
    serverTest("marks setup ready when a CLI runtime works without Pi API keys", async () => {
        let { adapter, repository, port } = fixture;
        await fixture.restart({
            port: 0,
            adapter,
            repository,
            runtimeRegistry: createAgentRuntimeRegistry([createPiRuntime(adapter), createFakeCodexRuntime(adapter)]),
            serverOnly: true
        });
        port = fixture.port;
        const socket = createSocket(port);
        const ready = await waitForEvent(socket, "connection.ready");
        const checks = requireSetupChecks(ready.payload.setup.checks);
        expect(checks.find((check) => check.id === "agent-available")?.status).toBe("ready");
        expect(checks.find((check) => check.id === "provider-auth")?.status).toBe("action-required");
        expect(checks.find((check) => check.id === "provider-auth")?.requiredForFirstTask).toBe(false);
        socket.close();
    });
    serverTest("clears persisted API key", async () => {
        const { adapter, repository, port } = fixture;
        repository.setStoredOpenAiApiKey("sk-clear-123");
        repository.setStoredGoogleApiKey("AIza-clear-456");
        adapter.setApiKey("openai", "sk-clear-123");
        adapter.setApiKey("google", "AIza-clear-456");
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const clearedPromise = waitForEvent(socket, "preferences.apiKeyCleared");
        socket.send(JSON.stringify({
            type: "preferences.clearApiKey",
            requestId: "req-clear"
        }));
        const cleared = await clearedPromise;
        expect(cleared.payload.hasUsableApiKey).toBe(false);
        expect(cleared.payload.hasStoredApiKey).toBe(false);
        expect(cleared.payload.setup.checks.some((check: {
            id: string;
            status: string;
        }) => check.id === "provider-auth")).toBe(true);
        expect(repository.getStoredOpenAiApiKey()).toBeUndefined();
        expect(repository.getStoredGoogleApiKey()).toBeUndefined();
        socket.close();
    });
}

function requireValue<T>(value: T | null | undefined, label: string): T {
    if (value === null || value === undefined) throw new Error(`Expected ${label}`);
    return value;
}

function requireSetupChecks(value: unknown): SetupCheck[] {
    if (!Array.isArray(value) || !value.every(isSetupCheck)) throw new Error("Expected setup checks");
    return value;
}

function isSetupCheck(value: unknown): value is SetupCheck {
    if (typeof value !== "object" || value === null) return false;
    return "id" in value && typeof value.id === "string"
        && "status" in value && typeof value.status === "string"
        && "requiredForFirstTask" in value && typeof value.requiredForFirstTask === "boolean";
}
