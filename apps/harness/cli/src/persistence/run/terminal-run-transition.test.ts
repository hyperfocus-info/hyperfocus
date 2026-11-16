import { ensureBrowserApprovalInvariant } from "./terminal-run-transition";
import { withImmediateMigrationScope } from "../persistence-migrations";
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { persistBrowserApprovalResolution, persistTerminalRunTransition,
  reconcileTerminalBrowserApprovals } from "./terminal-run-transition";
import { requestBrowserApproval } from "../../browser-session-state";
import { createStableBoundedId } from "../../notification-ids";
import { browserSessionSchema } from "@hyperfocus/ai-core/protocol";

test("terminal run transition rolls back run and notification changes together", () => {
  const db = new Database(":memory:");
  const sessions = requestBrowserApproval([], { runId: "run", owner: "main", toolCallId: "tool",
    toolName: "playwright-browser", args: {} });
  const notificationId = createStableBoundedId(["browser-approval", "project", "run", sessions[0]!.id, "tool"]);
  db.exec(`CREATE TABLE agent_runs (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, browser_sessions_json TEXT, has_actionable_browser_approval INTEGER DEFAULT 0,
    failure_message TEXT, failure_category TEXT, updated_at TEXT, completed_at TEXT);
    CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, run_id TEXT, read_at TEXT, archived_at TEXT);`);
  withImmediateMigrationScope(db, scope => ensureBrowserApprovalInvariant(db, scope));
  db.run("INSERT INTO agent_runs VALUES ('run', 'project', 'running-main', ?1, 1, NULL, NULL, 'before', NULL)",
    [JSON.stringify(sessions)]);
  db.run("INSERT INTO notifications (id, kind, run_id, read_at, archived_at) VALUES (?1, 'browser-approval', 'run', NULL, NULL)", [notificationId]);
  db.exec("CREATE TRIGGER fail_archive BEFORE UPDATE ON notifications BEGIN SELECT RAISE(ABORT, 'archive failed'); END");
  expect(() => persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "failed",
    reason: "failed" })).toThrow("archive failed");
  expect(db.query<{ status: string }, []>("SELECT status FROM agent_runs WHERE id = 'run'").get()?.status)
    .toBe("running-main");
  expect(db.query<{ archived_at: string | null }, [string]>("SELECT archived_at FROM notifications WHERE id = ?1")
    .get(notificationId)?.archived_at).toBeNull();
  expect(() => persistBrowserApprovalResolution(db, { projectId: "project", runId: "run",
    sessionId: sessions[0]!.id, toolCallId: "tool", approved: true })).toThrow("archive failed");
  expect(db.query<{ browser_sessions_json: string }, []>("SELECT browser_sessions_json FROM agent_runs WHERE id = 'run'")
    .get()?.browser_sessions_json).toBe(JSON.stringify(sessions));
  db.exec("DROP TRIGGER fail_archive");
  persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "stopped", reason: "stopped" });
  persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "failed", reason: "late failure" });
  expect(db.query<{ status: string }, []>("SELECT status FROM agent_runs WHERE id = 'run'").get()?.status)
    .toBe("stopped");
  const queued = requestBrowserApproval(requestBrowserApproval([], { runId: "run", owner: "main",
    toolCallId: "tool", toolName: "playwright-browser", args: {} }), { runId: "run", owner: "main",
    toolCallId: "tool-2", toolName: "playwright-browser", args: {} });
  db.run("UPDATE agent_runs SET browser_sessions_json = ?1", [JSON.stringify(queued)]);
  const queuedNotificationIds = ["tool", "tool-2"].map((toolCallId) =>
    createStableBoundedId(["browser-approval", "project", "run", queued[0]!.id, toolCallId]));
  for (const queuedNotificationId of queuedNotificationIds) {
    db.run("INSERT OR REPLACE INTO notifications (id, kind, run_id, read_at, archived_at) VALUES (?1, 'browser-approval', 'run', NULL, NULL)", [queuedNotificationId]);
  }
  persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "stopped", reason: "reconcile" });
  const repairedRow = db.query<{ browser_sessions_json: string }, []>(
    "SELECT browser_sessions_json FROM agent_runs WHERE id = 'run'",
  ).get();
  if (!repairedRow) throw new Error("Expected repaired run");
  const repaired = browserSessionSchema.array().parse(JSON.parse(repairedRow.browser_sessions_json));
  expect(repaired[0]?.activities.map((activity) => activity.approval?.status)).toEqual(["rejected", "rejected"]);
  for (const queuedNotificationId of queuedNotificationIds) {
    expect(db.query<{ archived_at: string | null }, [string]>(
      "SELECT archived_at FROM notifications WHERE id = ?1",
    ).get(queuedNotificationId)?.archived_at).not.toBeNull();
  }
  const repairedUpdatedAt = db.query<{ updated_at: string }, []>("SELECT updated_at FROM agent_runs WHERE id = 'run'")
    .get()?.updated_at;
  persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "stopped", reason: "again" });
  expect(db.query<{ updated_at: string }, []>("SELECT updated_at FROM agent_runs WHERE id = 'run'")
    .get()?.updated_at).toBe(repairedUpdatedAt);
  db.close(false);
});

