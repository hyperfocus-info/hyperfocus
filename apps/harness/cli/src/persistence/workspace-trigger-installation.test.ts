import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { installWorkspaceMutationTriggers } from "./workspace-trigger-installation";

test("trigger installation holds one immediate lock across replacement and incarnation seeding", () => {
  const path = join(tmpdir(), `harness-trigger-install-${crypto.randomUUID()}.sqlite`);
  const first = new Database(path); first.exec(`PRAGMA journal_mode = WAL; CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE notifications (id TEXT PRIMARY KEY); CREATE TABLE projects (id TEXT PRIMARY KEY, active_thread_id TEXT);
    CREATE TABLE project_threads (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, message_revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE thread_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, content TEXT NOT NULL);
    CREATE TABLE assistant_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL); CREATE TABLE agent_runs
      (id TEXT PRIMARY KEY, project_id TEXT, thread_id TEXT, thread_run_sequence INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE project_modes (id TEXT PRIMARY KEY); INSERT INTO projects VALUES ('project-a', 'thread-a');
    INSERT INTO project_threads VALUES ('thread-a', 'project-a', 0);`);
  const second = new Database(path); second.exec(`PRAGMA busy_timeout = 0;`);
  installWorkspaceMutationTriggers(first, () => {
    expect(() => second.run(`INSERT INTO thread_messages VALUES ('blocked', 'thread-a', 'blocked')`)).toThrow();
  });
  second.run(`INSERT INTO thread_messages VALUES ('committed', 'thread-a', 'committed')`);
  expect(second.query<{ message_revision: number }, []>(`SELECT message_revision FROM project_threads WHERE id = 'thread-a'`).get()?.message_revision).toBe(1);
  expect(second.query<{ value: string }, []>(`SELECT value FROM workspace_meta WHERE key = 'workspace_thread_page_revision:project-a'`).get()?.value).toHaveLength(32);
  first.close(false); second.close(false); rmSync(path, { force: true });
});
