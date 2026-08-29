import type {
  AgentId,
  AgentTrace,
  ComposerReasoningStrength,
  PlannerSubtask,
  ProjectContextUsage,
  ProviderBrand,
  RunModelPreference
} from "@hyperfocus/ai-core/protocol";
import type { CapacityGovernor, CapacityResources } from "@hyperfocus/ai-core/capacity-governor";
import { createHash } from "node:crypto";
import { getHarnessCapacityGovernor, type ManagedExecutionState } from "./execution-runtime";
import { createBranchfsManager, type BranchfsExperimentLease, type BranchfsManager } from "./branchfs-manager";
import { debugLog } from "./logging";
import { runManagedAgentExecution } from "./managed-agent-execution";
import type {
  PiAgentAdapter,
  PiAgentExecutionEvent,
  PiAgentMemorySearchInput,
  PiAgentMemorySearchResult,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "./pi-agent-adapter";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "./subagent-defaults";
import { createMilestoneDeltaParser, extractMilestoneLines, stripMilestoneLines } from "./run-milestone-windows";
import {
  buildSubagentEnvironmentBrief,
  discoverRepoSkillPaths,
  resolveRepoRoot,
  SUBAGENT_MILESTONE_INSTRUCTION
} from "./subagent-environment";
import { assembleDeterministicPrompt } from "./deterministic-prompt";
import type { PromptCacheIdentity } from "./prompt-cache";

export type SubagentResult = {
  id: string;
  title: string;
  instruction: string;
  status: "completed" | "failed";
  output?: string;
  errorMessage?: string;
  attemptCount: number;
  durationMs: number;
  commitSha?: string;
  branchName?: string;
  mountPath?: string;
  worktreePath?: string;
  contextUsage?: ProjectContextUsage;
  contractDriftPaths?: string[];
};

export type SubagentProgressCallbacks = {
  onStart?: (task: PlannerSubtask, attempt: number) => void;
  onRetry?: (task: PlannerSubtask, attempt: number, error: Error) => void;
  onComplete?: (task: PlannerSubtask, output: string, durationMs: number) => void;
  onError?: (task: PlannerSubtask, error: Error) => void;
  onSettled?: (result: SubagentResult) => void | Promise<void>;
  onMilestone?: (task: PlannerSubtask, line: string) => void;
  onContextUsage?: (task: PlannerSubtask, contextUsage: ProjectContextUsage) => void;
  onTrace?: (trace: Pick<AgentTrace, "stage" | "message" | "detail" | "subagentId">) => void;
  setExecutionState?: (state: ManagedExecutionState) => void;
  getExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => ManagedExecutionState | undefined;
  clearExecutionState?: (input: Pick<ManagedExecutionState, "runId" | "kind" | "subagentId">) => void;
  onExecutionEvent?: (input: { owner: "subagent"; subagentId: string; event: PiAgentExecutionEvent }) => void | Promise<void>;
  requestBrowserApproval?: (input: {
    owner: "subagent";
    subagentId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
  }) => Promise<{ approved: boolean }>;
  searchMemory?: (input: PiAgentMemorySearchInput & {
    owner: "subagent";
    subagentId: string;
  }) => Promise<PiAgentMemorySearchResult>;
};

export type BranchfsSubagentSnapshot = {
  taskId: string;
  manager: BranchfsSubagentManager;
  lease: BranchfsExperimentLease;
};

export type BranchfsSubagentManager = Pick<BranchfsManager, "prepareExperimentLease" | "discardExperiment" | "readInspection">;

export type SubagentVerificationInput = {
  task: PlannerSubtask;
  mountPath: string;
  worktreePath: string;
  output: string;
  attemptCount: number;
  abortSignal?: AbortSignal;
};

type QueuedSubagentTask = {
  task: PlannerSubtask;
  startingAttempt: number;
  recoveryAttempt: number;
  recoveryPrompt?: string;
};

type SubagentRetryOptions = {
  runId: string;
  agentId?: AgentId;
  rootPath: string;
  abortSignal: AbortSignal | undefined;
  callbacks: SubagentProgressCallbacks | undefined;
  executionModelId: string;
  debugEnabled: boolean;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  promptCacheIdentity?: PromptCacheIdentity;
  modelPreference?: RunModelPreference;
  verifyResult?: (input: SubagentVerificationInput) => Promise<string[] | void>;
  branchfsManagerFactory?: (
    context: { rootPath: string; runId: string },
    callbacks: { onTrace?: (trace: Pick<AgentTrace, "stage" | "message" | "detail" | "subagentId">) => void }
  ) => BranchfsSubagentManager;
};

type ScheduledTaskEntry<Task> = {
  order: number;
  task: Task;
};

export type IndexedTaskQueueMetrics = {
  enqueued: number;
  dequeued: number;
  slotScans: number;
  eligibilityChecks: number;
  compactedSlots: number;
  compactions: number;
  peakSize: number;
};

export function createIndexedTaskQueue<Value>(
  initialValues: readonly Value[],
  options: { compactionThreshold?: number } = {}
) {
  const compactionThreshold = options.compactionThreshold ?? 1_024;
  if (!Number.isSafeInteger(compactionThreshold) || compactionThreshold < 1) {
    throw new RangeError("compactionThreshold must be a positive safe integer");
  }
  let slots: Array<Value | undefined> = [...initialValues];
  let head = 0;
  let size = slots.length;
  const metrics: IndexedTaskQueueMetrics = {
    enqueued: slots.length,
    dequeued: 0,
    slotScans: 0,
    eligibilityChecks: 0,
    compactedSlots: 0,
    compactions: 0,
    peakSize: slots.length
  };

  function advanceHead() {
    while (head < slots.length && slots[head] === undefined) head += 1;
  }

  function compactIfUseful() {
    if (head < compactionThreshold || head * 2 < slots.length) return;
    const retained: Value[] = [];
    for (let index = head; index < slots.length; index += 1) {
      const value = slots[index];
      if (value !== undefined) retained.push(value);
    }
    metrics.compactedSlots += slots.length - head;
    metrics.compactions += 1;
    slots = retained;
    head = 0;
  }

  return {
    get size() {
      return size;
    },
    get metrics(): Readonly<IndexedTaskQueueMetrics> {
      return metrics;
    },
    enqueue(value: Value) {
      slots.push(value);
      size += 1;
      metrics.enqueued += 1;
      metrics.peakSize = Math.max(metrics.peakSize, size);
    },
    dequeue(canTake?: (value: Value) => boolean) {
      if (size === 0) return undefined;
      advanceHead();
      for (let index = head; index < slots.length; index += 1) {
        const value = slots[index];
        if (value === undefined) continue;
        metrics.slotScans += 1;
        if (canTake) {
          metrics.eligibilityChecks += 1;
          if (!canTake(value)) continue;
        }
        slots[index] = undefined;
        size -= 1;
        metrics.dequeued += 1;
        if (index === head) advanceHead();
        compactIfUseful();
        return value;
      }
      return undefined;
    }
  };
}

export const MAX_SUBAGENT_CONCURRENCY = 4;
export const MAX_CONFIGURED_SUBAGENT_CONCURRENCY = 256;

export type SubagentSchedulerMetrics = IndexedTaskQueueMetrics & {
  workerCount: number;
  peakActive: number;
  peakWaiters: number;
};

export function resolveSubagentConcurrency(
  value: number | string | undefined = process.env.HARNESS_SUBAGENT_CONCURRENCY
) {
  if (value === undefined || value === "") return MAX_SUBAGENT_CONCURRENCY;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CONFIGURED_SUBAGENT_CONCURRENCY) {
    throw new RangeError(
      `Subagent concurrency must be an integer from 1 to ${MAX_CONFIGURED_SUBAGENT_CONCURRENCY}.`
    );
  }
  return parsed;
}

