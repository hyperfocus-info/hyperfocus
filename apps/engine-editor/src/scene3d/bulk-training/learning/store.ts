import { createIndexedPolicyBackend, type PolicyBackend } from './backend.ts';
import { emptyPolicyRecord, encodePolicyRecord, policyStorageKey, readLegacyPolicy, readPolicyRecord, recordPolicies, type PolicyRecord } from '@hyperfocus/touch-of-death/learning/records';
import { createPolicyUpdates, preparePolicyUpdate } from './updates.ts';
import { copyPolicy } from '@hyperfocus/touch-of-death/learning/trials';

export { policyStorageKey } from '@hyperfocus/touch-of-death/learning/records';
export const POLICY_CACHE_MS = 1800000;
const RETRY_MS = 30000;

function policySnapshot(record: PolicyRecord, stale: boolean, error: string | undefined) {
  return structuredClone({ ...recordPolicies(record), stale, error });
}
export type PolicyStoreSnapshot = ReturnType<typeof policySnapshot>;

function openPolicyChannel() {
  try { return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hyperfocus-combat-policies') : undefined; }
  catch { return undefined; }
}

export function createPolicyStore(options: { identity: string; backend?: PolicyBackend; clock?: () => number; batchMs?: number;
  storage?: Pick<Storage, 'getItem'>; broadcast?: boolean }) {
  const { identity } = options;
  const key = policyStorageKey(identity);
  const backend = options.backend ?? createIndexedPolicyBackend();
  const clock = options.clock ?? Date.now;
  const batchMs = options.batchMs ?? 50;
  if (!Number.isFinite(batchMs) || batchMs < 0 || batchMs > 1000) throw Error('Policy batch interval must be between 0 and 1000 ms.');
  let record = emptyPolicyRecord(identity), expires = 0, retry = 0, generation = 0;
  let stale = true, error: string | undefined, disposed = false;
  let pending: Promise<PolicyStoreSnapshot> | undefined;
  const listeners = new Set<(snapshot: PolicyStoreSnapshot) => void>();
  const channel = options.broadcast === false ? undefined : openPolicyChannel();
  function announce(revision: number) {
    try { channel?.postMessage({ identity, revision }); } catch { /* Durable reads still refresh on expiry. */ }
  }
  function snapshot() { return policySnapshot(record, stale || clock() >= expires, error); }
  function notify() { for (const listener of listeners) { try { listener(snapshot()); } catch { /* Observers cannot undo a durable commit. */ } } }
  function validateRevision(next: PolicyRecord) {
    if (next.revision < record.revision) throw Error('Stored policy revision regressed; retaining the last good policy.');
    if (next.revision === record.revision && encodePolicyRecord(next) !== encodePolicyRecord(record)) throw Error('Stored policy revision conflicts with the last good policy.');
  }
  function adopt(next: PolicyRecord) {
    validateRevision(next);
    record = next; stale = false; error = undefined; expires = clock() + POLICY_CACHE_MS; retry = 0; generation++; notify();
  }
  function invalidate() { if (!disposed) { stale = true; expires = 0; generation++; } }
  const updates = createPolicyUpdates({ identity, backend, batchMs, validate: validateRevision,
    committed(next) {
      if (next.revision >= record.revision) adopt(next);
      announce(next.revision);
    },
    changed() { invalidate(); },
  });
  async function load() {
    let raw = await backend.read(identity);
    if (raw === null) {
      const storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
      const legacy = storage?.getItem(key);
      if (legacy) {
        const migrated = readLegacyPolicy(legacy, identity);
        raw = await backend.transact(identity, current => current === null ? encodePolicyRecord(migrated) : encodePolicyRecord(readPolicyRecord(current, identity)));
        announce(readPolicyRecord(raw, identity).revision);
      }
    }
    return readPolicyRecord(raw, identity);
  }
  async function read(request: { force?: boolean } = {}): Promise<PolicyStoreSnapshot> {
    if (disposed) throw Error('Policy store is disposed.');
    if (pending) return pending;
    if (!request.force && (!stale && clock() < expires || clock() < retry)) return snapshot();
    const started = generation;
    pending = load().then(next => {
      if (!disposed && generation === started) adopt(next);
      return snapshot();
    }).catch(failure => {
      if (!disposed && generation === started) { stale = true; error = failure instanceof Error ? failure.message : String(failure); retry = clock() + RETRY_MS; notify(); }
      return snapshot();
    }).finally(() => { pending = undefined; });
    return pending;
  }
  if (channel) channel.onmessage = event => {
    if (event.data?.identity !== identity || !Number.isSafeInteger(event.data.revision) || event.data.revision <= record.revision) return;
    invalidate();
    // Hints carry no authoritative weights. Always revalidate durable evidence.
    void read().then(() => { if (stale && !error) void read(); });
  };
  async function mutate(request: Parameters<typeof preparePolicyUpdate>[0]) {
    const prepared = preparePolicyUpdate(request);
    const current = await read();
    if (current.error) throw Error(current.error);
    const updated = await updates.enqueue(prepared);
    return structuredClone({ ...recordPolicies(updated), stale: false, error: undefined });
  }
  return {
    snapshot, read, invalidate,
    save(request: { experiment: unknown; expectedRevision: number }) { return mutate({ ...request, kind: 'save' }); },
    /** Only the same-origin shared-policy client invokes this after checking the server revision. */
    installShared(request: { record?: string; previous?: PolicyRecord['sharedPrevious']; previousRecord?: string; expectedRevision: number; shared: { origin: string; revision: number } }) {
      const sharedPrevious = copyPolicy(request.previous);
      if (sharedPrevious) {
        const previous = readPolicyRecord(request.previousRecord, identity);
        if (!previous.evidence?.approved || JSON.stringify(recordPolicies(previous).active) !== JSON.stringify(sharedPrevious)) throw Error('Shared previous policy has no matching approved evidence.');
      } else if (request.previousRecord !== undefined) throw Error('Original shared previous policy cannot have candidate evidence.');
      if (request.record === undefined) return mutate({ expectedRevision: request.expectedRevision, kind: 'shared', shared: request.shared, sharedPrevious });
      const incoming = readPolicyRecord(request.record, identity);
      if (incoming.active !== 'approved' || !incoming.evidence) throw Error('Shared candidate has no approved local evidence.');
      return mutate({ expectedRevision: request.expectedRevision, kind: 'shared', experiment: incoming.evidence, shared: request.shared, sharedPrevious });
    },
    restorePrevious(request: { expectedRevision: number }) { return mutate({ ...request, kind: 'rollback' }); },
    useOriginal(request: { expectedRevision: number }) { return mutate({ ...request, kind: 'original' }); },
    subscribe(listener: (snapshot: PolicyStoreSnapshot) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; generation++; updates.dispose(); channel?.close(); listeners.clear(); },
  };
}

export type PolicyStore = ReturnType<typeof createPolicyStore>;
