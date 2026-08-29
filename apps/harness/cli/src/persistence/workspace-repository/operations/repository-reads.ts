import type { AgentRunExperimentRow, AgentRunQuestionRow, AgentRunRow, AgentRunSubtaskRow, MemoryRetrievalRow, WorkspaceRepositoryContext } from "../contracts";
import type { AgentRunState, AgentRunSummary, MemoryRetrieval, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";
import type { AgentRunSummaryRow } from "../../run-summary-projection";
import type { WorkspaceBackgroundReadsOperations2Set } from "./background-reads";
import type { WorkspaceMigrationSupportOperations2Set, WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectReadsOperationsSet } from "./project-reads";
import { ACTIVE_PROJECT_KEY } from "../contracts";
import { agentRunStateSchema } from "@hyperfocus/ai-core/protocol";
import { buildRunPromptStats, buildRunRuntimeBudget, isThreadLoadError, normalizeRunFailureCategory, parseBrowserSessions, parseCorrectnessReview, parseExecutionPlan, parsePlanningChoices, parsePlanningQuestionIntent, parseToolActivities } from "../models";
import { isRunResumable, isRunRetryable, toAgentRunSummaryRow } from "../../run-summary-projection";
import { normalizeInteger, normalizeOptionalInteger, normalizeOptionalString, normalizeRequiredString, safeParsePersisted } from "../persisted-values";

export function createWorkspaceRepositoryReadsOperations(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet) {
  const { db } = context;
  function assertProjectExists(projectId: ProjectId) {
      const project = db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?1`).get(projectId);
      if (!project) {
        throw new Error(`Unknown project: ${projectId}`);
      }
    }
  function assertAssistantTodosBelongToAssistant(assistantId: string, todoIds: string[]) {
      if (todoIds.length === 0) {
        return;
      }
      const uniqueIds = [...new Set(todoIds)];
      const rows = db
        .query<{ id: string }, [string, string]>(
          `SELECT id FROM assistant_todos WHERE assistant_id = ?1 AND id IN (SELECT value FROM json_each(?2))`
        )
        .all(assistantId, JSON.stringify(uniqueIds));
      if (rows.length !== uniqueIds.length) {
        throw new Error("Assistant todo reorder contains unknown todo");
      }
    }
  function assertAssistantLearningsBelongToAssistant(assistantId: string, learningIds: string[]) {
      if (learningIds.length === 0) {
        return;
      }
      const uniqueIds = [...new Set(learningIds)];
      const rows = db
        .query<{ id: string }, [string, string]>(
          `SELECT id FROM assistant_learnings WHERE assistant_id = ?1 AND id IN (SELECT value FROM json_each(?2))`
        )
        .all(assistantId, JSON.stringify(uniqueIds));
      if (rows.length !== uniqueIds.length) {
        throw new Error("Assistant learning reorder contains unknown learning");
      }
    }
  function assistantExists(assistantId: string) {
      return Boolean(
        db.query<{ id: string }, [string]>(`SELECT id FROM assistants WHERE id = ?1 AND deleted_at IS NULL`).get(assistantId)
      );
    }
  function assertAssistantExists(assistantId: string) {
      if (!assistantExists(assistantId)) {
        throw new Error(`Unknown assistant: ${assistantId}`);
      }
    }
  function assertRunExists(projectId: ProjectId, runId: string) {
      const run = db
        .query<{ id: string }, [string, string]>(`SELECT id FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
        .get(runId, projectId);
  
      if (!run) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
    }
  function resolveThreadId(projectId: ProjectId, threadId?: ThreadId) {
      return threadId ?? (operations.readActiveThreadRow(projectId).id);
    }
  function readRunRow(projectId: ProjectId, threadId: ThreadId, runId: string) {
      return db
        .query<AgentRunRow, [string, string, string]>(
          `SELECT
            id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
            browser_sessions_json, tool_activities_json, thread_run_sequence,
            created_at, updated_at, completed_at
           FROM agent_runs
           WHERE project_id = ?1 AND thread_id = ?2 AND id = ?3`
        )
        .get(projectId, threadId, runId);
    }
  function readThreadRunSummaries(projectId: ProjectId, threadId: ThreadId): AgentRunSummary[] {
      return db
        .query<AgentRunSummaryRow, [string, string]>(
          `SELECT id, project_id, thread_id, status, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            final_execution_brief, failure_message, failure_category, max_turns, turns_used,
            EXISTS(SELECT 1 FROM agent_run_subtasks WHERE run_id = agent_runs.id) AS has_subtasks, thread_run_sequence, updated_at, completed_at
           FROM agent_runs
           WHERE project_id = ?1 AND thread_id = ?2
           ORDER BY updated_at DESC`
        )
        .all(projectId, threadId)
        .map(toAgentRunSummaryRow)
        .filter((run): run is AgentRunSummary => run !== undefined);
    }
  return {
    operations: {
      assertProjectExists,
      assertAssistantTodosBelongToAssistant,
      assertAssistantLearningsBelongToAssistant,
      assistantExists,
      assertAssistantExists,
      assertRunExists,
      resolveThreadId,
      readRunRow,
      readThreadRunSummaries,
    },
    publicApi: {
    },
  };
}

export type WorkspaceRepositoryReadsOperationsSet = ReturnType<typeof createWorkspaceRepositoryReadsOperations>["operations"];

export function createWorkspaceRepositoryReadsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  const { db } = context;
  function resolveActiveProjectId(projectIds: ProjectId[]) {
      if (projectIds.length === 0) {
        operations.deleteWorkspaceMetaValue(ACTIVE_PROJECT_KEY);
        return undefined;
      }
  
      const activeProjectId = db
        .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
        .get(ACTIVE_PROJECT_KEY)?.value;
  
      if (activeProjectId && projectIds.includes(activeProjectId)) {
        return activeProjectId;
      }
  
      const fallbackProjectId = projectIds[0];
      operations.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, fallbackProjectId);
      return fallbackProjectId;
    }
  return {
    operations: {
      resolveActiveProjectId,
    },
    publicApi: {
    },
  };
}

