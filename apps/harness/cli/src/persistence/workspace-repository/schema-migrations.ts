import { migrateUsageLedger } from "../../usage/usage-ledger";
import type { Database } from "bun:sqlite";
import { runPersistenceMigrationOnce } from "../persistence-migrations";

export const BACKGROUND_RUN_HISTORY_MIGRATION_ID = "0001-background-run-history-v1";
export const ASSISTANT_PROVIDER_BRAND_MIGRATION_ID = "0002-assistant-provider-brand-v1";
export const NOTIFICATION_KIND_MIGRATION_ID = "0003-notification-kind-v1";

type MigrationInstrumentation = {
  onBeforePersistenceMigrationCommit?(migrationId: string): void;
};

type ForeignKeyViolation = {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
};

function readTableCreateSql(db: Database, tableName: string) {
  return db
    .query<{ sql: string }, [string]>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1")
    .get(tableName)?.sql ?? "";
}

function assertNoForeignKeyViolations(db: Database) {
  const violations = db.query<ForeignKeyViolation, []>("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    const first = violations[0]!;
    throw new Error(`Persistence migration left an invalid foreign key: ${first.table}.${first.rowid} -> ${first.parent}`);
  }
}

function rebuildBackgroundRunHistory(db: Database) {
  db.exec(`
    CREATE TEMP TABLE background_job_run_events_migration_backup AS
    SELECT id, run_id, ordinal, stage, message, detail_json, created_at
    FROM background_job_run_events;

    CREATE TEMP TABLE notifications_migration_backup AS
    SELECT id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id,
           session_id, tool_call_id, background_run_id, job_id, payload_json, created_at, read_at, archived_at
    FROM notifications;

    DROP TABLE background_job_run_events;
    DROP TABLE notifications;
    ALTER TABLE background_job_runs RENAME TO background_job_runs_migration_legacy;

    CREATE TABLE background_job_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      assistant_id TEXT NULL,
      automation_thread_id TEXT NOT NULL,
      trigger_source TEXT NOT NULL CHECK(trigger_source IN ('schedule', 'startup-catchup', 'manual', 'approval-release', 'retry')),
      status TEXT NOT NULL CHECK(status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running', 'succeeded', 'partial-complete', 'failed', 'cancelled', 'skipped')),
      risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
      approval_status TEXT NOT NULL CHECK(approval_status IN ('not-needed', 'pending', 'approved', 'rejected')),
      skipped_occurrence_count INTEGER NOT NULL DEFAULT 0,
      linked_agent_run_id TEXT NULL,
      summary TEXT NULL,
      failure_message TEXT NULL,
      failure_category TEXT NULL,
      prompt_chars INTEGER NULL,
      prompt_hash TEXT NULL,
      transcript_chars INTEGER NULL,
      latest_task_chars INTEGER NULL,
      agent_id TEXT NULL,
      provider_brand TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini', 'claude')),
      planning_model_id TEXT NULL,
      execution_model_id TEXT NULL,
      reasoning_strength TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high')),
      fast_mode INTEGER NULL CHECK(fast_mode IN (0, 1)),
      controller_instance_id TEXT NULL,
      controller_lease_id TEXT NULL,
      controller_lease_expires_at TEXT NULL,
      resume_attempt_count INTEGER NULL,
      last_heartbeat_at TEXT NULL,
      heartbeat_stage TEXT NULL,
      heartbeat_detail TEXT NULL,
      timed_out_at TEXT NULL,
      queued_at TEXT NOT NULL,
      started_at TEXT NULL,
      completed_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
      FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
    );

    INSERT INTO background_job_runs (
      id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
      skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
      prompt_chars, prompt_hash, transcript_chars, latest_task_chars, agent_id, provider_brand,
      planning_model_id, execution_model_id, reasoning_strength, fast_mode, controller_instance_id,
      controller_lease_id, controller_lease_expires_at, resume_attempt_count, last_heartbeat_at,
      heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at, completed_at, created_at, updated_at
    )
    SELECT
      id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
      skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
      prompt_chars, prompt_hash, transcript_chars, latest_task_chars, agent_id, provider_brand,
      planning_model_id, execution_model_id, reasoning_strength, fast_mode, controller_instance_id,
      controller_lease_id, controller_lease_expires_at, COALESCE(resume_attempt_count, 0), last_heartbeat_at,
      heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at, completed_at, created_at, updated_at
    FROM background_job_runs_migration_legacy;

    DROP TABLE background_job_runs_migration_legacy;

    CREATE TABLE background_job_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL,
      detail_json TEXT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE
    );
    INSERT INTO background_job_run_events
    SELECT id, run_id, ordinal, stage, message, detail_json, created_at
    FROM background_job_run_events_migration_backup;
    DROP TABLE background_job_run_events_migration_backup;

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('planning-question', 'planning-question-batch', 'assistant-question', 'assistant-question-batch', 'browser-approval', 'background-run-status', 'cli-update')),
      interactive INTEGER NOT NULL CHECK(interactive IN (0, 1)),
      project_id TEXT NULL,
      thread_id TEXT NULL,
      run_id TEXT NULL,
      assistant_id TEXT NULL,
      question_id TEXT NULL,
      session_id TEXT NULL,
      tool_call_id TEXT NULL,
      background_run_id TEXT NULL,
      job_id TEXT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT NULL,
      archived_at TEXT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
      FOREIGN KEY(background_run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
    );
    INSERT INTO notifications
    SELECT id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id,
           session_id, tool_call_id, background_run_id, job_id, payload_json, created_at, read_at, archived_at
    FROM notifications_migration_backup;
    DROP TABLE notifications_migration_backup;

    CREATE INDEX background_job_runs_job_updated_idx ON background_job_runs(job_id, updated_at DESC);
    CREATE INDEX background_job_run_events_run_ordinal_idx ON background_job_run_events(run_id, ordinal ASC);
    CREATE INDEX notifications_created_idx ON notifications(created_at DESC);
  `);
}

