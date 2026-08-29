import type { BackgroundJobRun, BackgroundJobRunStatus, BackgroundJobSchedule, NotificationInboxItem, NotificationInboxState, ProjectId, RunFailureCategory, RunPromptStats } from "@hyperfocus/ai-core/protocol";
import type { BackgroundJobRunRow, NotificationRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceBackgroundOperations4Set, WorkspaceBackgroundOperations5Set, WorkspaceBackgroundOperations6Set } from "./background-1";
import type { WorkspaceBackgroundReadsOperations2Set, WorkspaceBackgroundReadsOperationsSet } from "./background-reads";
import type { WorkspaceMemoryOperations4Set } from "./memory";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceRepository } from "../../../workspace-repository";
import type { WorkspaceRunsOperations7Set } from "./runs-1";
import { NOTIFICATION_REVISION_KEY } from "../contracts";
import { classifyRunFailure } from "../../../run-failure-classification";
import { createBackgroundJobRunId, isTerminalAgentRunStatus, notificationInboxStateSchema } from "@hyperfocus/ai-core/protocol";
import { formatBackgroundRunTimeoutDetail, getBackgroundRunAgeMs, getBackgroundRunLastProgressAgeMs, hasBackgroundRunActiveLeaseGrace, isTerminalBackgroundJobRunEventStage, isTerminalBackgroundJobRunStatus, mapAgentRunStatusToBackgroundRunStatus } from "../models";
import { isBackgroundRunPastLeaseGrace } from "../../../background-run-leases";
import { readTimestampPage } from "../../presentation-pagination";
import { saveNotificationRaw } from "../../notification-persistence";
import { stripAnsiForStorage } from "../../../ansi-storage";

