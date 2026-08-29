import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureThreadMessageRevisionTriggers } from "./message-content-policy";
import { ensureWorkspacePageRevisionTriggers } from "./workspace-page-revisions";
import { readWorkspaceMessageRows, readWorkspaceProjectModesByProject, readWorkspaceProjectRows, readWorkspaceRunRows, readWorkspaceThreadRows } from "./workspace-pagination";

function createPagingDatabase() {
  const db = new Database(":memory:", { strict: true });
  db.exec(`CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Project', root_path TEXT NOT NULL DEFAULT '/repo',
      active_thread_id TEXT, selected_mode_id TEXT, rules_content TEXT, rules_updated_at TEXT, created_at TEXT NOT NULL DEFAULT '2026-01-01',
      updated_at TEXT NOT NULL, last_opened_at TEXT NOT NULL DEFAULT '2026-01-01');
    CREATE TABLE project_threads (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL,
      kind TEXT NOT NULL, title TEXT NOT NULL, title_source TEXT, updated_at TEXT NOT NULL, forked_from_thread_id TEXT,
      memory_summary_content TEXT, memory_summary_updated_at TEXT, message_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, archived_at TEXT);
    CREATE TABLE thread_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, kind TEXT, content TEXT NOT NULL,
      attachments_json TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
    CREATE TABLE agent_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, thread_id TEXT NOT NULL, status TEXT NOT NULL,
      updated_at TEXT NOT NULL);
    CREATE TABLE project_modes (project_id TEXT NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL, description TEXT NOT NULL,
      planner_prompt TEXT NOT NULL, execution_prompt TEXT NOT NULL, tool_policy TEXT NOT NULL, execution_access TEXT,
      plan_execution_mode_default TEXT, subagent_worktree_strategy_default TEXT, correctness_iteration_mode_default TEXT,
      updated_at TEXT NOT NULL, PRIMARY KEY (project_id, id));`);
  db.query(`INSERT INTO projects (id, updated_at) VALUES ('project-a', '2026-01-01'), ('project-b', '2026-01-01')`).run();
  for (const [id, projectId] of [["thread-a", "project-a"], ["thread-b", "project-b"]]) db.query(`INSERT INTO project_threads
    (id, project_id, status, pinned, kind, title, updated_at, created_at) VALUES (?1, ?2, 'active', 0, 'user', ?1, '2026-01-01', '2026-01-01')`).run(id, projectId);
  db.query(`UPDATE projects SET active_thread_id = CASE id WHEN 'project-a' THEN 'thread-a' ELSE 'thread-b' END`).run();
  ensureThreadMessageRevisionTriggers(db);
  ensureWorkspacePageRevisionTriggers(db);
  return db;
}

test("workspace message keysets bind owner and reject stale revisions", () => {
  const db = createPagingDatabase();
  for (let index = 0; index < 3; index += 1) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, 'thread-a', 'user', 'plain', ?2, ?3)`)
    .run(`message-${index}`, `message ${index}`, `2026-01-01T00:00:0${index}.000Z`);
  const first = readWorkspaceMessageRows(db, "project-a", "thread-a", undefined, 2);
  expect(first.rows.map((row) => row.id)).toEqual(["message-1", "message-2"]);
  expect(() => readWorkspaceMessageRows(db, "project-b", "thread-b", first.nextCursor, 2)).toThrow();
  db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at)
    VALUES ('message-3', 'thread-a', 'user', 'plain', 'new', '2026-01-01T00:00:03.000Z')`).run();
  expect(() => readWorkspaceMessageRows(db, "project-a", "thread-a", first.nextCursor, 2)).toThrow();
  expect(() => readWorkspaceMessageRows(db, "project-a", "thread-b", undefined, 2)).toThrow();
  db.close(false);
});