export async function scheduleSubagentTasks<Task, Result extends { id: string }, Snapshot>(
  options: {
    tasks: Task[];
    maxConcurrency?: number;
    capacityGovernor?: CapacityGovernor | false;
    capacityResources?: CapacityResources;
    queueCompactionThreshold?: number;
    getTaskId: (task: Task) => string;
    canStart?: (task: Task, activeTasks: Task[]) => boolean;
    executeTask: (task: Task) => Promise<{ result: Result; retainedSnapshot?: Snapshot }>;
    onSettled?: (task: Task, result: Result) => void | Promise<void>;
    scheduleRetry?: (task: Task, result: Result) => Task | undefined | Promise<Task | undefined>;
  }
) {
  const initialEntries = options.tasks.map((task, order) => ({ order, task }));
  const queue = createIndexedTaskQueue(initialEntries, {
    ...(options.queueCompactionThreshold === undefined
      ? {}
      : { compactionThreshold: options.queueCompactionThreshold })
  });
  const orderById = new Map(initialEntries.map((entry) => [options.getTaskId(entry.task), entry.order]));
  const active = new Map<string, ScheduledTaskEntry<Task>>();
  const results = new Map<string, Result>();
  const retainedSnapshots = new Map<string, Snapshot>();
  const waiters = new Set<() => void>();
  let fatalError: Error | undefined;
  let peakActive = 0;
  let peakWaiters = 0;

  const signal = () => {
    const pending = [...waiters];
    waiters.clear();
    for (const resolve of pending) resolve();
  };

  const waitForSignal = () =>
    new Promise<void>((resolve) => {
      waiters.add(resolve);
      peakWaiters = Math.max(peakWaiters, waiters.size);
    });

  const dequeueNext = () => {
    const activeTasks = [...active.values()].map((entry) => entry.task);
    const entry = queue.dequeue(options.canStart
      ? (candidate) => options.canStart?.(candidate.task, activeTasks) ?? true
      : undefined);
    if (entry) {
      active.set(options.getTaskId(entry.task), entry);
      peakActive = Math.max(peakActive, active.size);
    }
    return entry;
  };

  const workerCount = Math.min(resolveSubagentConcurrency(options.maxConcurrency), queue.size);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!fatalError) {
      const entry = dequeueNext();
      if (!entry) {
        if (active.size === 0 && queue.size === 0) {
          return;
        }

        await waitForSignal();
        continue;
      }

      const taskId = options.getTaskId(entry.task);
      try {
        const execution = await options.executeTask(entry.task);
        results.set(taskId, execution.result);
        if (execution.retainedSnapshot) {
          retainedSnapshots.set(taskId, execution.retainedSnapshot);
        } else {
          retainedSnapshots.delete(taskId);
        }

        await options.onSettled?.(entry.task, execution.result);
        const retryTask = await options.scheduleRetry?.(entry.task, execution.result);
        if (retryTask) {
          queue.enqueue({
            order: orderById.get(taskId) ?? entry.order,
            task: retryTask
          });
        }
      } catch (error) {
        fatalError = error instanceof Error ? error : new Error("Subagent scheduler failed");
      } finally {
        active.delete(taskId);
        signal();
      }
    }
  });

  await Promise.all(workers);
  if (fatalError) {
    throw fatalError;
  }

  const sortedResults = [...results.values()].sort(
    (left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0)
  );
  const sortedSnapshots = [...retainedSnapshots.entries()]
    .sort((left, right) => (orderById.get(left[0]) ?? 0) - (orderById.get(right[0]) ?? 0))
    .map(([, snapshot]) => snapshot);

  const metrics: SubagentSchedulerMetrics = {
    ...queue.metrics,
    workerCount,
    peakActive,
    peakWaiters
  };
  return {
    results: sortedResults,
    retainedSnapshots: sortedSnapshots,
    metrics
  };
}

