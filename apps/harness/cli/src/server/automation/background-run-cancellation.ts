import type { BackgroundRunControl } from "../core/contracts";
import { debugLog } from "../../logging";
import type { ControlEventConnections, ControlEventSocket } from "../transport/events";
import { abortAndAwaitBackgroundRunControls, abortBackgroundRunControl } from "../runtime/background-run-lifecycle";
import { scheduleBranchfsRetentionPrune } from "../workspace/branchfs-guards";
import { emitRunUpdatedById } from "../workspace/project-events";
import { emitBackgroundJobRunUpdatedToAll, emitNotificationsUpdatedToAll } from "./background-events";
import { saveBackgroundRunStatusNotification } from "./notifications";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { BackgroundJobRun, ProjectId } from "@hyperfocus/ai-core/protocol";
import { rejectPendingBrowserApprovalsForRun } from "../execution/run-context";
import type { PendingBrowserApproval } from "../core/contracts";

export function formatActiveBackgroundRunError(run: BackgroundJobRun) {
  const detail = run.summary ?? run.failureMessage;
  const leaseDetail = run.status === "running" && run.controllerLeaseExpiresAt
    ? `; controller lease active until ${run.controllerLeaseExpiresAt}` : "";
  return `Background job already has active run ${run.id} in status ${run.status}${leaseDetail}${detail ? `: ${detail}` : ""}`;
}

export async function stopBackgroundRunsForJob(input: {
  ws: ControlEventSocket;
  requestId: string;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  connections: ControlEventConnections;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  jobId: string;
  runId?: string;
  reason: string;
}) {
  const activeRuns = input.repository.getActiveBackgroundJobRuns(input.jobId)
    .filter((run) => input.runId === undefined || run.id === input.runId);
  const stoppedRuns: BackgroundJobRun[] = [];
  for (const existingRun of activeRuns) {
    const control = input.backgroundRunControllers.get(existingRun.id);
    const updatedRun = input.repository.setBackgroundJobRunStatus(existingRun.id, "cancelled", {
      failureMessage: input.reason, failureCategory: "manual-abort"
    });
    if (existingRun.linkedAgentRunId) {
      const linkedRun = input.repository.getRun(existingRun.projectId, existingRun.linkedAgentRunId);
      const stoppedProject = rejectPendingBrowserApprovalsForRun(new Map<string, PendingBrowserApproval>(),
        input.repository, existingRun.projectId, existingRun.linkedAgentRunId, input.reason, "stopped");
      input.runtime.upsertPersistedProject(stoppedProject);
      input.runtime.abortRun(existingRun.projectId, existingRun.linkedAgentRunId);
      if (linkedRun) input.runtime.clearProjectTransients(existingRun.projectId, linkedRun.threadId);
      emitRunUpdatedById(input.ws, input.requestId, input.repository, existingRun.projectId,
        existingRun.linkedAgentRunId, input.connections);
      emitNotificationsUpdatedToAll(input.connections, input.requestId, input.repository.loadNotificationInboxState());
      if (input.runtime.hasProject(existingRun.projectId)) {
        scheduleBranchfsRetentionPrune(input.runtime.getProject(existingRun.projectId).rootPath);
      }
    }
    input.repository.appendBackgroundJobRunEvent(existingRun.id, "cancelled", "Background run cancelled", input.reason);
    saveBackgroundRunStatusNotification(input.repository, updatedRun);
    abortBackgroundRunControl(control);
    emitBackgroundJobRunUpdatedToAll(input.connections, updatedRun);
    stoppedRuns.push(updatedRun);
  }
  return stoppedRuns;
}

export async function commitBackgroundJobDeletion(input: {
  repository: Pick<WorkspaceRepository, "deleteBackgroundJob" | "getProject">;
  runtime: Pick<WorkspaceRuntimeStore, "abortRun" | "clearProjectTransients" | "hasProject" | "upsertPersistedProject">;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  projectId: string;
  jobId: string;
}) {
  const committed = input.repository.deleteBackgroundJob(input.projectId, input.jobId);
  const controls = collectDeletedRunControls(input.backgroundRunControllers, committed.deletedRunIds);
  const settlement = abortAndAwaitBackgroundRunControls(input.backgroundRunControllers, controls);
  try {
    reconcileDeletedLinkedAgentRuns(input.repository, input.runtime, committed.linkedAgentRuns, [input.projectId]);
  } finally {
    await settlement;
  }
  return committed;
}

export async function commitAssistantDeletion(input: {
  repository: Pick<WorkspaceRepository, "deleteAssistant" | "getProject">;
  runtime: Pick<WorkspaceRuntimeStore, "abortRun" | "clearProjectTransients" | "hasProject" | "upsertPersistedProject">;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  assistantId: string;
  afterCommit?: () => void;
}) {
  const committed = input.repository.deleteAssistant(input.assistantId);
  input.afterCommit?.();
  const controls = collectDeletedRunControls(input.backgroundRunControllers, committed.deletedRunIds);
  const settlement = abortAndAwaitBackgroundRunControls(input.backgroundRunControllers, controls);
  try {
    reconcileDeletedLinkedAgentRuns(input.repository, input.runtime, committed.linkedAgentRuns);
  } finally {
    await settlement;
  }
  return committed;
}

export async function commitProjectDeletion(input: {
  repository: Pick<WorkspaceRepository, "removeProject">;
  runtime: Pick<WorkspaceRuntimeStore, "removeProject">;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  projectId: string;
  afterCommit?: (deletedAssistantIds: string[]) => void;
}) {
  const committed = input.repository.removeProject(input.projectId);
  input.afterCommit?.(committed.deletedAssistantIds);
  const controls = collectDeletedRunControls(input.backgroundRunControllers, committed.deletedRunIds);
  const settlement = abortAndAwaitBackgroundRunControls(input.backgroundRunControllers, controls);
  try {
    await settlement;
  } finally {
    reconcileDeletedRuntime("remove-project", () => input.runtime.removeProject(input.projectId, committed.activeProjectId));
  }
  return committed;
}

function reconcileDeletedLinkedAgentRuns(
  repository: Pick<WorkspaceRepository, "getProject">,
  runtime: Pick<WorkspaceRuntimeStore, "abortRun" | "clearProjectTransients" | "hasProject" | "upsertPersistedProject">,
  linkedAgentRuns: Array<{ projectId: ProjectId; runId: string; threadId: string }>,
  additionalProjectIds: string[] = []
) {
  for (const linked of linkedAgentRuns) {
    reconcileDeletedRuntime("abort-linked-run", () => runtime.abortRun(linked.projectId, linked.runId));
    reconcileDeletedRuntime("clear-linked-thread", () => runtime.clearProjectTransients(linked.projectId, linked.threadId));
  }
  for (const projectId of new Set([...linkedAgentRuns.map((run) => run.projectId), ...additionalProjectIds])) {
    reconcileDeletedRuntime("refresh-project", () => {
      if (runtime.hasProject(projectId)) runtime.upsertPersistedProject(repository.getProject(projectId));
    });
  }
}

function reconcileDeletedRuntime(operation: string, reconcile: () => void) {
  try {
    reconcile();
  } catch (error) {
    debugLog("background.deletion.runtime-reconcile-failed", {
      operation,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function collectDeletedRunControls(controllers: Map<string, BackgroundRunControl>, runIds: string[]) {
  const controls: Array<[string, BackgroundRunControl]> = [];
  for (const runId of runIds) {
    const control = controllers.get(runId);
    if (control) controls.push([runId, control]);
  }
  return controls;
}
