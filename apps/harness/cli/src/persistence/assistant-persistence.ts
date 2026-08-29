import type { Database } from "bun:sqlite";
import type { Assistant, AssistantAssetRef, AssistantLearning, AssistantLogEntry, AssistantQuestion, AssistantThread, AssistantTodo } from "@hyperfocus/ai-core/protocol";
type AssistantOwnedTable = "assistant_todos" | "assistant_learnings" | "assistant_questions";

export function readPersistedAssistantById<Row extends { deleted_at: string | null }, Item>(db: Database, selectSql: string,
  assistantId: string, includeDeleted: boolean, hydrate: (row: Row) => Item | undefined) {
  const row = db.query<Row, [string]>(`${selectSql} WHERE id = ?1`).get(assistantId);
  return !row || (!includeDeleted && row.deleted_at) ? undefined : hydrate(row);
}

export function readAssistantMaintenancePage<Row extends { id: string }, Item>(db: Database, selectSql: string,
  input: { afterId?: string; limit: number }, hydrate: (row: Row) => Item | undefined) {
  const rows = db.query<Row, [string, number]>(`${selectSql} WHERE deleted_at IS NULL AND id > ?1
    ORDER BY id ASC LIMIT ?2`).all(input.afterId ?? "", input.limit);
  return { items: rows.map(hydrate).filter((entry): entry is Item => entry !== undefined),
    nextCursor: rows.length === input.limit ? rows.at(-1)?.id : undefined };
}

export function findPersistedAssistantIntentIdentity<Row extends { id: string }, Item extends { name: string }>(db: Database,
  selectSql: string, input: { projectId: string; name: string; scope: "global" | "project" }, hydrate: (row: Row) => Item | undefined) {
  let afterId = ""; const normalizedName = input.name.toLowerCase();
  do {
    const rows = input.scope === "global" ? db.query<Row, [string, number]>(`${selectSql} WHERE deleted_at IS NULL
      AND scope = 'global' AND project_id IS NULL AND id > ?1 ORDER BY id LIMIT ?2`).all(afterId, 128) :
      db.query<Row, [string, string, number]>(`${selectSql} WHERE deleted_at IS NULL AND scope = 'project'
        AND project_id = ?1 AND id > ?2 ORDER BY id LIMIT ?3`).all(input.projectId, afterId, 128);
    const found = rows.map(hydrate).find((assistant) => assistant?.name.toLowerCase() === normalizedName);
    if (found) return found;
    const boundary = rows.at(-1); if (rows.length < 128 || !boundary) return undefined; afterId = boundary.id;
  } while (true);
}

export type AssistantQuestionAnswerWrite = {
  questionId: string;
  answerText: string;
  logEntry: AssistantLogEntry;
  guidanceLearning: AssistantLearning;
  stackLearning?: AssistantLearning;
};

export type AssistantQuestionPolicyResolutionWrite = {
  questionId: string;
  resolution: { kind: "answer"; answerText: string } | { kind: "dismiss" };
  learning: AssistantLearning;
  logEntry: AssistantLogEntry;
};

export type AssistantQuestionAnswerPersistence = {
  assertAssistantExists: (assistantId: string) => void;
  getQuestion: (questionId: string) => AssistantQuestion | undefined;
  getTodo: (todoId: string) => AssistantTodo | undefined;
  saveTodo: (todo: AssistantTodo) => unknown;
  appendLog: (entry: AssistantLogEntry) => unknown;
  saveLearning: (learning: AssistantLearning) => unknown;
  saveLearningDeduped: (learning: AssistantLearning) => unknown;
  touchAssistant: (assistantId: string, at: string) => void;
  syncQuestionNotifications: (assistantId: string) => void;
};

export function isAssistantRevisionConflictError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "assistant-revision-conflict";
}

function assistantRevisionConflictError() {
  return Object.assign(new Error("Assistant changed during an asynchronous mutation"), {
    code: "assistant-revision-conflict" as const
  });
}

