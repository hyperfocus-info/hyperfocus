import * as assistantPagination from "../../../assistant-pagination";
import type { Assistant, AssistantDetail, AssistantLearning, AssistantLearningPage, AssistantLogEntry, AssistantLogPage, AssistantQuestion, AssistantQuestionPage, AssistantsState, AssistantSummaryPage, AssistantThread, AssistantThreadMessagePage, AssistantTodo, AssistantTodoPage, AssistantTodoPatch, ChatMessageKind, ChatMessageMetadata, ChatRole, ProjectId } from "@hyperfocus/ai-core/protocol";
import type { AssistantLearningCompactionFailureWrite, AssistantLearningCompactionWrite, AssistantQuestionAnswerPersistence, AssistantQuestionAnswerWrite, AssistantQuestionPolicyResolutionWrite, AssistantReprioritizeMutation } from "../../assistant-persistence";
import type { AssistantLearningRow, AssistantListInput, AssistantLogEntryRow, AssistantQuestionRow, AssistantRow, AssistantTodoInput, AssistantTodoRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceAssistantReadsOperations2Set, WorkspaceAssistantReadsOperations3Set, WorkspaceAssistantReadsOperations4Set, WorkspaceAssistantReadsOperationsSet } from "./assistant-reads";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { ASSISTANT_DETAIL_PAGE_SIZE, assistantLearningSchema, assistantTodoPatchSchema } from "@hyperfocus/ai-core/protocol";
import { ASSISTANT_SELECT_SQL, ASSISTANT_SUMMARY_PAGE_LIMIT } from "../contracts";
import { assertPersistableMessageContent } from "../../message-content-policy";
import { assertPersistedAssistantRowOwner, findPersistedAssistantIntentIdentity, normalizePersistedAssistantOrder, persistAssistantLearningCompaction, persistAssistantLearningCompactionFailure, persistAssistantQuestion, persistAssistantQuestionAnswer, persistAssistantQuestionAnswers, persistAssistantQuestionPolicyResolution, persistAssistantReprioritizeMutation, isAssistantBootstrapAttemptCurrent as readAssistantBootstrapAttemptCurrent, readAssistantLearningCompactionSnapshot, readAssistantMaintenancePage, readAssistantReprioritizeSnapshot, readPersistedAssistantById } from "../../assistant-persistence";
import { boundAssistantLogDetailsJson } from "../persisted-values";
import { countAssistantPendingQuestions, someAssistantQuestion } from "../../../assistant-question-policy";
import { createAssistantSummaryDelta, incrementAssistantFailure, readAllPendingBootstrapAssistants, writeAssistantFailureState } from "../../assistant-runtime-atomicity";
import { deleteAssistantAtomically } from "../../workspace-deletion";
import { findPagedAssistantLearningMatches, isAssistantQuestionPolicyFollowup, isGarbageAssistantLearningSummary, mergeAssistantLearningSummaries, mergeUniqueStrings, normalizeAssistantLearningSource, readAssistantPromptLearnings, shouldReplaceAssistantLearning, shouldSkipSimilarAssistantLearning, strongerAssistantLearningConfidence } from "../../../assistant-learning-policy";
import { normalizeAssistantTodoWorkKind } from "../../assistant/assistant-todo-metadata";
import { readAssistantTodoOperationalAggregate } from "../../../assistant-todo-policy";
import { stripAnsiForStorage } from "../../../ansi-storage";
import { syncAssistantQuestionNotificationsRaw } from "../../notification-persistence";

export function createWorkspaceAssistantsOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function consumeAssistantsPendingReprioritize() {
      const assistants = db
        .query<{ id: string; reason: string }, []>(
          `SELECT id, pending_reprioritize_reason AS reason
           FROM assistants
           WHERE deleted_at IS NULL
             AND pending_reprioritize_reason IS NOT NULL
           ORDER BY pending_reprioritize_requested_at ASC, updated_at ASC`
        )
        .all();
  
      db
        .query(
          `UPDATE assistants
           SET pending_reprioritize_reason = NULL,
               pending_reprioritize_requested_at = NULL, mutation_revision = mutation_revision + 1
           WHERE pending_reprioritize_reason IS NOT NULL`
        )
        .run();
  
      return assistants.map((assistant) => ({
        assistantId: assistant.id,
        reason: assistant.reason
      }));
    }
  function getProjectBackgroundJobIds(projectId: ProjectId) {
      return db.query<{ id: string }, [string]>(
        `SELECT id FROM background_jobs WHERE project_id = ?1 ORDER BY id ASC`
      ).all(projectId).map((row) => row.id);
    }
  return {
    operations: {
      consumeAssistantsPendingReprioritize,
      getProjectBackgroundJobIds,
    },
    publicApi: {
      consumeAssistantsPendingReprioritize,
      getProjectBackgroundJobIds,
    },
  };
}

export type WorkspaceAssistantsOperationsSet = ReturnType<typeof createWorkspaceAssistantsOperations>["operations"];

