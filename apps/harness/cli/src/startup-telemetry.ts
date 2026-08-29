import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTimerApi, type TimerApi } from "./server/runtime/timer-api";

export type StartupPhaseId = "bootstrap" | "workspace" | "runtimes" | "setup" | "ui-assets" | "serve";

export type StartupEventKind =
  | "session-start"
  | "phase-start"
  | "phase-pulse"
  | "phase-slow"
  | "phase-complete"
  | "retry"
  | "complete"
  | "failed";

export type StartupTelemetryEvent = {
  timestamp: string;
  pid: number;
  attempt: number;
  kind: StartupEventKind;
  phaseId?: StartupPhaseId;
  label: string;
  message: string;
  progressPercent: number;
  etaMs?: number;
  etaLowerBound?: boolean;
  elapsedMs: number;
  totalElapsedMs: number;
  hint?: string;
  details?: Record<string, unknown>;
  logPath?: string;
};

export type StartupTelemetrySink = {
  readonly logPath: string;
  sessionStart: (message?: string, details?: Record<string, unknown>) => void;
  pulse: (message: string, details?: Record<string, unknown>) => void;
  phaseStart: (phaseId: StartupPhaseId, message: string, details?: Record<string, unknown>) => void;
  phaseComplete: (message: string, details?: Record<string, unknown>) => void;
  retry: (message: string, details?: Record<string, unknown>) => void;
  complete: (message: string, details?: Record<string, unknown>) => void;
  failed: (message: string, details?: Record<string, unknown>) => void;
  getAttempt: () => number;
  getCurrentPhaseId: () => StartupPhaseId | undefined;
  dispose: () => void;
};

const STARTUP_EVENT_KINDS: readonly StartupEventKind[] = [
  "session-start", "phase-start", "phase-pulse", "phase-slow", "phase-complete", "retry", "complete", "failed",
];

export function parseStartupTelemetryEventJson(line: string): StartupTelemetryEvent {
  const value: unknown = JSON.parse(line);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Startup telemetry event must be an object");
  const timestamp = Reflect.get(value, "timestamp");
  const pid = Reflect.get(value, "pid");
  const attempt = Reflect.get(value, "attempt");
  const kind = Reflect.get(value, "kind");
  const label = Reflect.get(value, "label");
  const message = Reflect.get(value, "message");
  const progressPercent = Reflect.get(value, "progressPercent");
  const elapsedMs = Reflect.get(value, "elapsedMs");
  const totalElapsedMs = Reflect.get(value, "totalElapsedMs");
  const parsedKind = typeof kind === "string" ? STARTUP_EVENT_KINDS.find((candidate) => candidate === kind) : undefined;
  if (typeof timestamp !== "string" || typeof pid !== "number" || typeof attempt !== "number"
    || !parsedKind
    || typeof label !== "string" || typeof message !== "string" || typeof progressPercent !== "number"
    || typeof elapsedMs !== "number" || typeof totalElapsedMs !== "number") {
    throw new Error("Startup telemetry event has invalid required fields");
  }
  const event: StartupTelemetryEvent = { timestamp, pid, attempt, kind: parsedKind, label, message, progressPercent, elapsedMs, totalElapsedMs };
  const phaseId = Reflect.get(value, "phaseId");
  if (phaseId !== undefined) {
    const parsedPhaseId = typeof phaseId === "string" ? STARTUP_PHASE_IDS.find((candidate) => candidate === phaseId) : undefined;
    if (!parsedPhaseId) throw new Error("Startup telemetry event has invalid phaseId");
    event.phaseId = parsedPhaseId;
  }
  for (const field of ["etaMs", "elapsedMs", "totalElapsedMs"] as const) {
    const fieldValue = Reflect.get(value, field);
    if (fieldValue !== undefined && typeof fieldValue !== "number") throw new Error(`Startup telemetry event has invalid ${field}`);
  }
  const etaMs = Reflect.get(value, "etaMs");
  if (typeof etaMs === "number") event.etaMs = etaMs;
  const etaLowerBound = Reflect.get(value, "etaLowerBound");
  if (etaLowerBound !== undefined && typeof etaLowerBound !== "boolean") throw new Error("Startup telemetry event has invalid etaLowerBound");
  if (typeof etaLowerBound === "boolean") event.etaLowerBound = etaLowerBound;
  for (const field of ["hint", "logPath"] as const) {
    const fieldValue = Reflect.get(value, field);
    if (fieldValue !== undefined && typeof fieldValue !== "string") throw new Error(`Startup telemetry event has invalid ${field}`);
    if (typeof fieldValue === "string") event[field] = fieldValue;
  }
  const details = Reflect.get(value, "details");
  if (details !== undefined) {
    if (details === null || typeof details !== "object" || Array.isArray(details)) throw new Error("Startup telemetry event has invalid details");
    event.details = Object.fromEntries(Object.entries(details));
  }
  return event;
}

