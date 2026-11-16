import { createIndexedPolicyBackend, type PolicyBackend } from '../backend.ts';
import { encodePolicyRecord } from '@hyperfocus/touch-of-death/learning/records';
import type { PolicyStore, PolicyStoreSnapshot } from '../store.ts';
import { createSharedOutbox } from './outbox.ts';
import { readSharedPolicy, type SharedCandidate, type SharedPolicy } from './protocol.ts';
import { createSharedTransport } from './transport.ts';

const minute = 60000, cacheMs = 30 * minute;

/** Local learning stays responsive; uploads nominate candidates, never publish shared weights. */
export function createSharedPolicySync(options: {
  contentId: string; origin: string; store: PolicyStore; backend?: PolicyBackend; clock?: () => number;
  transport?: { read(): Promise<unknown>; prepare(): Promise<void>; upload(candidates: SharedCandidate[]): Promise<unknown> };
}) {
  const lifetime = new AbortController(), clock = options.clock ?? Date.now;
  const outbox = createSharedOutbox({ identity: options.contentId, origin: options.origin, backend: options.backend ?? createIndexedPolicyBackend() });
  const transport = options.transport ?? createSharedTransport({ origin: options.origin, contentId: options.contentId, signal: lifetime.signal });
  let status = { available: false, revision: 0, pending: 0, error: '' }, disposed = false, applying = false;
  let reading: Promise<void> | undefined, uploading: Promise<void> | undefined, retryAt = 0;
  let stages = Promise.resolve();
  const listeners = new Set<() => void>();
  const notify = () => { if (!disposed) for (const listener of listeners) listener(); };
  const failure = (cause: unknown) => { status.error = cause instanceof Error ? cause.message : String(cause);notify(); };
  async function install(shared: SharedPolicy) {
    if (disposed) return;
    applying = true;
    try {
      const local = await options.store.read();
      if (disposed) return;
      if (local.error || local.stale) throw Error(local.error || 'Local policy storage is stale.');
      if (local.shared && local.shared.origin !== options.origin) throw Error('Cached shared policy belongs to another origin.');
      if (!local.shared || local.shared.revision < shared.revision) {
        // Preserve a policy learned before shared training was enabled before replacing it.
        if (!local.shared) await stage(local, shared);
        if (disposed) return;
        await options.store.installShared({ record: shared.record, previous: shared.previous, previousRecord: shared.previousRecord,
          expectedRevision: local.revision, shared: { origin: options.origin, revision: shared.revision } });
      }
    } finally { applying = false; }
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    if (reading) return reading;
    reading = (async () => {
      const state = await outbox.read();status.pending = state.pending.length;
      if (clock() < retryAt) return;
      if (state.fetchedAt > 0 && clock() - state.fetchedAt < cacheMs) {
        if (state.shared) await install(state.shared);
        status.available = !!state.shared;status.revision = state.shared?.revision ?? 0;notify();return;
      }
      const raw = await transport.read();if (disposed) return;
      const shared = raw === undefined ? undefined : readSharedPolicy(raw, options.contentId);
      if (shared && state.shared && shared.revision < state.shared.revision) throw Error('Shared policy revision regressed.');
      if (shared && state.shared && shared.revision === state.shared.revision && JSON.stringify(shared) !== JSON.stringify(state.shared)) throw Error('Shared policy revision conflicts with the cached version.');
      if (shared && (!state.shared || shared.revision > state.shared.revision)) {
        await install(shared);
      }
      const committed = await outbox.update(current => {
        if (current.shared && shared && current.shared.revision > shared.revision) return;
        if (current.shared && shared && current.shared.revision === shared.revision && JSON.stringify(current.shared) !== JSON.stringify(shared)) throw Error('Conflicting shared policy revision.');
        if (current.shared && !shared) throw Error('Shared policy endpoint disappeared; retaining cached weights.');
        current.shared = shared;current.fetchedAt = clock();
      });
      status.available = !!committed.shared;status.revision = committed.shared?.revision ?? 0;status.error = '';notify();
    })().catch(cause => { retryAt = clock() + minute;failure(cause); }).finally(() => { reading = undefined; });
    return reading;
  }
  async function stage(value: PolicyStoreSnapshot, incoming?: SharedPolicy) {
    if (disposed || applying && !incoming || value.error || value.stale || !value.evidence?.approved || JSON.stringify(value.active) !== JSON.stringify(value.evidence.approved)) return;
    const record = encodePolicyRecord({ version: 2, identity: options.contentId, revision: value.revision, active: 'approved', previous: 'base', evidence: value.evidence });
    const state = await outbox.read();
    const shared = incoming ?? state.shared;
    if (!shared) return;
    if (JSON.stringify(shared.policy) === JSON.stringify(value.active)) return;
    const baseRevision = value.shared?.origin === options.origin ? value.shared.revision : shared.revision;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([baseRevision, record])));
    const id = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const queued = await outbox.update(current => {
      if (current.pending.some(item => item.id === id)) return;
      if (current.pending.length >= 64) throw Error('Shared training queue is full. Local learning remains saved.');
      current.pending.push({ id, baseRevision, record });
      if (!current.nextUploadAt) current.nextUploadAt = clock() + minute;
    });
    status.pending = queued.pending.length;notify();
  }
  const unsubscribe = options.store.subscribe(value => {
    if (applying || disposed) return;
    stages = stages.then(() => stage(value)).catch(failure);
  });
  function flush() {
    if (disposed) return Promise.resolve();
    if (uploading) return uploading;
    uploading = (async () => {
      await stages;
      const queued = await outbox.read();
      if (!queued.pending.length || clock() < queued.nextUploadAt) return;
      let batch: SharedCandidate[] = [];
      await outbox.update(state => {
        if (clock() < state.nextUploadAt || !state.pending.length) return;
        for (const candidate of state.pending.slice(0, 8)) {
          const next = [...batch, candidate];
          if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 900000) {
            if (!batch.length) throw Error('A saved shared candidate exceeds the upload byte limit; local evidence is retained.');
            break;
          }
          batch = next;
        }
        state.nextUploadAt = clock() + minute;
      });
      if (!batch.length || disposed) return;
      const response = await transport.upload(batch);
      if (!response || typeof response !== 'object' || !('receipts' in response) || !Array.isArray(response.receipts)
        || response.receipts.length !== batch.length) throw Error('Invalid shared training acknowledgment.');
      const accepted = new Set<string>();
      for (const row of response.receipts) {
        if (!row || !batch.some(item => item.id === row.id) || accepted.has(row.id)
          || !['queued', 'evaluating', 'promoted', 'rejected', 'stale', 'failed'].includes(row.status)) throw Error('Invalid shared training receipt.');
        accepted.add(row.id);
      }
      const next = await outbox.update(state => { state.pending = state.pending.filter(item => !accepted.has(item.id)); });
      status.pending = next.pending.length;status.error = '';notify();
    })().catch(failure).finally(() => { uploading = undefined; });
    return uploading;
  }
  const ready = refresh().then(async () => {
    if (disposed) return;
    // Recover a local commit if the page closed before its separate outbox write.
    await options.store.read();
    if (disposed) return;
    stages = stages.then(() => stage(options.store.snapshot())).catch(failure);
    await stages;
  }).catch(failure);
  const timer = setInterval(() => { void refresh().then(flush); }, minute);
  return {
    ready, refresh, flush,
    snapshot() { return { ...status }; },
    subscribe(listener: () => void) { listeners.add(listener);return () => { listeners.delete(listener); }; },
    async prepare() { await refresh();if (status.available) { try { await transport.prepare(); } catch (cause) { failure(cause);throw cause; } } },
    dispose() { disposed = true;lifetime.abort();clearInterval(timer);unsubscribe();listeners.clear(); },
  };
}
