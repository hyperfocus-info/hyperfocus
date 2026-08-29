import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantLogEntryId,
  createAssistantQuestionId,
  createAssistantTodoId,
  createBackgroundJobId,
  createThreadId,
  type Assistant,
  type BackgroundJob
} from "@hyperfocus/ai-core/protocol";
import { isAssistantPageCursorError, assistantTimestampPageabilitySql, listAssistantWorkloadPage } from "./assistant-pagination";
import { createWorkspaceRepository, type WorkspaceRepository } from "./workspace-repository";
import { resolveHarnessTestTempRoot } from "./test-support/test-temp-root";

function createRepository() {
  const root = resolveHarnessTestTempRoot();
  mkdirSync(root, { recursive: true });
  return createWorkspaceRepository(path.join(root, `assistant-pagination-${crypto.randomUUID()}.sqlite`),
    process.cwd(), { durability: "test-fast" });
}

const openedDatabases = new Set<Database>();
afterEach(() => {
  for (const database of openedDatabases) database.close(false);
  openedDatabases.clear();
});
function databaseFor(repository: WorkspaceRepository) {
  const database = new Database(repository.getDatabasePath(), { strict: true });
  openedDatabases.add(database);
  return database;
}
function required<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

function addLearningAssistant(repository: WorkspaceRepository, overrides: Partial<Assistant> = {}) {
  const now = new Date().toISOString();
  return repository.saveAssistant({
    id: createAssistantId(),
    name: "Learning helper",
    scope: "global",
    personalityPrompt: "Remember useful facts.",
    jobPrompt: "Track durable learnings.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  });
}

test("assistant workload pages scan past rows that cannot be hydrated", () => {
  const db = createWorkloadDatabase();
  insertWorkloadRows(db, "assistant-1", [
    ["valid-new", "2026-05-25T12:05:00.000Z", 1],
    ["invalid-3", "2026-05-25T12:04:00.000Z", 0],
    ["invalid-2", "2026-05-25T12:03:00.000Z", 0],
    ["invalid-1", "2026-05-25T12:02:00.000Z", 0],
    ["valid-old", "2026-05-25T12:01:00.000Z", 1]
  ]);

  const page = listTestWorkloadPage(db, { assistantId: "assistant-1", limit: 2 }, "jobs");

  expect(page.items.map((item) => item.id)).toEqual(["valid-new", "valid-old"]);
  expect(page.nextCursor).toBeUndefined();
  expect(page).not.toHaveProperty("totalApprox");
  db.close();
});

test("assistant job and run cursors survive unseen-row updated-at mutations", () => {
  for (const collection of ["jobs", "runs"] as const) {
    const db = createWorkloadDatabase();
    insertWorkloadRows(db, "assistant-1", [
      ["new", "2026-05-25T12:03:00.000Z", 1],
      ["middle", "2026-05-25T12:02:00.000Z", 1],
      ["old", "2026-05-25T12:01:00.000Z", 1]
    ]);
    const first = listTestWorkloadPage(db, { assistantId: "assistant-1", limit: 2 }, collection);
    db.query("UPDATE background_jobs SET updated_at = ?1 WHERE id = ?2").run("2099-01-01T00:00:00.000Z", "old");
    const second = listTestWorkloadPage(db, { assistantId: "assistant-1", cursor: first.nextCursor, limit: 2 }, collection);

    expect(first.items.map((item) => item.id)).toEqual(["new", "middle"]);
    expect(second.items.map((item) => item.id)).toEqual(["old"]);
    db.close();
  }
});

test("assistant workload cursors reject malformed and mismatched resource scopes", () => {
  const db = createWorkloadDatabase();
  insertWorkloadRows(db, "assistant-1", [
    ["job-2", "2026-05-25T12:02:00.000Z", 1],
    ["job-1", "2026-05-25T12:01:00.000Z", 1]
  ]);
  const first = listTestWorkloadPage(db, { assistantId: "assistant-1", limit: 1 }, "jobs");
  expect(first.nextCursor).toBeString();
  expect(listTestWorkloadPage(db, { assistantId: "assistant-1", cursor: first.nextCursor, limit: 1 }, "jobs").items)
    .toEqual([{ id: "job-1", updatedAt: "2026-05-25T12:01:00.000Z" }]);

  expect(() => listTestWorkloadPage(db, { assistantId: "assistant-1", cursor: "not-json", limit: 1 }, "jobs"))
    .toThrow("Invalid page cursor");
  try {
    listTestWorkloadPage(db, { assistantId: "assistant-1", cursor: "z".repeat(4097), limit: 1 }, "jobs");
    throw new Error("Expected oversized cursor rejection");
  } catch (error) {
    expect(isAssistantPageCursorError(error)).toBe(true);
    if (!isAssistantPageCursorError(error)) throw new Error("Expected invalid cursor error");
    expect(error.code).toBe("invalid-cursor");
  }
  expect(() => listTestWorkloadPage(db, {
    assistantId: "assistant-1",
    cursor: JSON.stringify({
      version: 1,
      scope: "assistant-page",
      ownerId: "assistant-1",
      collection: "jobs",
      position: { timestamp: "z".repeat(257), id: "job-1" }
    }),
    limit: 1
  }, "jobs")).toThrow("Invalid page cursor position");
  expect(() => listTestWorkloadPage(db, {
    assistantId: "assistant-1",
    cursor: JSON.stringify({ version: 1, scope: "assistant-workload", ownerId: "assistant-1", collection: "jobs" }),
    limit: 1
  }, "jobs")).toThrow("Page cursor does not match the requested resource");
  expect(() => listTestWorkloadPage(db, { assistantId: "assistant-2", cursor: first.nextCursor, limit: 1 }, "jobs"))
    .toThrow("Page cursor does not match the requested resource");
  expect(() => listTestWorkloadPage(db, { assistantId: "assistant-1", cursor: first.nextCursor, limit: 1 }, "runs"))
    .toThrow("Page cursor does not match the requested resource");
  db.close();
});

test("assistant workload pages exclude an empty raw boundary id", () => {
  const db = createWorkloadDatabase();
  const rows = Array.from({ length: 10 }, (_, index): [string, string, number] => [
    index === 9 ? "" : `invalid-${index}`,
    new Date(Date.UTC(2026, 4, 25, 12, 20 - index)).toISOString(),
    0
  ]);
  insertWorkloadRows(db, "assistant-1", [
    ...rows,
    ["valid-old", "2026-05-25T12:00:00.000Z", 1]
  ]);

  const first = listTestWorkloadPage(db, { assistantId: "assistant-1", limit: 1 }, "jobs");
  expect(first.items).toEqual([{ id: "valid-old", updatedAt: "2026-05-25T12:00:00.000Z" }]);
  expect(first.nextCursor).toBeUndefined();
  db.close();
});

test("assistant workload cursors fit maximum persisted identity and timestamp components", () => {
  const db = createWorkloadDatabase();
  const assistantId = "\u0001".repeat(128);
  insertWorkloadRows(db, assistantId, [
    ["\u0002".repeat(128), "\u0003".repeat(256), 1],
    ["valid-old", "", 1]
  ]);

  const first = listTestWorkloadPage(db, { assistantId, limit: 1 }, "jobs");
  expect(first.nextCursor).toBeString();
  expect(listTestWorkloadPage(db, { assistantId, cursor: first.nextCursor, limit: 1 }, "jobs").items)
    .toEqual([{ id: "valid-old", updatedAt: "" }]);
  db.close();
});

test("assistant workload pages skip unpageable corrupt raw positions", () => {
  const db = createWorkloadDatabase();
  insertWorkloadRows(db, "assistant-1", [
    ["valid-new", "z".repeat(5000), 1],
    ["valid-old", "2026-05-25T12:00:00.000Z", 1]
  ]);

  expect(listTestWorkloadPage(db, { assistantId: "assistant-1", limit: 1 }, "jobs").items)
    .toEqual([{ id: "valid-old", updatedAt: "2026-05-25T12:00:00.000Z" }]);
  db.close();
});

test("assistant workload paging indexes are migration-owned", () => {
  const repository = createRepository();
  const db = databaseFor(repository);
  const plan = db.query<{ detail: string }, [string, number]>(`EXPLAIN QUERY PLAN
    SELECT id FROM background_jobs
    WHERE assistant_id = ?1 AND typeof(created_at) = 'text' AND length(created_at) <= 256
      AND typeof(id) = 'text' AND length(id) BETWEEN 1 AND 128
    ORDER BY created_at DESC, id DESC LIMIT ?2`).all("assistant-1", 2);

  expect(plan.some((row) => row.detail.includes("background_jobs_assistant_pageable_created_idx"))).toBe(true);
  const lookupPlan = db.query<{ detail: string }, [string]>(
    "EXPLAIN QUERY PLAN SELECT id FROM background_jobs WHERE assistant_id = ?1 LIMIT 1"
  ).all("assistant-1");
  expect(lookupPlan.some((row) => row.detail.includes("background_jobs_assistant_idx"))).toBe(true);
});

test("pages assistant summaries and selected assistant detail with stable cursors", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const now = Date.now();
  for (let index = 0; index < 5; index += 1) {
    const createdAt = new Date(now + index * 1000).toISOString();
    repository.appendAssistantMessage(assistant.id, "user", `Message ${index}`, { createdAt });
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: `Todo ${index}`,
      state: "pending",
      sortOrder: index,
      source: "assistant",
      workKind: "unspecified",
      createdAt,
      updatedAt: createdAt
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: `Learning ${index}`,
      source: "test",
      confidence: "medium",
      createdAt
    });
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: `Question ${index}?`,
      status: "pending",
      linkedTodoIds: [],
      askedAt: createdAt
    });
    repository.appendAssistantLogEntry({
      id: createAssistantLogEntryId(),
      assistantId: assistant.id,
      level: "info",
      summary: `Log ${index}`,
      createdAt
    });
  }

  const summary = repository.listAssistantSummaries({ limit: 1 });
  expect(summary.items).toHaveLength(1);
  expect(summary.totalApprox).toBe(1);
  expect(summary.items[0]?.unreadQuestionCount).toBe(5);
  expect(repository.loadAssistantSummaryState().todos).toHaveLength(0);

  const firstTodos = repository.listAssistantTodos({ assistantId: assistant.id, limit: 2 });
  const secondTodos = repository.listAssistantTodos({ assistantId: assistant.id, cursor: firstTodos.nextCursor, limit: 2 });
  expect(firstTodos.items.map((todo) => todo.title)).toEqual(["Todo 0", "Todo 1"]);
  expect(secondTodos.items.map((todo) => todo.title)).toEqual(["Todo 2", "Todo 3"]);

  const firstLogs = repository.listAssistantLogs({ assistantId: assistant.id, limit: 2 });
  const secondLogs = repository.listAssistantLogs({ assistantId: assistant.id, cursor: firstLogs.nextCursor, limit: 2 });
  expect(firstLogs.items.map((entry) => entry.summary)).toEqual(["Log 4", "Log 3"]);
  expect(secondLogs.items.map((entry) => entry.summary)).toEqual(["Log 2", "Log 1"]);

  const firstLearnings = repository.listAssistantLearnings({ assistantId: assistant.id, limit: 2 });
  const secondLearnings = repository.listAssistantLearnings({
    assistantId: assistant.id,
    cursor: firstLearnings.nextCursor,
    limit: 2
  });
  expect(firstLearnings.items.map((learning) => learning.summary)).toEqual(["Learning 4", "Learning 3"]);
  expect(secondLearnings.items.map((learning) => learning.summary)).toEqual(["Learning 2", "Learning 1"]);

  const firstQuestions = repository.listAssistantQuestions({ assistantId: assistant.id, limit: 2 });
  const secondQuestions = repository.listAssistantQuestions({
    assistantId: assistant.id,
    cursor: firstQuestions.nextCursor,
    limit: 2
  });
  expect(firstQuestions.items.map((question) => question.prompt)).toEqual(["Question 4?", "Question 3?"]);
  expect(secondQuestions.items.map((question) => question.prompt)).toEqual(["Question 2?", "Question 1?"]);

  const firstMessages = repository.listAssistantThreadMessages({ assistantId: assistant.id, limit: 2 });
  const secondMessages = repository.listAssistantThreadMessages({
    assistantId: assistant.id,
    cursor: firstMessages.nextCursor,
    limit: 2
  });
  expect(firstMessages.items.map((message) => message.content)).toEqual(["Message 3", "Message 4"]);
  expect(secondMessages.items.map((message) => message.content)).toEqual(["Message 1", "Message 2"]);

  const detail = repository.getAssistantDetail({ assistantId: assistant.id });
  expect(detail.thread?.messages.at(-1)?.content).toBe("Message 4");
  expect(detail.todos.items).toHaveLength(5);
  expect(detail.learnings.items).toHaveLength(5);
  expect(detail.questions.items).toHaveLength(5);
  expect(detail.logs.items).toHaveLength(5);

  const additionalAssistants = [addLearningAssistant(repository), addLearningAssistant(repository)];
  const firstSummaries = repository.listAssistantSummaries({ limit: 2 });
  const secondSummaries = repository.listAssistantSummaries({ cursor: firstSummaries.nextCursor, limit: 2 });
  const summaryIds = [...firstSummaries.items, ...secondSummaries.items].map((entry) => entry.id);
  expect(firstSummaries.nextCursor).toBeString();
  expect(new Set(summaryIds)).toEqual(new Set([assistant.id, ...additionalAssistants.map((entry) => entry.id)]));
});

