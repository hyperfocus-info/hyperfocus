import type { Database } from "bun:sqlite";
import { browserSessionSchema, isTerminalAgentRunStatus,
  type AgentRunState, type BrowserSession, type ProjectId } from "@hyperfocus/ai-core/protocol";
import { cancelBrowserApprovals, resolveBrowserApproval } from "../../browser-session-state";
import { createLegacyTruncatedId, createStableBoundedId } from "../../notification-ids";
import { runPersistenceMigrationOnce, type PersistenceMigrationScope } from "../persistence-migrations";

type TerminalStatus = Extract<AgentRunState["status"], "completed" | "failed" | "partial-complete" | "stopped">;
export type TerminalRunTransitionInput = { projectId: ProjectId; runId: string; status: TerminalStatus;
  reason: string; failureCategory?: AgentRunState["failureCategory"] };
type RunRow = { status: AgentRunState["status"]; browser_sessions_json: string | null };
type TerminalApprovalRow = RunRow & { id: string; project_id: ProjectId };
const ACTIONABLE_SQL = `CASE WHEN agent_runs.browser_sessions_json IS NOT NULL AND json_valid(agent_runs.browser_sessions_json) THEN EXISTS (
  SELECT 1 FROM json_each(agent_runs.browser_sessions_json) AS session, json_each(session.value, '$.activities') AS activity
  WHERE json_extract(activity.value, '$.approval.status') IN ('pending', 'deferred')) ELSE 0 END`;

export function ensureBrowserApprovalInvariant(db: Database, scope: PersistenceMigrationScope) {
  const columns = new Set(db.query<{ name: string }, []>("PRAGMA table_info(agent_runs)").all().map(({ name }) => name));
  if (!columns.has("browser_sessions_json") || !columns.has("has_actionable_browser_approval")) return;
  runPersistenceMigrationOnce(db, "browser-approval-actionable-v1",
    () => db.exec(`UPDATE agent_runs SET has_actionable_browser_approval = ${ACTIONABLE_SQL}`), scope);
  db.exec(`CREATE INDEX IF NOT EXISTS agent_runs_terminal_browser_approval_idx
    ON agent_runs(has_actionable_browser_approval, status, id);
    DROP TRIGGER IF EXISTS agent_runs_browser_approval_marker_insert;
    CREATE TRIGGER agent_runs_browser_approval_marker_insert AFTER INSERT ON agent_runs BEGIN
      UPDATE agent_runs SET has_actionable_browser_approval = ${ACTIONABLE_SQL} WHERE id = NEW.id;
    END;
    DROP TRIGGER IF EXISTS agent_runs_browser_approval_marker_update;
    CREATE TRIGGER agent_runs_browser_approval_marker_update AFTER UPDATE OF browser_sessions_json ON agent_runs BEGIN
      UPDATE agent_runs SET has_actionable_browser_approval = ${ACTIONABLE_SQL} WHERE id = NEW.id;
    END;
    DROP TRIGGER IF EXISTS agent_runs_browser_approval_marker_guard;
    CREATE TRIGGER agent_runs_browser_approval_marker_guard AFTER UPDATE OF has_actionable_browser_approval ON agent_runs
    WHEN NEW.has_actionable_browser_approval != OLD.has_actionable_browser_approval BEGIN
      UPDATE agent_runs SET has_actionable_browser_approval = ${ACTIONABLE_SQL} WHERE id = NEW.id;
    END;`);
}

export function reconcileTerminalBrowserApprovals(db: Database, pageSize = 128) {
  db.exec("CREATE INDEX IF NOT EXISTS notifications_actionable_run_idx ON notifications(kind, archived_at, run_id)");
  let afterId = "", repaired = 0;
  while (true) {
    const rows = db.query<TerminalApprovalRow, [string, number]>(`WITH candidates AS (
      SELECT id FROM agent_runs WHERE id > ?1 AND has_actionable_browser_approval = 1
        AND status IN ('completed', 'failed', 'partial-complete', 'stopped')
      UNION SELECT notifications.run_id AS id FROM notifications JOIN agent_runs
        ON agent_runs.id = notifications.run_id WHERE notifications.run_id > ?1
        AND notifications.kind = 'browser-approval' AND notifications.archived_at IS NULL
        AND agent_runs.status IN ('completed', 'failed', 'partial-complete', 'stopped'))
      SELECT runs.id, runs.project_id, runs.status, runs.browser_sessions_json FROM candidates
      JOIN agent_runs AS runs ON runs.id = candidates.id ORDER BY runs.id LIMIT ?2`
    ).all(afterId, pageSize);
    if (rows.length === 0) return repaired;
    for (const row of rows) {
      afterId = row.id;
      if (!isTerminalAgentRunStatus(row.status)) continue;
      if (reconcileTerminalCandidate(db, row)) repaired += 1;
    }
  }
}

function reconcileTerminalCandidate(db: Database, selected: TerminalApprovalRow) {
  let row: TerminalApprovalRow | undefined = selected;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!isTerminalAgentRunStatus(row.status)) return false;
    if (persistTerminalRunTransition(db, { projectId: row.project_id, runId: row.id,
      status: row.status, reason: "Run is already terminal" },
    { status: row.status, browser_sessions_json: row.browser_sessions_json })) return true;
    row = db.query<TerminalApprovalRow, [string]>(`SELECT id, project_id, status, browser_sessions_json
      FROM agent_runs WHERE id = ?1`).get(row.id) ?? undefined;
    if (!row) return false;
  }
  throw new Error(`Terminal browser approval ${selected.id} changed repeatedly during startup repair`);
}

