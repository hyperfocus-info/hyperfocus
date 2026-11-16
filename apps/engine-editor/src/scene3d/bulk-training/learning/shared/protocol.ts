import { readCombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import { readPolicyRecord, recordPolicies } from '@hyperfocus/touch-of-death/learning/records';

export type SharedCandidate = { id: string; baseRevision: number; record: string };
export type SharedPolicy = ReturnType<typeof readSharedPolicy>;

/** The transport must be the configured same-origin game host. Weights alone are insufficient. */
export function readSharedPolicy(value: unknown, contentId: string) {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('contentId' in value) || value.contentId !== contentId || !('revision' in value)
    || !Number.isSafeInteger(value.revision) || typeof value.revision !== 'number' || value.revision < 0) throw Error('Invalid shared policy version or content.');
  const policy = readCombatAiPolicy('policy' in value ? value.policy : undefined);
  const previous = readCombatAiPolicy('previous' in value ? value.previous : undefined);
  const record = 'record' in value ? value.record : undefined;
  const previousRecord = 'previousRecord' in value ? value.previousRecord : undefined;
  if (record !== undefined && typeof record !== 'string') throw Error('Invalid shared policy evidence.');
  if (policy) {
    if (!record) throw Error('Shared policy evidence is missing.');
    const decoded = readPolicyRecord(record, contentId);
    if (!decoded.evidence || JSON.stringify(recordPolicies(decoded).active) !== JSON.stringify(policy)) throw Error('Shared policy weights disagree with its evidence.');
  } else if (record !== undefined) throw Error('Original shared policy cannot contain candidate evidence.');
  if (previous) {
    const decoded = readPolicyRecord(previousRecord, contentId);
    if (!decoded.evidence?.approved || JSON.stringify(recordPolicies(decoded).active) !== JSON.stringify(previous)) throw Error('Shared previous weights disagree with their evidence.');
  } else if (previousRecord !== undefined) throw Error('Original shared previous policy cannot contain candidate evidence.');
  if ('stale' in value && value.stale || 'error' in value && value.error) throw Error('Shared policy storage is unavailable.');
  return { version: 1 as const, contentId, revision: value.revision, policy, previous, record, previousRecord: typeof previousRecord === 'string' ? previousRecord : undefined };
}
