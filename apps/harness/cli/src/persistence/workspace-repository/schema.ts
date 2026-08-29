export const WORKSPACE_SCHEMA_SQL = `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        active_thread_id TEXT NULL,
        selected_mode_id TEXT NULL,
        rules_content TEXT NULL,
        rules_updated_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
        kind TEXT NOT NULL DEFAULT 'user' CHECK(kind IN ('user', 'automation')),
        title TEXT NULL,
        title_source TEXT NULL,
        updated_at TEXT NULL,
        forked_from_thread_id TEXT NULL,
        memory_summary_content TEXT NULL,
        memory_summary_updated_at TEXT NULL, message_revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS project_threads_project_status_idx
      ON project_threads(project_id, status);

      CREATE INDEX IF NOT EXISTS project_threads_project_updated_idx
      ON project_threads(project_id, updated_at DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
        content TEXT NOT NULL,
        attachments_json TEXT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
      ON thread_messages(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS chat_attachment_uploads (
        key TEXT PRIMARY KEY,
        project_id TEXT NULL,
        thread_id TEXT NULL,
        attachment_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gemini_cached_contents (
        project_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        attachment_set_hash TEXT NOT NULL,
        cached_content_name TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, model_id, attachment_set_hash),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS gemini_cached_contents_expiry_idx
      ON gemini_cached_contents(expires_at);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN (
          'planning',
          'awaiting-user-input',
          'ready',
          'running-main',
          'running-subagents',
          'aggregating',
          'partial-complete',
          'completed',
          'stopped',
          'failed'
        )),
        execution_target TEXT NULL CHECK(execution_target IN ('current-project', 'ephemeral-experiment')),
        latest_user_prompt TEXT NOT NULL,
        prompt_chars INTEGER NULL,
        prompt_hash TEXT NULL,
        transcript_chars INTEGER NULL,
        latest_task_chars INTEGER NULL,
        planning_model_id TEXT NULL,
        execution_model_id TEXT NULL,
        difficulty_score INTEGER NULL,
        summary TEXT NULL,
        final_execution_brief TEXT NULL,
        failure_message TEXT NULL,
        failure_category TEXT NULL,
        max_turns INTEGER NULL,
        turns_used INTEGER NOT NULL DEFAULT 0,
        plan_json TEXT NULL,
        correctness_review_json TEXT NULL,
        browser_sessions_json TEXT NULL,
        tool_activities_json TEXT NULL, thread_run_sequence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_runs_project_thread_updated_idx
      ON agent_runs(project_id, thread_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_run_questions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        logical_question_id TEXT NULL,
        planner_turn_id TEXT NULL,
        prompt_hash TEXT NULL,
        prompt TEXT NOT NULL,
        placeholder TEXT NULL,
        response_kind TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform')),
        choices_json TEXT NULL,
        intent_json TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered')),
        answer_text TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_run_questions_run_ordinal_idx
      ON agent_run_questions(run_id, ordinal ASC);

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx
      ON agent_run_questions(run_id, planner_turn_id, logical_question_id);

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx
      ON agent_run_questions(run_id, planner_turn_id, prompt_hash);

      CREATE TABLE IF NOT EXISTS agent_run_subtasks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        planner_task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        output TEXT NULL,
        error_message TEXT NULL,
        commit_sha TEXT NULL,
        worktree_path TEXT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_subtasks_run_planner_task_idx
      ON agent_run_subtasks(run_id, planner_task_id);

      CREATE TABLE IF NOT EXISTS agent_run_experiments (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('prepared', 'running', 'completed', 'partial-complete', 'failed', 'promoted', 'discarded')),
        virtual_branch_name TEXT NOT NULL,
        repo_mount_path TEXT NOT NULL,
        project_mount_path TEXT NOT NULL,
        base_commit_sha TEXT NULL,
        base_branch_name TEXT NULL,
        base_dirty_fingerprint TEXT NOT NULL,
        head_commit_sha TEXT NULL,
        files_changed INTEGER NOT NULL DEFAULT 0,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        promoted_at TEXT NULL,
        discarded_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NULL,
        thread_id TEXT NULL,
        run_id TEXT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('repo-fact', 'task-summary', 'success-pattern', 'failure-pattern', 'verification-recipe', 'fallback-strategy', 'prompt-fragment', 'user-correction')),
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence TEXT NULL,
        tags_json TEXT NULL,
        path_globs_json TEXT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
        pinned INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 50000,
        hit_count INTEGER NOT NULL DEFAULT 0,
        last_hit_at TEXT NULL,
        source_commit_sha TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS memory_retrievals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        owner TEXT NOT NULL CHECK(owner IN ('planner', 'main', 'subagent')),
        subagent_id TEXT NULL,
        query_text TEXT NOT NULL,
        entry_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_modes (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        planner_prompt TEXT NOT NULL,
        execution_prompt TEXT NOT NULL,
        tool_policy TEXT NOT NULL CHECK(tool_policy IN ('full-access', 'read-heavy', 'review-only')),
        execution_access TEXT NOT NULL CHECK(execution_access IN ('workspace-write', 'read-only')),
        plan_execution_mode_default TEXT NULL,
        subagent_worktree_strategy_default TEXT NULL,
        correctness_iteration_mode_default TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_modes (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        planner_prompt TEXT NOT NULL,
        execution_prompt TEXT NOT NULL,
        tool_policy TEXT NOT NULL CHECK(tool_policy IN ('full-access', 'read-heavy', 'review-only')),
        execution_access TEXT NOT NULL CHECK(execution_access IN ('workspace-write', 'read-only')),
        plan_execution_mode_default TEXT NULL,
        subagent_worktree_strategy_default TEXT NULL,
        correctness_iteration_mode_default TEXT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        template_id TEXT NULL,
        created_from_run_id TEXT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('ai-routine', 'shell')),
        name TEXT NOT NULL,
        description TEXT NULL,
        intent_contract_json TEXT NULL,
        lane TEXT NOT NULL DEFAULT 'exclusive' CHECK(lane IN ('exclusive', 'concurrent')),
        definition_json TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        schedule_input TEXT NOT NULL,
        timezone TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('enabled', 'paused', 'disabled')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
        next_run_at TEXT NULL,
        last_run_at TEXT NULL,
        last_enqueued_at TEXT NULL,
        scheduler_status TEXT NULL CHECK(scheduler_status IN ('idle', 'due', 'queued', 'blocked', 'running', 'stale')),
        scheduler_detail TEXT NULL,
        scheduler_queue_position INTEGER NULL,
        scheduler_queue_reason TEXT NULL,
        scheduler_blocked_since_at TEXT NULL,
        scheduler_active_run_id TEXT NULL,
        scheduler_active_run_started_at TEXT NULL,
        scheduler_last_progress_at TEXT NULL,
        scheduler_overloaded INTEGER NULL CHECK(scheduler_overloaded IN (0, 1)),
        scheduler_congestion_ratio REAL NULL,
        consecutive_failure_count INTEGER NULL,
        backoff_until TEXT NULL,
        last_failure_category TEXT NULL,
        last_scheduler_check_at TEXT NULL,
        last_blocked_at TEXT NULL,
        blocked_reason TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS background_jobs_project_next_run_idx
      ON background_jobs(project_id, next_run_at ASC);

      CREATE TABLE IF NOT EXISTS background_job_runs (
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

      CREATE INDEX IF NOT EXISTS background_job_runs_job_updated_idx
      ON background_job_runs(job_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS background_job_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        detail_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS background_job_run_events_run_ordinal_idx
      ON background_job_run_events(run_id, ordinal ASC);

      CREATE TABLE IF NOT EXISTS notifications (
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

      CREATE INDEX IF NOT EXISTS notifications_created_idx
      ON notifications(created_at DESC);

      CREATE TABLE IF NOT EXISTS background_job_templates (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('ai-routine', 'shell')),
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assistants (
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
        updated_at TEXT NOT NULL, mutation_revision INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(cloned_from_assistant_id) REFERENCES assistants(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS assistants_scope_project_idx
      ON assistants(scope, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_threads (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        memory_summary_content TEXT NULL,
        memory_summary_updated_at TEXT NULL,
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS assistant_messages (
        id TEXT PRIMARY KEY,
        assistant_thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
        content TEXT NOT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_thread_id) REFERENCES assistant_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_messages_thread_created_idx
      ON assistant_messages(assistant_thread_id, created_at);

      CREATE TABLE IF NOT EXISTS assistant_todos (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'in-progress', 'blocked', 'completed', 'failed', 'cancelled')),
        sort_order INTEGER NOT NULL,
        blocker_reason TEXT NULL,
        source TEXT NULL,
        work_kind TEXT NOT NULL DEFAULT 'unspecified' CHECK(work_kind IN ('app-code', 'automation-code', 'documentation', 'research', 'blocked', 'unspecified')),
        work_target TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NULL,
        cancelled_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_todos_assistant_sort_idx ON assistant_todos(assistant_id, sort_order ASC, updated_at DESC);
      CREATE INDEX IF NOT EXISTS assistant_todos_completed_retention_idx ON assistant_todos(completed_at, assistant_id) WHERE state = 'completed' AND completed_at IS NOT NULL;
      CREATE TABLE IF NOT EXISTS assistant_learnings (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
        sort_order INTEGER NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'summary')),
        supersedes_learning_ids_json TEXT NULL,
        compacted_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_learnings_assistant_created_idx
      ON assistant_learnings(assistant_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS assistant_learnings_assistant_sort_idx
      ON assistant_learnings(assistant_id, sort_order ASC, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_questions (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered', 'dismissed')),
        answer_text TEXT NULL,
        linked_todo_ids_json TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_questions_assistant_status_idx
      ON assistant_questions(assistant_id, status, asked_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_log_entries (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'critical')),
        summary TEXT NOT NULL,
        detail TEXT NULL,
        details_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_log_entries_assistant_created_idx
      ON assistant_log_entries(assistant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_asset_refs (
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
    `;