test("assistant summary cursors survive unseen-row activity updates", () => {
  const repository = createRepository();
  const assistants = [addLearningAssistant(repository), addLearningAssistant(repository), addLearningAssistant(repository)];
  const db = databaseFor(repository);
  assistants.forEach((assistant, index) => db.query("UPDATE assistants SET created_at = ?1, updated_at = ?1 WHERE id = ?2")
    .run(new Date(Date.UTC(2026, 4, 25, 12, index)).toISOString(), assistant.id));

  const first = repository.listAssistantSummaries({ limit: 2 });
  const unseen = required(assistants.find((assistant) => !first.items.some((item) => item.id === assistant.id)), "unseen assistant");
  repository.saveAssistant({ ...unseen, name: "Updated while paging", updatedAt: "2099-01-01T00:00:00.000Z" });
  const second = repository.listAssistantSummaries({ cursor: first.nextCursor, limit: 2 });

  expect(second.items.map((assistant) => assistant.id)).toEqual([unseen.id]);
});

test("assistant todo cursors reject inter-page reordering", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const now = new Date().toISOString();
  const ids = Array.from({ length: 3 }, () => createAssistantTodoId());
  ids.forEach((id, sortOrder) => repository.saveAssistantTodo({ id, assistantId: assistant.id, title: `Todo ${sortOrder}`,
    state: "pending", sortOrder, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now }));
  const first = repository.listAssistantTodos({ assistantId: assistant.id, limit: 2 });

  repository.reorderAssistantTodos(assistant.id, [required(ids[2], "todo 2"), required(ids[0], "todo 0"), required(ids[1], "todo 1")]);

  expect(() => repository.listAssistantTodos({ assistantId: assistant.id, cursor: first.nextCursor, limit: 2 }))
    .toThrow("Assistant todos changed; restart pagination");
});

