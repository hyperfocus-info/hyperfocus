import type { Database } from "bun:sqlite";
import { ASSISTANT_WORKLOAD_PAGE_SIZE } from "@hyperfocus/ai-core/protocol";
import {
  ASSISTANT_PAGE_POSITION_ID_MAX_LENGTH,
  ASSISTANT_PAGE_POSITION_TIMESTAMP_MAX_LENGTH,
  assistantLearningVisibilitySql,
  assistantTimestampPageabilitySql,
  assistantTodoPageabilitySql
} from "./persistence/assistant-pageability";
import { createPageCursorError, decodePageCursor, encodePageCursor, isPageCursorError,
  type PageCursorError } from "./persistence/page-cursor-codec";

export { assistantLearningVisibilitySql, assistantTimestampPageabilitySql, assistantTodoPageabilitySql };

export type AssistantPageCollection =
  | "summaries"
  | "jobs"
  | "runs"
  | "thread-messages"
  | "logs"
  | "todos"
  | "learnings"
  | "questions";

export type AssistantTimestampPagePosition = { timestamp: string; id: string };
export type AssistantTodoPagePosition = AssistantTimestampPagePosition & { sortOrder: number; revision: number };

type AssistantPageCursorIdentity = {
  ownerId: string;
  collection: AssistantPageCollection;
};

type HydratedPageScanOptions<Row, Item, Position> = {
  limit: number;
  cursor?: Position;
  readRows: (cursor: Position | undefined, limit: number) => Row[];
  hydrate: (row: Row) => Item | undefined;
  positionOf: (row: Row) => Position;
  minimumBatchSize?: number;
  scanMultiplier?: number;
};

type AssistantTimestampPageOptions<Row, Item> = {
  input: { cursor?: string; limit?: number };
  ownerId: string;
  collection: Exclude<AssistantPageCollection, "todos">;
  fallbackLimit: number;
  readRows: (cursor: AssistantTimestampPagePosition | undefined, limit: number) => Row[];
  hydrate: (row: Row) => Item | undefined;
  positionOf: (row: Row) => AssistantTimestampPagePosition;
};

export type AssistantPageCursorError = PageCursorError;
export function isAssistantPageCursorError(error: unknown): error is AssistantPageCursorError {
  return isPageCursorError(error);
}
function assistantPageCursorError(message: string): AssistantPageCursorError {
  return createPageCursorError(message);
}
export const BACKGROUND_JOB_SELECT_SQL = `SELECT
  id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
  intent_contract_json, lane, definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
  last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, scheduler_queue_position, scheduler_queue_reason,
  scheduler_blocked_since_at, scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at,
  scheduler_overloaded, scheduler_congestion_ratio, consecutive_failure_count, backoff_until, last_failure_category,
  last_scheduler_check_at, last_blocked_at, blocked_reason, created_at, updated_at
 FROM background_jobs`;
export const BACKGROUND_JOB_RUN_SELECT_SQL = `SELECT
  id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
  skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
  prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
  agent_id, provider_brand, planning_model_id, execution_model_id, reasoning_strength, fast_mode,
  controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
  last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
  completed_at, created_at, updated_at
 FROM background_job_runs`;

export function readHydratedRowsByIds<Row, Item>(db: Database, selectSql: string, ids: string[], hydrate: (row: Row) => Item | undefined) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  const placeholders = uniqueIds.map((_, index) => `?${index + 1}`).join(",");
  return db.query<Row, string[]>(`${selectSql} WHERE id IN (${placeholders})`).all(...uniqueIds)
    .map(hydrate).filter((item): item is Item => item !== undefined);
}

export type AssistantWorkloadPageInput = { assistantId: string; cursor?: string; limit?: number };
export type AssistantWorkloadRow = { id: string; created_at: string; updated_at: string };
export type AssistantWorkloadItem = { id: string; updatedAt: string };
export type AssistantWorkloadPage<Item> = { items: Item[]; nextCursor?: string };
export type AssistantTodoPageRow = { id: string; sort_order: number; updated_at: string };

export function listAssistantBackgroundJobsPage<Row extends AssistantWorkloadRow, Item extends AssistantWorkloadItem>(
  db: Database,
  input: AssistantWorkloadPageInput,
  hydrate: (row: Row) => Item | undefined
): AssistantWorkloadPage<Item> {
  return listAssistantWorkloadPage(db, input, hydrate, BACKGROUND_JOB_SELECT_SQL, "jobs");
}

