import * as assistantPagination from "../../../assistant-pagination";
import type { BackgroundJob, BackgroundJobRun, BackgroundJobSchedulerStatus, BackgroundJobsState, NotificationInboxItem, ProjectId, RunDiagnosticsWindowDays, RunFailureCategory, ThreadId } from "@hyperfocus/ai-core/protocol";
import type { BackgroundJobRow, BackgroundJobRunRow, RunDiagnosticsQueryReport, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceBackgroundReadsOperationsSet } from "./background-reads";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_KEY, ASSISTANT_MAX_CONGESTION_DEFAULT_KEY, BACKGROUND_SCHEDULER_HEARTBEAT_KEY, MAX_BACKGROUND_JOBS_DEFAULT_KEY } from "../contracts";
import { backgroundJobsStateSchema } from "@hyperfocus/ai-core/protocol";
import { classifyRunFailure } from "../../../run-failure-classification";
import { compileBackgroundJobIntentContract } from "@hyperfocus/ai-core/intent-contract";
import { deleteBackgroundJobAtomically } from "../../workspace-deletion";
import { markEnabledBackgroundJobSchedulersStale, readRawIdPage } from "../../assistant-runtime-atomicity";
import { normalizeInteger, normalizeOptionalString, normalizeRequiredString } from "../persisted-values";
import { parseBrowserSessions, resolveBackgroundBackoffUntil } from "../models";
import { promoteNextDeferredBrowserApproval } from "../../../browser-session-state";
import { readTimestampPage } from "../../presentation-pagination";
import { saveNotificationRaw } from "../../notification-persistence";

export function createWorkspaceBackgroundOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function getRunDiagnosticsReport(windowDays: RunDiagnosticsWindowDays = 7): RunDiagnosticsQueryReport {
      const normalizedWindowDays = windowDays;
      const since = new Date(Date.now() - normalizedWindowDays * 24 * 60 * 60 * 1000).toISOString();
      const topPromptHashes = db
        .query<
          {
            source_type: "agent-run" | "background-job-run";
            prompt_hash: string;
            assistant_id: string | null;
            job_id: string | null;
            run_count: number;
            average_prompt_chars: number;
            latest_seen_at: string;
          },
          [string]
        >(
          `WITH prompt_rows AS (
             SELECT
               'agent-run' AS source_type,
               prompt_hash,
               prompt_chars,
               updated_at AS seen_at,
               NULL AS assistant_id,
               NULL AS job_id
             FROM agent_runs
             WHERE prompt_hash IS NOT NULL
               AND prompt_chars IS NOT NULL
               AND updated_at >= ?1
             UNION ALL
             SELECT
               'background-job-run' AS source_type,
               background_job_runs.prompt_hash,
               background_job_runs.prompt_chars,
               background_job_runs.updated_at AS seen_at,
               background_jobs.assistant_id,
               background_job_runs.job_id
             FROM background_job_runs
             LEFT JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
             WHERE background_job_runs.prompt_hash IS NOT NULL
               AND background_job_runs.prompt_chars IS NOT NULL
               AND background_job_runs.updated_at >= ?1
           )
           SELECT
             source_type,
             prompt_hash,
             assistant_id,
             job_id,
             COUNT(*) AS run_count,
             AVG(prompt_chars) AS average_prompt_chars,
             MAX(seen_at) AS latest_seen_at
           FROM prompt_rows
           GROUP BY source_type, prompt_hash, assistant_id, job_id
           HAVING COUNT(*) > 1
           ORDER BY run_count DESC, latest_seen_at DESC
           LIMIT 25`
        )
        .all(since)
        .map((row) => ({
          sourceType: row.source_type,
          promptHash: normalizeRequiredString(row.prompt_hash, 64, "unknown-prompt"),
          assistantId: normalizeOptionalString(row.assistant_id, 128),
          jobId: normalizeOptionalString(row.job_id, 128),
          runCount: normalizeInteger(row.run_count, 0, 100000, 0),
          averagePromptChars: normalizeInteger(row.average_prompt_chars, 0, 2_000_000, 0),
          latestSeenAt: normalizeRequiredString(row.latest_seen_at, 256, since)
        }));
  
      const promptSizeByOwner = db
        .query<
          {
            assistant_id: string | null;
            job_id: string | null;
            run_count: number;
            average_prompt_chars: number;
            latest_seen_at: string;
          },
          [string]
        >(
          `SELECT
             background_jobs.assistant_id,
             background_job_runs.job_id,
             COUNT(*) AS run_count,
             AVG(background_job_runs.prompt_chars) AS average_prompt_chars,
             MAX(background_job_runs.updated_at) AS latest_seen_at
           FROM background_job_runs
           INNER JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
           WHERE background_job_runs.prompt_chars IS NOT NULL
             AND background_job_runs.updated_at >= ?1
           GROUP BY background_jobs.assistant_id, background_job_runs.job_id
           ORDER BY average_prompt_chars DESC, latest_seen_at DESC
           LIMIT 50`
        )
        .all(since)
        .map((row) => ({
          assistantId: normalizeOptionalString(row.assistant_id, 128),
          jobId: normalizeOptionalString(row.job_id, 128),
          runCount: normalizeInteger(row.run_count, 0, 100000, 0),
          averagePromptChars: normalizeInteger(row.average_prompt_chars, 0, 2_000_000, 0),
          latestSeenAt: normalizeRequiredString(row.latest_seen_at, 256, since)
        }));
  
      const failureRows = db
        .query<
          {
            source_type: "agent-run" | "background-job-run";
            day: string;
            failure_category: string;
            assistant_id: string | null;
            job_id: string | null;
            count: number;
          },
          [string]
        >(
          `SELECT
             'agent-run' AS source_type,
             substr(updated_at, 1, 10) AS day,
             failure_category,
             NULL AS assistant_id,
             NULL AS job_id,
             COUNT(*) AS count
           FROM agent_runs
           WHERE status = 'failed'
             AND failure_category IS NOT NULL
             AND updated_at >= ?1
           GROUP BY day, failure_category
           UNION ALL
           SELECT
             'background-job-run' AS source_type,
             substr(background_job_runs.updated_at, 1, 10) AS day,
             background_job_runs.failure_category,
             background_jobs.assistant_id,
             background_job_runs.job_id,
             COUNT(*) AS count
           FROM background_job_runs
           LEFT JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
           WHERE background_job_runs.status = 'failed'
             AND background_job_runs.failure_category IS NOT NULL
             AND background_job_runs.updated_at >= ?1
           GROUP BY day, background_job_runs.failure_category, background_jobs.assistant_id, background_job_runs.job_id
           ORDER BY day DESC, count DESC`
        )
        .all(since)
        .map((row) => ({
          sourceType: row.source_type,
          day: normalizeRequiredString(row.day, 32, since.slice(0, 10)),
          failureCategory: classifyRunFailure({ explicitCategory: row.failure_category }),
          assistantId: normalizeOptionalString(row.assistant_id, 128),
          jobId: normalizeOptionalString(row.job_id, 128),
          count: normalizeInteger(row.count, 0, 100000, 0)
        }));
  
      return {
        topPromptHashes,
        promptSizeByOwner,
        failureRows
      };
    }
  function saveNotifications(items: NotificationInboxItem[]) { db.transaction(() => { for (const item of items) saveNotificationRaw(db, item); }).immediate(); }
  function markAllEnabledBackgroundJobSchedulersStale(failureMessage: string, now: string) { return markEnabledBackgroundJobSchedulersStale(db, failureMessage, now); }
  function deleteBackgroundJob(projectId: ProjectId, jobId: string) {
      return deleteBackgroundJobAtomically(db, projectId, jobId);
    }
  return {
    operations: {
      getRunDiagnosticsReport,
      saveNotifications,
      markAllEnabledBackgroundJobSchedulersStale,
      deleteBackgroundJob,
    },
    publicApi: {
      getRunDiagnosticsReport,
      saveNotifications,
      markAllEnabledBackgroundJobSchedulersStale,
      deleteBackgroundJob,
    },
  };
}