export type AssistantReprioritizeMutation = {
  expectedMutationRevision: number;
  todoUpdates: AssistantTodo[];
  newTodos: AssistantTodo[];
  todoOrder?: string[];
  learnings: AssistantLearning[];
  questions: AssistantQuestion[];
  logs: AssistantLogEntry[];
};

export type AssistantLearningCompactionWrite = {
  assistantId: string;
  expectedMutationRevision: number;
  compactedLearning: AssistantLearning;
  supersededIds: string[];
  retainedLearnings: AssistantLearning[];
  fallbackLogEntry?: AssistantLogEntry;
  logEntry: AssistantLogEntry;
};

export type AssistantLearningCompactionFailureWrite = {
  assistantId: string;
  expectedMutationRevision: number;
  fallbackLogEntry?: AssistantLogEntry;
  failureLogEntry: AssistantLogEntry;
};

type AssistantBootstrapTransitionCommon = {
  assistantId: string;
  expectedAttemptId: string;
  expectedMutationRevision: number;
  finishedAt: string;
  fallbackLogEntry?: AssistantLogEntry;
  logEntry: AssistantLogEntry;
};
export type AssistantBootstrapTransitionWrite = AssistantBootstrapTransitionCommon & (
  { state: "completed"; learnings: AssistantLearning[]; todos: AssistantTodo[]; question?: AssistantQuestion } |
  { state: "failed" }
);

export type AssistantStaleBootstrapRecoveryWrite = {
  assistantId: string;
  expectedAttemptId?: string;
  expectedStartedAt?: string;
  finishedAt: string;
  question: AssistantQuestion;
  logEntry: AssistantLogEntry;
};

type AssistantBootstrapPersistence = {
  getAssistant: (assistantId: string, includeDeleted?: boolean) => Assistant | undefined;
  isGloballyPaused: () => boolean;
  setBootstrapState: (assistantId: string, state: Assistant["bootstrapState"],
    input: { attemptId?: string; startedAt?: string; finishedAt?: string | null }) => Assistant;
  saveLearningDeduped: (learning: AssistantLearning) => unknown;
  saveTodo: (todo: AssistantTodo) => unknown;
  saveQuestion: (question: AssistantQuestion) => AssistantQuestion;
  appendLog: (entry: AssistantLogEntry) => AssistantLogEntry;
  syncQuestionNotifications: (assistantId: string) => void;
};

type AssistantReprioritizePersistence = Pick<AssistantQuestionAnswerPersistence,
  "assertAssistantExists" | "saveTodo" | "saveLearningDeduped" | "appendLog"> & {
  saveQuestion: (question: AssistantQuestion) => unknown;
  resetFailureState: (assistantId: string) => unknown;
};

type AssistantReprioritizeSnapshotPersistence = {
  getAssistant: (assistantId: string) => Assistant | undefined;
  getThread: (assistantId: string) => AssistantThread;
  getTodos: (assistantId: string) => AssistantTodo[];
  getQuestions: (assistantId: string) => AssistantQuestion[];
  getLearnings: (assistantId: string) => AssistantLearning[];
  getLogs: (assistantId: string) => AssistantLogEntry[];
  getAssetRefs: (assistantId: string) => AssistantAssetRef[];
};

export function readAssistantReprioritizeSnapshot(db: Database, assistantId: string,
  persistence: AssistantReprioritizeSnapshotPersistence) {
  return db.transaction(() => {
    const assistant = persistence.getAssistant(assistantId);
    const mutationRevision = db.query<{ mutation_revision: number }, [string]>(
      `SELECT mutation_revision FROM assistants WHERE id = ?1 AND deleted_at IS NULL`).get(assistantId)?.mutation_revision;
    if (!assistant || mutationRevision === undefined) throw new Error(`Unknown assistant: ${assistantId}`);
    return { assistant, mutationRevision, thread: persistence.getThread(assistantId), todos: persistence.getTodos(assistantId),
      questions: persistence.getQuestions(assistantId), learnings: persistence.getLearnings(assistantId),
      logs: persistence.getLogs(assistantId), assetRefs: persistence.getAssetRefs(assistantId) };
  }).immediate();
}

