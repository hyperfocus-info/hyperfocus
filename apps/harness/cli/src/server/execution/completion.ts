import { debugLog } from "../../logging";
import { extractRunMemories, shouldExtractRunMemories } from "../../memory-bank";
import { classifyRunFailure } from "../../run-failure-classification";
import { syncBackgroundJobFailureTracking } from "../automation/background-runs";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { HarnessConnection, PendingBrowserApproval } from "../core/contracts";
import { emitControlEvent } from "../transport/events";
import { saveBackgroundRunStatusNotification } from "../automation/notifications";
import { emitRunUpdatedById, findLatestAssistantMessage, getThreadSessionState } from "../workspace/project-events";
import { isTerminalRunStatus, rejectPendingBrowserApprovalsForRun } from "./run-context";
import { appendSystemStatus, hasPersistedFinalAssistantContent } from "./transcript-state";
import { scheduleBranchfsRetentionPrune } from "../workspace/branchfs-guards";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { AgentRunState, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";

export function repairStaleRefreshRun(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  projectId: ProjectId,
  run: AgentRunState
) {
  const message = "Run has no live execution controller; stopped stale run so it can be resumed or retried.";
  runtime.abortRun(projectId, run.id);
  const stoppedProject = rejectPendingBrowserApprovalsForRun(
    pendingBrowserApprovals, repository, projectId, run.id, message, "stopped", "controller-lost",
  );
  runtime.upsertPersistedProject(stoppedProject);
  runtime.clearProjectTransients(projectId, run.threadId);
  emitRunUpdatedById(ws, requestId, repository, projectId, run.id, connections);
  if (connections) emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
  appendSystemStatus(ws, requestId, runtime, repository, projectId, run.threadId, message);
  debugLog("run.refresh.stale-controller", {
    projectId,
    runId: run.id,
    threadId: run.threadId
  });
}

export async function handleRunFailure(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>> | undefined,
  projectId: ProjectId,
  message: string,
  runId?: string
) {
  const project = runtime.getProject(projectId);
  const failedRun = (runId ? repository.getRun(projectId, runId) : undefined) ?? project.activeRun;
  const failureCategory = classifyRunFailure({ message });
  if (failedRun) {
    const failedProject = rejectPendingBrowserApprovalsForRun(
      pendingBrowserApprovals, repository, projectId, failedRun.id, message, "failed", failureCategory,
    );
    const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(failedRun.id);
    if (linkedBackgroundRun && ["queued", "awaiting-approval", "awaiting-user-input", "running"].includes(linkedBackgroundRun.status)) {
      const failedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "failed", {
        failureMessage: message,
        failureCategory,
        summary: failedRun.summary
      });
      repository.appendBackgroundJobRunEvent(linkedBackgroundRun.id, "failed", "Linked agent run failed", message);
      const refreshedBackgroundRun = repository.getBackgroundJobRun(failedBackgroundRun.id) ?? failedBackgroundRun;
      syncBackgroundJobFailureTracking(repository, refreshedBackgroundRun);
      saveBackgroundRunStatusNotification(repository, refreshedBackgroundRun);
      if (connections) {
        emitBackgroundJobRunUpdatedToAll(connections, refreshedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      }
    }
    if (failedRun.experiment) {
      repository.saveExperimentRun(projectId, failedRun.id, {
        ...failedRun.experiment,
        status: "failed",
        updatedAt: new Date().toISOString()
      });
    }
    runtime.upsertPersistedProject(failedProject);
    emitRunUpdatedById(ws, requestId, repository, projectId, failedRun.id, connections);
    if (connections) emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
    scheduleBranchfsRetentionPrune(project.rootPath);
    const recordExceptionalRuns = repository.getMemoryBankRecordRunsDefault();
    if (shouldExtractRunMemories(failedRun, recordExceptionalRuns)) {
      extractRunMemories(repository, {
        projectId,
        threadId: failedRun.threadId,
        run: repository.getRun(projectId, failedRun.id) ?? failedRun,
        recordExceptionalRuns,
        finalAssistantMessage: getThreadSessionState(runtime, repository, projectId, failedRun.threadId).messages.at(-1)?.content,
        correctnessReview: failedRun.correctnessReview,
        cwd: failedRun.experiment?.projectMountPath ?? project.rootPath
      });
    }
  }

  runtime.setProjectError(projectId, message, failedRun?.threadId ?? project.activeThreadId);
  runtime.setProjectStreaming(projectId, false, failedRun?.threadId ?? project.activeThreadId);
  runtime.clearStreaming(projectId, failedRun?.threadId ?? project.activeThreadId);
  appendSystemStatus(
    ws,
    requestId,
    runtime,
    repository,
    projectId,
    failedRun?.threadId ?? project.activeThreadId,
    `Run failed. ${message}`
  );

  emitControlEvent(connections, {
    type: "chat.error",
    requestId,
    payload: {
      projectId,
      threadId: failedRun?.threadId ?? project.activeThreadId,
      message: "Agent execution failed",
      detail: message
    }
  });

  debugLog("chat.error", {
    projectId,
    detail: message
  });
}

export async function completeRunWithAssistantMessage(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>> | undefined,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    assistantMessageContent: string;
    partialReason?: string;
  }
) {
  const run = repository.getAgentRun(input.projectId, input.threadId, input.runId);
  if (!run) {
    throw new Error(`Unknown agent run: ${input.runId}`);
  }
  if (isTerminalRunStatus(run.status)) {
    throw new Error(`Run ${input.runId} is already terminal`);
  }

  const shouldAppendFinalMessage = !hasPersistedFinalAssistantContent(
    repository,
    input.projectId,
    input.threadId,
    input.assistantMessageContent
  );
  const messageProject = shouldAppendFinalMessage
    ? repository.appendMessage(input.projectId, "assistant", input.assistantMessageContent, input.threadId)
    : runtime.getProject(input.projectId);
  runtime.upsertPersistedProject(messageProject);
  const finalStatus = input.partialReason ? "partial-complete" : "completed";
  const statusProject = rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, input.projectId,
    input.runId, input.partialReason ?? "Run completed", finalStatus);
  runtime.upsertPersistedProject(statusProject);
  emitRunUpdatedById(ws, requestId, repository, input.projectId, input.runId, connections);
  if (connections) emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
  runtime.clearStreaming(input.projectId, input.threadId);
  runtime.setProjectStreaming(input.projectId, false, input.threadId);
  runtime.setProjectError(input.projectId, undefined, input.threadId);
  runtime.setAbortController(input.projectId, input.runId, undefined);

  const project = runtime.getProject(input.projectId);
  const threadSession = getThreadSessionState(runtime, repository, input.projectId, input.threadId);
  const finalRun = repository.getRun(input.projectId, input.runId);
  const assistantMessage = findLatestAssistantMessage({
    id: input.projectId,
    rootPath: project.rootPath,
    activeThreadId: input.threadId,
    session: threadSession,
    activeRun: undefined,
    lastRun: finalRun
  });
  if (!assistantMessage || assistantMessage.role !== "assistant") {
    throw new Error("Assistant message was not persisted");
  }

  emitControlEvent(connections, {
    type: "chat.complete",
    requestId,
    payload: {
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId: threadSession.sessionId,
      assistantMessage,
      state: threadSession
    }
  });

  return {
    run: finalRun,
    assistantMessage
  };
}
