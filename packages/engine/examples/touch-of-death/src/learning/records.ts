import { createPolicyExperiment, readPolicyExperiment, type PolicyExperimentSnapshot } from './experiment.ts';
import { copyPolicy } from './trials.ts';

type Slot = 'approved' | 'base' | 'original' | 'shared-previous';
export type PolicyRecord = { version: 2; identity: string; revision: number; evidence?: PolicyExperimentSnapshot; active: Slot; previous: Slot;
  shared?: { origin: string; revision: number }; sharedPrevious?: NonNullable<ReturnType<typeof copyPolicy>> };

export function policyStorageKey(identity: string) {
  if (!identity || identity.length > 4096) throw Error('Invalid policy content identity.');
  return `tod-combat-policy:${identity}`;
}

export function emptyPolicyRecord(identity: string): PolicyRecord {
  return { version: 2, identity, revision: 0, active: 'original', previous: 'original' };
}

export function recordPolicies(record: PolicyRecord) {
  const policy = (slot: Slot) => slot === 'approved' ? record.evidence?.approved : slot === 'base' ? record.evidence?.active : slot === 'shared-previous' ? record.sharedPrevious : undefined;
  return { active: policy(record.active), previous: policy(record.previous), evidence: record.evidence,
    restored: record.active !== 'approved', revision: record.revision, shared: record.shared };
}

function checksum(text: string) {
  let first = 2166136261, second = 2246822507;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second ^ text.charCodeAt(index), 3266489909);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** Lossless compression: schedules, candidates and approval are regenerated from results. */
export function encodePolicyRecord(record: PolicyRecord) {
  const { evidence, ...header } = record;
  const payload = { ...header, algorithmVersion: 1, evidence: evidence && { seed: evidence.seed, active: evidence.active, previous: evidence.previous, approved: evidence.approved,
    results: evidence.trials.map(trial => [trial.status === 'completed' ? 1 : 0,
      trial.winner === 'player' ? 1 : trial.winner === 'opponent' ? 2 : trial.winner === 'draw' ? 3 : 0, trial.ticks]) } };
  const encoded = JSON.stringify({ ...payload, checksum: checksum(JSON.stringify(payload)) });
  if (encoded.length > 262144) throw Error('Policy evidence exceeds its storage limit.');
  return encoded;
}

export function readPolicyRecord(raw: unknown, identity: string): PolicyRecord {
  if (raw === null) return emptyPolicyRecord(identity);
  if (typeof raw !== 'string' || raw.length > 262144) throw Error('Stored policy record exceeds its limit or is invalid.');
  let saved;
  try { saved = JSON.parse(raw); } catch { throw Error('Stored policy record is corrupt.'); }
  if (!saved || typeof saved !== 'object') throw Error('Stored policy record is corrupt.');
  const { checksum: savedChecksum, ...payload } = saved;
  if (savedChecksum !== checksum(JSON.stringify(payload))) throw Error('Stored policy record checksum is corrupt.');
  if (!saved || saved.version !== 2 || saved.algorithmVersion !== 1 || saved.identity !== identity || !Number.isSafeInteger(saved.revision) || saved.revision < 1
    || !['approved', 'base', 'original', 'shared-previous'].includes(saved.active) || !['approved', 'base', 'original', 'shared-previous'].includes(saved.previous)) throw Error('Stored policy identity, revision or version is invalid.');
  let evidence: PolicyExperimentSnapshot | undefined;
  if (saved.evidence !== undefined) {
    if (!saved.evidence || !Array.isArray(saved.evidence.results) || saved.evidence.results.length !== 128) throw Error('Stored policy evaluation is incomplete.');
    const experiment = createPolicyExperiment(saved.evidence);
    for (const row of saved.evidence.results) {
      const pending = experiment.next();
      if (!pending || !Array.isArray(row) || row.length !== 3 || ![0, 1].includes(row[0]) || ![0, 1, 2, 3].includes(row[1])) throw Error('Stored policy trial is invalid.');
      experiment.record({ id: pending.id, status: row[0] === 1 ? 'completed' : 'capped',
        winner: row[1] === 1 ? 'player' : row[1] === 2 ? 'opponent' : row[1] === 3 ? 'draw' : undefined, ticks: row[2] });
    }
    evidence = experiment.snapshot();
    if (evidence.status !== 'approved' || !evidence.approved) throw Error('Stored policy did not pass evaluation.');
    if (JSON.stringify(copyPolicy(saved.evidence.approved)) !== JSON.stringify(evidence.approved)) throw Error('Stored policy weights do not match the evaluated artifact.');
  }
  if (!evidence && [saved.active, saved.previous].some(slot => slot === 'approved' || slot === 'base')) throw Error('Stored policy has no approved evaluation.');
  const shared = saved.shared;
  if (shared !== undefined && (!shared || typeof shared.origin !== 'string' || shared.origin.length > 2048 || !/^https?:\/\//.test(shared.origin)
    || !Number.isSafeInteger(shared.revision) || shared.revision < 0)) throw Error('Invalid shared policy revision.');
  const sharedPrevious = copyPolicy(saved.sharedPrevious);
  if (shared === undefined && (sharedPrevious || saved.active === 'shared-previous' || saved.previous === 'shared-previous')) throw Error('Shared rollback policy has no source.');
  return { version: 2, identity, revision: saved.revision, active: saved.active, previous: saved.previous, evidence,
    ...(sharedPrevious === undefined ? {} : { sharedPrevious }),
    ...(shared === undefined ? {} : { shared: { origin: shared.origin, revision: shared.revision } }) };
}

export function readLegacyPolicy(raw: string, identity: string): PolicyRecord {
  if (raw.length > 262144) throw Error('Legacy policy evidence exceeds its limit.');
  const saved = JSON.parse(raw);
  if (!saved || saved.version !== 1 || saved.identity !== identity || typeof saved.restored !== 'boolean') throw Error('Legacy policy identity or version is invalid.');
  const evidence = readPolicyExperiment(saved.evidence);
  if (evidence.status !== 'approved' || !evidence.approved) throw Error('Legacy policy did not pass evaluation.');
  return { version: 2, identity, revision: 1, evidence, active: saved.restored ? 'base' : 'approved', previous: saved.restored ? 'approved' : 'base' };
}
