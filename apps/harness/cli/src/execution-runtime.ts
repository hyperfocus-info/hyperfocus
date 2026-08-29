import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "./pi-agent-adapter";
import type { ComposerReasoningStrength } from "@hyperfocus/ai-core/protocol";
import {
  createCapacityGovernor,
  createCapacityLeaseRegistry,
  type CapacityGovernor,
  type CapacityGovernorOptions,
  type CapacityLease,
  type CapacityLeaseRegistry
} from "@hyperfocus/ai-core/capacity-governor";
import { decorateAgentRuntimeRegistry, type AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";

export type ManagedExecutionKind = "planner" | "main" | "subagent" | "aggregator";

export type ManagedExecutionPhase =
  | "queued"
  | "provisioning"
  | "api-starting"
  | "active"
  | "finishing"
  | "waiting-input"
  | "done"
  | "failed";

export type ManagedRefreshAction = "restart" | "continue";

export type ExecutionRequestSnapshot = {
  cwd: string;
  modelId: string;
  prompt: string;
  readOnly?: boolean;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
};

export type SubagentSpawnTimingSnapshot = {
  dequeuedAt?: number;
  worktreePrepareStartedAt?: number;
  worktreeReadyAt?: number;
  sessionCreatedAt?: number;
  firstActivityAt?: number;
  firstToolStartAt?: number;
  completedAt?: number;
  failedAt?: number;
};

export type ManagedExecutionState = {
  runId: string;
  threadId: string;
  subagentId?: string;
  kind: ManagedExecutionKind;
  phase: ManagedExecutionPhase;
  hasReceivedActivity: boolean;
  lastProgressAt: number;
  refreshRequested: boolean;
  refreshDeferred: boolean;
  pendingRefreshAction?: ManagedRefreshAction;
  originalRequest: ExecutionRequestSnapshot;
  continuationRequest: ExecutionRequestSnapshot;
  controller?: PiAgentExecutionController;
  spawnTiming?: SubagentSpawnTimingSnapshot;
};

export function getExecutionKey(input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
  return [input.runId, input.kind, input.subagentId ?? "run"].join(":");
}

export const HARNESS_CAPACITY_DEFAULTS = {
  subagent: 4,
  provider: 4,
  "provider.openai": 4,
  "provider.google": 4,
  "provider.anthropic": 4,
  "provider.github": 4,
  "provider.other": 2,
  branchfs: 8,
  browser: 2,
  document: 2
} as const;

const capacityEnvironment = [
  ["subagent", "HARNESS_CAPACITY_SUBAGENTS", HARNESS_CAPACITY_DEFAULTS.subagent],
  ["provider", "HARNESS_CAPACITY_PROVIDERS", HARNESS_CAPACITY_DEFAULTS.provider],
  ["provider.openai", "HARNESS_CAPACITY_OPENAI", HARNESS_CAPACITY_DEFAULTS["provider.openai"]],
  ["provider.google", "HARNESS_CAPACITY_GOOGLE", HARNESS_CAPACITY_DEFAULTS["provider.google"]],
  ["provider.anthropic", "HARNESS_CAPACITY_ANTHROPIC", HARNESS_CAPACITY_DEFAULTS["provider.anthropic"]],
  ["provider.github", "HARNESS_CAPACITY_GITHUB", HARNESS_CAPACITY_DEFAULTS["provider.github"]],
  ["provider.other", "HARNESS_CAPACITY_OTHER_PROVIDERS", HARNESS_CAPACITY_DEFAULTS["provider.other"]],
  ["branchfs", "HARNESS_CAPACITY_BRANCHFS", HARNESS_CAPACITY_DEFAULTS.branchfs],
  ["browser", "HARNESS_CAPACITY_BROWSERS", HARNESS_CAPACITY_DEFAULTS.browser],
  ["document", "HARNESS_CAPACITY_DOCUMENTS", HARNESS_CAPACITY_DEFAULTS.document]
] as const;

let sharedCapacityGovernor: CapacityGovernor | undefined;
const managedAdapters = new WeakMap<PiAgentAdapter, PiAgentAdapter>();
const providerRecoveryStates = new WeakMap<CapacityGovernor, {
  timers: Map<string, ReturnType<typeof setTimeout>>;
  restoreCapacities: Map<string, number>;
}>();
let browserCapacityRegistry: CapacityLeaseRegistry | undefined;
const providerKeys = ["openai", "google", "anthropic", "github", "other"] as const;
type ProviderKey = (typeof providerKeys)[number];

export function createHarnessCapacityGovernor(
  options: Partial<CapacityGovernorOptions> & {
    capacities?: Partial<Record<keyof typeof HARNESS_CAPACITY_DEFAULTS, number>>;
  } = {}
) {
  const capacities = Object.fromEntries(capacityEnvironment.map(([resource, environmentKey, fallback]) => [
    resource,
    options.capacities?.[resource] ?? readCapacity(process.env[environmentKey], fallback, environmentKey)
  ]));
  const rateLimits = options.rateLimits ?? Object.fromEntries(providerKeys.flatMap((provider) => {
    const requests = readRateLimit(process.env[`HARNESS_PROVIDER_${provider.toUpperCase()}_RPM`], 4_096,
      `HARNESS_PROVIDER_${provider.toUpperCase()}_RPM`);
    const tokens = readOptionalRateLimit(process.env[`HARNESS_PROVIDER_${provider.toUpperCase()}_TPM`],
      `HARNESS_PROVIDER_${provider.toUpperCase()}_TPM`);
    return [
      [`provider.${provider}.requests`, { capacity: requests, intervalMs: 60_000 }],
      ...(tokens === undefined ? [] : [[`provider.${provider}.tokens`, { capacity: tokens, intervalMs: 60_000 }]])
    ];
  }));
  return createCapacityGovernor({
    capacities,
    rateLimits,
    maxQueued: options.maxQueued ?? 4_096,
    scheduling: options.scheduling ?? "fifo",
    maxBypasses: options.maxBypasses ?? 8,
    now: options.now
  });
}

export function getHarnessCapacityGovernor() {
  sharedCapacityGovernor ??= createHarnessCapacityGovernor();
  return sharedCapacityGovernor;
}

export type ProviderCongestionCategory = "rate-limit" | "network";

export class ProviderCongestionError extends Error {
  readonly category: ProviderCongestionCategory;
  readonly provider: ProviderKey;
  readonly retryAfterMs: number;

  constructor(input: {
    category: ProviderCongestionCategory;
    provider: ProviderKey;
    retryAfterMs: number;
    cause: unknown;
  }) {
    const message = input.cause instanceof Error ? input.cause.message : String(input.cause);
    super(`${message} [provider=${input.provider}] [category=${input.category}] [retry-after-ms=${input.retryAfterMs}]`, {
      cause: input.cause
    });
    this.name = "ProviderCongestionError";
    this.category = input.category;
    this.provider = input.provider;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export function getHarnessManagedAgentAdapter(
  source: PiAgentAdapter,
  options: {
    governor?: CapacityGovernor;
    jitter?: () => number;
    setTimer?: typeof setTimeout;
  } = {}
) {
  if (!options.governor && !options.jitter && !options.setTimer) {
    const existing = managedAdapters.get(source);
    if (existing) return existing;
  }
  const governor = options.governor ?? getHarnessCapacityGovernor();
  const jitter = options.jitter ?? Math.random;
  const setTimer = options.setTimer ?? setTimeout;

  const managed: PiAgentAdapter = {
    runPrompt(request) {
      return runProviderRequest(governor, request, () => source.runPrompt(request), jitter, setTimer);
    },
    async startExecution(request) {
      const reservation = await acquireProviderReservation(governor, request);
      let controller: PiAgentExecutionController;
      try {
        controller = await source.startExecution(request);
      } catch (error) {
        reservation.release();
        throw coordinateProviderFailure(governor, request, error, jitter, setTimer);
      }
      const result = settleProviderResult(governor, request, controller.result, reservation, jitter, setTimer);
      return {
        result,
        continueWithPrompt(prompt) {
          const continuation = { ...request, prompt: prompt ?? "continue" };
          return runProviderRequest(
            governor,
            continuation,
            () => controller.continueWithPrompt(prompt),
            jitter,
            setTimer
          );
        },
        abort: () => controller.abort(),
        dispose() {
          reservation.release();
          controller.dispose();
        }
      };
    },
    setApiKey: (provider, apiKey) => source.setApiKey(provider, apiKey),
    hasApiKey: (provider) => source.hasApiKey(provider)
  };
  if (!options.governor && !options.jitter && !options.setTimer) managedAdapters.set(source, managed);
  return managed;
}

export function createHarnessManagedRuntimeRegistry(registry: AgentRuntimeRegistry) {
  return decorateAgentRuntimeRegistry(registry, getHarnessManagedAgentAdapter);
}

export async function acquireHarnessBrowserCapacity(key: string, signal?: AbortSignal) {
  await getBrowserCapacityRegistry().acquire({ key, resources: { browser: 1 }, signal });
}

export function releaseHarnessBrowserCapacity(key: string) {
  return getBrowserCapacityRegistry().release(key);
}

function getBrowserCapacityRegistry() {
  browserCapacityRegistry ??= createCapacityLeaseRegistry({ governor: getHarnessCapacityGovernor() });
  return browserCapacityRegistry;
}

async function runProviderRequest(
  governor: CapacityGovernor,
  request: PiAgentPromptRequest,
  execute: () => Promise<PiAgentPromptResult>,
  jitter: () => number,
  setTimer: typeof setTimeout
) {
  const reservation = await acquireProviderReservation(governor, request);
  return settleProviderResult(governor, request, execute(), reservation, jitter, setTimer);
}

async function settleProviderResult(
  governor: CapacityGovernor,
  request: PiAgentPromptRequest,
  result: Promise<PiAgentPromptResult>,
  reservation: CapacityLease,
  jitter: () => number,
  setTimer: typeof setTimeout
) {
  try {
    return await result;
  } catch (error) {
    throw coordinateProviderFailure(governor, request, error, jitter, setTimer);
  } finally {
    reservation.release();
  }
}

function acquireProviderReservation(governor: CapacityGovernor, request: PiAgentPromptRequest) {
  const provider = providerForModel(request.modelId);
  const snapshot = governor.snapshot();
  const providerResource = `provider.${provider}`;
  const requestRate = `${providerResource}.requests`;
  const tokenRate = `${providerResource}.tokens`;
  const rateCosts: Record<string, number> = {};
  if (requestRate in snapshot.rateUsage) rateCosts[requestRate] = 1;
  if (tokenRate in snapshot.rateUsage) {
    rateCosts[tokenRate] = Math.min(estimatePromptTokens(request), snapshot.rateLimits[tokenRate].capacity);
  }
  return governor.acquire({
    resources: { provider: 1, [providerResource]: 1 },
    ...(Object.keys(rateCosts).length ? { rateCosts } : {}),
    signal: request.abortSignal
  });
}

function coordinateProviderFailure(
  governor: CapacityGovernor,
  request: PiAgentPromptRequest,
  error: unknown,
  jitter: () => number,
  setTimer: typeof setTimeout
) {
  if (error instanceof ProviderCongestionError) return error;
  const congestion = classifyProviderCongestion(error);
  if (!congestion) return error;
  const provider = providerForModel(request.modelId);
  const snapshot = governor.snapshot();
  const providerResource = `provider.${provider}`;
  const requestRate = `${providerResource}.requests`;
  const fallbackMs = congestion.category === "rate-limit" ? 5_000 : 1_000;
  const retryAfterMs = congestion.retryAfterMs ?? fallbackMs + Math.round(jitter() * Math.min(1_000, fallbackMs));
  if (requestRate in snapshot.rateUsage) governor.defer(requestRate, retryAfterMs);
  const currentCapacity = snapshot.capacities[providerResource];
  const reducedCapacity = Math.max(1, Math.floor(currentCapacity / 2));
  if (reducedCapacity < currentCapacity) governor.setCapacity(providerResource, reducedCapacity);
  const recovery = providerRecoveryState(governor);
  if (!recovery.restoreCapacities.has(providerResource)) {
    recovery.restoreCapacities.set(providerResource, currentCapacity);
  }
  const priorTimer = recovery.timers.get(providerResource);
  if (priorTimer !== undefined) clearTimeout(priorTimer);
  const timer = setTimer(() => {
    recovery.timers.delete(providerResource);
    const restoreCapacity = recovery.restoreCapacities.get(providerResource);
    recovery.restoreCapacities.delete(providerResource);
    if (restoreCapacity !== undefined) governor.setCapacity(providerResource, restoreCapacity);
  }, retryAfterMs);
  timer.unref?.();
  recovery.timers.set(providerResource, timer);
  return new ProviderCongestionError({ ...congestion, provider, retryAfterMs, cause: error });
}

function providerRecoveryState(governor: CapacityGovernor) {
  let state = providerRecoveryStates.get(governor);
  if (!state) {
    state = { timers: new Map(), restoreCapacities: new Map() };
    providerRecoveryStates.set(governor, state);
  }
  return state;
}

export function classifyProviderCongestion(error: unknown): {
  category: ProviderCongestionCategory;
  retryAfterMs?: number;
} | undefined {
  const values: unknown[] = [error];
  const seen = new Set<unknown>();
  let message = "";
  let retryAfterMs: number | undefined;
  for (let index = 0; index < values.length && index < 8; index += 1) {
    const value = values[index];
    if (seen.has(value)) continue;
    seen.add(value);
    if (value instanceof Error) {
      message += ` ${value.name} ${value.message}`;
      values.push(value.cause);
    }
    if (typeof value === "string") message += ` ${value}`;
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (typeof record.retryAfterMs === "number" && Number.isFinite(record.retryAfterMs)) {
      retryAfterMs = Math.max(0, record.retryAfterMs);
    }
    if (typeof record.status === "number") message += ` ${record.status}`;
    values.push(record.cause, record.error, record.response);
  }
  const normalized = message.toLowerCase();
  const retryMatch = normalized.match(/retry(?:-| )after(?:-| |-ms=)+(\d+)(ms|s)?/);
  if (retryAfterMs === undefined && retryMatch) {
    const parsed = Number(retryMatch[1]);
    retryAfterMs = retryMatch[2] === "s" ? parsed * 1_000 : parsed;
  }
  if (/\b429\b|rate.?limit|too many requests|quota/.test(normalized)) {
    return { category: "rate-limit", retryAfterMs };
  }
  if (/network|offline|econn|enotfound|socket|stream transport failed|fetch failed/.test(normalized)) {
    return { category: "network", retryAfterMs };
  }
  return undefined;
}

function providerForModel(modelId: string): ProviderKey {
  const prefix = modelId.split("/", 1)[0]?.toLowerCase();
  if (prefix === "openai") return "openai";
  if (prefix === "google") return "google";
  if (prefix === "anthropic") return "anthropic";
  if (prefix === "github" || prefix === "copilot") return "github";
  return "other";
}

function estimatePromptTokens(request: PiAgentPromptRequest) {
  const cacheableChars = request.cacheableUserBlocks?.reduce((total, block) => total + block.text.length, 0) ?? 0;
  return Math.max(1, Math.ceil((request.prompt.length + cacheableChars) / 4) + (request.images?.length ?? 0) * 1_024);
}

function readCapacity(value: string | undefined, fallback: number, label: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4_096) {
    throw new RangeError(`${label} must be an integer from 1 to 4096`);
  }
  return parsed;
}

function readRateLimit(value: string | undefined, fallback: number, label: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new RangeError(`${label} must be a positive safe integer`);
  return parsed;
}

function readOptionalRateLimit(value: string | undefined, label: string) {
  return value === undefined || value === "" ? undefined : readRateLimit(value, 1, label);
}
