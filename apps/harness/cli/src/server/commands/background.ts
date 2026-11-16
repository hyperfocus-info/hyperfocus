import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import { assertBackgroundRunTransition, requireBackgroundJobForProject, requireBackgroundRunForProject } from "../../background-job-command-guards";
import { previewBackgroundJobSchedule } from "../../background-job-schedule";
import { assertAssistantOwnsProjectOrGlobal } from "../automation/assistant-actions";
import { isBackgroundRunLive, repairBackgroundJobRunsForJob, safeLaunchBackgroundJobRun } from "../automation/background-runs";
import { commitBackgroundJobDeletion, formatActiveBackgroundRunError, stopBackgroundRunsForJob } from "../automation/background-run-cancellation";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsDeletedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import { executeBulkOperation } from "../automation/bulk-operations";
import type { ServerCommandContext } from "./context";
import { sendEvent } from "../transport/events";
import { fitBoundedPage } from "../transport/bounded-page";
import { SERVER_EVENT_EMIT_MAX_BYTES } from "@hyperfocus/ai-core/protocol";
import { archiveNotificationWithLegacyId, saveBackgroundRunStatusNotification } from "../automation/notifications";
import { computeBackgroundJobRiskLevel, resolveBackgroundJobNextRunAt } from "../workspace/preferences";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

type BackgroundCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "assistantManager" | "connections" | "backgroundRunControllers" | "scheduler" | "tokenUsageSession">;

const BACKGROUND_PRIMARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["background-jobs.page.list", "background-job.source.open", "background-job.save", "background-job.delete", "background-job.pause", "background-job.pause-assistant-jobs", "background-job.resume", "background-job.run-now", "background-job.scheduler.retry"]);

export async function handleBackgroundCommand(command: ClientCommand, context: BackgroundCommandContext) {
  return BACKGROUND_PRIMARY_TYPES.has(command.type)
    ? handleBackgroundPrimary(command, context)
    : handleBackgroundSecondary(command, context);
}

async function handleBackgroundPrimary(command: ClientCommand, context: BackgroundCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, assistantManager, connections, backgroundRunControllers, scheduler, tokenUsageSession } = context;
  switch (command.type) {
case "background-jobs.page.list": {
      const collections = [command.payload.jobs && "jobs", command.payload.runs && "runs"].filter(
        (item): item is "jobs" | "runs" => !!item);
      const budget = Math.floor((SERVER_EVENT_EMIT_MAX_BYTES - 16384) / collections.length);
      const jobs = command.payload.jobs ? fitBoundedPage((limit) => repository.listBackgroundJobsPage(
        command.payload.jobs!.cursor, limit), command.payload.jobs.limit ?? 128, (page) => ({ jobs: page }), budget) : undefined;
      const runs = command.payload.runs ? fitBoundedPage((limit) => repository.listBackgroundJobRunsPage(
        command.payload.runs!.cursor, limit), command.payload.runs.limit ?? 128, (page) => ({ runs: page }), budget) : undefined;
      sendEvent(ws, { type: "background-jobs.page.listed", requestId: command.requestId,
        payload: { collections, jobs, runs } });
      return;
    }
case "background-job.source.open": {
      const run = command.payload.kind === "run"
        ? requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId)
        : undefined;
      const job = requireBackgroundJobForProject(
        repository,
        command.payload.projectId,
        command.payload.kind === "job" ? command.payload.jobId : run!.jobId
      );
      sendEvent(ws, {
        type: "background-job.source.loaded",
        requestId: command.requestId,
        payload: run ? { kind: "run", job, run } : { kind: "job", job }
      });
      return;
    }
case "background-job.save": {
      const existingJob = repository.getBackgroundJob(command.payload.job.id);
      if (existingJob && existingJob.projectId !== command.payload.job.projectId) {
        throw new Error("Background job cannot move projects");
      }
      const project = runtime.getProject(command.payload.job.projectId);
      if (command.payload.job.assistantId) {
        assertAssistantOwnsProjectOrGlobal(repository, command.payload.job.assistantId, command.payload.job.projectId);
      }
      const riskLevel = computeBackgroundJobRiskLevel(command.payload.job, project, runtime);
      repository.saveBackgroundJob({
        ...command.payload.job,
        riskLevel,
        nextRunAt: resolveBackgroundJobNextRunAt(command.payload.job.schedule),
        updatedAt: new Date().toISOString()
      });
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState(), command.requestId);
      return;
    }