test("assistant todo pruning invalidates cursors and rolls back all owners when a revision bump fails", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const other = addLearningAssistant(repository);
  const completedAt = "2026-01-01T00:00:00.000Z";
  for (const [index, assistantId] of [assistant.id, assistant.id, assistant.id, other.id].entries()) {
    repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId, title: `Completed ${index}`,
      state: "completed", sortOrder: index, source: "assistant", workKind: "unspecified",
      createdAt: completedAt, updatedAt: completedAt, completedAt });
  }
  let db = databaseFor(repository);
  const readRevision = (assistantId: string) => db.query<{ todo_revision: number; latest_activity_at: string }, [string]>(
    `SELECT todo_revision, latest_activity_at FROM assistants WHERE id = ?1`).get(assistantId);
  const requireRevision = (assistantId: string) => required(readRevision(assistantId), "assistant revision");
  const revisionsBeforePrune = [requireRevision(assistant.id), requireRevision(other.id)];
  const prunePlan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN SELECT DISTINCT assistant_id
    FROM assistant_todos WHERE state = 'completed' AND completed_at IS NOT NULL AND completed_at < ?1`)
    .all("2026-01-18T00:00:00.000Z");
  expect(prunePlan.some((row) => row.detail.includes("assistant_todos_completed_retention_idx"))).toBe(true);
  const first = repository.listAssistantTodos({ assistantId: assistant.id, limit: 2 });
  repository.pruneCompletedAssistantTodos(new Date("2026-02-01T00:00:00.000Z"));
  const revisionsAfterPrune = [requireRevision(assistant.id), requireRevision(other.id)];
  expect(revisionsAfterPrune.map((row, index) => row.todo_revision - required(revisionsBeforePrune[index], "prior revision").todo_revision)).toEqual([1, 1]);
  expect(revisionsAfterPrune.map((row) => row.latest_activity_at)).toEqual(["2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
  expect(() => repository.listAssistantTodos({ assistantId: assistant.id, cursor: first.nextCursor, limit: 2 }))
    .toThrow("Assistant todos changed; restart pagination");

  openedDatabases.delete(db);
  db.close(false);
  for (const assistantId of [assistant.id, other.id]) repository.saveAssistantTodo({ id: createAssistantTodoId(),
    assistantId, title: "Rollback prune", state: "completed", sortOrder: 0, source: "assistant",
    workKind: "unspecified", createdAt: completedAt, updatedAt: completedAt, completedAt });
  db = databaseFor(repository);
  const revisionsBeforeFailure = [requireRevision(assistant.id), requireRevision(other.id)];
  db.exec(`CREATE TRIGGER reject_other_todo_revision BEFORE UPDATE OF todo_revision ON assistants
    WHEN NEW.id = '${other.id}' BEGIN SELECT RAISE(ABORT, 'revision write failed'); END;`);
  expect(() => repository.pruneCompletedAssistantTodos(new Date("2026-02-01T00:00:00.000Z")))
    .toThrow("revision write failed");
  expect(repository.getAssistantTodos(assistant.id)).toHaveLength(1);
  expect(repository.getAssistantTodos(other.id)).toHaveLength(1);
  expect([requireRevision(assistant.id), requireRevision(other.id)]).toEqual(revisionsBeforeFailure);
});

test("assistant todo ownership and revision failures roll back the owning mutation", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const other = addLearningAssistant(repository);
  const now = new Date().toISOString();
  const ids = Array.from({ length: 3 }, () => createAssistantTodoId());
  ids.forEach((id, sortOrder) => repository.saveAssistantTodo({ id, assistantId: assistant.id, title: `Owned ${sortOrder}`,
    state: "pending", sortOrder, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now }));
  expect(() => repository.updateAssistantTodo(other.id, required(ids[0], "todo 0"), { title: "Cross-owner write" }))
    .toThrow("Unknown assistant todo for assistant");
  expect(() => repository.saveAssistantTodo({ id: required(ids[0], "todo 0"), assistantId: other.id, title: "Cross-owner upsert",
    state: "pending", sortOrder: 0, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now }))
    .toThrow("Unknown assistant todo for assistant");
  expect(repository.getAssistantTodos(assistant.id).find((todo) => todo.id === ids[0])?.title).toBe("Owned 0");

  const db = databaseFor(repository);
  const readTodoRevision = () => required(db.query<{ todo_revision: number }, [string]>(
    `SELECT todo_revision FROM assistants WHERE id = ?1`).get(assistant.id), "todo revision").todo_revision;
  const revisionBeforeDuplicate = readTodoRevision();
  expect(() => repository.reorderAssistantTodos(assistant.id, [required(ids[0], "todo 0"), required(ids[0], "todo 0"), required(ids[2], "todo 2")]))
    .toThrow("Assistant todo reorder contains duplicate todo IDs");
  expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.id)).toEqual(ids);
  expect(readTodoRevision()).toBe(revisionBeforeDuplicate);

  repository.reorderAssistantTodos(assistant.id, [required(ids[2], "todo 2")]);
  expect(repository.getAssistantTodos(assistant.id).map((todo) => [todo.id, todo.sortOrder])).toEqual([
    [ids[2], 0], [ids[0], 1], [ids[1], 2]
  ]);

  db.exec(`CREATE TRIGGER reject_todo_revision BEFORE UPDATE OF todo_revision ON assistants
    BEGIN SELECT RAISE(ABORT, 'revision write failed'); END;`);
  expect(() => repository.reorderAssistantTodos(assistant.id, [required(ids[2], "todo 2"), required(ids[1], "todo 1"), required(ids[0], "todo 0")]))
    .toThrow("revision write failed");
  expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.id)).toEqual([ids[2], ids[0], ids[1]]);
});

test("assistant learning reorder normalizes omitted rows and rolls back assistant touch failures", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const now = new Date().toISOString();
  const ids = Array.from({ length: 3 }, () => createAssistantLearningId());
  ids.forEach((id, sortOrder) => repository.saveAssistantLearning({ id, assistantId: assistant.id,
    summary: `Ordered learning ${sortOrder}`, source: "test", confidence: "medium", sortOrder, createdAt: now }));

  repository.reorderAssistantLearnings(assistant.id, [required(ids[2], "learning 2")]);
  expect(repository.getAssistantLearnings(assistant.id).map((learning) => [learning.id, learning.sortOrder])).toEqual([
    [ids[2], 0], [ids[0], 1], [ids[1], 2]
  ]);
  expect(() => repository.reorderAssistantLearnings(assistant.id, [required(ids[0], "learning 0"), required(ids[0], "learning 0")]))
    .toThrow("Assistant learning reorder contains duplicate learning IDs");

  const db = databaseFor(repository);
  db.exec(`CREATE TRIGGER reject_learning_reorder_touch BEFORE UPDATE OF updated_at ON assistants
    BEGIN SELECT RAISE(ABORT, 'assistant touch failed'); END;`);
  expect(() => repository.reorderAssistantLearnings(assistant.id, [required(ids[1], "learning 1"), required(ids[2], "learning 2"), required(ids[0], "learning 0")]))
    .toThrow("assistant touch failed");
  expect(repository.getAssistantLearnings(assistant.id).map((learning) => learning.id)).toEqual([ids[2], ids[0], ids[1]]);
});

test("raw assistant row ownership blocks cross-owner repair of corrupt owned rows", () => {
  const repository = createRepository();
  const owner = addLearningAssistant(repository);
  const other = addLearningAssistant(repository);
  const now = new Date().toISOString();
  const todoId = createAssistantTodoId();
  const learningId = createAssistantLearningId();
  const questionId = createAssistantQuestionId();
  repository.saveAssistantTodo({ id: todoId, assistantId: owner.id, title: "Owned todo", state: "pending",
    sortOrder: 0, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now });
  repository.saveAssistantLearning({ id: learningId, assistantId: owner.id, summary: "Owned learning", source: "test",
    confidence: "medium", createdAt: now });
  repository.saveAssistantQuestion({ id: questionId, assistantId: owner.id, prompt: "Owned question?",
    status: "pending", askedAt: now });
  const db = databaseFor(repository);
  db.exec("PRAGMA ignore_check_constraints = ON");
  db.query(`UPDATE assistant_todos SET state = 'corrupt' WHERE id = ?1`).run(todoId);
  db.query(`UPDATE assistant_learnings SET confidence = 'corrupt' WHERE id = ?1`).run(learningId);
  db.query(`UPDATE assistant_questions SET status = 'corrupt' WHERE id = ?1`).run(questionId);
  db.exec("PRAGMA ignore_check_constraints = OFF");

  expect(() => repository.updateAssistantTodo(other.id, todoId, { title: "Stolen todo" }))
    .toThrow("Unknown assistant todo for assistant");
  expect(() => repository.saveAssistantTodo({ id: todoId, assistantId: other.id, title: "Stolen todo", state: "pending",
    sortOrder: 0, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now }))
    .toThrow("Unknown assistant todo for assistant");
  expect(() => repository.saveAssistantLearning({ id: learningId, assistantId: other.id, summary: "Stolen learning",
    source: "test", confidence: "high", createdAt: now })).toThrow("Unknown assistant learning for assistant");
  expect(() => repository.saveAssistantQuestion({ id: questionId, assistantId: other.id, prompt: "Stolen question?",
    status: "pending", askedAt: now })).toThrow("Unknown assistant question for assistant");
  expect(db.query<{ assistant_id: string; title: string }, [string]>(
    `SELECT assistant_id, title FROM assistant_todos WHERE id = ?1`).get(todoId)).toEqual({ assistant_id: owner.id, title: "Owned todo" });
  expect(db.query<{ assistant_id: string; summary: string }, [string]>(
    `SELECT assistant_id, summary FROM assistant_learnings WHERE id = ?1`).get(learningId)).toEqual({ assistant_id: owner.id, summary: "Owned learning" });
  expect(db.query<{ assistant_id: string; prompt: string }, [string]>(
    `SELECT assistant_id, prompt FROM assistant_questions WHERE id = ?1`).get(questionId)).toEqual({ assistant_id: owner.id, prompt: "Owned question?" });
});

test("assistant learning paging uses the visible partial index across a compacted prefix", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const db = databaseFor(repository);
  const insert = db.query(`INSERT INTO assistant_learnings
    (id, assistant_id, summary, source, confidence, created_at, kind, compacted_at)
    VALUES (?1, ?2, ?3, 'test', 'medium', ?4, 'fact', ?5)`);
  db.transaction(() => {
    for (let index = 0; index < 2000; index += 1) insert.run(`hidden-${index}`, assistant.id, `Hidden ${index}`, `2099-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`, "2099-01-02T00:00:00.000Z");
  })();
  repository.saveAssistantLearning({ id: createAssistantLearningId(), assistantId: assistant.id, summary: "Visible",
    source: "test", confidence: "medium", createdAt: "2026-01-01T00:00:00.000Z" });
  const corruptId = createAssistantLearningId();
  repository.saveAssistantLearning({ id: corruptId, assistantId: assistant.id, summary: "Unpageable",
    source: "test", confidence: "medium", createdAt: "2026-01-02T00:00:00.000Z" });
  db.query(`UPDATE assistant_learnings SET created_at = ?1 WHERE id = ?2`).run("x".repeat(257), corruptId);
  const plan = db.query<{ detail: string }, [string, number]>(`EXPLAIN QUERY PLAN
    SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
    FROM assistant_learnings WHERE assistant_id = ?1
      AND typeof(created_at) = 'text' AND length(created_at) <= 256 AND typeof(id) = 'text' AND length(id) BETWEEN 1 AND 128
      AND (compacted_at IS NULL OR kind = 'summary') ORDER BY created_at DESC, id DESC LIMIT ?2`).all(assistant.id, 2);
  const countPlan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN SELECT COUNT(*)
    FROM assistant_learnings WHERE assistant_id = ?1
      AND typeof(created_at) = 'text' AND length(created_at) <= 256 AND typeof(id) = 'text' AND length(id) BETWEEN 1 AND 128
      AND (compacted_at IS NULL OR kind = 'summary')`).all(assistant.id);
  const page = repository.listAssistantLearnings({ assistantId: assistant.id, limit: 1 });

  expect(plan.some((row) => row.detail.includes("assistant_learnings_owner_visible_pageable_created_idx"))).toBe(true);
  expect(countPlan.some((row) => row.detail.includes("assistant_learnings_owner_visible_pageable_created_idx"))).toBe(true);
  expect(page.items.map((item) => item.summary)).toEqual(["Visible"]);
  expect(page.totalApprox).toBe(1);
});

