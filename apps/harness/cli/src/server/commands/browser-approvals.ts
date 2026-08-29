import { findPendingBrowserApproval } from "../../browser-session-state";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { ServerCommandContext } from "./context";
import { emitRunUpdatedByIdToAll } from "../workspace/project-events";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { createBrowserApprovalKey } from "../execution/run-context";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { claimBrowserApprovalWaiter, restoreBrowserApprovalWaiter,
  queueBrowserApprovalRuntimeRecovery, retryBrowserApprovalRuntimeConvergence,
  runBrowserApprovalPostCommitSteps, settleBrowserApprovalAfterCommit } from "../execution/browser-approval-waiters";
import { isTerminalRunStatus } from "../execution/run-context";
import { debugLog } from "../../logging";

type BrowserApprovalCommand = Extract<ClientCommand, { type: "browser.approval.resolve" }>;
type BrowserApprovalContext = Pick<ServerCommandContext, "runtime" | "repository" | "pendingBrowserApprovals" | "connections">;

export function handleBrowserApprovalCommand(command: BrowserApprovalCommand, context: BrowserApprovalContext) {
  const { runtime, repository, pendingBrowserApprovals, connections } = context;
  if (command.payload.approved) {
    assertGlobalExecutionNotPaused(repository);
  }
  const project = runtime.getProject(command.payload.projectId);
  const run = [project.activeRun, project.lastRun].find(
    (entry) => entry?.id === command.payload.runId && entry.threadId === command.payload.threadId
  );
  if (!run) {
    throw new Error(`Run ${command.payload.runId} is not available`);
  }
  if (isTerminalRunStatus(run.status)) throw new Error("Browser approval run is no longer active");

  const pendingActivity = findPendingBrowserApproval(run.browserSessions ?? [], {
    runId: command.payload.runId,
    sessionId: command.payload.sessionId,
    toolCallId: command.payload.toolCallId
  });
  if (!pendingActivity?.approval) {
    throw new Error("Browser approval is not pending");
  }
  const approvalKey = createBrowserApprovalKey(
    command.payload.projectId, command.payload.runId, command.payload.sessionId, command.payload.toolCallId,
  );
  const waiter = claimBrowserApprovalWaiter(pendingBrowserApprovals, approvalKey);
  if (!waiter) throw new Error("Browser approval has no live owner");

  try {
    repository.resolveAgentRunBrowserApproval({ projectId: command.payload.projectId,
      runId: command.payload.runId, sessionId: command.payload.sessionId,
      toolCallId: command.payload.toolCallId, approved: command.payload.approved });
  } catch (error) {
    restoreBrowserApprovalWaiter(pendingBrowserApprovals, approvalKey, waiter); throw error;
  }
  const publicationSteps = [
    { name: "run", run: () => emitRunUpdatedByIdToAll(connections, command.requestId, repository,
      command.payload.projectId, command.payload.runId) },
    { name: "notifications", run: () => emitNotificationsUpdatedToAll(connections, command.requestId,
      repository.loadNotificationInboxState()) },
  ];
  const report = (stage: string, error: unknown) => {
    debugLog("browser.approval.postcommit-failed", { runId: command.payload.runId, stage,
      detail: error instanceof Error ? error.message : String(error) });
  };
  try { upsertDurableProjectWithRetry(runtime, repository, command.payload.projectId); }
  catch (error) {
    queueBrowserApprovalRuntimeRecovery(runtime, command.payload.projectId,
      () => convergeDurableProject(runtime, repository, command.payload.projectId));
    waiter.reject(new Error("Browser approval committed but runtime resync failed"));
    report("runtime", error); runBrowserApprovalPostCommitSteps(publicationSteps, report); return;
  }
  settleBrowserApprovalAfterCommit(waiter, command.payload.approved, publicationSteps, report);
}

function upsertDurableProjectWithRetry(runtime: BrowserApprovalContext["runtime"],
  repository: BrowserApprovalContext["repository"], projectId: BrowserApprovalCommand["payload"]["projectId"]) {
  retryBrowserApprovalRuntimeConvergence(() => convergeDurableProject(runtime, repository, projectId));
}

function convergeDurableProject(runtime: BrowserApprovalContext["runtime"],
  repository: BrowserApprovalContext["repository"], projectId: BrowserApprovalCommand["payload"]["projectId"]) {
  if (repository.getWorkspaceProjectCatalogEntry(projectId)) runtime.upsertPersistedProject(repository.getProject(projectId));
  else { const activeId = runtime.getWorkspaceMetadata().activeProjectId;
    runtime.removeProject(projectId, activeId === projectId ? undefined : activeId); }
}
