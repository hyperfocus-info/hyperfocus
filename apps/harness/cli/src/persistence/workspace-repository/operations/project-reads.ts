import type { ChatMessage, MemorySummary, ModeDefinition, ProjectId, ProjectThreadSummary, ThreadId, WorkspaceProjectState, WorkspaceRuleSource } from "@hyperfocus/ai-core/protocol";
import { readThreadLineage } from "../../thread-collaboration";
import type { MessageRow, ProjectModeRow, ProjectRow, ThreadRow, WorkspaceModeRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectPageRow, WorkspaceThreadPageRow } from "../../workspace-pagination";
import type { WorkspaceRepositoryReadsOperations3Set, WorkspaceRepositoryReadsOperations4Set, WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { WORKSPACE_MEMORY_CONTENT_KEY, WORKSPACE_MEMORY_UPDATED_AT_KEY, WORKSPACE_RULES_CONTENT_KEY, WORKSPACE_RULES_UPDATED_AT_KEY } from "../contracts";
import { agentRunStatusSchema, backgroundJobThreadKindSchema, CHAT_MESSAGE_CONTENT_MAX_CHARS, chatMessageSchema, createEmptySession, createProjectThreadSummary } from "@hyperfocus/ai-core/protocol";
import { createThreadLoadError, getThreadBadgeState, parseChatAttachments, parseChatMessageMetadata, summarizeMessagePreview, toModeDefinition, toProjectRuleSource, toThreadMemorySummary } from "../models";
import { hydrateWorkspaceProjectCatalogEntry, readPagedWorkspaceActiveThread, readPagedWorkspaceThreadSummaryData, readWorkspaceThreadSummaryData } from "../../workspace-pagination";
import { normalizeBooleanNumber, normalizeInteger, normalizeOptionalString, normalizeRequiredString, normalizeRequiredTrimmedString, normalizeThreadTitleSource, safeParsePersisted } from "../persisted-values";

export function createWorkspaceProjectReadsOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function readThreadRow(projectId: ProjectId, threadId: ThreadId) {
      const thread = db
        .query<ThreadRow, [string, string]>(
          `SELECT id, project_id, status, pinned, kind, title, title_source, updated_at, forked_from_thread_id, memory_summary_content, memory_summary_updated_at, created_at, archived_at
           FROM project_threads
           WHERE project_id = ?1 AND id = ?2`
        )
        .get(projectId, threadId);
  
      if (!thread) {
        throw new Error(`Unknown thread: ${threadId}`);
      }
  
      return thread;
    }
  function readActiveThreadRow(projectId: ProjectId) {
      const activeThreadId = db
        .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
        .get(projectId)?.active_thread_id;
  
      if (!activeThreadId) {
        throw new Error(`Project ${projectId} has no active thread`);
      }
  
      return readThreadRow(projectId, activeThreadId);
    }
  function hydrateMessage(message: MessageRow) {
      return safeParsePersisted(
            chatMessageSchema,
            {
            id: message.id,
            role: message.role,
            kind: message.kind ?? "plain",
            content: normalizeRequiredString(message.content, CHAT_MESSAGE_CONTENT_MAX_CHARS, "Recovered message"),
            attachments: parseChatAttachments(message.attachments_json, {
              table: "thread_messages",
              rowId: message.id,
              field: "attachments_json"
            }),
            metadata: parseChatMessageMetadata(message.metadata_json),
            createdAt: normalizeRequiredString(message.created_at, 256, new Date().toISOString())
            },
            { table: "thread_messages", rowId: message.id }
          );
    }
  function readMessages(threadId: ThreadId) {
      return db
        .query<MessageRow, [string]>(
          `SELECT id, thread_id, role, kind, content, attachments_json, metadata_json, created_at
           FROM thread_messages
           WHERE thread_id = ?1
           ORDER BY created_at ASC`
        )
        .all(threadId)
        .map((message) => hydrateMessage(message))
        .filter((message): message is ChatMessage => message !== undefined);
    }
  function readWorkspaceModes() {
      return db
        .query<WorkspaceModeRow, []>(
          `SELECT
            id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
            plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
           FROM workspace_modes
           ORDER BY updated_at DESC, id ASC`
        )
        .all()
        .map((row) => toModeDefinition(row, "workspace"));
    }
  function readProjectModes(projectId: ProjectId) {
      return db
        .query<ProjectModeRow, [string]>(
          `SELECT
            project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
            plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
           FROM project_modes
           WHERE project_id = ?1
           ORDER BY updated_at DESC, id ASC`
        )
        .all(projectId)
        .map((row) => toModeDefinition(row, "project"));
    }
  return {
    operations: {
      readThreadRow,
      readActiveThreadRow,
      hydrateMessage,
      readMessages,
      readWorkspaceModes,
      readProjectModes,
    },
    publicApi: {
    },
  };
}

