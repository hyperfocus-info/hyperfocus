import type { Database } from "bun:sqlite";
import { z } from "zod";
import { createThreadId, projectThreadSummarySchema, type ProjectId, type ThreadId } from "@hyperfocus/ai-core/protocol";

export function installThreadCollaboration(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS thread_delegations (
    thread_id TEXT PRIMARY KEY REFERENCES project_threads(id) ON DELETE CASCADE,
    parent_thread_id TEXT NOT NULL REFERENCES project_threads(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    subagent_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    UNIQUE(run_id, subagent_id)
  );
  CREATE INDEX IF NOT EXISTS thread_delegations_parent ON thread_delegations(parent_thread_id);
  CREATE TABLE IF NOT EXISTS thread_message_queue (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL REFERENCES project_threads(id) ON DELETE CASCADE,
    content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', error TEXT,
    created_at TEXT NOT NULL, run_id TEXT
  );
  CREATE INDEX IF NOT EXISTS thread_message_queue_status ON thread_message_queue(status, created_at);`);
}

export function readThreadLineage(db: Database, threadId: string, forkedFrom?: string | null) {
  const row = db.query<{ parentThreadId: string; runId: string; subagentId: string; status: string }, [string]>(
    `SELECT d.parent_thread_id AS parentThreadId, d.run_id AS runId, d.subagent_id AS subagentId,
       CASE WHEN d.status = 'running' AND r.status IN ('stopped', 'failed', 'completed', 'partial-complete')
         THEN 'stopped' ELSE d.status END AS status
     FROM thread_delegations d JOIN agent_runs r ON r.id = d.run_id WHERE d.thread_id = ?`).get(threadId);
  return row ? projectThreadSummarySchema.shape.lineage.parse({ ...row, relationship: "subagent" })
    : forkedFrom ? { parentThreadId: forkedFrom, relationship: "fork" as const } : undefined;
}

const messageInput = z.object({
  projectId: z.string().min(1), sourceThreadId: z.string().min(1), targetThreadId: z.string().min(1),
  message: z.string().trim().min(1).max(16000), deliveryId: z.string().uuid()
});

export function createThreadCollaboration(db: Database) {
  function requireThread(projectId: string, threadId: string) {
    const row = db.query<{ title: string; status: string }, [string, string]>(
      "SELECT title, status FROM project_threads WHERE project_id = ? AND id = ?").get(projectId, threadId);
    if (!row) throw new Error("Thread does not belong to this project");
    if (row.status === "archived") throw new Error("Restore the archived thread before messaging");
    return row;
  }
  function ensureSubagentThread(input: {
    projectId: ProjectId; parentThreadId: ThreadId; runId: string; subagentId: string; title: string; instruction: string;
  }) {
    return db.transaction(() => {
      requireThread(input.projectId, input.parentThreadId);
      const run = db.query<{ thread_id: string }, [string, string]>(
        "SELECT thread_id FROM agent_runs WHERE id = ? AND project_id = ?").get(input.runId, input.projectId);
      if (!run || run.thread_id !== input.parentThreadId) throw new Error("Subagent run does not belong to its parent thread");
      const existing = db.query<{ thread_id: string }, [string, string]>(
        "SELECT thread_id FROM thread_delegations WHERE run_id = ? AND subagent_id = ?").get(input.runId, input.subagentId);
      if (existing) {
        db.query("UPDATE thread_delegations SET status = 'running' WHERE thread_id = ?").run(existing.thread_id);
        return existing.thread_id;
      }
      const id = createThreadId(), now = new Date().toISOString();
      db.query(`INSERT INTO project_threads (id, project_id, status, pinned, kind, title, title_source, updated_at, created_at)
        VALUES (?, ?, 'active', 0, 'user', ?, 'generated', ?, ?)`)
        .run(id, input.projectId, input.title.slice(0, 256), now, now);
      db.query("INSERT INTO thread_delegations VALUES (?, ?, ?, ?, 'running')")
        .run(id, input.parentThreadId, input.runId, input.subagentId);
      db.query("INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at) VALUES (?, ?, 'user', 'plain', ?, ?)")
        .run(crypto.randomUUID(), id, input.instruction, now);
      return id;
    }).immediate();
  }
  function getSubagentThread(input: { runId: string; subagentId: string }) {
    return db.query<{ thread_id: string }, [string, string]>(
      "SELECT thread_id FROM thread_delegations WHERE run_id = ? AND subagent_id = ?").get(input.runId, input.subagentId)?.thread_id;
  }
  function finishSubagentThread(input: { runId: string; subagentId: string; status: "completed" | "failed"; output: string }) {
    const threadId = getSubagentThread(input);
    if (!threadId) return;
    db.transaction(() => {
      const now = new Date().toISOString();
      db.query("UPDATE thread_delegations SET status = ? WHERE thread_id = ?").run(input.status, threadId);
      db.query("INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at) VALUES (?, ?, 'assistant', 'plain', ?, ?)")
        .run(crypto.randomUUID(), threadId, input.output || `Subagent ${input.status}.`, now);
      db.query("UPDATE project_threads SET updated_at = ? WHERE id = ?").run(now, threadId);
    }).immediate();
  }
  function sendThreadMessage(input: z.infer<typeof messageInput>) {
    const value = messageInput.parse(input);
    return db.transaction(() => {
      const source = requireThread(value.projectId, value.sourceThreadId);
      const target = requireThread(value.projectId, value.targetThreadId);
      if (value.sourceThreadId === value.targetThreadId) throw new Error("Choose another thread");
      const existing = db.query<{ content: string; thread_id: string; metadata_json: string }, [string]>(
        "SELECT content, thread_id, metadata_json FROM thread_messages WHERE id = ?").get(value.deliveryId);
      const receivedContent = `Message from thread “${source.title}” (${value.sourceThreadId}):\n\n${value.message}`;
      if (existing) {
        const metadata = JSON.parse(existing.metadata_json);
        if (existing.thread_id !== value.targetThreadId || (metadata.body !== undefined ? metadata.body !== value.message : existing.content !== receivedContent)
          || metadata.sourceThreadId !== value.sourceThreadId) throw new Error("Message retry conflicts with the original delivery");
        return { deliveryId: value.deliveryId, status: "queued" as const };
      }
      const now = new Date().toISOString();
      for (const direction of ["sent", "received"] as const) {
        const threadId = direction === "sent" ? value.sourceThreadId : value.targetThreadId;
        const content = direction === "sent" ? `Message sent to thread “${target.title}” (${value.targetThreadId}):\n\n${value.message}` : receivedContent;
        const metadata = { type: "thread-message", sourceThreadId: value.sourceThreadId, targetThreadId: value.targetThreadId, deliveryId: value.deliveryId, body: value.message, direction };
        db.query("INSERT INTO thread_messages (id, thread_id, role, kind, content, metadata_json, created_at) VALUES (?, ?, 'assistant', 'plain', ?, ?, ?)")
          .run(direction === "received" ? value.deliveryId : crypto.randomUUID(), threadId, content, JSON.stringify(metadata), now);
        db.query("UPDATE project_threads SET updated_at = ? WHERE id = ?").run(now, threadId);
      }
      enqueueThreadMessage({ id: value.deliveryId, projectId: value.projectId, threadId: value.targetThreadId, content: receivedContent });
      return { deliveryId: value.deliveryId, status: "queued" as const };
    }).immediate();
  }
  function enqueueThreadMessage(input: { id: string; projectId: string; threadId: string; content: string }) {
    return db.transaction(() => {
    requireThread(input.projectId, input.threadId);
    const content = z.string().trim().min(1).max(20000).parse(input.content);
    const existing = db.query<{ content: string; thread_id: string }, [string]>("SELECT content, thread_id FROM thread_message_queue WHERE id = ?").get(input.id);
    if (existing && (existing.content !== content || existing.thread_id !== input.threadId)) throw new Error("Queued message retry conflicts with its original");
    db.query("INSERT OR IGNORE INTO thread_message_queue (id, project_id, thread_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.id, input.projectId, input.threadId, content, new Date().toISOString());
    if (!existing) db.query("INSERT INTO thread_messages (id, thread_id, role, kind, content, created_at) VALUES (?, ?, 'assistant', 'plain', ?, ?)")
      .run(`queue:${input.id}`, input.threadId, `Queued for the next turn:\n\n${content}`, new Date().toISOString());
    return { id: input.id, status: "queued" as const };
    }).immediate();
  }
  function listRunningThreadMessages() {
    return db.query<{ id: string; projectId: string; threadId: string; runId: string | null }, []>(
      "SELECT id, project_id AS projectId, thread_id AS threadId, run_id AS runId FROM thread_message_queue WHERE status = 'running'").all();
  }
  function listQueuedThreadMessages() {
    return db.query<{ id: string; projectId: string; threadId: string; content: string }, []>(
      "SELECT id, project_id AS projectId, thread_id AS threadId, content FROM thread_message_queue WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 100").all();
  }
  function updateQueuedThreadMessage(input: { id: string; status: "running" | "completed" | "failed"; error?: string; runId?: string }) {
    db.query("UPDATE thread_message_queue SET status = ?, error = ?, run_id = COALESCE(?, run_id) WHERE id = ?")
      .run(input.status, input.error ?? null, input.runId ?? null, input.id);
    const original = db.query<{ content: string }, [string]>("SELECT content FROM thread_message_queue WHERE id = ?").get(input.id);
    const status = input.status === "running" ? "Queued message is starting a turn." : input.status === "failed"
      ? `Queued message failed: ${input.error ?? "Run failed"}` : "Queued message was processed. See its turn below.";
    db.query("UPDATE thread_messages SET content = ? WHERE id = ?")
      .run(`${status}\n\n${original?.content ?? ""}`, `queue:${input.id}`);
  }
  return { ensureSubagentThread, getSubagentThread, finishSubagentThread, sendThreadMessage,
    enqueueThreadMessage, listQueuedThreadMessages, listRunningThreadMessages, updateQueuedThreadMessage };
}