export async function executeSubagents(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    runId: string;
    agentId?: AgentId;
    providerBrand: ProviderBrand;
    brief: string;
    tasks: PlannerSubtask[];
    debugEnabled: boolean;
    executionModelId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    modelPreference?: RunModelPreference;
    abortSignal?: AbortSignal;
    maxConcurrency?: number;
    capacityGovernor?: CapacityGovernor | false;
    capacityResources?: CapacityResources;
    verifyResult?: (input: SubagentVerificationInput) => Promise<string[] | void>;
    recoveryPrompt?: (input: { task: PlannerSubtask; result: SubagentResult }) => string;
    branchfsManagerFactory?: (
      context: { rootPath: string; runId: string },
      callbacks: { onTrace?: (trace: Pick<AgentTrace, "stage" | "message" | "detail" | "subagentId">) => void }
    ) => BranchfsSubagentManager;
    callbacks?: SubagentProgressCallbacks;
  }
): Promise<{ results: SubagentResult[]; retainedSnapshots: BranchfsSubagentSnapshot[] }> {
  return scheduleSubagentTasks<
    {
      task: PlannerSubtask;
      startingAttempt: number;
      recoveryAttempt: number;
      recoveryPrompt?: string;
    },
    SubagentResult,
    BranchfsSubagentSnapshot
  >({
    tasks: options.tasks.map<{
      task: PlannerSubtask;
      startingAttempt: number;
      recoveryAttempt: number;
      recoveryPrompt?: string;
    }>((task) => ({
      task,
      startingAttempt: 1,
      recoveryAttempt: 0,
      recoveryPrompt: undefined
    })),
    maxConcurrency: resolveSubagentConcurrency(options.maxConcurrency),
    getTaskId(entry) {
      return entry.task.id;
    },
    async executeTask(entry) {
      const execute = () => executeSubagentWithRetry(adapter, options.providerBrand, entry, options.brief, {
        runId: options.runId,
        agentId: options.agentId,
        rootPath: options.cwd,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks,
        executionModelId: options.executionModelId,
        debugEnabled: options.debugEnabled,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        promptCacheIdentity: options.promptCacheIdentity,
        modelPreference: options.modelPreference,
        verifyResult: options.verifyResult,
        branchfsManagerFactory: options.branchfsManagerFactory
      });
      const governor = options.capacityGovernor === false
        ? undefined
        : options.capacityGovernor ?? getHarnessCapacityGovernor();
      return governor
        ? governor.run({
            resources: options.capacityResources ?? { subagent: 1, branchfs: 1 },
            signal: options.abortSignal
          }, execute)
        : execute();
    },
    async onSettled(_entry, result) {
      await options.callbacks?.onSettled?.(result);
    },
    scheduleRetry(entry, result) {
      if (result.status !== "failed" || entry.recoveryAttempt > 0 || options.abortSignal?.aborted) {
        return undefined;
      }

      const recoveryPrompt = options.recoveryPrompt?.({
        task: entry.task,
        result
      });
      if (!recoveryPrompt?.trim()) {
        return undefined;
      }

      options.callbacks?.onRetry?.(
        entry.task,
        result.attemptCount + 1,
        new Error(result.errorMessage ?? "Unknown subagent failure")
      );
      return {
        task: entry.task,
        startingAttempt: result.attemptCount + 1,
        recoveryAttempt: entry.recoveryAttempt + 1,
        recoveryPrompt
      };
    }
  });
}

