import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import type { AssistantManager } from "../../assistant-manager";
import { assertBackgroundRunTransition, requireBackgroundJobForProject, requireBackgroundRunForProject } from "../../background-job-command-guards";
import { discardAssistantChatPumps, emitAssistantsUpdatedToAll, emitAssistantSummaryDeltaToAll } from "./assistant-actions";
import { isBackgroundRunLive, repairBackgroundJobRunsForJob, safeLaunchBackgroundJobRun } from "./background-runs";
import { commitAssistantDeletion, commitBackgroundJobDeletion, commitProjectDeletion, formatActiveBackgroundRunError, stopBackgroundRunsForJob } from "./background-run-cancellation";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsDeletedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "./background-events";
import type { BackgroundRunControl, HarnessConnection } from "../core/contracts";
import { emitControlEvent } from "../transport/events";
import { archiveNotificationWithLegacyId, saveBackgroundRunStatusNotification } from "./notifications";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { findProjectForegroundRunWithStatuses } from "../execution/state";
import { formatUnknownErrorMessage } from "../runtime/error-classification";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import type { BulkOperationAction, BulkOperationItemResult, BulkOperationPayload, BulkOperationResult, BulkOperationTarget, ServerEvent, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export type BulkOperationInput = {
  apply: boolean;
  payload: BulkOperationPayload;
  requestId: string;
  ws: import("../transport/events").ControlEventSocket;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  runtimeRegistry: AgentRuntimeRegistry;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  assistantManager: AssistantManager;
  tokenUsageSession: TokenUsageTotals;
};

export type BulkOperationMutationResult = {
  message: string;
  backgroundJobsChanged?: boolean;
  assistantsChanged?: boolean;
  notificationsChanged?: boolean;
  deletedJobIds?: string[];
  changedAssistantIds?: string[];
  deletedAssistantIds?: string[];
};

export async function executeBulkOperation(input: BulkOperationInput): Promise<BulkOperationResult> {
  const operationId = input.payload.operationId ?? createRequestId();
  const results: BulkOperationItemResult[] = [];
  let backgroundJobsChanged = false;
  const changedAssistantIds: string[] = []; const deletedAssistantIds: string[] = [];
  let assistantsChanged = false;
  let notificationsChanged = false;
  const deletedJobIds: string[] = [];

  for (const target of input.payload.targets) {
    try {
      const preview = previewBulkOperationTarget(input, target);
      if (!input.apply || preview.status !== "ready") {
        results.push(preview);
        continue;
      }

      const applied = await applyBulkOperationTarget(input, target);
      backgroundJobsChanged = backgroundJobsChanged || Boolean(applied.backgroundJobsChanged);
      assistantsChanged = assistantsChanged || Boolean(applied.assistantsChanged);
      notificationsChanged = notificationsChanged || Boolean(applied.notificationsChanged);
      if (applied.deletedJobIds) deletedJobIds.push(...applied.deletedJobIds);
      if (applied.changedAssistantIds) changedAssistantIds.push(...applied.changedAssistantIds);
      if (applied.deletedAssistantIds) deletedAssistantIds.push(...applied.deletedAssistantIds);
      results.push({
        ...preview,
        status: "applied",
        message: clampBulkOperationMessage(applied.message)
      });
    } catch (error) {
      results.push(createBulkOperationErrorResult(input.repository, input.payload.action, target, input.apply, error));
    }
  }

  if (input.apply) {
    if (input.payload.action === "delete") {
      const targets: Extract<ServerEvent, { type: "background-jobs.deleted" }>["payload"]["targets"] = [];
      for (const result of results) {
        if (result.status !== "applied" || result.target.kind === "background-run") continue;
        if (result.target.kind === "background-job") targets.push({ kind: "background-job", jobId: result.target.jobId });
        else if (result.target.kind === "assistant") targets.push({ kind: "assistant", assistantId: result.target.assistantId });
        else targets.push({ kind: "project", projectId: result.target.projectId });
      }
      emitBackgroundJobsDeletedToAll(input.connections, input.requestId, targets, deletedJobIds);
    }
    if (backgroundJobsChanged) {
      emitBackgroundJobsUpdatedToAll(input.connections, input.repository.loadBackgroundJobsState());
    }
    if (assistantsChanged) {
      if (changedAssistantIds.length > 0) emitAssistantSummaryDeltaToAll(input.connections, input.repository, changedAssistantIds);
      if (deletedAssistantIds.length > 0) emitAssistantsUpdatedToAll(input.connections,
        input.repository.loadAssistantSummaryDelta([]), deletedAssistantIds);
    }
    if (notificationsChanged) {
      emitNotificationsUpdatedToAll(input.connections, input.requestId, input.repository.loadNotificationInboxState());
    }
  }

  return {
    operationId,
    action: input.payload.action,
    applied: input.apply,
    results
  };
}

export function previewBulkOperationTarget(input: BulkOperationInput, target: BulkOperationTarget): BulkOperationItemResult {
  const repository = input.repository;
  const action = input.payload.action;
  const label = getBulkOperationTargetLabel(repository, target);

  switch (target.kind) {
    case "background-job": {
      const job = requireBackgroundJobForProject(repository, target.projectId, target.jobId);
      switch (action) {
        case "pause":
          return job.status === "paused"
            ? createBulkOperationResult(target, action, label, "skipped", "Already paused.")
            : createBulkOperationResult(target, action, label, "ready", "Pause scheduled job.");
        case "resume":
          return job.status === "enabled"
            ? createBulkOperationResult(target, action, label, "skipped", "Already enabled.")
            : createBulkOperationResult(target, action, label, "ready", "Resume scheduled job.");
        case "delete":
          return createBulkOperationResult(target, action, label, "ready", "Delete job and cancel matching active runs.");
        case "run-now": {
          assertGlobalExecutionNotPaused(repository);
          if (job.status === "disabled") {
            throw new Error(`Background job ${job.id} is disabled`);
          }
          if (job.assistantId) {
            assertAssistantRunnableForLaunch(repository, job.assistantId);
          }
          const activeRun = repository.getActiveBackgroundJobRuns(job.id)[0];
          if (activeRun) {
            throw new Error(formatActiveBackgroundRunError(activeRun));
          }
          return createBulkOperationResult(target, action, label, "ready", "Queue job run now.");
        }
        default:
          throw new Error(`Bulk action ${action} is not available for scheduled jobs.`);
      }
    }
    case "background-run": {
      const run = requireBackgroundRunForProject(repository, target.projectId, target.runId);
      switch (action) {
        case "stop":
          assertBackgroundRunTransition(run, "stop");
          return createBulkOperationResult(target, action, label, "ready", "Stop background run.");
        case "retry":
          assertGlobalExecutionNotPaused(repository);
          assertBackgroundRunTransition(run, "retry");
          return createBulkOperationResult(target, action, label, "ready", "Retry background run.");
        case "approve":
          assertGlobalExecutionNotPaused(repository);
          assertBackgroundRunTransition(run, "approve");
          return createBulkOperationResult(target, action, label, "ready", "Approve and queue background run.");
        case "reject":
          assertBackgroundRunTransition(run, "reject");
          return createBulkOperationResult(target, action, label, "ready", "Reject background run.");
        default:
          throw new Error(`Bulk action ${action} is not available for background runs.`);
      }
    }
    case "assistant": {
      const assistant = requireAssistantForBulkOperation(repository, target.assistantId);
      switch (action) {
        case "pause":
          return assistant.runState === "paused"
            ? createBulkOperationResult(target, action, label, "skipped", "Already paused.")
            : createBulkOperationResult(target, action, label, "ready", "Pause assistant.");
        case "resume":
          return assistant.runState === "active"
            ? createBulkOperationResult(target, action, label, "skipped", "Already active.")
            : createBulkOperationResult(target, action, label, "ready", "Resume assistant.");
        case "delete":
          return createBulkOperationResult(target, action, label, "ready", "Delete assistant.");
        case "bootstrap-retry":
          assertGlobalExecutionNotPaused(repository);
          assertAssistantRunnableForLaunch(repository, assistant.id);
          return createBulkOperationResult(target, action, label, "ready", "Retry assistant bootstrap.");
        default:
          throw new Error(`Bulk action ${action} is not available for assistants.`);
      }
    }
    case "project": {
      const project = input.runtime.getProject(target.projectId);
      if (action !== "delete") {
        throw new Error(`Bulk action ${action} is not available for projects.`);
      }
      const blockingForegroundRun = findProjectForegroundRunWithStatuses(
        repository,
        target.projectId,
        new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"])
      );
      if (input.runtime.hasAnyStreamingThread(target.projectId) || blockingForegroundRun) {
        throw new Error("Project is streaming");
      }
      return createBulkOperationResult(target, action, project.name, "ready", "Remove project from workspace.");
    }
  }
}

export async function applyBulkOperationTarget(input: BulkOperationInput, target: BulkOperationTarget): Promise<BulkOperationMutationResult> {
  switch (target.kind) {
    case "background-job":
      return applyBulkBackgroundJobOperation(input, target);
    case "background-run":
      return applyBulkBackgroundRunOperation(input, target);
    case "assistant":
      return applyBulkAssistantOperation(input, target);
    case "project":
      return applyBulkProjectOperation(input, target);
  }
}

export async function applyBulkBackgroundJobOperation(
  input: BulkOperationInput,
  target: Extract<BulkOperationTarget, { kind: "background-job" }>
): Promise<BulkOperationMutationResult> {
  switch (input.payload.action) {
    case "pause":
      input.repository.setBackgroundJobStatus(target.projectId, target.jobId, "paused");
      return { message: "Paused scheduled job.", backgroundJobsChanged: true };
    case "resume":
      input.repository.setBackgroundJobStatus(target.projectId, target.jobId, "enabled");
      return { message: "Resumed scheduled job.", backgroundJobsChanged: true };
    case "delete": {
      requireBackgroundJobForProject(input.repository, target.projectId, target.jobId);
      const committed = await commitBackgroundJobDeletion({ repository: input.repository, runtime: input.runtime,
        backgroundRunControllers: input.backgroundRunControllers, projectId: target.projectId, jobId: target.jobId });
      return { message: "Deleted scheduled job.", backgroundJobsChanged: true,
        notificationsChanged: true, deletedJobIds: committed.deletedJobIds };
    }
    case "run-now": {
      assertGlobalExecutionNotPaused(input.repository);
      const loadedJob = requireBackgroundJobForProject(input.repository, target.projectId, target.jobId);
      const job = input.repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
      if (job.status === "disabled") {
        throw new Error(`Background job ${job.id} is disabled`);
      }
      if (job.assistantId) {
        assertAssistantRunnableForLaunch(input.repository, job.assistantId);
      }
      await repairBackgroundJobRunsForJob(
        input.repository,
        input.connections,
        target.jobId,
        (run) => isBackgroundRunLive(input.backgroundRunControllers, input.runtime, run)
      );
      const activeRun = input.repository.getActiveBackgroundJobRuns(target.jobId)[0];
      if (activeRun) {
        throw new Error(formatActiveBackgroundRunError(activeRun));
      }
      const queuedRun = input.repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: job.assistantId,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "queued",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      });
      input.repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued manually");
      emitBackgroundJobRunUpdatedToAll(input.connections, queuedRun);
      await safeLaunchBackgroundJobRun(
        input.connections,
        input.repository,
        input.runtimeRegistry,
        input.runtime,
        input.backgroundRunControllers,
        input.assistantManager,
        queuedRun.id,
        input.tokenUsageSession
      );
      return { message: `Queued run ${queuedRun.id}.`, backgroundJobsChanged: true };
    }
    default:
      throw new Error(`Bulk action ${input.payload.action} is not available for scheduled jobs.`);
  }
}

