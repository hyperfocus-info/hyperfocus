import type { AgentRunStatus, BrowserSession, CorrectnessReview, ExecutionPlan, ExecutionToolActivity, ExperimentRun, ProjectId, RunExecutionTarget, RunPromptStats, ThreadId, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceBackgroundReadsOperations3Set } from "./background-reads";
import type { WorkspaceProjectReadsOperations3Set } from "./project-reads";
import type { WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import type { WorkspaceRunsOperations7Set } from "./runs-1";
import { stringifyAnsiFree } from "../../../ansi-storage";

export function createWorkspaceRunsOperations8(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperations3Set & WorkspaceRunsOperations7Set) {
  const { db } = context;
  function resumeAgentRun(projectId: ProjectId, runId: string, status: "running-main" | "running-subagents") {
      const now = new Date().toISOString();
      const current = db
        .query<{ status: AgentRunStatus }, [string, ProjectId]>(
          `SELECT status
           FROM agent_runs
           WHERE id = ?1 AND project_id = ?2`
        )
        .get(runId, projectId);
      if (!current) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
      if (current.status === "completed") {
        return operations.readProjectSnapshot(projectId);
      }
  
      const updated = db
        .query(
          `UPDATE agent_runs
           SET status = ?3,
               failure_message = NULL,
               failure_category = NULL,
               updated_at = ?4,
               completed_at = NULL
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, status, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function stopInterruptedActiveRuns(input: {
      projectIds?: ProjectId[];
      reason: string;
      failureCategory: "shutdown-interrupt";
    }): { stoppedRunIds: string[]; stoppedRuns: Array<{ projectId: ProjectId; runId: string; threadId: ThreadId }> } {
      const activeStatuses: AgentRunStatus[] = ["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"];
      const projectIds = input.projectIds && input.projectIds.length > 0 ? new Set(input.projectIds) : undefined;
      const rows = db
        .query<{ id: string; project_id: string; thread_id: string; status: AgentRunStatus }, []>(
          `SELECT id, project_id, thread_id, status
           FROM agent_runs
           WHERE status IN ('planning', 'awaiting-user-input', 'running-main', 'running-subagents', 'aggregating')`
        )
        .all()
        .filter((row) => !projectIds || projectIds.has(row.project_id));
      for (const row of rows) {
        if (activeStatuses.includes(row.status)) {
          operations.setAgentRunStatus(row.project_id, row.id, "stopped", input.reason, input.failureCategory);
        }
      }
      return {
        stoppedRunIds: rows.map((row) => row.id),
        stoppedRuns: rows.map((row) => ({
          projectId: row.project_id,
          runId: row.id,
          threadId: row.thread_id
        }))
      };
    }
  function setAgentRunRuntimeBudget(projectId: ProjectId, runId: string, maxTurns: number | undefined) {
      if (maxTurns === undefined) {
        return operations.readProjectSnapshot(projectId);
      }
      if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 1000) {
        throw new Error("Runtime budget maxTurns must be an integer from 1 to 1000");
      }
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET max_turns = ?3,
               turns_used = MIN(turns_used, ?3),
               updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, maxTurns, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function setAgentRunExecutionTarget(projectId: ProjectId, runId: string, target: RunExecutionTarget) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET execution_target = ?3,
               updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, target, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function setAgentRunCorrectnessReview(projectId: ProjectId, runId: string, correctnessReview?: CorrectnessReview) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET correctness_review_json = ?3,
               updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, correctnessReview ? JSON.stringify(correctnessReview) : null, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function setAgentRunExecutionPlan(projectId: ProjectId, runId: string, executionPlan: ExecutionPlan) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET plan_json = ?3,
               summary = ?4,
               final_execution_brief = ?5,
               difficulty_score = ?6,
               execution_model_id = ?7,
               updated_at = ?8
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(
          runId,
          projectId,
          JSON.stringify(executionPlan),
          executionPlan.summary,
          executionPlan.finalExecutionBrief,
          Math.round(executionPlan.difficultyScore),
          executionPlan.executionModelId,
          now
        );
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      resumeAgentRun,
      stopInterruptedActiveRuns,
      setAgentRunRuntimeBudget,
      setAgentRunExecutionTarget,
      setAgentRunCorrectnessReview,
      setAgentRunExecutionPlan,
    },
    publicApi: {
      resumeAgentRun,
      stopInterruptedActiveRuns,
      setAgentRunRuntimeBudget,
      setAgentRunExecutionTarget,
      setAgentRunCorrectnessReview,
      setAgentRunExecutionPlan,
    },
  };
}

export type WorkspaceRunsOperations8Set = ReturnType<typeof createWorkspaceRunsOperations8>["operations"];

export function createWorkspaceRunsOperations9(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function setAgentRunBrowserSessions(projectId: ProjectId, runId: string, browserSessions: BrowserSession[]) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET browser_sessions_json = ?3,
               updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, JSON.stringify(browserSessions), now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function setAgentRunPromptStats(projectId: ProjectId, runId: string, promptStats: RunPromptStats) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_runs
           SET prompt_chars = ?3,
               prompt_hash = ?4,
               transcript_chars = ?5,
               latest_task_chars = ?6,
               updated_at = ?7
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(
          runId,
          projectId,
          promptStats.promptChars,
          promptStats.promptHash,
          promptStats.transcriptChars ?? null,
          promptStats.latestTaskChars ?? null,
          now
        );
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function setAgentRunToolActivities(projectId: ProjectId, runId: string, toolActivities: ExecutionToolActivity[]) {
      const now = new Date().toISOString();
      const boundedActivities = toolActivities.slice(-512);
      const updated = db
        .query(
          `UPDATE agent_runs
           SET tool_activities_json = ?3,
               updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, stringifyAnsiFree(boundedActivities), now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function clearAgentRun(projectId: ProjectId, runId: string) {
      const deleted = db
        .query(`DELETE FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
        .run(runId, projectId);
  
      if (deleted.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function getProject(projectId: ProjectId): WorkspaceProjectState { return operations.readProjectSnapshot(projectId); }
  function saveExperimentRun(projectId: ProjectId, runId: string, experiment: ExperimentRun) {
      operations.assertRunExists(projectId, runId);
      db
        .query(
          `INSERT INTO agent_run_experiments (
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
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
          ON CONFLICT(run_id) DO UPDATE SET
            status = excluded.status,
            virtual_branch_name = excluded.virtual_branch_name,
            repo_mount_path = excluded.repo_mount_path,
            project_mount_path = excluded.project_mount_path,
            base_commit_sha = excluded.base_commit_sha,
            base_branch_name = excluded.base_branch_name,
            base_dirty_fingerprint = excluded.base_dirty_fingerprint,
            head_commit_sha = excluded.head_commit_sha,
            files_changed = excluded.files_changed,
            insertions = excluded.insertions,
            deletions = excluded.deletions,
            promoted_at = excluded.promoted_at,
            discarded_at = excluded.discarded_at,
            updated_at = excluded.updated_at`
        )
        .run(
          experiment.id,
          runId,
          experiment.status,
          experiment.virtualBranchName,
          experiment.repoMountPath,
          experiment.projectMountPath,
          experiment.baseCommitSha ?? null,
          experiment.baseBranchName ?? null,
          experiment.baseDirtyFingerprint,
          experiment.headCommitSha ?? null,
          experiment.filesChanged,
          experiment.insertions,
          experiment.deletions,
          experiment.promotedAt ?? null,
          experiment.discardedAt ?? null,
          experiment.createdAt,
          experiment.updatedAt
        );
  
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      setAgentRunBrowserSessions,
      setAgentRunPromptStats,
      setAgentRunToolActivities,
      clearAgentRun,
      getProject,
      saveExperimentRun,
    },
    publicApi: {
      setAgentRunBrowserSessions,
      setAgentRunPromptStats,
      setAgentRunToolActivities,
      clearAgentRun,
      getProject,
      saveExperimentRun,
    },
  };
}

export type WorkspaceRunsOperations9Set = ReturnType<typeof createWorkspaceRunsOperations9>["operations"];

export function createWorkspaceRunsOperations10(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperations3Set) {
  function markSubtaskStarted(projectId: ProjectId, runId: string, taskId: string, attemptCount: number) {
      return operations.updateSubtask(projectId, runId, taskId, {
        status: "running",
        attemptCount,
        startedAt: new Date().toISOString(),
        completedAt: null,
        output: null,
        errorMessage: null
      });
    }
  function markSubtaskCompleted(
      projectId: ProjectId,
      runId: string,
      taskId: string,
      output: string,
      attemptCount: number,
      commitSha?: string,
      worktreePath?: string,
      mountPath?: string
    ) {
      const now = new Date().toISOString();
      return operations.updateSubtask(projectId, runId, taskId, {
        status: "completed",
        attemptCount,
        completedAt: now,
        output,
        errorMessage: null,
        commitSha: commitSha ?? null,
        worktreePath: worktreePath ?? null,
        mountPath: mountPath ?? null
      });
    }
  function markSubtaskFailed(
      projectId: ProjectId,
      runId: string,
      taskId: string,
      errorMessage: string,
      attemptCount: number,
      worktreePath?: string,
      mountPath?: string
    ) {
      const now = new Date().toISOString();
      return operations.updateSubtask(projectId, runId, taskId, {
        status: "failed",
        attemptCount,
        completedAt: now,
        output: null,
        errorMessage,
        commitSha: null,
        worktreePath: worktreePath ?? null,
        mountPath: mountPath ?? null
      });
    }
  return {
    operations: {
      markSubtaskStarted,
      markSubtaskCompleted,
      markSubtaskFailed,
    },
    publicApi: {
      markSubtaskStarted,
      markSubtaskCompleted,
      markSubtaskFailed,
    },
  };
}

export type WorkspaceRunsOperations10Set = ReturnType<typeof createWorkspaceRunsOperations10>["operations"];
