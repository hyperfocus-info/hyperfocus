import type { BranchfsExperimentLease } from "../../branchfs-manager";
import { extractRunMemories, shouldExtractRunMemories } from "../../memory-bank";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { aggregateSubagentResults, executePlanPrerequisites, executeReadyRun } from "../../pi-orchestrator";
import { getDefaultPlanningModelId } from "../../pi-planner";
import type { HarnessConnection, HarnessServerOsAdapters, PendingBrowserApproval } from "../core/contracts";
import { createExecutionCallbacks } from "./callbacks";
import { runInlineSubagentRetry } from "./inline-subagent";
import { emitProjectTrace, emitRunUpdated, emitRunUpdatedById, getThreadSessionState } from "../workspace/project-events";
import { completeRunWithAssistantMessage } from "./completion";
import { buildExecutionPlanFromRun, buildReadyPlanFromExecutionPlan } from "./state";
import { buildProjectPromptCacheIdentity, prepareRunGeminiAttachmentCache } from "./run-context";
import { appendComposerControlStatus } from "./transcript-state";
import { presentCorrectivePlan } from "../workspace/operations";
import { scheduleBranchfsRetentionPrune } from "../workspace/branchfs-guards";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "../../subagent-defaults";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { AgentRunState, ComposerReasoningStrength, ExecutionPlan, PlannerReadyTurn, ProjectId, ProviderBrand, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";
import { runVerificationCommands } from "@hyperfocus/ai-runtime/quality/commands";
import { createQualitySession } from "@hyperfocus/ai-runtime/quality";
import { withQualityContext } from "../../verification/quality-adapter";
import { assertOutcomeAdmission, checkOutcomeDispatch, freezeQualityChecks, runQualityChecks, changedQualityPaths, qualityChangedFiles } from "@hyperfocus/ai-runtime/quality/execution";

type RunLifecycleOptions = {
  projectId: ProjectId; agentId: "pi" | "copilot-cli" | "codex-cli"; providerBrand: ProviderBrand;
  debugEnabled: boolean; runId: string; sourceRun: AgentRunState; readyPlan: PlannerReadyTurn;
  executionPlan?: ExecutionPlan; executionTarget?: "current-project" | "ephemeral-experiment";
  existingSubagentResults?: Parameters<typeof executeReadyRun>[1]["existingSubagentResults"];
  tasksToRun?: Parameters<typeof executeReadyRun>[1]["tasksToRun"]; resumeNote?: string;
  reasoningStrength?: ComposerReasoningStrength; fastMode?: boolean; abortSignal: AbortSignal;
  derivedProgressHeartbeatMs: number; tokenUsageSession: TokenUsageTotals;
};

export async function executeRunLifecycle(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  osAdapters: HarnessServerOsAdapters,
  options: RunLifecycleOptions
) {
  if (!ownsExecution(runtime, options.projectId, options.runId, options.abortSignal)) return;
  const project = runtime.getProject(options.projectId);
  const activeRun = options.sourceRun;
  const threadSession = getThreadSessionState(runtime, repository, options.projectId, activeRun.threadId);
  appendComposerControlStatus(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    options.fastMode
  );
  const executionTarget = options.executionTarget ?? activeRun.executionTarget ?? "current-project";
  let experimentLease: BranchfsExperimentLease | undefined;
  if (executionTarget === "ephemeral-experiment") {
    const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: options.runId }, {
      onTrace(trace) {
        emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
          sessionId: threadSession.sessionId,
          ...trace
        });
      }
    });
    experimentLease = await manager.prepareExperimentLease();
    const experimentProject = repository.setAgentRunExecutionTarget(options.projectId, options.runId, "ephemeral-experiment");
    runtime.upsertPersistedProject(experimentProject);
    const preparedProject = repository.saveExperimentRun(options.projectId, options.runId, {
      ...experimentLease.experiment,
      status: "running",
      updatedAt: new Date().toISOString()
    });
    runtime.upsertPersistedProject(preparedProject);
    emitRunUpdated(ws, requestId, preparedProject);
  }

  const currentRun = repository.getAgentRun(options.projectId, activeRun.threadId, options.runId) ?? activeRun;
  const baseExecutionPlan = options.executionPlan ?? buildExecutionPlanFromRun(currentRun, options.runId);
  const status = options.readyPlan.usesSubagents ? "running-subagents" : "running-main";
  const hasPendingPrerequisites = baseExecutionPlan.prerequisites.some((prerequisite) => prerequisite.status !== "completed");
  const promptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode: baseExecutionPlan.mode,
    ruleSources: baseExecutionPlan.ruleSources
  });
  const geminiCachedAttachmentContext = undefined;
  const startedProject = repository.setAgentRunStatus(
    options.projectId,
    options.runId,
    hasPendingPrerequisites ? "running-main" : status
  );
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdated(ws, requestId, startedProject);
  const executionCallbacks = createExecutionCallbacks(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    threadSession.sessionId,
    options.runId,
    pendingBrowserApprovals,
    options.abortSignal,
    connections,
    options.derivedProgressHeartbeatMs,
    options.tokenUsageSession
  );
  let executionPlan = baseExecutionPlan;
  if (hasPendingPrerequisites) {
    executionCallbacks.onRunMilestone("Planning done. Running prerequisites.");
    try {
      executionPlan = await executePlanPrerequisites(adapter, {
        cwd: experimentLease?.projectMountPath ?? project.rootPath,
        runId: options.runId,
        sessionId: threadSession.sessionId,
        messages: threadSession.messages,
        agentId: options.agentId,
        executionPlan,
        executionModelId: options.readyPlan.executionModelId,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        promptCacheIdentity,
        geminiCachedAttachmentContext,
        abortSignal: options.abortSignal,
        callbacks: executionCallbacks,
        async onPrerequisiteComplete(nextExecutionPlan) {
          const updatedProject = repository.setAgentRunExecutionPlan(options.projectId, options.runId, nextExecutionPlan);
          runtime.upsertPersistedProject(updatedProject);
          emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId, connections);
        }
      });
    } catch (error) {
      await executionCallbacks.closeRunMilestones();
      throw error;
    }
    if (status !== "running-main") {
      const subagentStartedProject = repository.setAgentRunStatus(options.projectId, options.runId, status);
      runtime.upsertPersistedProject(subagentStartedProject);
      emitRunUpdated(ws, requestId, subagentStartedProject);
    }
  }
  const executionPromptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode: executionPlan.mode,
    ruleSources: executionPlan.ruleSources
  });
  const executionGeminiCachedAttachmentContext = await prepareRunGeminiAttachmentCache({
    repository,
    projectId: options.projectId,
    modelId: options.readyPlan.executionModelId,
    messages: threadSession.messages,
    enabled: false
  });
  executionCallbacks.onRunMilestone(
    options.readyPlan.usesSubagents
      ? `Planning done. Spawning ${options.readyPlan.subtasks.length} subagents. Parallel slots: ${Math.min(4, Math.max(1, executionPlan.actualSubagentCount || options.readyPlan.subtasks.length))}.`
      : "Planning done. Starting main execution."
  );

  let outcome: Awaited<ReturnType<typeof executeReadyRun>>;
  try {
    outcome = await executeReadyRun(adapter, {
      cwd: experimentLease?.projectMountPath ?? project.rootPath,
      runId: options.runId,
      sessionId: threadSession.sessionId,
      messages: threadSession.messages,
      agentId: options.agentId,
      providerBrand: options.providerBrand,
      readyPlan: options.readyPlan,
      debugEnabled: options.debugEnabled,
      abortSignal: options.abortSignal,
      existingSubagentResults: options.existingSubagentResults,
      tasksToRun: options.tasksToRun,
      resumeNote: options.resumeNote,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      promptCacheIdentity: executionPromptCacheIdentity,
      geminiCachedAttachmentContext: executionGeminiCachedAttachmentContext,
      singleAgentModelPreference: repository.getSingleAgentModelPreferenceDefault(),
      subagentModelPreference: repository.getSubagentModelPreferenceDefault(),
      executionPlan,
      callbacks: executionCallbacks
    });
  } catch (error) {
    await executionCallbacks.closeRunMilestones();
    throw error;
  }

  try {
    await reviewAndFinalizeRun({ ws, requestId, runtime, repository, adapter, pendingBrowserApprovals,
      connections, osAdapters, options, activeRun, threadSession, executionTarget, experimentLease,
      projectRootPath: project.rootPath, executionPlan, outcome, executionCallbacks });
  } finally {
    await executionCallbacks.closeRunMilestones();
  }
}