export type WorkspaceProjectReadsOperationsSet = ReturnType<typeof createWorkspaceProjectReadsOperations>["operations"];

export function createWorkspaceProjectReadsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  function readWorkspaceRuleSource(): WorkspaceRuleSource | undefined {
      const content = operations.getWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY);
      if (!content) {
        return undefined;
      }
  
      return {
        id: "workspace-rules",
        scope: "workspace",
        label: "Workspace rules",
        content: normalizeRequiredString(content, 32000, "Recovered workspace rules"),
        updatedAt: normalizeRequiredString(operations.getWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY), 256, "unknown")
      };
    }
  function readWorkspaceMemorySummary(): MemorySummary | undefined {
      const content = operations.getWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY);
      if (!content) {
        return undefined;
      }
  
      return {
        id: "workspace-memory",
        scope: "workspace",
        label: "Workspace memory",
        content: normalizeRequiredString(content, 32000, "Recovered workspace memory"),
        updatedAt: normalizeRequiredString(operations.getWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY), 256, "unknown"),
        source: "user"
      };
    }
  return {
    operations: {
      readWorkspaceRuleSource,
      readWorkspaceMemorySummary,
    },
    publicApi: {
    },
  };
}

export type WorkspaceProjectReadsOperations2Set = ReturnType<typeof createWorkspaceProjectReadsOperations2>["operations"];

export function createWorkspaceProjectReadsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceRepositoryReadsOperations3Set & WorkspaceRepositoryReadsOperations4Set) {
  const { repoRoot, db } = context;
  function hydrateThreadSummary(projectId: ProjectId, thread: ThreadRow | WorkspaceThreadPageRow, pageData?: WorkspaceThreadPageRow) {
        try {
          const pageSummary = pageData ? readPagedWorkspaceThreadSummaryData(pageData) : undefined; const pageRunStatus = pageSummary ? agentRunStatusSchema.safeParse(pageSummary.latestRunStatus).data : undefined;
          const latestRun = pageSummary ? pageRunStatus ? { status: pageRunStatus } : undefined : operations.readLatestRun(projectId, thread.id);
          const { preview, messageCount, lastUserMessageAt } = pageSummary ?? readWorkspaceThreadSummaryData(db, thread.id);
  
          return createProjectThreadSummary({
            id: thread.id, kind: backgroundJobThreadKindSchema.parse(thread.kind),
            status: thread.status === "archived" ? "archived" : "active", pinned: normalizeBooleanNumber(thread.pinned),
            title: normalizeRequiredTrimmedString(thread.title, 256, "Recovered thread"), titleSource: normalizeThreadTitleSource(thread.title_source),
            badgeState: getThreadBadgeState(latestRun), messageCount: normalizeInteger(messageCount, 0, 100000, 0),
            lastMessagePreview: preview ? summarizeMessagePreview(preview) : undefined, createdAt: normalizeOptionalString(thread.created_at, 256),
            lastUserMessageAt: normalizeOptionalString(lastUserMessageAt, 256),
            archivedAt: normalizeOptionalString(thread.archived_at, 256), updatedAt: normalizeRequiredString(thread.updated_at, 256, new Date().toISOString()),
            forkedFromThreadId: thread.forked_from_thread_id ?? undefined,
            lineage: readThreadLineage(db, thread.id, thread.forked_from_thread_id)
          });
        } catch (error) {
          throw createThreadLoadError(projectId, thread.id, error);
        }
    }
  function readThreadSummaries(projectId: ProjectId): ProjectThreadSummary[] {
      const threadRows = db
        .query<ThreadRow, [string]>(
          `SELECT
            id, project_id, status, pinned, kind, title, title_source, updated_at, forked_from_thread_id,
            memory_summary_content, memory_summary_updated_at, created_at, archived_at
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY updated_at DESC, created_at DESC`
        )
        .all(projectId);
  
      return threadRows.map((thread) => hydrateThreadSummary(projectId, thread));
    }
  function readProjectSnapshotUnsafe(projectId: ProjectId): WorkspaceProjectState {
      const project = db
        .query<ProjectRow, [string]>(
          `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
           FROM projects
           WHERE id = ?1`
        )
        .get(projectId);
  
      if (!project) {
        throw new Error(`Unknown project: ${projectId}`);
      }
  
      const activeThread = operations.readActiveThreadRow(projectId);
      try {
        return {
          id: project.id,
          name: normalizeRequiredTrimmedString(project.name, 256, "Recovered project"),
          rootPath: normalizeRequiredString(project.root_path, 4096, repoRoot),
          activeThreadId: activeThread.id,
          selectedModeId: normalizeOptionalString(project.selected_mode_id, 128) ?? "implement",
          projectModes: operations.readProjectModes(projectId),
          projectRuleSource: toProjectRuleSource(project),
          threadMemorySummary: toThreadMemorySummary(activeThread),
          threads: readThreadSummaries(projectId),
          session: {
            ...createEmptySession(activeThread.id),
            messages: operations.readMessages(activeThread.id)
          },
          activeRun: operations.readActiveRun(projectId, activeThread.id),
          lastRun: operations.readLatestRun(projectId, activeThread.id),
          runSummaries: operations.readThreadRunSummaries(projectId, activeThread.id)
        };
      } catch (error) {
        throw createThreadLoadError(projectId, activeThread.id, error);
      }
    }
  function readProjectSnapshot(projectId: ProjectId): WorkspaceProjectState {
      let attemptCount = 0;
      while (attemptCount < 8) {
        try {
          return readProjectSnapshotUnsafe(projectId);
        } catch (error) {
          if (!operations.tryRecoverFromProjectLoadFailure(projectId, error)) {
            throw error;
          }
        }
  
        attemptCount += 1;
      }
  
      throw new Error(`Unable to recover project snapshot for ${projectId}`);
    }
  function hydrateProjectCatalogEntry(project: ProjectRow | WorkspaceProjectPageRow, activeThread = readPagedWorkspaceActiveThread(project), modes?: ModeDefinition[]): WorkspaceProjectState {
      return hydrateWorkspaceProjectCatalogEntry(project, repoRoot, { readActiveThread: (id) => activeThread ?? operations.readActiveThreadRow(id),
        threadId: (thread) => thread.id, threadSummary: (id, thread) => hydrateThreadSummary(id, thread, activeThread),
        modes: (id) => modes ?? operations.readProjectModes(id), rules: toProjectRuleSource, memory: toThreadMemorySummary });
    }
  return {
    operations: {
      hydrateThreadSummary,
      readThreadSummaries,
      readProjectSnapshotUnsafe,
      readProjectSnapshot,
      hydrateProjectCatalogEntry,
    },
    publicApi: {
    },
  };
}

export type WorkspaceProjectReadsOperations3Set = ReturnType<typeof createWorkspaceProjectReadsOperations3>["operations"];
