import { readPolicyExperiment, type PolicyExperimentSnapshot } from '@hyperfocus/touch-of-death/learning/experiment';
import { encodePolicyRecord, readPolicyRecord, recordPolicies, type PolicyRecord } from '@hyperfocus/touch-of-death/learning/records';
import type { PolicyBackend } from './backend.ts';
import { copyPolicy } from '@hyperfocus/touch-of-death/learning/trials';

type Update = { expectedRevision: number; kind: 'save' | 'shared' | 'rollback' | 'original'; experiment?: PolicyExperimentSnapshot; shared?: { origin: string; revision: number }; sharedPrevious?: PolicyRecord['sharedPrevious'] };

export function preparePolicyUpdate(options: { expectedRevision: number; kind: Update['kind']; experiment?: unknown; shared?: Update['shared']; sharedPrevious?: Update['sharedPrevious'] }): Update {
  if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) throw Error('Invalid expected policy revision.');
  const experiment = options.kind === 'save' || options.kind === 'shared' && options.experiment !== undefined ? readPolicyExperiment(options.experiment) : undefined;
  if (experiment && (experiment.status !== 'approved' || !experiment.approved)) throw Error('Policy did not pass its held-out evaluation.');
  if (options.kind === 'shared' && (!options.shared || new URL(options.shared.origin).origin !== options.shared.origin
    || !/^https?:\/\//.test(options.shared.origin) || !Number.isSafeInteger(options.shared.revision) || options.shared.revision < 0)) throw Error('Invalid shared policy source.');
  return { expectedRevision: options.expectedRevision, kind: options.kind, experiment, shared: options.shared && { ...options.shared }, sharedPrevious: copyPolicy(options.sharedPrevious) };
}

function applyUpdate(record: PolicyRecord, update: Update): PolicyRecord {
  if (record.revision !== update.expectedRevision) throw Error('Saved policy revision changed; refresh before updating.');
  if (record.revision === Number.MAX_SAFE_INTEGER) throw Error('Policy revision limit reached.');
  const next = { ...record, revision: record.revision + 1 };
  if (update.kind === 'shared') {
    if (record.shared && (record.shared.origin !== update.shared!.origin || record.shared.revision >= update.shared!.revision)) throw Error('Shared policy revision is stale.');
    next.shared = update.shared;
    next.sharedPrevious = update.sharedPrevious;
    if (!update.experiment) return { ...next, active: 'original', previous: 'shared-previous', evidence: undefined };
  }
  if (update.kind === 'original') return { ...next, active: 'original', previous: recordPolicies(record).active === undefined ? record.previous : record.active };
  if (update.kind === 'rollback') {
    if (!record.evidence && !record.sharedPrevious) throw Error('No previous policy is available.');
    return { ...next, active: record.previous, previous: record.active };
  }
  const experiment = update.experiment;
  if (!experiment) throw Error('Policy evaluation is missing.');
  const current = recordPolicies(record);
  if (update.kind !== 'shared' && (JSON.stringify(experiment.active) !== JSON.stringify(current.active) || JSON.stringify(experiment.previous) !== JSON.stringify(current.previous))) {
    throw Error('Policy evaluation used a stale active or previous policy.');
  }
  return { ...next, evidence: experiment, active: 'approved', previous: update.kind === 'shared' ? 'shared-previous' : 'base',
    sharedPrevious: update.kind === 'shared' ? update.sharedPrevious : undefined };
}

/** One short queue per store; backend serializes queues from every tab and store. */
export function createPolicyUpdates(options: { identity: string; backend: PolicyBackend; batchMs: number; validate(record: PolicyRecord): void; committed(record: PolicyRecord): void; changed(): void }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  const queue: { update: Update; resolve(record: PolicyRecord): void; reject(error: unknown): void }[] = [];
  async function flush() {
    timer = undefined;
    if (running) return;
    running = true;
    const pending = queue.splice(0);
    const outcomes: ({ record: PolicyRecord } | { error: unknown })[] = [];
    try {
      const raw = await options.backend.transact(options.identity, raw => {
        let record = readPolicyRecord(raw, options.identity);
        options.validate(record);
        for (const { update } of pending) {
          try { record = applyUpdate(record, update); outcomes.push({ record }); }
          catch (error) { outcomes.push({ error }); }
        }
        if (!outcomes.some(outcome => 'record' in outcome)) throw outcomes[0] && 'error' in outcomes[0] ? outcomes[0].error : Error('No policy updates.');
        return encodePolicyRecord(record);
      });
      const committed = readPolicyRecord(raw, options.identity);
      if (!disposed) options.committed(committed);
      pending.forEach((item, index) => {
        const outcome = outcomes[index];
        if (outcome && 'record' in outcome) item.resolve(outcome.record);
        else item.reject(outcome && 'error' in outcome ? outcome.error : Error('Policy update did not commit.'));
      });
    } catch (error) {
      if (!disposed) options.changed();
      for (const item of pending) item.reject(error);
    } finally {
      running = false;
      if (!disposed && queue.length && timer === undefined) timer = setTimeout(() => { void flush(); }, options.batchMs);
    }
  }
  return {
    enqueue(update: Update) {
      if (disposed) return Promise.reject(Error('Policy store is disposed.'));
      return new Promise<PolicyRecord>((resolve, reject) => {
        queue.push({ update, resolve, reject });
        timer ??= setTimeout(() => { void flush(); }, options.batchMs);
      });
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      for (const item of queue.splice(0)) item.reject(Error('Policy store is disposed.'));
    },
  };
}
