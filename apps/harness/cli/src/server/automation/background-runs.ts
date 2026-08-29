import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import type { AssistantManager } from "../../assistant-manager";
import { evaluateAssistantQuestionPolicy, readAssistantQuestionPolicyContext, resolveAssistantPolicyAnswer } from "../../assistant-question-policy";
import { readAssistantPromptLearnings } from "../../assistant-learning-policy";
import { executeBackgroundJobRun } from "../../background-job-executor";
import { isBackgroundRunPastLeaseGrace } from "../../background-run-leases";
import { debugLog } from "../../logging";
import { classifyRunFailure, isBackoffEligibleFailureCategory } from "../../run-failure-classification";
import { BACKGROUND_RUN_CONTROLLER_LEASE_MS, BACKGROUND_RUN_CONTROLLER_RENEW_MS, BACKGROUND_RUN_STARTUP_GRACE_MS } from "../core/constants";
import type { BackgroundRunControl, HarnessConnection } from "../core/contracts";
import { emitUsageUpdatedToAll, recordServerTokenUsage } from "../transport/events";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "./background-events";
import { saveBackgroundRunStatusNotification } from "./notifications";
import { assertRuntimeAvailable } from "../workspace/preferences";
import { formatBackgroundLaunchProfileDetail, resolveBackgroundRunLaunchProfile, resolveExecutionModelIdForRuntime, tryMarkAssistantQuestionRunWaiting } from "./background-run-policy";
import { disposeBackgroundRunControl, getBackgroundJobRepositoryRuntimeContractMismatch } from "../runtime/background-run-lifecycle";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { BackgroundJob, BackgroundJobRun, BackgroundJobRunStatus, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export async function repairBackgroundJobRunsForJob(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  jobId: string,
  isRunLive: (run: BackgroundJobRun) => boolean
) {
  const repairedRuns = reconcileBackgroundJobRunBlockers(repository, isRunLive, { jobId });
  if (repairedRuns.length === 0) {
    return;
  }
  for (const run of repairedRuns) {
    syncBackgroundJobFailureTracking(repository, run);
    saveBackgroundRunStatusNotification(repository, run);
    emitBackgroundJobRunUpdatedToAll(connections, run);
  }
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
}

export function isBackgroundRunLive(
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  runtime: WorkspaceRuntimeStore,
  run: BackgroundJobRun
) {
  return (
    backgroundRunControllers.has(run.id) ||
    Boolean(run.linkedAgentRunId && runtime.getAbortController(run.projectId, run.linkedAgentRunId))
  );
}

export async function resumeAndRepairBackgroundJobRuns(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  runtimeRegistry: AgentRuntimeRegistry,
  runtime: WorkspaceRuntimeStore,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  assistantManager: AssistantManager,
  now: Date,
  tokenUsageSession: TokenUsageTotals
) {
  for (const run of repository.getActiveBackgroundJobRuns()) {
    if (backgroundRunControllers.has(run.id) || run.status !== "running" || !run.linkedAgentRunId) {
      continue;
    }
    if ((run.resumeAttemptCount ?? 0) >= 1) {
      continue;
    }
    if (!isBackgroundRunPastLeaseGrace(run, now, BACKGROUND_RUN_STARTUP_GRACE_MS)) {
      continue;
    }
    const linkedRun = repository.getRun(run.projectId, run.linkedAgentRunId);
    if (linkedRun?.status !== "ready" || !linkedRun.plan) {
      continue;
    }

    repository.appendBackgroundJobRunEvent(run.id, "queued", "Retrying orphaned ready run", "Restarting background execution once.");
    const resumedRun = repository.setBackgroundJobRunStatus(run.id, "queued", {
      summary: linkedRun.summary,
      linkedAgentRunId: linkedRun.id,
      resumeAttemptCount: (run.resumeAttemptCount ?? 0) + 1
    });
    emitBackgroundJobRunUpdatedToAll(connections, resumedRun);
    await safeLaunchBackgroundJobRun(
      connections,
      repository,
      runtimeRegistry,
      runtime,
      backgroundRunControllers,
      assistantManager,
      resumedRun.id,
      tokenUsageSession
    );
  }

  return reconcileBackgroundJobRunBlockers(
    repository,
    (run) => isBackgroundRunLive(backgroundRunControllers, runtime, run),
    { now }
  );
}

export function reconcileBackgroundJobRunBlockers(
  repository: WorkspaceRepository,
  isRunLive: (run: BackgroundJobRun) => boolean,
  options: { jobId?: string; runId?: string; now?: Date } = {}
) {
  const repairedRuns = repository.repairInterruptedBackgroundJobRuns({
    jobId: options.jobId,
    isRunLive,
    now: options.now
  });
  const repairedIds = new Set(repairedRuns.map((run) => run.id));
  const activeRuns = options.runId
    ? repository.getActiveBackgroundJobRuns(options.jobId).filter((run) => run.id === options.runId)
    : repository.getActiveBackgroundJobRuns(options.jobId);

  for (const run of activeRuns) {
    if (repairedIds.has(run.id) || run.status !== "awaiting-user-input" || !run.assistantId || !run.linkedAgentRunId) {
      continue;
    }
    const linkedRun = repository.getRun(run.projectId, run.linkedAgentRunId);
    const pendingQuestions = linkedRun?.questions.filter((question) => question.status === "pending" || question.status === "deferred") ?? [];
    if (!linkedRun || pendingQuestions.length === 0) {
      continue;
    }

    const assistantId = run.assistantId;
    const assistantQuestions = readAssistantQuestionPolicyContext((cursor) =>
      repository.listAssistantQuestions({ assistantId, cursor, limit: 128 }));
    const learnings = readAssistantPromptLearnings((cursor) => repository.listAssistantLearnings({ assistantId: run.assistantId!, cursor, limit: 128 }));
    const decisions = pendingQuestions.map((question) => ({
      question,
      decision: evaluateAssistantQuestionPolicy({
        prompt: question.prompt,
        questions: assistantQuestions,
        learnings,
        autoApproveNonBlocking: repository.getAssistantAutoApproveNonBlockingQuestionsDefault()
      })
    }));
    if (decisions.some((entry) => entry.decision.kind === "ask")) {
      continue;
    }

    for (const { question, decision } of decisions) {
      repository.answerPlanningQuestion(
        run.projectId,
        linkedRun.id,
        question.id,
        resolveAssistantPolicyAnswer(decision)
      );
    }
    repository.appendBackgroundJobRunEvent(
      run.id,
      "question-auto-resolved",
      "Planning question auto-resolved",
      pendingQuestions.map((question) => question.prompt).join("\n\n")
    );
    const skippedRun = repository.setBackgroundJobRunStatus(run.id, "skipped", {
      summary: "Planning question auto-resolved; run will retry on next cadence"
    });
    repository.appendBackgroundJobRunEvent(
      run.id,
      "skipped",
      "Background run skipped after question auto-resolution",
      "Scheduler will retry this job on the next due cadence."
    );
    repairedRuns.push(repository.getBackgroundJobRun(skippedRun.id) ?? skippedRun);
  }

  return repairedRuns;
}

export function syncBackgroundJobFailureTracking(repository: WorkspaceRepository, run: BackgroundJobRun) {
  if (run.status === "succeeded" || run.status === "partial-complete" || run.status === "skipped") {
    repository.clearBackgroundJobFailureTracking(run.jobId);
    return;
  }
  if (run.status !== "failed") {
    return;
  }
  const failureCategory = classifyRunFailure({
    explicitCategory: run.failureCategory,
    message: run.failureMessage
  });
  if (!isBackoffEligibleFailureCategory(failureCategory)) {
    repository.clearBackgroundJobFailureTracking(run.jobId);
    return;
  }
  repository.recordBackgroundJobFailure(run.jobId, failureCategory);
}

export async function finalizeAutoResolvedAssistantQuestionRun(
  repository: WorkspaceRepository,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  run: BackgroundJobRun
) {
  const resolvedRun = repository.setBackgroundJobRunStatus(run.id, "succeeded", {
    summary: "Assistant question auto-resolved from durable guidance"
  });
  repository.appendBackgroundJobRunEvent(
    run.id,
    "done",
    "Assistant question auto-resolved",
    run.summary ?? run.failureMessage ?? undefined
  );
  saveBackgroundRunStatusNotification(repository, resolvedRun);
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitBackgroundJobRunUpdatedToAll(connections, resolvedRun);
  emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
}

export async function safeLaunchBackgroundJobRun(...args: Parameters<typeof launchBackgroundJobRun>) {
  const [connections, repository, , , backgroundRunControllers, assistantManager, backgroundRunId] = args;
  try {
    await launchBackgroundJobRun(...args);
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "Unknown background job launch failure";
    debugLog("background.run.launch.unhandled-failure", {
      backgroundRunId,
      failureMessage,
      activeControllers: backgroundRunControllers.size
    });

    try {
      const currentRun = repository.getBackgroundJobRun(backgroundRunId);
      if (!currentRun || !isBackgroundLaunchFailureReportable(currentRun.status)) {
        return;
      }

      const failureCategory = classifyRunFailure({ message: failureMessage });
      const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
        failureMessage,
        failureCategory
      });
      repository.appendBackgroundJobRunEvent(backgroundRunId, "failed", "Background run failed", failureMessage);
      syncBackgroundJobFailureTracking(repository, failedRun);
      saveBackgroundRunStatusNotification(repository, failedRun);

      const job = repository.getBackgroundJob(currentRun.jobId);
      if (job) {
        repository.updateBackgroundJobSchedulerState(job.id, {
          schedulerStatus: "blocked",
          schedulerDetail: failureMessage,
          blockedReason: failureMessage,
          consecutiveFailureCount: repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
          backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
          lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
          lastSchedulerCheckAt: new Date().toISOString()
        });
      }

      if (job?.assistantId) {
        await assistantManager.handleBackgroundJobRunOutcome({
          assistantId: job.assistantId,
          status: "failed",
          failureMessage
        }).catch((assistantError: unknown) => {
          debugLog("background.run.launch.assistant-outcome-failed", {
            backgroundRunId,
            failureMessage: assistantError instanceof Error ? assistantError.message : String(assistantError)
          });
        });
      }

      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitBackgroundJobRunUpdatedToAll(connections, failedRun);
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    } catch (reportError) {
      debugLog("background.run.launch.failure-report-failed", {
        backgroundRunId,
        failureMessage: reportError instanceof Error ? reportError.message : String(reportError)
      });
    }
  }
}

