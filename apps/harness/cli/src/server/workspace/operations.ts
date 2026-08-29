import type { CliSessionManager } from "../../agent-runtimes/cli-session-manager";
import { executionPlanToTasks } from "../../pi-orchestrator";
import type { HarnessConnection, PendingBrowserApproval } from "../core/contracts";
import { sendEvent } from "../transport/events";
import { emitRunUpdatedById, emitThreadMessageAppended } from "./project-events";
import { buildReadyPlanFromExecutionPlan, createAgentPlanFromExecutionPlan, isTerminalThreadArchiveRunStatus, shouldAppendPlanSummaryMessage } from "../execution/state";
import { rejectPendingBrowserApprovalsForRun } from "../execution/run-context";
import { scheduleBranchfsRetentionPrune } from "./branchfs-guards";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { ExecutionPlan, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";

export async function presentCorrectivePlan(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  input: {
    sessionId: string;
    agentId: "pi" | "copilot-cli" | "codex-cli";
    planningModelId: string;
    executionPlan: ExecutionPlan;
  }
) {
  const correctiveRun = repository.getRun(projectId, input.executionPlan.runId);
  if (!correctiveRun) {
    throw new Error(`Unknown run: ${input.executionPlan.runId}`);
  }
  const readyPlan = buildReadyPlanFromExecutionPlan(input.executionPlan);
  const readyProject = repository.setAgentRunReady(
    projectId,
    input.executionPlan.runId,
    readyPlan,
    input.executionPlan,
    executionPlanToTasks(input.executionPlan),
    input.planningModelId
  );
  runtime.upsertPersistedProject(readyProject);
  emitRunUpdatedById(ws, requestId, repository, projectId, input.executionPlan.runId);

  const agentPlan = createAgentPlanFromExecutionPlan(input.sessionId, input.agentId, input.planningModelId, input.executionPlan);
  runtime.setProjectPlan(projectId, agentPlan, correctiveRun.threadId);
  sendEvent(ws, {
    type: "agent.plan",
    requestId,
    payload: {
      projectId,
      threadId: correctiveRun.threadId,
      plan: agentPlan
    }
  });

  if (shouldAppendPlanSummaryMessage(input.executionPlan)) {
    const planMessageProject = repository.appendMessage(projectId, "assistant", input.executionPlan.summary, {
      threadId: correctiveRun.threadId,
      kind: "plan-summary",
      metadata: {
        type: "plan-summary",
        runId: input.executionPlan.runId,
        plan: input.executionPlan
      }
    });
    runtime.upsertPersistedProject(planMessageProject);
    emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, correctiveRun.threadId);
  }
}

export async function stopThreadActivityBeforeArchive(input: {
  ws: Bun.ServerWebSocket<HarnessConnection>;
  requestId: string;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  cliSessionManager: CliSessionManager;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  projectId: ProjectId;
  threadId: ThreadId;
}) {
  const { ws, requestId, repository, runtime, cliSessionManager, pendingBrowserApprovals, connections, projectId, threadId } = input;
  const project = runtime.getProject(projectId);
  const activeSessions = (project.cliSessions ?? []).filter(
    (session) => session.threadId === threadId && !["stopped", "exited", "failed"].includes(session.status)
  );
  for (const session of activeSessions) {
    await cliSessionManager.stopSession({
      projectId,
      threadId,
      sessionId: session.id
    });
  }

  const run = repository.getLatestThreadRun(projectId, threadId);
  if (run && !isTerminalThreadArchiveRunStatus(run.status)) {
    runtime.getAbortController(projectId, run.id)?.abort();
    runtime.setProjectStreaming(projectId, false, threadId);
    runtime.clearStreaming(projectId, threadId);
    runtime.setProjectError(projectId, "Thread deleted; active agents stopped", threadId);
    const stoppedProject = rejectPendingBrowserApprovalsForRun(
      pendingBrowserApprovals, repository, projectId, run.id, "Thread deleted; active agents stopped", "stopped",
    );
    runtime.upsertPersistedProject(stoppedProject);
    emitRunUpdatedById(ws, requestId, repository, projectId, run.id);
    emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
    scheduleBranchfsRetentionPrune(runtime.getProject(projectId).rootPath);
  }

  runtime.clearProjectTransients(projectId, threadId);
}