function rebuildAssistantProviderBrandConstraint(db: Database) {
  db.exec(`
    ALTER TABLE assistants RENAME TO assistants_migration_legacy;
    CREATE TABLE assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
      project_id TEXT NULL,
      description TEXT NULL,
      personality_prompt TEXT NOT NULL,
      job_prompt TEXT NOT NULL,
      intent_contract_json TEXT NULL,
      agent_id TEXT NOT NULL CHECK(agent_id IN ('pi', 'copilot-cli', 'codex-cli')),
      provider_brand TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini', 'claude')),
      mode_id TEXT NULL,
      execution_model_id TEXT NULL,
      reasoning_strength TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high')),
      fast_mode INTEGER NULL CHECK(fast_mode IN (0, 1)),
      run_state TEXT NOT NULL CHECK(run_state IN ('active', 'paused')),
      bootstrap_state TEXT NOT NULL CHECK(bootstrap_state IN ('pending', 'running', 'completed', 'failed')),
      bootstrap_attempt_id TEXT NULL,
      bootstrap_started_at TEXT NULL,
      bootstrap_finished_at TEXT NULL,
      cloned_from_assistant_id TEXT NULL,
      failure_streak_count INTEGER NOT NULL DEFAULT 0,
      circuit_breaker_state TEXT NOT NULL DEFAULT 'closed' CHECK(circuit_breaker_state IN ('closed', 'tripped')),
      circuit_breaker_reason TEXT NULL,
      pending_reprioritize_reason TEXT NULL,
      pending_reprioritize_requested_at TEXT NULL,
      deleted_at TEXT NULL,
      latest_activity_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      todo_revision INTEGER NOT NULL DEFAULT 0,
      mutation_revision INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(cloned_from_assistant_id) REFERENCES assistants(id) ON DELETE SET NULL
    );
    INSERT INTO assistants (
      id, name, scope, project_id, description, personality_prompt, job_prompt, intent_contract_json,
      agent_id, provider_brand, mode_id, execution_model_id, reasoning_strength, fast_mode, run_state,
      bootstrap_state, bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at,
      cloned_from_assistant_id, failure_streak_count, circuit_breaker_state, circuit_breaker_reason,
      pending_reprioritize_reason, pending_reprioritize_requested_at, deleted_at, latest_activity_at,
      created_at, updated_at, todo_revision, mutation_revision
    )
    SELECT
      id, name, scope, project_id, description, personality_prompt, job_prompt, intent_contract_json,
      agent_id, provider_brand, mode_id, execution_model_id, reasoning_strength, fast_mode, run_state,
      bootstrap_state, bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at,
      cloned_from_assistant_id, failure_streak_count, circuit_breaker_state, circuit_breaker_reason,
      pending_reprioritize_reason, pending_reprioritize_requested_at, deleted_at, latest_activity_at,
      created_at, updated_at, todo_revision, mutation_revision
    FROM assistants_migration_legacy;
    DROP TABLE assistants_migration_legacy;
    CREATE INDEX assistants_scope_project_idx ON assistants(scope, project_id, updated_at DESC);
  `);
}