export function createWorkspaceBackgroundOperations7(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperationsSet & WorkspaceBackgroundOperations5Set & WorkspaceBackgroundOperations6Set) {
  const { db } = context;
  function getActiveBackgroundJobRunsByAssistant(assistantId: string) {
      return db
        .query<BackgroundJobRunRow, [string]>(
          `SELECT
            id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
            skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
            prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            agent_id, provider_brand, planning_model_id, execution_model_id, reasoning_strength, fast_mode,
            controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
            last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
            completed_at, created_at, updated_at
           FROM background_job_runs
           WHERE assistant_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
           ORDER BY updated_at DESC, created_at DESC`
        )
        .all(assistantId)
        .map((row) => operations.hydrateBackgroundJobRun(row))
        .filter((run): run is BackgroundJobRun => run !== undefined);
    }
  function createBackgroundJobRun(
      input: Pick<
        BackgroundJobRun,
        "jobId" | "projectId" | "assistantId" | "automationThreadId" | "triggerSource" | "status" | "riskLevel" | "approvalStatus"
      > & {
        skippedOccurrenceCount?: number;
        summary?: string;
      }
    ) {
      const job = operations.repairBackgroundJobReferences(input.jobId);
      if (!job || job.status === "disabled") {
        throw new Error(`Background job ${input.jobId} cannot be queued`);
      }
      const now = new Date().toISOString();
      const runId = createBackgroundJobRunId();
      db
        .query(
          `INSERT INTO background_job_runs (
            id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
            skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
            prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            agent_id, provider_brand, planning_model_id, execution_model_id, reasoning_strength, fast_mode,
            controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
            last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at, completed_at, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?12, 'queued', NULL, NULL, ?12, NULL, NULL, ?12, ?12)`
        )
        .run(
          runId,
          input.jobId,
          job.projectId,
          job.assistantId ?? null,
          job.automationThreadId,
          input.triggerSource,
          input.status,
          input.riskLevel,
          input.approvalStatus,
          input.skippedOccurrenceCount ?? 0,
          input.summary ?? null,
          now
        );
      db
        .query(`UPDATE background_jobs SET last_enqueued_at = ?2, updated_at = ?2 WHERE id = ?1`)
        .run(input.jobId, now);
      return operations.getBackgroundJobRun(runId)!;
    }
  function appendBackgroundJobRunEvent(runId: string, stage: string, message: string, detail?: string) {
      const now = new Date().toISOString();
      const currentRun = operations.getBackgroundJobRun(runId);
      if (currentRun && isTerminalBackgroundJobRunStatus(currentRun.status) && !isTerminalBackgroundJobRunEventStage(stage)) {
        return currentRun;
      }
      const ordinal =
        (db
          .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM background_job_run_events WHERE run_id = ?1`)
          .get(runId)?.count ?? 0) + 1;
      const persistedStage = stripAnsiForStorage(stage);
      const persistedMessage = stripAnsiForStorage(message);
      const persistedDetail = detail === undefined ? undefined : stripAnsiForStorage(detail);
      db
        .query(
          `INSERT INTO background_job_run_events (id, run_id, ordinal, stage, message, detail_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .run(crypto.randomUUID(), runId, ordinal, persistedStage, persistedMessage, persistedDetail ?? null, now);
      db
        .query(
          `UPDATE background_job_runs
           SET last_heartbeat_at = ?2,
               heartbeat_stage = ?3,
               heartbeat_detail = ?4,
               updated_at = ?2
           WHERE id = ?1
             AND completed_at IS NULL
             AND status NOT IN ('succeeded', 'partial-complete', 'failed', 'cancelled', 'skipped')`
        )
        .run(runId, now, persistedStage, (persistedDetail ?? persistedMessage).slice(0, 1024));
      return operations.getBackgroundJobRun(runId)!;
    }
  function touchBackgroundJobRun(runId: string, input: { stage: string; detail?: string; now?: Date }) {
      const now = (input.now ?? new Date()).toISOString();
      const persistedStage = stripAnsiForStorage(input.stage);
      const persistedDetail = input.detail === undefined ? undefined : stripAnsiForStorage(input.detail);
      db
        .query(
          `UPDATE background_job_runs
           SET last_heartbeat_at = ?2,
               heartbeat_stage = ?3,
               heartbeat_detail = ?4,
               updated_at = ?2
           WHERE id = ?1
             AND completed_at IS NULL
             AND status NOT IN ('succeeded', 'partial-complete', 'failed', 'cancelled', 'skipped')`
        )
        .run(runId, now, persistedStage, persistedDetail === undefined ? null : persistedDetail.slice(0, 1024));
      return operations.getBackgroundJobRun(runId);
    }
  function renewBackgroundJobRunLease(runId: string, controllerLeaseId: string, expiresAt: string) {
      db
        .query(
          `UPDATE background_job_runs
           SET controller_lease_expires_at = ?3
           WHERE id = ?1
             AND status = 'running'
             AND controller_lease_id = ?2`
        )
        .run(runId, controllerLeaseId, expiresAt);
      return operations.getBackgroundJobRun(runId);
    }
  function isBackgroundRunOwnedBy(runId: string, controllerLeaseId: string) {
      const run = operations.getBackgroundJobRun(runId);
      return Boolean(run && run.status === "running" && run.controllerLeaseId === controllerLeaseId);
    }
  function appendBackgroundJobRunEventIfOwned(runId: string, controllerLeaseId: string, stage: string, message: string, detail?: string) {
      if (!isBackgroundRunOwnedBy(runId, controllerLeaseId)) {
        return undefined;
      }
      return appendBackgroundJobRunEvent(runId, stage, message, detail);
    }
  function touchBackgroundJobRunIfOwned(runId: string, controllerLeaseId: string, input: { stage: string; detail?: string; now?: Date }) {
      if (!isBackgroundRunOwnedBy(runId, controllerLeaseId)) {
        return undefined;
      }
      return touchBackgroundJobRun(runId, input);
    }
  return {
    operations: {
      getActiveBackgroundJobRunsByAssistant,
      createBackgroundJobRun,
      appendBackgroundJobRunEvent,
      touchBackgroundJobRun,
      renewBackgroundJobRunLease,
      isBackgroundRunOwnedBy,
      appendBackgroundJobRunEventIfOwned,
      touchBackgroundJobRunIfOwned,
    },
    publicApi: {
      getActiveBackgroundJobRunsByAssistant,
      createBackgroundJobRun,
      appendBackgroundJobRunEvent,
      touchBackgroundJobRun,
      renewBackgroundJobRunLease,
      isBackgroundRunOwnedBy,
      appendBackgroundJobRunEventIfOwned,
      touchBackgroundJobRunIfOwned,
    },
  };
}

export type WorkspaceBackgroundOperations7Set = ReturnType<typeof createWorkspaceBackgroundOperations7>["operations"];

export function createWorkspaceBackgroundOperations8(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundOperations4Set & WorkspaceBackgroundOperations6Set & WorkspaceBackgroundOperations7Set) {
  const { db } = context;
  function setBackgroundJobRunStatus(
      runId: string,
      status: BackgroundJobRunStatus,
      input: {
        summary?: string;
        failureMessage?: string;
        failureCategory?: RunFailureCategory;
        linkedAgentRunId?: string;
        approvalStatus?: BackgroundJobRun["approvalStatus"];
        timedOutAt?: string;
        controllerInstanceId?: string | null;
        controllerLeaseId?: string | null;
        controllerLeaseExpiresAt?: string | null;
        resumeAttemptCount?: number;
        allowTerminalRewrite?: boolean;
      } = {}
    ) {
      const now = new Date().toISOString();
      const currentRun = operations.getBackgroundJobRun(runId);
      if (
        currentRun &&
        isTerminalBackgroundJobRunStatus(currentRun.status) &&
        (!input.allowTerminalRewrite || !isTerminalBackgroundJobRunStatus(status))
      ) {
        return currentRun;
      }
      db
        .query(
          `UPDATE background_job_runs
           SET status = ?2,
               summary = COALESCE(?3, summary),
               failure_message = ?4,
               failure_category = ?5,
               linked_agent_run_id = COALESCE(?6, linked_agent_run_id),
               approval_status = COALESCE(?7, approval_status),
               started_at = CASE WHEN ?2 = 'running' AND started_at IS NULL THEN ?8 ELSE started_at END,
               completed_at = CASE WHEN ?2 IN ('succeeded', 'partial-complete', 'failed', 'cancelled', 'skipped') THEN ?8 ELSE completed_at END,
               last_heartbeat_at = ?8,
               heartbeat_stage = ?2,
               heartbeat_detail = COALESCE(?9, ?3, heartbeat_detail),
               timed_out_at = COALESCE(timed_out_at, ?10),
               controller_instance_id = COALESCE(?11, controller_instance_id),
               controller_lease_id = COALESCE(?12, controller_lease_id),
               controller_lease_expires_at = CASE WHEN ?13 = 1 THEN ?14 ELSE controller_lease_expires_at END,
               resume_attempt_count = COALESCE(?15, resume_attempt_count),
               updated_at = ?8
           WHERE id = ?1`
        )
        .run(
          runId,
          status,
          input.summary ?? null,
          input.failureMessage ?? null,
          input.failureCategory ?? null,
          input.linkedAgentRunId ?? null,
          input.approvalStatus ?? null,
          now,
          input.failureMessage ?? null,
          input.timedOutAt ?? null,
          input.controllerInstanceId ?? null,
          input.controllerLeaseId ?? null,
          input.controllerLeaseExpiresAt !== undefined ? 1 : 0,
          input.controllerLeaseExpiresAt ?? null,
          input.resumeAttemptCount ?? null
        );
      return operations.getBackgroundJobRun(runId)!;
    }
  function setBackgroundJobRunStatusIfOwned(
      runId: string,
      controllerLeaseId: string,
      status: BackgroundJobRunStatus,
      input: Parameters<WorkspaceRepository["setBackgroundJobRunStatus"]>[2] = {}
    ) {
      if (!operations.isBackgroundRunOwnedBy(runId, controllerLeaseId)) {
        return undefined;
      }
      return setBackgroundJobRunStatus(runId, status, input);
    }
  function setBackgroundJobRunLaunchDiagnostics(
      runId: string,
      input: Pick<
        BackgroundJobRun,
        "agentId" | "providerBrand" | "planningModelId" | "executionModelId" | "reasoningStrength" | "fastMode"
      >
    ) {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE background_job_runs
           SET agent_id = ?2,
               provider_brand = ?3,
               planning_model_id = ?4,
               execution_model_id = ?5,
               reasoning_strength = ?6,
               fast_mode = ?7,
               updated_at = ?8
           WHERE id = ?1`
        )
        .run(
          runId,
          input.agentId ?? null,
          input.providerBrand ?? null,
          input.planningModelId ?? null,
          input.executionModelId ?? null,
          input.reasoningStrength ?? null,
          input.fastMode === undefined ? null : input.fastMode ? 1 : 0,
          now
        );
      return operations.getBackgroundJobRun(runId)!;
    }
  function setBackgroundJobRunPromptStats(runId: string, promptStats: RunPromptStats) {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE background_job_runs
           SET prompt_chars = ?2,
               prompt_hash = ?3,
               transcript_chars = ?4,
               latest_task_chars = ?5,
               updated_at = ?6
           WHERE id = ?1`
        )
        .run(
          runId,
          promptStats.promptChars,
          promptStats.promptHash,
          promptStats.transcriptChars ?? null,
          promptStats.latestTaskChars ?? null,
          now
        );
      return operations.getBackgroundJobRun(runId)!;
    }
  function updateBackgroundJobSchedule(
      jobId: string,
      input: { schedule?: BackgroundJobSchedule; nextRunAt?: string; lastRunAt?: string }
    ) {
      const now = new Date().toISOString();
      const serializedSchedule = input.schedule ? JSON.stringify(input.schedule) : null;
      const shouldUpdateNextRunAt = Object.hasOwn(input, "nextRunAt");
      db
        .query(
          `UPDATE background_jobs
           SET schedule_json = CASE WHEN ?2 IS NULL THEN schedule_json ELSE ?2 END,
               next_run_at = CASE WHEN ?3 = 0 THEN next_run_at ELSE ?4 END,
               last_run_at = COALESCE(?5, last_run_at),
               updated_at = ?6
           WHERE id = ?1`
        )
        .run(jobId, serializedSchedule, shouldUpdateNextRunAt ? 1 : 0, input.nextRunAt ?? null, input.lastRunAt ?? null, now);
      return operations.getBackgroundJob(jobId)!;
    }
  return {
    operations: {
      setBackgroundJobRunStatus,
      setBackgroundJobRunStatusIfOwned,
      setBackgroundJobRunLaunchDiagnostics,
      setBackgroundJobRunPromptStats,
      updateBackgroundJobSchedule,
    },
    publicApi: {
      setBackgroundJobRunStatus,
      setBackgroundJobRunStatusIfOwned,
      setBackgroundJobRunLaunchDiagnostics,
      setBackgroundJobRunPromptStats,
      updateBackgroundJobSchedule,
    },
  };
}

export type WorkspaceBackgroundOperations8Set = ReturnType<typeof createWorkspaceBackgroundOperations8>["operations"];

export function createWorkspaceBackgroundOperations9(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet & WorkspaceBackgroundReadsOperations2Set) {
  const { db } = context;
  function listNotificationInboxItemsPage(cursor?: string, limit = 512) {
      const page = readTimestampPage<NotificationRow>({ db: db, kind: "notifications", cursor, limit, select:
        `SELECT id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id, session_id, tool_call_id,
          background_run_id, job_id, payload_json, created_at, read_at, archived_at FROM notifications`, scope: "archived_at IS NULL",
        revisionTimestamp: "MAX(created_at, COALESCE(read_at, ''))", revisionSalt: operations.getWorkspaceMetaValue(NOTIFICATION_REVISION_KEY) });
      return { items: page.rows.map((row) => operations.hydrateNotification(row)).filter((item): item is NotificationInboxItem => !!item),
        nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  function loadNotificationInboxState(limit = 4096): NotificationInboxState {
      const page = listNotificationInboxItemsPage(undefined, limit); const items = page.items;
      const counts = db.query<{ unread: number; interactive: number; passive: number }, []>(`SELECT COUNT(*) AS unread,
        COALESCE(SUM(interactive), 0) AS interactive, COALESCE(SUM(1 - interactive), 0) AS passive
        FROM notifications WHERE read_at IS NULL AND archived_at IS NULL`).get() ?? { unread: 0, interactive: 0, passive: 0 };
      return notificationInboxStateSchema.parse({
        items, itemsNextCursor: page.nextCursor,
        unreadCount: counts.unread, interactiveUnreadCount: counts.interactive, passiveUnreadCount: counts.passive
      });
    }
  function saveNotification(item: NotificationInboxItem) {
      saveNotificationRaw(db, item);
      return loadNotificationInboxState();
    }
  function markNotificationRead(notificationId: string, archive: boolean = false) {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE notifications
           SET read_at = COALESCE(read_at, ?2),
               archived_at = CASE WHEN ?3 = 1 THEN COALESCE(archived_at, ?2) ELSE archived_at END
           WHERE id = ?1`
        )
        .run(notificationId, now, archive ? 1 : 0);
      return loadNotificationInboxState();
    }
  function archiveNotification(notificationId: string) {
      const now = new Date().toISOString();
      db
        .query(`UPDATE notifications SET read_at = COALESCE(read_at, ?2), archived_at = COALESCE(archived_at, ?2) WHERE id = ?1`)
        .run(notificationId, now);
      return loadNotificationInboxState();
    }
  function markAllPassiveNotificationsRead() {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE notifications
           SET read_at = COALESCE(read_at, ?1),
               archived_at = COALESCE(archived_at, ?1)
           WHERE interactive = 0 AND read_at IS NULL AND archived_at IS NULL`
        )
        .run(now);
      return loadNotificationInboxState();
    }
  return {
    operations: {
      listNotificationInboxItemsPage,
      loadNotificationInboxState,
      saveNotification,
      markNotificationRead,
      archiveNotification,
      markAllPassiveNotificationsRead,
    },
    publicApi: {
      listNotificationInboxItemsPage,
      loadNotificationInboxState,
      saveNotification,
      markNotificationRead,
      archiveNotification,
      markAllPassiveNotificationsRead,
    },
  };
}

export type WorkspaceBackgroundOperations9Set = ReturnType<typeof createWorkspaceBackgroundOperations9>["operations"];

export function createWorkspaceBackgroundOperations10(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundOperations6Set & WorkspaceBackgroundOperations7Set & WorkspaceBackgroundOperations8Set & WorkspaceMemoryOperations4Set & WorkspaceRunsOperations7Set) {
  function failLinkedAgentRunIfActive(
      projectId: ProjectId,
      runId: string | undefined,
      failureMessage: string,
      failureCategory: RunFailureCategory
    ) {
      if (!runId) {
        return;
      }
      const linkedRun = operations.getRun(projectId, runId);
      if (!linkedRun || isTerminalAgentRunStatus(linkedRun.status)) {
        return;
      }
      operations.setAgentRunStatus(projectId, runId, "failed", failureMessage, failureCategory);
    }
  function repairInterruptedBackgroundJobRuns(
      options: {
        jobId?: string;
        isRunLive?: (run: BackgroundJobRun) => boolean;
        now?: Date;
        readyGraceMs?: number;
        maxRunMs?: number;
        noProgressMs?: number;
      } = {}
    ) {
      const now = options.now ?? new Date();
      const readyGraceMs = options.readyGraceMs ?? 2 * 60 * 1000;
      const maxRunMs = options.maxRunMs ?? 30 * 60 * 1000;
      const noProgressMs = options.noProgressMs ?? 10 * 60 * 1000;
      const repairedRuns: BackgroundJobRun[] = [];
      for (const run of operations.getActiveBackgroundJobRuns(options.jobId)) {
        const runLive = options.isRunLive?.(run) ?? false;
        const leaseGraceActive = run.status === "running" && hasBackgroundRunActiveLeaseGrace(run, now, readyGraceMs);
        if (run.linkedAgentRunId) {
          const linkedRun = operations.getRun(run.projectId, run.linkedAgentRunId);
          const terminalStatus = linkedRun ? mapAgentRunStatusToBackgroundRunStatus(linkedRun.status) : undefined;
          if (terminalStatus) {
            const failureMessage =
              terminalStatus === "succeeded" || terminalStatus === "partial-complete"
                ? undefined
                : linkedRun?.failureMessage ?? `Linked agent run ended with status ${linkedRun?.status ?? "missing"}`;
            const repairedRun = operations.setBackgroundJobRunStatus(run.id, terminalStatus, {
              summary: linkedRun?.summary,
              failureMessage,
              failureCategory:
                terminalStatus === "failed"
                  ? classifyRunFailure({
                      explicitCategory: linkedRun?.failureCategory,
                      message: failureMessage
                    })
                  : undefined
            });
            operations.appendBackgroundJobRunEvent(
              run.id,
              terminalStatus === "succeeded" ? "done" : terminalStatus,
              "Reconciled linked agent run",
              failureMessage ?? linkedRun?.summary
            );
            repairedRuns.push(operations.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
            continue;
          }
          if (
            linkedRun?.status === "ready" &&
            options.isRunLive &&
            !runLive &&
            !leaseGraceActive &&
            isBackgroundRunPastLeaseGrace(run, now, readyGraceMs)
          ) {
            const failureMessage = "Linked agent run was ready but no background controller resumed execution";
            failLinkedAgentRunIfActive(run.projectId, run.linkedAgentRunId, failureMessage, "controller-lost");
            const repairedRun = operations.setBackgroundJobRunStatus(run.id, "failed", {
              summary: linkedRun.summary,
              failureMessage,
              failureCategory: "controller-lost"
            });
            operations.appendBackgroundJobRunEvent(run.id, "failed", "Background run repaired: no live controller", failureMessage);
            repairedRuns.push(operations.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
            continue;
          }
        }
  
        if (
          run.status === "running" &&
          options.isRunLive &&
          !runLive &&
          !leaseGraceActive &&
          isBackgroundRunPastLeaseGrace(run, now, readyGraceMs)
        ) {
          failLinkedAgentRunIfActive(
            run.projectId,
            run.linkedAgentRunId,
            "Background run interrupted before completion",
            "controller-lost"
          );
          const repairedRun = operations.setBackgroundJobRunStatus(run.id, "failed", {
            failureMessage: "Background run interrupted before completion",
            failureCategory: "controller-lost"
          });
          operations.appendBackgroundJobRunEvent(
            run.id,
            "failed",
            "Background run repaired: no live controller",
            "No live background controller owns this running row."
          );
          repairedRuns.push(operations.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
          continue;
        }
  
        if (run.status === "running" && (runLive || !leaseGraceActive) && getBackgroundRunAgeMs(run, now) >= maxRunMs) {
          const detail = formatBackgroundRunTimeoutDetail(run, now, "max runtime");
          failLinkedAgentRunIfActive(
            run.projectId,
            run.linkedAgentRunId,
            "Timed out: background run exceeded max runtime",
            "max-runtime-timeout"
          );
          const repairedRun = operations.setBackgroundJobRunStatus(run.id, "failed", {
            failureMessage: "Timed out: background run exceeded max runtime",
            failureCategory: "max-runtime-timeout",
            timedOutAt: now.toISOString()
          });
          operations.appendBackgroundJobRunEvent(run.id, "failed", "Background run timed out", detail);
          repairedRuns.push(operations.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
          continue;
        }
  
        if (run.status === "running" && (runLive || !leaseGraceActive) && getBackgroundRunLastProgressAgeMs(run, now) >= noProgressMs) {
          const detail = formatBackgroundRunTimeoutDetail(run, now, "no progress heartbeat");
          failLinkedAgentRunIfActive(
            run.projectId,
            run.linkedAgentRunId,
            "Timed out: no background progress heartbeat",
            "heartbeat-timeout"
          );
          const repairedRun = operations.setBackgroundJobRunStatus(run.id, "failed", {
            failureMessage: "Timed out: no background progress heartbeat",
            failureCategory: "heartbeat-timeout",
            timedOutAt: now.toISOString()
          });
          operations.appendBackgroundJobRunEvent(run.id, "failed", "Background run timed out", detail);
          repairedRuns.push(operations.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
        }
      }
      return repairedRuns;
    }
  function repairStaleRunningBackgroundJobRuns(
      options: {
        jobId?: string;
        isRunLive?: (run: BackgroundJobRun) => boolean;
        now?: Date;
        readyGraceMs?: number;
        maxRunMs?: number;
        noProgressMs?: number;
      } = {}
    ) {
      return repairInterruptedBackgroundJobRuns(options);
    }
  return {
    operations: {
      failLinkedAgentRunIfActive,
      repairInterruptedBackgroundJobRuns,
      repairStaleRunningBackgroundJobRuns,
    },
    publicApi: {
      repairInterruptedBackgroundJobRuns,
      repairStaleRunningBackgroundJobRuns,
    },
  };
}

export type WorkspaceBackgroundOperations10Set = ReturnType<typeof createWorkspaceBackgroundOperations10>["operations"];