function readAssistantMutationSnapshot(db: Database, assistantId: string,
  getAssistant: (assistantId: string) => Assistant | undefined) {
  return db.transaction(() => {
    const assistant = getAssistant(assistantId);
    const mutationRevision = readAssistantMutationRevision(db, assistantId);
    if (!assistant || mutationRevision === undefined) throw new Error(`Unknown assistant: ${assistantId}`);
    return { assistant, mutationRevision };
  }).immediate();
}

export function isAssistantBootstrapAttemptCurrent(db: Database, assistantId: string, attemptId: string,
  expectedMutationRevision: number, persistence: Pick<AssistantBootstrapPersistence, "getAssistant">) {
  const assistant = persistence.getAssistant(assistantId, true);
  return Boolean(assistant && assistant.bootstrapState === "running" && assistant.bootstrapAttemptId === attemptId &&
    isLocallyRunnableAssistant(assistant) && readAssistantMutationRevision(db, assistantId) === expectedMutationRevision);
}

export function readAssistantLearningCompactionSnapshot(db: Database, assistantId: string,
  persistence: Pick<AssistantReprioritizeSnapshotPersistence, "getAssistant" | "getLearnings">) {
  return db.transaction(() => {
    const assistant = persistence.getAssistant(assistantId);
    const mutationRevision = readAssistantMutationRevision(db, assistantId);
    if (!assistant || mutationRevision === undefined) throw new Error(`Unknown assistant: ${assistantId}`);
    return { assistant, mutationRevision, learnings: persistence.getLearnings(assistantId) };
  }).immediate();
}

export function startAssistantBootstrapAttempt(db: Database, assistantId: string, attemptId: string, startedAt: string,
  logEntry: AssistantLogEntry, persistence: AssistantBootstrapPersistence) {
  return db.transaction(() => {
    assertAssistantChildOwner(assistantId, logEntry, "bootstrap start log");
    if (!isRunnableBootstrapAttempt(persistence, assistantId)) return undefined;
    persistence.setBootstrapState(assistantId, "running", { attemptId, startedAt, finishedAt: null });
    const savedLog = persistence.appendLog(logEntry);
    const snapshot = readAssistantMutationSnapshot(db, assistantId, (id) => persistence.getAssistant(id));
    return { ...snapshot, logEntry: savedLog };
  }).immediate();
}

export function persistAssistantBootstrapTransition(db: Database, input: AssistantBootstrapTransitionWrite,
  persistence: AssistantBootstrapPersistence) {
  return db.transaction(() => {
    assertBootstrapTransitionOwners(input);
    const assistant = persistence.getAssistant(input.assistantId, true);
    if (!assistant || assistant.bootstrapAttemptId !== input.expectedAttemptId || assistant.bootstrapState !== "running" ||
      readAssistantMutationRevision(db, input.assistantId) !== input.expectedMutationRevision ||
      !isLocallyRunnableAssistant(assistant)) return undefined;
    if (input.state === "completed") {
      for (const learning of input.learnings) persistence.saveLearningDeduped(learning);
      for (const todo of input.todos) persistence.saveTodo(todo);
      if (input.question) persistence.saveQuestion({ ...input.question,
        status: persistence.isGloballyPaused() ? "deferred" : input.question.status });
    }
    persistence.setBootstrapState(input.assistantId, input.state,
      { attemptId: input.expectedAttemptId, finishedAt: input.finishedAt });
    const fallbackLogEntry = input.fallbackLogEntry ? persistence.appendLog(input.fallbackLogEntry) : undefined;
    return { assistant: persistence.getAssistant(input.assistantId)!, fallbackLogEntry,
      logEntry: persistence.appendLog(input.logEntry) };
  }).immediate();
}