function rebuildNotifications(db: Database) {
  db.exec(`
    ALTER TABLE notifications RENAME TO notifications_migration_legacy;
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('planning-question', 'planning-question-batch', 'assistant-question', 'assistant-question-batch', 'browser-approval', 'background-run-status', 'cli-update')),
      interactive INTEGER NOT NULL CHECK(interactive IN (0, 1)),
      project_id TEXT NULL,
      thread_id TEXT NULL,
      run_id TEXT NULL,
      assistant_id TEXT NULL,
      question_id TEXT NULL,
      session_id TEXT NULL,
      tool_call_id TEXT NULL,
      background_run_id TEXT NULL,
      job_id TEXT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT NULL,
      archived_at TEXT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
      FOREIGN KEY(background_run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
    );
    INSERT INTO notifications
    SELECT id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id,
           session_id, tool_call_id, background_run_id, job_id, payload_json, created_at, read_at, archived_at
    FROM notifications_migration_legacy;
    DROP TABLE notifications_migration_legacy;
    CREATE INDEX notifications_created_idx ON notifications(created_at DESC);
  `);
}

function finishMigration(db: Database, instrumentation: MigrationInstrumentation | undefined, migrationId: string) {
  assertNoForeignKeyViolations(db);
  instrumentation?.onBeforePersistenceMigrationCommit?.(migrationId);
}

export function runWorkspaceSchemaMigrations(db: Database, instrumentation?: MigrationInstrumentation) {
  migrateUsageLedger(db);
  runPersistenceMigrationOnce(db, BACKGROUND_RUN_HISTORY_MIGRATION_ID, () => {
    const runSql = readTableCreateSql(db, "background_job_runs");
    const eventSql = readTableCreateSql(db, "background_job_run_events");
    const notificationSql = readTableCreateSql(db, "notifications");
    if (!runSql.includes("'awaiting-user-input'") || !runSql.includes("'partial-complete'") ||
        !eventSql.includes("REFERENCES background_job_runs(") ||
        !notificationSql.includes("REFERENCES background_job_runs(")) {
      rebuildBackgroundRunHistory(db);
    }
    finishMigration(db, instrumentation, BACKGROUND_RUN_HISTORY_MIGRATION_ID);
  });

  const assistantNeedsMigration = !readTableCreateSql(db, "assistants").includes("'claude'");
  const previousLegacyAlterTable = db.query<{ legacy_alter_table: number }, []>("PRAGMA legacy_alter_table").get()?.legacy_alter_table ?? 0;
  const previousForeignKeys = db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()?.foreign_keys ?? 0;
  if (assistantNeedsMigration) db.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;");
  try {
    runPersistenceMigrationOnce(db, ASSISTANT_PROVIDER_BRAND_MIGRATION_ID, () => {
      if (assistantNeedsMigration) rebuildAssistantProviderBrandConstraint(db);
      finishMigration(db, instrumentation, ASSISTANT_PROVIDER_BRAND_MIGRATION_ID);
    });
  } finally {
    db.exec(`PRAGMA legacy_alter_table = ${previousLegacyAlterTable};`);
    db.exec(`PRAGMA foreign_keys = ${previousForeignKeys};`);
  }

  runPersistenceMigrationOnce(db, NOTIFICATION_KIND_MIGRATION_ID, () => {
    const notificationSql = readTableCreateSql(db, "notifications");
    if (!notificationSql.includes("'planning-question-batch'") ||
        !notificationSql.includes("'assistant-question-batch'") || !notificationSql.includes("'cli-update'")) {
      rebuildNotifications(db);
    }
    finishMigration(db, instrumentation, NOTIFICATION_KIND_MIGRATION_ID);
  });
}
