import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { persistCompletedAgentRun } from "./complete-agent-run";
import { persistTerminalRunTransition } from "./terminal-run-transition";

test("completion commits final text and terminal status together and rejects unexecuted or foreign runs", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE agent_runs (id TEXT PRIMARY KEY, project_id TEXT, thread_id TEXT, status TEXT,
      browser_sessions_json TEXT, failure_message TEXT, failure_category TEXT, updated_at TEXT, completed_at TEXT,
      latest_user_prompt TEXT NOT NULL DEFAULT 'Fix backend', plan_json TEXT);
      CREATE TABLE notifications (id TEXT, run_id TEXT, kind TEXT, read_at TEXT, archived_at TEXT);
      CREATE TABLE messages (content TEXT);
      INSERT INTO agent_runs (id, project_id, thread_id, status) VALUES ('run', 'project', 'thread', 'ready');`);
    const input = { projectId: "project", threadId: "thread", runId: "run", status: "completed" as const,
      reason: "done", assistantMessageContent: "Finished" };
    const append = (content: string) => { db.run("INSERT INTO messages VALUES (?1)", [content]); };
    expect(() => persistCompletedAgentRun(db, input, append)).toThrow("cannot complete execution");
    db.run("UPDATE agent_runs SET status = 'running-main'");
    expect(() => persistCompletedAgentRun(db, { ...input, threadId: "other" }, append)).toThrow("completion thread");
    db.exec("CREATE TRIGGER fail_completion BEFORE UPDATE ON agent_runs BEGIN SELECT RAISE(ABORT, 'write failed'); END");
    expect(() => persistCompletedAgentRun(db, input, append)).toThrow("write failed");
    expect(db.query("SELECT content FROM messages").all()).toHaveLength(0);
    expect(db.query("SELECT status FROM agent_runs").get()).toEqual({ status: "running-main" });
    db.exec("DROP TRIGGER fail_completion");
    db.run("UPDATE agent_runs SET latest_user_prompt = 'Fix Books navigation'");
    expect(() => persistCompletedAgentRun(db, input, append)).toThrow("Required UI quality evidence is missing");
    expect(() => persistTerminalRunTransition(db, input)).toThrow("Required UI quality evidence is missing");
    expect(db.query("SELECT content FROM messages").all()).toHaveLength(0);
    expect(db.query("SELECT status FROM agent_runs").get()).toEqual({ status: "running-main" });
    db.run("UPDATE agent_runs SET latest_user_prompt = 'Fix backend'");
    persistCompletedAgentRun(db, input, append);
    expect(db.query("SELECT content FROM messages").all()).toEqual([{ content: "Finished" }]);
    expect(db.query("SELECT status FROM agent_runs").get()).toEqual({ status: "completed" });
    expect(() => persistCompletedAgentRun(db, input, append)).toThrow("cannot complete execution");
    expect(db.query("SELECT content FROM messages").all()).toHaveLength(1);
  } finally { db.close(false); }
});