export function recoverStaleAssistantBootstrap(db: Database, input: AssistantStaleBootstrapRecoveryWrite,
  persistence: AssistantBootstrapPersistence) {
  return db.transaction(() => {
    assertAssistantChildOwner(input.assistantId, input.logEntry, "stale bootstrap log");
    assertAssistantChildOwner(input.assistantId, input.question, "stale bootstrap question");
    const assistant = persistence.getAssistant(input.assistantId, true);
    if (!assistant || assistant.deletedAt || assistant.bootstrapState !== "running" ||
      assistant.bootstrapAttemptId !== input.expectedAttemptId || assistant.bootstrapStartedAt !== input.expectedStartedAt) return undefined;
    persistence.setBootstrapState(input.assistantId, "failed", {
      attemptId: input.expectedAttemptId, finishedAt: input.finishedAt
    });
    const logEntry = persistence.appendLog(input.logEntry);
    const existing = db.query<{ present: number }, [string, string]>(`SELECT 1 AS present FROM assistant_questions
      WHERE assistant_id = ?1 AND prompt = ?2 AND status IN ('pending', 'deferred') LIMIT 1`)
      .get(input.assistantId, input.question.prompt);
    if (!existing) persistence.saveQuestion({ ...input.question,
      status: persistence.isGloballyPaused() ? "deferred" : input.question.status });
    persistence.syncQuestionNotifications(input.assistantId);
    return { assistant: persistence.getAssistant(input.assistantId)!, logEntry };
  }).immediate();
}

export function failCurrentAssistantBootstrapAttempt(db: Database, assistantId: string, attemptId: string,
  finishedAt: string, logEntry: AssistantLogEntry, persistence: AssistantBootstrapPersistence) {
  return db.transaction(() => {
    assertAssistantChildOwner(assistantId, logEntry, "bootstrap failure log");
    const assistant = persistence.getAssistant(assistantId, true);
    if (!assistant || assistant.deletedAt || assistant.bootstrapAttemptId !== attemptId || assistant.bootstrapState !== "running") {
      return undefined;
    }
    persistence.setBootstrapState(assistantId, "failed", { attemptId, finishedAt });
    return { assistant: persistence.getAssistant(assistantId)!, logEntry: persistence.appendLog(logEntry) };
  }).immediate();
}

export function persistAssistantQuestionAnswer(db: Database, assistantId: string, questionId: string, answerText: string,
  persistence: Pick<AssistantQuestionAnswerPersistence,
    "getQuestion" | "getTodo" | "saveTodo" | "touchAssistant" | "syncQuestionNotifications">) {
  return db.transaction(() => {
    const result = transitionAssistantQuestionAnswerRaw(db, assistantId, questionId, answerText.trim(),
      new Date().toISOString(), persistence);
    persistence.syncQuestionNotifications(assistantId);
    return result.question;
  }).immediate();
}

export function persistAssistantQuestion(db: Database, question: AssistantQuestion,
  persistence: Pick<AssistantQuestionAnswerPersistence, "assertAssistantExists" | "getQuestion" | "touchAssistant" | "syncQuestionNotifications">) {
  return db.transaction(() => {
    persistence.assertAssistantExists(question.assistantId);
    assertPersistedAssistantRowOwner(db, "assistant_questions", question.id, question.assistantId);
    db.query(`INSERT INTO assistant_questions (id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET prompt = excluded.prompt, status = excluded.status, answer_text = excluded.answer_text,
        linked_todo_ids_json = excluded.linked_todo_ids_json, answered_at = excluded.answered_at`)
      .run(question.id, question.assistantId, question.prompt, question.status, question.answerText ?? null,
        question.linkedTodoIds ? JSON.stringify(question.linkedTodoIds) : null, question.askedAt, question.answeredAt ?? null);
    persistence.touchAssistant(question.assistantId, question.answeredAt ?? question.askedAt);
    persistence.syncQuestionNotifications(question.assistantId);
    return persistence.getQuestion(question.id)!;
  }).immediate();
}

