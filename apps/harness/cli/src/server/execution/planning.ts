import { withAgentsMdRuleSource } from "../../agent-rules";
import { createStableBoundedId } from "../../notification-ids";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { buildExecutionPlan, runPlannerTurn } from "../../pi-orchestrator";
import { getDefaultPlanningModelId } from "../../pi-planner";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { HarnessConnection, HarnessServerOsAdapters, PendingBrowserApproval } from "../core/contracts";
import { emitExecutionControlUpdatedToAll, sendEvent } from "../transport/events";
import { createExecutionCallbacks } from "./callbacks";
import { createPlanningQuestionBatchNotification, createPlanningQuestionNotification } from "../automation/notifications";
import { emitProjectTrace, emitRunUpdated, emitRunUpdatedById, emitThreadMessageAppended, getThreadSessionState } from "../workspace/project-events";
import { executeRunLifecycle } from "./lifecycle";
import { buildReadyPlanFromRun, requireActiveRun, requirePersistedThreadRun, resolvePlanExecutionModeDefault, shouldAppendPlanSummaryMessage } from "./state";
import { buildProjectPromptCacheIdentity, prepareRunGeminiAttachmentCache } from "./run-context";
import { appendComposerControlStatus } from "./transcript-state";
import { normalizeWorkspaceRelativePaths } from "../../workspace-path-intent";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { resolveModeById } from "@hyperfocus/ai-core/modes";
import type { AgentRunState, ComposerReasoningStrength, ModeDefinition, PlannerReadyTurn, ProjectId, ProviderBrand, ThreadId, TokenUsageTotals, WorkspaceRuleSource } from "@hyperfocus/ai-core/protocol";

export async function continueRunLifecycle(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  options: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    debugEnabled: boolean;
    executionModelId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    enableGeminiAttachmentCaching?: boolean;
    abortSignal: AbortSignal;
    derivedProgressHeartbeatMs: number;
    tokenUsageSession: TokenUsageTotals;
  }
) {
  const project = runtime.getProject(options.projectId);
  const activeRun = requirePersistedThreadRun(repository, options.projectId, options.threadId, options.runId);
  const threadSession = getThreadSessionState(runtime, repository, options.projectId, options.threadId);
  appendComposerControlStatus(
    ws,
    requestId,
    runtime,
    repository,
    options.projectId,
    activeRun.threadId,
    options.fastMode
  );
  const mode = resolveModeById(project.selectedModeId, runtime.getWorkspace().workspaceModes, project.projectModes);
  const planExecutionMode = resolvePlanExecutionModeDefault(repository, mode);
  const subagentWorktreeStrategy =
    mode?.subagentWorktreeStrategyDefault ?? repository.getSubagentWorktreeStrategyDefault();
  const correctnessIterationMode =
    mode?.correctnessIterationModeDefault ?? repository.getCorrectnessIterationModeDefault();
  const ruleSources = withAgentsMdRuleSource(
    [runtime.getWorkspace().workspaceRuleSource, project.projectRuleSource].filter(
      (value): value is WorkspaceRuleSource => Boolean(value)
    )
  );
  const promptCacheIdentity = buildProjectPromptCacheIdentity({
    repository,
    projectId: options.projectId,
    projectRootPath: project.rootPath,
    providerBrand: options.providerBrand,
    selectedModeId: project.selectedModeId,
    mode,
    ruleSources
  });
  const geminiCachedAttachmentContext = await prepareRunGeminiAttachmentCache({
    repository,
    projectId: options.projectId,
    modelId: activeRun.planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
    messages: threadSession.messages,
    enabled: options.enableGeminiAttachmentCaching && options.providerBrand === "gemini"
  });
  const callbacks = createExecutionCallbacks(
    ws, requestId, runtime, repository, options.projectId, activeRun.threadId,
    threadSession.sessionId, activeRun.id, pendingBrowserApprovals, options.abortSignal,
    connections, options.derivedProgressHeartbeatMs, options.tokenUsageSession
  );
  try {
    const plannerTurn = await runPlannerTurn(adapter, {
      cwd: project.rootPath,
      sessionId: threadSession.sessionId,
      messages: threadSession.messages,
      latestUserPrompt: activeRun.latestUserPrompt,
      runId: activeRun.id,
      agentId: options.agentId,
      providerBrand: options.providerBrand,
      planningModelId: activeRun.planningModelId,
      executionModelId: options.executionModelId,
      subagentWorktreeStrategy,
      planExecutionMode,
      planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
      correctnessIterationMode,
      mode,
      ruleSources,
      priorQuestions: activeRun.questions,
      reasoningStrength: options.reasoningStrength,
      fastMode: options.fastMode,
      promptCacheIdentity,
      geminiCachedAttachmentContext,
      abortSignal: options.abortSignal,
      callbacks
    });
    return finishPlannerTurn({ ws, requestId, runtime, repository, connections,
      options, activeRun, threadSession, plannerTurn });
  } finally {
    await callbacks.closeRunMilestones();
  }
}
type FinishPlannerTurnInput = {
  ws: import("../transport/events").ControlEventSocket;
  requestId: string;
  runtime: WorkspaceRuntimeStore;
  repository: WorkspaceRepository;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  options: Parameters<typeof continueRunLifecycle>[7];
  activeRun: AgentRunState;
  threadSession: ReturnType<typeof getThreadSessionState>;
  plannerTurn: Awaited<ReturnType<typeof runPlannerTurn>>;
};