async function reviewAndFinalizeRun(input: {
  ws: import("../transport/events").ControlEventSocket; requestId: string; runtime: WorkspaceRuntimeStore;
  repository: WorkspaceRepository; adapter: PiAgentAdapter;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>; osAdapters: HarnessServerOsAdapters;
  options: RunLifecycleOptions; activeRun: AgentRunState;
  threadSession: ReturnType<typeof getThreadSessionState>; executionTarget: "current-project" | "ephemeral-experiment";
  experimentLease?: BranchfsExperimentLease; projectRootPath: string; executionPlan: ExecutionPlan;
  outcome: Awaited<ReturnType<typeof executeReadyRun>>; executionCallbacks: ReturnType<typeof createExecutionCallbacks>;
}) {
  const { ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters,
    options, activeRun, threadSession, executionTarget, experimentLease, projectRootPath, executionPlan,
    outcome, executionCallbacks } = input;
  const reviewCwd = experimentLease?.projectMountPath ?? projectRootPath;
  executionCallbacks.onRunMilestone("Checking correctness.");
  const correctnessReview = await osAdapters.runCorrectnessReview(reviewCwd, executionPlan, outcome, options.readyPlan);
  if (!ownsExecution(runtime, options.projectId, options.runId, options.abortSignal)) return;
  if (correctnessReview.status === "needs-iteration" && !correctnessReview.recommendedPlan) {
    throw new Error("Correctness review requires more work but supplied no corrective plan. Retry or refine the task.");
  }
  executionCallbacks.onRunMilestone(correctnessReview.summary);
  const reviewedProject = repository.setAgentRunCorrectnessReview(options.projectId, options.runId, correctnessReview);
  runtime.upsertPersistedProject(reviewedProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId, connections);
  if (correctnessReview.status === "needs-iteration" && correctnessReview.recommendedPlan) {
    const recommendedPlan = correctnessReview.recommendedPlan;
    emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
      sessionId: threadSession.sessionId, stage: "correctness-gap", message: correctnessReview.summary,
      detail: correctnessReview.gaps.map((gap) => gap.description).join("\n")
    });
    await executionCallbacks.closeRunMilestones();
    if (!ownsExecution(runtime, options.projectId, options.runId, options.abortSignal)) return;
    runtime.clearStreaming(options.projectId, activeRun.threadId);
    runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
    runtime.setProjectError(options.projectId, undefined, activeRun.threadId);
    await presentCorrectivePlan(ws, requestId, runtime, repository, options.projectId, {
      sessionId: threadSession.sessionId, agentId: options.agentId,
      planningModelId: (repository.getRun(options.projectId, options.runId)?.planningModelId ?? activeRun.planningModelId)
        ?? getDefaultPlanningModelId(options.providerBrand), executionPlan: recommendedPlan
    });
    const autoOnce = recommendedPlan.correctnessPolicy === "auto-once" && recommendedPlan.iteration <= 2;
    const autoUntilClean = recommendedPlan.correctnessPolicy === "auto-until-clean" && recommendedPlan.iteration < 5;
    if (autoOnce || autoUntilClean) {
      await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters,
        { ...options, readyPlan: buildReadyPlanFromExecutionPlan(recommendedPlan), executionPlan: recommendedPlan, executionTarget });
    }
    return;
  }
  if (experimentLease) {
    const experimentManager = osAdapters.branchfsManagerFactory({ rootPath: projectRootPath, runId: options.runId });
    const inspection = await experimentManager.readInspection(experimentLease);
    const experimentProject = repository.saveExperimentRun(options.projectId, options.runId, {
      ...inspection.experiment, status: outcome.partial ? "partial-complete" : "completed", updatedAt: new Date().toISOString()
    });
    runtime.upsertPersistedProject(experimentProject);
  }
  executionCallbacks.onRunMilestone(outcome.partial
    ? `Run partial complete. ${outcome.partialReason ?? "Some subagents failed."}` : "Run completed.");
  await executionCallbacks.closeRunMilestones();
  const completed = await completeRunWithAssistantMessage(
    ws, requestId, runtime, repository, pendingBrowserApprovals, connections, {
    projectId: options.projectId, threadId: activeRun.threadId, runId: options.runId,
    abortSignal: options.abortSignal,
    assistantMessageContent: outcome.assistantMessage.content,
    partialReason: outcome.partial ? outcome.partialReason ?? "Some subagents failed." : undefined
  });
  const recordExceptionalRuns = repository.getMemoryBankRecordRunsDefault();
  if (completed.run && shouldExtractRunMemories(completed.run, recordExceptionalRuns)) {
    extractRunMemories(repository, { projectId: options.projectId, threadId: activeRun.threadId,
      run: completed.run, recordExceptionalRuns,
      finalAssistantMessage: outcome.assistantMessage.content, correctnessReview, cwd: reviewCwd });
  }
  scheduleBranchfsRetentionPrune(projectRootPath);
}