test("background runs recover multiple corrupt event fields", () => {
  const repository = createRepository();
  const project = repository.addProject(process.cwd());
  const assistant = repository.saveAssistant({ ...addLearningAssistant(repository), id: createAssistantId(), scope: "project", projectId: project.id });
  const now = new Date().toISOString();
  const job: BackgroundJob = { id: createBackgroundJobId(), projectId: project.id, assistantId: assistant.id, automationThreadId: createThreadId(),
    kind: "ai-routine", name: "Recovery job", status: "paused", riskLevel: "safe", definition: { kind: "ai-routine", prompt: "Work." },
    schedule: { type: "one-off", runAt: now, sourceText: now }, scheduleInput: now, createdAt: now, updatedAt: now };
  repository.saveBackgroundJob(job);
  const run = repository.createBackgroundJobRun({ jobId: job.id, projectId: project.id, assistantId: assistant.id,
    automationThreadId: job.automationThreadId, triggerSource: "manual", status: "succeeded", riskLevel: "safe", approvalStatus: "not-needed" });
  for (let index = 0; index < 7; index += 1) repository.appendBackgroundJobRunEvent(run.id, "done", `Event ${index}`);
  const db = databaseFor(repository);
  const eventIds = db.query<{ id: string }, [string]>("SELECT id FROM background_job_run_events WHERE run_id = ?1").all(run.id);
  eventIds.forEach((event, index) => db.query("UPDATE background_job_run_events SET id = ?1 WHERE id = ?2").run(`${index}${"x".repeat(128)}`, event.id));

  expect(repository.getBackgroundJobRun(run.id)?.events).toHaveLength(7);
});

