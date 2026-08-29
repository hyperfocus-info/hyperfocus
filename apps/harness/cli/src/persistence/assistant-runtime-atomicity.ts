import type { Database } from "bun:sqlite";
import { assistantsStateSchema, type Assistant, type AssistantThread, type ChatMessageKind, type ChatMessageMetadata,
  type ChatRole } from "@hyperfocus/ai-core/protocol";

type MessageOptions = { kind?: ChatMessageKind; metadata?: ChatMessageMetadata; id?: string; createdAt?: string };
export type AssistantFailureStateUpdate = { failureStreakCount: number; circuitBreakerState?: Assistant["circuitBreakerState"];
  circuitBreakerReason?: string; runState?: Assistant["runState"] };

export function appendAssistantMessageAfterLatest(input: { db: Database; assistantId: string; expectedLatestMessageId: string;
  role: ChatRole; content: string; options: MessageOptions; assertExists: () => void; readThreadId: () => string;
  append: () => AssistantThread }) {
  return input.db.transaction(() => {
    input.assertExists(); const threadId = input.readThreadId();
    const latestId = input.db.query<{ id: string }, [string]>(
      "SELECT id FROM assistant_messages WHERE assistant_thread_id = ?1 ORDER BY rowid DESC LIMIT 1").get(threadId)?.id;
    return latestId === input.expectedLatestMessageId ? input.append() : undefined;
  }).immediate();
}

export function readAllPendingBootstrapAssistants(
  readPage: (afterId: string | undefined) => { items: Assistant[]; nextCursor?: string }
) {
  const assistants: Assistant[] = []; let afterId: string | undefined;
  do { const page = readPage(afterId); assistants.push(...page.items.filter((entry) => entry.bootstrapState === "pending"));
    afterId = page.nextCursor; } while (afterId !== undefined);
  return assistants;
}

export function incrementAssistantFailure(input: { db: Database; assistantId: string; message: string;
  getAssistant: () => Assistant | undefined; updateFailureState: (state: AssistantFailureStateUpdate) => Assistant }) {
  return input.db.transaction(() => {
    const assistant = input.getAssistant(); if (!assistant) return undefined;
    const failureStreakCount = assistant.failureStreakCount + 1;
    const shouldTrip = failureStreakCount >= 3 || (assistant.circuitBreakerReason ?? "") === input.message;
    const updated = input.updateFailureState({ failureStreakCount, circuitBreakerState: shouldTrip ? "tripped" : undefined,
      circuitBreakerReason: input.message, runState: shouldTrip ? "paused" : undefined });
    return { assistant: updated, failureStreakCount, shouldTrip };
  }).immediate();
}

export function writeAssistantFailureState(input: { db: Database; assistantId: string; state: AssistantFailureStateUpdate;
  assertExists: () => void; getAssistant: () => Assistant }) {
  input.assertExists(); const now = new Date().toISOString();
  input.db.query(`UPDATE assistants SET failure_streak_count = ?2,
    circuit_breaker_state = COALESCE(?3, circuit_breaker_state), circuit_breaker_reason = ?4,
    run_state = COALESCE(?5, run_state), updated_at = ?6, latest_activity_at = ?6,
    mutation_revision = mutation_revision + 1 WHERE id = ?1`).run(input.assistantId, input.state.failureStreakCount,
      input.state.circuitBreakerState ?? null, input.state.circuitBreakerReason ?? null, input.state.runState ?? null, now);
  return input.getAssistant();
}

export function createAssistantSummaryDelta(assistants: Array<Assistant | undefined>) {
  const present = assistants.filter((assistant): assistant is Assistant => assistant !== undefined);
  const unique = [...new Map(present.map((assistant) => [assistant.id, assistant])).values()];
  return assistantsStateSchema.parse({ assistants: unique, threads: [], todos: [], learnings: [],
    questions: [], logs: [], assetRefs: [] });
}

export function createAssistantSummaryState(prune: () => void, readAssistants: () => Assistant[]) {
  prune(); return createAssistantSummaryDelta(readAssistants());
}

export function markEnabledBackgroundJobSchedulersStale(db: Database, failureMessage: string, now: string) {
  return db.query(`UPDATE background_jobs SET scheduler_status = 'stale', scheduler_detail = ?1,
    blocked_reason = ?1, last_scheduler_check_at = ?2, updated_at = ?2 WHERE status = 'enabled'`).run(failureMessage, now).changes;
}

export function readRawIdPage<Row extends { id: string }, Item>(input: { db: Database; sql: string; afterId?: string;
  limit?: number; hydrate: (row: Row) => Item | undefined }) {
  const limit = input.limit ?? 128; const rows = input.db.query<Row, [string, number]>(input.sql)
    .all(input.afterId ?? "", limit + 1); const scanned = rows.slice(0, limit);
  return { items: scanned.map(input.hydrate).filter((item): item is Item => item !== undefined),
    nextAfterId: rows.length > limit ? scanned.at(-1)?.id : undefined };
}