type StartupTelemetryOptions = {
  serverOnly?: boolean;
  now?: () => number;
  pid?: number;
  tmpDir?: string;
  writeLine?: (line: string) => void;
  setTimeout?: TimerApi["setTimeout"];
  clearTimeout?: TimerApi["clearTimeout"];
};

type PhaseDefinition = {
  label: string;
  weight: number;
  expectedMs: number;
  slowHint: string;
};

type EmitEventInput = {
  kind: StartupEventKind;
  message: string;
  phaseId?: StartupPhaseId;
  hint?: string;
  details?: Record<string, unknown>;
  elapsedMs?: number;
  includeLogPath?: boolean;
  suppressHumanLine?: boolean;
};

type StartupSessionState = {
  attempt: number;
  currentPhaseId: StartupPhaseId | undefined;
  currentPhaseStartedAt: number | undefined;
  slowMarked: boolean;
  finalized: boolean;
  completedPhases: Set<StartupPhaseId>;
};

type EmitStartupEvent = (input: EmitEventInput) => void;

const STARTUP_LOG_DIR = "pi-harness-startup";
const LOG_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_RETENTION_MAX_FILES = 20;
const FAST_PULSE_MS = 2_000;
const SLOW_PULSE_MS = 5_000;

const PHASES: Record<StartupPhaseId, PhaseDefinition> = {
  bootstrap: {
    label: "bootstrap",
    weight: 5,
    expectedMs: 300,
    slowHint: "possible early process init stall"
  },
  workspace: {
    label: "workspace",
    weight: 25,
    expectedMs: 800,
    slowHint: "possible SQLite migration, lock, or workspace recovery stall"
  },
  runtimes: {
    label: "runtimes",
    weight: 25,
    expectedMs: 1_500,
    slowHint: "possible CLI/runtime discovery or auth probe stall"
  },
  setup: {
    label: "setup",
    weight: 15,
    expectedMs: 500,
    slowHint: "possible setup health scan stall"
  },
  "ui-assets": {
    label: "ui-assets",
    weight: 20,
    expectedMs: 4_000,
    slowHint: "possible Bun/Solid/Tailwind build stall"
  },
  serve: {
    label: "serve",
    weight: 10,
    expectedMs: 250,
    slowHint: "possible port bind or Bun serve stall"
  }
};

const STARTUP_PHASE_IDS: readonly StartupPhaseId[] = [
  "bootstrap",
  "workspace",
  "runtimes",
  "setup",
  "ui-assets",
  "serve"
];

export function createStartupTelemetrySession(options: StartupTelemetryOptions = {}): StartupTelemetrySink {
  const now = options.now ?? Date.now;
  const writeLine = options.writeLine ?? ((line: string) => console.log(line));
  const defaultTimers = createTimerApi();
  const scheduleTimeout = options.setTimeout ?? defaultTimers.setTimeout;
  const cancelTimeout = options.clearTimeout ?? defaultTimers.clearTimeout;
  const pid = options.pid ?? process.pid;
  const sessionStartedAt = now();
  const includedPhases = STARTUP_PHASE_IDS.filter((phaseId) => !(options.serverOnly && phaseId === "ui-assets"));
  const normalizedWeights = normalizeWeights(includedPhases);
  const logDir = path.join(options.tmpDir ?? os.tmpdir(), STARTUP_LOG_DIR);
  const logPath = path.join(logDir, `${formatFileTimestamp(sessionStartedAt)}-pid${pid}.jsonl`);

  mkdirSync(logDir, { recursive: true });
  appendFileSync(logPath, "");
  pruneStartupLogs(logDir, logPath, sessionStartedAt);
  writeLine(`startup telemetry: ${logPath}`);

  const state: StartupSessionState = {
    attempt: 1,
    currentPhaseId: undefined,
    currentPhaseStartedAt: undefined,
    slowMarked: false,
    finalized: false,
    completedPhases: new Set<StartupPhaseId>()
  };
  const emitEvent = createStartupEventEmitter({
    state,
    now,
    pid,
    sessionStartedAt,
    includedPhases,
    normalizedWeights,
    logPath,
    writeLine
  });
  const timers = createStartupPhaseTimers({ state, emitEvent, scheduleTimeout, cancelTimeout });
  return createStartupTelemetrySink({ state, emitEvent, timers, now, sessionStartedAt, logPath });
}