export function isBackgroundLaunchFailureReportable(status: BackgroundJobRunStatus) {
  return status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running";
}

export async function launchBackgroundJobRun(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  repository: WorkspaceRepository,
  runtimeRegistry: AgentRuntimeRegistry,
  runtime: WorkspaceRuntimeStore,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  assistantManager: AssistantManager,
  backgroundRunId: string,
  tokenUsageSession?: TokenUsageTotals
) {
  if (backgroundRunControllers.has(backgroundRunId)) {
    debugLog("background.run.launch.skip-active-controller", { backgroundRunId, activeControllers: backgroundRunControllers.size });
    return;
  }
  if (repository.getGlobalExecutionPaused()) {
    debugLog("background.run.launch.skip-paused", {
      backgroundRunId,
      activeControllers: backgroundRunControllers.size
    });
    return;
  }
  const run = repository.getBackgroundJobRun(backgroundRunId);
  if (!run || run.status !== "queued") {
    debugLog("background.run.launch.skip-status", {
      backgroundRunId,
      status: run?.status,
      activeControllers: backgroundRunControllers.size
    });
    return;
  }
  const job = repository.getBackgroundJob(run.jobId);
  if (!job) {
    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage: "Background job definition no longer exists.",
      failureCategory: "launch-failure"
    });
    syncBackgroundJobFailureTracking(repository, failedRun);
    saveBackgroundRunStatusNotification(repository, failedRun);
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    return;
  }
  const repositoryContractMismatch = getBackgroundJobRepositoryRuntimeContractMismatch(repository);
  if (repositoryContractMismatch) {
    const failureMessage = `Background job runtime contract mismatch: ${repositoryContractMismatch}`;
    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage,
      failureCategory: "runtime-contract-mismatch"
    });
    repository.appendBackgroundJobRunEvent(backgroundRunId, "failed", "Background run failed", failureMessage);
    syncBackgroundJobFailureTracking(repository, failedRun);
    saveBackgroundRunStatusNotification(repository, failedRun);
    repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: failureMessage,
      blockedReason: failureMessage,
      consecutiveFailureCount: repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
      backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
      lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
      lastSchedulerCheckAt: new Date().toISOString()
    });
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    return;
  }
  if (job.assistantId) {
    try {
      assertAssistantRunnableForLaunch(repository, job.assistantId);
    } catch (error) {
      const cancelledRun = repository.setBackgroundJobRunStatus(backgroundRunId, "cancelled", {
        failureMessage: error instanceof Error ? error.message : "Assistant is not runnable",
        failureCategory: "launch-failure"
      });
      repository.updateBackgroundJobSchedulerState(job.id, {
        schedulerStatus: "blocked",
        schedulerDetail: cancelledRun.failureMessage,
        blockedReason: cancelledRun.failureMessage,
        lastSchedulerCheckAt: new Date().toISOString()
      });
      saveBackgroundRunStatusNotification(repository, cancelledRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitBackgroundJobRunUpdatedToAll(connections, cancelledRun);
      emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
      return;
    }
  }
  const abortController = new AbortController();
  const controllerInstanceId = crypto.randomUUID();
  const controllerLeaseId = crypto.randomUUID();
  const controllerLeaseExpiresAt = new Date(Date.now() + BACKGROUND_RUN_CONTROLLER_LEASE_MS).toISOString();
  let markControlSettled!: () => void;
  const settled = new Promise<void>((resolve) => { markControlSettled = resolve; });
  const control: BackgroundRunControl = { abortController, controllerInstanceId, controllerLeaseId, settled };
  backgroundRunControllers.set(backgroundRunId, control);
  debugLog("background.run.launch.start", {
    backgroundRunId,
    jobId: job.id,
    assistantId: job.assistantId,
    triggerSource: run.triggerSource,
    activeControllers: backgroundRunControllers.size
  });
  try {
    const startedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "running", {
      controllerInstanceId,
      controllerLeaseId,
      controllerLeaseExpiresAt
    });
    control.renewTimer = setInterval(() => {
      const persistedRun = repository.renewBackgroundJobRunLease(
        backgroundRunId,
        controllerLeaseId,
        new Date(Date.now() + BACKGROUND_RUN_CONTROLLER_LEASE_MS).toISOString()
      );
      if (!persistedRun || persistedRun.status !== "running") {
        debugLog("background.run.lease.stop", {
          backgroundRunId,
          status: persistedRun?.status,
          activeControllers: backgroundRunControllers.size
        });
        disposeBackgroundRunControl(control);
        return;
      }
      debugLog("background.run.lease.renew", {
        backgroundRunId,
        status: persistedRun.status,
        activeControllers: backgroundRunControllers.size
      });
    }, BACKGROUND_RUN_CONTROLLER_RENEW_MS);
    saveBackgroundRunStatusNotification(repository, startedRun);
    emitBackgroundJobRunUpdatedToAll(connections, startedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
    const nextRun = await executePreparedBackgroundRun({ connections, repository, runtimeRegistry, runtime, job, run,
      backgroundRunId, controllerInstanceId, controllerLeaseId, abortController, tokenUsageSession });
    await finalizeBackgroundRun({ connections, repository, runtimeRegistry, runtime, backgroundRunControllers,
      assistantManager, job, nextRun, tokenUsageSession });
  } catch (error) {
    const currentRun = repository.getBackgroundJobRun(backgroundRunId);
    if (!currentRun || !["queued", "awaiting-approval", "awaiting-user-input", "running"].includes(currentRun.status)) {
      return;
    }
    const failureMessage = error instanceof Error ? error.message : "Unknown background job failure";
    if (job.assistantId) {
      const waitingRun = tryMarkAssistantQuestionRunWaiting(repository, backgroundRunId, failureMessage);
      if (waitingRun) {
        const assistantOutcome = await assistantManager.handleBackgroundJobRunOutcome({
          assistantId: job.assistantId,
          status: "awaiting-user-input",
          summary: failureMessage
        });
        if (assistantOutcome?.blocked === false) {
          await finalizeAutoResolvedAssistantQuestionRun(repository, connections, waitingRun);
          return;
        }
        saveBackgroundRunStatusNotification(repository, waitingRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
        emitBackgroundJobRunUpdatedToAll(connections, waitingRun);
        emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
        return;
      }
    }

    const failedRun = repository.setBackgroundJobRunStatus(backgroundRunId, "failed", {
      failureMessage,
      failureCategory: classifyRunFailure({ message: failureMessage })
    });
    repository.appendBackgroundJobRunEvent(backgroundRunId, "failed", "Background run failed", failureMessage);
    syncBackgroundJobFailureTracking(repository, failedRun);
    saveBackgroundRunStatusNotification(repository, failedRun);
    repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: failureMessage,
      blockedReason: failureMessage,
      consecutiveFailureCount: repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
      backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
      lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
      lastSchedulerCheckAt: new Date().toISOString()
    });
    if (job.assistantId) {
      await assistantManager.handleBackgroundJobRunOutcome({
        assistantId: job.assistantId,
        status: "failed",
        failureMessage
      });
    }
    emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
    emitBackgroundJobRunUpdatedToAll(connections, failedRun);
    emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  } finally {
    disposeBackgroundRunControl(control);
    backgroundRunControllers.delete(backgroundRunId);
    markControlSettled();
    debugLog("background.run.launch.done", {
      backgroundRunId,
      activeControllers: backgroundRunControllers.size
    });
  }
}