test("binds assistant page cursors to their owner and collection", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const otherAssistant = addLearningAssistant(repository);
  for (let index = 0; index < 2; index += 1) {
    const createdAt = new Date(Date.UTC(2026, 4, 25, 12, index)).toISOString();
    repository.appendAssistantLogEntry({
      id: createAssistantLogEntryId(),
      assistantId: assistant.id,
      level: "info",
      summary: `Cursor log ${index}`,
      createdAt
    });
    repository.saveAssistantTodo({
      id: createAssistantTodoId(),
      assistantId: assistant.id,
      title: `Cursor todo ${index}`,
      state: "pending",
      sortOrder: index,
      source: "assistant",
      workKind: "unspecified",
      createdAt,
      updatedAt: createdAt
    });
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: `Cursor question ${index}?`,
      status: "pending",
      linkedTodoIds: [],
      askedAt: createdAt
    });
    repository.appendAssistantMessage(assistant.id, "user", `Cursor message ${index}`, { createdAt });
  }

  const firstLogs = repository.listAssistantLogs({ assistantId: assistant.id, limit: 1 });
  const firstTodos = repository.listAssistantTodos({ assistantId: assistant.id, limit: 1 });
  const firstQuestions = repository.listAssistantQuestions({ assistantId: assistant.id, limit: 1 });
  const firstMessages = repository.listAssistantThreadMessages({ assistantId: assistant.id, limit: 1 });
  expect(firstLogs.nextCursor).toBeString();
  expect(firstTodos.nextCursor).toBeString();
  expect(firstQuestions.nextCursor).toBeString();
  expect(firstMessages.nextCursor).toBeString();
  expect(() => repository.listAssistantLogs({ assistantId: assistant.id, cursor: "not-json", limit: 1 }))
    .toThrow("Invalid page cursor");
  expect(() => repository.listAssistantLogs({
    assistantId: otherAssistant.id,
    cursor: firstLogs.nextCursor,
    limit: 1
  })).toThrow("Page cursor does not match the requested resource");
  expect(() => repository.listAssistantLearnings({
    assistantId: assistant.id,
    cursor: firstLogs.nextCursor,
    limit: 1
  })).toThrow("Page cursor does not match the requested resource");
  expect(() => repository.listAssistantTodos({
    assistantId: assistant.id,
    cursor: firstLogs.nextCursor,
    limit: 1
  })).toThrow("Page cursor does not match the requested resource");
  expect(() => repository.listAssistantQuestions({
    assistantId: assistant.id,
    cursor: firstLogs.nextCursor,
    limit: 1
  })).toThrow("Page cursor does not match the requested resource");
  expect(() => repository.listAssistantThreadMessages({
    assistantId: assistant.id,
    cursor: firstLogs.nextCursor,
    limit: 1
  })).toThrow("Page cursor does not match the requested resource");
  expect(() => repository.listAssistantSummaries({ cursor: firstLogs.nextCursor, limit: 1 }))
    .toThrow("Page cursor does not match the requested resource");
});