export function listAssistantBackgroundJobRunsPage<Row extends AssistantWorkloadRow, Item extends AssistantWorkloadItem>(
  db: Database,
  input: AssistantWorkloadPageInput,
  hydrate: (row: Row) => Item | undefined
): AssistantWorkloadPage<Item> {
  return listAssistantWorkloadPage(db, input, hydrate, BACKGROUND_JOB_RUN_SELECT_SQL, "runs");
}

export function listAssistantTodoPage<Row extends AssistantTodoPageRow, Item>(
  db: Database,
  input: { assistantId: string; cursor?: string; limit?: number },
  selectSql: string,
  hydrate: (row: Row) => Item | undefined,
  fallbackLimit: number
) {
  const limit = normalizeAssistantPageLimit(input.limit, fallbackLimit);
  const identity = { ownerId: input.assistantId, collection: "todos" } as const;
  const revision = getAssistantTodoRevision(db, input.assistantId);
  const cursor = decodeAssistantTodoPageCursor(input.cursor, identity);
  if (cursor && cursor.revision !== revision) throw assistantPageCursorError("Assistant todos changed; restart pagination");
  const pageable = assistantTodoPageabilitySql();
  const page = scanHydratedAssistantPage({
    limit,
    cursor,
    readRows: (position, readLimit) => position
      ? db.query<Row, [string, number, string, string, number]>(`${selectSql} WHERE assistant_id = ?1 AND ${pageable} AND (
          sort_order > ?2 OR (sort_order = ?2 AND updated_at < ?3)
          OR (sort_order = ?2 AND updated_at = ?3 AND id > ?4))
          ORDER BY sort_order ASC, updated_at DESC, id ASC LIMIT ?5`).all(input.assistantId, position.sortOrder, position.timestamp, position.id, readLimit)
      : db.query<Row, [string, number]>(`${selectSql} WHERE assistant_id = ?1 AND ${pageable}
          ORDER BY sort_order ASC, updated_at DESC, id ASC LIMIT ?2`).all(input.assistantId, readLimit),
    hydrate,
    positionOf: (row: Row) => ({ sortOrder: row.sort_order, revision, timestamp: row.updated_at, id: row.id })
  });
  return { items: page.items, nextCursor: page.nextPosition ? encodeAssistantTodoPageCursor(identity, page.nextPosition) : undefined };
}

function getAssistantTodoRevision(db: Database, assistantId: string) {
  return db.query<{ todo_revision: number }, [string]>(`SELECT todo_revision FROM assistants WHERE id = ?1`).get(assistantId)?.todo_revision ?? 0;
}

export function listAssistantTimestampPage<Row, Item>(options: AssistantTimestampPageOptions<Row, Item>) {
  const limit = normalizeAssistantPageLimit(options.input.limit, options.fallbackLimit);
  const identity = { ownerId: options.ownerId, collection: options.collection };
  const page = scanHydratedAssistantPage({ limit,
    cursor: decodeAssistantTimestampPageCursor(options.input.cursor, identity), readRows: options.readRows,
    hydrate: options.hydrate, positionOf: options.positionOf });
  return { items: page.items,
    nextCursor: page.nextPosition ? encodeAssistantTimestampPageCursor(identity, page.nextPosition) : undefined };
}

export function listAssistantWorkloadPage<Row extends AssistantWorkloadRow, Item extends AssistantWorkloadItem>(
  db: Database,
  input: AssistantWorkloadPageInput,
  hydrate: (row: Row) => Item | undefined,
  selectSql: string,
  collection: "jobs" | "runs"
): AssistantWorkloadPage<Item> {
  const limit = normalizeAssistantPageLimit(input.limit, ASSISTANT_WORKLOAD_PAGE_SIZE);
  const identity = { ownerId: input.assistantId, collection } as const;
  const page = scanHydratedAssistantPage({
    limit,
    cursor: decodeAssistantTimestampPageCursor(input.cursor, identity),
    readRows: (cursor, readLimit) => readAssistantWorkloadRows<Row>(db, input.assistantId, selectSql, cursor, readLimit),
    hydrate,
    positionOf: (row: Row) => ({ timestamp: row.created_at, id: row.id })
  });
  return {
    items: page.items,
    nextCursor: page.nextPosition ? encodeAssistantTimestampPageCursor(identity, page.nextPosition) : undefined
  };
}