async function executePreparedBackgroundRun(input: {
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>; repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry; runtime: WorkspaceRuntimeStore; job: BackgroundJob; run: BackgroundJobRun;
  backgroundRunId: string; controllerInstanceId: string; controllerLeaseId: string;
  abortController: AbortController; tokenUsageSession?: TokenUsageTotals;
}) {
  const { repository, job, run, backgroundRunId, connections } = input;
  const assistant = job.assistantId ? repository.getAssistant(job.assistantId) : undefined;
  const project = repository.getProject(job.projectId);
  const launchProfile = resolveBackgroundRunLaunchProfile({ repository, runtimeRegistry: input.runtimeRegistry, runtime: input.runtime, job, assistant, project });
  const agentRuntime = launchProfile.runtime;
  const agentCapability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
  assertRuntimeAvailable(agentRuntime, agentCapability);
  const providerBrand = launchProfile.providerBrand;
  const requestedReasoningStrength = launchProfile.reasoningStrength;
  const modelResolution = job.definition.kind === "ai-routine"
    ? resolveExecutionModelIdForRuntime({ runtime: agentRuntime, capability: agentCapability, providerBrand,
      requestedModelId: launchProfile.executionModelId, persistedModelId: project.session.executionModelId })
    : { modelId: agentRuntime.getDefaultExecutionModelId(providerBrand), requestedModelRejected: undefined };
  const resolvedExecutionModelId = modelResolution.modelId;
  if (modelResolution.requestedModelRejected) {
    launchProfile.fallbacks.push(`${modelResolution.requestedModelRejected} unavailable for ${agentRuntime.label}; using ${resolvedExecutionModelId}.`);
  }
  const planningModelId = launchProfile.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand);
  const diagnosticRun = repository.setBackgroundJobRunLaunchDiagnostics(backgroundRunId, {
    agentId: agentRuntime.id, providerBrand, planningModelId, executionModelId: resolvedExecutionModelId,
    reasoningStrength: requestedReasoningStrength, fastMode: launchProfile.fastMode
  });
  repository.appendBackgroundJobRunEvent(backgroundRunId, "launch-profile", "Resolved background launch profile", formatBackgroundLaunchProfileDetail(diagnosticRun));
  if (launchProfile.fallbacks.length > 0) {
    repository.appendBackgroundJobRunEvent(backgroundRunId, "launch-profile-fallback", "Launch profile fallback", launchProfile.fallbacks.join("\n"));
  }
  const jobForRun = job.definition.kind === "ai-routine" ? {
    ...job,
    definition: { ...job.definition, modeId: job.definition.modeId ?? launchProfile.modeId,
      executionModelId: job.definition.executionModelId ?? resolvedExecutionModelId,
      reasoningStrength: job.definition.reasoningStrength ?? requestedReasoningStrength,
      fastMode: job.definition.fastMode ?? launchProfile.fastMode }
  } : job;
  return executeBackgroundJobRun({
    repository, adapter: agentRuntime.getAdapter(), agentId: agentRuntime.id, job: jobForRun, run,
    controllerInstanceId: input.controllerInstanceId, controllerLeaseId: input.controllerLeaseId,
    providerBrand, planningModelId, executionModelId: resolvedExecutionModelId,
    reasoningStrength: requestedReasoningStrength, fastMode: launchProfile.fastMode,
    debugEnabled: repository.getDebugEnabledDefault(), abortSignal: input.abortController.signal,
    onRunUpdated(updatedRun) { emitBackgroundJobRunUpdatedToAll(connections, updatedRun); },
    onContextUsage(contextUsage) {
      if (!input.tokenUsageSession) return;
      const tokenUsage = recordServerTokenUsage(repository, input.tokenUsageSession, contextUsage);
      emitUsageUpdatedToAll(connections, `usage:bg:${crypto.randomUUID()}`, tokenUsage);
    }
  });
}

