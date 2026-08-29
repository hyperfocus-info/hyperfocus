import { afterEach, beforeEach, describe, expect } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDevHarnessServerSingleton } from "../../dev-server-singleton";
import { startHarnessServer } from "../../server";
import { createStartupTelemetrySession, type StartupPhaseId, type StartupTelemetrySink } from "../../startup-telemetry";
import { createWorkspaceRepository, type WorkspaceRepository } from "../../workspace-repository";
import { createFakePiAgentAdapter, type FakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { useGitProjectFixture } from "../../test-support/git-project-fixture";
import { createHarnessTestTempPath } from "../../test-support/test-temp-root";
import { createFastTestRuntimeRegistry, createSocket, openProject, startServerForTest, stopServerForTest, waitForCondition, waitForEvent } from "../support/server-test-client";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";
const EXPECT_ATTACHMENTS_ENABLED = Boolean(Bun.env.UPLOADTHING_TOKEN?.trim());
function createFakeClock() {
    let nextTimerId = 1;
    let nowMs = 0;
    const timers = new Map<number, {
        runAt: number;
        callback: () => void;
    }>();
    const now = () => nowMs;
    function setTimeout(callback: () => void, delay?: number) {
        const timerId = nextTimerId++;
        timers.set(timerId, {
            runAt: nowMs + Number(delay ?? 0),
            callback
        });
        return timerId;
    }
    function clearTimeout(timerId: number) {
        timers.delete(timerId);
    }
    function advanceBy(durationMs: number) {
        const targetMs = nowMs + durationMs;
        while (true) {
            const nextTimer = [...timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
            if (!nextTimer || nextTimer[1].runAt > targetMs) {
                break;
            }
            nowMs = nextTimer[1].runAt;
            timers.delete(nextTimer[0]);
            nextTimer[1].callback();
        }
        nowMs = targetMs;
    }
    return {
        get nowMs() { return nowMs; },
        set nowMs(value: number) { nowMs = value; },
        now,
        setTimeout,
        clearTimeout,
        advanceBy
    };
}
type FakeStartupEvent = {
    attempt: number;
    kind: "session-start" | "phase-start" | "phase-pulse" | "phase-complete" | "retry" | "complete" | "failed";
    phaseId?: StartupPhaseId;
    message: string;
    details?: Record<string, unknown>;
};
function createFakeStartupTelemetry(): StartupTelemetrySink & {
    events: FakeStartupEvent[];
} {
    const events: FakeStartupEvent[] = [];
    let attempt = 1;
    let currentPhaseId: StartupPhaseId | undefined;
    return {
        events,
        logPath: createHarnessTestTempPath("startup", ".jsonl"),
        sessionStart(message = "session start", details) {
            events.push({ attempt, kind: "session-start", message, details });
        },
        pulse(message, details) {
            events.push({ attempt, kind: "phase-pulse", phaseId: currentPhaseId, message, details });
        },
        phaseStart(phaseId, message, details) {
            currentPhaseId = phaseId;
            events.push({ attempt, kind: "phase-start", phaseId, message, details });
        },
        phaseComplete(message, details) {
            events.push({ attempt, kind: "phase-complete", phaseId: currentPhaseId, message, details });
            currentPhaseId = undefined;
        },
        retry(message, details) {
            events.push({ attempt, kind: "retry", phaseId: currentPhaseId, message, details });
            currentPhaseId = undefined;
            attempt += 1;
        },
        complete(message, details) {
            events.push({ attempt, kind: "complete", phaseId: currentPhaseId, message, details });
            currentPhaseId = undefined;
        },
        failed(message, details) {
            events.push({ attempt, kind: "failed", phaseId: currentPhaseId, message, details });
        },
        getAttempt() {
            return attempt;
        },
        getCurrentPhaseId() {
            return currentPhaseId;
        },
        dispose() { }
    };
}
type StartupTestContext = {
    server: Awaited<ReturnType<typeof startHarnessServer>>;
    adapter: FakePiAgentAdapter;
    repository: WorkspaceRepository;
  extraProjectRoot: string;
  projectRoot: string;
  port: number;
  createTempDir: (name: string) => string;
  createTempPath: (name: string) => string;
};
export function registerServerStartupTests(options: ServerTestShardOptions = {}) {
    describe("harness server startup", () => {
        const serverTest = createServerTestRegistrar(options);
        const fixture = useGitProjectFixture({
            fixtureName: "server-startup",
            packageName: "test-project",
            readmeTitle: "# Test Project\n",
            gitIgnore: ".local\nnode_modules\ndist\n"
        });
        let context: StartupTestContext | undefined;
        beforeEach(async () => {
            const projectRoot = await fixture.createRepoClone(`repo-${crypto.randomUUID()}`);
            const extraProjectRoot = fixture.createTempDir(`project-${crypto.randomUUID()}`);
            const adapter = createFakePiAgentAdapter();
            const repository = createWorkspaceRepository(":memory:", projectRoot, { durability: "test-fast" });
            const started = await startServerForTest({
                port: 0,
                adapter,
                repository,
                pickFolder: async () => extraProjectRoot,
                serverOnly: true
            });
      context = {
        ...started,
        adapter,
        repository,
        extraProjectRoot,
        projectRoot,
        createTempDir: fixture.createTempDir,
        createTempPath: fixture.createTempPath
      };
        });
        afterEach(async () => {
            await stopServerForTest(context?.server);
            context = undefined;
        });
        function getContext() {
            if (!context)
                throw new Error("Startup test context is not initialized");
            return context;
        }
        registerStartupConnectionTests(serverTest, getContext);
        registerStartupHotReloadTests(serverTest, getContext);
        registerStartupDebounceTests(serverTest, getContext);
        registerStartupSingletonAndTelemetryTests(serverTest, getContext);
    });
}
function registerStartupConnectionTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    serverTest("accepts websocket commands and rejects malformed payloads", async () => {
        const context = getContext();
        const { port } = context;
        const socket = createSocket(port);
        await new Promise<void>((resolve, reject) => {
            socket.addEventListener("open", () => {
                socket.send("not-json");
            });
            socket.addEventListener("message", (event) => {
                if (typeof event.data !== "string") return;
                const payload: unknown = JSON.parse(event.data);
                if (payload !== null && typeof payload === "object" && Reflect.get(payload, "type") === "command.rejected") {
                    const details = Reflect.get(payload, "payload");
                    if (details === null || typeof details !== "object") throw new Error("Command rejection payload is invalid");
                    expect(Reflect.get(details, "message")).toBe("Invalid websocket command");
                    socket.close();
                    resolve();
                }
            });
            socket.addEventListener("error", () => reject(new Error("websocket failed")));
        });
    });
    serverTest("returns ready state and persisted workspace on connect", async () => {
        const context = getContext();
        const { port } = context;
        const socket = createSocket(port);
        const ready = await waitForEvent(socket, "connection.ready");
        expect(ready.payload.agents[0].id).toBe("pi");
        expect(ready.payload.workspace.projects).toHaveLength(0);
        expect(ready.payload.workspace.activeProjectId).toBeUndefined();
        expect(ready.payload.preferences.hasUsableApiKey).toBe(false);
        expect(ready.payload.preferences.hasUsableOpenAiApiKey).toBe(false);
        expect(ready.payload.preferences.hasUsableGoogleApiKey).toBe(false);
        expect(ready.payload.preferences.providerBrand).toBe("gpt");
        expect(ready.payload.preferences.tracePanelDefaultOpen).toBe(true);
        expect(ready.payload.preferences.subagentWorktreeStrategyDefault).toBe("same-worktree");
        expect(ready.payload.preferences.blockChatOnDirtyGitDefault).toBe(true);
        expect(ready.payload.preferences.dirtyGitChangeLimitDefault).toBe(20);
        expect(ready.payload.preferences.autoCompactContextThresholdPercentDefault).toBe(40);
        expect(ready.payload.preferences.planExecutionModeDefault).toBe("countdown");
        expect(ready.payload.preferences.planExecutionDelaySecondsDefault).toBe(10);
        expect(ready.payload.preferences.correctnessIterationModeDefault).toBe("ask-before-iterate");
        expect(ready.payload.preferences.maxBackgroundJobsDefault).toBe(10);
        expect(ready.payload.preferences.memoryBankEnabledDefault).toBe(true);
        expect(ready.payload.preferences.memoryBankRecordRunsDefault).toBe(false);
        expect(ready.payload.preferences.attachmentsEnabled).toBe(EXPECT_ATTACHMENTS_ENABLED);
        expect(ready.payload.setup.launchMode).toBe("source");
        expect(ready.payload.setup.checks.some((check: {
            id: string;
        }) => check.id === "project-selected")).toBe(true);
        expect(ready.payload.executionControl.isPaused).toBe(false);
        expect(ready.payload.executionControl.deferredPlanningQuestionCount).toBe(0);
        socket.close();
    });
    serverTest("serverOnly startup phase order is bootstrap, workspace, runtimes, setup, serve, complete", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const telemetry = createFakeStartupTelemetry();
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                startupTelemetry: telemetry
            });
            expect(telemetry.events.filter((event) => event.kind === "phase-start").map((event) => event.phaseId)).toEqual(["bootstrap", "workspace", "runtimes", "setup", "serve"]);
            expect(telemetry.events.filter((event) => event.kind === "phase-complete").map((event) => event.phaseId)).toEqual(["bootstrap", "workspace", "runtimes", "setup", "serve"]);
            expect(telemetry.events.some((event) => event.phaseId === "ui-assets")).toBe(false);
            expect(telemetry.events.at(-1)?.kind).toBe("complete");
        }
        finally {
            context.server = server;
        }
    });
    serverTest("non-server-only startup includes ui-assets once with injected ui asset manager", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const telemetry = createFakeStartupTelemetry();
            const uiAssetCalls: string[] = [];
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: false,
                startupTelemetry: telemetry,
                uiAssetManagerFactory() {
                    return {
                        async ensureBuilt() {
                            uiAssetCalls.push("ensureBuilt");
                        },
                        startWatching() {
                            uiAssetCalls.push("startWatching");
                        },
                        resolveAsset() {
                            return undefined;
                        },
                        getLiveReloadState() {
                            return {
                                revision: 0,
                                building: false,
                                pending: false
                            };
                        },
                        dispose() {
                            uiAssetCalls.push("dispose");
                        }
                    };
                }
            });
            expect(telemetry.events.filter((event) => event.kind === "phase-start" && event.phaseId === "ui-assets")).toHaveLength(1);
            expect(uiAssetCalls).toEqual(["ensureBuilt", "startWatching"]);
        }
        finally {
            context.server = server;
        }
    });
}
function registerStartupHotReloadTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    registerStartupHotReloadLifecycleTests(serverTest, getContext);
    registerStartupHotReloadApplyTests(serverTest, getContext);
}

function registerStartupHotReloadLifecycleTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    serverTest("hot dev mode reuses one server instance and opens browser once", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const openCalls: string[] = [];
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: false,
                devHotMode: true,
                openBrowser: true,
                browserLauncher: async (url) => {
                    openCalls.push(url);
                }
            });
            const reloadedServer = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: false,
                devHotMode: true,
                openBrowser: true,
                browserLauncher: async (url) => {
                    openCalls.push(url);
                }
            });
            expect(reloadedServer).toBe(server);
            expect(openCalls).toHaveLength(1);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot dev mode replaces stale scheduler state and queues due jobs after reload", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot, projectRoot } = context;
        try {
            await stopServerForTest(server);
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true,
                hotReloadDebounceMs: 0,
                backendHotReloadChangeDetector: () => true
            });
            const singletonBefore = getDevHarnessServerSingleton<{
                scheduler: {
                    stop(): void;
                    start(): void;
                };
            }, unknown, unknown, unknown>();
            expect(singletonBefore).toBeDefined();
            if (!singletonBefore) throw new Error("Expected development server singleton");
            const firstScheduler = singletonBefore.state.scheduler;
            firstScheduler.stop();
            Object.defineProperty(firstScheduler, "timer", {
                value: setTimeout(() => { }, 60000),
                configurable: true,
                writable: true
            });
            const project = repository.addProject(projectRoot);
            const now = Date.now();
            const jobId = crypto.randomUUID();
            repository.saveBackgroundJob({
                id: jobId,
                projectId: project.id,
                automationThreadId: crypto.randomUUID(),
                kind: "ai-routine",
                name: "Hot reload due job",
                status: "enabled",
                riskLevel: "unsafe",
                definition: {
                    kind: "ai-routine",
                    prompt: "Review repo.",
                    modeId: "implement"
                },
                schedule: {
                    type: "interval",
                    intervalSeconds: 600,
                    nextRunAt: new Date(now - 60000).toISOString(),
                    sourceText: "10m"
                },
                scheduleInput: "10m",
                nextRunAt: new Date(now - 60000).toISOString(),
                createdAt: new Date(now).toISOString(),
                updatedAt: new Date(now).toISOString()
            });
            const reloadedServer = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true,
                hotReloadDebounceMs: 0,
                backendHotReloadChangeDetector: () => true
            });
            await waitForCondition(() => repository.getActiveBackgroundJobRuns(jobId).length === 1);
            const singletonAfter = getDevHarnessServerSingleton<{
                scheduler: {
                    stop(): void;
                    start(): void;
                };
            }, unknown, unknown, unknown>();
            const activeRun = repository.getActiveBackgroundJobRuns(jobId)[0];
            expect(reloadedServer).toBe(server);
            expect(singletonAfter?.state.scheduler).not.toBe(firstScheduler);
            expect(activeRun?.status).toBe("awaiting-approval");
        }
        finally {
            context.server = server;
        }
    });
}

function registerStartupHotReloadApplyTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    serverTest("hot dev mode keeps previous server alive when reload initialization fails", async () => {
        const context = getContext();
        const fixture = context;
        let { server } = context;
        const { adapter, repository } = context;
        try {
            await stopServerForTest(server);
            const firstRoot = fixture.createTempDir(`first-hot-fail-root-${crypto.randomUUID()}`);
            const secondRoot = fixture.createTempDir(`second-hot-fail-root-${crypto.randomUUID()}`);
            const runtimeRegistry = createFastTestRuntimeRegistry(adapter);
            const originalRefreshAll = runtimeRegistry.refreshAll.bind(runtimeRegistry);
            let refreshCount = 0;
            runtimeRegistry.refreshAll = async () => {
                refreshCount += 1;
                if (refreshCount > 1) {
                    throw new Error("simulated hot reload startup failure");
                }
                return originalRefreshAll();
            };
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry,
                pickFolder: async () => firstRoot,
                serverOnly: true,
                devHotMode: true,
                hotReloadDebounceMs: 0,
                backendHotReloadChangeDetector: () => true
            });
            const firstServer = server;
            const reloadedServer = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry,
                pickFolder: async () => secondRoot,
                serverOnly: true,
                devHotMode: true,
                hotReloadDebounceMs: 0,
                backendHotReloadChangeDetector: () => true
            });
            const singletonAfterFailure = getDevHarnessServerSingleton<any, any, any, any>();
            expect(reloadedServer).toBe(firstServer);
            expect(await singletonAfterFailure?.state.pickFolder()).toBe(firstRoot);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot dev mode uses debounced static ui assets with live reload polling", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const telemetry = createFakeStartupTelemetry();
            const uiAssetCalls: string[] = [];
            let receivedDebounceScheduleMs: readonly number[] = [];
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: false,
                devHotMode: true,
                startupTelemetry: telemetry,
                uiAssetManagerFactory(options) {
                    receivedDebounceScheduleMs = options?.debounceScheduleMs ?? [];
                    return {
                        async ensureBuilt() {
                            uiAssetCalls.push("ensureBuilt");
                        },
                        startWatching() {
                            uiAssetCalls.push("startWatching");
                        },
                        resolveAsset() {
                            return undefined;
                        },
                        getLiveReloadState() {
                            return {
                                revision: 1,
                                building: false,
                                pending: false
                            };
                        },
                        dispose() {
                            uiAssetCalls.push("dispose");
                        }
                    };
                }
            });
            expect(receivedDebounceScheduleMs).toEqual([1000, 1500, 2000, 2500, 5000, 10000, 15000]);
            expect(uiAssetCalls).toEqual(["ensureBuilt", "startWatching"]);
            expect(telemetry.events.filter((event) => event.kind === "phase-start" && event.phaseId === "ui-assets")).toHaveLength(1);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot dev mode delays backend handler apply until debounce window ends", async () => {
        const context = getContext();
        const fixture = context;
        let { server } = context;
        const { adapter, repository } = context;
        try {
            await stopServerForTest(server);
            const clock = createFakeClock();
            const firstRoot = fixture.createTempDir(`first-hot-root-${crypto.randomUUID()}`);
            const secondRoot = fixture.createTempDir(`second-hot-root-${crypto.randomUUID()}`);
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => firstRoot,
                serverOnly: false,
                devHotMode: true,
                hotReloadDebounceMs: 30000,
                backendHotReloadChangeDetector: () => true,
                timerApi: {
                    setTimeout: clock.setTimeout,
                    clearTimeout: clock.clearTimeout
                }
            });
            const singletonBeforeReload = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonBeforeReload?.state.pickFolder()).toBe(firstRoot);
            await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => secondRoot,
                serverOnly: false,
                devHotMode: true,
                hotReloadDebounceMs: 30000,
                backendHotReloadChangeDetector: () => true,
                timerApi: {
                    setTimeout: clock.setTimeout,
                    clearTimeout: clock.clearTimeout
                }
            });
            const singletonDuringDebounce = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonDuringDebounce?.state.pickFolder()).toBe(firstRoot);
            clock.advanceBy(29999);
            expect(await singletonDuringDebounce?.state.pickFolder()).toBe(firstRoot);
            clock.advanceBy(1);
            await Promise.resolve();
            const singletonAfterDebounce = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonAfterDebounce?.state.pickFolder()).toBe(secondRoot);
        }
        finally {
            context.server = server;
        }
    });
}
function registerStartupDebounceTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    serverTest("hot dev mode backs off backend handler apply and resets after reload", async () => {
        const context = getContext();
        const fixture = context;
        let { server } = context;
        const { adapter, repository } = context;
        try {
            await stopServerForTest(server);
            const clock = createFakeClock();
            const firstRoot = fixture.createTempDir(`first-hot-backoff-root-${crypto.randomUUID()}`);
            const secondRoot = fixture.createTempDir(`second-hot-backoff-root-${crypto.randomUUID()}`);
            const thirdRoot = fixture.createTempDir(`third-hot-backoff-root-${crypto.randomUUID()}`);
            const fourthRoot = fixture.createTempDir(`fourth-hot-backoff-root-${crypto.randomUUID()}`);
            const hotOptions = {
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                serverOnly: false,
                devHotMode: true,
                backendHotReloadChangeDetector: () => true,
                timerApi: {
                    setTimeout: clock.setTimeout,
                    clearTimeout: clock.clearTimeout
                }
            };
            server = await startHarnessServer({
                ...hotOptions,
                pickFolder: async () => firstRoot
            });
            await startHarnessServer({
                ...hotOptions,
                pickFolder: async () => secondRoot
            });
            await startHarnessServer({
                ...hotOptions,
                pickFolder: async () => thirdRoot
            });
            const singletonDuringBackoff = getDevHarnessServerSingleton<any, any, any, any>();
            clock.advanceBy(1499);
            expect(await singletonDuringBackoff?.state.pickFolder()).toBe(firstRoot);
            clock.advanceBy(1);
            await Promise.resolve();
            const singletonAfterBackoff = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonAfterBackoff?.state.pickFolder()).toBe(thirdRoot);
            await startHarnessServer({
                ...hotOptions,
                pickFolder: async () => fourthRoot
            });
            clock.advanceBy(1000);
            await Promise.resolve();
            const singletonAfterReset = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonAfterReset?.state.pickFolder()).toBe(fourthRoot);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot dev mode ignores backend reloads without tracked backend changes", async () => {
        const context = getContext();
        const fixture = context;
        let { server } = context;
        const { adapter, repository } = context;
        try {
            await stopServerForTest(server);
            const firstRoot = fixture.createTempDir(`first-hot-tracked-root-${crypto.randomUUID()}`);
            const secondRoot = fixture.createTempDir(`second-hot-tracked-root-${crypto.randomUUID()}`);
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => firstRoot,
                serverOnly: false,
                devHotMode: true,
                hotReloadDebounceMs: 0
            });
            await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => secondRoot,
                serverOnly: false,
                devHotMode: true,
                hotReloadDebounceMs: 0,
                backendHotReloadChangeDetector: () => false
            });
            const singletonAfterIgnoredReload = getDevHarnessServerSingleton<any, any, any, any>();
            expect(await singletonAfterIgnoredReload?.state.pickFolder()).toBe(firstRoot);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot dev mode ignores context-only reloads without refreshing server state", async () => {
        const context = getContext();
        const fixture = context;
        let { server } = context;
        const { adapter, repository } = context;
        try {
            await stopServerForTest(server);
            const firstRoot = fixture.createTempDir(`first-hot-context-root-${crypto.randomUUID()}`);
            const secondRoot = fixture.createTempDir(`second-hot-context-root-${crypto.randomUUID()}`);
            const contextProbePath = path.resolve(process.cwd(), "docs", "harness", `.hmr-ignore-${crypto.randomUUID()}.md`);
            const uiAssetCalls: string[] = [];
            const uiAssetManagerFactory = () => ({
                async ensureBuilt() {
                    uiAssetCalls.push("ensureBuilt");
                },
                startWatching() {
                    uiAssetCalls.push("startWatching");
                },
                resolveAsset() {
                    return undefined;
                },
                getLiveReloadState() {
                    return {
                        revision: 0,
                        building: false,
                        pending: false
                    };
                },
                dispose() {
                    uiAssetCalls.push("dispose");
                }
            });
            try {
                server = await startHarnessServer({
                    port: 0,
                    adapter,
                    repository,
                    runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                    pickFolder: async () => firstRoot,
                    serverOnly: false,
                    devHotMode: true,
                    hotReloadDebounceMs: 0,
                    uiAssetManagerFactory
                });
                writeFileSync(contextProbePath, "context-only hot reload probe\n");
                const reloadedServer = await startHarnessServer({
                    port: 0,
                    adapter,
                    repository,
                    runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                    pickFolder: async () => secondRoot,
                    serverOnly: false,
                    devHotMode: true,
                    hotReloadDebounceMs: 0,
                    uiAssetManagerFactory
                });
                const singletonAfterIgnoredReload = getDevHarnessServerSingleton<any, any, any, any>();
                expect(reloadedServer).toBe(server);
                expect(await singletonAfterIgnoredReload?.state.pickFolder()).toBe(firstRoot);
                expect(uiAssetCalls).toEqual(["ensureBuilt", "startWatching"]);
            }
            finally {
                rmSync(contextProbePath, { force: true });
            }
        }
        finally {
            context.server = server;
        }
    });
}
function registerStartupSingletonAndTelemetryTests(serverTest: ReturnType<typeof createServerTestRegistrar>, getContext: () => StartupTestContext) {
    serverTest("hot singleton version mismatch forces one controlled restart", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true,
                hotSingletonVersion: 1
            });
            const firstServer = server;
            const restartedServer = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true,
                hotSingletonVersion: 2
            });
            server = restartedServer;
            expect(restartedServer).not.toBe(firstServer);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("hot singleton runtime contract mismatch forces one controlled restart", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true
            });
            const firstServer = server;
            const singleton = getDevHarnessServerSingleton<any, any, any, any>();
            expect(singleton).toBeDefined();
            if (!singleton) throw new Error("Expected development server singleton");
            singleton.runtimeContractVersion = 0;
            const restartedServer = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                devHotMode: true
            });
            server = restartedServer;
            expect(restartedServer).not.toBe(firstServer);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("startup completion fires when server url is available, before any websocket client connects", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const telemetry = createFakeStartupTelemetry();
            server = await startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: true,
                startupTelemetry: telemetry
            });
            const completionEvent = telemetry.events.at(-1);
            expect(completionEvent?.kind).toBe("complete");
            expect(completionEvent?.message).toContain(`http://localhost:${server.port}`);
        }
        finally {
            context.server = server;
        }
    });
    serverTest("slow ui-assets phase emits targeted hint without aborting startup", async () => {
        const context = getContext();
        let { server } = context;
        const { adapter, repository, extraProjectRoot } = context;
        try {
            await stopServerForTest(server);
            const clock = createFakeClock();
            const startupLines: string[] = [];
            const resolveQueue: Array<() => void> = [];
            const telemetry = createStartupTelemetrySession({
                now: clock.now,
                tmpDir: createHarnessTestTempPath("startup-server"),
                writeLine(line) {
                    startupLines.push(line);
                },
                setTimeout: clock.setTimeout,
                clearTimeout: clock.clearTimeout
            });
            const startPromise = startHarnessServer({
                port: 0,
                adapter,
                repository,
                runtimeRegistry: createFastTestRuntimeRegistry(adapter),
                pickFolder: async () => extraProjectRoot,
                serverOnly: false,
                startupTelemetry: telemetry,
                uiAssetManagerFactory() {
                    return {
                        ensureBuilt() {
                            return new Promise<void>((resolve) => {
                                resolveQueue.push(resolve);
                            });
                        },
                        startWatching() { },
                        resolveAsset() {
                            return undefined;
                        },
                        getLiveReloadState() {
                            return {
                                revision: 0,
                                building: false,
                                pending: true
                            };
                        },
                        dispose() { }
                    };
                }
            });
            await waitForCondition(() => telemetry.getCurrentPhaseId() === "ui-assets");
            clock.advanceBy(5001);
            expect(startupLines.some((line) => line.includes("ui-assets slow"))).toBe(true);
            expect(startupLines.some((line) => line.includes("Bun/Solid/Tailwind build stall"))).toBe(true);
            resolveQueue.pop()?.();
            server = await startPromise;
        }
        finally {
            context.server = server;
        }
    });
    serverTest("emits setup.updated on explicit setup refresh and project activation changes", async () => {
        const context = getContext();
        const { repository, projectRoot, port } = context;
        const socket = createSocket(port);
        await waitForEvent(socket, "connection.ready");
        const activatedSetupPromise = waitForEvent(socket, "setup.updated", (event) => event.requestId === "req-setup-open" &&
            event.payload.setup.checks.some((check: {
                id: string;
                status: string;
            }) => check.id === "project-selected" && check.status === "ready"));
        const opened = await openProject(socket, projectRoot, "req-setup-open");
        await activatedSetupPromise;
        const refreshedSetupPromise = waitForEvent(socket, "setup.updated", (event) => event.requestId === "req-setup-refresh");
        socket.send(JSON.stringify({
            type: "setup.refresh",
            requestId: "req-setup-refresh"
        }));
        const refreshed = await refreshedSetupPromise;
        expect(refreshed.payload.setup.readyRequiredCount).toBeGreaterThan(0);
        expect(refreshed.payload.setup.checks.some((check: {
            id: string;
        }) => check.id === "git-available")).toBe(true);
        expect(opened.payload.project.id).toBe(repository.loadWorkspace().activeProjectId);
        socket.close();
    });
}