export function createWorkspaceAssistantsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet & WorkspaceAssistantReadsOperations2Set) {
  const { db } = context;
  function listAssistantSummaries(input: AssistantListInput = {}): AssistantSummaryPage {
      const page = assistantPagination.listAssistantTimestampPage({ input, ownerId: "workspace", collection: "summaries",
        fallbackLimit: ASSISTANT_SUMMARY_PAGE_LIMIT,
        readRows: (cursor, readLimit) => cursor
          ? db.query<AssistantRow, [string, string, number]>(`${ASSISTANT_SELECT_SQL}
              WHERE deleted_at IS NULL AND ${assistantPagination.assistantTimestampPageabilitySql()}
                AND (created_at < ?1 OR (created_at = ?1 AND id < ?2))
              ORDER BY created_at DESC, id DESC LIMIT ?3`).all(cursor.timestamp, cursor.id, readLimit)
          : db.query<AssistantRow, [number]>(`${ASSISTANT_SELECT_SQL}
              WHERE deleted_at IS NULL AND ${assistantPagination.assistantTimestampPageabilitySql()}
              ORDER BY created_at DESC, id DESC LIMIT ?1`).all(readLimit),
        hydrate: (row: AssistantRow) => operations.hydrateAssistant(row, 0),
        positionOf: (row: AssistantRow) => ({ timestamp: row.created_at, id: row.id })
      });
      return {
        items: assistantPagination.attachAssistantUnreadQuestionCounts(db, page.items),
        nextCursor: page.nextCursor,
        totalApprox: operations.countActiveAssistants()
      };
    }
  function getAssistant(assistantId: string, includeDeleted: boolean = false) {
      return readPersistedAssistantById<AssistantRow, Assistant>(db, ASSISTANT_SELECT_SQL, assistantId,
        includeDeleted, (row) => operations.hydrateAssistant(row));
    }
  function loadAssistantSummaryDelta(assistantIds: string[]): AssistantsState { return createAssistantSummaryDelta(assistantIds.map((id) => getAssistant(id))); }
  function listAssistantMaintenancePage(input: { afterId?: string; limit?: number } = {}) {
      return readAssistantMaintenancePage<AssistantRow, Assistant>(db, ASSISTANT_SELECT_SQL,
        { ...input, limit: assistantPagination.normalizeAssistantPageLimit(input.limit, 128) }, (row) => operations.hydrateAssistant(row));
    }
  function findAssistantByIntentIdentity(projectId: ProjectId, name: string, scope: Assistant["scope"]) {
      return findPersistedAssistantIntentIdentity<AssistantRow, Assistant>(db, ASSISTANT_SELECT_SQL,
        { projectId, name, scope }, (row) => operations.hydrateAssistant(row));
    }
  function isAssistantBootstrapAttemptCurrent(assistantId: string, attemptId: string, expectedMutationRevision: number) {
      return readAssistantBootstrapAttemptCurrent(db, assistantId, attemptId, expectedMutationRevision, { getAssistant: (id, includeDeleted) => getAssistant(id, includeDeleted) }); }
  function getAssistantsAwaitingBootstrap() {
      return readAllPendingBootstrapAssistants((afterId) => listAssistantMaintenancePage({ afterId }));
    }
  function recoverAssistantCircuitBreaker(assistantId: string) {
      const assistant = getAssistant(assistantId, true);
      if (!assistant) {
        throw new Error(`Unknown assistant: ${assistantId}`);
      }
      if (assistant.deletedAt) {
        throw new Error(`Assistant ${assistant.name} is deleted`);
      }
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistants
           SET failure_streak_count = 0,
               circuit_breaker_state = 'closed',
               circuit_breaker_reason = NULL,
               run_state = 'active',
               updated_at = ?2,
               latest_activity_at = ?2, mutation_revision = mutation_revision + 1
           WHERE id = ?1`
        )
        .run(assistantId, now);
      return getAssistant(assistantId)!;
    }
  return {
    operations: {
      listAssistantSummaries,
      getAssistant,
      loadAssistantSummaryDelta,
      listAssistantMaintenancePage,
      findAssistantByIntentIdentity,
      isAssistantBootstrapAttemptCurrent,
      getAssistantsAwaitingBootstrap,
      recoverAssistantCircuitBreaker,
    },
    publicApi: {
      listAssistantSummaries,
      getAssistant,
      loadAssistantSummaryDelta,
      listAssistantMaintenancePage,
      findAssistantByIntentIdentity,
      isAssistantBootstrapAttemptCurrent,
      getAssistantsAwaitingBootstrap,
      recoverAssistantCircuitBreaker,
    },
  };
}

export type WorkspaceAssistantsOperations2Set = ReturnType<typeof createWorkspaceAssistantsOperations2>["operations"];

export function createWorkspaceAssistantsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set) {
  const { db } = context;
  function getAssistantLearningCompactionSnapshot(assistantId: string) { return readAssistantLearningCompactionSnapshot(db,
      assistantId, { getAssistant: (id) => operations.getAssistant(id), getLearnings: (id) => operations.readAssistantLearnings({ assistantId: id, limit: Infinity }) }); }
  function syncAssistantQuestionNotifications(assistantId?: string) {
      db.transaction(() => syncAssistantQuestionNotificationsRaw(db, assistantId, (row) => operations.hydrateAssistantQuestion(row))).immediate();
    }
  function deleteAssistant(assistantId: string) {
      return deleteAssistantAtomically(db, assistantId, (row) => operations.hydrateAssistantQuestion(row));
    }
  return {
    operations: {
      getAssistantLearningCompactionSnapshot,
      syncAssistantQuestionNotifications,
      deleteAssistant,
    },
    publicApi: {
      getAssistantLearningCompactionSnapshot,
      syncAssistantQuestionNotifications,
      deleteAssistant,
    },
  };
}

export type WorkspaceAssistantsOperations3Set = ReturnType<typeof createWorkspaceAssistantsOperations3>["operations"];

export function createWorkspaceAssistantsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet & WorkspaceAssistantReadsOperations2Set & WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceAssistantReadsOperations4Set & WorkspaceRepositoryReadsOperationsSet) {
  const { db } = context;
  function listAssistantThreadMessages(input: { assistantId: string; cursor?: string; limit?: number }): AssistantThreadMessagePage & { threadId: string } {
      operations.assertAssistantExists(input.assistantId);
      const thread = operations.readAssistantThreadRowByAssistantId(input.assistantId);
      const page = operations.readAssistantMessagePage(thread.id, input);
      return {
        threadId: thread.id,
        ...page
      };
    }
  function listAssistantLogs(input: { assistantId: string; cursor?: string; limit?: number }): AssistantLogPage {
      operations.assertAssistantExists(input.assistantId);
      const page = assistantPagination.listAssistantTimestampPage({ input, ownerId: input.assistantId, collection: "logs",
        fallbackLimit: ASSISTANT_DETAIL_PAGE_SIZE,
        readRows: (cursor, readLimit) => assistantPagination.readAssistantTimestampPageRows<AssistantLogEntryRow>(db,
          "SELECT id, assistant_id, level, summary, detail, details_json, created_at FROM assistant_log_entries",
          "assistant_id", input.assistantId, "created_at", cursor, readLimit),
        hydrate: (row: AssistantLogEntryRow) => operations.hydrateAssistantLogEntry(row),
        positionOf: (row: AssistantLogEntryRow) => ({ timestamp: row.created_at, id: row.id })
      });
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        totalApprox: operations.countAssistantRows("assistant_log_entries", input.assistantId)
      };
    }
  function listAssistantTodos(input: { assistantId: string; cursor?: string; limit?: number }): AssistantTodoPage {
      operations.assertAssistantExists(input.assistantId);
      const page = assistantPagination.listAssistantTodoPage<AssistantTodoRow, AssistantTodo>(db, input,
        `SELECT id, assistant_id, title, description, state, sort_order, blocker_reason, source,
          work_kind, work_target, created_at, updated_at, completed_at, cancelled_at FROM assistant_todos`,
        (row) => operations.hydrateAssistantTodo(row), ASSISTANT_DETAIL_PAGE_SIZE);
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        totalApprox: operations.countAssistantRows("assistant_todos", input.assistantId)
      };
    }
  function getAssistantTodoOperationalAggregate(assistantId: string) { return db.transaction(() => readAssistantTodoOperationalAggregate((cursor) => listAssistantTodos({ assistantId, cursor, limit: 128 }))).immediate(); }
  function getAssistantNextTodoSortOrder(assistantId: string) { return getAssistantTodoOperationalAggregate(assistantId).nextSortOrder; }
  function hasAssistantCodingTodo(assistantId: string) { return getAssistantTodoOperationalAggregate(assistantId).codingCount > 0; }
  function getAssistantTodoPolicyCounts(assistantId: string) { const aggregate = getAssistantTodoOperationalAggregate(assistantId); return { assistantGeneratedCount: aggregate.assistantGeneratedCount, codingCount: aggregate.codingCount }; }
  function getAssistantActiveTodoPromptSnapshot(assistantId: string) { const aggregate = getAssistantTodoOperationalAggregate(assistantId); return { items: aggregate.items, count: aggregate.activeCount }; }
  function listAssistantLearnings(input: { assistantId: string; cursor?: string; limit?: number }): AssistantLearningPage {
      operations.assertAssistantExists(input.assistantId);
      const page = assistantPagination.listAssistantTimestampPage({ input, ownerId: input.assistantId, collection: "learnings",
        fallbackLimit: ASSISTANT_DETAIL_PAGE_SIZE,
        readRows: (cursor, readLimit) => assistantPagination.readAssistantTimestampPageRows<AssistantLearningRow>(db,
          "SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at FROM assistant_learnings",
          "assistant_id", input.assistantId, "created_at", cursor, readLimit, assistantPagination.assistantLearningVisibilitySql()),
        hydrate: (row: AssistantLearningRow) => operations.hydrateAssistantLearning(row),
        positionOf: (row: AssistantLearningRow) => ({ timestamp: row.created_at, id: row.id })
      });
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        totalApprox: operations.countAssistantRows("assistant_learnings", input.assistantId)
      };
    }
  function listAssistantQuestions(input: { assistantId: string; cursor?: string; limit?: number }): AssistantQuestionPage {
      operations.assertAssistantExists(input.assistantId);
      const page = assistantPagination.listAssistantTimestampPage({ input, ownerId: input.assistantId, collection: "questions",
        fallbackLimit: ASSISTANT_DETAIL_PAGE_SIZE,
        readRows: (cursor, readLimit) => assistantPagination.readAssistantTimestampPageRows<AssistantQuestionRow>(db,
          "SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at FROM assistant_questions",
          "assistant_id", input.assistantId, "asked_at", cursor, readLimit),
        hydrate: (row: AssistantQuestionRow) => operations.hydrateAssistantQuestion(row),
        positionOf: (row: AssistantQuestionRow) => ({ timestamp: row.asked_at, id: row.id })
      });
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        totalApprox: operations.countAssistantRows("assistant_questions", input.assistantId)
      };
    }
  function getAssistantOperationalCounts(assistantId: string) { const todos = getAssistantTodoOperationalAggregate(assistantId); return { openTodoCount: todos.activeCount, pendingQuestionCount: countAssistantPendingQuestions((cursor) => listAssistantQuestions({ assistantId, cursor, limit: 128 })) }; }
  function hasAssistantPendingQuestion(assistantId: string) { return someAssistantQuestion((cursor) => listAssistantQuestions({ assistantId, cursor, limit: 128 }), (question) => question.status === "pending" || question.status === "deferred"); }
  function getAssistantDetail(input: { assistantId: string }): AssistantDetail {
      operations.assertAssistantExists(input.assistantId);
      const assistant = operations.getAssistant(input.assistantId);
      if (!assistant) throw new Error(`Unknown assistant: ${input.assistantId}`);
      const threadRow = operations.readAssistantThreadRowByAssistantId(input.assistantId);
      const threadPage = operations.readAssistantMessagePage(threadRow.id, { limit: ASSISTANT_DETAIL_PAGE_SIZE }),
        thread = operations.hydrateAssistantThread(threadRow, ASSISTANT_DETAIL_PAGE_SIZE, threadPage);
      return {
        assistant, thread, threadMessagesNextCursor: threadPage.nextCursor,
        todos: listAssistantTodos({ assistantId: input.assistantId, limit: ASSISTANT_DETAIL_PAGE_SIZE }), learnings: listAssistantLearnings({ assistantId: input.assistantId, limit: ASSISTANT_DETAIL_PAGE_SIZE }),
        questions: listAssistantQuestions({ assistantId: input.assistantId, limit: ASSISTANT_DETAIL_PAGE_SIZE }), logs: listAssistantLogs({ assistantId: input.assistantId, limit: ASSISTANT_DETAIL_PAGE_SIZE }),
        assetRefs: operations.readAssistantAssetRefs({ assistantId: input.assistantId, limit: ASSISTANT_DETAIL_PAGE_SIZE })
      };
    }
  function getAssistantThread(assistantId: string, messageLimit: number = 4096): AssistantThread {
      operations.assertAssistantExists(assistantId);
      const row = operations.readAssistantThreadRowByAssistantId(assistantId);
      const thread = operations.hydrateAssistantThread(row, messageLimit);
      if (!thread) throw new Error(`Assistant ${assistantId} has no loadable thread`);
      return thread;
    }
  function getAssistantTodos(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return operations.readAssistantTodos({ assistantId });
    }
  function getAssistantTodoForAssistant(assistantId: string, todoId: string) {
      operations.assertAssistantExists(assistantId);
      const todo = operations.getAssistantTodo(todoId);
      if (!todo || todo.assistantId !== assistantId) {
        throw new Error("Unknown assistant todo for assistant");
      }
      return todo;
    }
  function getAssistantLearnings(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return operations.readAssistantLearningsByAssistantId(assistantId);
    }
  function getAssistantLearningStats(assistantId: string) {
      const learnings = getAssistantLearnings(assistantId);
      const activeFactLearnings = learnings.filter((learning) => (learning.kind ?? "fact") === "fact");
      return { activeLearningCount: learnings.length, activeFactLearningCount: activeFactLearnings.length,
        activeSummaryCharCount: learnings.reduce((total, learning) => total + learning.summary.length, 0) };
    }
  function getAssistantQuestions(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return operations.readAssistantQuestions({ assistantId });
    }
  function hasAssistantBackgroundJobs(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return Boolean(db.query<{ id: string }, [string]>(`SELECT id FROM background_jobs WHERE assistant_id = ?1 LIMIT 1`).get(assistantId));
    }
  return {
    operations: {
      listAssistantThreadMessages,
      listAssistantLogs,
      listAssistantTodos,
      getAssistantTodoOperationalAggregate,
      getAssistantNextTodoSortOrder,
      hasAssistantCodingTodo,
      getAssistantTodoPolicyCounts,
      getAssistantActiveTodoPromptSnapshot,
      listAssistantLearnings,
      listAssistantQuestions,
      getAssistantOperationalCounts,
      hasAssistantPendingQuestion,
      getAssistantDetail,
      getAssistantThread,
      getAssistantTodos,
      getAssistantTodoForAssistant,
      getAssistantLearnings,
      getAssistantLearningStats,
      getAssistantQuestions,
      hasAssistantBackgroundJobs,
    },
    publicApi: {
      listAssistantThreadMessages,
      listAssistantLogs,
      listAssistantTodos,
      getAssistantTodoOperationalAggregate,
      getAssistantNextTodoSortOrder,
      hasAssistantCodingTodo,
      getAssistantTodoPolicyCounts,
      getAssistantActiveTodoPromptSnapshot,
      listAssistantLearnings,
      listAssistantQuestions,
      getAssistantOperationalCounts,
      hasAssistantPendingQuestion,
      getAssistantDetail,
      getAssistantThread,
      getAssistantTodos,
      getAssistantTodoForAssistant,
      getAssistantLearnings,
      getAssistantLearningStats,
      getAssistantQuestions,
      hasAssistantBackgroundJobs,
    },
  };
}

export type WorkspaceAssistantsOperations4Set = ReturnType<typeof createWorkspaceAssistantsOperations4>["operations"];

export function createWorkspaceAssistantsOperations5(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations4Set & WorkspaceRepositoryReadsOperationsSet & WorkspaceAssistantsOperations4Set) {
  const { db } = context;
  function markAssistantPendingReprioritize(assistantId: string, reason: string) {
      operations.assertAssistantExists(assistantId);
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistants
           SET pending_reprioritize_reason = ?2,
               pending_reprioritize_requested_at = ?3,
               updated_at = ?3,
               latest_activity_at = ?3, mutation_revision = mutation_revision + 1
           WHERE id = ?1`
        )
        .run(assistantId, reason.trim(), now);
    }
  function clearAssistantPendingReprioritize(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistants
           SET pending_reprioritize_reason = NULL,
               pending_reprioritize_requested_at = NULL,
               updated_at = ?2,
               latest_activity_at = ?2, mutation_revision = mutation_revision + 1
           WHERE id = ?1`
        )
        .run(assistantId, now);
    }
  function getAssistantAssetRefs(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return operations.readAssistantAssetRefs({ assistantId });
    }
  function getAssistantLogEntries(assistantId: string) {
      operations.assertAssistantExists(assistantId);
      return operations.readAssistantLogEntries({ assistantId });
    }
  function getAssistantReprioritizeSnapshot(assistantId: string) { return readAssistantReprioritizeSnapshot(db, assistantId,
      { getAssistant: (id) => operations.getAssistant(id), getThread: (id) => operations.getAssistantThread(id), getTodos: (id) => operations.getAssistantTodos(id), getQuestions: (id) => operations.getAssistantQuestions(id), getLearnings: (id) => readAssistantPromptLearnings((cursor) => operations.listAssistantLearnings({ assistantId: id, cursor, limit: 128 })),
        getLogs: (id) => getAssistantLogEntries(id), getAssetRefs: (id) => getAssistantAssetRefs(id) }); }
  function setAssistantRunState(assistantId: string, runState: Assistant["runState"], reason?: string) {
      operations.assertAssistantExists(assistantId);
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistants
           SET run_state = ?2,
               circuit_breaker_reason = COALESCE(?3, circuit_breaker_reason),
               updated_at = ?4,
               latest_activity_at = ?4, mutation_revision = mutation_revision + 1
           WHERE id = ?1`
        )
        .run(assistantId, runState, reason ?? null, now);
      return operations.getAssistant(assistantId)!;
    }
  function setAssistantBootstrapState(
      assistantId: string,
      bootstrapState: Assistant["bootstrapState"],
      input: { attemptId?: string; startedAt?: string; finishedAt?: string | null } = {}
    ) {
      operations.assertAssistantExists(assistantId);
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistants
           SET bootstrap_state = ?2,
               bootstrap_attempt_id = COALESCE(?3, bootstrap_attempt_id),
               bootstrap_started_at = CASE WHEN ?4 IS NULL THEN bootstrap_started_at ELSE ?4 END,
               bootstrap_finished_at = CASE WHEN ?5 = 1 THEN ?6 ELSE bootstrap_finished_at END,
               updated_at = ?7,
               latest_activity_at = ?7, mutation_revision = mutation_revision + 1
           WHERE id = ?1`
        )
        .run(
          assistantId,
          bootstrapState,
          input.attemptId ?? null,
          input.startedAt ?? null,
          input.finishedAt === undefined ? 0 : 1,
          input.finishedAt ?? null,
          now
        );
      return operations.getAssistant(assistantId)!;
    }
  function updateAssistantFailureState(
      assistantId: string,
      input: {
        failureStreakCount: number;
        circuitBreakerState?: Assistant["circuitBreakerState"];
        circuitBreakerReason?: string;
        runState?: Assistant["runState"];
      }
    ) {
      return writeAssistantFailureState({ db: db, assistantId, state: input,
        assertExists: () => operations.assertAssistantExists(assistantId), getAssistant: () => operations.getAssistant(assistantId)! });
    }
  function recordAssistantFailure(assistantId: string, message: string) {
      return incrementAssistantFailure({ db: db, assistantId, message, getAssistant: () => operations.getAssistant(assistantId),
        updateFailureState: (state) => updateAssistantFailureState(assistantId, state) });
    }
  return {
    operations: {
      markAssistantPendingReprioritize,
      clearAssistantPendingReprioritize,
      getAssistantAssetRefs,
      getAssistantLogEntries,
      getAssistantReprioritizeSnapshot,
      setAssistantRunState,
      setAssistantBootstrapState,
      updateAssistantFailureState,
      recordAssistantFailure,
    },
    publicApi: {
      markAssistantPendingReprioritize,
      clearAssistantPendingReprioritize,
      getAssistantAssetRefs,
      getAssistantLogEntries,
      getAssistantReprioritizeSnapshot,
      setAssistantRunState,
      setAssistantBootstrapState,
      updateAssistantFailureState,
      recordAssistantFailure,
    },
  };
}

export type WorkspaceAssistantsOperations5Set = ReturnType<typeof createWorkspaceAssistantsOperations5>["operations"];

export function createWorkspaceAssistantsOperations6(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceRepositoryReadsOperationsSet & WorkspaceAssistantsOperations4Set & WorkspaceMigrationSupportOperationsSet) {
  const { db } = context;
  function saveAssistantTodo(todo: AssistantTodoInput) { return operations.runAssistantTodoMutation(todo.assistantId, new Date().toISOString(), () => operations.saveAssistantTodoRaw(todo)); }
  function appendAssistantTodo(todo: Omit<AssistantTodoInput, "sortOrder">) { return operations.runAssistantTodoMutation(todo.assistantId, new Date().toISOString(), () => operations.saveAssistantTodoRaw({ ...todo, sortOrder: operations.getAssistantTodoOperationalAggregate(todo.assistantId).nextSortOrder })); }
  function updateAssistantTodo(assistantId: string, todoId: string, patch: AssistantTodoPatch) {
      const parsedPatch = assistantTodoPatchSchema.parse(patch);
      const now = new Date().toISOString();
      return operations.runAssistantTodoMutation(assistantId, now, () => {
        const existing = operations.getAssistantTodo(todoId);
        if (!existing) {
          if (!parsedPatch.title) throw new Error("Unknown assistant todo for assistant");
          const sortOrder = operations.getAssistantNextTodoSortOrder(assistantId);
          return operations.saveAssistantTodoRaw({ id: todoId, assistantId, title: parsedPatch.title,
            description: parsedPatch.description ?? undefined, state: parsedPatch.state ?? "pending", sortOrder,
            blockerReason: parsedPatch.blockerReason ?? undefined, source: "user",
            workKind: parsedPatch.workKind ?? "unspecified", workTarget: parsedPatch.workTarget ?? undefined,
            createdAt: now, updatedAt: now, completedAt: parsedPatch.state === "completed" ? now : undefined,
            cancelledAt: parsedPatch.state === "cancelled" ? now : undefined });
        }
        if (existing.assistantId !== assistantId) throw new Error("Unknown assistant todo for assistant");
        const nextState = parsedPatch.state ?? existing.state;
        const updated = db
          .query(
            `UPDATE assistant_todos
           SET title = ?3, description = ?4, state = ?5, blocker_reason = ?6, work_kind = ?7,
               work_target = ?8, updated_at = ?9, completed_at = ?10, cancelled_at = ?11
           WHERE id = ?1 AND assistant_id = ?2`
          )
          .run(
            todoId,
            assistantId,
            parsedPatch.title ?? existing.title,
            parsedPatch.description === null ? null : parsedPatch.description ?? existing.description ?? null,
            nextState,
            parsedPatch.blockerReason === null ? null : parsedPatch.blockerReason ?? existing.blockerReason ?? null,
            normalizeAssistantTodoWorkKind(parsedPatch.workKind ?? existing.workKind),
            parsedPatch.workTarget === null ? null : parsedPatch.workTarget ?? existing.workTarget ?? null,
            now,
            nextState === "completed" ? existing.completedAt ?? now : null,
            nextState === "cancelled" ? existing.cancelledAt ?? now : null
          );
        if (updated.changes === 0) throw new Error("Unknown assistant todo for assistant");
        return operations.getAssistantTodo(todoId)!;
      });
    }
  function reorderAssistantTodos(assistantId: string, todoIds: string[]) {
      const now = new Date().toISOString();
      operations.runAssistantTodoMutation(assistantId, now, () => {
        if (todoIds.length === 0) throw new Error("Assistant todo reorder requires at least one todo ID");
        if (new Set(todoIds).size !== todoIds.length) throw new Error("Assistant todo reorder contains duplicate todo IDs");
        operations.assertAssistantTodosBelongToAssistant(assistantId, todoIds);
        normalizePersistedAssistantOrder(db, "assistant_todos", assistantId, todoIds, now);
      });
    }
  function deleteAssistantTodo(assistantId: string, todoId: string) {
      const now = new Date().toISOString();
      operations.runAssistantTodoMutation(assistantId, now, () => {
        const deleted = db.query(`DELETE FROM assistant_todos WHERE id = ?1 AND assistant_id = ?2`).run(todoId, assistantId);
        if (deleted.changes === 0) throw new Error("Unknown assistant todo for assistant");
      });
    }
  function saveAssistantLearningRaw(learning: AssistantLearning) {
      operations.assertAssistantExists(learning.assistantId);
      assertPersistedAssistantRowOwner(db, "assistant_learnings", learning.id, learning.assistantId);
      const parsed = assistantLearningSchema.parse({
        ...learning,
        source: normalizeAssistantLearningSource(learning.source)
      });
      if (isGarbageAssistantLearningSummary(parsed.summary)) {
        return undefined;
      }
      db
        .query(
          `INSERT INTO assistant_learnings (
             id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
           )
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
           ON CONFLICT(id) DO UPDATE SET
             summary = excluded.summary,
             source = excluded.source,
             confidence = excluded.confidence,
             sort_order = excluded.sort_order,
             kind = excluded.kind,
             supersedes_learning_ids_json = excluded.supersedes_learning_ids_json,
             compacted_at = excluded.compacted_at`
        )
        .run(
          parsed.id,
          parsed.assistantId,
          parsed.summary,
          parsed.source,
          parsed.confidence,
          parsed.sortOrder ?? null,
          parsed.createdAt,
          parsed.kind ?? "fact",
          parsed.supersedesLearningIds ? JSON.stringify(parsed.supersedesLearningIds) : null,
          parsed.compactedAt ?? null
        );
      operations.touchAssistant(parsed.assistantId, parsed.createdAt);
      return operations.getAssistantLearning(parsed.id);
    }
  function saveAssistantLearning(learning: AssistantLearning) {
      return db.transaction(() => saveAssistantLearningRaw(learning)).immediate();
    }
  function reorderAssistantLearnings(assistantId: string, learningIds: string[]) {
      const now = new Date().toISOString();
      db.transaction(() => {
        operations.assertAssistantExists(assistantId);
        if (learningIds.length === 0) throw new Error("Assistant learning reorder requires at least one learning ID");
        if (new Set(learningIds).size !== learningIds.length) {
          throw new Error("Assistant learning reorder contains duplicate learning IDs");
        }
        operations.assertAssistantLearningsBelongToAssistant(assistantId, learningIds);
        normalizePersistedAssistantOrder(db, "assistant_learnings", assistantId, learningIds, now);
        operations.touchAssistant(assistantId, now);
      }).immediate();
    }
  function saveAssistantLearningDedupedRaw(learning: AssistantLearning) {
      operations.assertAssistantExists(learning.assistantId);
      const parsed = assistantLearningSchema.parse({
        ...learning,
        source: normalizeAssistantLearningSource(learning.source)
      });
      if (isGarbageAssistantLearningSummary(parsed.summary)) {
        return undefined;
      }
      const { sharedPremise, duplicate } = findPagedAssistantLearningMatches((cursor) => operations.listAssistantLearnings({ assistantId: parsed.assistantId, cursor, limit: 128 }), parsed);
      if (sharedPremise) {
        const merged = mergeAssistantLearningSummaries(sharedPremise, parsed);
        if (!merged) {
          return sharedPremise;
        }
        return saveAssistantLearning(merged);
      }
      if (!duplicate) {
        return saveAssistantLearning(parsed);
      }
  
      if (isAssistantQuestionPolicyFollowup(duplicate.source, parsed.source)) {
        return saveAssistantLearning(parsed);
      }
      if (shouldSkipSimilarAssistantLearning(duplicate, parsed)) {
        return duplicate;
      }
      const shouldReplace = shouldReplaceAssistantLearning(duplicate, parsed);
      return saveAssistantLearning({
        ...duplicate,
        summary: shouldReplace ? parsed.summary : duplicate.summary,
        source: shouldReplace ? parsed.source : duplicate.source,
        confidence: strongerAssistantLearningConfidence(duplicate.confidence, parsed.confidence),
        kind: duplicate.kind ?? parsed.kind ?? "fact",
        supersedesLearningIds: mergeUniqueStrings([
          ...(duplicate.supersedesLearningIds ?? []),
          ...(parsed.supersedesLearningIds ?? [])
        ]),
        compactedAt: duplicate.compactedAt,
        createdAt: duplicate.createdAt
      });
    }
  return {
    operations: {
      saveAssistantTodo,
      appendAssistantTodo,
      updateAssistantTodo,
      reorderAssistantTodos,
      deleteAssistantTodo,
      saveAssistantLearningRaw,
      saveAssistantLearning,
      reorderAssistantLearnings,
      saveAssistantLearningDedupedRaw,
    },
    publicApi: {
      saveAssistantTodo,
      appendAssistantTodo,
      updateAssistantTodo,
      reorderAssistantTodos,
      deleteAssistantTodo,
      saveAssistantLearning,
      reorderAssistantLearnings,
    },
  };
}

export type WorkspaceAssistantsOperations6Set = ReturnType<typeof createWorkspaceAssistantsOperations6>["operations"];

export function createWorkspaceAssistantsOperations7(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet & WorkspaceAssistantReadsOperations2Set & WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceAssistantReadsOperations4Set & WorkspaceRepositoryReadsOperationsSet & WorkspaceAssistantsOperations4Set & WorkspaceAssistantsOperations5Set & WorkspaceMigrationSupportOperationsSet & WorkspaceAssistantsOperations6Set) {
  const { db } = context;
  function saveAssistantLearningDeduped(learning: AssistantLearning) { return db.transaction(() => operations.saveAssistantLearningDedupedRaw(learning)).immediate(); }
  function compactAssistantLearnings(assistantId: string, compactedLearning: AssistantLearning, supersededIds: string[]) {
      const now = compactedLearning.compactedAt ?? new Date().toISOString();
      const uniqueSupersededIds = mergeUniqueStrings(supersededIds);
      return db.transaction(() => {
        operations.assertAssistantExists(assistantId);
        const saved = saveAssistantLearningDeduped({ ...compactedLearning, assistantId, kind: "summary",
          supersedesLearningIds: uniqueSupersededIds, compactedAt: now });
        if (!saved) return undefined;
        for (const learningId of uniqueSupersededIds) {
          if (learningId === saved.id) continue;
          db
            .query(`UPDATE assistant_learnings SET compacted_at = ?3 WHERE id = ?1 AND assistant_id = ?2 AND compacted_at IS NULL`)
            .run(learningId, assistantId, now);
        }
        operations.touchAssistant(assistantId, now);
        return operations.getAssistantLearning(saved.id)!;
      }).immediate();
    }
  function deleteAssistantLearning(assistantId: string, learningId: string) {
      const now = new Date().toISOString();
      db.transaction(() => {
        operations.assertAssistantExists(assistantId);
        const deleted = db.query(`DELETE FROM assistant_learnings WHERE id = ?1 AND assistant_id = ?2`).run(learningId, assistantId);
        if (deleted.changes === 0) throw new Error("Unknown assistant learning for assistant");
        operations.touchAssistant(assistantId, now); }).immediate(); }
  function saveAssistantQuestion(question: AssistantQuestion) { return persistAssistantQuestion(db, question, {
      assertAssistantExists: (id) => operations.assertAssistantExists(id), getQuestion: (id) => operations.getAssistantQuestion(id),
      touchAssistant: (id, at) => operations.touchAssistant(id, at), syncQuestionNotifications: (id) =>
        syncAssistantQuestionNotificationsRaw(db, id, (row) => operations.hydrateAssistantQuestion(row)) }); }
  function saveAssistantQuestionIfNoPending(question: AssistantQuestion) { return db.transaction(() => operations.hasAssistantPendingQuestion(question.assistantId) ? { kind: "already-pending" as const } : { kind: "created" as const, question: saveAssistantQuestion(question) }).immediate(); }
  function dismissAssistantQuestion(assistantId: string, questionId: string) {
      const now = new Date().toISOString();
      return db.transaction(() => {
        operations.assertAssistantExists(assistantId);
        const updated = db.query(`UPDATE assistant_questions
          SET status = 'dismissed', answered_at = COALESCE(answered_at, ?3)
          WHERE id = ?1 AND assistant_id = ?2 AND status IN ('pending', 'deferred')`).run(questionId, assistantId, now);
        if (updated.changes === 0) throw new Error("Assistant question is not dismissable");
        operations.touchAssistant(assistantId, now);
        syncAssistantQuestionNotificationsRaw(db, assistantId, (row) => operations.hydrateAssistantQuestion(row));
        return operations.getAssistantQuestion(questionId)!;
      }).immediate();
    }
  function promoteDeferredAssistantQuestions() {
      return db.transaction(() => {
        const rows = db.query<{ id: string; assistant_id: string }, []>(
          `SELECT id, assistant_id FROM assistant_questions WHERE status = 'deferred' ORDER BY asked_at ASC`).all();
        db.query(`UPDATE assistant_questions SET status = 'pending' WHERE status = 'deferred'`).run();
        const now = new Date().toISOString();
        for (const assistantId of new Set(rows.map((row) => row.assistant_id))) operations.touchAssistant(assistantId, now);
        syncAssistantQuestionNotificationsRaw(db, undefined, (row) => operations.hydrateAssistantQuestion(row));
        return rows.map(({ id }) => operations.getAssistantQuestion(id)!).filter(Boolean);
      }).immediate();
    }
  function appendAssistantLogEntryRaw(entry: AssistantLogEntry) {
      operations.assertAssistantExists(entry.assistantId);
      const boundedDetails = boundAssistantLogDetailsJson(entry.detailsJson);
      db
        .query(
          `INSERT INTO assistant_log_entries (id, assistant_id, level, summary, detail, details_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .run(
          entry.id,
          entry.assistantId,
          entry.level,
          stripAnsiForStorage(entry.summary),
          entry.detail === undefined ? null : stripAnsiForStorage(entry.detail),
          boundedDetails.json,
          entry.createdAt
        );
      operations.touchAssistant(entry.assistantId, entry.createdAt);
      return operations.getAssistantLogEntry(entry.id)!;
    }
  function appendAssistantLogEntry(entry: AssistantLogEntry) {
      return db.transaction(() => appendAssistantLogEntryRaw(entry)).immediate();
    }
  function compactAssistantLearningsWithRetained(input: AssistantLearningCompactionWrite) {
      return persistAssistantLearningCompaction(db, input, { compact: (id, learning, ids) => compactAssistantLearnings(id, learning, ids),
        saveLearningDeduped: (learning) => saveAssistantLearningDeduped(learning), appendLog: (entry) => appendAssistantLogEntry(entry) });
    }
  function recordAssistantLearningCompactionFailure(input: AssistantLearningCompactionFailureWrite) {
      return persistAssistantLearningCompactionFailure(db, input, { getAssistant: (id, includeDeleted) =>
        operations.getAssistant(id, includeDeleted), appendLog: (entry) => appendAssistantLogEntry(entry) });
    }
  function applyAssistantReprioritizeMutation(assistantId: string, mutation: AssistantReprioritizeMutation) {
      return persistAssistantReprioritizeMutation(db, assistantId, mutation, { assertAssistantExists: (id) => operations.assertAssistantExists(id), saveTodo: (todo) => operations.saveAssistantTodo(todo), saveLearningDeduped: (learning) => saveAssistantLearningDeduped(learning), saveQuestion: (question) => saveAssistantQuestion(question), appendLog: (entry) => appendAssistantLogEntry(entry),
        resetFailureState: (id) => operations.updateAssistantFailureState(id, { failureStreakCount: 0, circuitBreakerState: "closed" }) }); }
  function assistantQuestionAnswerPersistence(): AssistantQuestionAnswerPersistence {
      return {
        assertAssistantExists: (id) => operations.assertAssistantExists(id), getQuestion: (id) => operations.getAssistantQuestion(id),
        getTodo: (id) => operations.getAssistantTodo(id), saveTodo: (todo) => operations.saveAssistantTodo(todo),
        appendLog: (entry) => appendAssistantLogEntry(entry), saveLearning: (learning) => operations.saveAssistantLearning(learning),
        saveLearningDeduped: (learning) => saveAssistantLearningDeduped(learning), touchAssistant: (id, at) => operations.touchAssistant(id, at),
        syncQuestionNotifications: (id) => syncAssistantQuestionNotificationsRaw(db, id, (row) => operations.hydrateAssistantQuestion(row))
      };
    }
  function answerAssistantQuestion(assistantId: string, questionId: string, answerText: string) { return persistAssistantQuestionAnswer(
      db, assistantId, questionId, answerText, assistantQuestionAnswerPersistence()); }
  function saveAssistantQuestionAnswers(assistantId: string, writes: AssistantQuestionAnswerWrite[]) { return persistAssistantQuestionAnswers(
      db, assistantId, writes, assistantQuestionAnswerPersistence()); }
  function resolveAssistantQuestionPolicy(assistantId: string, write: AssistantQuestionPolicyResolutionWrite) {
      return persistAssistantQuestionPolicyResolution(db, assistantId, write, assistantQuestionAnswerPersistence()); }
  function appendAssistantMessageRaw(
      assistantId: string,
      role: ChatRole,
      content: string,
      options: { kind?: ChatMessageKind; metadata?: ChatMessageMetadata; id?: string; createdAt?: string }
    ) {
      assertPersistableMessageContent(content); operations.assertAssistantExists(assistantId);
      const thread = operations.readAssistantThreadRowByAssistantId(assistantId);
      const createdAt = options.createdAt ?? new Date().toISOString();
      db
        .query(
          `INSERT INTO assistant_messages (id, assistant_thread_id, role, kind, content, metadata_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .run(
          options.id ?? crypto.randomUUID(),
          thread.id,
          role,
          options.kind ?? "plain",
          content,
          options.metadata ? JSON.stringify(options.metadata) : null,
          createdAt
        );
      db.query(`UPDATE assistant_threads SET updated_at = ?2 WHERE id = ?1`).run(thread.id, createdAt);
      operations.touchAssistant(assistantId, createdAt);
      return operations.getAssistantThread(assistantId)!;
    }
  return {
    operations: {
      saveAssistantLearningDeduped,
      compactAssistantLearnings,
      deleteAssistantLearning,
      saveAssistantQuestion,
      saveAssistantQuestionIfNoPending,
      dismissAssistantQuestion,
      promoteDeferredAssistantQuestions,
      appendAssistantLogEntryRaw,
      appendAssistantLogEntry,
      compactAssistantLearningsWithRetained,
      recordAssistantLearningCompactionFailure,
      applyAssistantReprioritizeMutation,
      assistantQuestionAnswerPersistence,
      answerAssistantQuestion,
      saveAssistantQuestionAnswers,
      resolveAssistantQuestionPolicy,
      appendAssistantMessageRaw,
    },
    publicApi: {
      saveAssistantLearningDeduped,
      compactAssistantLearnings,
      deleteAssistantLearning,
      saveAssistantQuestion,
      saveAssistantQuestionIfNoPending,
      dismissAssistantQuestion,
      promoteDeferredAssistantQuestions,
      appendAssistantLogEntry,
      compactAssistantLearningsWithRetained,
      recordAssistantLearningCompactionFailure,
      applyAssistantReprioritizeMutation,
      answerAssistantQuestion,
      saveAssistantQuestionAnswers,
      resolveAssistantQuestionPolicy,
    },
  };
}

export type WorkspaceAssistantsOperations7Set = ReturnType<typeof createWorkspaceAssistantsOperations7>["operations"];