function readAssistantWorkloadRows<Row extends AssistantWorkloadRow>(
  db: Database,
  assistantId: string,
  selectSql: string,
  cursor: AssistantTimestampPagePosition | undefined,
  limit: number
) {
  // Oversized legacy keys cannot fit the bounded transport cursor. The matching
  // partial indexes exclude them without scanning an unbounded corrupt prefix.
  const pageable = assistantTimestampPageabilitySql();
  return cursor
    ? db.query<Row, [string, string, string, number]>(`${selectSql}
        WHERE assistant_id = ?1 AND ${pageable}
          AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
        ORDER BY created_at DESC, id DESC LIMIT ?4`).all(assistantId, cursor.timestamp, cursor.id, limit)
    : db.query<Row, [string, number]>(`${selectSql}
        WHERE assistant_id = ?1 AND ${pageable}
        ORDER BY created_at DESC, id DESC LIMIT ?2`).all(assistantId, limit);
}

export function readAssistantTimestampPageRows<Row>(db: Database, selectSql: string, ownerColumn: string, ownerId: string,
  timestampColumn: "created_at" | "updated_at" | "asked_at", cursor: AssistantTimestampPagePosition | undefined, limit: number, extraWhere?: string) {
  const where = `${ownerColumn} = ?1 AND ${assistantTimestampPageabilitySql(timestampColumn)}${extraWhere ? ` AND (${extraWhere})` : ""}`;
  return cursor
    ? db.query<Row, [string, string, string, number]>(`${selectSql} WHERE ${where}
        AND (${timestampColumn} < ?2 OR (${timestampColumn} = ?2 AND id < ?3))
        ORDER BY ${timestampColumn} DESC, id DESC LIMIT ?4`).all(ownerId, cursor.timestamp, cursor.id, limit)
    : db.query<Row, [string, number]>(`${selectSql} WHERE ${where} ORDER BY ${timestampColumn} DESC, id DESC LIMIT ?2`).all(ownerId, limit);
}

export function normalizeAssistantPageLimit(limit: number | undefined, fallback: number, maximum: number = 512) {
  const resolved = typeof limit === "number" && Number.isFinite(limit) ? limit : fallback;
  return Math.min(Math.max(Math.trunc(resolved), 1), maximum);
}

export function attachAssistantUnreadQuestionCounts<Item extends { id: string; unreadQuestionCount: number }>(
  db: Database,
  assistants: Item[]
) {
  if (assistants.length === 0) return assistants;
  const rows = db
    .query<{ assistant_id: string; count: number }, [string]>(
      `SELECT assistant_id, COUNT(*) AS count FROM assistant_questions
       WHERE status = 'pending' AND ${assistantTimestampPageabilitySql("asked_at")}
         AND assistant_id IN (SELECT value FROM json_each(?1))
       GROUP BY assistant_id`
    )
    .all(JSON.stringify(assistants.map((assistant) => assistant.id)));
  const counts = new Map(rows.map((row) => [row.assistant_id, Math.min(Math.max(Math.trunc(row.count), 0), 10000)]));
  return assistants.map((assistant) => ({ ...assistant, unreadQuestionCount: counts.get(assistant.id) ?? 0 }));
}

export function encodeAssistantTimestampPageCursor(
  identity: AssistantPageCursorIdentity,
  position: AssistantTimestampPagePosition
) {
  return encodeAssistantPageCursor(identity, position, parseAssistantTimestampPagePosition);
}

export function decodeAssistantTimestampPageCursor(
  encoded: string | undefined,
  identity: AssistantPageCursorIdentity
): AssistantTimestampPagePosition | undefined {
  return decodeAssistantPageCursor(encoded, identity, parseAssistantTimestampPagePosition);
}

export function encodeAssistantTodoPageCursor(identity: AssistantPageCursorIdentity, position: AssistantTodoPagePosition) {
  return encodeAssistantPageCursor(identity, position, parseAssistantTodoPagePosition);
}