test("assistant summary and detail pages scan past invalid persisted rows", () => {
  const repository = createRepository();
  const oldestAssistant = addLearningAssistant(repository, { createdAt: "2026-05-25T12:01:00.000Z" });
  const invalidAssistant = addLearningAssistant(repository, { createdAt: "2026-05-25T12:02:00.000Z" });
  const newestAssistant = addLearningAssistant(repository, { createdAt: "2026-05-25T12:03:00.000Z" });
  const db = databaseFor(repository);
  const updateAssistant = db.query("UPDATE assistants SET updated_at = ?1, scope = ?2 WHERE id = ?3");
  updateAssistant.run("2026-05-25T13:03:00.000Z", "global", oldestAssistant.id);
  db.exec("PRAGMA ignore_check_constraints = ON");
  updateAssistant.run("2026-05-25T13:02:00.000Z", "invalid", invalidAssistant.id);
  db.exec("PRAGMA ignore_check_constraints = OFF");
  updateAssistant.run("2026-05-25T13:01:00.000Z", "global", newestAssistant.id);

  const summaryPage = repository.listAssistantSummaries({ limit: 2 });
  expect(summaryPage.items.map((assistant) => assistant.id)).toEqual([newestAssistant.id, oldestAssistant.id]);

  const logIds = [createAssistantLogEntryId(), createAssistantLogEntryId(), createAssistantLogEntryId()];
  for (const [index, id] of logIds.entries()) {
    repository.appendAssistantLogEntry({
      id,
      assistantId: newestAssistant.id,
      level: "info",
      summary: `Persisted log ${index}`,
      createdAt: new Date(Date.UTC(2026, 4, 25, 13, index + 1)).toISOString()
    });
  }
  db.exec("PRAGMA ignore_check_constraints = ON");
  db.query("UPDATE assistant_log_entries SET level = 'invalid' WHERE id = ?1").run(logIds[1]);
  db.exec("PRAGMA ignore_check_constraints = OFF");

  const logPage = repository.listAssistantLogs({ assistantId: newestAssistant.id, limit: 2 });
  expect(logPage.items.map((entry) => entry.id)).toEqual([logIds[2], logIds[0]]);
});