export function persistAssistantQuestionAnswers(db: Database, assistantId: string, writes: AssistantQuestionAnswerWrite[],
  persistence: AssistantQuestionAnswerPersistence) {
  return db.transaction(() => {
    persistence.assertAssistantExists(assistantId);
    const seen = new Set<string>();
    const pending: Array<{ question: AssistantQuestion; write: AssistantQuestionAnswerWrite }> = [];
    for (const write of writes) {
      if (seen.has(write.questionId)) throw new Error("Duplicate assistant question answers are not allowed");
      seen.add(write.questionId);
      assertAssistantQuestionAnswerWriteOwner(assistantId, write);
      const question = persistence.getQuestion(write.questionId);
      if (!question || question.assistantId !== assistantId) throw new Error("Unknown assistant question for assistant");
      const answerText = write.answerText.trim();
      if (question.status === "answered" && question.answerText === answerText) continue;
      if (question.status !== "pending" && question.status !== "deferred") throw new Error(question.status === "answered"
        ? "Assistant question was already answered differently" : "Assistant question is not answerable");
      pending.push({ question, write: { ...write, answerText } });
    }
    for (const { question, write } of pending) {
      transitionAssistantQuestionAnswerRaw(db, assistantId, question.id, write.answerText, write.logEntry.createdAt, persistence);
      persistence.appendLog(write.logEntry);
      persistence.saveLearningDeduped(write.guidanceLearning);
      if (write.stackLearning) persistence.saveLearning(write.stackLearning);
    }
    persistence.syncQuestionNotifications(assistantId);
    return { questions: writes.map(({ questionId }) => persistence.getQuestion(questionId)!),
      appliedLogEntries: pending.map(({ write }) => write.logEntry) };
  }).immediate();
}

function transitionAssistantQuestionAnswerRaw(db: Database, assistantId: string, questionId: string, answerText: string,
  answeredAt: string, persistence: Pick<AssistantQuestionAnswerPersistence,
    "getQuestion" | "getTodo" | "saveTodo" | "touchAssistant" | "syncQuestionNotifications">) {
  const question = persistence.getQuestion(questionId);
  if (!question || question.assistantId !== assistantId) throw new Error("Unknown assistant question for assistant");
  if (question.status === "answered" && question.answerText === answerText) return { question, applied: false };
  if (question.status !== "pending" && question.status !== "deferred") throw new Error(question.status === "answered"
    ? "Assistant question was already answered differently" : "Assistant question is not answerable");
  const updated = db.query(`UPDATE assistant_questions SET status = 'answered', answer_text = ?3, answered_at = ?4
    WHERE id = ?1 AND assistant_id = ?2 AND status IN ('pending', 'deferred')`).run(questionId, assistantId, answerText, answeredAt);
  if (updated.changes === 0) throw new Error("Assistant question changed before it could be answered");
  for (const todoId of question.linkedTodoIds ?? []) {
    const todo = persistence.getTodo(todoId);
    if (todo?.assistantId === assistantId && todo.state === "blocked") persistence.saveTodo({
      ...todo, state: "pending", blockerReason: undefined, updatedAt: answeredAt
    });
  }
  persistence.touchAssistant(assistantId, answeredAt);
  return { question: persistence.getQuestion(questionId)!, applied: true };
}

export function persistAssistantQuestionPolicyResolution(
  db: Database,
  assistantId: string,
  write: AssistantQuestionPolicyResolutionWrite,
  persistence: AssistantQuestionAnswerPersistence
) {
  return db.transaction(() => {
    persistence.assertAssistantExists(assistantId);
    assertAssistantQuestionPolicyResolutionOwner(assistantId, write);
    const question = write.resolution.kind === "answer"
      ? transitionAssistantQuestionAnswerRaw(db, assistantId, write.questionId, write.resolution.answerText.trim(),
        write.logEntry.createdAt, persistence).question
      : dismissAssistantQuestionRaw(db, assistantId, write.questionId, write.logEntry.createdAt, persistence);
    persistence.saveLearningDeduped(write.learning);
    persistence.appendLog(write.logEntry);
    persistence.syncQuestionNotifications(assistantId);
    return { question, logEntry: write.logEntry };
  }).immediate();
}