export async function applyBulkBackgroundRunOperation(
  input: BulkOperationInput,
  target: Extract<BulkOperationTarget, { kind: "background-run" }>
): Promise<BulkOperationMutationResult> {
  switch (input.payload.action) {
    case "stop": {
      const existingRun = requireBackgroundRunForProject(input.repository, target.projectId, target.runId);
      assertBackgroundRunTransition(existingRun, "stop");
      await stopBackgroundRunsForJob({
        ws: input.ws,
        requestId: input.requestId,
        repository: input.repository,
        runtime: input.runtime,
        connections: input.connections,
        backgroundRunControllers: input.backgroundRunControllers,
        jobId: existingRun.jobId,
        runId: existingRun.id,
        reason: "Stopped by user"
      });
      return { message: "Stopped background run.", backgroundJobsChanged: true, notificationsChanged: true };
    }
    case "retry": {
      assertGlobalExecutionNotPaused(input.repository);
      const existingRun = requireBackgroundRunForProject(input.repository, target.projectId, target.runId);
      assertBackgroundRunTransition(existingRun, "retry");
      const queuedRun = input.repository.createBackgroundJobRun({
        jobId: existingRun.jobId,
        projectId: existingRun.projectId,
        assistantId: existingRun.assistantId,
        automationThreadId: existingRun.automationThreadId,
        triggerSource: "retry",
        status: "queued",
        riskLevel: existingRun.riskLevel,
        approvalStatus: existingRun.approvalStatus === "pending" ? "pending" : "approved"
      });
      input.repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued by retry");
      emitBackgroundJobRunUpdatedToAll(input.connections, queuedRun);
      if (queuedRun.status === "queued") {
        await safeLaunchBackgroundJobRun(
          input.connections,
          input.repository,
          input.runtimeRegistry,
          input.runtime,
          input.backgroundRunControllers,
          input.assistantManager,
          queuedRun.id,
          input.tokenUsageSession
        );
      }
      return { message: `Queued retry ${queuedRun.id}.`, backgroundJobsChanged: true };
    }
    case "approve": {
      assertGlobalExecutionNotPaused(input.repository);
      const existingRun = requireBackgroundRunForProject(input.repository, target.projectId, target.runId);
      assertBackgroundRunTransition(existingRun, "approve");
      const updatedRun = input.repository.setBackgroundJobRunStatus(existingRun.id, "queued", {
        approvalStatus: "approved"
      });
      input.repository.appendBackgroundJobRunEvent(existingRun.id, "queued", "Background run approved");
      archiveNotificationWithLegacyId(input.repository, ["background-run-status", updatedRun.id]);
      emitBackgroundJobRunUpdatedToAll(input.connections, updatedRun);
      await safeLaunchBackgroundJobRun(
        input.connections,
        input.repository,
        input.runtimeRegistry,
        input.runtime,
        input.backgroundRunControllers,
        input.assistantManager,
        updatedRun.id,
        input.tokenUsageSession
      );
      return { message: "Approved background run.", backgroundJobsChanged: true, notificationsChanged: true };
    }
    case "reject": {
      const existingRun = requireBackgroundRunForProject(input.repository, target.projectId, target.runId);
      assertBackgroundRunTransition(existingRun, "reject");
      const updatedRun = input.repository.setBackgroundJobRunStatus(existingRun.id, "cancelled", {
        approvalStatus: "rejected",
        failureMessage: "Rejected before execution",
        failureCategory: "manual-abort"
      });
      input.repository.appendBackgroundJobRunEvent(existingRun.id, "cancelled", "Background run rejected");
      saveBackgroundRunStatusNotification(input.repository, updatedRun);
      emitBackgroundJobRunUpdatedToAll(input.connections, updatedRun);
      return { message: "Rejected background run.", backgroundJobsChanged: true, notificationsChanged: true };
    }
    default:
      throw new Error(`Bulk action ${input.payload.action} is not available for background runs.`);
  }
}

