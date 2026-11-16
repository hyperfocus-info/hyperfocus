import type { ServerMetrics } from "./metrics.ts";

const DEFAULT_MAX_IN_FLIGHT = 100_000;
const MAX_CONFIGURED_IN_FLIGHT = 1_000_000;

export type GracefulDrainState = "accepting" | "draining" | "stopped";

export type GracefulShutdownEvidence = {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  timedOut: boolean;
  pendingAtTimeout: number;
  completedWork: number;
};

export type GracefulDrainController = {
  readonly state: GracefulDrainState;
  readonly inFlight: number;
  readonly completedWork: number;
  begin(kind?: string): () => void;
  run<T>(kind: string, operation: () => Promise<T>): Promise<T>;
  shutdown(stop: () => void | Promise<void>, options?: { drainTimeoutMs?: number; stopTimeoutMs?: number }): Promise<GracefulShutdownEvidence>;
};

export function createGracefulDrainController(options: { maxInFlight?: number; now?: () => number; metrics?: ServerMetrics } = {}): GracefulDrainController {
  const maxInFlight = boundedPositiveInteger(options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT, "maxInFlight", MAX_CONFIGURED_IN_FLIGHT);
  const now = options.now ?? Date.now;
  const metrics = options.metrics;
  let state: GracefulDrainState = "accepting";
  let inFlight = 0;
  let completedWork = 0;
  let shutdownPromise: Promise<GracefulShutdownEvidence> | undefined;
  const idleWaiters = new Set<() => void>();
  const controller: GracefulDrainController = {
    get state() { return state; },
    get inFlight() { return inFlight; },
    get completedWork() { return completedWork; },
    begin(kind = "request") {
      assertMetricSegment(kind, "Work kind");
      if (state !== "accepting") throw new Error("Server is draining and no longer accepts new work.");
      if (inFlight >= maxInFlight) throw new Error(`Server in-flight work limit ${maxInFlight} reached.`);
      inFlight += 1;
      metrics?.gauge("operations.in_flight", inFlight);
      metrics?.increment("operations.work_started", 1, { kind });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        inFlight -= 1;
        completedWork += 1;
        metrics?.gauge("operations.in_flight", inFlight);
        metrics?.increment("operations.work_completed", 1, { kind });
        if (inFlight === 0) {
          for (const resolve of idleWaiters) resolve();
          idleWaiters.clear();
        }
      };
    },
    async run<T>(kind: string, operation: () => Promise<T>): Promise<T> {
      if (typeof operation !== "function") throw new TypeError("Tracked operation must be a function.");
      const release = controller.begin(kind);
      try { return await operation(); }
      finally { release(); }
    },
    shutdown(stop, shutdownOptions = {}) {
      if (shutdownPromise) return shutdownPromise;
      if (typeof stop !== "function") return Promise.reject(new TypeError("Graceful shutdown requires a stop callback."));
      const drainTimeoutMs = boundedTimeout(shutdownOptions.drainTimeoutMs ?? 30_000, "drainTimeoutMs");
      const stopTimeoutMs = boundedTimeout(shutdownOptions.stopTimeoutMs ?? 30_000, "stopTimeoutMs");
      state = "draining";
      metrics?.gauge("operations.accepting", 0);
      metrics?.increment("operations.drain_started");
      shutdownPromise = (async () => {
        const startedAt = readClock(now, "Drain clock");
        const drained = inFlight === 0 ? true : await waitForIdle(idleWaiters, drainTimeoutMs);
        const pendingAtTimeout = drained ? 0 : inFlight;
        let stopError: unknown;
        try { await withTimeout(Promise.resolve().then(stop), stopTimeoutMs, "server stop"); }
        catch (cause) { stopError = cause; }
        state = "stopped";
        const completedAt = readClock(now, "Drain clock");
        const evidence = {
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          timedOut: !drained || Boolean(stopError),
          pendingAtTimeout,
          completedWork,
        };
        metrics?.increment("operations.drain_completed", 1, { timedOut: String(evidence.timedOut) });
        if (stopError) throw new AggregateError([stopError], "Graceful shutdown stop callback failed or timed out.");
        return evidence;
      })();
      return shutdownPromise;
    },
  };
  return controller;
}

function waitForIdle(waiters: Set<() => void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      waiters.delete(onIdle);
      resolve(value);
    };
    const onIdle = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    waiters.add(onIdle);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms timeout.`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boundedTimeout(value: number, label: string): number {
  const result = positiveInteger(value, label);
  if (result > 300000) throw new Error(`${label} may not exceed 300000ms.`);
  return result;
}

function assertMetricSegment(value: string, label: string): void {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) throw new Error(`${label} must match [a-z][a-z0-9_.-]{0,63}.`);
}

function readClock(clock: () => number, label: string): number {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer timestamp.`);
  return value;
}

function boundedPositiveInteger(value: number, label: string, maximum: number): number {
  const result = positiveInteger(value, label);
  if (result > maximum) throw new Error(`${label} may not exceed ${maximum}.`);
  return result;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}
