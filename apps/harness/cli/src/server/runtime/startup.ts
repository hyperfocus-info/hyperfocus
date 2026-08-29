import type { openSystemBrowser } from "../../desktop-app";
import { clearDevHarnessServerSingleton, getDevHarnessServerSingleton, setDevHarnessServerSingleton } from "../../dev-server-singleton";
import { pickProjectFolder } from "../../folder-picker";
import { createPiSdkAgentAdapter } from "../../pi-agent-adapter";
import { BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION } from "../core/constants";
import type { DevHmrDebouncePolicy, HarnessConnection, HarnessHandlerRefs, HarnessServerOptions, HarnessServerState, HarnessWebSocketOptions, TimerApi } from "../core/contracts";
import { clearPendingHotReloadUpdate, consumeTrackedBackendHotReloadChange, getHotSingletonRestartReason, peekNextHotReloadDelay, queueHotReloadUpdate, readTrackedBackendHotReloadSnapshot } from "./hot-reload";
import { initializeHarnessServerState } from "./initialize";
import { finalizeHarnessServerStartup } from "./server-startup";
import { formatUnknownErrorMessage } from "./error-classification";
import { attachDesktopClientLifecycle, createHarnessBunServer, createHarnessHandlerRefs, decorateHarnessServerStop } from "../transport/bun-server";
import type { StartupTelemetrySink } from "../../startup-telemetry";
import { withWebsocketCompression } from "../../websocket-send-guard";

export function resolveHotDevelopmentMode(forcedMode: boolean | undefined) {
  return forcedMode ?? (process.execArgv.includes("--hot") && process.env.NODE_ENV !== "production");
}