export async function applyBulkAssistantOperation(
  input: BulkOperationInput,
  target: Extract<BulkOperationTarget, { kind: "assistant" }>
): Promise<BulkOperationMutationResult> {
  const assistant = requireAssistantForBulkOperation(input.repository, target.assistantId);
  switch (input.payload.action) {
    case "pause":
      input.repository.setAssistantRunState(assistant.id, "paused");
      return { message: "Paused assistant.", assistantsChanged: true, changedAssistantIds: [assistant.id] };
    case "resume":
      input.repository.setAssistantRunState(assistant.id, "active");
      input.assistantManager.scheduleReprioritize(assistant.id, "manual-resume");
      return { message: "Resumed assistant.", assistantsChanged: true, changedAssistantIds: [assistant.id] };
    case "delete":
      const { deletedJobIds } = await commitAssistantDeletion({ repository: input.repository, runtime: input.runtime,
        backgroundRunControllers: input.backgroundRunControllers, assistantId: assistant.id, afterCommit: () => {
          input.assistantManager.invalidateAssistant(assistant.id);
          discardAssistantChatPumps(assistant.id);
        } });
      return { message: "Deleted assistant.", assistantsChanged: true, backgroundJobsChanged: true,
        notificationsChanged: true, deletedJobIds, deletedAssistantIds: [assistant.id] };
    case "bootstrap-retry":
      assertGlobalExecutionNotPaused(input.repository);
      assertAssistantRunnableForLaunch(input.repository, assistant.id);
      input.assistantManager.queueAssistantBootstrap(assistant.id, {
        force: assistant.bootstrapState !== "running", offerJobBootstrapAfterSuccess: true });
      return { message: "Queued assistant bootstrap retry.", assistantsChanged: true, changedAssistantIds: [assistant.id] };
    default:
      throw new Error(`Bulk action ${input.payload.action} is not available for assistants.`);
  }
}