function createStartupEventEmitter(input: {
  state: StartupSessionState;
  now: () => number;
  pid: number;
  sessionStartedAt: number;
  includedPhases: StartupPhaseId[];
  normalizedWeights: Map<StartupPhaseId, number>;
  logPath: string;
  writeLine: (line: string) => void;
}): EmitStartupEvent {
  return (eventInput) => {
    const phaseId = eventInput.phaseId ?? input.state.currentPhaseId;
    const timestampMs = input.now();
    const phaseElapsedMs = eventInput.elapsedMs
      ?? computePhaseElapsedMs(timestampMs, phaseId, input.state.currentPhaseStartedAt);
    const totalElapsedMs = Math.max(0, timestampMs - input.sessionStartedAt);
    const { progressPercent, etaMs, etaLowerBound } = computeProgressSnapshot({
      includedPhases: input.includedPhases,
      normalizedWeights: input.normalizedWeights,
      completedPhases: input.state.completedPhases,
      currentPhaseId: input.state.currentPhaseId,
      currentPhaseStartedAt: input.state.currentPhaseStartedAt,
      timestampMs,
      kind: eventInput.kind
    });
    const event: StartupTelemetryEvent = {
      timestamp: new Date(timestampMs).toISOString(),
      pid: input.pid,
      attempt: input.state.attempt,
      kind: eventInput.kind,
      phaseId,
      label: phaseId ? PHASES[phaseId].label : "startup",
      message: eventInput.message,
      progressPercent,
      elapsedMs: phaseElapsedMs,
      totalElapsedMs
    };
    if (etaMs !== undefined) event.etaMs = etaMs;
    if (etaLowerBound) event.etaLowerBound = true;
    if (eventInput.hint) event.hint = eventInput.hint;
    if (eventInput.details) event.details = eventInput.details;
    if (eventInput.includeLogPath) event.logPath = input.logPath;
    appendFileSync(input.logPath, `${JSON.stringify(event)}\n`);
    if (!eventInput.suppressHumanLine) input.writeLine(renderHumanLine(event));
  };
}

function createStartupPhaseTimers(input: {
  state: StartupSessionState;
  emitEvent: EmitStartupEvent;
  scheduleTimeout: TimerApi["setTimeout"];
  cancelTimeout: TimerApi["clearTimeout"];
}) {
  let fastPulseTimer: number | undefined;
  let slowPulseTimer: number | undefined;
  let slowThresholdTimer: number | undefined;

  function clear() {
    if (fastPulseTimer !== undefined) input.cancelTimeout(fastPulseTimer);
    if (slowPulseTimer !== undefined) input.cancelTimeout(slowPulseTimer);
    if (slowThresholdTimer !== undefined) input.cancelTimeout(slowThresholdTimer);
    fastPulseTimer = undefined;
    slowPulseTimer = undefined;
    slowThresholdTimer = undefined;
  }

  function scheduleFastPulse() {
    fastPulseTimer = input.scheduleTimeout(() => {
      const phaseId = input.state.currentPhaseId;
      if (!phaseId || input.state.finalized || input.state.slowMarked) return;
      input.emitEvent({ kind: "phase-pulse", message: `${PHASES[phaseId].label} in progress` });
      scheduleFastPulse();
    }, FAST_PULSE_MS);
  }

  function scheduleSlowPulse() {
    slowPulseTimer = input.scheduleTimeout(() => {
      const phaseId = input.state.currentPhaseId;
      if (!phaseId || input.state.finalized) return;
      input.emitEvent({ kind: "phase-pulse", message: `${PHASES[phaseId].label} still in progress` });
      scheduleSlowPulse();
    }, SLOW_PULSE_MS);
  }

  function schedule() {
    clear();
    const phaseId = input.state.currentPhaseId;
    if (!phaseId || input.state.finalized) return;
    scheduleFastPulse();
    const thresholdMs = Math.max(PHASES[phaseId].expectedMs, 5_000);
    slowThresholdTimer = input.scheduleTimeout(() => {
      const activePhaseId = input.state.currentPhaseId;
      if (!activePhaseId || input.state.finalized || input.state.slowMarked) return;
      input.state.slowMarked = true;
      if (fastPulseTimer !== undefined) {
        input.cancelTimeout(fastPulseTimer);
        fastPulseTimer = undefined;
      }
      input.emitEvent({
        kind: "phase-slow",
        hint: PHASES[activePhaseId].slowHint,
        message: `${PHASES[activePhaseId].label} exceeded expected startup time`,
        details: { thresholdMs }
      });
      scheduleSlowPulse();
    }, thresholdMs + 1);
  }

  return { clear, schedule };
}