async function executeSubagentWithRetry(
  adapter: PiAgentAdapter,
  providerBrand: ProviderBrand,
  queuedTask: QueuedSubagentTask,
  brief: string,
  options: SubagentRetryOptions
): Promise<{ result: SubagentResult; retainedSnapshot?: BranchfsSubagentSnapshot }> {
  const task = queuedTask.task;
  const searchMemory = options.callbacks?.searchMemory;
  let attempt = 0;
  const dequeuedAt = Date.now();

  while (true) {
    attempt += 1;
    const effectiveAttempt = queuedTask.startingAttempt + attempt - 1;
    const startedAt = Date.now();
    if (attempt === 1) {
      options.callbacks?.onStart?.(task, effectiveAttempt);
    }

    const worktreePrepareStartedAt = Date.now();
    const manager = (options.branchfsManagerFactory ?? createBranchfsManager)(
      {
        rootPath: options.rootPath,
        runId: `${options.runId}-${toSafeBranchfsSegment(task.id)}-attempt-${attempt}`
      },
      {
        onTrace(trace) {
          options.callbacks?.onTrace?.({
            ...trace,
            subagentId: trace.subagentId ?? task.id
          });
        }
      }
    );
    let lease: BranchfsExperimentLease | undefined;
    let worktreeReadyAt = Date.now();
    let settledExecutionState: ManagedExecutionState | undefined;
    try {
      lease = await manager.prepareExperimentLease();
      worktreeReadyAt = Date.now();
      const subagentModelId = resolveSubagentModelId({
        agentId: options.agentId,
        providerBrand,
        executionModelId: options.executionModelId,
        modelPreference: options.modelPreference
      });
      const subagentReasoningStrength = resolveSubagentReasoningStrength(options.reasoningStrength, options.modelPreference);
      const repoRoot = resolveRepoRoot(options.rootPath);
      const availableSkillPaths = discoverRepoSkillPaths(repoRoot);
      const basePrompt = buildSubagentPrompt({
        brief,
        environmentBrief: buildSubagentEnvironmentBrief({
          projectRoot: lease.projectMountPath,
          repoRoot: lease.repoMountPath,
          relativeProjectRoot: lease.projectRelativePath,
          availableSkillPaths
        }),
        task,
        recoveryPrompt: queuedTask.recoveryPrompt
      });
      const milestoneParser = createMilestoneDeltaParser((line) => options.callbacks?.onMilestone?.(task, line));
      const promptRequests = createSubagentPromptRequests({
        task,
        cwd: lease.projectMountPath,
        modelId: subagentModelId,
        basePrompt,
        reasoningStrength: subagentReasoningStrength,
        fastMode: options.fastMode,
        promptCacheIdentity: options.promptCacheIdentity,
        searchMemory,
        callbacks: options.callbacks,
        milestoneParser,
      });
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: task.id,
        originalRequest: promptRequests.original,
        continuationRequest: promptRequests.continuation,
        abortSignal: options.abortSignal,
        store: createExecutionStore(options.callbacks, options.runId, task.id, {
          dequeuedAt,
          worktreePrepareStartedAt,
          worktreeReadyAt
        }),
        onSettledState(state) {
          settledExecutionState = state;
        },
        onRefreshComplete(mode) {
          options.callbacks?.onTrace?.({
            stage: "refresh-complete",
            message: `Refresh complete for ${task.title} (${mode})`,
            subagentId: task.id
          });
        }
      });
      milestoneParser.flush();
      if (!milestoneParser.hasEmitted()) {
        for (const line of extractMilestoneLines(response.text)) {
          options.callbacks?.onMilestone?.(task, line);
        }
      }
      const output = stripMilestoneLines(response.text);
      const contextUsage = response.contextUsage
        ? toSubagentContextUsage(task.id, subagentModelId, response.contextUsage)
        : undefined;
      if (contextUsage) options.callbacks?.onContextUsage?.(task, contextUsage);
      const contractDriftPaths = await options.verifyResult?.({
        task,
        mountPath: lease.projectMountPath,
        worktreePath: lease.projectMountPath,
        output,
        attemptCount: effectiveAttempt,
        abortSignal: options.abortSignal
      });
      emitSpawnTiming(options.callbacks, task, {
        dequeuedAt,
        worktreePrepareStartedAt,
        worktreeReadyAt,
        sessionCreatedAt: settledExecutionState?.spawnTiming?.sessionCreatedAt,
        firstActivityAt: settledExecutionState?.spawnTiming?.firstActivityAt,
        firstToolStartAt: settledExecutionState?.spawnTiming?.firstToolStartAt,
        completedAt: Date.now()
      });
      options.callbacks?.onComplete?.(task, output, Date.now() - startedAt);
      return createCompletedSubagentAttempt({
        task,
        output,
        attemptCount: effectiveAttempt,
        durationMs: Date.now() - startedAt,
        manager,
        lease,
        contextUsage,
        contractDriftPaths,
      });
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown subagent failure");
      if (isAbortError(typedError, options.abortSignal)) {
        if (!options.debugEnabled && lease) {
          await manager.discardExperiment(lease).catch(() => undefined);
        }
        throw typedError;
      }

      if (!isTransientError(typedError) || attempt > 1) {
        if (!options.debugEnabled && lease) {
          await manager.discardExperiment(lease).catch(() => undefined);
        }
        emitSpawnTiming(options.callbacks, task, {
          dequeuedAt,
          worktreePrepareStartedAt,
          worktreeReadyAt,
          sessionCreatedAt: settledExecutionState?.spawnTiming?.sessionCreatedAt,
          firstActivityAt: settledExecutionState?.spawnTiming?.firstActivityAt,
          firstToolStartAt: settledExecutionState?.spawnTiming?.firstToolStartAt,
          failedAt: Date.now()
        });
        options.callbacks?.onError?.(task, typedError);
        return {
          result: {
            id: task.id,
            title: task.title,
            instruction: task.instruction,
            status: "failed",
            errorMessage: typedError.message,
            attemptCount: effectiveAttempt,
            durationMs: Date.now() - startedAt,
            mountPath: options.debugEnabled ? lease?.projectMountPath : undefined,
            worktreePath: options.debugEnabled ? lease?.projectMountPath : undefined
          }
        };
      }

      options.callbacks?.onRetry?.(task, effectiveAttempt + 1, typedError);
      if (lease) {
        await manager.discardExperiment(lease).catch(() => undefined);
      }
    }
  }
}

