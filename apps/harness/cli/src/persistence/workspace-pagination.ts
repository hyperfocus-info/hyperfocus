import type { Database } from "bun:sqlite";
import { createEmptySession, projectIdSchema, projectRootPathSchema, threadIdSchema,
  type CorrectnessIterationMode, type PlanExecutionMode, type ProjectThreadSummary, type SubagentWorktreeStrategy,
  type WorkspaceProjectState, type ProjectId } from "@hyperfocus/ai-core/protocol";
import { createPageCursorError, decodePageCursor, encodePageCursor } from "./page-cursor-codec";
export { ensureWorkspacePageRevisionTriggers } from "./workspace-page-revisions";
export { installWorkspaceMutationTriggers } from "./workspace-trigger-installation";
import { workspacePageRevisionSql, workspaceThreadIncarnationSql, workspaceThreadPageRevisionSql } from "./workspace-page-revisions";

export type WorkspacePageKind = "projects" | "threads" | "messages" | "runs";
type Cursor = { v: 1; kind: WorkspacePageKind; owner: string; revision: string; position: string[] };
export type RawWorkspacePage<Row> = { rows: Row[]; nextCursor?: string; totalApprox: number };
export function mapValidWorkspaceRows<Row, Item>(rows: Row[], hydrate: (row: Row) => Item | undefined) {
  const items: Item[] = []; for (const row of rows) { try { const item = hydrate(row); if (item !== undefined) items.push(item); } catch { /* raw cursor still advances */ } }
  return items;
}
export function findProjectIdByNormalizedRootPath(db: Database, normalizedRootPath: string) {
  return db.query<{ id: ProjectId }, [string]>("SELECT id FROM projects WHERE root_path = ?1").get(normalizedRootPath)?.id;
}

function cursorError() { return createPageCursorError("Invalid or stale workspace page cursor"); }
function encode(cursor: Cursor) { return encodePageCursor({ identity: { scope: "workspace", kind: cursor.kind,
  owner: cursor.owner, revision: cursor.revision }, position: cursor.position }); }
function decode(value: string | undefined, kind: WorkspacePageKind, owner: string, revision: string) {
  const position = decodePageCursor({ encoded: value, startToken: "__start__",
    identity: { scope: "workspace", kind, owner, revision } });
  if (position === undefined) return undefined;
  if (!Array.isArray(position) || position.some((item) => typeof item !== "string")) throw cursorError();
  return position;
}

function revision(db: Database, sql: string, values: string[]) {
  const row = db.query<{ count: number; changed: string | null; edge: string | null; salt?: string | null }, string[]>(sql).get(...values);
  return `${row?.count ?? 0}:${row?.changed ?? ""}:${row?.edge ?? ""}:${row?.salt ?? ""}`;
}

function ownerExists(db: Database, owner: string) {
  if (!db.query<{ present: number }, [string]>(`SELECT 1 AS present FROM projects WHERE id = ?1`).get(owner)) throw cursorError();
}

export type WorkspaceProjectPageRow = { id: string; name: string; root_path: string; active_thread_id: string | null;
  selected_mode_id: string | null; rules_content: string | null; rules_updated_at: string | null; created_at: string; updated_at: string; last_opened_at: string;
  thread_id?: string | null; thread_project_id?: string | null; thread_status?: string | null; thread_pinned?: number | null; thread_kind?: string | null;
  thread_title?: string | null; thread_title_source?: string | null; thread_updated_at?: string | null; thread_forked_from_thread_id?: string | null;
  thread_memory_summary_content?: string | null; thread_memory_summary_updated_at?: string | null; thread_created_at?: string | null;
  thread_archived_at?: string | null; summary_preview?: string | null; summary_message_count?: number; summary_last_user_message_at?: string | null;
  summary_latest_run_status?: string | null };
