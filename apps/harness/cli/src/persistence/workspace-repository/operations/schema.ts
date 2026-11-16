import type { WorkspaceAssistantReadsOperationsSet } from "./assistant-reads";
import type { WorkspaceBackgroundReadsOperations2Set, WorkspaceBackgroundReadsOperations3Set } from "./background-reads";
import type { WorkspaceMigrationSupportOperations2Set, WorkspaceMigrationSupportOperations4Set } from "./migration-support";
import type { WorkspaceRepositoryContext } from "../contracts";
import { WORKSPACE_SCHEMA_SQL } from "../schema";
import { ensureAssistantPersistenceIndexes } from "../../assistant-schema";
import { ensureBackgroundJobPersistenceIndexes } from "../contracts";
import { runWorkspaceSchemaMigrations } from "../schema-migrations";

export function createWorkspaceSchemaOperations(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet & WorkspaceMigrationSupportOperations2Set & WorkspaceBackgroundReadsOperations2Set & WorkspaceMigrationSupportOperations4Set & WorkspaceBackgroundReadsOperations3Set) {
  const { db } = context;
  function migrate() {
      db.exec(WORKSPACE_SCHEMA_SQL);
  
      operations.addColumnIfMissing("projects", "active_thread_id", "TEXT NULL");
      operations.addColumnIfMissing("projects", "selected_mode_id", "TEXT NULL");
      operations.addColumnIfMissing("projects", "rules_content", "TEXT NULL");
      operations.addColumnIfMissing("projects", "rules_updated_at", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "kind", "TEXT NOT NULL DEFAULT 'user'");
      operations.addColumnIfMissing("project_threads", "title", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "title_source", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "updated_at", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "forked_from_thread_id", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "memory_summary_content", "TEXT NULL");
      operations.addColumnIfMissing("project_threads", "memory_summary_updated_at", "TEXT NULL"); operations.addColumnIfMissing("project_threads", "message_revision", "INTEGER NOT NULL DEFAULT 0");
      operations.addColumnIfMissing("thread_messages", "kind", "TEXT NOT NULL DEFAULT 'plain'");
      operations.addColumnIfMissing("thread_messages", "attachments_json", "TEXT NULL");
      operations.addColumnIfMissing("thread_messages", "metadata_json", "TEXT NULL");
      operations.addColumnIfMissing(
        "workspace_modes",
        "execution_access",
        "TEXT NULL CHECK(execution_access IN ('workspace-write', 'read-only'))"
      );
      operations.addColumnIfMissing(
        "project_modes",
        "execution_access",
        "TEXT NULL CHECK(execution_access IN ('workspace-write', 'read-only'))"
      );
      operations.addColumnIfMissing("agent_run_questions", "choices_json", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_questions", "response_kind", "TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform'))");
      operations.addColumnIfMissing("agent_run_questions", "intent_json", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_questions", "logical_question_id", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_questions", "planner_turn_id", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_questions", "prompt_hash", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_subtasks", "commit_sha", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_subtasks", "worktree_path", "TEXT NULL");
      operations.addColumnIfMissing("agent_run_subtasks", "mount_path", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "execution_target", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "prompt_chars", "INTEGER NULL");
      operations.addColumnIfMissing("agent_runs", "prompt_hash", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "transcript_chars", "INTEGER NULL");
      operations.addColumnIfMissing("agent_runs", "latest_task_chars", "INTEGER NULL");
      operations.addColumnIfMissing("agent_runs", "plan_json", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "correctness_review_json", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "browser_sessions_json", "TEXT NULL"); operations.addColumnIfMissing("agent_runs", "has_actionable_browser_approval", "INTEGER NOT NULL DEFAULT 0");
      operations.addColumnIfMissing("agent_runs", "tool_activities_json", "TEXT NULL"); operations.addColumnIfMissing("agent_runs", "thread_run_sequence", "INTEGER NOT NULL DEFAULT 0");
      operations.addColumnIfMissing("agent_runs", "failure_category", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "max_turns", "INTEGER NULL");
      operations.addColumnIfMissing("agent_runs", "launch_profile_json", "TEXT NULL");
      operations.addColumnIfMissing("agent_runs", "turns_used", "INTEGER NOT NULL DEFAULT 0");
      operations.addColumnIfMissing("project_threads", "pinned", "INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1))");
      operations.addColumnIfMissing("memory_entries", "priority", "INTEGER NOT NULL DEFAULT 50000");
      operations.addColumnIfMissing("background_jobs", "assistant_id", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "intent_contract_json", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "lane", "TEXT NOT NULL DEFAULT 'exclusive' CHECK(lane IN ('exclusive', 'concurrent'))");
      operations.addColumnIfMissing(
        "background_jobs",
        "scheduler_status",
        "TEXT NULL CHECK(scheduler_status IN ('idle', 'due', 'queued', 'blocked', 'running', 'stale'))"
      );
      operations.addColumnIfMissing("background_jobs", "scheduler_detail", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_queue_position", "INTEGER NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_queue_reason", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_blocked_since_at", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_active_run_id", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_active_run_started_at", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_last_progress_at", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "scheduler_overloaded", "INTEGER NULL CHECK(scheduler_overloaded IN (0, 1))");
      operations.addColumnIfMissing("background_jobs", "scheduler_congestion_ratio", "REAL NULL");
      operations.addColumnIfMissing("background_jobs", "consecutive_failure_count", "INTEGER NULL");
      operations.addColumnIfMissing("background_jobs", "backoff_until", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "last_failure_category", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "last_scheduler_check_at", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "last_blocked_at", "TEXT NULL");
      operations.addColumnIfMissing("background_jobs", "blocked_reason", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "assistant_id", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "failure_category", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "prompt_chars", "INTEGER NULL");
      operations.addColumnIfMissing("background_job_runs", "prompt_hash", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "transcript_chars", "INTEGER NULL");
      operations.addColumnIfMissing("background_job_runs", "latest_task_chars", "INTEGER NULL");
      operations.addColumnIfMissing("background_job_runs", "agent_id", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "provider_brand", "TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini', 'claude'))");
      operations.addColumnIfMissing("background_job_runs", "planning_model_id", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "execution_model_id", "TEXT NULL");
      operations.addColumnIfMissing(
        "background_job_runs",
        "reasoning_strength",
        "TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high'))"
      );
      operations.addColumnIfMissing("background_job_runs", "fast_mode", "INTEGER NULL CHECK(fast_mode IN (0, 1))");
      operations.addColumnIfMissing("background_job_runs", "controller_instance_id", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "controller_lease_id", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "controller_lease_expires_at", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "resume_attempt_count", "INTEGER NULL");
      operations.addColumnIfMissing("background_job_runs", "last_heartbeat_at", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "heartbeat_stage", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "heartbeat_detail", "TEXT NULL");
      operations.addColumnIfMissing("background_job_runs", "timed_out_at", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "intent_contract_json", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "provider_brand", "TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini'))");
      operations.addColumnIfMissing("assistants", "fast_mode", "INTEGER NULL CHECK(fast_mode IN (0, 1))");
      operations.addColumnIfMissing(
        "assistants",
        "reasoning_strength",
        "TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high'))"
      );
      operations.addColumnIfMissing("assistants", "bootstrap_attempt_id", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "bootstrap_started_at", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "bootstrap_finished_at", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "pending_reprioritize_reason", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "pending_reprioritize_requested_at", "TEXT NULL");
      operations.addColumnIfMissing("assistants", "todo_revision", "INTEGER NOT NULL DEFAULT 0"); operations.addColumnIfMissing("assistants", "mutation_revision", "INTEGER NOT NULL DEFAULT 0");
      runWorkspaceSchemaMigrations(db, context.instrumentation);
      operations.addColumnIfMissing(
        "assistant_todos",
        "work_kind",
        "TEXT NOT NULL DEFAULT 'unspecified' CHECK(work_kind IN ('app-code', 'automation-code', 'documentation', 'research', 'blocked', 'unspecified'))"
      );
      operations.addColumnIfMissing("assistant_todos", "work_target", "TEXT NULL");
      operations.addColumnIfMissing("assistant_learnings", "kind", "TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'summary'))");
      operations.addColumnIfMissing("assistant_learnings", "supersedes_learning_ids_json", "TEXT NULL");
      operations.addColumnIfMissing("assistant_learnings", "compacted_at", "TEXT NULL");
      operations.addColumnIfMissing("assistant_learnings", "sort_order", "INTEGER NULL");
      operations.addColumnIfMissing("assistant_asset_refs", "canonical_value", "TEXT NULL");
      operations.addColumnIfMissing("assistant_asset_refs", "scope", "TEXT NULL CHECK(scope IN ('workspace', 'project'))");
      operations.addColumnIfMissing(
        "assistant_asset_refs",
        "provenance",
        "TEXT NULL CHECK(provenance IN ('repo-skill', 'global-skill', 'repo-script', 'workspace-mode', 'project-mode', 'background-template'))"
      );
      operations.addColumnIfMissing("assistant_asset_refs", "resolution_status",
        "TEXT NOT NULL DEFAULT 'resolved' CHECK(resolution_status IN ('resolved', 'missing', 'out-of-scope'))");
      operations.addColumnIfMissing("assistant_asset_refs", "resolution_error", "TEXT NULL");
      operations.rebuildAssistantAssetRefsTableIfNeeded();
      db.exec(`DROP INDEX IF EXISTS project_threads_active_project_idx;`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx ON agent_run_questions(run_id, planner_turn_id, logical_question_id);`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx ON agent_run_questions(run_id, planner_turn_id, prompt_hash);`);
      db.exec(`CREATE INDEX IF NOT EXISTS agent_runs_updated_failure_idx ON agent_runs(updated_at, failure_category);`);
      db.exec(`CREATE INDEX IF NOT EXISTS agent_runs_prompt_updated_idx ON agent_runs(prompt_hash, updated_at);`);
      ensureBackgroundJobPersistenceIndexes(db);
      db.exec(`UPDATE project_threads SET title_source = 'custom' WHERE title_source = 'manual';`);
      db.exec(`UPDATE project_threads SET title_source = 'generated' WHERE title_source IS NULL OR title_source NOT IN ('generated', 'custom');`);
      operations.normalizeLegacyAssistantTodoSources();
      operations.normalizeLegacyAssistantTodoWorkKinds();
      operations.rebuildAgentRunQuestionsTableIfNeeded();
      operations.rebuildThreadMessagesTableIfNeeded();
      operations.rebuildAssistantQuestionsTableIfNeeded();
      ensureAssistantPersistenceIndexes(db);
      operations.backfillActiveThreadIds();
      operations.backfillThreadMetadata();
      operations.backfillQuestionChoices();
      operations.backfillExecutionTargets();
      operations.deleteGarbageAssistantLearnings();
      operations.seedBackgroundJobTemplates();
    }
  return {
    operations: {
      migrate,
    },
    publicApi: {
    },
  };
}

export type WorkspaceSchemaOperationsSet = ReturnType<typeof createWorkspaceSchemaOperations>["operations"];
