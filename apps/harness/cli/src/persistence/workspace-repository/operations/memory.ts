import type { AgentRunRow, MemoryEntryRow, WorkspaceRepositoryContext } from "../contracts";
import type { MemoryEntry, MemoryEntryKind, MemoryEntryStatus, MemoryRetrieval, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceBackgroundReadsOperations2Set } from "./background-reads";
import type { WorkspaceProjectReadsOperationsSet } from "./project-reads";
import type { WorkspaceRepositoryReadsOperations4Set, WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import type { WorkspaceRunsOperations4Set } from "./runs-1";
import { failUnknownRun, toThreadMemorySummary } from "../models";
import { readRunDetailPage } from "../../run-detail-pagination";
import { readThreadRunStateSnapshot } from "../../thread-run-state";

export function createWorkspaceMemoryOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function deleteMemoryEntry(entryId: string) {
      db.query(`DELETE FROM memory_entries WHERE id = ?1`).run(entryId);
    }
  function logMemoryRetrieval(retrieval: MemoryRetrieval) {
      db
        .query(
          `INSERT INTO memory_retrievals (id, run_id, owner, subagent_id, query_text, entry_ids_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .run(
          retrieval.id,
          retrieval.runId,
          retrieval.owner,
          retrieval.subagentId ?? null,
          retrieval.queryText,
          JSON.stringify(retrieval.entryIds),
          retrieval.createdAt
        );
    }
  return {
    operations: {
      deleteMemoryEntry,
      logMemoryRetrieval,
    },
    publicApi: {
      deleteMemoryEntry,
      logMemoryRetrieval,
    },
  };
}

export type WorkspaceMemoryOperationsSet = ReturnType<typeof createWorkspaceMemoryOperations>["operations"];

export function createWorkspaceMemoryOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet) {
  function getThreadMemorySummary(projectId: ProjectId, threadId: ThreadId) { return toThreadMemorySummary(operations.readThreadRow(projectId, threadId)); }
  return {
    operations: {
      getThreadMemorySummary,
    },
    publicApi: {
      getThreadMemorySummary,
    },
  };
}

export type WorkspaceMemoryOperations2Set = ReturnType<typeof createWorkspaceMemoryOperations2>["operations"];

export function createWorkspaceMemoryOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperations2Set) {
  const { db } = context;
  function listMemoryEntries(
      projectId?: ProjectId,
      filters: {
        query?: string;
        kind?: MemoryEntryKind;
        status?: MemoryEntryStatus;
      } = {}
    ) {
      const rows = db
        .query<MemoryEntryRow, []>(
          `SELECT
            id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
            confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
           FROM memory_entries
           ORDER BY pinned DESC, priority ASC, updated_at DESC, created_at DESC`
        )
        .all();
  
      return rows
        .map((row) => operations.hydrateMemoryEntry(row))
        .filter((entry): entry is MemoryEntry => entry !== undefined)
        .filter((entry) => (projectId ? !entry.projectId || entry.projectId === projectId : true))
        .filter((entry) => (filters.kind ? entry.kind === filters.kind : true))
        .filter((entry) => (filters.status ? entry.status === filters.status : true))
        .filter((entry) => {
          if (!filters.query?.trim()) {
            return true;
          }
  
          const query = filters.query.toLowerCase();
          return [entry.title, entry.summary, entry.evidence ?? "", entry.tags.join(" "), entry.pathGlobs.join(" ")]
            .join("\n")
            .toLowerCase()
            .includes(query);
        });
    }
  function getMemoryEntry(entryId: string) {
      const row = db
        .query<MemoryEntryRow, [string]>(
          `SELECT
            id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
            confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
           FROM memory_entries
           WHERE id = ?1`
        )
        .get(entryId);
  
      return row ? operations.hydrateMemoryEntry(row) : undefined;
    }
  function saveMemoryEntry(entry: MemoryEntry) {
      db
        .query(
          `INSERT INTO memory_entries (
            id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
            confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
          ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            thread_id = excluded.thread_id,
            run_id = excluded.run_id,
            kind = excluded.kind,
            status = excluded.status,
            title = excluded.title,
            summary = excluded.summary,
            evidence = excluded.evidence,
            tags_json = excluded.tags_json,
            path_globs_json = excluded.path_globs_json,
            confidence = excluded.confidence,
            pinned = excluded.pinned,
            priority = excluded.priority,
            hit_count = excluded.hit_count,
            last_hit_at = excluded.last_hit_at,
            source_commit_sha = excluded.source_commit_sha,
            updated_at = excluded.updated_at`
        )
        .run(
          entry.id,
          entry.projectId ?? null,
          entry.threadId ?? null,
          entry.runId ?? null,
          entry.kind,
          entry.status,
          entry.title,
          entry.summary,
          entry.evidence ?? null,
          JSON.stringify(entry.tags),
          JSON.stringify(entry.pathGlobs),
          entry.confidence,
          entry.pinned ? 1 : 0,
          entry.priority,
          entry.hitCount,
          entry.lastHitAt ?? null,
          entry.sourceCommitSha ?? null,
          entry.createdAt,
          entry.updatedAt
        );
      return getMemoryEntry(entry.id);
    }
  function getNextMemoryPriority(projectId?: ProjectId) {
      const priorities = listMemoryEntries(projectId).map((entry) => entry.priority);
      const maxPriority = priorities.length > 0 ? Math.max(...priorities) : 0;
      return Math.min(100000, maxPriority + 100);
    }
  function reorderMemoryEntry(projectId: ProjectId, memoryEntryId: string, direction: "up" | "down") {
      let entries = listMemoryEntries(projectId);
      const currentIndex = entries.findIndex((entry) => entry.id === memoryEntryId);
      if (currentIndex === -1) {
        throw new Error("Memory entry not found");
      }
  
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= entries.length) {
        return entries;
      }
  
      if (entries.some((entry, index) => index > 0 && entry.priority === entries[index - 1]?.priority)) {
        const now = new Date().toISOString();
        entries.forEach((entry, index) => {
          saveMemoryEntry({
            ...entry,
            priority: Math.min(100000, (index + 1) * 100),
            updatedAt: now
          });
        });
        entries = listMemoryEntries(projectId);
      }
  
      const refreshedCurrentIndex = entries.findIndex((entry) => entry.id === memoryEntryId);
      const refreshedTargetIndex = direction === "up" ? refreshedCurrentIndex - 1 : refreshedCurrentIndex + 1;
      if (refreshedCurrentIndex === -1 || refreshedTargetIndex < 0 || refreshedTargetIndex >= entries.length) {
        return entries;
      }
  
      const current = entries[refreshedCurrentIndex];
      const target = entries[refreshedTargetIndex];
      if (!current || !target) {
        return entries;
      }
  
      const now = new Date().toISOString();
      saveMemoryEntry({
        ...current,
        priority: target.priority,
        updatedAt: now
      });
      saveMemoryEntry({
        ...target,
        priority: current.priority,
        updatedAt: now
      });
  
      return listMemoryEntries(projectId);
    }
  return {
    operations: {
      listMemoryEntries,
      getMemoryEntry,
      saveMemoryEntry,
      getNextMemoryPriority,
      reorderMemoryEntry,
    },
    publicApi: {
      listMemoryEntries,
      getMemoryEntry,
      saveMemoryEntry,
      getNextMemoryPriority,
      reorderMemoryEntry,
    },
  };
}

export type WorkspaceMemoryOperations3Set = ReturnType<typeof createWorkspaceMemoryOperations3>["operations"];

export function createWorkspaceMemoryOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceRepositoryReadsOperations4Set & WorkspaceRunsOperations4Set) {
  const { runDetailSnapshots, instrumentation, db } = context;
  function getAgentRunDetailPage(projectId: ProjectId, threadId: ThreadId, runId: string, input: { cursor?: string; limit?: number }) {
      const page = readRunDetailPage(db, runDetailSnapshots, { projectId, threadId, runId, ...input },
        () => operations.getAgentRun(projectId, threadId, runId) ?? failUnknownRun(runId));
      instrumentation?.onRunDetailPage?.(runId);
      return page;
    }
  function getLatestThreadRun(projectId: ProjectId, threadId: ThreadId) { operations.readThreadRow(projectId, threadId); return operations.readLatestRun(projectId, threadId); }
  function getThreadRunState(projectId: ProjectId, threadId: ThreadId) { operations.readThreadRow(projectId, threadId); return readThreadRunStateSnapshot(db, projectId, threadId,
      () => operations.readActiveRun(projectId, threadId), () => operations.readLatestRun(projectId, threadId)); }
  function getRun(projectId: ProjectId, runId: string) {
      operations.assertRunExists(projectId, runId);
      const row = db
        .query<AgentRunRow, [string, string]>(
          `SELECT
            id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
            browser_sessions_json, tool_activities_json, thread_run_sequence,
            created_at, updated_at, completed_at
           FROM agent_runs
           WHERE id = ?1 AND project_id = ?2`
        )
        .get(runId, projectId);
      return row ? operations.hydrateRunState(row) : undefined;
    }
  return {
    operations: {
      getAgentRunDetailPage,
      getLatestThreadRun,
      getThreadRunState,
      getRun,
    },
    publicApi: {
      getAgentRunDetailPage,
      getLatestThreadRun,
      getThreadRunState,
      getRun,
    },
  };
}

export type WorkspaceMemoryOperations4Set = ReturnType<typeof createWorkspaceMemoryOperations4>["operations"];
