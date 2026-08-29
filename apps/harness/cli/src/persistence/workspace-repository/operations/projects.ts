import path from "node:path";
import type { AgentRunSummary, ChatMessage, ProjectId, ThreadId, WorkspaceProjectState, WorkspaceState } from "@hyperfocus/ai-core/protocol";
import type { AgentRunSummaryRow } from "../../run-summary-projection";
import type { MessageRow, OpenProjectResult, ProjectRow, ThreadRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectPageRow } from "../../workspace-pagination";
import type { WorkspaceProjectReadsOperations2Set, WorkspaceProjectReadsOperations3Set, WorkspaceProjectReadsOperationsSet } from "./project-reads";
import type { WorkspaceRepositoryReadsOperations2Set, WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import type { WorkspaceRunsOperations9Set } from "./runs-2";
import { ACTIVE_PROJECT_KEY } from "../contracts";
import { createProjectId, createThreadId } from "@hyperfocus/ai-core/protocol";
import { ensureDirectoryExists, normalizeProjectRootPath, normalizeThreadTitle, toForkableTranscriptMessage, toModeDefinition } from "../models";
import { findProjectIdByNormalizedRootPath, mapValidWorkspaceRows, readWorkspaceMessageRows, readWorkspaceProjectModesByProject, readWorkspaceProjectRows, readWorkspaceRunRows, readWorkspaceThreadRows, requirePagedWorkspaceActiveThread } from "../../workspace-pagination";
import { normalizeBooleanNumber } from "../persisted-values";
import { removeProjectAtomically } from "../../workspace-deletion";
import { toAgentRunSummaryRow } from "../../run-summary-projection";

export function createWorkspaceProjectsOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function findProjectIdByRootPath(rootPath: string) { return findProjectIdByNormalizedRootPath(db, normalizeProjectRootPath(rootPath)); }
  function removeProject(projectId: ProjectId) {
      return removeProjectAtomically(db, projectId);
    }
  function listWorkspaceThreadRunSummaries(projectId: ProjectId, threadId: ThreadId, input: { cursor?: string; limit: number }) {
      const page = readWorkspaceRunRows<AgentRunSummaryRow>(db, `SELECT id, project_id, thread_id, status,
        prompt_chars, prompt_hash, transcript_chars, latest_task_chars, final_execution_brief, failure_message, failure_category,
        max_turns, turns_used, EXISTS(SELECT 1 FROM agent_run_subtasks WHERE run_id = agent_runs.id) AS has_subtasks,
        thread_run_sequence, updated_at, completed_at FROM agent_runs`,
        projectId, threadId, input.cursor, input.limit);
      return { items: page.rows.map(toAgentRunSummaryRow).filter((run): run is AgentRunSummary => run !== undefined),
        nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  return {
    operations: {
      findProjectIdByRootPath,
      removeProject,
      listWorkspaceThreadRunSummaries,
    },
    publicApi: {
      findProjectIdByRootPath,
      removeProject,
      listWorkspaceThreadRunSummaries,
    },
  };
}

export type WorkspaceProjectsOperationsSet = ReturnType<typeof createWorkspaceProjectsOperations>["operations"];

export function createWorkspaceProjectsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet) {
  const { db } = context;
  function listWorkspaceThreadMessages(projectId: ProjectId, threadId: ThreadId, input: { cursor?: string; limit: number }) {
      const page = readWorkspaceMessageRows<MessageRow>(db, projectId, threadId, input.cursor, input.limit); return { items: page.rows.map((row) => operations.hydrateMessage(row)).filter((item): item is ChatMessage => item !== undefined), nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  return {
    operations: {
      listWorkspaceThreadMessages,
    },
    publicApi: {
      listWorkspaceThreadMessages,
    },
  };
}

export type WorkspaceProjectsOperations2Set = ReturnType<typeof createWorkspaceProjectsOperations2>["operations"];

export function createWorkspaceProjectsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet) {
  function activateProject(projectId: ProjectId) {
      operations.assertProjectExists(projectId);
      const now = new Date().toISOString();
      operations.touchProject(projectId, now);
      operations.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
    }
  return {
    operations: {
      activateProject,
    },
    publicApi: {
      activateProject,
    },
  };
}

export type WorkspaceProjectsOperations3Set = ReturnType<typeof createWorkspaceProjectsOperations3>["operations"];

export function createWorkspaceProjectsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceProjectReadsOperations2Set & WorkspaceRepositoryReadsOperations2Set & WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function loadWorkspace(): WorkspaceState {
      const projectRows = db
        .query<ProjectRow, []>(
          `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
           FROM projects
           ORDER BY last_opened_at DESC, created_at ASC`
        )
        .all();
  
      const activeProjectId = operations.resolveActiveProjectId(projectRows.map((project) => project.id));
      return {
        projects: projectRows.map((project) => operations.readProjectSnapshot(project.id)),
        workspaceModes: operations.readWorkspaceModes(),
        workspaceRuleSource: operations.readWorkspaceRuleSource(),
        workspaceMemorySummary: operations.readWorkspaceMemorySummary(),
        activeProjectId
      };
    }
  function addProject(rootPath: string): WorkspaceProjectState {
      const normalizedRootPath = normalizeProjectRootPath(rootPath); ensureDirectoryExists(normalizedRootPath);
  
      const existingProject = db
        .query<ProjectRow, [string]>(
          `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
           FROM projects
           WHERE root_path = ?1`
        )
        .get(normalizedRootPath);
  
      if (existingProject) {
        throw new Error(`Project already exists: ${normalizedRootPath}`);
      }
  
      const projectId = createProjectId();
      const threadId = createThreadId();
      const now = new Date().toISOString();
      const baseName = path.basename(normalizedRootPath);
      const uniqueName = operations.resolveUniqueProjectName(baseName);
  
      const tx = db.transaction(() => {
        db
          .query(
            `INSERT INTO projects (
              id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
            ) VALUES (?1, ?2, ?3, ?4, 'implement', NULL, NULL, ?5, ?5, ?5)`
          )
          .run(projectId, uniqueName, normalizedRootPath, threadId, now);
        operations.insertThread(projectId, threadId, {
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: now
        });
        operations.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
      });
      tx();
      return operations.readProjectSnapshot(projectId);
    }
  function createThread(projectId: ProjectId) {
      operations.assertProjectExists(projectId);
      const threadId = createThreadId();
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        operations.insertThread(projectId, threadId, {
          title: `Thread ${operations.getNextThreadNumber(projectId)}`,
          titleSource: "generated",
          updatedAt: now
        });
        operations.setActiveThread(projectId, threadId, now);
      });
      tx();
      return operations.readProjectSnapshot(projectId);
    }
  function openProject(rootPath: string): OpenProjectResult {
      const normalizedRootPath = normalizeProjectRootPath(rootPath);
      ensureDirectoryExists(normalizedRootPath);
  
      const existingProject = db
        .query<ProjectRow, [string]>(
          `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
           FROM projects
           WHERE root_path = ?1`
        )
        .get(normalizedRootPath);
  
      if (!existingProject) {
        return {
          project: addProject(normalizedRootPath),
          resolution: "created-project"
        };
      }
  
      return {
        project: createThread(existingProject.id),
        resolution: "existing-project-new-thread"
      };
    }
  function forkThread(projectId: ProjectId, sourceThreadId: ThreadId) {
      const sourceThread = operations.readThreadRow(projectId, sourceThreadId);
      const nextThreadId = createThreadId();
      const now = new Date().toISOString();
      const sourceMessages = operations.readMessages(sourceThread.id);
  
      const tx = db.transaction(() => {
        operations.insertThread(projectId, nextThreadId, {
          title: `Fork of ${sourceThread.title}`,
          titleSource: "generated",
          updatedAt: now,
          forkedFromThreadId: sourceThread.id
        });
  
        for (const message of sourceMessages.flatMap(toForkableTranscriptMessage)) {
          db
            .query(
              `INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
            )
            .run(
              crypto.randomUUID(),
              nextThreadId,
              message.role,
              message.kind ?? "plain",
              message.content,
              message.attachments ? JSON.stringify(message.attachments) : null,
              message.metadata ? JSON.stringify(message.metadata) : null,
              message.createdAt
            );
        }
  
        operations.setActiveThread(projectId, nextThreadId, now);
      });
      tx();
  
      return operations.readProjectSnapshot(projectId);
    }
  function activateThread(projectId: ProjectId, threadId: ThreadId) {
      operations.readThreadRow(projectId, threadId);
      operations.setActiveThread(projectId, threadId, new Date().toISOString());
      return operations.readProjectSnapshot(projectId);
    }
  function renameThread(projectId: ProjectId, threadId: ThreadId, title: string) {
      const normalizedTitle = normalizeThreadTitle(title);
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE project_threads
           SET title = ?3, title_source = 'custom', updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(threadId, projectId, normalizedTitle, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown thread: ${threadId}`);
      }
  
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      loadWorkspace,
      addProject,
      createThread,
      openProject,
      forkThread,
      activateThread,
      renameThread,
    },
    publicApi: {
      loadWorkspace,
      addProject,
      createThread,
      openProject,
      forkThread,
      activateThread,
      renameThread,
    },
  };
}

