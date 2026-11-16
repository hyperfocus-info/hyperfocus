import { executionPlanToTasks } from "../../pi-orchestrator";
import { getDefaultPlanningModelId } from "../../pi-planner";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { AgentPlan, AgentRunState, AgentRunSummary, BackgroundJobRunStatus, ExecutionPlan, ModeDefinition, PlannerReadyTurn, ProjectId, ThreadId, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";

type ServerRunRepository = Pick<
  WorkspaceRepository,
  | "getAgentRun"
  | "getBackgroundJobRunByLinkedAgentRunId"
  | "getConfiguredPlanExecutionModeDefault"
  | "getPlanExecutionModeDefault"
  | "getProject"
>;

type ServerRunRuntime = Pick<WorkspaceRuntimeStore, "getProject" | "getRunExecutionStates">;

type ProjectRunState = Pick<WorkspaceProjectState, "activeRun" | "activeThreadId" | "id" | "lastRun">;

export function resolvePlanExecutionModeDefault(repository: ServerRunRepository, mode?: ModeDefinition) {
  if (mode?.id === "plan") return "approve";
  return repository.getConfiguredPlanExecutionModeDefault() ?? mode?.planExecutionModeDefault ?? repository.getPlanExecutionModeDefault();
}

export function shouldAppendPlanSummaryMessage(executionPlan: ExecutionPlan) {
  return executionPlan.origin !== "quick-task" && !(executionPlan.mode?.id === "ask" && executionPlan.gating.mode === "immediate");
}

export function buildReadyPlanFromExecutionPlan(executionPlan: ExecutionPlan): PlannerReadyTurn {
  const subtasks = executionPlanToTasks(executionPlan);
  return {
    type: "ready",
    difficultyScore: executionPlan.difficultyScore,
    summary: executionPlan.summary,
    executionModelId: executionPlan.executionModelId,
    usesSubagents: subtasks.length > 0,
    subtasks,
    finalExecutionBrief: executionPlan.finalExecutionBrief,
    supervision: executionPlan.supervision,
    prerequisites: executionPlan.prerequisites,
    contracts: executionPlan.contracts
  };
}

export function createAgentPlanFromExecutionPlan(
  sessionId: string,
  agentId: "pi" | "copilot-cli" | "codex-cli",
  planningModelId: string,
  executionPlan: ExecutionPlan
): AgentPlan {
  return {
    sessionId,
    agentId,
    planningModelId,
    difficultyScore: executionPlan.difficultyScore,
    usesSubagents: executionPlan.actualSubagentCount > 1,
    executionModelId: executionPlan.executionModelId,
    subtaskCount: executionPlanToTasks(executionPlan).length,
    executionPlan
  };
}

export function buildReadyPlanFromRun(run: AgentRunState): PlannerReadyTurn {
  if (
    run.executionModelId === undefined ||
    run.difficultyScore === undefined ||
    run.summary === undefined ||
    run.finalExecutionBrief === undefined
  ) {
    throw new Error("Run does not have a resumable execution plan");
  }

  return {
    type: "ready",
    difficultyScore: run.difficultyScore,
    summary: run.summary,
    executionModelId: run.executionModelId,
    usesSubagents: run.subtasks.length > 0,
    subtasks: run.subtasks.map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction
    })),
    finalExecutionBrief: run.finalExecutionBrief,
    supervision: run.plan?.supervision,
    prerequisites: run.plan?.prerequisites,
    contracts: run.plan?.contracts
  };
}

export function buildExecutionPlanFromRun(run: AgentRunState, runId: string): ExecutionPlan {
  if (run.plan) {
    return {
      ...run.plan,
      runId
    };
  }

  if (
    run.executionModelId === undefined ||
    run.difficultyScore === undefined ||
    run.summary === undefined ||
    run.finalExecutionBrief === undefined
  ) {
    throw new Error("Run does not have a resumable execution plan");
  }

  return {
    runId,
    origin: "initial",
    iteration: 1,
    summary: run.summary,
    finalExecutionBrief: run.finalExecutionBrief,
    difficultyScore: run.difficultyScore,
    planningModelId: run.planningModelId ?? getDefaultPlanningModelId("gpt"),
    executionModelId: run.executionModelId,
    route: run.subtasks.length > 0 ? "pi-subagents" : "main",
    subagentWorktreeStrategy: "same-worktree",
    targetSubagentCount: run.subtasks.length,
    actualSubagentCount: run.subtasks.length,
    gating: {
      mode: "countdown",
      delaySeconds: 10
    },
    prerequisites: [],
    contracts: run.subtasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      instruction: task.instruction,
      effortPoints: 2,
      ownedPaths: ["(planner-unspecified)"],
      dependsOnPrerequisiteIds: [],
      deliverables: [task.title],
      integrationPoints: [],
      verificationScope: "owned-files-only",
      verificationCommands: ["bunx tsc --noEmit"],
      mergeNotes: `Merge ${task.title} into final solution.`
    })),
    correctnessPolicy: "ask-before-iterate"
  };
}