export async function startHotReloadableHarnessServer(
  options: Required<
    Pick<
      HarnessServerOptions,
      | "port"
      | "serverOnly"
      | "openBrowser"
      | "desktopMode"
      | "desktopIdleGraceMs"
      | "launchMode"
      | "uiAssetManagerFactory"
      | "browserLauncher"
      | "hotSingletonVersion"
      | "derivedProgressHeartbeatMs"
      | "timerApi"
    >
  > & {
    hotReloadDebouncePolicy: DevHmrDebouncePolicy;
  } &
    Pick<
      HarnessServerOptions,
      | "hostname"
      | "adapter"
      | "repository"
      | "runtimeRegistry"
      | "osAdapters"
      | "pickFolder"
      | "startupTelemetry"
      | "backendHotReloadChangeDetector"
      | "sessionToken"
    >
) {
  let singleton = getDevHarnessServerSingleton<
    HarnessServerState,
    HarnessHandlerRefs,
    Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
    HarnessWebSocketOptions
  >();

  const hotRestartReason = singleton
    ? getHotSingletonRestartReason(singleton, options.hotSingletonVersion)
    : undefined;
  const restartSingleton = singleton && hotRestartReason ? singleton : undefined;
  if (restartSingleton) {
    clearPendingHotReloadUpdate(restartSingleton, options.timerApi);
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[dev] ${hotRestartReason}; preparing server state restart`);
    }
    singleton = undefined;
  }

  if (singleton) {
    const hasBackendHotReloadChange = options.backendHotReloadChangeDetector
      ? options.backendHotReloadChangeDetector()
      : consumeTrackedBackendHotReloadChange(singleton);
    if (!hasBackendHotReloadChange) {
      options.startupTelemetry?.phaseStart("serve", "ignoring dev hot reload without tracked backend file changes");
      return finalizeHarnessServerStartup({
        server: singleton.server,
        state: singleton.state,
        startupTelemetry: options.startupTelemetry,
        openBrowser: options.openBrowser,
        browserLauncher: options.browserLauncher,
        browserOpenState: singleton
      });
    }
  }

  let state: HarnessServerState;
  let handlerRefs: HarnessHandlerRefs;
  try {
    state = await initializeHarnessServerState({
      adapter: singleton?.state.adapter ?? options.adapter ?? createPiSdkAgentAdapter(),
      repository: options.repository,
      runtimeRegistry: options.runtimeRegistry,
      osAdapters: options.osAdapters,
      pickFolder: options.pickFolder ?? pickProjectFolder,
      serverOnly: options.serverOnly,
      desktopMode: options.desktopMode,
      launchMode: options.launchMode,
      startupTelemetry: options.startupTelemetry,
      uiAssetManagerFactory: options.uiAssetManagerFactory,
      hotDevelopmentMode: true,
      hotReloadDebouncePolicy: options.hotReloadDebouncePolicy,
      existingState: singleton?.state,
      sessionToken: options.sessionToken
    });
    handlerRefs = createHarnessHandlerRefs(state, { derivedProgressHeartbeatMs: options.derivedProgressHeartbeatMs });
  } catch (error) {
    const fallbackSingleton = restartSingleton ?? singleton;
    if (fallbackSingleton) {
      return recoverFailedHotReload({
        singleton: fallbackSingleton,
        error,
        startupTelemetry: options.startupTelemetry,
        openBrowser: options.openBrowser,
        browserLauncher: options.browserLauncher,
        timerApi: options.timerApi
      });
    }
    throw error;
  }

  if (singleton) {
    const nextReloadDelayMs = peekNextHotReloadDelay(singleton, options.hotReloadDebouncePolicy);
    options.startupTelemetry?.phaseStart(
      "serve",
      nextReloadDelayMs > 0
        ? `queueing dev hot reload apply after ${nextReloadDelayMs}ms quiet window`
        : "reloading Bun server handlers"
    );
    queueHotReloadUpdate({
      singleton,
      state,
      handlerRefs,
      debouncePolicy: options.hotReloadDebouncePolicy,
      timerApi: options.timerApi
    });
    return finalizeHarnessServerStartup({
      server: singleton.server,
      state: singleton.state,
      startupTelemetry: options.startupTelemetry,
      openBrowser: options.openBrowser,
      browserLauncher: options.browserLauncher,
      browserOpenState: singleton
    });
  }

  if (restartSingleton) {
    await restartSingleton.server.stop(true);
    clearDevHarnessServerSingleton();
  }

  const websocketShell: HarnessWebSocketOptions = withWebsocketCompression({
    open(ws) {
      singleton?.handlerRefs.websocket.open(ws);
    },
    close(ws, code, reason) {
      singleton?.handlerRefs.websocket.close(ws, code, reason);
    },
    message(ws, message) {
      singleton?.handlerRefs.websocket.message(ws, message);
    }
  });

  options.startupTelemetry?.phaseStart("serve", "starting Bun server listeners");
  const server = createHarnessBunServer({
    port: options.port,
    hostname: options.hostname,
    handlerRefs,
    websocket: websocketShell
  });

  attachDesktopClientLifecycle(server, state, options.desktopMode, options.desktopIdleGraceMs);

  singleton = setDevHarnessServerSingleton({
    version: options.hotSingletonVersion,
    runtimeContractVersion: BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION,
    state,
    handlerRefs,
    server,
    browserOpenedOnce: false,
    websocketShell,
    pendingState: undefined,
    pendingHandlerRefs: undefined,
    pendingApplyTimer: undefined,
    trackedHotReloadSnapshot: readTrackedBackendHotReloadSnapshot()
  });
  decorateHarnessServerStop(server, () => {
    const currentSingleton = getDevHarnessServerSingleton<
      HarnessServerState,
      HarnessHandlerRefs,
      Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
      HarnessWebSocketOptions
    >();
    return currentSingleton?.state ?? state;
  }, () => {
    const currentSingleton = getDevHarnessServerSingleton<
      HarnessServerState,
      HarnessHandlerRefs,
      Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
      HarnessWebSocketOptions
    >();
    if (currentSingleton?.server === server) {
      clearPendingHotReloadUpdate(currentSingleton, options.timerApi);
      clearDevHarnessServerSingleton();
    }
  });

  return finalizeHarnessServerStartup({
    server,
    state,
    startupTelemetry: options.startupTelemetry,
    openBrowser: options.openBrowser,
    browserLauncher: options.browserLauncher,
    browserOpenState: singleton
  });
}

export function recoverFailedHotReload(input: {
  singleton: NonNullable<
    ReturnType<
      typeof getDevHarnessServerSingleton<
        HarnessServerState,
        HarnessHandlerRefs,
        Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
        HarnessWebSocketOptions
      >
    >
  >;
  error: unknown;
  startupTelemetry?: StartupTelemetrySink;
  openBrowser: boolean;
  browserLauncher: typeof openSystemBrowser;
  timerApi: TimerApi;
}) {
  clearPendingHotReloadUpdate(input.singleton, input.timerApi);
  input.singleton.pendingState = undefined;
  input.singleton.pendingHandlerRefs = undefined;
  input.singleton.pendingApplyBackoffStep = 0;
  setDevHarnessServerSingleton(input.singleton);

  const message = formatUnknownErrorMessage(input.error);
  if (process.env.NODE_ENV !== "test") {
    console.warn(`[dev] hot reload failed; keeping previous server live until the next backend change: ${message}`);
  }
  input.startupTelemetry?.phaseStart("serve", "dev hot reload failed; keeping previous server live", {
    error: message
  });

  return finalizeHarnessServerStartup({
    server: input.singleton.server,
    state: input.singleton.state,
    startupTelemetry: input.startupTelemetry,
    openBrowser: input.openBrowser,
    browserLauncher: input.browserLauncher,
    browserOpenState: input.singleton
  });
}