function finishPlannerTurn(input: FinishPlannerTurnInput) {
  const { ws, requestId, runtime, repository, connections, options, activeRun, threadSession, plannerTurn } = input;
  const promptProject = repository.setAgentRunPromptStats(options.projectId, activeRun.id, plannerTurn.promptStats);
  runtime.upsertPersistedProject(promptProject);

  if (plannerTurn.plannerResult.type === "question") {
    const questionStatus = repository.getGlobalExecutionPaused() ? "deferred" : "pending";
    const questionProject = repository.appendPlanningQuestions(
      options.projectId,
      activeRun.id,
      plannerTurn.plannerResult.questions,
      questionStatus,
      createStableBoundedId(["planner-turn", activeRun.id, plannerTurn.promptStats.promptHash])
    );
    runtime.upsertPersistedProject(questionProject);
    emitRunUpdatedById(ws, requestId, repository, options.projectId, activeRun.id);

    runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
    runtime.clearStreaming(options.projectId, activeRun.threadId);
    if (questionStatus === "pending") {
      const promptProject = repository.appendMessage(
        options.projectId,
        "assistant",
        plannerTurn.plannerResult.questions.map((question) => question.prompt).join("\n\n"),
        activeRun.threadId
      );
      runtime.upsertPersistedProject(promptProject);
      emitThreadMessageAppended(ws, requestId, runtime, repository, options.projectId, activeRun.threadId);
    } else {
      const deferredQuestions = [...new Map([
        ...(questionProject.activeRun?.questions.filter((question) => question.status === "deferred") ?? []),
        ...(questionProject.lastRun?.questions.filter((question) => question.status === "deferred") ?? [])
      ].map((question) => [question.id, question])).values()];
      if (deferredQuestions.length > 1) {
        repository.saveNotification(
          createPlanningQuestionBatchNotification(options.projectId, activeRun.threadId, activeRun.id, deferredQuestions)
        );
      } else {
        for (const deferredQuestion of deferredQuestions) {
          repository.saveNotification(
            createPlanningQuestionNotification(options.projectId, activeRun.threadId, activeRun.id, deferredQuestion)
          );
        }
      }
      emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
      emitExecutionControlUpdatedToAll(connections, requestId, repository.getExecutionControlState());
    }
    return;
  }

  if (!plannerTurn.executionPlan) {
    throw new Error("Planner did not return an execution plan");
  }

  const readyProject = repository.setAgentRunReady(
    options.projectId,
    activeRun.id,
    plannerTurn.plannerResult,
    plannerTurn.executionPlan,
    plannerTurn.plannerResult.subtasks,
    plannerTurn.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, options.projectId, activeRun.id);

  if (plannerTurn.plan) {
    runtime.setProjectPlan(options.projectId, plannerTurn.plan, activeRun.threadId);
    sendEvent(ws, {
      type: "agent.plan",
      requestId,
      payload: {
        projectId: options.projectId,
        threadId: activeRun.threadId,
        plan: plannerTurn.plan
      }
    });
  }

  runtime.setProjectStreaming(options.projectId, false, activeRun.threadId);
  runtime.clearStreaming(options.projectId, activeRun.threadId);
  if (shouldAppendPlanSummaryMessage(plannerTurn.executionPlan)) {
    const planSummaryProject = repository.appendMessage(options.projectId, "assistant", plannerTurn.executionPlan.summary, {
      threadId: activeRun.threadId,
      kind: "plan-summary",
      metadata: {
        type: "plan-summary",
        runId: activeRun.id,
        plan: plannerTurn.executionPlan
      }
    });
    runtime.upsertPersistedProject(planSummaryProject);
    emitThreadMessageAppended(ws, requestId, runtime, repository, options.projectId, activeRun.threadId);
  }
  emitProjectTrace(ws, requestId, runtime, options.projectId, activeRun.threadId, {
    sessionId: threadSession.sessionId,
    stage: "plan-presented",
    message: "Presented execution plan to user",
    detail: plannerTurn.executionPlan.summary,
    modelId: plannerTurn.executionPlan.executionModelId
  });
}