export function persistTerminalRunTransition(db: Database, input: TerminalRunTransitionInput,
  expected?: RunRow) {
  return db.transaction(() => {
    const row = requireRun(db, input.projectId, input.runId);
    if (expected && (row.status !== expected.status || row.browser_sessions_json !== expected.browser_sessions_json)) return false;
    const parsed = parseSessions(row.browser_sessions_json), sessions = parsed.sessions;
    const notificationIds = collectApprovalNotificationIds(input.projectId, input.runId, sessions);
    if (isTerminalAgentRunStatus(row.status)) {
      if (row.status !== input.status) return false;
      const now = new Date().toISOString(), shouldRepairJson = parsed.malformed || notificationIds.length > 0;
      if (shouldRepairJson) db.query(`UPDATE agent_runs SET browser_sessions_json = ?3, updated_at = ?4
        WHERE id = ?1 AND project_id = ?2`).run(input.runId, input.projectId,
        JSON.stringify(cancelBrowserApprovals(sessions, input.reason, now)), now);
      archiveNotifications(db, notificationIds, now);
      return shouldRepairJson || archiveRunApprovalNotifications(db, input.runId, now).changes > 0;
    }
    const now = new Date().toISOString(), updated = db.query(`UPDATE agent_runs SET status = ?3,
      browser_sessions_json = ?4, failure_message = ?5, failure_category = ?6, updated_at = ?7,
      completed_at = COALESCE(completed_at, ?7) WHERE id = ?1 AND project_id = ?2`).run(
      input.runId, input.projectId, input.status, JSON.stringify(cancelBrowserApprovals(sessions, input.reason, now)),
      input.status === "completed" ? null : input.reason,
      input.failureCategory ?? null, now,
    );
    if (updated.changes === 0) throw new Error(`Run ${input.runId} changed during terminal transition`);
    archiveNotifications(db, notificationIds, now); archiveRunApprovalNotifications(db, input.runId, now); return true;
  }).immediate();
}

export function persistBrowserApprovalResolution(db: Database, input: {
  projectId: ProjectId; runId: string; sessionId: string; toolCallId: string; approved: boolean;
}) {
  db.transaction(() => {
    const row = requireRun(db, input.projectId, input.runId);
    if (isTerminalAgentRunStatus(row.status)) throw new Error(`Run ${input.runId} is already terminal`);
    const sessions = readSessions(row.browser_sessions_json), next = resolveBrowserApproval(sessions, {
      runId: input.runId, owner: "main", sessionId: input.sessionId, toolCallId: input.toolCallId,
      approved: input.approved,
    });
    if (next === sessions) throw new Error("Browser approval is not pending");
    const now = new Date().toISOString(), updated = db.query(`UPDATE agent_runs SET browser_sessions_json = ?3,
      updated_at = ?4 WHERE id = ?1 AND project_id = ?2`).run(
      input.runId, input.projectId, JSON.stringify(next), now,
    );
    if (updated.changes === 0) throw new Error(`Run ${input.runId} changed during approval resolution`);
    archiveNotifications(db, approvalNotificationIds(input.projectId, input.runId, input.sessionId, input.toolCallId), now);
  }).immediate();
}

function requireRun(db: Database, projectId: ProjectId, runId: string) {
  const row = db.query<RunRow, [string, ProjectId]>(`SELECT status, browser_sessions_json FROM agent_runs
    WHERE id = ?1 AND project_id = ?2`).get(runId, projectId);
  if (!row) throw new Error(`Unknown agent run: ${runId}`); return row;
}
function readSessions(json: string | null) {
  return parseSessions(json).sessions;
}
function parseSessions(json: string | null) {
  if (!json) return { sessions: [], malformed: false };
  try { const parsed = browserSessionSchema.array().safeParse(JSON.parse(json));
    return parsed.success ? { sessions: parsed.data, malformed: false } : { sessions: [], malformed: true }; }
  catch { return { sessions: [], malformed: true }; }
}
function collectApprovalNotificationIds(projectId: ProjectId, runId: string, sessions: BrowserSession[]) {
  return [...new Set(sessions.flatMap((session) => session.activities.flatMap((activity) =>
    activity.approval?.status === "pending" || activity.approval?.status === "deferred"
      ? approvalNotificationIds(projectId, runId, session.id, activity.toolCallId) : [])))];
}
function approvalNotificationIds(projectId: ProjectId, runId: string, sessionId: string, toolCallId: string) {
  const parts = ["browser-approval", projectId, runId, sessionId, toolCallId];
  return [...new Set([createStableBoundedId(parts), createLegacyTruncatedId(parts)])];
}
function archiveNotifications(db: Database, ids: string[], now: string) {
  const archive = db.query(`UPDATE notifications SET read_at = COALESCE(read_at, ?2),
    archived_at = COALESCE(archived_at, ?2) WHERE id = ?1`);
  for (const id of ids) archive.run(id, now);
}
function archiveRunApprovalNotifications(db: Database, runId: string, now: string) {
  return db.query(`UPDATE notifications SET read_at = COALESCE(read_at, ?2), archived_at = COALESCE(archived_at, ?2)
    WHERE run_id = ?1 AND kind = 'browser-approval' AND (read_at IS NULL OR archived_at IS NULL)`).run(runId, now);
}