test("assistant message totals and count plans exclude an unpageable corrupt prefix", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const visible = required(repository.appendAssistantMessage(assistant.id, "user", "Visible message").messages.at(-1), "visible message");
  const thread = repository.getAssistantThread(assistant.id);
  const db = databaseFor(repository);
  const insert = db.query(`INSERT INTO assistant_messages
    (id, assistant_thread_id, role, kind, content, metadata_json, created_at)
    VALUES (?1, ?2, 'user', 'plain', 'corrupt', NULL, ?3)`);
  db.transaction(() => {
    for (let index = 0; index < 2_000; index += 1) {
      insert.run(`corrupt-message-${index}`, thread.id, `${"z".repeat(300)}-${index}`);
    }
  }).immediate();

  const page = repository.listAssistantThreadMessages({ assistantId: assistant.id, limit: 10 });
  expect(page.items.map((message) => message.id)).toEqual([visible.id]);
  expect(page.totalApprox).toBe(1);
  const detail = repository.getAssistantDetail({ assistantId: assistant.id });
  if (!detail.thread) throw new Error("Expected assistant detail thread");
  expect(detail.thread.messages.map((message) => message.id)).toEqual([visible.id]);
  expect(detail.thread.messageCount).toBe(1);
  const countPlan = db.query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM assistant_messages
    WHERE assistant_thread_id = ?1 AND ${assistantTimestampPageabilitySql()}`).all(thread.id);
  expect(countPlan.some((row) => row.detail.includes("assistant_messages_thread_pageable_created_idx"))).toBe(true);
});

test("assistant detail exposes continuation from the same bounded newest message page", () => {
  const repository = createRepository(); const assistant = addLearningAssistant(repository);
  for (let index = 0; index < 258; index += 1) repository.appendAssistantMessage(assistant.id, "user", `Message ${index}`,
    { createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });
  const detail = repository.getAssistantDetail({ assistantId: assistant.id });
  if (!detail.thread || !detail.threadMessagesNextCursor) throw new Error("Expected bounded assistant detail page");
  expect(detail.thread.messages).toHaveLength(256); expect(detail.thread.messageCount).toBe(258);
  const older = repository.listAssistantThreadMessages({ assistantId: assistant.id,
    cursor: detail.threadMessagesNextCursor, limit: 256 });
  expect(older.items.map((message) => message.content)).toEqual(["Message 0", "Message 1"]);
});

test("assistant keysets exclude unencodable raw positions across every collection", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const visibleAssistant = addLearningAssistant(repository);
  const db = databaseFor(repository);
  const old = "2026-05-25T12:00:00.000Z";
  const oversized = "z".repeat(5000);
  const messageId = crypto.randomUUID();
  const corruptMessageId = crypto.randomUUID();
  repository.appendAssistantMessage(assistant.id, "user", "Visible message", { id: messageId, createdAt: old });
  repository.appendAssistantMessage(assistant.id, "user", "Corrupt message", { id: corruptMessageId, createdAt: old });
  const todoId = createAssistantTodoId();
  const corruptTodoId = createAssistantTodoId();
  for (const [id, title] of [[todoId, "Visible todo"], [corruptTodoId, "Corrupt todo"]]) repository.saveAssistantTodo({
    id, assistantId: assistant.id, title, state: "pending", sortOrder: 0, source: "assistant",
    workKind: "unspecified", createdAt: old, updatedAt: old
  });
  const learningId = createAssistantLearningId();
  const corruptLearningId = createAssistantLearningId();
  for (const [id, summary] of [[learningId, "Visible learning"], [corruptLearningId, "Corrupt learning"]]) repository.saveAssistantLearning({
    id, assistantId: assistant.id, summary, source: "test", confidence: "medium", createdAt: old
  });
  const questionId = createAssistantQuestionId();
  const corruptQuestionId = createAssistantQuestionId();
  for (const [id, prompt] of [[questionId, "Visible question?"], [corruptQuestionId, "Corrupt question?"]]) repository.saveAssistantQuestion({
    id, assistantId: assistant.id, prompt, status: "pending", linkedTodoIds: [], askedAt: old
  });
  const logId = createAssistantLogEntryId();
  const corruptLogId = createAssistantLogEntryId();
  for (const [id, summary] of [[logId, "Visible log"], [corruptLogId, "Corrupt log"]]) repository.appendAssistantLogEntry({
    id, assistantId: assistant.id, level: "info", summary, createdAt: old
  });
  db.query("UPDATE assistants SET created_at = ?1 WHERE id = ?2").run(oversized, assistant.id);
  db.query("UPDATE assistant_messages SET created_at = ?1 WHERE id = ?2").run(oversized, corruptMessageId);
  db.query("UPDATE assistant_todos SET sort_order = ?1 WHERE id = ?2").run("not-a-number", corruptTodoId);
  db.query("UPDATE assistant_learnings SET created_at = ?1 WHERE id = ?2").run(oversized, corruptLearningId);
  db.query("UPDATE assistant_questions SET asked_at = ?1 WHERE id = ?2").run(oversized, corruptQuestionId);
  const emptyIdQuestion = createAssistantQuestionId();
  repository.saveAssistantQuestion({ id: emptyIdQuestion, assistantId: assistant.id,
    prompt: "Empty identity?", status: "pending", linkedTodoIds: [], askedAt: old });
  db.query("UPDATE assistant_questions SET id = '' WHERE id = ?1").run(emptyIdQuestion);
  const visibleQuestionId = createAssistantQuestionId();
  const corruptVisibleQuestionId = createAssistantQuestionId();
  for (const id of [visibleQuestionId, corruptVisibleQuestionId]) repository.saveAssistantQuestion({
    id, assistantId: visibleAssistant.id, prompt: "Visible assistant question?", status: "pending", linkedTodoIds: [], askedAt: old
  });
  db.query("UPDATE assistant_questions SET asked_at = ?1 WHERE id = ?2").run(oversized, corruptVisibleQuestionId);
  db.query("UPDATE assistant_log_entries SET created_at = ?1 WHERE id = ?2").run(oversized, corruptLogId);

  const summaries = repository.listAssistantSummaries({ limit: 1 });
  expect(summaries.items.map((item) => item.id)).toEqual([visibleAssistant.id]);
  expect(summaries.totalApprox).toBe(1);
  expect(repository.listAssistantThreadMessages({ assistantId: assistant.id, limit: 1 }).items.map((item) => item.id)).toEqual([messageId]);
  const pages = [
    repository.listAssistantTodos({ assistantId: assistant.id, limit: 1 }),
    repository.listAssistantLearnings({ assistantId: assistant.id, limit: 1 }),
    repository.listAssistantQuestions({ assistantId: assistant.id, limit: 1 }),
    repository.listAssistantLogs({ assistantId: assistant.id, limit: 1 })
  ];
  expect(pages.map((page) => page.items[0]?.id)).toEqual([todoId, learningId, questionId, logId]);
  expect(pages.map((page) => page.totalApprox)).toEqual([1, 1, 1, 1]);
  expect(repository.listAssistantSummaries({ limit: 512 }).items.find((item) => item.id === visibleAssistant.id)?.unreadQuestionCount).toBe(1);
  expect(repository.getAssistantDetail({ assistantId: visibleAssistant.id }).assistant.unreadQuestionCount).toBe(1);
});

test("assistant detail continuation uses raw SQL positions when hydration repairs timestamps", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const datedIds = [createAssistantLogEntryId(), createAssistantLogEntryId()];
  const repairedIds = [createAssistantLogEntryId(), createAssistantLogEntryId()];
  for (const [index, id] of [...datedIds, ...repairedIds].entries()) {
    repository.appendAssistantLogEntry({
      id,
      assistantId: assistant.id,
      level: "info",
      summary: `Boundary log ${index}`,
      createdAt: new Date(Date.UTC(2026, 4, 25, 14, index)).toISOString()
    });
  }
  const db = databaseFor(repository);
  const repairTimestamp = db.query("UPDATE assistant_log_entries SET created_at = '' WHERE id = ?1");
  for (const id of repairedIds) repairTimestamp.run(id);

  const first = repository.listAssistantLogs({ assistantId: assistant.id, limit: 3 });
  const second = repository.listAssistantLogs({ assistantId: assistant.id, cursor: first.nextCursor, limit: 3 });
  const ids = [...first.items, ...second.items].map((entry) => entry.id);

  expect(first.nextCursor).toBeString();
  expect(new Set(ids).size).toBe(4);
  expect(new Set(ids)).toEqual(new Set([...datedIds, ...repairedIds]));
});

test("assistant todo continuation preserves a finite fractional raw sort order", () => {
  const repository = createRepository();
  const assistant = addLearningAssistant(repository);
  const now = "2026-05-25T14:00:00.000Z";
  const todoIds = [createAssistantTodoId(), createAssistantTodoId()];
  for (const [index, id] of todoIds.entries()) {
    repository.saveAssistantTodo({
      id,
      assistantId: assistant.id,
      title: `Fractional todo ${index}`,
      state: "pending",
      sortOrder: index,
      source: "assistant",
      workKind: "unspecified",
      createdAt: now,
      updatedAt: now
    });
  }
  const db = databaseFor(repository);
  db.query("UPDATE assistant_todos SET sort_order = ?1 WHERE id = ?2").run(0.5, todoIds[0]);
  db.query("UPDATE assistant_todos SET sort_order = ?1 WHERE id = ?2").run(1.5, todoIds[1]);

  const first = repository.listAssistantTodos({ assistantId: assistant.id, limit: 1 });
  const second = repository.listAssistantTodos({ assistantId: assistant.id, cursor: first.nextCursor, limit: 1 });
  expect(first.items.map((todo) => todo.id)).toEqual([todoIds[0]]);
  expect(second.items.map((todo) => todo.id)).toEqual([todoIds[1]]);
});

type TestWorkloadRow = { id: string; assistant_id: string; created_at: string; updated_at: string; valid: number };

function createWorkloadDatabase() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE background_jobs (
    id TEXT PRIMARY KEY,
    assistant_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    valid INTEGER NOT NULL
  ); CREATE TABLE background_job_runs (
    id TEXT PRIMARY KEY,
    assistant_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  return db;
}

function insertWorkloadRows(db: Database, assistantId: string, rows: Array<[string, string, number]>) {
  const insert = db.query("INSERT INTO background_jobs (id, assistant_id, created_at, updated_at, valid) VALUES (?1, ?2, ?3, ?3, ?4)");
  for (const [id, createdAt, valid] of rows) insert.run(id, assistantId, createdAt, valid);
}

function listTestWorkloadPage(
  db: Database,
  input: { assistantId: string; cursor?: string; limit?: number },
  collection: "jobs" | "runs"
) {
  return listAssistantWorkloadPage<TestWorkloadRow, { id: string; updatedAt: string }>(
    db,
    input,
    (row) => row.valid ? { id: row.id, updatedAt: row.updated_at } : undefined,
    "SELECT id, assistant_id, created_at, updated_at, valid FROM background_jobs",
    collection
  );
}