function createStartupTelemetrySink(input: {
  state: StartupSessionState;
  emitEvent: EmitStartupEvent;
  timers: ReturnType<typeof createStartupPhaseTimers>;
  now: () => number;
  sessionStartedAt: number;
  logPath: string;
}): StartupTelemetrySink {
  return {
    logPath: input.logPath,
    sessionStart(message = "startup session created", details) {
      if (input.state.finalized) return;
      input.emitEvent({ kind: "session-start", message, details, includeLogPath: true, suppressHumanLine: true });
    },
    pulse(message, details) {
      if (input.state.finalized) return;
      input.emitEvent({ kind: "phase-pulse", message, details });
    },
    phaseStart(phaseId, message, details) {
      if (input.state.finalized) return;
      input.state.currentPhaseId = phaseId;
      input.state.currentPhaseStartedAt = input.now();
      input.state.slowMarked = false;
      input.emitEvent({ kind: "phase-start", phaseId, message, details, elapsedMs: 0 });
      input.timers.schedule();
    },
    phaseComplete(message, details) {
      const phaseId = input.state.currentPhaseId;
      if (input.state.finalized || !phaseId) return;
      const phaseElapsedMs = computePhaseElapsedMs(input.now(), phaseId, input.state.currentPhaseStartedAt);
      input.timers.clear();
      input.state.completedPhases.add(phaseId);
      input.state.currentPhaseId = undefined;
      input.state.currentPhaseStartedAt = undefined;
      input.state.slowMarked = false;
      input.emitEvent({ kind: "phase-complete", phaseId, message, details, elapsedMs: phaseElapsedMs });
    },
    retry(message, details) {
      if (input.state.finalized) return;
      input.emitEvent({ kind: "retry", message, details });
      input.timers.clear();
      input.state.completedPhases.clear();
      input.state.currentPhaseId = undefined;
      input.state.currentPhaseStartedAt = undefined;
      input.state.slowMarked = false;
      input.state.attempt += 1;
    },
    complete(message, details) {
      if (input.state.finalized) return;
      input.timers.clear();
      input.state.finalized = true;
      const totalElapsedMs = Math.max(0, input.now() - input.sessionStartedAt);
      input.emitEvent({ kind: "complete", message: `${message} after ${formatDuration(totalElapsedMs)}`, details });
    },
    failed(message, details) {
      if (input.state.finalized) return;
      input.timers.clear();
      input.state.finalized = true;
      const phaseId = input.state.currentPhaseId;
      const totalElapsedMs = Math.max(0, input.now() - input.sessionStartedAt);
      const phaseLabel = phaseId ? PHASES[phaseId].label : "startup";
      input.emitEvent({
        kind: "failed",
        phaseId,
        message: `${message} after ${formatDuration(totalElapsedMs)} (last phase ${phaseLabel}; log ${input.logPath})`,
        details: { ...details, lastPhaseId: phaseId, logPath: input.logPath }
      });
    },
    getAttempt: () => input.state.attempt,
    getCurrentPhaseId: () => input.state.currentPhaseId,
    dispose: input.timers.clear
  };
}