function dismissAssistantQuestionRaw(db: Database, assistantId: string, questionId: string, dismissedAt: string,
  persistence: Pick<AssistantQuestionAnswerPersistence, "getQuestion" | "touchAssistant">) {
  const question = persistence.getQuestion(questionId);
  if (!question || question.assistantId !== assistantId) throw new Error("Unknown assistant question for assistant");
  const updated = db.query(`UPDATE assistant_questions SET status = 'dismissed', answered_at = COALESCE(answered_at, ?3)
    WHERE id = ?1 AND assistant_id = ?2 AND status IN ('pending', 'deferred')`).run(questionId, assistantId, dismissedAt);
  if (updated.changes === 0) throw new Error("Assistant question is not dismissable");
  persistence.touchAssistant(assistantId, dismissedAt);
  return persistence.getQuestion(questionId)!;
}

export function persistAssistantReprioritizeMutation(db: Database, assistantId: string,
  mutation: AssistantReprioritizeMutation, persistence: AssistantReprioritizePersistence) {
  return db.transaction(() => {
    assertReprioritizeMutationOwners(assistantId, mutation);
    assertReprioritizeLinkedTodos(db, assistantId, mutation);
    persistence.assertAssistantExists(assistantId);
    if (mutation.todoOrder && new Set(mutation.todoOrder).size !== mutation.todoOrder.length) {
      throw new Error("Assistant reprioritize todo order contains duplicate todo IDs");
    }
    const revision = db.query<{ mutation_revision: number }, [string]>(
      `SELECT mutation_revision FROM assistants WHERE id = ?1 AND deleted_at IS NULL`
    ).get(assistantId)?.mutation_revision;
    if (revision !== mutation.expectedMutationRevision) throw assistantRevisionConflictError();
    for (const todo of mutation.todoUpdates) persistence.saveTodo(todo);
    for (const todo of mutation.newTodos) persistence.saveTodo(todo);
    if (mutation.todoOrder?.length) normalizePersistedAssistantOrder(db, "assistant_todos", assistantId, mutation.todoOrder,
      new Date().toISOString());
    for (const learning of mutation.learnings) persistence.saveLearningDeduped(learning);
    for (const question of mutation.questions) persistence.saveQuestion(question);
    persistence.resetFailureState(assistantId);
    for (const log of mutation.logs) persistence.appendLog(log);
    return { logs: mutation.logs };
  }).immediate();
}

export function persistAssistantLearningCompaction(db: Database, input: AssistantLearningCompactionWrite,
  persistence: { compact: (assistantId: string, learning: AssistantLearning, ids: string[]) => AssistantLearning | undefined;
    saveLearningDeduped: (learning: AssistantLearning) => AssistantLearning | undefined;
    appendLog: (entry: AssistantLogEntry) => AssistantLogEntry }) {
  return db.transaction(() => {
    assertLearningCompactionOwners(input);
    if (readAssistantMutationRevision(db, input.assistantId) !== input.expectedMutationRevision) {
      throw assistantRevisionConflictError();
    }
    const compacted = persistence.compact(input.assistantId, input.compactedLearning, input.supersededIds);
    if (!compacted) return undefined;
    const retained = input.retainedLearnings.map(persistence.saveLearningDeduped).filter(Boolean);
    const fallbackLogEntry = input.fallbackLogEntry ? persistence.appendLog(input.fallbackLogEntry) : undefined;
    return { compacted, retained, fallbackLogEntry, logEntry: persistence.appendLog(input.logEntry) };
  }).immediate();
}