async function finalizeBackgroundRun(input: {
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>; repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry; runtime: WorkspaceRuntimeStore;
  backgroundRunControllers: Map<string, BackgroundRunControl>; assistantManager: AssistantManager;
  job: BackgroundJob; nextRun: BackgroundJobRun; tokenUsageSession?: TokenUsageTotals;
}) {
  const { connections, repository, assistantManager, job, nextRun } = input;
  if (job.assistantId) {
    const assistantOutcome = await assistantManager.handleBackgroundJobRunOutcome({
      assistantId: job.assistantId,
      status: nextRun.status === "succeeded" ? "succeeded" : nextRun.status === "partial-complete" ? "partial-complete"
        : nextRun.status === "awaiting-user-input" ? "awaiting-user-input" : "failed",
      summary: nextRun.summary, failureMessage: nextRun.failureMessage
    });
    if (nextRun.status === "awaiting-user-input" && assistantOutcome?.blocked === false) {
      await finalizeAutoResolvedAssistantQuestionRun(repository, connections, nextRun);
      return;
    }
  }
  saveBackgroundRunStatusNotification(repository, nextRun);
  syncBackgroundJobFailureTracking(repository, nextRun);
  const completedWithoutHardFailure = nextRun.status === "succeeded" || nextRun.status === "partial-complete" || nextRun.status === "skipped";
  repository.updateBackgroundJobSchedulerState(job.id, {
    schedulerStatus: completedWithoutHardFailure ? "idle" : "blocked",
    schedulerDetail: nextRun.summary ?? nextRun.failureMessage ?? `${job.name} ${nextRun.status}`,
    blockedReason: completedWithoutHardFailure ? undefined : nextRun.failureMessage ?? nextRun.summary ?? `${job.name} ${nextRun.status}`,
    consecutiveFailureCount: completedWithoutHardFailure ? 0 : repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
    backoffUntil: repository.getBackgroundJob(job.id)?.backoffUntil,
    lastFailureCategory: repository.getBackgroundJob(job.id)?.lastFailureCategory,
    lastSchedulerCheckAt: new Date().toISOString()
  });
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitBackgroundJobRunUpdatedToAll(connections, nextRun);
  emitNotificationsUpdatedToAll(connections, `bg:auto:${crypto.randomUUID()}`, repository.loadNotificationInboxState());
  if (!job.assistantId || nextRun.status !== "partial-complete" || nextRun.triggerSource === "retry") return;
  const retryRun = repository.createBackgroundJobRun({
    jobId: job.id, projectId: job.projectId, assistantId: job.assistantId,
    automationThreadId: job.automationThreadId, triggerSource: "retry", status: "queued",
    riskLevel: job.riskLevel, approvalStatus: nextRun.approvalStatus === "pending" ? "pending" : "approved"
  });
  repository.appendBackgroundJobRunEvent(retryRun.id, "queued", "Queued one recovery retry after partial assistant job", nextRun.failureMessage ?? nextRun.summary);
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitBackgroundJobRunUpdatedToAll(connections, retryRun);
  await safeLaunchBackgroundJobRun(connections, repository, input.runtimeRegistry, input.runtime,
    input.backgroundRunControllers, assistantManager, retryRun.id, input.tokenUsageSession);
}