function computeProgressSnapshot(input: {
  includedPhases: StartupPhaseId[];
  normalizedWeights: Map<StartupPhaseId, number>;
  completedPhases: Set<StartupPhaseId>;
  currentPhaseId: StartupPhaseId | undefined;
  currentPhaseStartedAt: number | undefined;
  timestampMs: number;
  kind: StartupEventKind;
}) {
  if (input.kind === "complete") {
    return {
      progressPercent: 100,
      etaMs: 0,
      etaLowerBound: false
    };
  }

  const completedWeight = [...input.completedPhases].reduce(
    (sum, phaseId) => sum + (input.normalizedWeights.get(phaseId) ?? 0),
    0
  );
  let activeWeight = 0;
  let etaMs = input.includedPhases
    .filter((phaseId) => !input.completedPhases.has(phaseId))
    .reduce((sum, phaseId) => sum + PHASES[phaseId].expectedMs, 0);
  let etaLowerBound = false;

  if (input.currentPhaseId) {
    const phase = PHASES[input.currentPhaseId];
    const phaseElapsedMs = computePhaseElapsedMs(input.timestampMs, input.currentPhaseId, input.currentPhaseStartedAt);
    activeWeight = (input.normalizedWeights.get(input.currentPhaseId) ?? 0) * Math.min(phaseElapsedMs / phase.expectedMs, 0.92);
    const futureEtaMs = input.includedPhases
      .filter((phaseId) => phaseId !== input.currentPhaseId && !input.completedPhases.has(phaseId))
      .reduce((sum, phaseId) => sum + PHASES[phaseId].expectedMs, 0);

    if (phaseElapsedMs > phase.expectedMs) {
      etaMs = futureEtaMs;
      etaLowerBound = true;
    } else {
      etaMs = phase.expectedMs - phaseElapsedMs + futureEtaMs;
    }
  }

  const progressPercent = Math.min(99, Math.max(0, Math.round(completedWeight + activeWeight)));
  return {
    progressPercent,
    etaMs,
    etaLowerBound
  };
}

function computePhaseElapsedMs(
  timestampMs: number,
  phaseId: StartupPhaseId | undefined,
  phaseStartedAt: number | undefined
) {
  if (!phaseId || phaseStartedAt === undefined) {
    return 0;
  }

  return Math.max(0, timestampMs - phaseStartedAt);
}

function normalizeWeights(includedPhases: StartupPhaseId[]) {
  const totalWeight = includedPhases.reduce((sum, phaseId) => sum + PHASES[phaseId].weight, 0);
  const normalized = new Map<StartupPhaseId, number>();
  for (const phaseId of includedPhases) {
    normalized.set(phaseId, (PHASES[phaseId].weight / totalWeight) * 100);
  }
  return normalized;
}

function pruneStartupLogs(logDir: string, activeLogPath: string, nowMs: number) {
  const retainedEntries: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const entry of readdirSync(logDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }

    const filePath = path.join(logDir, entry.name);
    const stats = statSync(filePath);
    if (nowMs - stats.mtimeMs > LOG_RETENTION_MAX_AGE_MS) {
      rmSync(filePath, { force: true });
      continue;
    }

    retainedEntries.push({
      filePath,
      mtimeMs: stats.mtimeMs
    });
  }

  retainedEntries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const entry of retainedEntries.slice(LOG_RETENTION_MAX_FILES)) {
    if (entry.filePath === activeLogPath) {
      continue;
    }

    rmSync(entry.filePath, { force: true });
  }
}

function renderHumanLine(event: StartupTelemetryEvent) {
  const etaValue = event.etaMs !== undefined ? formatDuration(event.etaMs) : "--";
  const etaSegment = event.etaLowerBound ? `eta > ${etaValue}` : `eta ${etaValue}`;
  const phaseLabel = event.kind === "phase-slow" ? `${event.label} slow` : event.label;
  const message = event.kind === "phase-slow" ? event.hint ?? event.message : event.message;
  return `[startup a${event.attempt}] ${event.progressPercent}% | ${etaSegment} | ${phaseLabel} | ${message}`;
}

function formatDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0s";
  }

  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round(durationMs / 100) / 10;
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round((seconds - minutes * 60) * 10) / 10;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatFileTimestamp(timestampMs: number) {
  return new Date(timestampMs).toISOString().replaceAll(":", "-");
}