test("workspace message keysets reject content-only updates through raw persistence", () => {
  const db = createPagingDatabase();
  for (let index = 0; index < 3; index += 1) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, 'thread-a', 'assistant', 'plain', ?2, ?3)`)
    .run(`message-${index}`, `before ${index}`, `2026-01-01T00:00:0${index}.000Z`);
  const first = readWorkspaceMessageRows(db, "project-a", "thread-a", undefined, 2);
  db.query(`UPDATE thread_messages SET content = 'after', metadata_json = '{"streaming":false}' WHERE id = 'message-0'`).run();
  expect(() => readWorkspaceMessageRows(db, "project-a", "thread-a", first.nextCursor, 2)).toThrow();
  db.close(false);
});

test("workspace message keysets invalidate both owners when raw persistence moves a message", () => {
  const db = createPagingDatabase();
  for (const threadId of ["thread-a", "thread-b"]) for (let index = 0; index < 2; index += 1) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, ?2, 'user', 'plain', ?1, ?3)`)
    .run(`${threadId}-${index}`, threadId, `2026-01-01T00:00:0${index}.000Z`);
  const destination = readWorkspaceMessageRows(db, "project-b", "thread-b", undefined, 1);
  const before = db.query<{ message_revision: number }, [string]>(`SELECT message_revision FROM project_threads WHERE id = ?1`).get("thread-a")!.message_revision;
  db.query(`UPDATE thread_messages SET content = 'same owner' WHERE id = 'thread-a-0'`).run();
  expect(db.query<{ message_revision: number }, [string]>(`SELECT message_revision FROM project_threads WHERE id = ?1`).get("thread-a")!.message_revision).toBe(before + 1);
  const source = readWorkspaceMessageRows(db, "project-a", "thread-a", undefined, 1);
  db.query(`UPDATE thread_messages SET thread_id = 'thread-b' WHERE id = 'thread-a-0'`).run();
  expect(() => readWorkspaceMessageRows(db, "project-a", "thread-a", source.nextCursor, 1)).toThrow();
  expect(() => readWorkspaceMessageRows(db, "project-b", "thread-b", destination.nextCursor, 1)).toThrow();
  db.close(false);
});

test("workspace catalog and thread keysets reject child summary mutations", () => {
  const db = createPagingDatabase();
  db.query(`INSERT INTO project_threads (id, project_id, status, pinned, kind, title, updated_at, created_at)
    VALUES ('thread-a-2', 'project-a', 'active', 0, 'user', 'Second', '2026-01-02', '2026-01-02')`).run();
  db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at)
    VALUES ('summary-message', 'thread-a', 'user', 'plain', 'before', '2026-01-03')`).run();
  const cursors = () => ({ projects: readWorkspaceProjectRows(db, undefined, 1).nextCursor,
    threads: readWorkspaceThreadRows(db, "project-a", undefined, 1).nextCursor });
  let stale = cursors(); db.query(`UPDATE thread_messages SET content = 'after' WHERE id = 'summary-message'`).run();
  expect(() => readWorkspaceProjectRows(db, stale.projects, 1)).toThrow();
  expect(() => readWorkspaceThreadRows(db, "project-a", stale.threads, 1)).toThrow();
  db.query(`INSERT INTO agent_runs (id, project_id, thread_id, status, updated_at)
    VALUES ('summary-run', 'project-a', 'thread-a', 'planning', '2026-01-04')`).run();
  stale = cursors(); db.query(`UPDATE agent_runs SET status = 'completed' WHERE id = 'summary-run'`).run();
  expect(() => readWorkspaceProjectRows(db, stale.projects, 1)).toThrow();
  expect(() => readWorkspaceThreadRows(db, "project-a", stale.threads, 1)).toThrow();
  stale = cursors(); db.query(`INSERT INTO project_modes (project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, updated_at)
    VALUES ('project-a', 'ask', 'Ask', 'Ask', 'Ask', 'Ask', 'read-heavy', '2026-01-05')`).run();
  expect(() => readWorkspaceProjectRows(db, stale.projects, 1)).toThrow();
  const activeCursor = readWorkspaceProjectRows(db, undefined, 1).nextCursor;
  db.query(`UPDATE projects SET active_thread_id = 'thread-a-2' WHERE id = 'project-a'`).run();
  expect(() => readWorkspaceProjectRows(db, activeCursor, 1)).toThrow();
  db.close(false);
});

test("workspace summary revisions ignore unrelated and unprojected child mutations", () => {
  const db = createPagingDatabase();
  db.query(`INSERT INTO project_threads (id, project_id, status, pinned, kind, title, updated_at, created_at)
    VALUES ('thread-a-2', 'project-a', 'active', 0, 'user', 'Second', '2026-01-02', '2026-01-02'),
      ('thread-a-archived', 'project-a', 'archived', 0, 'user', 'Archived', '2026-01-03', '2026-01-03')`).run();
  for (const threadId of ["thread-b", "thread-a-archived"]) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, ?2, 'user', 'plain', 'before', '2026-01-04')`).run(`message-${threadId}`, threadId);
  const threadCursor = readWorkspaceThreadRows(db, "project-a", undefined, 1).nextCursor;
  db.query(`UPDATE thread_messages SET content = 'project b changed' WHERE id = 'message-thread-b'`).run();
  expect(readWorkspaceThreadRows(db, "project-a", threadCursor, 1).rows).toHaveLength(1);
  const catalogCursor = readWorkspaceProjectRows(db, undefined, 1).nextCursor;
  db.query(`UPDATE thread_messages SET content = 'archived changed' WHERE id = 'message-thread-a-archived'`).run();
  expect(readWorkspaceProjectRows(db, catalogCursor, 1).rows).toHaveLength(1);
  db.close(false);
});

