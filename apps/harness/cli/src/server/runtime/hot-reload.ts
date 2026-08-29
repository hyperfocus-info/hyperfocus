import { setDevHarnessServerSingleton } from "../../dev-server-singleton";
import type { getDevHarnessServerSingleton } from "../../dev-server-singleton";
import { BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION } from "../core/constants";
import type { DevHmrDebouncePolicy, HarnessConnection, HarnessHandlerRefs, HarnessServerState, HarnessWebSocketOptions, TimerApi } from "../core/contracts";
import { getBackgroundJobRepositoryRuntimeContractMismatch } from "./background-run-lifecycle";
import { createDevHmrDebounceSchedule } from "../../ui-build";
import { statSync } from "node:fs";
import path from "node:path";

export function getHotSingletonRestartReason(
  singleton: NonNullable<
    ReturnType<
      typeof getDevHarnessServerSingleton<
        HarnessServerState,
        HarnessHandlerRefs,
        Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
        HarnessWebSocketOptions
      >
    >
  >,
  hotSingletonVersion: number
) {
  if (singleton.version !== hotSingletonVersion) {
    return `hot singleton schema changed (${singleton.version} -> ${hotSingletonVersion})`;
  }
  if (singleton.runtimeContractVersion !== BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION) {
    return `background job runtime contract changed (${singleton.runtimeContractVersion ?? "missing"} -> ${BACKGROUND_JOB_RUNTIME_CONTRACT_VERSION})`;
  }
  const repositoryMismatch = getBackgroundJobRepositoryRuntimeContractMismatch(singleton.state.repository);
  return repositoryMismatch ? `background job runtime contract mismatch: ${repositoryMismatch}` : undefined;
}

export function queueHotReloadUpdate(input: {
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
  state: HarnessServerState;
  handlerRefs: HarnessHandlerRefs;
  debouncePolicy: DevHmrDebouncePolicy;
  timerApi: TimerApi;
}) {
  input.singleton.pendingState = input.state;
  input.singleton.pendingHandlerRefs = input.handlerRefs;
  clearPendingHotReloadUpdate(input.singleton, input.timerApi);

  const debounceMs = nextHotReloadDelay(input.singleton, input.debouncePolicy);
  if (debounceMs <= 0) {
    applyHotReloadUpdate(input.singleton);
    return;
  }

  input.singleton.pendingApplyTimer = input.timerApi.setTimeout(() => {
    input.singleton.pendingApplyTimer = undefined;
    input.singleton.pendingApplyBackoffStep = 0;
    applyHotReloadUpdate(input.singleton);
  }, debounceMs);
  setDevHarnessServerSingleton(input.singleton);
}

export function resolveDevHmrDebouncePolicy(overrideDebounceMs: number | undefined): DevHmrDebouncePolicy {
  if (overrideDebounceMs !== undefined) {
    return {
      scheduleMs: [Math.max(0, Math.round(overrideDebounceMs))]
    };
  }

  return {
    scheduleMs: createDevHmrDebounceSchedule()
  };
}

export function peekNextHotReloadDelay(
  singleton: {
    pendingApplyBackoffStep?: number;
  },
  policy: DevHmrDebouncePolicy
) {
  const schedule = policy.scheduleMs.length > 0 ? policy.scheduleMs : [0];
  const step = singleton.pendingApplyBackoffStep ?? 0;
  return schedule[Math.min(step, schedule.length - 1)] ?? 0;
}

export function nextHotReloadDelay(
  singleton: {
    pendingApplyBackoffStep?: number;
  },
  policy: DevHmrDebouncePolicy
) {
  const delayMs = peekNextHotReloadDelay(singleton, policy);
  singleton.pendingApplyBackoffStep = (singleton.pendingApplyBackoffStep ?? 0) + 1;
  return delayMs;
}

export function consumeTrackedBackendHotReloadChange(singleton: {
  trackedHotReloadSnapshot?: Map<string, number>;
}) {
  const previousSnapshot = singleton.trackedHotReloadSnapshot;
  const nextSnapshot = readTrackedBackendHotReloadSnapshot();
  if (!nextSnapshot) {
    return true;
  }

  singleton.trackedHotReloadSnapshot = nextSnapshot;
  if (!previousSnapshot) {
    return true;
  }

  if (previousSnapshot.size !== nextSnapshot.size) {
    return true;
  }

  for (const [filePath, mtimeMs] of nextSnapshot) {
    if (previousSnapshot.get(filePath) !== mtimeMs) {
      return true;
    }
  }

  return false;
}

export function readTrackedBackendHotReloadSnapshot() {
  const result = Bun.spawnSync({
    cmd: ["git", "ls-files", "-z", "--", "apps/harness/cli", "packages/ai-core", "package.json", "bun.lock"],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "ignore"
  });

  if (result.exitCode !== 0) {
    return undefined;
  }

  const snapshot = new Map<string, number>();
  for (const filePath of result.stdout.toString().split("\0")) {
    if (!filePath || isBackendHotReloadIgnoredPath(filePath)) {
      continue;
    }

    snapshot.set(filePath, readFileMtimeMs(path.resolve(process.cwd(), filePath)));
  }
  return snapshot;
}

export function isBackendHotReloadIgnoredPath(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const basename = path.basename(normalizedPath);
  return (
    /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(basename) ||
    /\.integration\.test\.[cm]?[tj]sx?$/.test(basename) ||
    normalizedPath.includes("/test-support/") ||
    normalizedPath.includes("/utils/tests/") ||
    normalizedPath.includes("/__tests__/")
  );
}

export function readFileMtimeMs(filePath: string) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return -1;
  }
}

export function applyHotReloadUpdate(
  singleton: NonNullable<
    ReturnType<
      typeof getDevHarnessServerSingleton<
        HarnessServerState,
        HarnessHandlerRefs,
        Awaited<ReturnType<typeof Bun.serve<HarnessConnection>>>,
        HarnessWebSocketOptions
      >
    >
  >
) {
  if (!singleton.pendingState || !singleton.pendingHandlerRefs) {
    return;
  }

  const previousState = singleton.state;
  singleton.state = singleton.pendingState;
  singleton.handlerRefs = singleton.pendingHandlerRefs;
  singleton.pendingState = undefined;
  singleton.pendingHandlerRefs = undefined;
  singleton.pendingApplyBackoffStep = 0;
  singleton.server.reload({
    fetch: singleton.handlerRefs.fetch,
    routes: singleton.handlerRefs.routes,
    websocket: singleton.websocketShell
  });
  setDevHarnessServerSingleton(singleton);
  if (previousState.scheduler !== singleton.state.scheduler) {
    previousState.scheduler.stop();
  }
  singleton.state.scheduler.stop();
  singleton.state.scheduler.start();
}

export function clearPendingHotReloadUpdate(
  singleton: {
    pendingApplyTimer?: number;
    pendingApplyBackoffStep?: number;
  },
  timerApi: TimerApi
) {
  if (!singleton.pendingApplyTimer) {
    return;
  }

  timerApi.clearTimeout(singleton.pendingApplyTimer);
  singleton.pendingApplyTimer = undefined;
}