function createSubagentPromptRequests(input: {
  task: PlannerSubtask;
  cwd: string;
  modelId: string;
  basePrompt: string;
  reasoningStrength: ComposerReasoningStrength | undefined;
  fastMode: boolean | undefined;
  promptCacheIdentity: PromptCacheIdentity | undefined;
  searchMemory: SubagentProgressCallbacks["searchMemory"];
  callbacks: SubagentProgressCallbacks | undefined;
  milestoneParser: ReturnType<typeof createMilestoneDeltaParser>;
}) {
  const searchMemory = input.searchMemory;
  const createRequest = (prompt: string): PiAgentPromptRequest => ({
    kind: "subagent",
    cwd: input.cwd,
    modelId: input.modelId,
    prompt,
    reasoningStrength: input.reasoningStrength,
    fastMode: input.fastMode,
    promptCacheIdentity: input.promptCacheIdentity,
    memorySearch: searchMemory
      ? (searchInput) => searchMemory({ owner: "subagent", subagentId: input.task.id, ...searchInput })
      : undefined,
    onTextDelta(delta) {
      input.milestoneParser.push(delta);
    },
    onExecutionEvent(event: PiAgentExecutionEvent) {
      void input.callbacks?.onExecutionEvent?.({ owner: "subagent", subagentId: input.task.id, event });
    },
    requestBrowserApproval(approvalInput) {
      return input.callbacks?.requestBrowserApproval?.({
        owner: "subagent",
        subagentId: input.task.id,
        ...approvalInput
      }) ?? Promise.resolve({ approved: true });
    }
  });
  return {
    original: createRequest(input.basePrompt),
    continuation: createRequest(["continue", "", input.basePrompt].join("\n")),
  };
}

