import type { Database } from "bun:sqlite";
import { CHAT_MESSAGE_CONTENT_MAX_CHARS } from "@hyperfocus/ai-core/protocol";

export function assertPersistableMessageContent(content: string) {
  if (content.length > CHAT_MESSAGE_CONTENT_MAX_CHARS) throw new Error("Chat message exceeds the persisted content limit");
}

export function appendPersistableMessageDelta(content: string, delta: string) {
  if (content.length + delta.length > CHAT_MESSAGE_CONTENT_MAX_CHARS)
    throw new Error("Chat message exceeds the persisted content limit");
  return content + delta;
}

export function ensureMessageContentLimitTriggers(db: Database) {
  for (const table of ["thread_messages", "assistant_messages"]) for (const operation of ["INSERT", "UPDATE"]) db.run(
    `CREATE TRIGGER IF NOT EXISTS ${table}_content_limit_${operation.toLowerCase()} BEFORE ${operation} ON ${table}
     WHEN length(NEW.content) > ${CHAT_MESSAGE_CONTENT_MAX_CHARS} BEGIN SELECT RAISE(ABORT, 'message content exceeds limit'); END`);
}

export function ensureThreadMessageRevisionTriggers(db: Database) {
  for (const operation of ["INSERT", "DELETE"] as const) {
    const row = operation === "DELETE" ? "OLD" : "NEW";
    db.run(`CREATE TRIGGER IF NOT EXISTS thread_messages_revision_${operation.toLowerCase()} AFTER ${operation} ON thread_messages
      BEGIN UPDATE project_threads SET message_revision = message_revision + 1 WHERE id = ${row}.thread_id; END`);
  }
  db.run("DROP TRIGGER IF EXISTS thread_messages_revision_update");
  db.run(`CREATE TRIGGER IF NOT EXISTS thread_messages_revision_update AFTER UPDATE ON thread_messages
    BEGIN UPDATE project_threads SET message_revision = message_revision + 1 WHERE id IN (OLD.thread_id, NEW.thread_id); END`);
}