export function readWorkspaceProjectRows(db: Database, cursorValue: string | undefined, limit: number): RawWorkspacePage<WorkspaceProjectPageRow> {
  const owner = "workspace";
  const current = revision(db, `SELECT COUNT(*) AS count, MAX(updated_at) AS changed, MAX(id) AS edge, ${workspacePageRevisionSql} AS salt FROM projects`, []);
  const position = decode(cursorValue, "projects", owner, current);
  if (position && position.length !== 3) throw cursorError();
  const select = `SELECT projects.id, projects.name, projects.root_path, projects.active_thread_id, projects.selected_mode_id,
    projects.rules_content, projects.rules_updated_at, projects.created_at, projects.updated_at, projects.last_opened_at,
    active.id AS thread_id, active.project_id AS thread_project_id, active.status AS thread_status, active.pinned AS thread_pinned,
    active.kind AS thread_kind, active.title AS thread_title, active.title_source AS thread_title_source, active.updated_at AS thread_updated_at,
    active.forked_from_thread_id AS thread_forked_from_thread_id, active.memory_summary_content AS thread_memory_summary_content,
    active.memory_summary_updated_at AS thread_memory_summary_updated_at, active.created_at AS thread_created_at, active.archived_at AS thread_archived_at,
    COALESCE((SELECT content FROM thread_messages WHERE thread_id = active.id AND role != 'system' AND kind != 'run-milestones' ORDER BY created_at DESC LIMIT 1),
      (SELECT content FROM thread_messages WHERE thread_id = active.id AND kind != 'run-milestones' ORDER BY created_at DESC LIMIT 1)) AS summary_preview,
    (SELECT COUNT(*) FROM thread_messages WHERE thread_id = active.id) AS summary_message_count,
    (SELECT created_at FROM thread_messages WHERE thread_id = active.id AND role = 'user' ORDER BY created_at DESC LIMIT 1) AS summary_last_user_message_at,
    (SELECT status FROM agent_runs WHERE project_id = projects.id AND thread_id = active.id ORDER BY updated_at DESC LIMIT 1) AS summary_latest_run_status
    FROM projects LEFT JOIN project_threads active ON active.id = projects.active_thread_id AND active.project_id = projects.id`;
  const rows = position ? db.query<WorkspaceProjectPageRow, [string, string, string, number]>(`${select}
    WHERE projects.last_opened_at < ?1 OR (projects.last_opened_at = ?1 AND (projects.created_at > ?2 OR (projects.created_at = ?2 AND projects.id > ?3)))
    ORDER BY projects.last_opened_at DESC, projects.created_at ASC, projects.id ASC LIMIT ?4`).all(position[0]!, position[1]!, position[2]!, limit + 1)
    : db.query<WorkspaceProjectPageRow, [number]>(`${select} ORDER BY projects.last_opened_at DESC, projects.created_at ASC, projects.id ASC LIMIT ?1`).all(limit + 1);
  const items = rows.slice(0, limit); const last = items.at(-1);
  return { rows: items, totalApprox: Number(current.split(":", 1)[0]), nextCursor: rows.length > limit && last
    ? encode({ v: 1, kind: "projects", owner, revision: current, position: [last.last_opened_at, last.created_at, last.id] }) : undefined };
}

export type WorkspaceProjectModePageRow = { project_id: string; id: string; label: string; description: string; planner_prompt: string;
  execution_prompt: string; tool_policy: "full-access" | "read-heavy" | "review-only"; execution_access: "workspace-write" | "read-only" | null;
  plan_execution_mode_default: PlanExecutionMode | null; subagent_worktree_strategy_default: SubagentWorktreeStrategy | null;
  correctness_iteration_mode_default: CorrectnessIterationMode | null; updated_at: string };