export type WorkspaceProjectsOperations4Set = ReturnType<typeof createWorkspaceProjectsOperations4>["operations"];

export function createWorkspaceProjectsOperations5(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceProjectReadsOperations3Set & WorkspaceProjectsOperations4Set) {
  const { db } = context;
  function listWorkspaceProjects(input: { cursor?: string; limit: number }) {
      const page = readWorkspaceProjectRows(db, input.cursor, input.limit); const modes = readWorkspaceProjectModesByProject(db, page.rows.map((row) => row.id), (row) => toModeDefinition(row, "project"));
      return { items: mapValidWorkspaceRows(page.rows, (row) => operations.hydrateProjectCatalogEntry(row, requirePagedWorkspaceActiveThread(row), modes.get(row.id) ?? [])), nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  function getWorkspaceProjectCatalogEntry(projectId: ProjectId) {
      const row = db.query<WorkspaceProjectPageRow, [string]>(`SELECT id, name, root_path, active_thread_id, selected_mode_id,
        rules_content, rules_updated_at, created_at, updated_at, last_opened_at FROM projects WHERE id = ?1`).get(projectId);
      return row ? operations.hydrateProjectCatalogEntry(row) : undefined;
    }
  function listWorkspaceProjectThreads(projectId: ProjectId, input: { cursor?: string; limit: number }) {
      const page = readWorkspaceThreadRows<ThreadRow>(db, projectId, input.cursor, input.limit); return { items: mapValidWorkspaceRows(page.rows, (row) => operations.hydrateThreadSummary(projectId, row, row)), nextCursor: page.nextCursor, totalApprox: page.totalApprox };
    }
  function setThreadPinned(projectId: ProjectId, threadId: ThreadId, pinned: boolean) {
      const thread = operations.readThreadRow(projectId, threadId);
      if (thread.kind !== "user") {
        throw new Error("Automation threads cannot be pinned");
      }
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE project_threads
           SET pinned = ?3, updated_at = ?4
           WHERE id = ?1 AND project_id = ?2 AND kind = 'user'`
        )
        .run(threadId, projectId, pinned ? 1 : 0, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown thread: ${threadId}`);
      }
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function restoreThread(projectId: ProjectId, threadId: ThreadId) {
      const thread = operations.readThreadRow(projectId, threadId);
      if (thread.kind !== "user") {
        throw new Error("Automation threads cannot be restored");
      }
      if (thread.status === "active") {
        return operations.readProjectSnapshot(projectId);
      }
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE project_threads
           SET status = 'active', archived_at = NULL, updated_at = ?3
           WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'archived'`
        )
        .run(threadId, projectId, now);
      if (updated.changes === 0) {
        throw new Error(`Unknown thread: ${threadId}`);
      }
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function listThreadSummaries(projectId: ProjectId) {
      operations.assertProjectExists(projectId);
      return operations.readThreadSummaries(projectId);
    }
  function getThreadSummary(projectId: ProjectId, threadId: ThreadId) { return operations.readThreadSummaries(projectId).find((thread) => thread.id === threadId); }
  function resetProject(projectId: ProjectId) {
      return operations.createThread(projectId);
    }
  return {
    operations: {
      listWorkspaceProjects,
      getWorkspaceProjectCatalogEntry,
      listWorkspaceProjectThreads,
      setThreadPinned,
      restoreThread,
      listThreadSummaries,
      getThreadSummary,
      resetProject,
    },
    publicApi: {
      listWorkspaceProjects,
      getWorkspaceProjectCatalogEntry,
      listWorkspaceProjectThreads,
      setThreadPinned,
      restoreThread,
      listThreadSummaries,
      getThreadSummary,
      resetProject,
    },
  };
}

export type WorkspaceProjectsOperations5Set = ReturnType<typeof createWorkspaceProjectsOperations5>["operations"];

export function createWorkspaceProjectsOperations6(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceProjectReadsOperations3Set & WorkspaceRunsOperations9Set) {
  const { db } = context;
  function archiveThread(projectId: ProjectId, threadId: ThreadId) {
      const thread = operations.readThreadRow(projectId, threadId);
      if (thread.kind !== "user") {
        throw new Error("Automation threads cannot be archived");
      }
      if (normalizeBooleanNumber(thread.pinned)) {
        throw new Error("Pinned threads cannot be archived");
      }
      if (thread.status === "archived") {
        return operations.readProjectSnapshot(projectId);
      }
      const project = operations.getProject(projectId);
      if (project.activeThreadId === threadId) {
        throw new Error("Active thread cannot be archived");
      }
      const activeUserThreadCount =
        db
          .query<{ count: number }, [string]>(
            `SELECT COUNT(*) AS count
             FROM project_threads
             WHERE project_id = ?1 AND kind = 'user' AND status = 'active'`
          )
          .get(projectId)?.count ?? 0;
      if (activeUserThreadCount <= 1) {
        throw new Error("At least one usable user thread must remain");
      }
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE project_threads
           SET status = 'archived', archived_at = COALESCE(archived_at, ?3), updated_at = ?3
           WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'active'`
        )
        .run(threadId, projectId, now);
      if (updated.changes === 0) {
        throw new Error(`Unknown thread: ${threadId}`);
      }
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function cleanupArchiveThreads(input: { projectIds?: ProjectId[]; cutoffIso: string; nowIso?: string }) {
      const now = input.nowIso ?? new Date().toISOString();
      const projectIds =
        input.projectIds && input.projectIds.length > 0
          ? [...new Set(input.projectIds)]
          : db
              .query<{ id: string }, []>(`SELECT id FROM projects ORDER BY last_opened_at DESC, updated_at DESC, created_at DESC`)
              .all()
              .map((project) => project.id);
      const projects: Array<{
        projectId: ProjectId;
        archivedThreadIds: ThreadId[];
        skippedThreadIds: ThreadId[];
        project: WorkspaceProjectState;
      }> = [];
      let archivedCount = 0;
      let skippedCount = 0;
  
      for (const projectId of projectIds) {
        const project = operations.getProject(projectId);
        const activeUserThreads = project.threads.filter((thread) => thread.kind === "user" && thread.status === "active");
        const capacity = Math.max(0, activeUserThreads.length - 1);
        const eligible = activeUserThreads
          .filter((thread) => thread.id !== project.activeThreadId)
          .filter((thread) => !thread.pinned)
          .filter((thread) => thread.badgeState !== "planning" && thread.badgeState !== "executing" && thread.badgeState !== "needs-input")
          .filter((thread) => {
            const activityAt = thread.lastUserMessageAt ?? thread.updatedAt ?? thread.createdAt;
            return activityAt ? Date.parse(activityAt) < Date.parse(input.cutoffIso) : false;
          })
          .sort((left, right) => {
            const leftAt = Date.parse(left.lastUserMessageAt ?? left.updatedAt ?? left.createdAt ?? "");
            const rightAt = Date.parse(right.lastUserMessageAt ?? right.updatedAt ?? right.createdAt ?? "");
            return leftAt - rightAt;
          });
        const archiveTargets = eligible.slice(0, capacity);
        const skippedThreadIds = eligible.slice(capacity).map((thread) => thread.id);
        const archivedThreadIds = archiveTargets.map((thread) => thread.id);
  
        if (archivedThreadIds.length > 0) {
          const tx = db.transaction(() => {
            for (const threadId of archivedThreadIds) {
              db
                .query(
                  `UPDATE project_threads
                   SET status = 'archived', archived_at = COALESCE(archived_at, ?3), updated_at = ?3
                   WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'active'`
                )
                .run(threadId, projectId, now);
            }
            operations.touchProject(projectId, now);
          });
          tx();
        }
  
        archivedCount += archivedThreadIds.length;
        skippedCount += skippedThreadIds.length;
        projects.push({
          projectId,
          archivedThreadIds,
          skippedThreadIds,
          project: operations.readProjectSnapshot(projectId)
        });
      }
  
      return { archivedCount, skippedCount, projects };
    }
  return {
    operations: {
      archiveThread,
      cleanupArchiveThreads,
    },
    publicApi: {
      archiveThread,
      cleanupArchiveThreads,
    },
  };
}

export type WorkspaceProjectsOperations6Set = ReturnType<typeof createWorkspaceProjectsOperations6>["operations"];