export function decodeAssistantTodoPageCursor(
  encoded: string | undefined,
  identity: AssistantPageCursorIdentity
): AssistantTodoPagePosition | undefined {
  return decodeAssistantPageCursor(encoded, identity, parseAssistantTodoPagePosition);
}

export function scanHydratedAssistantPage<Row, Item, Position>(options: HydratedPageScanOptions<Row, Item, Position>) {
  const scanLimit = options.limit * (options.scanMultiplier ?? 10);
  const valid: Array<{ item: Item; row: Row }> = [];
  let cursor = options.cursor;
  let scanned = 0;
  let hasMoreRows = false;
  let lastScanned: Row | undefined;

  while (valid.length <= options.limit && scanned < scanLimit) {
    const batchSize = Math.min(
      Math.max(options.limit + 1, options.minimumBatchSize ?? 60),
      scanLimit - scanned
    );
    const rows = options.readRows(cursor, batchSize + 1);
    const batch = rows.slice(0, batchSize);
    hasMoreRows = rows.length > batchSize;
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      lastScanned = row;
      const item = options.hydrate(row);
      if (item !== undefined) valid.push({ item, row });
      if (valid.length > options.limit) break;
    }
    if (valid.length > options.limit || !hasMoreRows) break;
    cursor = lastScanned === undefined ? cursor : options.positionOf(lastScanned);
  }

  const nextBoundary = valid.length > options.limit ? valid[options.limit - 1]?.row : hasMoreRows ? lastScanned : undefined;
  return {
    items: valid.slice(0, options.limit).map(({ item }) => item),
    nextPosition: nextBoundary === undefined ? undefined : options.positionOf(nextBoundary)
  };
}

function encodeAssistantPageCursor<Position>(
  identity: AssistantPageCursorIdentity,
  position: Position,
  parsePosition: (value: unknown) => Position | undefined
) {
  if (parsePosition(position) === undefined) {
    throw new Error("Cannot encode invalid page cursor position");
  }
  return encodePageCursor({ identity: { scope: "assistant-page", ...identity }, position, format: "json" });
}

function decodeAssistantPageCursor<Position>(
  encoded: string | undefined,
  identity: AssistantPageCursorIdentity,
  parsePosition: (value: unknown) => Position | undefined
): Position | undefined {
  let decoded: unknown;
  try { decoded = decodePageCursor({ encoded, identity: { scope: "assistant-page", ...identity }, format: "json" }); }
  catch (error) {
    if (isPageCursorError(error) && error.message === "Invalid or stale page cursor") {
      throw assistantPageCursorError("Invalid page cursor");
    }
    throw error;
  }
  if (decoded === undefined) return undefined;
  const position = parsePosition(decoded);
  if (position === undefined) throw assistantPageCursorError("Invalid page cursor position");
  return position;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssistantTimestampPagePosition(position: unknown): AssistantTimestampPagePosition | undefined {
  if (
    !isRecord(position) ||
    typeof position.timestamp !== "string" ||
    position.timestamp.length > ASSISTANT_PAGE_POSITION_TIMESTAMP_MAX_LENGTH ||
    typeof position.id !== "string" ||
    position.id.length > ASSISTANT_PAGE_POSITION_ID_MAX_LENGTH
  ) {
    return undefined;
  }
  // Empty raw keys remain valid cursor boundaries so legacy/corrupt rows cannot
  // trap every later valid row behind an unpageable boundary.
  return { timestamp: position.timestamp, id: position.id };
}

function parseAssistantTodoPagePosition(position: unknown): AssistantTodoPagePosition | undefined {
  if (
    !isRecord(position) ||
    typeof position.sortOrder !== "number" ||
    !Number.isFinite(position.sortOrder) ||
    typeof position.revision !== "number" ||
    !Number.isSafeInteger(position.revision) ||
    position.revision < 0 ||
    typeof position.timestamp !== "string" ||
    position.timestamp.length > ASSISTANT_PAGE_POSITION_TIMESTAMP_MAX_LENGTH ||
    typeof position.id !== "string" ||
    position.id.length > ASSISTANT_PAGE_POSITION_ID_MAX_LENGTH
  ) {
    return undefined;
  }
  return { sortOrder: position.sortOrder, revision: position.revision, timestamp: position.timestamp, id: position.id };
}