test("workspace child cursors reject owners recreated with identical durable rows", () => {
  const db = createPagingDatabase();
  db.query(`INSERT INTO project_threads (id, project_id, status, pinned, kind, title, updated_at, created_at)
    VALUES ('thread-a-2', 'project-a', 'active', 0, 'user', 'Second', '2026-01-02', '2026-01-02')`).run();
  for (let index = 0; index < 3; index += 1) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, 'thread-a', 'user', 'plain', ?1, ?2)`)
    .run(`message-${index}`, `2026-01-03T00:00:0${index}.000Z`);
  for (let index = 0; index < 2; index += 1) db.query(`INSERT INTO agent_runs
    (id, project_id, thread_id, status, updated_at) VALUES (?1, 'project-a', 'thread-a', 'planning', ?2)`)
    .run(`run-${index}`, `2026-01-04T00:00:0${index}.000Z`);
  const threadCursor = readWorkspaceThreadRows(db, "project-a", undefined, 1).nextCursor;
  const messageCursor = readWorkspaceMessageRows(db, "project-a", "thread-a", undefined, 1).nextCursor;
  const runCursor = readWorkspaceRunRows(db, `SELECT id, project_id, thread_id, status, updated_at FROM agent_runs`,
    "project-a", "thread-a", undefined, 1).nextCursor;
  db.exec(`DELETE FROM thread_messages WHERE thread_id IN ('thread-a', 'thread-a-2'); DELETE FROM agent_runs WHERE project_id = 'project-a';
    DELETE FROM project_threads WHERE project_id = 'project-a'; DELETE FROM projects WHERE id = 'project-a';`);
  db.query(`INSERT INTO projects (id, active_thread_id, updated_at) VALUES ('project-a', 'thread-a', '2026-01-01')`).run();
  for (const [id, createdAt] of [["thread-a", "2026-01-01"], ["thread-a-2", "2026-01-02"]]) db.query(`INSERT INTO project_threads
    (id, project_id, status, pinned, kind, title, updated_at, created_at) VALUES (?1, 'project-a', 'active', 0, 'user', ?1, ?2, ?2)`).run(id, createdAt);
  for (let index = 0; index < 3; index += 1) db.query(`INSERT INTO thread_messages
    (id, thread_id, role, kind, content, created_at) VALUES (?1, 'thread-a', 'user', 'plain', ?1, ?2)`)
    .run(`message-${index}`, `2026-01-03T00:00:0${index}.000Z`);
  for (let index = 0; index < 2; index += 1) db.query(`INSERT INTO agent_runs
    (id, project_id, thread_id, status, updated_at) VALUES (?1, 'project-a', 'thread-a', 'planning', ?2)`)
    .run(`run-${index}`, `2026-01-04T00:00:0${index}.000Z`);
  expect(() => readWorkspaceThreadRows(db, "project-a", threadCursor, 1)).toThrow();
  expect(() => readWorkspaceMessageRows(db, "project-a", "thread-a", messageCursor, 1)).toThrow();
  expect(() => readWorkspaceRunRows(db, `SELECT id, project_id, thread_id, status, updated_at FROM agent_runs`,
    "project-a", "thread-a", runCursor, 1)).toThrow();
  db.close(false);
});

test("workspace thread cursors accept bootstrap sentinel and reject malformed values", () => {
  const db = createPagingDatabase();
  expect(readWorkspaceThreadRows(db, "project-a", "__start__", 1).rows[0]?.id).toBe("thread-a");
  expect(() => readWorkspaceThreadRows(db, "project-a", "not-a-cursor", 1)).toThrow();
  db.close(false);
});

test("workspace thread pages hydrate card summaries in a constant query count", () => {
  const db = createPagingDatabase();
  for (let index = 0; index < 4; index += 1) {
    const threadId = `thread-${index}`;
    db.query(`INSERT INTO project_threads (id, project_id, status, pinned, kind, title, updated_at, created_at)
      VALUES (?1, 'project-a', 'active', 0, 'user', ?1, ?2, ?2)`).run(threadId, `2026-01-02T00:00:0${index}.000Z`);
    db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at)
      VALUES (?1, ?2, 'user', 'plain', ?3, ?4)`).run(`message-${index}`, threadId, `preview ${index}`, `2026-01-03T00:00:0${index}.000Z`);
    db.query(`INSERT INTO agent_runs (id, project_id, thread_id, status, updated_at)
      VALUES (?1, 'project-a', ?2, 'planning', ?3)`).run(`run-${index}`, threadId, `2026-01-04T00:00:0${index}.000Z`);
  }
  let queryCount = 0;
  const measured: Database = new Proxy(db, { get(target, property) {
    if (property === "query") return (sql: string) => { queryCount += 1; return target.query(sql); };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
  const page = readWorkspaceThreadRows(measured, "project-a", undefined, 5);
  expect(queryCount).toBe(3);
  expect(page.rows.find((row) => row.id === "thread-3")).toMatchObject({ summary_preview: "preview 3",
    summary_message_count: 1, summary_last_user_message_at: "2026-01-03T00:00:03.000Z", summary_latest_run_status: "planning" });
  db.close(false);
});

test("workspace project catalogs hydrate active threads and modes in a fixed query count", () => {
  const db = createPagingDatabase();
  db.query(`INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at)
    VALUES ('catalog-message', 'thread-a', 'user', 'plain', 'catalog preview', '2026-01-03')`).run();
  db.query(`INSERT INTO project_modes (project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, updated_at)
    VALUES ('project-a', 'review', 'Review', 'Review changes', 'Plan', 'Review', 'review-only', '2026-01-04')`).run();
  let queryCount = 0;
  const measured: Database = new Proxy(db, { get(target, property) {
    if (property === "query") return (sql: string) => { queryCount += 1; return target.query(sql); };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
  const page = readWorkspaceProjectRows(measured, undefined, 128);
  const modes = readWorkspaceProjectModesByProject(measured, page.rows.map((row) => row.id), (row) => row.id);
  expect(queryCount).toBe(3);
  expect(page.rows.find((row) => row.id === "project-a")).toMatchObject({ thread_id: "thread-a", summary_preview: "catalog preview",
    summary_message_count: 1, summary_last_user_message_at: "2026-01-03" });
  expect(modes.get("project-a")).toEqual(["review"]);
  db.close(false);
});
