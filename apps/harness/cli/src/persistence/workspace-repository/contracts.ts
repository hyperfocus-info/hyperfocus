import type { PersistedAssistantQuestionRow } from "../notification-persistence";
import { createRunDetailSnapshotStore } from "../run-detail-pagination";
import type { ProviderCredentialStore } from "../../provider-credential-store";
import type { AgentId, AgentRunStatus, AssistantTodo, AssistantTodoState, BackgroundJob, BackgroundJobRun, BackgroundJobRunStatus, BackgroundJobSchedulerStatus, BackgroundJobThreadKind, ChatMessageKind, ChatRole, CorrectnessIterationMode, ExperimentRun, MemoryEntry, MemoryEntryKind, MemoryEntryStatus, MemoryRetrieval, NotificationInboxItem, PlanExecutionMode, ProjectId, ProviderBrand, RunDiagnosticsOwnerPrompt, RunDiagnosticsPromptHash, RunExecutionTarget, RunFailureCategory, SubagentWorktreeStrategy, TerminalPaneLayout, TerminalPreferences, TerminalSession, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { Database } from "bun:sqlite";

export type WorkspaceRepositoryContext = {
  runDetailSnapshots: ReturnType<typeof createRunDetailSnapshotStore>;
  dbPath: string;
  repoRoot: string;
  allowDevThreadRecovery: boolean;
  providerCredentialStore: ProviderCredentialStore;
  instrumentation: WorkspaceRepositoryOptions["instrumentation"];
  db: Database;
};

export const ACTIVE_THREAD_STATUS = "active";

export const ACTIVE_PROJECT_KEY = "active_project_id";

export const NOTIFICATION_REVISION_KEY = "notification_revision";

export const OPENAI_API_KEY = "openai_api_key";

export const GOOGLE_API_KEY = "google_api_key";

export const ANTHROPIC_API_KEY = "anthropic_api_key";

export const PROVIDER_BRAND_KEY = "provider_brand";

export const DEBUG_ENABLED_KEY = "debug_enabled";

export const TRACE_PANEL_DEFAULT_OPEN_KEY = "trace_panel_default_open";

export const SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY = "subagent_worktree_strategy_default";

export const BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY = "block_chat_on_dirty_git_default";

export const DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY = "dirty_git_change_limit_default";

export const AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY = "auto_compact_context_threshold_percent_default";

export const PLAN_EXECUTION_MODE_DEFAULT_KEY = "plan_execution_mode_default";

export const PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY = "plan_execution_delay_seconds_default";

export const SINGLE_AGENT_MODEL_PREFERENCE_DEFAULT_KEY = "single_agent_model_preference_default";

export const SUBAGENT_MODEL_PREFERENCE_DEFAULT_KEY = "subagent_model_preference_default";

export const CORRECTNESS_ITERATION_MODE_DEFAULT_KEY = "correctness_iteration_mode_default";

export const BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY = "background_job_approval_policy_default";

export const ASSISTANT_AUTO_APPROVE_NON_BLOCKING_QUESTIONS_DEFAULT_KEY = "assistant_auto_approve_non_blocking_questions_default";

export const ASSISTANT_CONGESTION_CONTROL_ENABLED_DEFAULT_KEY = "assistant_congestion_control_enabled_default";

export const ASSISTANT_MAX_CONGESTION_DEFAULT_KEY = "assistant_max_congestion_default";

export const MAX_BACKGROUND_JOBS_DEFAULT_KEY = "max_background_jobs_default";

export const AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY = "auto_archive_completed_threads_default";

export const BACKGROUND_SCHEDULER_HEARTBEAT_KEY = "background_scheduler_heartbeat_at";

export const MEMORY_BANK_ENABLED_DEFAULT_KEY = "memory_bank_enabled_default";

export const MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY = "memory_bank_record_runs_default";

export const CHECK_CLI_UPDATES_DEFAULT_KEY = "check_cli_updates_default";

export const GLOBAL_EXECUTION_PAUSED_KEY = "global_execution_paused";

export const TOKEN_USAGE_LIFETIME_KEY = "token_usage_lifetime_v1";

export const TOKEN_USAGE_RESET_AT_KEY = "token_usage_reset_at";

export const ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS = 12000;

export const ASSISTANT_SUMMARY_PAGE_LIMIT = 128;

export const WORKSPACE_RULES_CONTENT_KEY = "workspace_rules_content";

export const WORKSPACE_RULES_UPDATED_AT_KEY = "workspace_rules_updated_at";

export const WORKSPACE_MEMORY_CONTENT_KEY = "workspace_memory_content";

export const WORKSPACE_MEMORY_UPDATED_AT_KEY = "workspace_memory_updated_at";

export const TERMINAL_STATE_KEY = "terminal_state_v1";

export const ASSISTANT_SELECT_SQL = `SELECT
  id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id, mode_id,
  intent_contract_json, provider_brand, execution_model_id, reasoning_strength, fast_mode, run_state, bootstrap_state,
  bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at, cloned_from_assistant_id, failure_streak_count,
  circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason, pending_reprioritize_requested_at,
  deleted_at, latest_activity_at, created_at, updated_at
 FROM assistants`;

export function ensureBackgroundJobPersistenceIndexes(db: Database) {
  db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_updated_failure_job_idx ON background_job_runs(updated_at, failure_category, job_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_prompt_updated_job_idx ON background_job_runs(prompt_hash, updated_at, job_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_status_lease_idx ON background_job_runs(status, controller_lease_expires_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS background_jobs_status_backoff_idx ON background_jobs(status, backoff_until);`);
}

export type PersistedTerminalState = {
  sessions: TerminalSession[];
  scrollbackBySessionId: Record<string, string>;
  preferences: TerminalPreferences;
  layout?: TerminalPaneLayout;
};

export type AssistantListInput = {
  cursor?: string;
  limit?: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  active_thread_id: string | null;
  selected_mode_id: string | null;
  rules_content: string | null;
  rules_updated_at: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
};

export type ThreadRow = {
  id: string;
  project_id: string;
  status: string;
  pinned: number;
  kind: BackgroundJobThreadKind;
  title: string;
  title_source: string | null;
  updated_at: string;
  forked_from_thread_id: string | null;
  memory_summary_content: string | null;
  memory_summary_updated_at: string | null;
  created_at: string;
  archived_at: string | null;
};

export type WorkspaceModeRow = {
  id: string;
  label: string;
  description: string;
  planner_prompt: string;
  execution_prompt: string;
  tool_policy: "full-access" | "read-heavy" | "review-only";
  execution_access: "workspace-write" | "read-only" | null;
  plan_execution_mode_default: PlanExecutionMode | null;
  subagent_worktree_strategy_default: SubagentWorktreeStrategy | null;
  correctness_iteration_mode_default: CorrectnessIterationMode | null;
  updated_at: string;
};

export type ProjectModeRow = WorkspaceModeRow & {
  project_id: string;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  role: ChatRole;
  kind: ChatMessageKind | null;
  content: string;
  attachments_json: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type AgentRunRow = {
  id: string;
  project_id: string;
  thread_id: string;
  status: AgentRunStatus;
  execution_target: RunExecutionTarget | null;
  latest_user_prompt: string;
  prompt_chars: number | null;
  prompt_hash: string | null;
  transcript_chars: number | null;
  latest_task_chars: number | null;
  planning_model_id: string | null;
  launch_profile_json: string | null;
  execution_model_id: string | null;
  difficulty_score: number | null;
  summary: string | null;
  final_execution_brief: string | null;
  failure_message: string | null;
  failure_category: RunFailureCategory | null;
  max_turns: number | null;
  turns_used: number;
  plan_json: string | null;
  correctness_review_json: string | null;
  browser_sessions_json: string | null;
  tool_activities_json: string | null;
  thread_run_sequence: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AgentRunQuestionRow = {
  id: string;
  run_id: string;
  ordinal: number;
  logical_question_id: string | null;
  planner_turn_id: string | null;
  prompt_hash: string | null;
  prompt: string;
  placeholder: string | null;
  response_kind: "choice" | "freeform";
  choices_json: string | null;
  intent_json: string | null;
  status: "pending" | "deferred" | "answered";
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
};

export type AgentRunSubtaskRow = {
  id: string;
  run_id: string;
  planner_task_id: string;
  title: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  attempt_count: number;
  output: string | null;
  error_message: string | null;
  commit_sha: string | null;
  worktree_path: string | null;
  mount_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type AgentRunExperimentRow = {
  id: string;
  run_id: string;
  status: ExperimentRun["status"];
  virtual_branch_name: string;
  repo_mount_path: string;
  project_mount_path: string;
  base_commit_sha: string | null;
  base_branch_name: string | null;
  base_dirty_fingerprint: string;
  head_commit_sha: string | null;
  files_changed: number;
  insertions: number;
  deletions: number;
  promoted_at: string | null;
  discarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryEntryRow = {
  id: string;
  project_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  kind: MemoryEntryKind;
  status: MemoryEntryStatus;
  title: string;
  summary: string;
  evidence: string | null;
  tags_json: string | null;
  path_globs_json: string | null;
  confidence: MemoryEntry["confidence"];
  pinned: number;
  priority: number;
  hit_count: number;
  last_hit_at: string | null;
  source_commit_sha: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryRetrievalRow = {
  id: string;
  run_id: string;
  owner: MemoryRetrieval["owner"];
  subagent_id: string | null;
  query_text: string;
  entry_ids_json: string;
  created_at: string;
};

export type BackgroundJobRow = {
  id: string;
  project_id: string;
  assistant_id: string | null;
  automation_thread_id: string;
  template_id: string | null;
  created_from_run_id: string | null;
  kind: BackgroundJob["kind"];
  name: string;
  description: string | null;
  intent_contract_json: string | null;
  lane: "exclusive" | "concurrent";
  definition_json: string;
  schedule_json: string;
  schedule_input: string;
  timezone: string | null;
  status: BackgroundJob["status"];
  risk_level: BackgroundJob["riskLevel"];
  next_run_at: string | null;
  last_run_at: string | null;
  last_enqueued_at: string | null;
  scheduler_status: BackgroundJobSchedulerStatus | null;
  scheduler_detail: string | null;
  scheduler_queue_position: number | null;
  scheduler_queue_reason: string | null;
  scheduler_blocked_since_at: string | null;
  scheduler_active_run_id: string | null;
  scheduler_active_run_started_at: string | null;
  scheduler_last_progress_at: string | null;
  scheduler_overloaded: number | null;
  scheduler_congestion_ratio: number | null;
  consecutive_failure_count: number | null;
  backoff_until: string | null;
  last_failure_category: RunFailureCategory | null;
  last_scheduler_check_at: string | null;
  last_blocked_at: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BackgroundJobRunRow = {
  id: string;
  job_id: string;
  project_id: string;
  assistant_id: string | null;
  automation_thread_id: string;
  trigger_source: BackgroundJobRun["triggerSource"];
  status: BackgroundJobRunStatus;
  risk_level: BackgroundJobRun["riskLevel"];
  approval_status: BackgroundJobRun["approvalStatus"];
  skipped_occurrence_count: number;
  linked_agent_run_id: string | null;
  summary: string | null;
  failure_message: string | null;
  failure_category: RunFailureCategory | null;
  prompt_chars: number | null;
  prompt_hash: string | null;
  transcript_chars: number | null;
  latest_task_chars: number | null;
  agent_id: BackgroundJobRun["agentId"] | null;
  provider_brand: BackgroundJobRun["providerBrand"] | null;
  planning_model_id: string | null;
  execution_model_id: string | null;
  reasoning_strength: BackgroundJobRun["reasoningStrength"] | null;
  fast_mode: number | null;
  controller_instance_id: string | null;
  controller_lease_id: string | null;
  controller_lease_expires_at: string | null;
  resume_attempt_count: number | null;
  last_heartbeat_at: string | null;
  heartbeat_stage: string | null;
  heartbeat_detail: string | null;
  timed_out_at: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BackgroundJobRunEventRow = {
  id: string;
  run_id: string;
  ordinal: number;
  stage: string;
  message: string;
  detail_json: string | null;
  created_at: string;
};

export type ChatAttachmentUploadRow = {
  key: string;
  project_id: string | null;
  thread_id: string | null;
  attachment_json: string;
  created_at: string;
};

export type GeminiCachedContentRecord = {
  projectId: ProjectId;
  modelId: string;
  attachmentSetHash: string;
  cachedContentName: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type GeminiCachedContentRow = {
  project_id: string;
  model_id: string;
  attachment_set_hash: string;
  cached_content_name: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  kind: NotificationInboxItem["kind"];
  interactive: number;
  project_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  assistant_id: string | null;
  question_id: string | null;
  session_id: string | null;
  tool_call_id: string | null;
  background_run_id: string | null;
  job_id: string | null;
  payload_json: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

export type AssistantRow = {
  id: string;
  name: string;
  scope: "global" | "project";
  project_id: string | null;
  description: string | null;
  personality_prompt: string;
  job_prompt: string;
  intent_contract_json: string | null;
  agent_id: AgentId;
  provider_brand: ProviderBrand | null;
  mode_id: string | null;
  execution_model_id: string | null;
  reasoning_strength: "low" | "medium" | "high" | "extra-high" | null;
  fast_mode: number | null;
  run_state: "active" | "paused";
  bootstrap_state: "pending" | "running" | "completed" | "failed";
  bootstrap_attempt_id: string | null;
  bootstrap_started_at: string | null;
  bootstrap_finished_at: string | null;
  cloned_from_assistant_id: string | null;
  failure_streak_count: number;
  circuit_breaker_state: "closed" | "tripped";
  circuit_breaker_reason: string | null;
  pending_reprioritize_reason: string | null;
  pending_reprioritize_requested_at: string | null;
  deleted_at: string | null;
  latest_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssistantThreadRow = {
  id: string;
  assistant_id: string;
  session_id: string;
  memory_summary_content: string | null;
  memory_summary_updated_at: string | null;
  updated_at: string;
  created_at: string;
};

export type AssistantMessageRow = {
  id: string;
  assistant_thread_id: string;
  role: ChatRole;
  kind: ChatMessageKind | null;
  content: string;
  metadata_json: string | null;
  created_at: string;
};

export type AssistantTodoRow = {
  id: string;
  assistant_id: string;
  title: string;
  description: string | null;
  state: AssistantTodoState;
  sort_order: number;
  blocker_reason: string | null;
  source: string | null;
  work_kind: string | null;
  work_target: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type AssistantTodoInput = Omit<AssistantTodo, "workKind" | "workTarget"> & Partial<Pick<AssistantTodo, "workKind" | "workTarget">>;

export type AssistantLearningRow = {
  id: string;
  assistant_id: string;
  summary: string;
  source: string;
  confidence: "low" | "medium" | "high";
  sort_order: number | null;
  created_at: string;
  kind: "fact" | "summary" | null;
  supersedes_learning_ids_json: string | null;
  compacted_at: string | null;
};

export const ASSISTANT_COMPLETED_TODO_RETENTION_MS = 1209600000;

export type AssistantQuestionRow = PersistedAssistantQuestionRow;

export type AssistantLogEntryRow = {
  id: string;
  assistant_id: string;
  level: "info" | "warning" | "error" | "critical";
  summary: string;
  detail: string | null;
  details_json: string | null;
  created_at: string;
};

export type AssistantAssetRefRow = {
  id: string;
  assistant_id: string;
  kind: "skill" | "script" | "mode" | "background-template";
  label: string;
  value: string;
  canonical_value: string | null;
  scope: "workspace" | "project" | null;
  provenance: "repo-skill" | "global-skill" | "repo-script" | "workspace-mode" | "project-mode" | "background-template" | null;
  resolution_status: "resolved" | "missing" | "out-of-scope" | null;
  resolution_error: string | null;
  created_at: string;
};

export type OpenProjectResult = {
  project: WorkspaceProjectState;
  resolution: "created-project" | "existing-project-new-thread";
};

export type WorkspaceRepositoryOptions = {
  durability?: "production" | "test-fast";
  providerCredentialStore?: ProviderCredentialStore;
  instrumentation?: {
    onHydrateRunState?(runId: string): void;
    onReadActiveRun?(runId: string | undefined): void;
    onRunDetailPage?(runId: string): void;
    onBeforePersistenceMigrationCommit?(migrationId: string): void;
  };
};

export type RunDiagnosticsQueryReport = {
  topPromptHashes: RunDiagnosticsPromptHash[];
  promptSizeByOwner: RunDiagnosticsOwnerPrompt[];
  failureRows: Array<{
    sourceType: "agent-run" | "background-job-run";
    day: string;
    failureCategory: RunFailureCategory;
    assistantId?: string;
    jobId?: string;
    count: number;
  }>;
};