case "background-job.delete": {
      requireBackgroundJobForProject(repository, command.payload.projectId, command.payload.jobId);
      const committed = await commitBackgroundJobDeletion({ repository, runtime, backgroundRunControllers,
        projectId: command.payload.projectId, jobId: command.payload.jobId });
      emitBackgroundJobsDeletedToAll(connections, command.requestId,
        [{ kind: "background-job", jobId: command.payload.jobId }], committed.deletedJobIds);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "background-job.pause": {
      const savedState = repository.setBackgroundJobStatus(command.payload.projectId, command.payload.jobId, "paused");
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
case "background-job.pause-assistant-jobs": {
      const savedState = repository.pauseAllAssistantBackgroundJobs();
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
case "background-job.resume": {
      const savedState = repository.setBackgroundJobStatus(command.payload.projectId, command.payload.jobId, "enabled");
      emitBackgroundJobsUpdatedToAll(connections, savedState);
      return;
    }
case "background-job.run-now": {
      assertGlobalExecutionNotPaused(repository);
      const loadedJob = requireBackgroundJobForProject(repository, command.payload.projectId, command.payload.jobId);
      const job = repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
      if (job.status === "disabled") {
        throw new Error(`Background job ${job.id} is disabled`);
      }
      if (job.assistantId) {
        assertAssistantRunnableForLaunch(repository, job.assistantId);
      }
      await repairBackgroundJobRunsForJob(
        repository,
        connections,
        command.payload.jobId,
        (run) => isBackgroundRunLive(backgroundRunControllers, runtime, run)
      );
      const activeRun = repository.getActiveBackgroundJobRuns(command.payload.jobId)[0];
      if (activeRun) {
        throw new Error(formatActiveBackgroundRunError(activeRun));
      }
      const queuedRun = repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: job.assistantId,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "queued",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued manually");
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      await safeLaunchBackgroundJobRun(
        connections,
        repository,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        queuedRun.id,
        tokenUsageSession
      );
      return;
    }
case "background-job.scheduler.retry": {
      await scheduler.retry();
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
default:
      throw new Error(`Unsupported background command: ${command.type}`);
  }
}

async function handleBackgroundSecondary(command: ClientCommand, context: BackgroundCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, assistantManager, connections, backgroundRunControllers, tokenUsageSession } = context;
  switch (command.type) {
case "background-job.stop-run": {
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "stop");
      await stopBackgroundRunsForJob({
        ws,
        requestId: command.requestId,
        repository,
        runtime,
        connections,
        backgroundRunControllers,
        jobId: existingRun.jobId,
        runId: existingRun.id,
        reason: "Stopped by user"
      });
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "background-job.retry-run": {
      assertGlobalExecutionNotPaused(repository);
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "retry");
      const queuedRun = repository.createBackgroundJobRun({
        jobId: existingRun.jobId,
        projectId: existingRun.projectId,
        assistantId: existingRun.assistantId,
        automationThreadId: existingRun.automationThreadId,
        triggerSource: "retry",
        status: "queued",
        riskLevel: existingRun.riskLevel,
        approvalStatus: existingRun.approvalStatus === "pending" ? "pending" : "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Background run queued by retry");
      emitBackgroundJobRunUpdatedToAll(connections, queuedRun);
      if (queuedRun.status === "queued") {
        await safeLaunchBackgroundJobRun(
          connections,
          repository,
          runtimeRegistry,
          runtime,
          backgroundRunControllers,
          assistantManager,
          queuedRun.id,
          tokenUsageSession
        );
      }
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      return;
    }
case "background-job.approve-run": {
      assertGlobalExecutionNotPaused(repository);
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "approve");
      const updatedRun = repository.setBackgroundJobRunStatus(existingRun.id, "queued", {
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(existingRun.id, "queued", "Background run approved");
      archiveNotificationWithLegacyId(repository, ["background-run-status", updatedRun.id]);
      emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      await safeLaunchBackgroundJobRun(
        connections,
        repository,
        runtimeRegistry,
        runtime,
        backgroundRunControllers,
        assistantManager,
        updatedRun.id,
        tokenUsageSession
      );
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "background-job.reject-run": {
      const existingRun = requireBackgroundRunForProject(repository, command.payload.projectId, command.payload.runId);
      assertBackgroundRunTransition(existingRun, "reject");
      const updatedRun = repository.setBackgroundJobRunStatus(existingRun.id, "cancelled", {
        approvalStatus: "rejected",
        failureMessage: "Rejected before execution",
        failureCategory: "manual-abort"
      });
      repository.appendBackgroundJobRunEvent(existingRun.id, "cancelled", "Background run rejected");
      saveBackgroundRunStatusNotification(repository, updatedRun);
      emitBackgroundJobRunUpdatedToAll(connections, updatedRun);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "background-job.schedule.preview": {
      sendEvent(ws, {
        type: "background-job-schedule.preview",
        requestId: command.requestId,
        payload: previewBackgroundJobSchedule(command.payload.input, command.payload.timezone)
      });
      return;
    }
case "bulk-operation.preview": {
      const result = await executeBulkOperation({
        apply: false,
        payload: command.payload,
        requestId: command.requestId,
        ws,
        repository,
        runtime,
        runtimeRegistry,
        connections,
        backgroundRunControllers,
        assistantManager,
        tokenUsageSession
      });
      sendEvent(ws, {
        type: "bulk-operation.previewed",
        requestId: command.requestId,
        payload: result
      });
      return;
    }
case "bulk-operation.apply": {
      const result = await executeBulkOperation({
        apply: true,
        payload: command.payload,
        requestId: command.requestId,
        ws,
        repository,
        runtime,
        runtimeRegistry,
        connections,
        backgroundRunControllers,
        assistantManager,
        tokenUsageSession
      });
      sendEvent(ws, {
        type: "bulk-operation.applied",
        requestId: command.requestId,
        payload: result
      });
      return;
    }
    default:
      throw new Error(`Unsupported background command: ${command.type}`);
  }
}