function toSubagentContextUsage(
  taskId: string,
  modelId: string,
  usage: NonNullable<PiAgentPromptResult["contextUsage"]>,
): ProjectContextUsage {
  return {
    sourceKind: "subagent",
    sourceLabel: taskId,
    modelId,
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    usagePercent: usage.usagePercent,
    totalProcessedTokens: usage.sessionStats.tokens.total,
    cachedInputTokens: usage.cachedInputTokens,
    updatedAt: new Date().toISOString()
  };
}

function createCompletedSubagentAttempt(input: {
  task: PlannerSubtask;
  output: string;
  attemptCount: number;
  durationMs: number;
  manager: BranchfsSubagentManager;
  lease: BranchfsExperimentLease;
  contextUsage: ProjectContextUsage | undefined;
  contractDriftPaths: string[] | void;
}): { result: SubagentResult; retainedSnapshot: BranchfsSubagentSnapshot } {
  return {
    result: {
      id: input.task.id,
      title: input.task.title,
      instruction: input.task.instruction,
      status: "completed",
      output: input.output,
      attemptCount: input.attemptCount,
      durationMs: input.durationMs,
      mountPath: input.lease.projectMountPath,
      worktreePath: input.lease.projectMountPath,
      contextUsage: input.contextUsage,
      contractDriftPaths: input.contractDriftPaths && input.contractDriftPaths.length > 0
        ? input.contractDriftPaths
        : undefined
    },
    retainedSnapshot: {
      taskId: input.task.id,
      manager: input.manager,
      lease: input.lease
    }
  };
}

