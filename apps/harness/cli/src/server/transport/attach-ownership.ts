const DEFAULT_ATTACH_TOKEN_CAP = 256;
const MAX_ATTACH_GAP_BYTES = 2_000_000;
const MAX_ATTACH_REPLAY_BYTES = 8388608;
const ATTACH_REPLAY_CHUNK_BYTES = 65536;
const MAX_ATTACH_ATTEMPTS = 256;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createAttachTokenStore<T extends { token: string; clientId: string; expiresAt: string }>(onRemove?: (record: T) => void, cap = DEFAULT_ATTACH_TOKEN_CAP) {
  const records = new Map<string, T>();
  const remove = (token: string) => { const record = records.get(token); if (record) onRemove?.(record); records.delete(token); };
  const prune = () => { const now = Date.now(); for (const [token, record] of records) if (Date.parse(record.expiresAt) < now) remove(token); };
  return {
    issue(record: T) { prune(); records.set(record.token, record); prune(); while (records.size > cap) remove(records.keys().next().value!); },
    consume(token: string, clientId: string) {
      prune(); const record = records.get(token);
      if (!record || record.clientId !== clientId) { if (record) remove(token); return undefined; }
      records.delete(token); return record;
    },
    invalidateClient(clientId: string) { prune(); for (const [token, record] of records) if (record.clientId === clientId) remove(token); }
  };
}

export function createTerminalAttachReplay() {
  const attempts = new Map<string, { sessionId: string; expiresAt: string; offset: number; unavailable?: true }>();
  const logs = new Map<string, { chunks: Uint8Array[]; byteLength: number }>();
  let retainedBytes = 0;
  const discardSession = (sessionId: string) => {
    const log = logs.get(sessionId);
    if (log) retainedBytes -= log.byteLength;
    logs.delete(sessionId);
    for (const attempt of attempts.values()) if (attempt.sessionId === sessionId) attempt.unavailable = true;
  };
  const prune = () => {
    const now = Date.now();
    for (const [ownerId, attempt] of attempts) if (Date.parse(attempt.expiresAt) < now) attempts.delete(ownerId);
    for (const sessionId of logs.keys()) if (![...attempts.values()].some((attempt) => attempt.sessionId === sessionId)) {
      const log = logs.get(sessionId); if (log) retainedBytes -= log.byteLength; logs.delete(sessionId);
    }
  };
  return {
    register(ownerId: string, sessionId: string, expiresAt: string) {
      prune(); const log = logs.get(sessionId); attempts.set(ownerId, { sessionId, expiresAt, offset: log?.byteLength ?? 0 });
      while (attempts.size > MAX_ATTACH_ATTEMPTS) attempts.delete(attempts.keys().next().value!);
    },
    appended(sessionId: string, text: string) {
      prune(); if (![...attempts.values()].some((attempt) => attempt.sessionId === sessionId)) return;
      const incoming = encoder.encode(text), previous = logs.get(sessionId) ?? { chunks: [], byteLength: 0 };
      if (previous.byteLength + incoming.byteLength > MAX_ATTACH_GAP_BYTES) { discardSession(sessionId); return; }
      appendRetainedChunks(previous.chunks, incoming);
      const next = { chunks: previous.chunks, byteLength: previous.byteLength + incoming.byteLength };
      retainedBytes += incoming.byteLength; logs.delete(sessionId); logs.set(sessionId, next);
      while (retainedBytes > MAX_ATTACH_REPLAY_BYTES && logs.size > 0) discardSession(logs.keys().next().value!);
    },
    take(ownerId: string) {
      prune(); const attempt = attempts.get(ownerId); attempts.delete(ownerId);
      const gap = attempt?.unavailable ? undefined : attempt ? decodeTail(logs.get(attempt.sessionId), attempt.offset) : undefined;
      prune(); return gap;
    },
    retainedChunkCount(sessionId: string) { return logs.get(sessionId)?.chunks.length ?? 0; },
    revoke(ownerId: string) { attempts.delete(ownerId); prune(); }
  };
}

function decodeTail(log: { chunks: Uint8Array[]; byteLength: number } | undefined, offset: number) {
  if (!log) return "";
  const tail = new Uint8Array(Math.max(0, log.byteLength - offset)); let sourceOffset = 0, targetOffset = 0;
  for (const chunk of log.chunks) {
    const start = Math.max(0, offset - sourceOffset), part = chunk.subarray(start);
    if (part.byteLength > 0) { tail.set(part, targetOffset); targetOffset += part.byteLength; }
    sourceOffset += chunk.byteLength;
  }
  return decoder.decode(tail);
}

function appendRetainedChunks(chunks: Uint8Array[], incoming: Uint8Array) {
  let offset = 0, last = chunks.at(-1);
  if (last && last.byteLength < ATTACH_REPLAY_CHUNK_BYTES) {
    const take = Math.min(ATTACH_REPLAY_CHUNK_BYTES - last.byteLength, incoming.byteLength);
    const merged = new Uint8Array(last.byteLength + take); merged.set(last); merged.set(incoming.subarray(0, take), last.byteLength);
    chunks[chunks.length - 1] = merged; offset = take;
  }
  while (offset < incoming.byteLength) {
    const end = Math.min(incoming.byteLength, offset + ATTACH_REPLAY_CHUNK_BYTES);
    chunks.push(incoming.slice(offset, end)); offset = end;
  }
}

export type TerminalAttachReplay = ReturnType<typeof createTerminalAttachReplay>;
