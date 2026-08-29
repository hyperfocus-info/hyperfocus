import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { CHAT_MESSAGE_CONTENT_MAX_CHARS, chatMessageSchema } from "@hyperfocus/ai-core/protocol";
import { appendPersistableMessageDelta, assertPersistableMessageContent, ensureMessageContentLimitTriggers } from "./message-content-policy";

test("schema, runtime guard, and database triggers share the message ceiling", () => {
  const oversized = "x".repeat(CHAT_MESSAGE_CONTENT_MAX_CHARS + 1);
  expect(chatMessageSchema.safeParse({ id: "m", role: "assistant", content: oversized, createdAt: "now" }).success).toBe(false);
  expect(() => assertPersistableMessageContent(oversized)).toThrow("persisted content limit");
  const db = new Database(":memory:");
  db.run(`CREATE TABLE thread_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)`);
  db.run(`CREATE TABLE assistant_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)`);
  ensureMessageContentLimitTriggers(db);
  expect(() => db.run(`INSERT INTO thread_messages VALUES ('m', ?1)`, [oversized])).toThrow("message content exceeds limit");
  db.run(`INSERT INTO assistant_messages VALUES ('m', 'ok')`);
  expect(() => db.run(`UPDATE assistant_messages SET content = ?1`, [oversized])).toThrow("message content exceeds limit");
});

test("bounded message accumulation rejects rather than truncating overflow", () => {
  const prefix = "x".repeat(CHAT_MESSAGE_CONTENT_MAX_CHARS - 1);
  expect(appendPersistableMessageDelta(prefix, "y")).toHaveLength(CHAT_MESSAGE_CONTENT_MAX_CHARS);
  expect(() => appendPersistableMessageDelta(prefix, "yz")).toThrow("persisted content limit");
});