export async function executeInlineSubagentRetryLifecycle(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    runId: string;
    sourceRun: AgentRunState;
    targetTask: PlannerReadyTurn["subtasks"][number];
    readyPlan: PlannerReadyTurn;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal: AbortSignal;
    derivedProgressHeartbeatMs: number;
    tokenUsageSession: TokenUsageTotals;
  }
) {
  const project = runtime.getProject(options.projectId);
  const startedProject = repository.setAgentRunStatus(options.projectId, options.runId, "running-subagents");
  runtime.upsertPersistedProject(startedProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, options.runId);
  const threadSession = getThreadSessionState(runtime, repository, options.projectId, options.sourceRun.threadId);
  const sessionId = threadSession.sessionId;

  const callbacks = createExecutionCallbacks(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    options.sourceRun.threadId,
    sessionId,
    options.runId,
    pendingBrowserApprovals,
    options.abortSignal,
    connections,
    options.derivedProgressHeartbeatMs,
    options.tokenUsageSession
  );
  try {
  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId,
    modelPreference: repository.getSubagentModelPreferenceDefault()
  });
  const existingResults = options.sourceRun.subtasks
    .filter((task) => task.id !== options.targetTask.id)
    .filter(
      (task): task is typeof task & { status: "completed" | "failed" } =>
        task.status === "completed" || task.status === "failed"
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction,
      status: task.status,
      output: task.output,
      errorMessage: task.errorMessage,
      attemptCount: task.attemptCount,
      durationMs: 0,
      commitSha: task.commitSha,
      mountPath: task.mountPath,
      worktreePath: task.worktreePath
    }));

  callbacks.onTrace?.({
    sessionId,
    stage: "subagent-start",
    message: `Starting ${options.targetTask.title}`,
    subagentId: options.targetTask.id,
    modelId: subagentModelId
  });
  callbacks.onSubagentStart?.(
    options.targetTask,
    (options.sourceRun.subtasks.find((task) => task.id === options.targetTask.id)?.attemptCount ?? 0) + 1
  );

  // A retry is a new implementation boundary. Never reuse the source run's passing receipts.
  const quality = createQualitySession({ runId: options.runId, task: {
    intent: options.sourceRun.latestUserPrompt,
    paths: options.sourceRun.plan?.contracts.flatMap(contract => contract.ownedPaths),
    project: /(?:^|[\\/])books$/.test(project.rootPath) ? "books" : undefined,
  }, onTrace: callbacks.onQuality });
  quality.select();
  const frozen = await freezeQualityChecks(project.rootPath), before = await qualityChangedFiles(project.rootPath);
  const governingContext = await checkOutcomeDispatch({ cwd: project.rootPath, plan: options.sourceRun.plan ?? options.readyPlan,
    request: options.sourceRun.latestUserPrompt, signal: options.abortSignal });
  const qualityAdapter = withQualityContext(adapter, quality, governingContext, () => {
    assertOutcomeAdmission({ cwd: project.rootPath, plan: options.sourceRun.plan ?? options.readyPlan, request: options.sourceRun.latestUserPrompt });
  });
  const retriedResult = await runInlineSubagentRetry(qualityAdapter, {
    runId: options.runId,
    cwd: project.rootPath,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.readyPlan.executionModelId,
    modelPreference: repository.getSubagentModelPreferenceDefault(),
    task: options.targetTask,
    brief: options.readyPlan.finalExecutionBrief,
    priorAttemptCount: options.sourceRun.subtasks.find((task) => task.id === options.targetTask.id)?.attemptCount ?? 0,
    reasoningStrength: resolveSubagentReasoningStrength(options.reasoningStrength, repository.getSubagentModelPreferenceDefault()),
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    callbacks,
    sessionId
  });

  callbacks.onSubagentResult?.(retriedResult);

  const mergedResults = [...existingResults.filter((result) => result.id !== retriedResult.id), retriedResult].sort(
    (left, right) =>
      options.readyPlan.subtasks.findIndex((task) => task.id === left.id) -
      options.readyPlan.subtasks.findIndex((task) => task.id === right.id)
  );

  const assistantMessage = await aggregateSubagentResults(
    qualityAdapter,
    {
      cwd: project.rootPath,
      runId: options.runId,
      sessionId,
      messages: threadSession.messages,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      abortSignal: options.abortSignal,
      callbacks
    },
    options.readyPlan.executionModelId,
    options.readyPlan.finalExecutionBrief,
    options.readyPlan.subtasks,
    mergedResults,
    `Retry only ${options.targetTask.title}.`
  );

  let partial = mergedResults.some((result) => result.status === "failed");
  const changed = changedQualityPaths(before, await qualityChangedFiles(project.rootPath));
  if (changed) quality.observePaths(changed);
  const verification = await runVerificationCommands({ cwd: project.rootPath,
    commands: options.sourceRun.plan?.contracts.flatMap((contract) => contract.verificationCommands) ?? [],
    signal: options.abortSignal, onResult: callbacks.onRunMilestone });
  assistantMessage.content += `\n\n${verification}`;
  const report = await runQualityChecks(quality, frozen, !partial, options.abortSignal);
  const qualityBlocked = report.rules.some(rule => rule.severity === "blocking" && rule.eligibility !== "no" && rule.status !== "PASSED");
  partial ||= qualityBlocked;
  if (report.counts.applicable) assistantMessage.content += `\n\nHost checks: ${report.technicalVerification}; parent outcome: ${report.outcomeVerification}; ${report.domainAcceptance}.`;
  else if (governingContext) assistantMessage.content += "\n\nParent outcome: UNVERIFIED. Dispatch checks and child completion do not establish the requested experience.";
  if (partial) {
    callbacks.onRunMilestone?.("Run partial complete. Some retried subagents still failed.");
  } else {
    callbacks.onRunMilestone?.("Run completed.");
  }
  await callbacks.closeRunMilestones();
  await completeRunWithAssistantMessage(ws, requestId, runtime, repository, pendingBrowserApprovals, connections, {
    projectId: options.projectId,
    threadId: options.sourceRun.threadId,
    runId: options.runId,
    assistantMessageContent: assistantMessage.content,
    abortSignal: options.abortSignal,
    partialReason: qualityBlocked ? "Retried work has unresolved mandatory quality evidence." : partial ? "Some retried subagents still failed." : undefined
  });
  } finally {
    await callbacks.closeRunMilestones?.();
  }
}

function ownsExecution(runtime: WorkspaceRuntimeStore, projectId: ProjectId, runId: string, signal: AbortSignal) {
  return !signal.aborted && runtime.getAbortController(projectId, runId)?.signal === signal;
}

export function assertGlobalExecutionNotPaused(repository: WorkspaceRepository) {
  if (!repository.getGlobalExecutionPaused()) {
    return;
  }

  throw new Error("Global execution is paused. Resume all executions to continue.");
}