test("terminal approval startup reconciliation pages past corrupt rows", () => {
  const db = new Database(":memory:"), sessions = requestBrowserApproval([], { runId: "z-run", owner: "main",
    toolCallId: "tool", toolName: "playwright-browser", args: {} });
  db.exec(`CREATE TABLE agent_runs (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, browser_sessions_json TEXT, has_actionable_browser_approval INTEGER DEFAULT 0,
    failure_message TEXT, failure_category TEXT, updated_at TEXT, completed_at TEXT);
    CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, run_id TEXT, read_at TEXT, archived_at TEXT);`);
  withImmediateMigrationScope(db, scope => ensureBrowserApprovalInvariant(db, scope));
  for (let index = 0; index < 130; index += 1) {
    const runId = `a-${index.toString().padStart(3, "0")}`;
    db.run("INSERT INTO agent_runs VALUES (?1, 'project', 'stopped', 'corrupt', 0, NULL, NULL, 'before', 'before')",
      [runId]);
    db.run("INSERT INTO notifications VALUES (?1, 'browser-approval', ?2, NULL, NULL)", [`notice-${runId}`, runId]);
  }
  db.run("INSERT INTO agent_runs VALUES ('z-run', 'project', 'stopped', ?1, 1, NULL, NULL, 'before', 'before')",
    [JSON.stringify(sessions)]);
  const notificationId = createStableBoundedId(["browser-approval", "project", "z-run", sessions[0]!.id, "tool"]);
  db.run("INSERT INTO notifications VALUES (?1, 'browser-approval', 'z-run', NULL, NULL)", [notificationId]);
  expect(reconcileTerminalBrowserApprovals(db, 2)).toBe(131);
  expect(db.query<{ archived_at: string | null }, [string]>("SELECT archived_at FROM notifications WHERE id = ?1")
    .get(notificationId)?.archived_at).not.toBeNull(); db.close(false);
});

test("startup reconciliation CAS does not stop a resumed run", () => {
  const db = new Database(":memory:"), sessions = requestBrowserApproval([], { runId: "run", owner: "main",
    toolCallId: "tool", toolName: "playwright-browser", args: {} }), json = JSON.stringify(sessions);
  db.exec(`CREATE TABLE agent_runs (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, browser_sessions_json TEXT, has_actionable_browser_approval INTEGER DEFAULT 0,
    failure_message TEXT, failure_category TEXT, updated_at TEXT, completed_at TEXT);
    CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, run_id TEXT, read_at TEXT, archived_at TEXT);`);
  withImmediateMigrationScope(db, scope => ensureBrowserApprovalInvariant(db, scope));
  db.run("INSERT INTO agent_runs VALUES ('run', 'project', 'stopped', ?1, 1, NULL, NULL, 'before', 'before')", [json]);
  db.run("UPDATE agent_runs SET status = 'running-main'");
  expect(persistTerminalRunTransition(db, { projectId: "project", runId: "run", status: "stopped", reason: "repair" },
    { status: "stopped", browser_sessions_json: json })).toBe(false);
  expect(db.query<{ status: string }, []>("SELECT status FROM agent_runs").get()?.status).toBe("running-main"); db.close(false);
});