export async function continueQuickTaskLifecycle(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  options: {
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    runId?: string;
    executionModelId: string;
    latestUserPrompt: string;
    mode?: ModeDefinition;
    difficultyScore?: number;
    threadId: string;
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
  }
) {
  const project = runtime.getProject(projectId);
  const activeRun = options.runId ? requirePersistedThreadRun(repository, projectId, options.threadId, options.runId) : requireActiveRun(project);
  const threadSession = getThreadSessionState(runtime, repository, projectId, activeRun.threadId);
  appendComposerControlStatus(ws, requestId, runtime, repository, projectId, activeRun.threadId, options.fastMode);
  const planExecutionMode = resolvePlanExecutionModeDefault(repository, options.mode);
  const subagentWorktreeStrategy =
    options.mode?.subagentWorktreeStrategyDefault ?? repository.getSubagentWorktreeStrategyDefault();
  const correctnessIterationMode =
    options.mode?.correctnessIterationModeDefault ?? repository.getCorrectnessIterationModeDefault();
  const ruleSources = [runtime.getWorkspace().workspaceRuleSource, project.projectRuleSource].filter(
    (value): value is WorkspaceRuleSource => Boolean(value)
  );
  const normalizedLatestUserPrompt = normalizeWorkspaceRelativePaths(options.latestUserPrompt, project.rootPath);
  const plannerReadyTurn: PlannerReadyTurn = {
    type: "ready",
    difficultyScore: options.difficultyScore ?? 10,
    summary: "Low-complexity direct workspace task",
    executionModelId: options.executionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: normalizedLatestUserPrompt,
    prerequisites: [],
    contracts: []
  };
  const executionPlan = buildExecutionPlan({
    runId: activeRun.id,
    planningModelId: activeRun.planningModelId ?? getDefaultPlanningModelId(options.providerBrand),
    plannerResult: plannerReadyTurn,
    subagentWorktreeStrategy,
    planExecutionMode,
    planExecutionDelaySeconds: repository.getPlanExecutionDelaySecondsDefault(),
    correctnessIterationMode,
    mode: options.mode,
    ruleSources,
    iteration: 1,
    origin: "quick-task"
  });

  const readyProject = repository.setAgentRunReady(
    projectId,
    activeRun.id,
    plannerReadyTurn,
    executionPlan,
    plannerReadyTurn.subtasks,
    executionPlan.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, activeRun.id);
  runtime.setProjectStreaming(projectId, false, activeRun.threadId);
  runtime.clearStreaming(projectId, activeRun.threadId);
  emitProjectTrace(ws, requestId, runtime, projectId, activeRun.threadId, {
    sessionId: threadSession.sessionId,
    stage: "plan-presented",
    message: "Skipped planner for low-complexity direct task",
    detail: normalizedLatestUserPrompt,
    modelId: options.executionModelId
  });
}

export async function resumeRunLifecycle(
  ws: import("../transport/events").ControlEventSocket,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  osAdapters: HarnessServerOsAdapters,
  options: {
    projectId: ProjectId;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    providerBrand: ProviderBrand;
    debugEnabled: boolean;
    runId: string;
    sourceRun: AgentRunState;
    abortSignal: AbortSignal;
    guidanceText?: string;
    subagentIds?: string[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    derivedProgressHeartbeatMs: number;
    tokenUsageSession: TokenUsageTotals;
  }
) {
  const activeRun = options.sourceRun;
  const readyPlan = buildReadyPlanFromRun(activeRun);
  const existingResults = activeRun.subtasks
    .filter((task) => task.status === "completed")
    .map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction,
      status: "completed" as const,
      output: task.output,
      commitSha: task.commitSha,
      mountPath: task.mountPath,
      worktreePath: task.worktreePath,
      attemptCount: task.attemptCount,
      durationMs: 0
    }));
  const taskFilter = new Set(options.subagentIds ?? []);
  const tasksToRun = readyPlan.subtasks.filter((task) => {
    const existingTask = activeRun.subtasks.find((entry) => entry.id === task.id);
    if (!existingTask) {
      return true;
    }

    if (taskFilter.size > 0 && !taskFilter.has(task.id)) {
      return false;
    }

    return existingTask.status !== "completed";
  });

  const resumingProject = repository.resumeAgentRun(
    options.projectId,
    options.runId,
    readyPlan.usesSubagents ? "running-subagents" : "running-main"
  );
  runtime.upsertPersistedProject(resumingProject);
  emitRunUpdated(ws, requestId, resumingProject);

  await executeRunLifecycle(ws, requestId, runtime, repository, adapter, pendingBrowserApprovals, connections, osAdapters, {
    projectId: options.projectId,
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    debugEnabled: options.debugEnabled,
    runId: options.runId,
    sourceRun: activeRun,
    readyPlan,
    executionPlan: activeRun.plan,
    executionTarget: activeRun.executionTarget,
    existingSubagentResults: existingResults,
    tasksToRun,
    resumeNote: options.guidanceText,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    derivedProgressHeartbeatMs: options.derivedProgressHeartbeatMs,
    tokenUsageSession: options.tokenUsageSession
  });
}
