import type { AgentRunExperimentRow, BackgroundJobRow, BackgroundJobRunEventRow, BackgroundJobRunRow, MemoryEntryRow, MemoryRetrievalRow, NotificationRow, WorkspaceRepositoryContext } from "../contracts";
import type { BackgroundJobTemplate, ProjectId, SubagentTaskState, ThreadId } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectReadsOperations3Set } from "./project-reads";
import { backgroundJobRunSchema, backgroundJobSchema, backgroundJobTemplateSchema, experimentRunSchema, memoryEntrySchema, memoryRetrievalSchema, notificationInboxItemSchema } from "@hyperfocus/ai-core/protocol";
import { buildRunPromptStats, deriveMemoryFreshness, normalizeRunFailureCategory, normalizeThreadTitle, parseBackgroundJobDefinition, parseBackgroundJobSchedule, parseIntentContract, parseStringArray } from "../models";
import { defaultBackgroundJobTemplates } from "@hyperfocus/ai-core/background-job-templates";
import { normalizeBackgroundJobSchedulerStatus, normalizeBooleanNumber, normalizeInteger, normalizeOptionalInteger, normalizeOptionalNumber, normalizeOptionalString, normalizeRequiredString, parseJsonObjectOrUndefined, recordPersistenceRecovery, safeParsePersisted } from "../persisted-values";
import { stripAnsiForStorage } from "../../../ansi-storage";