export function assertRunCanRefresh(run: AgentRunState) {
  if (run.status === "awaiting-user-input") {
    throw new Error("Run is waiting for planner input");
  }

  if (!["running-main", "running-subagents", "aggregating"].includes(run.status)) {
    throw new Error(`Run status ${run.status} is not refreshable`);
  }
}

export function assertProjectCanStartRun(
  repository: ServerRunRepository,
  runtime: ServerRunRuntime,
  projectId: ProjectId,
  threadId: ThreadId
) {
  if (isActiveThreadStreaming(runtime, projectId, threadId)) {
    throw new Error("Thread has active run in status running-main");
  }
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "ready", "running-main", "running-subagents", "aggregating", "partial-complete"]);
  const blockingRun = findProjectForegroundRunWithStatuses(repository, projectId, blockingStatuses);
  if (blockingRun) {
    throw new Error(`Thread has active run in status ${blockingRun.status}`);
  }
}

export function assertActiveThread(project: ProjectRunState, threadId: string) {
  if (project.activeThreadId !== threadId) {
    throw new Error(`Thread ${threadId} is not active for project ${project.id}`);
  }
}

export function assertProjectCanStartRetry(
  repository: ServerRunRepository,
  runtime: ServerRunRuntime,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  if (isActiveThreadStreaming(runtime, projectId, threadId)) {
    throw new Error("Thread has active run in status running-main");
  }
  const blockingStatuses = new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"]);
  const blockingRun = findProjectForegroundRunWithStatuses(repository, projectId, blockingStatuses, runId);
  if (blockingRun) {
    throw new Error(`Thread has active run in status ${blockingRun.status}`);
  }
}

export function assertNoOtherWorkingRun(
  repository: ServerRunRepository,
  runtime: ServerRunRuntime,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  const activeExecution = runtime
    .getRunExecutionStates(projectId, runId)
    .some((state) => ["queued", "provisioning", "api-starting", "active", "finishing", "waiting-input"].includes(state.phase));
  if (isActiveThreadStreaming(runtime, projectId, threadId) && !activeExecution) {
    throw new Error("Thread has active run in status running-main");
  }
  const workingStatuses = new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"]);
  const workingRun = findProjectForegroundRunWithStatuses(repository, projectId, workingStatuses, runId);
  if (workingRun) {
    throw new Error(`Thread has active run in status ${workingRun.status}`);
  }
}

export function findProjectForegroundRunWithStatuses(
  repository: ServerRunRepository,
  projectId: ProjectId,
  statuses: Set<string>,
  excludedRunId?: string
) {
  return findProjectRunWithStatuses(repository, projectId, statuses, excludedRunId, (run) => {
    const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(run.id);
    return !linkedBackgroundRun || !isActiveBackgroundRunStatus(linkedBackgroundRun.status);
  });
}

function findProjectRunWithStatuses(
  repository: ServerRunRepository,
  projectId: ProjectId,
  statuses: Set<string>,
  excludedRunId?: string,
  predicate?: (run: AgentRunState | AgentRunSummary) => boolean
) {
  const project = repository.getProject(projectId);
  const seenRunIds = new Set<string>();
  for (const run of [project.activeRun, project.lastRun, ...project.runSummaries]) {
    if (!run || seenRunIds.has(run.id)) {
      continue;
    }
    seenRunIds.add(run.id);
    if (run.id !== excludedRunId && statuses.has(run.status) && (!predicate || predicate(run))) {
      return run;
    }
  }

  return undefined;
}

function isActiveBackgroundRunStatus(status: BackgroundJobRunStatus) {
  return status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running";
}

export function isActiveThreadStreaming(runtime: ServerRunRuntime, projectId: ProjectId, threadId: ThreadId) {
  const project = runtime.getProject(projectId);
  return (
    project.activeThreadId === threadId &&
    project.session.isStreaming &&
    project.activeRun?.threadId === threadId &&
    isBlockingRunStatus(project.activeRun.status)
  );
}

function isBlockingRunStatus(status: AgentRunState["status"]) {
  return status === "planning" || status === "running-main" || status === "running-subagents" || status === "aggregating";
}

export function isTerminalThreadArchiveRunStatus(status: AgentRunState["status"]) {
  return status === "completed" || status === "partial-complete" || status === "stopped" || status === "failed";
}

export function requirePersistedThreadRun(
  repository: ServerRunRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  const run = repository.getAgentRun(projectId, threadId, runId);
  if (!run) {
    throw new Error(`Run ${runId} is not available in this thread`);
  }

  return run;
}

export function requireActiveRun(project: ProjectRunState, runId?: string) {
  if (!project.activeRun) {
    throw new Error("Project has no active run");
  }

  if (runId && project.activeRun.id !== runId) {
    throw new Error(`Run ${runId} is not active`);
  }

  return project.activeRun;
}

export function requireRetryablePersistedRun(
  repository: ServerRunRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  runId: string
) {
  const run = requirePersistedThreadRun(repository, projectId, threadId, runId);
  if (!run.retryable) {
    throw new Error(`Run ${runId} is not retryable`);
  }

  return run;
}

export function requireRunById(project: ProjectRunState, runId: string) {
  const run = [project.activeRun, project.lastRun].find((entry) => entry?.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} is not available`);
  }
  return run;
}