export async function applyBulkProjectOperation(
  input: BulkOperationInput,
  target: Extract<BulkOperationTarget, { kind: "project" }>
): Promise<BulkOperationMutationResult> {
  if (input.payload.action !== "delete") {
    throw new Error(`Bulk action ${input.payload.action} is not available for projects.`);
  }

  input.runtime.getProject(target.projectId);
  const blockingForegroundRun = findProjectForegroundRunWithStatuses(
    input.repository,
    target.projectId,
    new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"])
  );
  if (input.runtime.hasAnyStreamingThread(target.projectId) || blockingForegroundRun) {
    throw new Error("Project is streaming");
  }

  const { activeProjectId, deletedJobIds, deletedAssistantIds } = await commitProjectDeletion({ repository: input.repository,
    runtime: input.runtime, backgroundRunControllers: input.backgroundRunControllers, projectId: target.projectId,
    afterCommit: (assistantIds) => {
      for (const assistantId of assistantIds) {
        input.assistantManager.invalidateAssistant(assistantId);
        discardAssistantChatPumps(assistantId);
      }
    } });
  emitControlEvent(input.connections, { type: "project.removed", requestId: input.requestId,
    payload: { projectId: target.projectId, activeProjectId } });

  return {
    message: "Removed project.",
    assistantsChanged: true,
    backgroundJobsChanged: true,
    notificationsChanged: true,
    deletedJobIds,
    deletedAssistantIds
  };
}

