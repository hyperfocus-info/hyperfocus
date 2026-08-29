import { applyHarnessToolchainToProcessEnv } from "./agent-runtimes/toolchain";
import { openSystemBrowser } from "./desktop-app";
import { pickProjectFolder } from "./folder-picker";
import { createPiSdkAgentAdapter } from "./pi-agent-adapter";
import { DERIVED_PROGRESS_HEARTBEAT_MS } from "./server/core/constants";
import type { HarnessServerOptions } from "./server/core/contracts";
import { resolveDevHmrDebouncePolicy } from "./server/runtime/hot-reload";
import { createBackgroundRunStatusNotification } from "./server/automation/notifications";
import { initializeHarnessServerState } from "./server/runtime/initialize";
import { finalizeHarnessServerStartup } from "./server/runtime/server-startup";
import { resolveHotDevelopmentMode, startHotReloadableHarnessServer } from "./server/runtime/startup";
import { attachDesktopClientLifecycle, createHarnessBunServer, createHarnessHandlerRefs, decorateHarnessServerStop } from "./server/transport/bun-server";
import { detectSetupLaunchMode } from "./setup-health";
import { createUiAssetManager } from "./ui-build";
import { createTimerApi } from "./server/runtime/timer-api";

export { createBackgroundRunStatusNotification };

export async function startHarnessServer({
  port,
  hostname,
  adapter = createPiSdkAgentAdapter(),
  repository: providedRepository,
  runtimeRegistry: providedRuntimeRegistry,
  osAdapters,
  pickFolder = pickProjectFolder,
  serverOnly = false,
  openBrowser = false,
  desktopMode = false,
  desktopIdleGraceMs = 5_000,
  launchMode = detectSetupLaunchMode(),
  startupTelemetry,
  uiAssetManagerFactory = createUiAssetManager,
  browserLauncher = openSystemBrowser,
  devHotMode,
  hotSingletonVersion = 1,
  hotReloadDebounceMs,
  backendHotReloadChangeDetector,
  derivedProgressHeartbeatMs = DERIVED_PROGRESS_HEARTBEAT_MS,
  sessionToken,
  timerApi = createTimerApi()
}: HarnessServerOptions) {
  applyHarnessToolchainToProcessEnv();
  const hotDevelopmentMode = resolveHotDevelopmentMode(devHotMode);
  if (hotDevelopmentMode) {
    return startHotReloadableHarnessServer({
      port,
      hostname,
      adapter,
      repository: providedRepository,
      runtimeRegistry: providedRuntimeRegistry,
      osAdapters,
      pickFolder,
      serverOnly,
      openBrowser,
      desktopMode,
      desktopIdleGraceMs,
      launchMode,
      startupTelemetry,
      uiAssetManagerFactory,
      browserLauncher,
      hotSingletonVersion,
      hotReloadDebouncePolicy: resolveDevHmrDebouncePolicy(hotReloadDebounceMs),
      backendHotReloadChangeDetector,
      derivedProgressHeartbeatMs,
      sessionToken,
      timerApi
    });
  }

  const state = await initializeHarnessServerState({
    adapter,
    repository: providedRepository,
    runtimeRegistry: providedRuntimeRegistry,
    osAdapters,
    pickFolder,
    serverOnly,
    desktopMode,
    launchMode,
    startupTelemetry,
    uiAssetManagerFactory,
    hotDevelopmentMode,
    hotReloadDebouncePolicy: resolveDevHmrDebouncePolicy(hotReloadDebounceMs),
    sessionToken
  });
  const handlerRefs = createHarnessHandlerRefs(state, { derivedProgressHeartbeatMs });
  startupTelemetry?.phaseStart("serve", "starting Bun server listeners");
  const server = createHarnessBunServer({
    port,
    hostname,
    handlerRefs
  });

  attachDesktopClientLifecycle(server, state, desktopMode, desktopIdleGraceMs);
  decorateHarnessServerStop(server, () => state);
  return finalizeHarnessServerStartup({
    server,
    state,
    startupTelemetry,
    openBrowser,
    browserLauncher,
    browserOpenState: {
      browserOpenedOnce: false
    }
  });
}

export type { HarnessBranchfsManager, HarnessServerOsAdapters } from "./server/core/contracts";
