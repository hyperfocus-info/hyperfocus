import { aiEvidenceDigest, validAiReceipt, readAiHistoryEntry, readAiObservationReport as readReport, type AiIngestionReceipt, type AiMatchContext } from '@hyperfocus/touch-of-death/telemetry/ingestion';
import type { AiObservationReport, AiHistoryEntry } from '@hyperfocus/touch-of-death/telemetry/ingestion';
export type { AiObservationReport, AiHistoryEntry } from '@hyperfocus/touch-of-death/telemetry/ingestion';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'touch-of-death:ai-observations:v1', limit = 1048576;
const utf8 = new TextEncoder();
export function readAiObservationReport(value: unknown) {
  try { return readReport(value); } catch { return undefined; }
}

/** Low-frequency host storage; never enters simulation state or the AI policy.
 * Identity is content + page/match session. Resume changes only the active session;
 * pending digests must still name a retained entry before they can write receipts. */
export function createAiObservationArchive(options: { identity: string; storage?: Storage; session: string; now?: () => number }) {
  let entries: AiHistoryEntry[] = [], error = '', suspended = false;
  let session = options.session;
  try {
    const raw = options.storage?.getItem(key);
    if (raw) {
      if (utf8.encode(raw).byteLength > limit) throw Error('Saved history exceeds its size limit.');
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data) || data.length > 8) throw Error('Saved history is unreadable.');
      entries = data.map(readAiHistoryEntry);
    }
  } catch { error = 'Saved AI history could not be read. Export this session or clear saved history to recover.'; }
  function persist() {
    if (!options.storage) { error = 'Local storage is unavailable. Export keeps a copy of this session.';return; }
    try { options.storage.setItem(key, JSON.stringify(entries));error = ''; }
    catch { error = 'AI history could not be saved. Export keeps a copy; clear saved history to free space.'; }
  }
  return {
    get failed() { return !!error; },
    get status() { return error || (suspended ? 'Saved history cleared. Automatic saving resumes next match or launch.' : `${entries.length} saved sessions on this device. No uploads or automatic AI changes.`); },
    save(report: AiObservationReport | undefined, context?: AiMatchContext) {
      if (suspended || !report || report.source !== 'live' || !report.observedTicks && !report.segments.length) return;
      const next: AiHistoryEntry = { identity: options.identity, session, updated: (options.now ?? Date.now)(), report: structuredClone(report), ...(context ? { context: structuredClone(context) } : {}) };
      const previous = entries.find(entry => entry.session === session && entry.identity === options.identity);
      if (previous?.receipt) next.receipt = previous.receipt;
      entries = entries.filter(entry => entry.session !== session || entry.identity !== options.identity);
      entries.push(next);
      while (entries.length > 8 || new Set(entries.map(entry => entry.identity)).size > 3 || utf8.encode(JSON.stringify(entries)).byteLength > limit) entries.shift();
      persist();
    },
    read() { return structuredClone(entries); },
    async ingest(receipts: readonly AiIngestionReceipt[]) {
      let accepted = 0;
      for (const entry of entries) {
        const digest = await aiEvidenceDigest(entry);
        const receipt = receipts.find(row => validAiReceipt(row) && row.identity === entry.identity && row.session === entry.session && row.digest === digest);
        if (receipt && entries.includes(entry)) { entry.receipt = structuredClone(receipt);accepted++; }
      }
      if (accepted) persist();return accepted;
    },
    resume(nextSession: string) { session = nextSession;suspended = false; },
    clear() {
      entries = [];suspended = true;
      try { options.storage?.removeItem(key);error = ''; }
      catch { error = 'Browser storage denied deletion. Clear site data in browser settings; this session will not save again.'; }
    },
  };
}
