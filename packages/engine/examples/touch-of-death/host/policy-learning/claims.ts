import { randomUUID } from 'node:crypto';
import type { DurableServiceTransaction } from '@hyperfocus/engine/server';
import { readPolicyRecord } from '../../src/learning/records.ts';
import { POLICY_BUCKET, candidatePrefix, readCandidate, writeRecord, type CanonicalPolicySnapshot } from './records.ts';

export function claimCandidate(transaction: DurableServiceTransaction, scope: string, head: CanonicalPolicySnapshot, now: number, leaseMs: number) {
  for (const row of transaction.scan(POLICY_BUCKET, { prefix: candidatePrefix(scope, head.revision), limit: 4096 })) {
    const candidate = readCandidate(row.value);
    if (!candidate || candidate.status !== 'queued' && !(candidate.status === 'evaluating' && candidate.leaseUntil! <= now)) continue;
    if (!candidate.record) throw Error('Queued candidate evidence is missing.');
    const decoded = readPolicyRecord(candidate.record, head.contentId);
    if (!decoded.evidence?.approved || decoded.active !== 'approved') throw Error('Queued candidate has no passing local evidence.');
    const attempt = transaction.nextSequence(`${scope}attempt`), token = randomUUID();
    writeRecord(transaction, row.key, { ...candidate, status: 'evaluating', attempt, token, leaseUntil: now + leaseMs });
    return { key: row.key, candidate, policy: decoded.evidence.approved, head, attempt, token,
      excludedSeeds: [...new Set(decoded.evidence.trials.map(trial => trial.seed))] };
  }
  return undefined;
}
export type PolicyClaim = NonNullable<ReturnType<typeof claimCandidate>>;

export function currentClaim(transaction: DurableServiceTransaction, claim: PolicyClaim, now: number) {
  const candidate = readCandidate(transaction.get(POLICY_BUCKET, claim.key));
  return candidate?.status === 'evaluating' && candidate.token === claim.token && candidate.attempt === claim.attempt && candidate.leaseUntil! > now ? candidate : undefined;
}