function toSafeBranchfsSegment(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized && normalized !== "." && normalized !== "..") {
    return normalized.slice(0, 80);
  }
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isTransientError(error: Error) {
  const value = error.message.toLowerCase();
  return ["timeout", "temporar", "429", "rate limit", "overload", "network", "socket", "econn", "reset"].some(
    (token) => value.includes(token)
  );
}

export function buildSubagentPrompt(input: { brief: string; task: PlannerSubtask; recoveryPrompt?: string; environmentBrief?: string }) {
  return assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are a focused implementation subagent.",
        "Start in the provided cwd and apply the assigned file plan exactly.",
        "Create missing directories and the first listed missing file immediately when the assignment names new paths.",
        "Use owned paths as the primary work area; edit integration files when the assignment requires wiring.",
        "Do not run browser, Playwright, dev server, python -m http.server, visible app smoke tests, or commands that can open windows.",
        "Do not use Start-Process for verification.",
        "Do not perform broad verification unless this subtask explicitly names a verification command.",
        "On Windows, use PowerShell-compatible syntax only; do not use Bash heredocs like <<'EOF'.",
        "Prefer bundled rg for search. If rg is unavailable, use Get-ChildItem plus Select-String.",
        "Return a concise changed-file summary.",
        SUBAGENT_MILESTONE_INSTRUCTION
      ]
    },
    {
      kind: "workspace",
      content: input.environmentBrief?.trim()
    },
    {
      kind: "frozen-plan",
      content: [`Shared brief: ${input.brief}`, `Subtask title: ${input.task.title}`, `Subtask instruction: ${input.task.instruction}`]
    },
    {
      kind: "dynamic",
      content: input.recoveryPrompt?.trim()
    }
  ]);
}

function isAbortError(error: Error, abortSignal: AbortSignal | undefined) {
  return abortSignal?.aborted === true || error.message.toLowerCase().includes("abort");
}

function createExecutionStore(
  callbacks: SubagentProgressCallbacks | undefined,
  runId: string,
  subagentId: string,
  seedTiming: NonNullable<ManagedExecutionState["spawnTiming"]>
) {
  return {
    getState() {
      return callbacks?.getExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
    },
    setState(state: ManagedExecutionState) {
      const current = callbacks?.getExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
      const nextState = {
        ...state,
        spawnTiming: {
          ...seedTiming,
          ...current?.spawnTiming,
          ...state.spawnTiming
        }
      };
      callbacks?.setExecutionState?.(nextState);
    },
    clearState() {
      callbacks?.clearExecutionState?.({
        runId,
        kind: "subagent",
        subagentId
      });
    }
  };
}

function emitSpawnTiming(
  callbacks: SubagentProgressCallbacks | undefined,
  task: PlannerSubtask,
  timing: {
    dequeuedAt: number;
    worktreePrepareStartedAt: number;
    worktreeReadyAt: number;
    sessionCreatedAt?: number;
    firstActivityAt?: number;
    firstToolStartAt?: number;
    completedAt?: number;
    failedAt?: number;
  }
) {
  const endAt = timing.completedAt ?? timing.failedAt ?? Date.now();
  const detail = [
    `queue=${Math.max(0, timing.worktreePrepareStartedAt - timing.dequeuedAt)}ms`,
    `provision=${Math.max(0, timing.worktreeReadyAt - timing.worktreePrepareStartedAt)}ms`,
    `session=${timing.sessionCreatedAt ? Math.max(0, timing.sessionCreatedAt - timing.worktreeReadyAt) : "?"}ms`,
    `first-activity=${timing.firstActivityAt ? Math.max(0, timing.firstActivityAt - (timing.sessionCreatedAt ?? timing.worktreeReadyAt)) : "?"}ms`,
    `first-tool=${timing.firstToolStartAt ? Math.max(0, timing.firstToolStartAt - timing.worktreeReadyAt) : "?"}ms`,
    `total=${Math.max(0, endAt - timing.dequeuedAt)}ms`
  ].join(" ");

  debugLog("subagent.spawn", {
    taskId: task.id,
    detail
  });
  callbacks?.onTrace?.({
    stage: "subagent-spawn-timing",
    message: `Spawn timing for ${task.title}`,
    detail,
    subagentId: task.id
  });
}
