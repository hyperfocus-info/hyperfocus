import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { RUN_DETAIL_CHUNK_MAX_BYTES, RUN_DETAIL_MAX_BYTES, type AgentRunState } from "@hyperfocus/ai-core/protocol";
import { createPageCursorError, decodePageCursor, encodePageCursor, isPageCursorError } from "./page-cursor-codec";
import { workspaceProjectIncarnationSql, workspaceRunIncarnationSql, workspaceThreadIncarnationSql } from "./workspace-page-revisions";

const CHUNK_BYTES = RUN_DETAIL_CHUNK_MAX_BYTES, MAX_ENTRIES = 32, MAX_CACHE_BYTES = 134217728, TTL_MS = 300000;
type Snapshot = { owner: string; incarnation: string; revision: string; serialized: string; bytes: number; touchedAt: number };

export function readRunDetailOwnerIncarnation(db: Database, projectId: string, threadId: string, runId: string) {
  const row = db.query<{ project_token: string; thread_token: string; run_token: string }, [string, string, string]>(
    `SELECT ${workspaceProjectIncarnationSql(3)} AS project_token, ${workspaceThreadIncarnationSql(2)} AS thread_token,
      ${workspaceRunIncarnationSql(1)} AS run_token FROM agent_runs JOIN project_threads ON project_threads.id = agent_runs.thread_id
    JOIN projects ON projects.id = agent_runs.project_id WHERE agent_runs.id = ?1 AND agent_runs.thread_id = ?2
    AND agent_runs.project_id = ?3 AND project_threads.project_id = projects.id`).get(runId, threadId, projectId);
  return row?.project_token && row.thread_token && row.run_token
    ? `${row.project_token}:${row.thread_token}:${row.run_token}` : undefined;
}

export function createRunDetailSnapshotStore(options: { maxCacheBytes?: number } = {}) {
  const maxCacheBytes = options.maxCacheBytes ?? MAX_CACHE_BYTES;
  const snapshots = new Map<string, Snapshot>(); let cachedBytes = 0;
  function page(owner: string, input: { cursor?: string; limit?: number }, load: () => AgentRunState,
    readOwnerIncarnation: () => string | undefined = () => "unscoped") {
    const now = Date.now(); prune(now);
    const continuing = Boolean(input.cursor && input.cursor !== "__start__");
    const incarnation = readOwnerIncarnation(); if (!incarnation) throw createPageCursorError();
    const snapshot = continuing ? find(owner, incarnation, input.cursor ?? "", now) : create(owner, incarnation, load(), now);
    const identity = { scope: "run-detail", kind: "chunks", owner, incarnation, revision: snapshot.revision };
    const position = decodePageCursor({ encoded: input.cursor, startToken: "__start__", identity });
    const offset = position === undefined ? 0 : Array.isArray(position) && Number.isInteger(position[0]) ? Number(position[0]) : -1;
    if (offset < 0 || offset > snapshot.serialized.length || isLowSurrogate(snapshot.serialized.charCodeAt(offset)))
      throw createPageCursorError();
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 128), 1), 128);
    const { items, nextOffset } = splitUtf8Page(snapshot.serialized, offset, limit);
    return { items, nextCursor: nextOffset < snapshot.serialized.length
      ? encodePageCursor({ identity, position: [nextOffset] }) : undefined,
      totalApprox: Math.ceil(snapshot.bytes / CHUNK_BYTES) };
  }

  function create(owner: string, incarnation: string, run: AgentRunState, now: number) {
    const serialized = JSON.stringify({ ...run, detailState: "complete" }), bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > RUN_DETAIL_MAX_BYTES) throw new Error(`Run detail exceeds ${RUN_DETAIL_MAX_BYTES} byte limit`);
    const revision = createHash("sha256").update(serialized).digest("base64url");
    const key = `${owner}:${incarnation}:${revision}`, existing = snapshots.get(key);
    if (existing) { existing.touchedAt = now; snapshots.delete(key); snapshots.set(key, existing); return existing; }
    const snapshot = { owner, incarnation, revision, serialized, bytes, touchedAt: now };
    snapshots.set(key, snapshot); cachedBytes += bytes; prune(now);
    return snapshot;
  }

  function find(owner: string, incarnation: string, cursor: string, now: number) {
    for (const [key, snapshot] of snapshots) {
      if (snapshot.owner !== owner || snapshot.incarnation !== incarnation) continue;
      try {
        decodePageCursor({ encoded: cursor, identity: { scope: "run-detail", kind: "chunks", owner, incarnation,
          revision: snapshot.revision } });
        snapshot.touchedAt = now; snapshots.delete(key); snapshots.set(key, snapshot); return snapshot;
      } catch (error) { if (!isPageCursorError(error)) throw error; }
    }
    throw createPageCursorError();
  }

  function prune(now: number) {
    for (const [key, snapshot] of snapshots) if (now - snapshot.touchedAt > TTL_MS) remove(key, snapshot);
    while (snapshots.size > MAX_ENTRIES || cachedBytes > maxCacheBytes) {
      const oldest = snapshots.entries().next();
      if (oldest.done) break; remove(oldest.value[0], oldest.value[1]);
    }
  }

  function remove(key: string, snapshot: Snapshot) { snapshots.delete(key); cachedBytes -= snapshot.bytes; }
  function clear() { snapshots.clear(); cachedBytes = 0; }
  return { page, clear };
}

export function readRunDetailPage(db: Database, store: ReturnType<typeof createRunDetailSnapshotStore>,
  input: { projectId: string; threadId: string; runId: string; cursor?: string; limit?: number }, loadRun: () => AgentRunState) {
  const owner = `${input.projectId}:${input.threadId}:${input.runId}`, continuing = Boolean(input.cursor && input.cursor !== "__start__");
  if (continuing) {
    const incarnation = db.transaction(() => readRunDetailOwnerIncarnation(db, input.projectId, input.threadId, input.runId))();
    return store.page(owner, input, loadRun, () => incarnation);
  }
  const captured = db.transaction(() => ({ run: loadRun(),
    incarnation: readRunDetailOwnerIncarnation(db, input.projectId, input.threadId, input.runId) })).immediate();
  return store.page(owner, input, () => captured.run, () => captured.incarnation);
}

function splitUtf8Page(value: string, offset: number, limit: number) {
  const encoder = new TextEncoder(), items: string[] = [];
  while (offset < value.length && items.length < limit) {
    let low = offset + 1, high = Math.min(value.length, offset + CHUNK_BYTES), end = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), boundary = isLowSurrogate(value.charCodeAt(middle)) ? middle - 1 : middle;
      if (encoder.encode(value.slice(offset, boundary)).byteLength <= CHUNK_BYTES) { end = boundary; low = middle + 1; }
      else high = middle - 1;
    }
    items.push(value.slice(offset, end)); offset = end;
  }
  return { items, nextOffset: offset };
}

function isLowSurrogate(code: number) { return code >= 0xdc00 && code <= 0xdfff; }