export function readWorkspaceProjectModesByProject<Item>(db: Database, projectIds: string[], hydrate: (row: WorkspaceProjectModePageRow) => Item) {
  const grouped = new Map<string, Item[]>(); if (projectIds.length === 0) return grouped;
  const placeholders = projectIds.map((_, index) => `?${index + 1}`).join(",");
  const rows = db.query<WorkspaceProjectModePageRow, string[]>(`SELECT project_id, id, label, description, planner_prompt, execution_prompt,
    tool_policy, execution_access, plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default,
    updated_at FROM project_modes WHERE project_id IN (${placeholders}) ORDER BY project_id, updated_at DESC, id ASC`).all(...projectIds);
  for (const row of rows) { try { const items = grouped.get(row.project_id) ?? []; items.push(hydrate(row)); grouped.set(row.project_id, items); } catch { /* corrupt mode */ } }
  return grouped;
}

export function readPagedWorkspaceActiveThread(row: WorkspaceProjectPageRow): WorkspaceThreadPageRow | undefined {
  if (!row.thread_id || row.thread_project_id !== row.id || !row.thread_status || row.thread_pinned === null || row.thread_pinned === undefined ||
    !row.thread_kind || !row.thread_title || !row.thread_updated_at || !row.thread_created_at) return undefined;
  return { id: row.thread_id, project_id: row.thread_project_id, status: row.thread_status, pinned: row.thread_pinned, kind: row.thread_kind,
    title: row.thread_title, title_source: row.thread_title_source ?? null, updated_at: row.thread_updated_at,
    forked_from_thread_id: row.thread_forked_from_thread_id ?? null, memory_summary_content: row.thread_memory_summary_content ?? null,
    memory_summary_updated_at: row.thread_memory_summary_updated_at ?? null, created_at: row.thread_created_at, archived_at: row.thread_archived_at ?? null,
    summary_preview: row.summary_preview, summary_message_count: row.summary_message_count,
    summary_last_user_message_at: row.summary_last_user_message_at, summary_latest_run_status: row.summary_latest_run_status };
}
export function requirePagedWorkspaceActiveThread(row: WorkspaceProjectPageRow) {
  const thread = readPagedWorkspaceActiveThread(row); if (!thread) throw new Error(`Project ${row.id} has no valid active thread`); return thread;
}

export type WorkspaceThreadPageRow = { id: string; project_id: string; status: string; pinned: number; kind: string; title: string;
  title_source: string | null; updated_at: string; forked_from_thread_id: string | null; memory_summary_content: string | null;
  memory_summary_updated_at: string | null; created_at: string; archived_at: string | null; summary_preview?: string | null;
  summary_message_count?: number; summary_last_user_message_at?: string | null; summary_latest_run_status?: string | null };
export function readWorkspaceThreadRows<Row extends WorkspaceThreadPageRow = WorkspaceThreadPageRow>(db: Database, projectId: string, cursorValue: string | undefined, limit: number): RawWorkspacePage<Row> {
  ownerExists(db, projectId); const current = revision(db, `SELECT COUNT(*) AS count, MAX(updated_at) AS changed, MAX(id) AS edge, ${workspaceThreadPageRevisionSql} AS salt FROM project_threads WHERE project_id = ?1`, [projectId]);
  const position = decode(cursorValue, "threads", projectId, current); if (position && position.length !== 2) throw cursorError();
  const select = `SELECT id, project_id, status, pinned, kind, title, title_source, updated_at, forked_from_thread_id,
    memory_summary_content, memory_summary_updated_at, created_at, archived_at,
    COALESCE((SELECT content FROM thread_messages WHERE thread_id = project_threads.id AND role != 'system'
      AND kind != 'run-milestones' ORDER BY created_at DESC LIMIT 1),
      (SELECT content FROM thread_messages WHERE thread_id = project_threads.id AND kind != 'run-milestones'
        ORDER BY created_at DESC LIMIT 1)) AS summary_preview,
    (SELECT COUNT(*) FROM thread_messages WHERE thread_id = project_threads.id) AS summary_message_count,
    (SELECT created_at FROM thread_messages WHERE thread_id = project_threads.id AND role = 'user'
      ORDER BY created_at DESC LIMIT 1) AS summary_last_user_message_at,
    (SELECT status FROM agent_runs WHERE project_id = project_threads.project_id AND thread_id = project_threads.id
      ORDER BY updated_at DESC LIMIT 1) AS summary_latest_run_status
    FROM project_threads WHERE project_id = ?1`;
  const rows = position ? db.query<Row, [string, string, string, number]>(`${select} AND (updated_at < ?2 OR (updated_at = ?2 AND id < ?3)) ORDER BY updated_at DESC, id DESC LIMIT ?4`).all(projectId, position[0]!, position[1]!, limit + 1)
    : db.query<Row, [string, number]>(`${select} ORDER BY updated_at DESC, id DESC LIMIT ?2`).all(projectId, limit + 1);
  return finish(rows, limit, "threads", projectId, current, (row) => [row.updated_at, row.id]);
}