export function createBulkOperationResult(
  target: BulkOperationTarget,
  action: BulkOperationAction,
  label: string,
  status: BulkOperationItemResult["status"],
  message: string
): BulkOperationItemResult {
  return {
    target,
    status,
    label,
    message: clampBulkOperationMessage(message),
    destructive: isBulkOperationDestructive(action),
    live: isBulkOperationLive(action)
  };
}

export function createBulkOperationErrorResult(
  repository: WorkspaceRepository,
  action: BulkOperationAction,
  target: BulkOperationTarget,
  apply: boolean,
  error: unknown
): BulkOperationItemResult {
  return createBulkOperationResult(
    target,
    action,
    getBulkOperationTargetLabel(repository, target),
    apply ? "failed" : "blocked",
    formatUnknownErrorMessage(error)
  );
}

export function getBulkOperationTargetLabel(repository: WorkspaceRepository, target: BulkOperationTarget) {
  switch (target.kind) {
    case "background-job":
      return repository.getBackgroundJob(target.jobId)?.name ?? target.jobId;
    case "background-run": {
      const run = repository.getBackgroundJobRun(target.runId);
      const job = run ? repository.getBackgroundJob(run.jobId) : undefined;
      return job ? `${job.name} run ${target.runId}` : target.runId;
    }
    case "assistant":
      return repository.getAssistant(target.assistantId, true)?.name ?? target.assistantId;
    case "project":
      return repository.loadWorkspace().projects.find((project) => project.id === target.projectId)?.name ?? target.projectId;
  }
}

export function requireAssistantForBulkOperation(repository: WorkspaceRepository, assistantId: string) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant || assistant.deletedAt) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  return assistant;
}

export function isBulkOperationDestructive(action: BulkOperationAction) {
  return action === "delete" || action === "reject" || action === "stop";
}

export function isBulkOperationLive(action: BulkOperationAction) {
  return action === "run-now" || action === "retry" || action === "approve" || action === "stop" || action === "bootstrap-retry";
}

export function clampBulkOperationMessage(message: string) {
  return message.length <= 512 ? message : `${message.slice(0, 509)}...`;
}
