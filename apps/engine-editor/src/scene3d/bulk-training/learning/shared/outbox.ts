import type { PolicyBackend } from '../backend.ts';
import { readPolicyRecord } from '@hyperfocus/touch-of-death/learning/records';
import { readSharedPolicy, type SharedCandidate, type SharedPolicy } from './protocol.ts';

export function createSharedOutbox(options: { identity: string; origin: string; backend: PolicyBackend }) {
  const key = `shared:${options.origin}:${options.identity}`;
  function decode(raw: unknown) {
    let value: { version: 1; shared?: SharedPolicy; fetchedAt: number; nextUploadAt: number; pending: SharedCandidate[] } = { version: 1, fetchedAt: 0, nextUploadAt: 0, pending: [] };
    if (raw === null) return value;
    if (typeof raw !== 'string' || raw.length > 2097152) throw Error('Shared training queue is invalid.');
    const row = JSON.parse(raw);
    if (row?.version !== 1 || !Number.isSafeInteger(row.fetchedAt) || row.fetchedAt < 0 || !Number.isSafeInteger(row.nextUploadAt) || row.nextUploadAt < 0
      || !Array.isArray(row.pending) || row.pending.length > 64) throw Error('Shared training queue is corrupt.');
    const pending: SharedCandidate[] = [];
    for (const candidate of row.pending) {
      if (!candidate || typeof candidate.id !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(candidate.id) || !Number.isSafeInteger(candidate.baseRevision) || candidate.baseRevision < 0) throw Error('Invalid queued candidate.');
      const record = readPolicyRecord(candidate.record, options.identity);
      if (record.active !== 'approved') throw Error('Queued candidate must have passed local evaluation.');
      pending.push({ id: candidate.id, baseRevision: candidate.baseRevision, record: candidate.record });
    }
    if (new Set(pending.map(item => item.id)).size !== pending.length) throw Error('Duplicate queued candidate.');
    value = { version: 1, fetchedAt: row.fetchedAt, nextUploadAt: row.nextUploadAt, pending,
      shared: row.shared === undefined ? undefined : readSharedPolicy(row.shared, options.identity) };
    return value;
  }
  return {
    async read() { return decode(await options.backend.read(key)); },
    async update(change: (state: ReturnType<typeof decode>) => void) {
      return decode(await options.backend.transact(key, raw => {
        const state = decode(raw);change(state);
        const encoded = JSON.stringify(state);decode(encoded);return encoded;
      }));
    },
  };
}