export type WorkspaceMessagePageRow = { id: string; thread_id: string; role: string; kind: string | null; content: string;
  attachments_json: string | null; metadata_json: string | null; created_at: string };
export function readWorkspaceMessageRows<Row extends WorkspaceMessagePageRow = WorkspaceMessagePageRow>(db: Database, projectId: string, threadId: string, cursorValue: string | undefined, limit: number): RawWorkspacePage<Row> {
  if (!db.query<{ present: number }, [string, string]>(`SELECT 1 AS present FROM project_threads WHERE project_id = ?1 AND id = ?2`).get(projectId, threadId)) throw cursorError();
  const owner = `${projectId}:${threadId}`; const messageState = db.query<{ count: number; message_revision: number; incarnation: string }, [string]>(
    `SELECT message_revision, (SELECT COUNT(*) FROM thread_messages WHERE thread_id = ?1) AS count, ${workspaceThreadIncarnationSql(1)} AS incarnation
     FROM project_threads WHERE id = ?1`).get(threadId);
  const current = `${messageState?.count ?? 0}:${messageState?.message_revision ?? 0}:${messageState?.incarnation ?? ""}`;
  const position = decode(cursorValue, "messages", owner, current); if (position && position.length !== 2) throw cursorError();
  const select = `SELECT id, thread_id, role, kind, content, attachments_json, metadata_json, created_at FROM thread_messages WHERE thread_id = ?1`;
  const rows = position ? db.query<Row, [string, string, string, number]>(`${select} AND (created_at < ?2 OR (created_at = ?2 AND id < ?3)) ORDER BY created_at DESC, id DESC LIMIT ?4`).all(threadId, position[0]!, position[1]!, limit + 1)
    : db.query<Row, [string, number]>(`${select} ORDER BY created_at DESC, id DESC LIMIT ?2`).all(threadId, limit + 1);
  const page = finish(rows, limit, "messages", owner, current, (row) => [row.created_at, row.id]); page.rows.reverse(); return page;
}

export type WorkspaceRunPageRow = Record<string, unknown> & { id: string; project_id: string; thread_id: string; updated_at: string };
export function readWorkspaceRunRows<Row extends WorkspaceRunPageRow>(db: Database, selectSql: string, projectId: string, threadId: string,
  cursorValue: string | undefined, limit: number): RawWorkspacePage<Row> {
  if (!db.query<{ present: number }, [string, string]>(`SELECT 1 AS present FROM project_threads WHERE project_id = ?1 AND id = ?2`).get(projectId, threadId)) throw cursorError();
  const owner = `${projectId}:${threadId}`; const current = revision(db, `SELECT COUNT(*) AS count, MAX(updated_at) AS changed, MAX(id) AS edge,
    ${workspaceThreadIncarnationSql(2)} AS salt FROM agent_runs WHERE project_id = ?1 AND thread_id = ?2`, [projectId, threadId]);
  const position = decode(cursorValue, "runs", owner, current); if (position && position.length !== 2) throw cursorError();
  const rows = position ? db.query<Row, [string, string, string, string, number]>(`${selectSql} WHERE project_id = ?1 AND thread_id = ?2 AND (updated_at < ?3 OR (updated_at = ?3 AND id < ?4)) ORDER BY updated_at DESC, id DESC LIMIT ?5`).all(projectId, threadId, position[0]!, position[1]!, limit + 1)
    : db.query<Row, [string, string, number]>(`${selectSql} WHERE project_id = ?1 AND thread_id = ?2 ORDER BY updated_at DESC, id DESC LIMIT ?3`).all(projectId, threadId, limit + 1);
  return finish(rows, limit, "runs", owner, current, (row) => [row.updated_at, row.id]);
}

