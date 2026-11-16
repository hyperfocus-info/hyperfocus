import { createCliSessionManager } from "../../agent-runtimes/cli-session-manager";
import { createCodexCliRuntime } from "../../agent-runtimes/codex-cli-runtime";
import { createCopilotCliRuntime } from "../../agent-runtimes/copilot-cli-runtime";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createAssistantManager, type AssistantManager } from "../../assistant-manager";
import { createBackgroundJobScheduler as createScheduler } from "../../background-job-scheduler";
import type { pickProjectFolder } from "../../folder-picker";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { emitAssistantChatCompleteToAll, emitAssistantChatDeltaToAll, emitAssistantChatFailedToAll, emitAssistantChatMessageAppendedToAll, emitAssistantCreatedCardToAll, emitAssistantLogAppendedToAll, emitAssistantSummaryDeltaToAll } from "../automation/assistant-actions";
import { isBackgroundRunLive, reconcileBackgroundJobRunBlockers, safeLaunchBackgroundJobRun, syncBackgroundJobFailureTracking } from "../automation/background-runs";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { BackgroundRunControl, DevHmrDebouncePolicy, HarnessConnection, HarnessServerOsAdapters, HarnessServerState, PendingBrowserApproval, UiServingState } from "../core/contracts";
import { createEmptyTokenUsageTotals, emitCliSessionAttachReadyToClient, emitCliSessionExitedToAll, emitCliSessionStartedToAll, emitCliSessionUpdatedToAll, emitExecutionControlUpdatedToAll, emitTerminalAttachReadyToClient, emitTerminalHistoryListedToAll, emitTerminalPreferencesSavedToAll, emitTerminalSessionCreatedToAll, emitTerminalSessionExitedToAll, emitTerminalSessionUpdatedToAll, emitTerminalSessionsUpdatedToAll, emitTerminalShellsUpdatedToAll } from "../transport/events";
import { createBackgroundRunStatusNotification, isBackgroundRunNotificationStatus, saveBackgroundRunStatusNotification, syncBrowserApprovalNotifications } from "../automation/notifications";
import { hydrateAdapterFromRepository, refreshHarnessSetupState, resolveHarnessServerOsAdapters, runStartupPhase } from "./server-startup";
import { resolveUiServingState } from "./ui-serving";
import { repairBranchfsStateOnStartup } from "../workspace/branchfs-guards";
import type { StartupTelemetrySink } from "../../startup-telemetry";
import { createTerminalSessionManager } from "../../terminal/terminal-session-manager";
import type { createUiAssetManager } from "../../ui-build";
import { createHarnessUploadRouter } from "../../uploadthing-router";
import { createWorkspaceRepository, type WorkspaceRepository } from "../../workspace-repository";
import { createWorkspaceRuntimeStore, type WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { BackgroundJob, SetupLaunchMode, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";
import { createRouteHandler } from "uploadthing/server";
import { createHarnessSessionToken, validateHarnessSessionToken } from "../transport/request-admission";
import { createHarnessManagedRuntimeRegistry, getHarnessManagedAgentAdapter } from "../../execution-runtime";

export async function initializeHarnessServerState(input: {
  adapter: PiAgentAdapter;
  repository?: WorkspaceRepository;
  runtimeRegistry?: AgentRuntimeRegistry;
  osAdapters?: Partial<HarnessServerOsAdapters>;
  pickFolder: typeof pickProjectFolder;
  serverOnly: boolean;
  desktopMode: boolean;
  launchMode: SetupLaunchMode;
  startupTelemetry?: StartupTelemetrySink;
  uiAssetManagerFactory: typeof createUiAssetManager;
  hotDevelopmentMode: boolean;
  hotReloadDebouncePolicy: DevHmrDebouncePolicy;
  existingState?: HarnessServerState;
  sessionToken?: string;
}) {
  const osAdapters = resolveHarnessServerOsAdapters(input.osAdapters);
  const initialRepository = input.existingState?.repository ?? input.repository ?? createWorkspaceRepository(Bun.env.HARNESS_DB_PATH);
  const baseServices = await runStartupPhase(
    input.startupTelemetry,
    "bootstrap",
    input.existingState ? "reusing startup services from hot singleton" : "initializing startup services",
    "startup services ready",
    async () => {
      const sourceRegistry = input.runtimeRegistry
        ?? createAgentRuntimeRegistry([createPiRuntime(input.adapter), createCopilotCliRuntime(), createCodexCliRuntime()]);
      return {
        adapter: input.existingState?.adapter ?? getHarnessManagedAgentAdapter(input.adapter),
        runtimeRegistry: input.existingState?.runtimeRegistry ?? createHarnessManagedRuntimeRegistry(sourceRegistry),
        osAdapters: input.existingState?.osAdapters ?? osAdapters,
        pendingBrowserApprovals: input.existingState?.pendingBrowserApprovals ?? new Map<string, PendingBrowserApproval>(),
        backgroundRunControllers: input.existingState?.backgroundRunControllers ?? new Map<string, BackgroundRunControl>(),
        projectSearchControllers: input.existingState?.projectSearchControllers ?? new Map<string, { requestId: string; abortController: AbortController }>(),
        ideSearchControllers: input.existingState?.ideSearchControllers ?? new Map<string, { requestId: string; abortController: AbortController }>(),
        connections: input.existingState?.connections ?? new Set<Bun.ServerWebSocket<HarnessConnection>>(),
        tokenUsageSession: input.existingState?.tokenUsageSession ?? createEmptyTokenUsageTotals(),
        sessionToken: input.existingState?.sessionToken ?? validateHarnessSessionToken(input.sessionToken ?? createHarnessSessionToken()),
        uploadthingHandler:
          input.existingState?.uploadthingHandler ??
          createRouteHandler({
            router: createHarnessUploadRouter(initialRepository)
          }),
        ui: resolveUiServingState({
          serverOnly: input.serverOnly,
          hotDevelopmentMode: input.hotDevelopmentMode,
          launchMode: input.launchMode,
          uiAssetManagerFactory: input.uiAssetManagerFactory,
          hotReloadDebouncePolicy: input.hotReloadDebouncePolicy,
          existingUi: input.existingState?.ui
        })
      };
    }
  );
  const { repository, runtime } = await runStartupPhase(
    input.startupTelemetry,
    "workspace",
    input.existingState ? "reusing workspace state from hot singleton" : "loading workspace state",
    "workspace state ready",
    async () => {
      if (input.existingState) {
        hydrateAdapterFromRepository(baseServices.adapter, input.existingState.repository);
        return {
          repository: input.existingState.repository,
          runtime: input.existingState.runtime
        };
      }

      const repository = initialRepository;
      const runtime = createWorkspaceRuntimeStore(repository.loadWorkspace());
      hydrateAdapterFromRepository(baseServices.adapter, repository);

      return {
        repository,
        runtime
      };
    }
  );

  await runStartupPhase(
    input.startupTelemetry,
    "runtimes",
    "refreshing runtime capabilities",
    "runtime capabilities ready",
    async () => baseServices.runtimeRegistry.refreshAll()
  );

  if (!input.existingState) {
    await repairBranchfsStateOnStartup(repository, runtime);
  }

  const setupResult = await runStartupPhase(
    input.startupTelemetry,
    "setup",
    input.existingState ? "refreshing setup state from hot singleton" : "building setup state and startup managers",
    input.existingState ? "setup state refreshed" : "startup managers ready",
    () => initializeStartupManagers(input, baseServices, repository, runtime)
  );

  await runUiStartupPhase(input.startupTelemetry, baseServices.ui);

  return {
    adapter: baseServices.adapter,
    runtimeRegistry: baseServices.runtimeRegistry,
    repository,
    runtime,
    pickFolder: input.pickFolder,
    serverOnly: input.serverOnly,
    desktopMode: input.desktopMode,
    desktopClientLease: input.existingState?.desktopClientLease,
    launchMode: input.launchMode,
    pendingBrowserApprovals: baseServices.pendingBrowserApprovals,
    backgroundRunControllers: baseServices.backgroundRunControllers,
    projectSearchControllers: baseServices.projectSearchControllers,
    ideSearchControllers: baseServices.ideSearchControllers,
    connections: baseServices.connections,
    uploadthingHandler: baseServices.uploadthingHandler,
    ui: baseServices.ui,
    osAdapters: baseServices.osAdapters,
    currentSetupState: setupResult.currentSetupState,
    assistantManager: setupResult.assistantManager,
    cliSessionManager: setupResult.cliSessionManager,
    terminalSessionManager: setupResult.terminalSessionManager,
    scheduler: setupResult.scheduler,
    tokenUsageSession: baseServices.tokenUsageSession,
    sessionToken: baseServices.sessionToken
  };
}

type StartupManagerServices = {
  adapter: PiAgentAdapter;
  runtimeRegistry: AgentRuntimeRegistry;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  tokenUsageSession: TokenUsageTotals;
  sessionToken: string;
};

async function initializeStartupManagers(
  input: Parameters<typeof initializeHarnessServerState>[0],
  baseServices: StartupManagerServices,
  repository: WorkspaceRepository,
  runtime: WorkspaceRuntimeStore
) {
  if (input.existingState) {
    const currentSetupState = await refreshHarnessSetupState({
      adapter: baseServices.adapter,
      repository,
      runtimeRegistry: baseServices.runtimeRegistry,
      runtime,
      launchMode: input.launchMode
    });
    input.existingState.assistantManager.cleanupStaleAssistantQuestions();
    repository.syncAssistantQuestionNotifications();
    syncBrowserApprovalNotifications(repository);
    input.existingState.assistantManager.recoverStaleBootstrapRuns();
    input.existingState.assistantManager.recoverIdleJobBootstrapChecks();
    reconcileBackgroundRunStatusNotifications(repository, baseServices.connections);
    const assistantManager = input.existingState.assistantManager;
    const scheduler = createBackgroundJobScheduler({
      repository,
      runtime,
      runtimeRegistry: baseServices.runtimeRegistry,
      assistantManager,
      connections: baseServices.connections,
      backgroundRunControllers: baseServices.backgroundRunControllers,
      tokenUsageSession: baseServices.tokenUsageSession
    });
    return {
      currentSetupState,
      assistantManager,
      cliSessionManager: input.existingState.cliSessionManager,
      terminalSessionManager: input.existingState.terminalSessionManager,
      scheduler
    };
  }

  const currentSetupState = await refreshHarnessSetupState({
    adapter: baseServices.adapter,
    repository,
    runtimeRegistry: baseServices.runtimeRegistry,
    runtime,
    launchMode: input.launchMode
  });
  const assistantManager = createAssistantManager(repository, baseServices.runtimeRegistry, {
    onAssistantsUpdated(assistantIds) {
      repository.syncAssistantQuestionNotifications();
      emitAssistantSummaryDeltaToAll(baseServices.connections, repository, assistantIds);
      emitNotificationsUpdatedToAll(
        baseServices.connections,
        `assistant:auto:${crypto.randomUUID()}`,
        repository.loadNotificationInboxState()
      );
      emitExecutionControlUpdatedToAll(
        baseServices.connections,
        `assistant:auto:${crypto.randomUUID()}`,
        repository.getExecutionControlState()
      );
    },
    onAssistantDetailsChanged(assistantIds) {
      repository.syncAssistantQuestionNotifications();
      emitAssistantSummaryDeltaToAll(baseServices.connections, repository, assistantIds, { invalidateDetails: true });
      emitNotificationsUpdatedToAll(
        baseServices.connections,
        `assistant:auto:${crypto.randomUUID()}`,
        repository.loadNotificationInboxState()
      );
      emitExecutionControlUpdatedToAll(
        baseServices.connections,
        `assistant:auto:${crypto.randomUUID()}`,
        repository.getExecutionControlState()
      );
    },
    onAssistantChatDelta(nextInput) {
      emitAssistantChatDeltaToAll(baseServices.connections, nextInput);
    },
    async onAssistantChatMessageAppended(nextInput) {
      await emitAssistantChatMessageAppendedToAll(baseServices.connections, nextInput);
    },
    async onAssistantChatComplete(nextInput) {
      await emitAssistantChatCompleteToAll(baseServices.connections, nextInput);
    },
    async onAssistantChatFailed(nextInput) {
      await emitAssistantChatFailedToAll(baseServices.connections, nextInput);
    },
    onAssistantLogAppended(entry) {
      emitAssistantLogAppendedToAll(baseServices.connections, entry);
    },
    onAssistantCreatedCard(assistant) {
      emitAssistantCreatedCardToAll(baseServices.connections, assistant);
    }
  });
  assistantManager.cleanupStaleAssistantQuestions();
  repository.syncAssistantQuestionNotifications();
  syncBrowserApprovalNotifications(repository);
  assistantManager.recoverStaleBootstrapRuns();
  assistantManager.recoverIdleJobBootstrapChecks();
  reconcileBackgroundRunStatusNotifications(repository, baseServices.connections);

  const cliSessionManager = createCliSessionManager({
    runtimeStore: runtime,
    onSessionStarted({ requestId, projectId, threadId, session }) {
      emitCliSessionStartedToAll(baseServices.connections, {
        requestId,
        projectId,
        threadId,
        session
      });
    },
    onSessionUpdated({ requestId, projectId, threadId, session }) {
      emitCliSessionUpdatedToAll(baseServices.connections, {
        requestId,
        projectId,
        threadId,
        session
      });
    },
    onSessionExited({ requestId, projectId, threadId, session }) {
      emitCliSessionExitedToAll(baseServices.connections, {
        requestId,
        projectId,
        threadId,
        session
      });
    },
    onAttachReady({ requestId, connectionId, projectId, threadId, sessionId, attachToken }) {
      emitCliSessionAttachReadyToClient(baseServices.connections, {
        requestId,
        projectId,
        threadId,
        sessionId,
        attachToken,
        connectionId
      });
    }
  });

  const terminalSessionManager = createTerminalSessionManager({
    repository,
    onSessionsUpdated({ requestId, sessions, preferences, layout }) {
      emitTerminalSessionsUpdatedToAll(baseServices.connections, { requestId, sessions, preferences, layout });
    },
    onShellsUpdated({ requestId, shells }) {
      emitTerminalShellsUpdatedToAll(baseServices.connections, { requestId, shells });
    },
    onHistoryListed({ requestId, scope, sessions }) {
      emitTerminalHistoryListedToAll(baseServices.connections, { requestId, scope, sessions });
    },
    onSessionCreated({ requestId, session }) {
      emitTerminalSessionCreatedToAll(baseServices.connections, { requestId, session });
    },
    onSessionUpdated({ requestId, session }) {
      emitTerminalSessionUpdatedToAll(baseServices.connections, { requestId, session });
    },
    onSessionExited({ requestId, session }) {
      emitTerminalSessionExitedToAll(baseServices.connections, { requestId, session });
    },
    onAttachReady({ requestId, connectionId, sessionId, attachToken, snapshot }) {
      emitTerminalAttachReadyToClient(baseServices.connections, { requestId, connectionId, sessionId, attachToken, snapshot });
    },
    onPreferencesSaved({ requestId, preferences, layout }) {
      emitTerminalPreferencesSavedToAll(baseServices.connections, { requestId, preferences, layout });
    }
  });

  const scheduler = createBackgroundJobScheduler({
    repository,
    runtime,
    runtimeRegistry: baseServices.runtimeRegistry,
    assistantManager,
    connections: baseServices.connections,
    backgroundRunControllers: baseServices.backgroundRunControllers,
    tokenUsageSession: baseServices.tokenUsageSession
  });

  return {
    currentSetupState,
    assistantManager,
    cliSessionManager,
    terminalSessionManager,
    scheduler
  };
}

export function reconcileBackgroundRunStatusNotifications(repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>) {
  let afterId: string | undefined; const jobCache = new Map<string, BackgroundJob | undefined>();
  try { do { const page = repository.listBackgroundJobRunsForNotificationReconciliation(afterId);
    const missingIds = [...new Set(page.items.map((run) => run.jobId).filter((id) => !jobCache.has(id)))];
    const loaded = new Map(repository.getBackgroundJobsByIds(missingIds).map((job) => [job.id, job]));
    for (const id of missingIds) { jobCache.set(id, loaded.get(id)); if (jobCache.size > 4096) jobCache.delete(jobCache.keys().next().value!); }
    const notifications = page.items.filter((run) => isBackgroundRunNotificationStatus(run.status)).flatMap((run) => {
      const job = jobCache.get(run.jobId); const item = job ? createBackgroundRunStatusNotification(job, run) : undefined;
      return item ? [item] : []; });
    repository.saveNotifications(notifications); afterId = page.nextAfterId;
  } while (afterId !== undefined); } finally {
    emitNotificationsUpdatedToAll(connections, `bg:reconcile:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  }
}

export async function runUiStartupPhase(startupTelemetry: StartupTelemetrySink | undefined, ui: UiServingState) {
  if (ui.mode === "server-only") {
    return;
  }

  await runStartupPhase(
    startupTelemetry,
    "ui-assets",
    ui.liveReload === "debounced-poll" ? "building and watching debounced dev ui assets" : "verifying ui assets",
    "ui assets ready",
    async () => {
      await ui.uiAssets.ensureBuilt();
      if (ui.liveReload === "debounced-poll") {
        ui.uiAssets.startWatching();
      }
    }
  );
}

export function createBackgroundJobScheduler(input: {
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  runtimeRegistry: AgentRuntimeRegistry;
  assistantManager: AssistantManager;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  tokenUsageSession: TokenUsageTotals;
}) {
  const { repository, runtime, runtimeRegistry, assistantManager, connections, backgroundRunControllers, tokenUsageSession } = input;
  return createScheduler({
    repository,
    isRunLive(run) {
      return isBackgroundRunLive(backgroundRunControllers, runtime, run);
    },
    onRunsTimingOut(runs) {
      for (const run of runs) {
        backgroundRunControllers.get(run.id)?.abortController.abort();
      }
    },
    repairActiveRuns(now, interruptedQueuedRunIds) {
      return reconcileBackgroundJobRunBlockers(
        repository,
        (run) => isBackgroundRunLive(backgroundRunControllers, runtime, run),
        { now, interruptedQueuedRunIds }
      );
    },
    async onRunsRepaired(runs) {
      for (const run of runs) {
        syncBackgroundJobFailureTracking(repository, run);
        saveBackgroundRunStatusNotification(repository, run);
        emitBackgroundJobRunUpdatedToAll(connections, run);
      }
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    },
    onRunQueued(run, _job) {
      saveBackgroundRunStatusNotification(repository, run);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitBackgroundJobRunUpdatedToAll(connections, run);
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
      if (run.status === "queued") {
        return safeLaunchBackgroundJobRun(
          connections,
          repository,
          runtimeRegistry,
          runtime,
          backgroundRunControllers,
          assistantManager,
          run.id,
          tokenUsageSession
        );
      }
    },
    onTickFailed(error) {
      const failureMessage = error instanceof Error ? error.message : "Unknown background scheduler failure";
      if (process.env.NODE_ENV !== "production") {
        console.error(error);
      }
      const now = new Date().toISOString();
      repository.markAllEnabledBackgroundJobSchedulersStale(failureMessage, now);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    }
  });
}