export function persistAssistantLearningCompactionFailure(db: Database, input: AssistantLearningCompactionFailureWrite,
  persistence: Pick<AssistantBootstrapPersistence, "getAssistant" | "appendLog">) {
  return db.transaction(() => {
    if (input.fallbackLogEntry) assertAssistantChildOwner(input.assistantId, input.fallbackLogEntry, "compaction fallback log");
    assertAssistantChildOwner(input.assistantId, input.failureLogEntry, "compaction failure log");
    const assistant = persistence.getAssistant(input.assistantId, true);
    if (!assistant || !isLocallyRunnableAssistant(assistant) ||
      readAssistantMutationRevision(db, input.assistantId) !== input.expectedMutationRevision) return undefined;
    return { fallbackLogEntry: input.fallbackLogEntry ? persistence.appendLog(input.fallbackLogEntry) : undefined,
      failureLogEntry: persistence.appendLog(input.failureLogEntry) };
  }).immediate();
}

function assertAssistantChildOwner(assistantId: string, child: { assistantId: string }, label: string) {
  if (child.assistantId !== assistantId) throw new Error(`${label} does not belong to assistant`);
}

function assertBootstrapTransitionOwners(input: AssistantBootstrapTransitionWrite) {
  assertAssistantChildOwner(input.assistantId, input.logEntry, "bootstrap log");
  if (input.fallbackLogEntry) assertAssistantChildOwner(input.assistantId, input.fallbackLogEntry, "bootstrap fallback log");
  if (input.state === "completed") {
    for (const learning of input.learnings) assertAssistantChildOwner(input.assistantId, learning, "bootstrap learning");
    for (const todo of input.todos) assertAssistantChildOwner(input.assistantId, todo, "bootstrap todo");
    if (input.question) assertAssistantChildOwner(input.assistantId, input.question, "bootstrap question");
  }
}

function assertReprioritizeMutationOwners(assistantId: string, mutation: AssistantReprioritizeMutation) {
  for (const todo of [...mutation.todoUpdates, ...mutation.newTodos]) assertAssistantChildOwner(assistantId, todo, "reprioritize todo");
  for (const learning of mutation.learnings) assertAssistantChildOwner(assistantId, learning, "reprioritize learning");
  for (const question of mutation.questions) assertAssistantChildOwner(assistantId, question, "reprioritize question");
  for (const log of mutation.logs) assertAssistantChildOwner(assistantId, log, "reprioritize log");
}

function assertReprioritizeLinkedTodos(db: Database, assistantId: string, mutation: AssistantReprioritizeMutation) {
  const newIds = new Set(mutation.newTodos.map((todo) => todo.id));
  for (const todoId of newIds) {
    const owner = db.query<{ assistant_id: string }, [string]>("SELECT assistant_id FROM assistant_todos WHERE id = ?1")
      .get(todoId)?.assistant_id;
    if (owner !== undefined && owner !== assistantId) throw new Error("reprioritize todo does not belong to assistant");
  }
  const owned = new Set(db.query<{ id: string }, [string]>("SELECT id FROM assistant_todos WHERE assistant_id = ?1")
    .all(assistantId).map((row) => row.id));
  for (const question of mutation.questions) for (const todoId of question.linkedTodoIds ?? []) {
    if (!owned.has(todoId) && !newIds.has(todoId)) throw new Error("reprioritize question links unknown assistant todo");
  }
}

function assertLearningCompactionOwners(input: AssistantLearningCompactionWrite) {
  assertAssistantChildOwner(input.assistantId, input.compactedLearning, "compaction learning");
  for (const learning of input.retainedLearnings) assertAssistantChildOwner(input.assistantId, learning, "compaction retained learning");
  if (input.fallbackLogEntry) assertAssistantChildOwner(input.assistantId, input.fallbackLogEntry, "compaction fallback log");
  assertAssistantChildOwner(input.assistantId, input.logEntry, "compaction log");
}