export type WorkspaceBackgroundOperationsSet = ReturnType<typeof createWorkspaceBackgroundOperations>["operations"];

export function createWorkspaceBackgroundOperations2(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function getRecentSuccessfulBackgroundJobRunDurationsMs(jobId: string, limit = 10) {
      return db
        .query<{ started_at: string | null; completed_at: string | null }, [string, number]>(
          `SELECT started_at, completed_at
           FROM background_job_runs
           WHERE job_id = ?1 AND status = 'succeeded' AND started_at IS NOT NULL AND completed_at IS NOT NULL
           ORDER BY completed_at DESC
           LIMIT ?2`
        )
        .all(jobId, limit)
        .map((row) => {
          const startedAt = Date.parse(row.started_at ?? "");
          const completedAt = Date.parse(row.completed_at ?? "");
          return Number.isFinite(startedAt) && Number.isFinite(completedAt) ? Math.max(0, completedAt - startedAt) : undefined;
        })
        .filter((duration): duration is number => duration !== undefined);
    }
  function promoteDeferredBrowserApprovals() {
      const promoted = new Map<string, { projectId: ProjectId; threadId: ThreadId; runId: string }>();
      const rows = db
        .query<{ id: string; project_id: string; thread_id: string; browser_sessions_json: string | null }, []>(
          `SELECT id, project_id, thread_id, browser_sessions_json
           FROM agent_runs
           WHERE browser_sessions_json IS NOT NULL`
        )
        .all();
  
      for (const row of rows) {
        const sessions = parseBrowserSessions(row.browser_sessions_json) ?? [];
        let changed = false;
        const nextSessions = sessions.map((session) => {
          const nextSession = structuredClone(session);
          if (promoteNextDeferredBrowserApproval(nextSession)) changed = true;
          return nextSession;
        });
  
        if (!changed) {
          continue;
        }
  
        db
          .query(`UPDATE agent_runs SET browser_sessions_json = ?2 WHERE id = ?1`)
          .run(row.id, JSON.stringify(nextSessions));
        promoted.set(row.id, {
          projectId: row.project_id,
          threadId: row.thread_id,
          runId: row.id
        });
      }
  
      return [...promoted.values()];
    }
  return {
    operations: {
      getRecentSuccessfulBackgroundJobRunDurationsMs,
      promoteDeferredBrowserApprovals,
    },
    publicApi: {
      getRecentSuccessfulBackgroundJobRunDurationsMs,
      promoteDeferredBrowserApprovals,
    },
  };
}

export type WorkspaceBackgroundOperations2Set = ReturnType<typeof createWorkspaceBackgroundOperations2>["operations"];

export function createWorkspaceBackgroundOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  function setBackgroundSchedulerHeartbeat(now: Date = new Date()) {
      const timestamp = now.toISOString();
      operations.setWorkspaceMetaValue(BACKGROUND_SCHEDULER_HEARTBEAT_KEY, timestamp);
      return timestamp;
    }
  function getBackgroundSchedulerHeartbeatAt() {
      return operations.getWorkspaceMetaValue(BACKGROUND_SCHEDULER_HEARTBEAT_KEY);
    }
  function getAssistantCongestionControlEnabledDefault() {
      return operations.getWorkspaceMetaValue(ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_KEY) !== "false";
    }
  function setAssistantCongestionControlEnabledDefault(value: boolean) {
      operations.setWorkspaceMetaValue(ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_KEY, String(value));
    }
  function getAssistantMaxCongestionDefault() {
      const value = Number.parseFloat(operations.getWorkspaceMetaValue(ASSISTANT_MAX_CONGESTION_DEFAULT_KEY) ?? "");
      return Number.isFinite(value) ? Math.max(0.25, Math.min(3, Math.round(value * 4) / 4)) : 1;
    }
  function setAssistantMaxCongestionDefault(value: number) {
      const normalized = Math.max(0.25, Math.min(3, Math.round(value * 4) / 4));
      operations.setWorkspaceMetaValue(ASSISTANT_MAX_CONGESTION_DEFAULT_KEY, normalized.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    }
  function getMaxBackgroundJobsDefault() {
      const value = Number.parseInt(operations.getWorkspaceMetaValue(MAX_BACKGROUND_JOBS_DEFAULT_KEY) ?? "", 10);
      return Number.isFinite(value) ? Math.max(5, Math.min(100, Math.round(value))) : 10;
    }
  function setMaxBackgroundJobsDefault(value: number) {
      operations.setWorkspaceMetaValue(MAX_BACKGROUND_JOBS_DEFAULT_KEY, String(Math.max(5, Math.min(100, Math.round(value)))));
    }
  return {
    operations: {
      setBackgroundSchedulerHeartbeat,
      getBackgroundSchedulerHeartbeatAt,
      getAssistantCongestionControlEnabledDefault,
      setAssistantCongestionControlEnabledDefault,
      getAssistantMaxCongestionDefault,
      setAssistantMaxCongestionDefault,
      getMaxBackgroundJobsDefault,
      setMaxBackgroundJobsDefault,
    },
    publicApi: {
      setBackgroundSchedulerHeartbeat,
      getBackgroundSchedulerHeartbeatAt,
      getAssistantCongestionControlEnabledDefault,
      setAssistantCongestionControlEnabledDefault,
      getAssistantMaxCongestionDefault,
      setAssistantMaxCongestionDefault,
      getMaxBackgroundJobsDefault,
      setMaxBackgroundJobsDefault,
    },
  };
}

export type WorkspaceBackgroundOperations3Set = ReturnType<typeof createWorkspaceBackgroundOperations3>["operations"];

export function createWorkspaceBackgroundOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceBackgroundOperations3Set & WorkspaceBackgroundReadsOperationsSet) {
  const { db } = context;
  function listBackgroundJobsPage(cursor?: string, limit = 512) {
      const page = readTimestampPage<BackgroundJobRow>({ db: db, kind: "background-jobs",
        select: assistantPagination.BACKGROUND_JOB_SELECT_SQL, cursor, limit });
      return { items: page.rows.map((row) => operations.hydrateBackgroundJob(row)).filter((item): item is BackgroundJob => !!item),
        nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  function listBackgroundJobRunsPage(cursor?: string, limit = 512) {
      const page = readTimestampPage<BackgroundJobRunRow>({ db: db, kind: "background-runs",
        select: assistantPagination.BACKGROUND_JOB_RUN_SELECT_SQL, cursor, limit });
      return { items: page.rows.map((row) => operations.hydrateBackgroundJobRun(row)).filter((item): item is BackgroundJobRun => !!item),
        nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  function loadBackgroundJobsState(jobLimit = 512, runLimit = 2048): BackgroundJobsState {
      const jobs = listBackgroundJobsPage(undefined, jobLimit); const runs = listBackgroundJobRunsPage(undefined, runLimit);
      return backgroundJobsStateSchema.parse({ jobs: jobs.items, jobsNextCursor: jobs.nextCursor,
        runs: runs.items, runsNextCursor: runs.nextCursor, templates: operations.readBackgroundJobTemplates().slice(0, 64),
        schedulerHeartbeatAt: operations.getBackgroundSchedulerHeartbeatAt() });
    }
  function listEnabledBackgroundJobsForScheduler(afterId?: string, limit: number = 128) { return readRawIdPage<BackgroundJobRow, BackgroundJob>({ db: db, afterId, limit, sql: `${assistantPagination.BACKGROUND_JOB_SELECT_SQL} WHERE status = 'enabled' AND id > ?1 ORDER BY id ASC LIMIT ?2`, hydrate: (row) => operations.hydrateBackgroundJob(row) }); }
  function listBackgroundJobRunsForNotificationReconciliation(afterId?: string) { return readRawIdPage<BackgroundJobRunRow, BackgroundJobRun>({ db: db, afterId, sql: `${assistantPagination.BACKGROUND_JOB_RUN_SELECT_SQL} WHERE id > ?1 ORDER BY id ASC LIMIT ?2`, hydrate: (row) => operations.hydrateBackgroundJobRun(row) }); }
  function getBackgroundJobsByIds(jobIds: string[]) { return assistantPagination.readHydratedRowsByIds(db, assistantPagination.BACKGROUND_JOB_SELECT_SQL, jobIds, (row: BackgroundJobRow) => operations.hydrateBackgroundJob(row)); }
  function getEnabledBackgroundJobsInBackoff(now: Date) { const jobs: BackgroundJob[] = []; let afterId: string | undefined;
      do { const page = listEnabledBackgroundJobsForScheduler(afterId); jobs.push(...page.items.filter((job) =>
        new Date(job.backoffUntil ?? "").getTime() > now.getTime())); afterId = page.nextAfterId; } while (afterId !== undefined);
      return jobs; }
  function saveBackgroundJob(job: BackgroundJob) {
      operations.assertProjectExists(job.projectId);
      if (job.assistantId) {
        operations.assertAssistantExists(job.assistantId);
      }
      const jobToSave: BackgroundJob = {
        ...job,
        intentContract: compileBackgroundJobIntentContract(job)
      };
      const now = new Date().toISOString();
      const automationThreadId = operations.ensureAutomationThread(jobToSave.projectId, jobToSave.automationThreadId, jobToSave.name, now);
      db
        .query(
          `INSERT INTO background_jobs (
            id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
            intent_contract_json, lane, definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
            last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, last_scheduler_check_at,
            last_blocked_at, blocked_reason, scheduler_queue_position, scheduler_queue_reason, scheduler_blocked_since_at,
            scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at, scheduler_overloaded,
            scheduler_congestion_ratio, consecutive_failure_count, backoff_until, last_failure_category, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38)
          ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            assistant_id = excluded.assistant_id,
            automation_thread_id = excluded.automation_thread_id,
            template_id = excluded.template_id,
            created_from_run_id = excluded.created_from_run_id,
            kind = excluded.kind,
            name = excluded.name,
            description = excluded.description,
            intent_contract_json = excluded.intent_contract_json,
            lane = excluded.lane,
            definition_json = excluded.definition_json,
            schedule_json = excluded.schedule_json,
            schedule_input = excluded.schedule_input,
            timezone = excluded.timezone,
            status = excluded.status,
            risk_level = excluded.risk_level,
            next_run_at = excluded.next_run_at,
            last_run_at = excluded.last_run_at,
            last_enqueued_at = excluded.last_enqueued_at,
            updated_at = excluded.updated_at`
        )
        .run(
          jobToSave.id,
          jobToSave.projectId,
          jobToSave.assistantId ?? null,
          automationThreadId,
          jobToSave.templateId ?? null,
          jobToSave.createdFromRunId ?? null,
          jobToSave.kind,
          jobToSave.name,
          jobToSave.description ?? null,
          JSON.stringify(jobToSave.intentContract),
          jobToSave.lane ?? "exclusive",
          JSON.stringify(jobToSave.definition),
          JSON.stringify(jobToSave.schedule),
          jobToSave.scheduleInput,
          jobToSave.timezone ?? null,
          jobToSave.status,
          jobToSave.riskLevel,
          jobToSave.nextRunAt ?? null,
          jobToSave.lastRunAt ?? null,
          jobToSave.lastEnqueuedAt ?? null,
          jobToSave.schedulerStatus ?? "idle",
          jobToSave.schedulerDetail ?? null,
          jobToSave.lastSchedulerCheckAt ?? null,
          jobToSave.lastBlockedAt ?? null,
          jobToSave.blockedReason ?? null,
          jobToSave.schedulerQueuePosition ?? null,
          jobToSave.schedulerQueueReason ?? null,
          jobToSave.schedulerBlockedSinceAt ?? null,
          jobToSave.schedulerActiveRunId ?? null,
          jobToSave.schedulerActiveRunStartedAt ?? null,
          jobToSave.schedulerLastProgressAt ?? null,
          (jobToSave.schedulerCongested ?? jobToSave.schedulerOverloaded) ? 1 : 0,
          jobToSave.schedulerCongestionRatio ?? null,
          jobToSave.consecutiveFailureCount ?? 0,
          jobToSave.backoffUntil ?? null,
          jobToSave.lastFailureCategory ?? null,
          jobToSave.createdAt,
          now
        );
      operations.touchProject(jobToSave.projectId, now);
      const savedJob = getBackgroundJob(jobToSave.id);
      if (!savedJob) throw new Error(`Background job was not persisted: ${jobToSave.id}`);
      return savedJob;
    }
  function setBackgroundJobStatus(projectId: ProjectId, jobId: string, status: BackgroundJob["status"]) {
      const now = new Date().toISOString();
      db
        .query(`UPDATE background_jobs SET status = ?3, updated_at = ?4 WHERE id = ?1 AND project_id = ?2`)
        .run(jobId, projectId, status, now);
      return loadBackgroundJobsState();
    }
  function pauseAllAssistantBackgroundJobs() {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE background_jobs
           SET status = 'paused',
               updated_at = ?1
           WHERE assistant_id IS NOT NULL
             AND status = 'enabled'`
        )
        .run(now);
      return loadBackgroundJobsState();
    }
  function getBackgroundJob(jobId: string) {
      const row = db
        .query<BackgroundJobRow, [string]>(
          `SELECT
            id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
            intent_contract_json, lane, definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
            last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, scheduler_queue_position, scheduler_queue_reason,
            scheduler_blocked_since_at, scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at,
            scheduler_overloaded, scheduler_congestion_ratio, consecutive_failure_count, backoff_until, last_failure_category,
            last_scheduler_check_at, last_blocked_at, blocked_reason, created_at, updated_at
           FROM background_jobs
           WHERE id = ?1`
        )
        .get(jobId);
      return row ? operations.hydrateBackgroundJob(row) : undefined;
    }
  return {
    operations: {
      listBackgroundJobsPage,
      listBackgroundJobRunsPage,
      loadBackgroundJobsState,
      listEnabledBackgroundJobsForScheduler,
      listBackgroundJobRunsForNotificationReconciliation,
      getBackgroundJobsByIds,
      getEnabledBackgroundJobsInBackoff,
      saveBackgroundJob,
      setBackgroundJobStatus,
      pauseAllAssistantBackgroundJobs,
      getBackgroundJob,
    },
    publicApi: {
      listBackgroundJobsPage,
      listBackgroundJobRunsPage,
      loadBackgroundJobsState,
      listEnabledBackgroundJobsForScheduler,
      listBackgroundJobRunsForNotificationReconciliation,
      getBackgroundJobsByIds,
      getEnabledBackgroundJobsInBackoff,
      saveBackgroundJob,
      setBackgroundJobStatus,
      pauseAllAssistantBackgroundJobs,
      getBackgroundJob,
    },
  };
}

export type WorkspaceBackgroundOperations4Set = ReturnType<typeof createWorkspaceBackgroundOperations4>["operations"];

export function createWorkspaceBackgroundOperations5(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceBackgroundReadsOperationsSet & WorkspaceBackgroundOperations4Set) {
  const { db } = context;
  function clearBackgroundJobFailureTracking(jobId: string) {
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE background_jobs
           SET consecutive_failure_count = 0,
               backoff_until = NULL,
               last_failure_category = NULL,
               updated_at = ?2
           WHERE id = ?1`
        )
        .run(jobId, now);
      return operations.getBackgroundJob(jobId);
    }
  function repairBackgroundJobReferences(jobId: string) {
      const row = db
        .query<{ id: string; project_id: string; assistant_id: string | null; automation_thread_id: string; name: string }, [string]>(
          `SELECT id, project_id, assistant_id, automation_thread_id, name
           FROM background_jobs
           WHERE id = ?1`
        )
        .get(jobId);
      if (!row) {
        return undefined;
      }
  
      const now = new Date().toISOString();
      const project = db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?1`).get(row.project_id);
      if (!project) {
        db
          .query(
            `UPDATE background_jobs
             SET status = 'disabled',
                 scheduler_status = 'blocked',
                 scheduler_detail = ?2,
                 blocked_reason = ?2,
                 last_scheduler_check_at = ?3,
                 last_blocked_at = ?3,
                 updated_at = ?3
             WHERE id = ?1`
          )
          .run(jobId, `Missing project ${row.project_id}`, now);
        return operations.getBackgroundJob(jobId);
      }
  
      let assistantId = row.assistant_id;
      if (assistantId && !operations.assistantExists(assistantId)) {
        db
          .query(
            `UPDATE background_jobs
             SET assistant_id = NULL,
                 scheduler_status = 'blocked',
                 scheduler_detail = ?2,
                 blocked_reason = ?2,
                 last_scheduler_check_at = ?3,
                 last_blocked_at = ?3,
                 updated_at = ?3
             WHERE id = ?1`
          )
          .run(jobId, `Detached missing assistant ${assistantId}`, now);
        assistantId = null;
      }
  
      const automationThreadId = operations.ensureAutomationThread(row.project_id, row.automation_thread_id, row.name, now);
      if (automationThreadId !== row.automation_thread_id || assistantId !== row.assistant_id) {
        db
          .query(
            `UPDATE background_jobs
             SET automation_thread_id = ?2,
                 updated_at = ?3
             WHERE id = ?1`
          )
          .run(jobId, automationThreadId, now);
      }
  
      return operations.getBackgroundJob(jobId);
    }
  function recordBackgroundJobFailure(jobId: string, failureCategory: RunFailureCategory, now: Date = new Date()) {
      const job = operations.getBackgroundJob(jobId);
      if (!job) {
        return undefined;
      }
  
      const nextCount = (job.consecutiveFailureCount ?? 0) + 1;
      const nextBackoffUntil = resolveBackgroundBackoffUntil(now, nextCount);
      db
        .query(
          `UPDATE background_jobs
           SET consecutive_failure_count = ?2,
               backoff_until = ?3,
               last_failure_category = ?4,
               updated_at = ?5
           WHERE id = ?1`
        )
        .run(jobId, nextCount, nextBackoffUntil, failureCategory, now.toISOString());
      return operations.getBackgroundJob(jobId);
    }
  return {
    operations: {
      clearBackgroundJobFailureTracking,
      repairBackgroundJobReferences,
      recordBackgroundJobFailure,
    },
    publicApi: {
      clearBackgroundJobFailureTracking,
      repairBackgroundJobReferences,
      recordBackgroundJobFailure,
    },
  };
}

export type WorkspaceBackgroundOperations5Set = ReturnType<typeof createWorkspaceBackgroundOperations5>["operations"];

export function createWorkspaceBackgroundOperations6(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperationsSet & WorkspaceBackgroundOperations4Set) {
  const { db } = context;
  function updateBackgroundJobSchedulerState(
      jobId: string,
      input: {
        schedulerStatus: BackgroundJobSchedulerStatus;
        schedulerDetail?: string;
        schedulerQueuePosition?: number;
        schedulerQueueReason?: string;
        schedulerBlockedSinceAt?: string;
        schedulerActiveRunId?: string;
        schedulerActiveRunStartedAt?: string;
        schedulerLastProgressAt?: string;
        schedulerOverloaded?: boolean;
        schedulerCongested?: boolean;
        schedulerCongestionRatio?: number;
        consecutiveFailureCount?: number;
        backoffUntil?: string | null;
        lastFailureCategory?: RunFailureCategory;
        blockedReason?: string;
        lastSchedulerCheckAt?: string;
        lastBlockedAt?: string;
      }
    ) {
      const now = new Date().toISOString();
      const lastSchedulerCheckAt = input.lastSchedulerCheckAt ?? now;
      const lastBlockedAt = input.schedulerStatus === "blocked" ? input.lastBlockedAt ?? now : undefined;
      db
        .query(
          `UPDATE background_jobs
           SET scheduler_status = ?2,
               scheduler_detail = ?3,
               last_scheduler_check_at = ?4,
               last_blocked_at = CASE WHEN ?5 IS NULL THEN last_blocked_at ELSE ?5 END,
               blocked_reason = ?6,
               scheduler_queue_position = ?7,
               scheduler_queue_reason = ?8,
               scheduler_blocked_since_at = CASE
                 WHEN ?2 = 'blocked' THEN COALESCE(scheduler_blocked_since_at, ?9)
                 ELSE NULL
               END,
               scheduler_active_run_id = ?10,
               scheduler_active_run_started_at = ?11,
               scheduler_last_progress_at = ?12,
               scheduler_overloaded = ?13,
               scheduler_congestion_ratio = ?14,
               consecutive_failure_count = COALESCE(?15, consecutive_failure_count),
               backoff_until = ?16,
               last_failure_category = ?17,
               updated_at = ?18
           WHERE id = ?1`
        )
        .run(
          jobId,
          input.schedulerStatus,
          input.schedulerDetail ?? null,
          lastSchedulerCheckAt,
          lastBlockedAt ?? null,
          input.blockedReason ?? null,
          input.schedulerQueuePosition ?? null,
          input.schedulerQueueReason ?? null,
          input.schedulerBlockedSinceAt ?? lastBlockedAt ?? now,
          input.schedulerActiveRunId ?? null,
          input.schedulerActiveRunStartedAt ?? null,
          input.schedulerLastProgressAt ?? null,
          (input.schedulerCongested ?? input.schedulerOverloaded) === undefined
            ? null
            : (input.schedulerCongested ?? input.schedulerOverloaded)
              ? 1
              : 0,
          input.schedulerCongestionRatio ?? null,
          input.consecutiveFailureCount ?? null,
          input.backoffUntil ?? null,
          input.lastFailureCategory ?? null,
          now
        );
      return operations.getBackgroundJob(jobId);
    }
  function getBackgroundJobRun(runId: string) {
      const row = db
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
           WHERE id = ?1`
        )
        .get(runId);
      return row ? operations.hydrateBackgroundJobRun(row) : undefined;
    }
  function getBackgroundJobRunByLinkedAgentRunId(agentRunId: string) {
      const row = db
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
           WHERE linked_agent_run_id = ?1
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(agentRunId);
      return row ? operations.hydrateBackgroundJobRun(row) : undefined;
    }
  function getQueuedBackgroundJobRuns() {
      return db
        .query<{ id: string }, []>(
          `SELECT id
           FROM background_job_runs
           WHERE status = 'queued'
           ORDER BY queued_at ASC, created_at ASC`
        )
        .all()
        .map((row) => getBackgroundJobRun(row.id)!)
        .filter(Boolean);
    }
  function getActiveBackgroundJobRuns(jobId?: string) {
      const rows = jobId
        ? db
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
             WHERE job_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
             ORDER BY updated_at DESC, created_at DESC`
          )
          .all(jobId)
        : db
          .query<BackgroundJobRunRow, []>(
            `SELECT
              id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
              skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
              prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
              agent_id, provider_brand, planning_model_id, execution_model_id, reasoning_strength, fast_mode,
              controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
              last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
              completed_at, created_at, updated_at
             FROM background_job_runs
             WHERE status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
             ORDER BY updated_at DESC, created_at DESC`
          )
          .all();
      return rows.map((row) => operations.hydrateBackgroundJobRun(row)).filter((run): run is BackgroundJobRun => run !== undefined);
    }
  return {
    operations: {
      updateBackgroundJobSchedulerState,
      getBackgroundJobRun,
      getBackgroundJobRunByLinkedAgentRunId,
      getQueuedBackgroundJobRuns,
      getActiveBackgroundJobRuns,
    },
    publicApi: {
      updateBackgroundJobSchedulerState,
      getBackgroundJobRun,
      getBackgroundJobRunByLinkedAgentRunId,
      getQueuedBackgroundJobRuns,
      getActiveBackgroundJobRuns,
    },
  };
}

export type WorkspaceBackgroundOperations6Set = ReturnType<typeof createWorkspaceBackgroundOperations6>["operations"];
