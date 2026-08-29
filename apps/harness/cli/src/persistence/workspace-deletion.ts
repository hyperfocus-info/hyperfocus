import type { Database } from "bun:sqlite";
import type { AssistantQuestion, ProjectId } from "@hyperfocus/ai-core/protocol";
import { syncAssistantQuestionNotificationsRaw, type PersistedAssistantQuestionRow } from "./notification-persistence";

type LinkedAgentRunDeletion = { projectId: ProjectId; runId: string; threadId: string };

export function removeProjectAtomically(db: Database, projectId: ProjectId) {
  return db.transaction(() => {
    const exists = db.query<{ found: number }, [ProjectId]>(
      `SELECT 1 AS found FROM projects WHERE id = ?1`
    ).get(projectId);
    if (!exists) throw new Error(`Unknown project: ${projectId}`);
    const currentActiveProjectId = db.query<{ id: ProjectId }, []>(
      `SELECT projects.id FROM workspace_meta
       JOIN projects ON projects.id = workspace_meta.value
       WHERE workspace_meta.key = 'active_project_id'`
    ).get()?.id;
    const nextActiveProjectId = currentActiveProjectId && currentActiveProjectId !== projectId
      ? currentActiveProjectId : db.query<{ id: ProjectId }, [ProjectId]>(
        `SELECT id FROM projects WHERE id != ?1 ORDER BY last_opened_at DESC, created_at ASC LIMIT 1`
      ).get(projectId)?.id;
    const deletedJobIds = db.query<{ id: string }, [ProjectId]>(
      `SELECT id FROM background_jobs WHERE project_id = ?1 ORDER BY id ASC`
    ).all(projectId).map((row) => row.id);
    const deletedRunIds = db.query<{ id: string }, [ProjectId]>(
      `SELECT id FROM background_job_runs WHERE project_id = ?1 ORDER BY id ASC`
    ).all(projectId).map((row) => row.id);
    const deletedAssistantIds = db.query<{ id: string }, [ProjectId]>(
      `SELECT id FROM assistants WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY id ASC`
    ).all(projectId).map((row) => row.id);
    db.query(`DELETE FROM projects WHERE id = ?1`).run(projectId);
    if (nextActiveProjectId) db.query(
      `INSERT INTO workspace_meta (key, value) VALUES ('active_project_id', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(nextActiveProjectId);
    else db.query(`DELETE FROM workspace_meta WHERE key = 'active_project_id'`).run();
    return { activeProjectId: nextActiveProjectId, deletedAssistantIds, deletedJobIds, deletedRunIds };
  }).immediate();
}

export function deleteBackgroundJobAtomically(db: Database, projectId: ProjectId, jobId: string) {
  return db.transaction(() => {
    const deletedRunIds = db.query<{ id: string }, [string, ProjectId]>(
      `SELECT id FROM background_job_runs WHERE job_id = ?1 AND project_id = ?2 ORDER BY id ASC`
    ).all(jobId, projectId).map((row) => row.id);
    const linkedAgentRuns = db.query<{ run_id: string; thread_id: string }, [string, ProjectId]>(
      `SELECT agent_runs.id AS run_id, agent_runs.thread_id
       FROM background_job_runs JOIN agent_runs ON agent_runs.id = background_job_runs.linked_agent_run_id
       WHERE background_job_runs.job_id = ?1 AND background_job_runs.project_id = ?2`
    ).all(jobId, projectId);
    stopLinkedAgentRuns(db, linkedAgentRuns.map((run) => ({ projectId, runId: run.run_id, threadId: run.thread_id })),
      "Background job deleted");
    const deleted = db.query(`DELETE FROM background_jobs WHERE id = ?1 AND project_id = ?2`).run(jobId, projectId);
    if (deleted.changes === 0) throw new Error(`Unknown background job: ${jobId}`);
    return { deletedJobIds: [jobId], deletedRunIds,
      linkedAgentRuns: linkedAgentRuns.map((run) => ({ projectId, runId: run.run_id, threadId: run.thread_id })) };
  }).immediate();
}

export function deleteAssistantAtomically(db: Database, assistantId: string,
  hydrateQuestion: (row: PersistedAssistantQuestionRow) => AssistantQuestion | undefined) {
  return db.transaction(() => {
    const exists = db.query<{ found: number }, [string]>(
      `SELECT 1 AS found FROM assistants WHERE id = ?1 AND deleted_at IS NULL`
    ).get(assistantId);
    if (!exists) throw new Error(`Unknown assistant: ${assistantId}`);
    const deletedJobIds = db.query<{ id: string }, [string]>(
      `SELECT id FROM background_jobs WHERE assistant_id = ?1 ORDER BY id ASC`
    ).all(assistantId).map((row) => row.id);
    const deletedRunIds = db.query<{ id: string }, [string]>(
      `SELECT background_job_runs.id FROM background_job_runs
       JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
       WHERE background_jobs.assistant_id = ?1 ORDER BY background_job_runs.id ASC`
    ).all(assistantId).map((row) => row.id);
    const linkedAgentRuns = db.query<{ project_id: ProjectId; run_id: string; thread_id: string }, [string]>(
      `SELECT DISTINCT agent_runs.project_id, agent_runs.id AS run_id, agent_runs.thread_id
       FROM background_job_runs
       JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
       JOIN agent_runs ON agent_runs.id = background_job_runs.linked_agent_run_id
       WHERE background_jobs.assistant_id = ?1 ORDER BY agent_runs.project_id ASC, agent_runs.id ASC`
    ).all(assistantId).map((run) => ({ projectId: run.project_id, runId: run.run_id, threadId: run.thread_id }));
    const now = new Date().toISOString();
    stopLinkedAgentRuns(db, linkedAgentRuns, "Assistant deleted", now);
    db.query(`UPDATE assistants SET deleted_at = ?2, run_state = 'paused', updated_at = ?2 WHERE id = ?1`).run(assistantId, now);
    db.query(`DELETE FROM background_jobs WHERE assistant_id = ?1`).run(assistantId);
    syncAssistantQuestionNotificationsRaw(db, assistantId, hydrateQuestion);
    return { deletedJobIds, deletedRunIds, linkedAgentRuns };
  }).immediate();
}

function stopLinkedAgentRuns(db: Database, linkedAgentRuns: LinkedAgentRunDeletion[], reason: string,
  stoppedAt: string = new Date().toISOString()) {
  for (const linked of linkedAgentRuns) db.query(
    `UPDATE agent_runs SET status = 'stopped', failure_message = ?3,
       failure_category = 'manual-abort', updated_at = ?4, completed_at = COALESCE(completed_at, ?4)
     WHERE id = ?1 AND project_id = ?2
       AND status IN ('planning', 'awaiting-user-input', 'ready', 'running-main', 'running-subagents', 'aggregating')`
  ).run(linked.runId, linked.projectId, reason, stoppedAt);
}