function readAssistantMutationRevision(db: Database, assistantId: string) {
  return db.query<{ mutation_revision: number }, [string]>(
    `SELECT mutation_revision FROM assistants WHERE id = ?1 AND deleted_at IS NULL`).get(assistantId)?.mutation_revision;
}

function isRunnableBootstrapAttempt(persistence: AssistantBootstrapPersistence, assistantId: string) {
  const assistant = persistence.getAssistant(assistantId, true);
  return Boolean(assistant && isLocallyRunnableAssistant(assistant) && !persistence.isGloballyPaused());
}

function isLocallyRunnableAssistant(assistant: Assistant) {
  return !assistant.deletedAt && assistant.runState === "active" && assistant.circuitBreakerState !== "tripped";
}

function assertAssistantQuestionAnswerWriteOwner(assistantId: string, write: AssistantQuestionAnswerWrite) {
  if (
    write.logEntry.assistantId !== assistantId ||
    write.guidanceLearning.assistantId !== assistantId ||
    (write.stackLearning !== undefined && write.stackLearning.assistantId !== assistantId)
  ) {
    throw new Error("Assistant question answer child does not belong to assistant");
  }
}

function assertAssistantQuestionPolicyResolutionOwner(assistantId: string, write: AssistantQuestionPolicyResolutionWrite) {
  if (write.learning.assistantId !== assistantId || write.logEntry.assistantId !== assistantId) {
    throw new Error("Assistant question policy child does not belong to assistant");
  }
}

export function assertPersistedAssistantRowOwner(
  db: Database,
  table: AssistantOwnedTable,
  rowId: string,
  assistantId: string
) {
  const sql = table === "assistant_todos"
    ? "SELECT assistant_id FROM assistant_todos WHERE id = ?1"
    : table === "assistant_learnings"
      ? "SELECT assistant_id FROM assistant_learnings WHERE id = ?1"
      : "SELECT assistant_id FROM assistant_questions WHERE id = ?1";
  const row = db.query<{ assistant_id: string }, [string]>(sql).get(rowId);
  if (!row || row.assistant_id === assistantId) return;
  const kind = table === "assistant_todos" ? "todo" : table === "assistant_learnings" ? "learning" : "question";
  throw new Error(`Unknown assistant ${kind} for assistant`);
}

export function normalizePersistedAssistantOrder(
  db: Database,
  table: "assistant_todos" | "assistant_learnings",
  assistantId: string,
  requestedIds: string[],
  updatedAt: string
) {
  const selectSql = table === "assistant_todos"
    ? `SELECT id, sort_order FROM assistant_todos WHERE assistant_id = ?1
       ORDER BY sort_order ASC, updated_at DESC, id ASC`
    : `SELECT id, sort_order FROM assistant_learnings WHERE assistant_id = ?1
       ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC,
         sort_order ASC, kind DESC, created_at DESC, id DESC`;
  const persisted = db.query<{ id: string; sort_order: number | null }, [string]>(selectSql).all(assistantId);
  const requested = new Set(requestedIds);
  const normalized = [...requestedIds, ...persisted.map((row) => row.id).filter((id) => !requested.has(id))];
  const positions = new Map(persisted.map((row) => [row.id, row.sort_order]));
  const updateTodo = table === "assistant_todos"
    ? db.query(`UPDATE assistant_todos SET sort_order = ?3, updated_at = ?4 WHERE id = ?1 AND assistant_id = ?2`)
    : undefined;
  const updateLearning = table === "assistant_learnings"
    ? db.query(`UPDATE assistant_learnings SET sort_order = ?3 WHERE id = ?1 AND assistant_id = ?2`)
    : undefined;
  normalized.forEach((id, index) => {
    if (positions.get(id) === index) return;
    if (updateTodo) updateTodo.run(id, assistantId, index, updatedAt);
    else updateLearning!.run(id, assistantId, index);
  });
}
