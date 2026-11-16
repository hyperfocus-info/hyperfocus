import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { startThreadMessageDispatcher } from "../execution/thread-message-dispatcher";
import { createBranchfsManager } from "../../branchfs-manager";
import type { openSystemBrowser } from "../../desktop-app";
import { runGitPreflight } from "../../git-preflight";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { searchProjectFolders } from "../../project-search-service";
import type { HarnessConnection, HarnessServerOsAdapters, HarnessServerState } from "../core/contracts";
import { runCorrectnessReview } from "../execution/correctness-review";
import { applyAdapterAutoCompactionThreshold, getPreferencesState } from "../workspace/preferences";
import { buildSetupState } from "../../setup-health";
import type { StartupPhaseId, StartupTelemetrySink } from "../../startup-telemetry";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { HARNESS_APP_VERSION } from "@hyperfocus/ai-core/app-version";
import type { SetupLaunchMode } from "@hyperfocus/ai-core/protocol";

export function resolveHarnessServerOsAdapters(overrides: Partial<HarnessServerOsAdapters> | undefined): HarnessServerOsAdapters {
  return {
    searchProjectFolders,
    runGitPreflight,
    runCorrectnessReview,
    branchfsManagerFactory(context, callbacks) {
      return createBranchfsManager(context, callbacks);
    },
    ...overrides
  };
}

export function finalizeHarnessServerStartup(input: {
  server: Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>;
  state: HarnessServerState;
  startupTelemetry?: StartupTelemetrySink;
  openBrowser: boolean;
  browserLauncher: typeof openSystemBrowser;
  browserOpenState: {
    browserOpenedOnce: boolean;
  };
}) {
  input.state.scheduler.stop();
  input.state.scheduler.start();
  startThreadMessageDispatcher(input.state);
  const serverUrl = `http://${input.server.hostname ?? "localhost"}:${input.server.port}`;
  if (process.env.NODE_ENV !== "test") {
    console.log(`Harness ${HARNESS_APP_VERSION} server listening on ${serverUrl}`);
  }
  input.startupTelemetry?.phaseComplete("server listeners ready", {
    port: input.server.port,
    serverUrl
  });
  input.startupTelemetry?.complete(`Harness ${HARNESS_APP_VERSION} server listening on ${serverUrl}`, {
    port: input.server.port,
    serverUrl
  });
  if (input.openBrowser && !input.state.serverOnly && !input.browserOpenState.browserOpenedOnce) {
    input.browserOpenState.browserOpenedOnce = true;
    void input.browserLauncher(serverUrl);
  }
  return input.server;
}
export function hydrateAdapterFromRepository(adapter: PiAgentAdapter, repository: WorkspaceRepository) {
  const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
  const storedGoogleApiKey = repository.getStoredGoogleApiKey();
  const storedAnthropicApiKey = repository.getStoredAnthropicApiKey();

  if (storedOpenAiApiKey) {
    adapter.setApiKey("openai", storedOpenAiApiKey);
  }

  if (storedGoogleApiKey) {
    adapter.setApiKey("google", storedGoogleApiKey);
  }

  if (storedAnthropicApiKey) {
    adapter.setApiKey("anthropic", storedAnthropicApiKey);
  }

  applyAdapterAutoCompactionThreshold(adapter, repository.getAutoCompactContextThresholdPercentDefault());
}

export async function refreshHarnessSetupState(input: {
  adapter: PiAgentAdapter;
  repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry;
  runtime: WorkspaceRuntimeStore;
  launchMode: SetupLaunchMode;
}) {
  return buildSetupState({
    workspace: input.runtime.getWorkspace(),
    preferences: getPreferencesState(input.repository, input.adapter, input.runtimeRegistry),
    launchMode: input.launchMode
  });
}

export async function runStartupPhase<T>(
  startupTelemetry: StartupTelemetrySink | undefined,
  phaseId: StartupPhaseId,
  startMessage: string,
  completeMessage: string,
  task: () => Promise<T>
) {
  startupTelemetry?.phaseStart(phaseId, startMessage);
  const result = await task();
  startupTelemetry?.phaseComplete(completeMessage);
  return result;
}