export function createWorkspaceBackgroundReadsOperations(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  const { db } = context;
  function ensureAutomationThread(projectId: ProjectId, threadId: ThreadId, title: string, now: string) {
      const existing = db
        .query<{ id: string }, [string, string]>(`SELECT id FROM project_threads WHERE project_id = ?1 AND id = ?2`)
        .get(projectId, threadId);
      if (existing) {
        return threadId;
      }
  
      operations.insertThread(projectId, threadId, {
        kind: "automation",
        title: normalizeThreadTitle(title),
        titleSource: "custom",
        updatedAt: now
      });
      return threadId;
    }
  function readBackgroundJobTemplates() {
      return db
        .query<{ id: string; label: string; description: string; kind: BackgroundJobTemplate["kind"]; definition_json: string }, []>(
          `SELECT id, label, description, kind, definition_json
           FROM background_job_templates
           ORDER BY id ASC`
        )
        .all()
        .map((row) =>
          safeParsePersisted(
            backgroundJobTemplateSchema,
            {
              id: row.id,
              label: normalizeRequiredString(row.label, 128, "Recovered template"),
              description: normalizeRequiredString(row.description, 512, "Recovered template"),
              kind: row.kind,
              definition: parseBackgroundJobDefinition(row.kind, row.definition_json)
            },
            { table: "background_job_templates", rowId: row.id }
          )
        )
        .filter((template): template is BackgroundJobTemplate => template !== undefined);
    }
  function hydrateBackgroundJob(row: BackgroundJobRow) {
      return safeParsePersisted(
        backgroundJobSchema,
        {
        id: row.id,
        projectId: row.project_id,
        assistantId: row.assistant_id ?? undefined,
        automationThreadId: row.automation_thread_id,
        templateId: normalizeOptionalString(row.template_id, 128),
        createdFromRunId: normalizeOptionalString(row.created_from_run_id, 128),
        kind: row.kind,
        name: normalizeRequiredString(row.name, 256, "Recovered background job"),
        description: normalizeOptionalString(row.description, 1024),
        intentContract: parseIntentContract(row.intent_contract_json),
        lane: row.lane === "concurrent" ? "concurrent" : "exclusive",
        definition: parseBackgroundJobDefinition(row.kind, row.definition_json),
        schedule: parseBackgroundJobSchedule(row.schedule_json, row.next_run_at ?? row.updated_at),
        scheduleInput: normalizeRequiredString(row.schedule_input, 512, "recovered"),
        timezone: normalizeOptionalString(row.timezone, 128),
        status: row.status,
        riskLevel: row.risk_level,
        nextRunAt: normalizeOptionalString(row.next_run_at, 256),
        lastRunAt: normalizeOptionalString(row.last_run_at, 256),
        lastEnqueuedAt: normalizeOptionalString(row.last_enqueued_at, 256),
        schedulerStatus: normalizeBackgroundJobSchedulerStatus(row.scheduler_status),
        schedulerDetail: normalizeOptionalString(row.scheduler_detail, 1024),
        schedulerQueuePosition: row.scheduler_queue_position
          ? normalizeInteger(row.scheduler_queue_position, 1, 100000, 1)
          : undefined,
        schedulerQueueReason: normalizeOptionalString(row.scheduler_queue_reason, 1024),
        schedulerBlockedSinceAt: normalizeOptionalString(row.scheduler_blocked_since_at, 256),
        schedulerActiveRunId: normalizeOptionalString(row.scheduler_active_run_id, 128),
        schedulerActiveRunStartedAt: normalizeOptionalString(row.scheduler_active_run_started_at, 256),
        schedulerLastProgressAt: normalizeOptionalString(row.scheduler_last_progress_at, 256),
        schedulerOverloaded: row.scheduler_overloaded === null ? undefined : Boolean(row.scheduler_overloaded),
        schedulerCongested: row.scheduler_overloaded === null ? undefined : Boolean(row.scheduler_overloaded),
        schedulerCongestionRatio: normalizeOptionalNumber(row.scheduler_congestion_ratio, 0, 1000),
        consecutiveFailureCount: normalizeOptionalInteger(row.consecutive_failure_count, 0, 100000) ?? 0,
        backoffUntil: normalizeOptionalString(row.backoff_until, 256),
        lastFailureCategory: normalizeRunFailureCategory(row.last_failure_category),
        lastSchedulerCheckAt: normalizeOptionalString(row.last_scheduler_check_at, 256),
        lastBlockedAt: normalizeOptionalString(row.last_blocked_at, 256),
        blockedReason: normalizeOptionalString(row.blocked_reason, 1024),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
        },
        { table: "background_jobs", rowId: row.id }
      );
    }
  function hydrateBackgroundJobRun(row: BackgroundJobRunRow, includeEvents: boolean = true) {
      const events = includeEvents ? db
        .query<BackgroundJobRunEventRow, [string]>(
          `SELECT id, run_id, ordinal, stage, message, detail_json, created_at
           FROM background_job_run_events
           WHERE run_id = ?1
           ORDER BY ordinal DESC
           LIMIT 512`
        )
        .all(row.id)
        .map((event) => ({
          id: event.id,
          stage: normalizeRequiredString(event.stage, 64, "recovered"),
          message: normalizeRequiredString(event.message, 4000, "Recovered job event"),
          detail: normalizeOptionalString(event.detail_json, 16000),
          createdAt: normalizeRequiredString(event.created_at, 256, new Date().toISOString())
        }))
        .reverse()
        : [];
  
      return safeParsePersisted(
        backgroundJobRunSchema,
        {
        id: row.id,
        jobId: row.job_id,
        projectId: row.project_id,
        assistantId: row.assistant_id ?? undefined,
        automationThreadId: row.automation_thread_id,
        triggerSource: row.trigger_source,
        status: row.status,
        riskLevel: row.risk_level,
        approvalStatus: row.approval_status,
        skippedOccurrenceCount: normalizeInteger(row.skipped_occurrence_count, 0, 100000, 0),
        linkedAgentRunId: normalizeOptionalString(row.linked_agent_run_id, 128),
        summary: normalizeOptionalString(row.summary, 4000),
        failureMessage: normalizeOptionalString(row.failure_message, 4000),
        failureCategory: normalizeRunFailureCategory(row.failure_category),
        promptStats: buildRunPromptStats({
          promptChars: row.prompt_chars,
          promptHash: row.prompt_hash,
          transcriptChars: row.transcript_chars,
          latestTaskChars: row.latest_task_chars
        }),
        agentId: row.agent_id ?? undefined,
        providerBrand: row.provider_brand ?? undefined,
        planningModelId: normalizeOptionalString(row.planning_model_id, 256),
        executionModelId: normalizeOptionalString(row.execution_model_id, 256),
        reasoningStrength: row.reasoning_strength ?? undefined,
        fastMode: row.fast_mode === null ? undefined : Boolean(row.fast_mode),
        controllerInstanceId: normalizeOptionalString(row.controller_instance_id, 128),
        controllerLeaseId: normalizeOptionalString(row.controller_lease_id, 128),
        controllerLeaseExpiresAt: normalizeOptionalString(row.controller_lease_expires_at, 256),
        lastHeartbeatAt: normalizeOptionalString(row.last_heartbeat_at, 256),
        heartbeatStage: normalizeOptionalString(row.heartbeat_stage, 64),
        heartbeatDetail: normalizeOptionalString(row.heartbeat_detail, 1024),
        timedOutAt: normalizeOptionalString(row.timed_out_at, 256),
        resumeAttemptCount: normalizeOptionalInteger(row.resume_attempt_count, 0, 1000),
        queuedAt: normalizeRequiredString(row.queued_at, 256, new Date().toISOString()),
        startedAt: normalizeOptionalString(row.started_at, 256),
        completedAt: normalizeOptionalString(row.completed_at, 256),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString()),
        events
        },
        { table: "background_job_runs", rowId: row.id }
      );
    }
  return {
    operations: {
      ensureAutomationThread,
      readBackgroundJobTemplates,
      hydrateBackgroundJob,
      hydrateBackgroundJobRun,
    },
    publicApi: {
    },
  };
}