function finish<Row>(rows: Row[], limit: number, kind: WorkspacePageKind, owner: string, current: string, position: (row: Row) => string[]): RawWorkspacePage<Row> {
  const items = rows.slice(0, limit); const last = items.at(-1);
  return { rows: items, totalApprox: Number(current.split(":", 1)[0]), nextCursor: rows.length > limit && last
    ? encode({ v: 1, kind, owner, revision: current, position: position(last) }) : undefined };
}

export function hydrateWorkspaceProjectCatalogEntry<Row extends WorkspaceProjectPageRow, Thread>(project: Row, repoRoot: string, access: {
  readActiveThread(projectId: ReturnType<typeof projectIdSchema.parse>): Thread;
  threadId(thread: Thread): string; threadSummary(projectId: ReturnType<typeof projectIdSchema.parse>, thread: Thread): ProjectThreadSummary;
  modes(projectId: ReturnType<typeof projectIdSchema.parse>): WorkspaceProjectState["projectModes"];
  rules(project: Row): WorkspaceProjectState["projectRuleSource"]; memory(thread: Thread): WorkspaceProjectState["threadMemorySummary"];
}): WorkspaceProjectState {
  const projectId = projectIdSchema.parse(project.id); const activeThread = access.readActiveThread(projectId);
  const threadId = threadIdSchema.parse(access.threadId(activeThread));
  return { id: projectId, name: project.name.trim() || "Recovered project",
    rootPath: projectRootPathSchema.parse(project.root_path || repoRoot), activeThreadId: threadId,
    selectedModeId: project.selected_mode_id?.trim() || "implement", projectModes: access.modes(projectId),
    projectRuleSource: access.rules(project), threadMemorySummary: access.memory(activeThread),
    threads: [access.threadSummary(projectId, activeThread)], threadsNextCursor: "__start__",
    session: createEmptySession(threadId), messagesNextCursor: "__start__", runSummaries: [], runSummariesNextCursor: "__start__" };
}

export function readWorkspaceThreadSummaryData(db: Database, threadId: string) {
  const preferred = db.query<{ content: string }, [string]>(`SELECT content FROM thread_messages WHERE thread_id = ?1
    AND role != 'system' AND kind != 'run-milestones' ORDER BY created_at DESC LIMIT 1`).get(threadId)?.content;
  const preview = preferred ?? db.query<{ content: string }, [string]>(`SELECT content FROM thread_messages WHERE thread_id = ?1
    AND kind != 'run-milestones' ORDER BY created_at DESC LIMIT 1`).get(threadId)?.content;
  const messageCount = db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(threadId)?.count ?? 0;
  const lastUserMessageAt = db.query<{ created_at: string }, [string]>(`SELECT created_at FROM thread_messages WHERE thread_id = ?1
    AND role = 'user' ORDER BY created_at DESC LIMIT 1`).get(threadId)?.created_at;
  return { preview, messageCount, lastUserMessageAt };
}

export function readPagedWorkspaceThreadSummaryData(row: WorkspaceThreadPageRow) {
  return { preview: row.summary_preview ?? undefined, messageCount: row.summary_message_count ?? 0,
    lastUserMessageAt: row.summary_last_user_message_at ?? undefined, latestRunStatus: row.summary_latest_run_status ?? undefined };
}
