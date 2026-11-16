import { aiEvidenceDigest, aiEvidenceStatus, validAiReceipt, readAiHistoryEntry, type AiIngestionReceipt } from '@hyperfocus/touch-of-death/telemetry/ingestion';
import type { AiHistoryEntry } from './archive.ts';

function readStoredEntries(value: unknown) {
  if (!Array.isArray(value)) throw Error('AI history database returned an invalid collection.');
  return value.flatMap(value => { try { return [readAiHistoryEntry(value)]; } catch { return []; } });
}

export const aiDatabaseRetention = { sessions: 8, contentIdentities: 3, utf8Bytes: 1048576 };
/** Host-only ingestion store. Writes occur at match boundaries/export, never in simulation. */
export function createAiObservationDatabase(options: { factory: IDBFactory }) {
  let queue = Promise.resolve(), error = '', suspended = false;
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = options.factory.open('touch-of-death-ai-observations', 2);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions', { keyPath: ['identity', 'session'] }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('AI history database is blocked by another tab.'));
  });
  // Attach rejection immediately, including when no observations have arrived yet.
  void opened.catch(() => { error = 'AI database unavailable. Local recovery history remains exportable.'; });
  function change(entries: readonly AiHistoryEntry[], clear = false) {
    queue = queue.then(async () => {
      const db = await opened;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('sessions', 'readwrite'), store = transaction.objectStore('sessions');
        transaction.oncomplete = () => resolve();transaction.onerror = () => reject(transaction.error);transaction.onabort = () => reject(transaction.error);
        if (clear) { store.clear();return; }
        const request = store.getAll();
        request.onsuccess = () => {
          const merged = new Map<string, AiHistoryEntry>();
          for (const entry of [...readStoredEntries(request.result), ...entries.map(readAiHistoryEntry)]) {
            const key = JSON.stringify([entry.identity, entry.session]), previous = merged.get(key);
            if (!previous || previous.updated <= entry.updated) merged.set(key, { ...entry, ...(entry.receipt || previous?.receipt ? { receipt: (previous?.receipt?.ingestedAt ?? 0) > (entry.receipt?.ingestedAt ?? 0) ? previous?.receipt : entry.receipt ?? previous?.receipt } : {}) });
          }
          const kept = [...merged.values()].sort((a, b) => a.updated - b.updated || a.session.localeCompare(b.session));
          while (kept.length > 8 || new Set(kept.map(entry => entry.identity)).size > 3 || new TextEncoder().encode(JSON.stringify(kept)).byteLength > 1048576) kept.shift();
          store.clear();for (const entry of kept) store.put(entry);
        };
      });
      error = '';
    }).catch(() => { error = 'AI database write failed. Local recovery history remains exportable.'; });
    return queue;
  }
  return {
    get status() { return error || (suspended ? 'AI history cleared. Saving resumes next match or launch.' : 'AI observations saved in this device’s database. No uploads.'); },
    get failed() { return !!error; },
    save(entries: readonly AiHistoryEntry[]) { return suspended ? queue : change(entries); },
    clear() { suspended = true;return change([], true); },
    resume() { suspended = false; },
    async query(options: { identity?: string; since?: number; limit?: number } = {}) {
      await queue;
      const db = await opened;
      const entries = await new Promise<AiHistoryEntry[]>((resolve, reject) => {
        const request = db.transaction('sessions').objectStore('sessions').getAll();
        request.onsuccess = () => { try { resolve(readStoredEntries(request.result)); } catch (error) { reject(error); } };request.onerror = () => reject(request.error);
      });
      return Promise.all(entries.filter(entry => (!options.identity || entry.identity === options.identity) && entry.updated >= (options.since ?? 0))
        .sort((a, b) => b.updated - a.updated || a.session.localeCompare(b.session)).slice(0, Math.max(0, Math.min(8, options.limit ?? 8))).map(aiEvidenceStatus));
    },
    async ingest(receipts: readonly AiIngestionReceipt[]) {
      let accepted = 0;
      queue = queue.then(async () => {
        const db = await opened;
        const entries = await new Promise<AiHistoryEntry[]>((resolve, reject) => {
          const request = db.transaction('sessions').objectStore('sessions').getAll();
          request.onsuccess = () => { try { resolve(readStoredEntries(request.result)); } catch (error) { reject(error); } };request.onerror = () => reject(request.error);
        });
        const matched: AiHistoryEntry[] = [];
        for (const entry of entries) {
          const digest = await aiEvidenceDigest(entry);
          const receipt = receipts.find(row => validAiReceipt(row) && row.identity === entry.identity && row.session === entry.session && row.digest === digest);
          if (receipt) matched.push({ ...entry, receipt: structuredClone(receipt) });
        }
        if (!matched.length) return;
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('sessions', 'readwrite'), store = transaction.objectStore('sessions');
          transaction.oncomplete = () => resolve();transaction.onerror = () => reject(transaction.error);transaction.onabort = () => reject(transaction.error);
          for (const entry of matched) store.put(entry);
        });
        accepted = matched.length;
      }).catch(() => { error = 'Ingestion receipt could not be saved. Export the receipt and try again.'; });
      await queue;return accepted;
    },
    async close() { await queue;try { (await opened).close(); } catch { /* Failure already surfaced in status. */ } },
  };
}
