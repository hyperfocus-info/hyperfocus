import type { Database } from "bun:sqlite";
import type {
  AssistantQuestion,
  AssistantQuestionBatchNotification,
  AssistantQuestionNotification,
  AssistantQuestionStatus,
  NotificationInboxItem
} from "@hyperfocus/ai-core/protocol";
import {
  createAssistantQuestionBatchNotificationId,
  createAssistantQuestionNotificationId
} from "../notification-ids";

export type PersistedAssistantQuestionRow = {
  id: string; assistant_id: string; prompt: string; status: AssistantQuestionStatus; answer_text: string | null;
  linked_todo_ids_json: string | null; asked_at: string; answered_at: string | null;
};

export function ensureNotificationRevisionTriggers(db: Database) {
  for (const operation of ["INSERT", "UPDATE", "DELETE"]) db.run(`CREATE TRIGGER IF NOT EXISTS
    notifications_revision_${operation.toLowerCase()} AFTER ${operation} ON notifications BEGIN
    INSERT INTO workspace_meta(key, value) VALUES ('notification_revision', lower(hex(randomblob(16))))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value; END`);
}

export function syncAssistantQuestionNotificationsRaw(
  db: Database,
  assistantId: string | undefined,
  hydrateQuestion: (row: PersistedAssistantQuestionRow) => AssistantQuestion | undefined
) {
  const rows = assistantId
    ? db.query<PersistedAssistantQuestionRow, [string]>(`${QUESTION_SELECT_SQL}
        WHERE assistant_id = ?1 AND status IN ('pending', 'deferred')
          AND assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
        ORDER BY asked_at DESC, id DESC`).all(assistantId)
    : db.query<PersistedAssistantQuestionRow, []>(`${QUESTION_SELECT_SQL}
        WHERE status IN ('pending', 'deferred')
          AND assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
        ORDER BY assistant_id ASC, asked_at DESC, id DESC`).all();
  const questionsByAssistant = new Map<string, AssistantQuestion[]>();
  for (const row of rows) {
    const question = hydrateQuestion(row);
    if (question) questionsByAssistant.set(question.assistantId,
      [...(questionsByAssistant.get(question.assistantId) ?? []), question]);
  }
  const assistantIds = assistantId ? [assistantId] : [...new Set([
    ...questionsByAssistant.keys(),
    ...db.query<{ assistant_id: string }, []>(
      `SELECT DISTINCT assistant_id FROM notifications
       WHERE assistant_id IS NOT NULL AND kind IN ('assistant-question', 'assistant-question-batch') AND archived_at IS NULL`
    ).all().map((row) => row.assistant_id)
  ])];
  const now = new Date().toISOString();
  for (const ownerId of assistantIds) {
    const questions = questionsByAssistant.get(ownerId) ?? [];
    const notification = questions.length === 1 ? createQuestionNotification(questions[0]!)
      : questions.length > 1 ? createQuestionBatchNotification(questions) : undefined;
    if (notification) saveNotificationRaw(db, notification);
    db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, ?2), archived_at = COALESCE(archived_at, ?2)
       WHERE assistant_id = ?1 AND kind IN ('assistant-question', 'assistant-question-batch')
         AND archived_at IS NULL AND id NOT IN (SELECT value FROM json_each(?3))`
    ).run(ownerId, now, JSON.stringify(notification ? [notification.id] : []));
  }
}

export function saveNotificationRaw(db: Database, item: NotificationInboxItem) {
  db.query(
    `INSERT INTO notifications (
      id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id, session_id, tool_call_id,
      background_run_id, job_id, payload_json, created_at, read_at, archived_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, interactive = excluded.interactive,
      project_id = excluded.project_id, thread_id = excluded.thread_id, run_id = excluded.run_id,
      assistant_id = excluded.assistant_id, question_id = excluded.question_id, session_id = excluded.session_id,
      tool_call_id = excluded.tool_call_id, background_run_id = excluded.background_run_id, job_id = excluded.job_id,
      payload_json = excluded.payload_json, created_at = excluded.created_at,
      read_at = CASE WHEN notifications.created_at = excluded.created_at THEN COALESCE(notifications.read_at, excluded.read_at) ELSE excluded.read_at END,
      archived_at = CASE WHEN notifications.created_at = excluded.created_at THEN COALESCE(notifications.archived_at, excluded.archived_at) ELSE excluded.archived_at END`
  ).run(item.id, item.kind, item.interactive ? 1 : 0,
    "projectId" in item ? item.projectId : null, "threadId" in item ? item.threadId : null,
    "runId" in item ? item.runId : null, "assistantId" in item ? item.assistantId : null,
    "questionId" in item ? item.questionId : null, "sessionId" in item ? item.sessionId : null,
    "toolCallId" in item ? item.toolCallId : null, "backgroundRunId" in item ? item.backgroundRunId : null,
    "jobId" in item ? item.jobId : null, JSON.stringify(item), item.createdAt, item.readAt ?? null, item.archivedAt ?? null);
}

const QUESTION_SELECT_SQL = `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
  FROM assistant_questions`;

function createQuestionNotification(question: AssistantQuestion): AssistantQuestionNotification {
  return { id: createAssistantQuestionNotificationId(question.assistantId, question.id),
    kind: "assistant-question", interactive: true, createdAt: question.askedAt,
    assistantId: question.assistantId, questionId: question.id, prompt: question.prompt, answerText: question.answerText };
}

function createQuestionBatchNotification(questions: AssistantQuestion[]): AssistantQuestionBatchNotification {
  const assistantId = questions[0]!.assistantId;
  return { id: createAssistantQuestionBatchNotificationId(assistantId, questions.map((question) => question.id)),
    kind: "assistant-question-batch", interactive: true, createdAt: questions[0]!.askedAt, assistantId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id, prompt: question.prompt, answerText: question.answerText
    })) };
}