export type WorkspaceBackgroundReadsOperationsSet = ReturnType<typeof createWorkspaceBackgroundReadsOperations>["operations"];

export function createWorkspaceBackgroundReadsOperations2(context: WorkspaceRepositoryContext) {
  const { repoRoot, db } = context;
  function hydrateNotification(row: NotificationRow) {
      const payload = parseJsonObjectOrUndefined(row.payload_json);
      if (!payload) {
        recordPersistenceRecovery({ table: "notifications", rowId: row.id, field: "payload_json" }, "invalid notification payload");
        return undefined;
      }
  
      return safeParsePersisted(
        notificationInboxItemSchema,
        {
        ...payload,
        id: row.id,
        kind: row.kind,
        interactive: row.kind === "background-run-status" ? false : true,
        projectId: row.project_id ?? payload.projectId,
        threadId: row.thread_id ?? payload.threadId,
        runId: row.run_id ?? payload.runId,
        assistantId: row.assistant_id ?? payload.assistantId,
        questionId: row.question_id ?? payload.questionId,
        sessionId: row.session_id ?? payload.sessionId,
        toolCallId: row.tool_call_id ?? payload.toolCallId,
        backgroundRunId: row.background_run_id ?? payload.backgroundRunId,
        jobId: row.job_id ?? payload.jobId,
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        readAt: normalizeOptionalString(row.read_at, 256),
        archivedAt: normalizeOptionalString(row.archived_at, 256)
        },
        { table: "notifications", rowId: row.id }
      );
    }
  function hydrateExperimentRun(row: AgentRunExperimentRow) {
      return safeParsePersisted(
        experimentRunSchema,
        {
        id: row.id,
        runId: row.run_id,
        status: row.status,
        virtualBranchName: normalizeRequiredString(row.virtual_branch_name, 256, "recovered-branch"),
        repoMountPath: normalizeRequiredString(row.repo_mount_path, 4096, repoRoot),
        projectMountPath: normalizeRequiredString(row.project_mount_path, 4096, repoRoot),
        baseCommitSha: normalizeOptionalString(row.base_commit_sha, 256),
        baseBranchName: normalizeOptionalString(row.base_branch_name, 256),
        baseDirtyFingerprint: normalizeRequiredString(row.base_dirty_fingerprint, 256, "unknown"),
        headCommitSha: normalizeOptionalString(row.head_commit_sha, 256),
        filesChanged: normalizeInteger(row.files_changed, 0, Number.MAX_SAFE_INTEGER, 0),
        insertions: normalizeInteger(row.insertions, 0, Number.MAX_SAFE_INTEGER, 0),
        deletions: normalizeInteger(row.deletions, 0, Number.MAX_SAFE_INTEGER, 0),
        promotedAt: normalizeOptionalString(row.promoted_at, 256),
        discardedAt: normalizeOptionalString(row.discarded_at, 256),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
        },
        { table: "agent_run_experiments", rowId: row.id }
      );
    }
  function hydrateMemoryEntry(row: MemoryEntryRow) {
      return safeParsePersisted(
        memoryEntrySchema,
        {
        id: row.id,
        projectId: row.project_id ?? undefined,
        threadId: row.thread_id ?? undefined,
        runId: row.run_id ?? undefined,
        kind: row.kind,
        status: row.status,
        title: normalizeRequiredString(row.title, 256, "Recovered memory"),
        summary: normalizeRequiredString(row.summary, 4000, "Recovered memory summary"),
        evidence: normalizeOptionalString(row.evidence, 16000),
        tags: parseStringArray(row.tags_json, 32, 128),
        pathGlobs: parseStringArray(row.path_globs_json, 64, 512),
        confidence: row.confidence,
        freshness: deriveMemoryFreshness(row),
        pinned: normalizeBooleanNumber(row.pinned),
        priority: normalizeInteger(row.priority, 0, 100000, 50000),
        hitCount: normalizeInteger(row.hit_count, 0, Number.MAX_SAFE_INTEGER, 0),
        lastHitAt: normalizeOptionalString(row.last_hit_at, 256),
        sourceCommitSha: normalizeOptionalString(row.source_commit_sha, 256),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
        },
        { table: "memory_entries", rowId: row.id }
      );
    }
  function hydrateMemoryRetrieval(row: MemoryRetrievalRow) {
      return safeParsePersisted(
        memoryRetrievalSchema,
        {
        id: row.id,
        runId: row.run_id,
        owner: row.owner,
        subagentId: normalizeOptionalString(row.subagent_id, 128),
        queryText: normalizeRequiredString(row.query_text, 32000, "Recovered memory query"),
        entryIds: parseStringArray(row.entry_ids_json, 16, 128),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
        },
        { table: "memory_retrievals", rowId: row.id }
      );
    }
  function seedBackgroundJobTemplates() {
      const now = new Date().toISOString();
      for (const template of defaultBackgroundJobTemplates) {
        db
          .query(
            `INSERT INTO background_job_templates (id, label, description, kind, definition_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET
               label = excluded.label,
               description = excluded.description,
               kind = excluded.kind,
               definition_json = excluded.definition_json,
               updated_at = excluded.updated_at`
          )
          .run(
            template.id,
            template.label,
            template.description,
            template.kind,
            JSON.stringify(template.definition),
            now
          );
      }
    }
  function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
      const columns = db
        .query<{ name: string }, [string]>(`SELECT name FROM pragma_table_info(?1)`)
        .all(tableName)
        .map((row) => row.name);
  
      if (!columns.includes(columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      }
    }
  function readTableCreateSql(tableName: string) {
      return (
        db
          .query<{ sql: string | null }, [string]>(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1`)
          .get(tableName)?.sql ?? ""
      );
    }
  return {
    operations: {
      hydrateNotification,
      hydrateExperimentRun,
      hydrateMemoryEntry,
      hydrateMemoryRetrieval,
      seedBackgroundJobTemplates,
      addColumnIfMissing,
      readTableCreateSql,
    },
    publicApi: {
    },
  };
}

export type WorkspaceBackgroundReadsOperations2Set = ReturnType<typeof createWorkspaceBackgroundReadsOperations2>["operations"];

export function createWorkspaceBackgroundReadsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperations2Set & WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function updateSubtask(
      projectId: ProjectId,
      runId: string,
      taskId: string,
      input: {
        status: SubagentTaskState["status"];
        attemptCount: number;
        startedAt?: string | null;
        completedAt?: string | null;
        output?: string | null;
        errorMessage?: string | null;
        commitSha?: string | null;
        worktreePath?: string | null;
        mountPath?: string | null;
      }
    ) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_run_subtasks
           SET status = ?4, attempt_count = ?5, started_at = COALESCE(?6, started_at), completed_at = ?7,
               output = ?8, error_message = ?9, commit_sha = ?10, worktree_path = ?11, mount_path = ?12, updated_at = ?13
           WHERE run_id = ?1
             AND planner_task_id = ?2
             AND EXISTS (SELECT 1 FROM agent_runs WHERE agent_runs.id = ?1 AND agent_runs.project_id = ?3)`
        )
        .run(
          runId,
          taskId,
          projectId,
          input.status,
          input.attemptCount,
          input.startedAt ?? null,
          input.completedAt ?? null,
          input.output === undefined || input.output === null ? null : stripAnsiForStorage(input.output),
          input.errorMessage === undefined || input.errorMessage === null ? null : stripAnsiForStorage(input.errorMessage),
          input.commitSha ?? null,
          input.worktreePath ?? null,
          input.mountPath ?? null,
          now
        );
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent subtask: ${taskId}`);
      }
  
      db.query(`UPDATE agent_runs SET updated_at = ?3 WHERE id = ?1 AND project_id = ?2`).run(runId, projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function rebuildAssistantAssetRefsTableIfNeeded() {
      const createSql = operations.readTableCreateSql("assistant_asset_refs");
      if (!createSql || createSql.includes("'global-skill'")) {
        return;
      }
  
      db.exec(`
        ALTER TABLE assistant_asset_refs RENAME TO assistant_asset_refs_legacy;
        CREATE TABLE assistant_asset_refs (
          id TEXT PRIMARY KEY,
          assistant_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('skill', 'script', 'mode', 'background-template')),
          label TEXT NOT NULL,
          value TEXT NOT NULL,
          canonical_value TEXT NULL,
          scope TEXT NULL CHECK(scope IN ('workspace', 'project')),
          provenance TEXT NULL CHECK(provenance IN ('repo-skill', 'global-skill', 'repo-script', 'workspace-mode', 'project-mode', 'background-template')),
          resolution_status TEXT NOT NULL DEFAULT 'resolved' CHECK(resolution_status IN ('resolved', 'missing', 'out-of-scope')),
          resolution_error TEXT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
        );
        INSERT INTO assistant_asset_refs (
          id, assistant_id, kind, label, value, canonical_value, scope, provenance, resolution_status, resolution_error, created_at
        )
        SELECT
          id, assistant_id, kind, label, value, canonical_value, scope, provenance, COALESCE(resolution_status, 'resolved'), resolution_error, created_at
        FROM assistant_asset_refs_legacy;
        DROP TABLE assistant_asset_refs_legacy;
      `);
    }
  function backfillExecutionTargets() {
      db
        .query(`UPDATE agent_runs SET execution_target = 'current-project' WHERE execution_target IS NULL`)
        .run();
    }
  return {
    operations: {
      updateSubtask,
      rebuildAssistantAssetRefsTableIfNeeded,
      backfillExecutionTargets,
    },
    publicApi: {
    },
  };
}

export type WorkspaceBackgroundReadsOperations3Set = ReturnType<typeof createWorkspaceBackgroundReadsOperations3>["operations"];
