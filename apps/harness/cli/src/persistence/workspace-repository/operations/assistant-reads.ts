import * as assistantPagination from "../../../assistant-pagination";
import type { Assistant, AssistantAssetRef, AssistantLearning, AssistantLogEntry, AssistantQuestion, AssistantThread, AssistantThreadMessagePage, AssistantTodo, ChatMessage } from "@hyperfocus/ai-core/protocol";
import type { AssistantAssetRefRow, AssistantLearningRow, AssistantLogEntryRow, AssistantMessageRow, AssistantQuestionRow, AssistantRow, AssistantThreadRow, AssistantTodoInput, AssistantTodoRow, WorkspaceRepositoryContext } from "../contracts";
import { ASSISTANT_DETAIL_PAGE_SIZE, assistantAssetRefSchema, assistantLearningSchema, assistantLogEntrySchema, assistantQuestionSchema, assistantSchema, assistantThreadSchema, assistantTodoSchema, CHAT_MESSAGE_CONTENT_MAX_CHARS, chatMessageSchema } from "@hyperfocus/ai-core/protocol";
import { ASSISTANT_SELECT_SQL } from "../contracts";
import { assertPersistedAssistantRowOwner } from "../../assistant-persistence";
import { isGarbageAssistantLearningSummary, normalizeAssistantLearningSource } from "../../../assistant-learning-policy";
import { normalizeAssistantTodoSource, normalizeAssistantTodoWorkKind } from "../../assistant/assistant-todo-metadata";
import { normalizeBooleanNumber, normalizeComposerReasoningStrength, normalizeInteger, normalizeOptionalString, normalizeRequiredString, normalizeRequiredTrimmedString, normalizeStringArray, parseAssistantLogDetailsSummary, parseJsonObjectOrUndefined, safeParsePersisted } from "../persisted-values";
import { parseAssistantTodoIds, parseChatMessageMetadata, parseIntentContract } from "../models";

export function createWorkspaceAssistantReadsOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function readAssistantThreadRowByAssistantId(assistantId: string) {
      const row = db
        .query<AssistantThreadRow, [string]>(
          `SELECT
            id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
           FROM assistant_threads
           WHERE assistant_id = ?1`
        )
        .get(assistantId);
      if (!row) {
        throw new Error(`Assistant ${assistantId} has no thread`);
      }
      return row;
    }
  function readAssistantMessages(threadId: string, limit: number = ASSISTANT_DETAIL_PAGE_SIZE) {
      return db
        .query<AssistantMessageRow, [string, number]>(
          `SELECT id, assistant_thread_id, role, kind, content, metadata_json, created_at
           FROM (
             SELECT id, assistant_thread_id, role, kind, content, metadata_json, created_at
             FROM assistant_messages
             WHERE assistant_thread_id = ?1 AND ${assistantPagination.assistantTimestampPageabilitySql()}
             ORDER BY created_at DESC, id DESC
             LIMIT ?2
           )
           ORDER BY created_at ASC, id ASC`
        )
        .all(threadId, assistantPagination.normalizeAssistantPageLimit(limit, ASSISTANT_DETAIL_PAGE_SIZE))
        .map((message) =>
          safeParsePersisted(
            chatMessageSchema,
            {
              id: message.id,
              role: message.role,
              kind: message.kind ?? "plain",
              content: normalizeRequiredString(message.content, CHAT_MESSAGE_CONTENT_MAX_CHARS, "Recovered assistant message"),
              metadata: parseChatMessageMetadata(message.metadata_json),
              createdAt: normalizeRequiredString(message.created_at, 256, new Date().toISOString())
            },
            { table: "assistant_messages", rowId: message.id }
          )
        )
        .filter((message): message is ChatMessage => message !== undefined);
    }
  function deleteGarbageAssistantLearnings() {
      const rows = db.query<{ id: string; summary: string }, []>(`SELECT id, summary FROM assistant_learnings`).all();
      const garbageIds = rows.filter((row) => isGarbageAssistantLearningSummary(row.summary)).map((row) => row.id);
      if (garbageIds.length === 0) {
        return;
      }
      const tx = db.transaction(() => {
        for (const id of garbageIds) {
          db.query(`DELETE FROM assistant_learnings WHERE id = ?1`).run(id);
        }
      });
      tx();
    }
  function normalizeLegacyAssistantTodoSources() {
      db.exec(
        `UPDATE assistant_todos
         SET source = 'assistant'
         WHERE source IS NOT NULL
           AND source NOT IN ('user', 'assistant', 'bootstrap', 'job', 'question')`
      );
    }
  function normalizeLegacyAssistantTodoWorkKinds() {
      db.exec(
        `UPDATE assistant_todos
         SET work_kind = 'unspecified'
         WHERE work_kind IS NULL
            OR work_kind NOT IN ('app-code', 'automation-code', 'documentation', 'research', 'blocked', 'unspecified')`
      );
    }
  function readAssistantMessagePage(
      threadId: string,
      input: { cursor?: string; limit?: number }
    ): AssistantThreadMessagePage {
      const limit = assistantPagination.normalizeAssistantPageLimit(input.limit, ASSISTANT_DETAIL_PAGE_SIZE);
      const identity = { ownerId: threadId, collection: "thread-messages" } as const;
      const page = assistantPagination.scanHydratedAssistantPage({
        limit,
        cursor: assistantPagination.decodeAssistantTimestampPageCursor(input.cursor, identity),
        readRows: (cursor, readLimit) => assistantPagination.readAssistantTimestampPageRows<AssistantMessageRow>(db,
          "SELECT id, assistant_thread_id, role, kind, content, metadata_json, created_at FROM assistant_messages",
          "assistant_thread_id", threadId, "created_at", cursor, readLimit),
        hydrate: (message: AssistantMessageRow) =>
          safeParsePersisted(
            chatMessageSchema,
            {
              id: message.id,
              role: message.role,
              kind: message.kind ?? "plain",
              content: normalizeRequiredString(message.content, CHAT_MESSAGE_CONTENT_MAX_CHARS, "Recovered assistant message"),
              metadata: parseChatMessageMetadata(message.metadata_json),
              createdAt: normalizeRequiredString(message.created_at, 256, new Date().toISOString())
            },
            { table: "assistant_messages", rowId: message.id }
          ),
        positionOf: (row: AssistantMessageRow) => ({ timestamp: row.created_at, id: row.id })
      });
      return {
        items: page.items.reverse(),
        nextCursor: page.nextPosition ? assistantPagination.encodeAssistantTimestampPageCursor(identity, page.nextPosition) : undefined,
        totalApprox:
          db
            .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_messages WHERE assistant_thread_id = ?1 AND ${assistantPagination.assistantTimestampPageabilitySql()}`)
            .get(threadId)?.count ?? 0
      };
    }
  function countActiveAssistants() {
      return db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM assistants
        WHERE deleted_at IS NULL AND ${assistantPagination.assistantTimestampPageabilitySql()}`).get()?.count ?? 0;
    }
  function countAssistantRows(
      tableName:
        | "assistant_log_entries"
        | "assistant_todos"
        | "assistant_learnings"
        | "assistant_questions",
      assistantId: string
    ) {
      switch (tableName) {
        case "assistant_learnings":
          return db
            .query<{ count: number }, [string]>(
              `SELECT COUNT(*) AS count FROM assistant_learnings WHERE assistant_id = ?1
               AND ${assistantPagination.assistantTimestampPageabilitySql()}
               AND ${assistantPagination.assistantLearningVisibilitySql()}`
            )
            .get(assistantId)?.count ?? 0;
        case "assistant_log_entries":
          return db
            .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_log_entries
              WHERE assistant_id = ?1 AND ${assistantPagination.assistantTimestampPageabilitySql()}`)
            .get(assistantId)?.count ?? 0;
        case "assistant_todos":
          return db
            .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_todos
              WHERE assistant_id = ?1 AND ${assistantPagination.assistantTodoPageabilitySql()}`)
            .get(assistantId)?.count ?? 0;
        case "assistant_questions":
          return db
            .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_questions
              WHERE assistant_id = ?1 AND ${assistantPagination.assistantTimestampPageabilitySql("asked_at")}`)
            .get(assistantId)?.count ?? 0;
      }
    }
  return {
    operations: {
      readAssistantThreadRowByAssistantId,
      readAssistantMessages,
      deleteGarbageAssistantLearnings,
      normalizeLegacyAssistantTodoSources,
      normalizeLegacyAssistantTodoWorkKinds,
      readAssistantMessagePage,
      countActiveAssistants,
      countAssistantRows,
    },
    publicApi: {
    },
  };
}

export type WorkspaceAssistantReadsOperationsSet = ReturnType<typeof createWorkspaceAssistantReadsOperations>["operations"];

export function createWorkspaceAssistantReadsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet) {
  const { db } = context;
  function hydrateAssistant(row: AssistantRow, unreadQuestionCount?: number) {
      const resolvedUnreadQuestionCount = unreadQuestionCount ??
        db
          .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_questions WHERE assistant_id = ?1
            AND status = 'pending' AND ${assistantPagination.assistantTimestampPageabilitySql("asked_at")}`)
          .get(row.id)?.count ?? 0;
      return safeParsePersisted(
        assistantSchema,
        {
        id: row.id,
        name: normalizeRequiredTrimmedString(row.name, 256, "Recovered assistant"),
        scope: row.scope,
        projectId: row.project_id ?? undefined,
        description: normalizeOptionalString(row.description, 1024),
        personalityPrompt: normalizeRequiredString(row.personality_prompt, 8000, "Recovered assistant personality."),
        jobPrompt: normalizeRequiredString(row.job_prompt, 12000, "Recovered assistant job."),
        intentContract: parseIntentContract(row.intent_contract_json),
        agentId: row.agent_id,
        providerBrand: row.provider_brand ?? undefined,
        modeId: row.mode_id ?? undefined,
        executionModelId: normalizeOptionalString(row.execution_model_id, 256),
        reasoningStrength: normalizeComposerReasoningStrength(row.reasoning_strength),
        fastMode: row.fast_mode === null ? undefined : normalizeBooleanNumber(row.fast_mode),
        runState: row.run_state,
        bootstrapState: row.bootstrap_state,
        bootstrapAttemptId: normalizeOptionalString(row.bootstrap_attempt_id, 128),
        bootstrapStartedAt: normalizeOptionalString(row.bootstrap_started_at, 256),
        bootstrapFinishedAt: normalizeOptionalString(row.bootstrap_finished_at, 256),
        clonedFromAssistantId: normalizeOptionalString(row.cloned_from_assistant_id, 128),
        failureStreakCount: normalizeInteger(row.failure_streak_count, 0, 1000, 0),
        circuitBreakerState: row.circuit_breaker_state,
        circuitBreakerReason: normalizeOptionalString(row.circuit_breaker_reason, 4000),
        deletedAt: normalizeOptionalString(row.deleted_at, 256),
        latestActivityAt: normalizeOptionalString(row.latest_activity_at, 256),
        unreadQuestionCount: normalizeInteger(resolvedUnreadQuestionCount, 0, 10000, 0),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
        },
        { table: "assistants", rowId: row.id }
      );
    }
  function readAssistants(limit: number = 512) {
      return db
        .query<AssistantRow, [number]>(
          `${ASSISTANT_SELECT_SQL}
           WHERE deleted_at IS NULL
           ORDER BY updated_at DESC, id DESC
           LIMIT ?1`
        )
        .all(assistantPagination.normalizeAssistantPageLimit(limit, 512))
        .map((row) => hydrateAssistant(row))
        .filter((assistant): assistant is Assistant => assistant !== undefined);
    }
  function hydrateAssistantThread(row: AssistantThreadRow, messageLimit: number = ASSISTANT_DETAIL_PAGE_SIZE, messagePage?: AssistantThreadMessagePage) {
      return safeParsePersisted(
        assistantThreadSchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        sessionId: row.session_id,
        messageCount: messagePage?.totalApprox ?? normalizeInteger(
            db
              .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_messages WHERE assistant_thread_id = ?1
                AND ${assistantPagination.assistantTimestampPageabilitySql()}`)
              .get(row.id)?.count ?? 0,
            0,
            100000,
            0
          ),
        memorySummary: normalizeOptionalString(row.memory_summary_content, 32000)
          ? {
              id: `${row.id}:memory`,
              scope: "thread",
              label: "Assistant memory",
              content: normalizeRequiredString(row.memory_summary_content, 32000, "Recovered assistant memory"),
              updatedAt: normalizeRequiredString(row.memory_summary_updated_at ?? row.updated_at, 256, new Date().toISOString()),
              source: "generated"
            }
          : undefined,
        messages: messagePage?.items ?? operations.readAssistantMessages(row.id, messageLimit),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
        },
        { table: "assistant_threads", rowId: row.id }
      );
    }
  function readAssistantThreads(limit: number = 512, messageLimit: number = ASSISTANT_DETAIL_PAGE_SIZE) {
      return db
        .query<AssistantThreadRow, [number]>(
          `SELECT
            id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
           FROM assistant_threads
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           ORDER BY updated_at DESC, id DESC
           LIMIT ?1`
        )
        .all(assistantPagination.normalizeAssistantPageLimit(limit, 512))
        .map((row) => hydrateAssistantThread(row, messageLimit))
        .filter((thread): thread is AssistantThread => thread !== undefined);
    }
  function hydrateAssistantTodo(row: AssistantTodoRow) {
      return safeParsePersisted(
        assistantTodoSchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        title: normalizeRequiredTrimmedString(row.title, 512, "Recovered todo"),
        description: normalizeOptionalString(row.description, 4000),
        state: row.state,
        sortOrder: normalizeInteger(row.sort_order, 0, 1000000, 0),
        blockerReason: normalizeOptionalString(row.blocker_reason, 4000),
        source: normalizeAssistantTodoSource(row.source),
        workKind: normalizeAssistantTodoWorkKind(row.work_kind),
        workTarget: normalizeOptionalString(row.work_target, 512),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString()),
        completedAt: normalizeOptionalString(row.completed_at, 256),
        cancelledAt: normalizeOptionalString(row.cancelled_at, 256)
        },
        { table: "assistant_todos", rowId: row.id }
      );
    }
  function readAssistantTodos(options: { assistantId?: string; limit?: number } = {}) {
      const limit = assistantPagination.normalizeAssistantPageLimit(options.limit, 8192);
      const rows = options.assistantId
        ? db
          .query<AssistantTodoRow, [string, number]>(
            `SELECT
              id, assistant_id, title, description, state, sort_order, blocker_reason, source,
              work_kind, work_target, created_at, updated_at, completed_at, cancelled_at
             FROM assistant_todos
             WHERE assistant_id = ?1
             ORDER BY sort_order ASC, updated_at DESC, id ASC
             LIMIT ?2`
          )
          .all(options.assistantId, limit)
        : db
          .query<AssistantTodoRow, [number]>(
          `SELECT
            id, assistant_id, title, description, state, sort_order, blocker_reason, source,
            work_kind, work_target, created_at, updated_at, completed_at, cancelled_at
           FROM assistant_todos
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           ORDER BY sort_order ASC, updated_at DESC, id ASC
           LIMIT ?1`
        )
          .all(limit);
      return rows
        .map((row) => hydrateAssistantTodo(row))
        .filter((todo): todo is AssistantTodo => todo !== undefined);
    }
  function getAssistantTodo(todoId: string) {
      const row = db
        .query<AssistantTodoRow, [string]>(
          `SELECT
            id, assistant_id, title, description, state, sort_order, blocker_reason, source,
            work_kind, work_target, created_at, updated_at, completed_at, cancelled_at
           FROM assistant_todos
           WHERE id = ?1`
        )
        .get(todoId);
      return row ? hydrateAssistantTodo(row) : undefined;
    }
  return {
    operations: {
      hydrateAssistant,
      readAssistants,
      hydrateAssistantThread,
      readAssistantThreads,
      hydrateAssistantTodo,
      readAssistantTodos,
      getAssistantTodo,
    },
    publicApi: {
    },
  };
}

export type WorkspaceAssistantReadsOperations2Set = ReturnType<typeof createWorkspaceAssistantReadsOperations2>["operations"];

export function createWorkspaceAssistantReadsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperations2Set) {
  const { db } = context;
  function saveAssistantTodoRaw(todo: AssistantTodoInput) {
      assertPersistedAssistantRowOwner(db, "assistant_todos", todo.id, todo.assistantId);
      db.query(
        `INSERT INTO assistant_todos (
          id, assistant_id, title, description, state, sort_order, blocker_reason, source,
          work_kind, work_target, created_at, updated_at, completed_at, cancelled_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, description = excluded.description, state = excluded.state,
          sort_order = excluded.sort_order, blocker_reason = excluded.blocker_reason, source = excluded.source,
          work_kind = excluded.work_kind, work_target = excluded.work_target, updated_at = excluded.updated_at,
          completed_at = excluded.completed_at, cancelled_at = excluded.cancelled_at`
      ).run(todo.id, todo.assistantId, todo.title, todo.description ?? null, todo.state, todo.sortOrder,
        todo.blockerReason ?? null, normalizeAssistantTodoSource(todo.source) ?? null,
        normalizeAssistantTodoWorkKind(todo.workKind), todo.workTarget ?? null, todo.createdAt, todo.updatedAt,
        todo.completedAt ?? null, todo.cancelledAt ?? null);
      return operations.getAssistantTodo(todo.id)!;
    }
  function hydrateAssistantLearning(row: AssistantLearningRow) {
      return safeParsePersisted(
        assistantLearningSchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        summary: normalizeRequiredString(row.summary, 4000, "Recovered learning"),
        source: normalizeAssistantLearningSource(row.source),
        confidence: row.confidence,
        sortOrder: row.sort_order === null ? undefined : normalizeInteger(row.sort_order, 0, 1000000, 0),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
        kind: row.kind ?? "fact",
        supersedesLearningIds: normalizeStringArray(row.supersedes_learning_ids_json, 512, 128),
        compactedAt: normalizeOptionalString(row.compacted_at, 256)
        },
        { table: "assistant_learnings", rowId: row.id }
      );
    }
  function readAssistantLearnings(options: { assistantId?: string; limit?: number } = {}) {
      const limit = options.limit === Infinity ? -1 : assistantPagination.normalizeAssistantPageLimit(options.limit, 8192);
      const rows = options.assistantId
        ? db
          .query<AssistantLearningRow, [string, number]>(
            `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
             FROM assistant_learnings
             WHERE assistant_id = ?1
               AND (compacted_at IS NULL OR kind = 'summary')
             ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, kind DESC, created_at DESC, id DESC
             LIMIT ?2`
          )
          .all(options.assistantId, limit)
        : db
          .query<AssistantLearningRow, [number]>(
          `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
           FROM assistant_learnings
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
             AND (compacted_at IS NULL OR kind = 'summary')
           ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, kind DESC, created_at DESC, id DESC
           LIMIT ?1`
        )
          .all(limit);
      return rows
        .map((row) => hydrateAssistantLearning(row))
        .filter((learning): learning is AssistantLearning => learning !== undefined);
    }
  function readAssistantLearningsByAssistantId(assistantId: string) {
      return readAssistantLearnings({ assistantId, limit: 8192 });
    }
  function getAssistantLearning(learningId: string) {
      const row = db
        .query<AssistantLearningRow, [string]>(
          `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
           FROM assistant_learnings
           WHERE id = ?1`
        )
        .get(learningId);
      return row ? hydrateAssistantLearning(row) : undefined;
    }
  function hydrateAssistantQuestion(row: AssistantQuestionRow) {
      return safeParsePersisted(
        assistantQuestionSchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        prompt: normalizeRequiredString(row.prompt, 8000, "Recovered question"),
        status: row.status,
        answerText: normalizeOptionalString(row.answer_text, 32000),
        linkedTodoIds: parseAssistantTodoIds(row.linked_todo_ids_json)?.slice(0, 32),
        askedAt: normalizeRequiredString(row.asked_at, 256, new Date().toISOString()),
        answeredAt: normalizeOptionalString(row.answered_at, 256)
        },
        { table: "assistant_questions", rowId: row.id }
      );
    }
  function readAssistantQuestions(options: { assistantId?: string; limit?: number } = {}) {
      const limit = assistantPagination.normalizeAssistantPageLimit(options.limit, 4096);
      const rows = options.assistantId
        ? db
          .query<AssistantQuestionRow, [string, number]>(
            `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
             FROM assistant_questions
             WHERE assistant_id = ?1
             ORDER BY asked_at DESC, id DESC
             LIMIT ?2`
          )
          .all(options.assistantId, limit)
        : db
          .query<AssistantQuestionRow, [number]>(
          `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
           FROM assistant_questions
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           ORDER BY asked_at DESC, id DESC
           LIMIT ?1`
        )
          .all(limit);
      return rows
        .map((row) => hydrateAssistantQuestion(row))
        .filter((question): question is AssistantQuestion => question !== undefined);
    }
  function getAssistantQuestion(questionId: string) {
      const row = db
        .query<AssistantQuestionRow, [string]>(
          `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
           FROM assistant_questions
           WHERE id = ?1`
        )
        .get(questionId);
      return row ? hydrateAssistantQuestion(row) : undefined;
    }
  function hydrateAssistantLogEntry(row: AssistantLogEntryRow) {
      return safeParsePersisted(
        assistantLogEntrySchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        level: row.level,
        summary: normalizeRequiredString(row.summary, 1024, "Recovered log entry"),
        detail: normalizeOptionalString(row.detail, 4000),
        detailsJson: parseJsonObjectOrUndefined(row.details_json),
        detailsJsonSummary: parseAssistantLogDetailsSummary(row.details_json),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
        },
        { table: "assistant_log_entries", rowId: row.id }
      );
    }
  return {
    operations: {
      saveAssistantTodoRaw,
      hydrateAssistantLearning,
      readAssistantLearnings,
      readAssistantLearningsByAssistantId,
      getAssistantLearning,
      hydrateAssistantQuestion,
      readAssistantQuestions,
      getAssistantQuestion,
      hydrateAssistantLogEntry,
    },
    publicApi: {
      getAssistantQuestion,
    },
  };
}

export type WorkspaceAssistantReadsOperations3Set = ReturnType<typeof createWorkspaceAssistantReadsOperations3>["operations"];

export function createWorkspaceAssistantReadsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperations3Set) {
  const { db } = context;
  function readAssistantLogEntries(options: { assistantId?: string; limit?: number } = {}) {
      const limit = assistantPagination.normalizeAssistantPageLimit(options.limit, 16384);
      const rows = options.assistantId
        ? db
          .query<AssistantLogEntryRow, [string, number]>(
            `SELECT id, assistant_id, level, summary, detail, details_json, created_at
             FROM assistant_log_entries
             WHERE assistant_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2`
          )
          .all(options.assistantId, limit)
        : db
          .query<AssistantLogEntryRow, [number]>(
          `SELECT id, assistant_id, level, summary, detail, details_json, created_at
           FROM assistant_log_entries
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           ORDER BY created_at DESC, id DESC
           LIMIT ?1`
        )
          .all(limit);
      return rows
        .map((row) => operations.hydrateAssistantLogEntry(row))
        .filter((entry): entry is AssistantLogEntry => entry !== undefined);
    }
  function getAssistantLogEntry(entryId: string) {
      const row = db
        .query<AssistantLogEntryRow, [string]>(
          `SELECT id, assistant_id, level, summary, detail, details_json, created_at
           FROM assistant_log_entries
           WHERE id = ?1`
        )
        .get(entryId);
      return row ? operations.hydrateAssistantLogEntry(row) : undefined;
    }
  function hydrateAssistantAssetRef(row: AssistantAssetRefRow) {
      return safeParsePersisted(
        assistantAssetRefSchema,
        {
        id: row.id,
        assistantId: row.assistant_id,
        kind: row.kind,
        label: normalizeRequiredString(row.label, 256, "Recovered asset"),
        value: normalizeRequiredString(row.value, 4096, "recovered"),
        canonicalValue: normalizeOptionalString(row.canonical_value, 4096),
        scope: row.scope ?? undefined,
        provenance: row.provenance ?? undefined,
        resolutionStatus: row.resolution_status ?? "resolved",
        resolutionError: normalizeOptionalString(row.resolution_error, 1024),
        createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
        },
        { table: "assistant_asset_refs", rowId: row.id }
      );
    }
  function readAssistantAssetRefs(options: { assistantId?: string; limit?: number } = {}) {
      const limit = assistantPagination.normalizeAssistantPageLimit(options.limit, 4096);
      const rows = options.assistantId
        ? db
          .query<AssistantAssetRefRow, [string, number]>(
            `SELECT
              id, assistant_id, kind, label, value, canonical_value, scope, provenance,
              resolution_status, resolution_error, created_at
             FROM assistant_asset_refs
             WHERE assistant_id = ?1
             ORDER BY created_at ASC, id ASC
             LIMIT ?2`
          )
          .all(options.assistantId, limit)
        : db
          .query<AssistantAssetRefRow, [number]>(
          `SELECT
            id, assistant_id, kind, label, value, canonical_value, scope, provenance,
            resolution_status, resolution_error, created_at
           FROM assistant_asset_refs
           WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           ORDER BY created_at ASC, id ASC
           LIMIT ?1`
        )
          .all(limit);
      return rows
        .map((row) => hydrateAssistantAssetRef(row))
        .filter((assetRef): assetRef is AssistantAssetRef => assetRef !== undefined);
    }
  return {
    operations: {
      readAssistantLogEntries,
      getAssistantLogEntry,
      hydrateAssistantAssetRef,
      readAssistantAssetRefs,
    },
    publicApi: {
    },
  };
}

export type WorkspaceAssistantReadsOperations4Set = ReturnType<typeof createWorkspaceAssistantReadsOperations4>["operations"];