export type WorkspaceRepositoryReadsOperations2Set = ReturnType<typeof createWorkspaceRepositoryReadsOperations2>["operations"];

export function createWorkspaceRepositoryReadsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperations2Set) {
  const { allowDevThreadRecovery, db } = context;
  function tryRecoverFromProjectLoadFailure(projectId: ProjectId, error: unknown) {
      if (!allowDevThreadRecovery) {
        return false;
      }
  
      if (isThreadLoadError(error)) {
        operations.deleteThreadForRecovery(projectId, error.threadId, error.cause);
        return true;
      }
  
      const activeThreadId = db
        .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
        .get(projectId)?.active_thread_id;
      if (!activeThreadId) {
        operations.ensureProjectHasUsableThread(projectId, new Date().toISOString());
        return true;
      }
  
      return false;
    }
  return {
    operations: {
      tryRecoverFromProjectLoadFailure,
    },
    publicApi: {
    },
  };
}

export type WorkspaceRepositoryReadsOperations3Set = ReturnType<typeof createWorkspaceRepositoryReadsOperations3>["operations"];

export function createWorkspaceRepositoryReadsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperations2Set) {
  const { instrumentation, db } = context;
  function hydrateRunState(run: AgentRunRow): AgentRunState | undefined {
      instrumentation?.onHydrateRunState?.(run.id);
      const questions = db
        .query<AgentRunQuestionRow, [string]>(
          `SELECT id, run_id, ordinal, logical_question_id, planner_turn_id, prompt_hash, prompt, placeholder, response_kind, choices_json, intent_json, status, answer_text, asked_at, answered_at
           FROM agent_run_questions
           WHERE run_id = ?1
           ORDER BY ordinal ASC`
        )
        .all(run.id)
        .map((question) => ({
          id: question.id,
          logicalQuestionId: normalizeOptionalString(question.logical_question_id, 128) ?? question.id,
          prompt: normalizeRequiredString(question.prompt, 1000000, "Recovered planning question"),
          placeholder: normalizeOptionalString(question.placeholder, 32000),
          responseKind: question.response_kind,
          choices: question.response_kind === "freeform" ? undefined : parsePlanningChoices(question.choices_json),
          required: true,
          status: question.status,
          answerText: normalizeOptionalString(question.answer_text, 1000000),
          intent: parsePlanningQuestionIntent(question.intent_json),
          askedAt: normalizeRequiredString(question.asked_at, 256, new Date().toISOString()),
          answeredAt: normalizeOptionalString(question.answered_at, 256)
        }));
  
      const subtasks = db
        .query<AgentRunSubtaskRow, [string]>(
          `SELECT
            id, run_id, planner_task_id, title, instruction, status, attempt_count, output, error_message,
            commit_sha, worktree_path, mount_path, started_at, completed_at, updated_at
           FROM agent_run_subtasks
           WHERE run_id = ?1
           ORDER BY planner_task_id ASC`
        )
        .all(run.id)
        .map((task) => ({
          id: task.planner_task_id,
          title: normalizeRequiredString(task.title, 1000000, "Recovered subtask"),
          instruction: normalizeRequiredString(task.instruction, 1000000, "Recovered subtask instruction"),
          status: task.status,
          attemptCount: normalizeInteger(task.attempt_count, 0, Number.MAX_SAFE_INTEGER, 0),
          output: normalizeOptionalString(task.output, 1000000),
          errorMessage: normalizeOptionalString(task.error_message, 1000000),
          commitSha: normalizeOptionalString(task.commit_sha, 256),
          mountPath: normalizeOptionalString(task.mount_path, 4096),
          worktreePath: normalizeOptionalString(task.worktree_path, 4096),
          startedAt: normalizeOptionalString(task.started_at, 256),
          completedAt: normalizeOptionalString(task.completed_at, 256),
          updatedAt: normalizeRequiredString(task.updated_at, 256, new Date().toISOString())
        }));
  
      const experiment = db
        .query<AgentRunExperimentRow, [string]>(
          `SELECT
            id,
            run_id,
            status,
            virtual_branch_name,
            repo_mount_path,
            project_mount_path,
            base_commit_sha,
            base_branch_name,
            base_dirty_fingerprint,
            head_commit_sha,
            files_changed,
            insertions,
            deletions,
            promoted_at,
            discarded_at,
            created_at,
            updated_at
           FROM agent_run_experiments
           WHERE run_id = ?1`
        )
        .get(run.id);
      const memoryRetrievals = db
        .query<MemoryRetrievalRow, [string]>(
          `SELECT id, run_id, owner, subagent_id, query_text, entry_ids_json, created_at
           FROM memory_retrievals
           WHERE run_id = ?1
           ORDER BY created_at ASC`
        )
        .all(run.id)
        .map((row) => operations.hydrateMemoryRetrieval(row))
        .filter((retrieval): retrieval is MemoryRetrieval => retrieval !== undefined);
  
      const hasExecutionState = subtasks.length > 0 || Boolean(run.final_execution_brief);
      return safeParsePersisted(
        agentRunStateSchema,
        {
        id: run.id,
        threadId: run.thread_id,
        threadRunSequence: normalizeInteger(run.thread_run_sequence, 1, Number.MAX_SAFE_INTEGER, 1),
        status: run.status,
        executionTarget: run.execution_target ?? "current-project",
        latestUserPrompt: normalizeRequiredString(run.latest_user_prompt, 1000000, "Recovered prompt"),
        promptStats: buildRunPromptStats({
          promptChars: run.prompt_chars,
          promptHash: run.prompt_hash,
          transcriptChars: run.transcript_chars,
          latestTaskChars: run.latest_task_chars
        }),
        planningModelId: normalizeOptionalString(run.planning_model_id, 256),
        executionModelId: normalizeOptionalString(run.execution_model_id, 256),
        difficultyScore: normalizeOptionalInteger(run.difficulty_score, 0, 100),
        summary: normalizeOptionalString(run.summary, 1000000),
        finalExecutionBrief: normalizeOptionalString(run.final_execution_brief, 1000000),
        failureMessage: normalizeOptionalString(run.failure_message, 1000000),
        failureCategory: normalizeRunFailureCategory(run.failure_category),
        runtimeBudget: run.max_turns === null ? undefined : buildRunRuntimeBudget(run.max_turns, run.turns_used, false),
        plan: parseExecutionPlan(run.plan_json),
        correctnessReview: parseCorrectnessReview(run.correctness_review_json),
        questions,
        subtasks,
        experiment: experiment ? operations.hydrateExperimentRun(experiment) : undefined,
        memoryRetrievals: memoryRetrievals.length > 0 ? memoryRetrievals : undefined,
        browserSessions: parseBrowserSessions(run.browser_sessions_json),
        toolActivities: parseToolActivities(run.tool_activities_json),
        resumable: isRunResumable(run.status, hasExecutionState),
        retryable: isRunRetryable(run.status, hasExecutionState),
        createdAt: normalizeRequiredString(run.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(run.updated_at, 256, new Date().toISOString()),
        completedAt: normalizeOptionalString(run.completed_at, 256)
        },
        { table: "agent_runs", rowId: run.id }
      );
    }
  function readActiveRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
      const run = db
        .query<AgentRunRow, [string, string]>(
          `SELECT
            id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
            browser_sessions_json, tool_activities_json, thread_run_sequence,
            created_at, updated_at, completed_at
           FROM agent_runs
           WHERE project_id = ?1
             AND thread_id = ?2
             AND status != 'completed'
             AND (completed_at IS NULL OR status IN ('partial-complete', 'stopped', 'failed'))
           ORDER BY thread_run_sequence DESC
           LIMIT 1`
        )
        .get(projectId, threadId);
  
      const state = run ? hydrateRunState(run) : undefined;
      instrumentation?.onReadActiveRun?.(run?.id);
      return state;
    }
  function readLatestRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
      const run = db
        .query<AgentRunRow, [string, string]>(
          `SELECT
            id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
            browser_sessions_json, tool_activities_json, thread_run_sequence,
            created_at, updated_at, completed_at
           FROM agent_runs
           WHERE project_id = ?1 AND thread_id = ?2
           ORDER BY thread_run_sequence DESC
           LIMIT 1`
        )
        .get(projectId, threadId);
  
      return run ? hydrateRunState(run) : undefined;
    }
  return {
    operations: {
      hydrateRunState,
      readActiveRun,
      readLatestRun,
    },
    publicApi: {
    },
  };
}

export type WorkspaceRepositoryReadsOperations4Set = ReturnType<typeof createWorkspaceRepositoryReadsOperations4>["operations"];
