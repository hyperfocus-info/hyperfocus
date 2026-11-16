import { createHash } from 'node:crypto';
import { readCombatAiPolicy, type CombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import type { DurableServiceTransaction } from '@hyperfocus/engine/server';
import { readPolicyRecord, recordPolicies } from '../../src/learning/records.ts';

export const POLICY_BUCKET = 'combat-policy';
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function policyScope(contentId: string) {
  if (!contentId || contentId.length > 4096) throw Error('Invalid policy content identity.');
  return `policy:${digest(contentId)}:`;
}

export function writeRecord(transaction: DurableServiceTransaction, key: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (!payload || payload.length > 524288) throw Error('Policy record exceeds its limit.');
  transaction.put(POLICY_BUCKET, key, JSON.stringify({ payload, checksum: digest(payload) }));
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 1048576) throw Error('Invalid durable policy record.');
  const envelope = JSON.parse(value);
  if (!envelope || typeof envelope.payload !== 'string' || digest(envelope.payload) !== envelope.checksum) throw Error('Corrupt durable policy record.');
  const record: unknown = JSON.parse(envelope.payload);
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('Invalid durable policy record payload.');
  return Object.fromEntries(Object.entries(record));
}

export function readHead(transaction: DurableServiceTransaction, scope: string, contentId: string) {
  return readHeadValue(transaction.get(POLICY_BUCKET, `${scope}head`), contentId);
}

/** Also used by the read-only development SQLite exporter. */
type PolicyHead = { version: 1; contentId: string; revision: number; policy: CombatAiPolicy | undefined; previous: CombatAiPolicy | undefined; record: string | undefined; previousRecord: string | undefined };
export function readHeadValue(value: unknown, contentId: string): PolicyHead {
  const row = readRecord(value);
  if (!row) return { version: 1, contentId, revision: 0, policy: undefined, previous: undefined, record: undefined, previousRecord: undefined };
  if (row.version !== 1 || row.contentId !== contentId || !Number.isSafeInteger(row.revision) || typeof row.revision !== 'number' || row.revision < 1) throw Error('Invalid canonical policy revision.');
  const policy = readCombatAiPolicy(row.policy), previous = readCombatAiPolicy(row.previous);
  for (const [artifact, compact] of [[policy, row.record], [previous, row.previousRecord]]) {
    if (typeof compact !== 'string' && compact !== undefined || artifact && compact === undefined) throw Error('Canonical policy evidence is missing.');
    if (typeof compact === 'string' && JSON.stringify(recordPolicies(readPolicyRecord(compact, contentId)).active) !== JSON.stringify(artifact)) throw Error('Canonical policy evidence does not match its weights.');
  }
  return { version: 1 as const, contentId, revision: row.revision, policy, previous,
    record: typeof row.record === 'string' ? row.record : undefined, previousRecord: typeof row.previousRecord === 'string' ? row.previousRecord : undefined };
}
export type CanonicalPolicySnapshot = ReturnType<typeof readHead>;

export type CandidateStatus = 'queued' | 'evaluating' | 'promoted' | 'rejected' | 'stale' | 'failed';
export type CandidateRecord = { id: string; baseRevision: number; digest: string; submitter: string; status: CandidateStatus; record?: string;
  policyId: string; policyDigest: string; attempt?: number; token?: string; leaseUntil?: number; reason?: string };

export function readCandidate(value: unknown): CandidateRecord | undefined {
  const row = readRecord(value);
  if (!row) return undefined;
  const status = row.status;
  if (typeof row.id !== 'string' || typeof row.submitter !== 'string' || typeof row.digest !== 'string'
    || typeof row.policyId !== 'string' || typeof row.policyDigest !== 'string'
    || typeof row.baseRevision !== 'number' || !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 0
    || status !== 'queued' && status !== 'evaluating' && status !== 'promoted' && status !== 'rejected' && status !== 'stale' && status !== 'failed') throw Error('Invalid durable policy candidate.');
  if (row.record !== undefined && (typeof row.record !== 'string' || row.record.length > 262144)) throw Error('Invalid durable candidate evidence.');
  if (row.attempt !== undefined && (typeof row.attempt !== 'number' || !Number.isSafeInteger(row.attempt) || row.attempt < 1)) throw Error('Invalid durable candidate attempt.');
  if (row.token !== undefined && typeof row.token !== 'string' || row.leaseUntil !== undefined && (typeof row.leaseUntil !== 'number' || !Number.isFinite(row.leaseUntil))) throw Error('Invalid durable candidate lease.');
  if (status === 'evaluating' && (row.token === undefined || row.leaseUntil === undefined || row.attempt === undefined)) throw Error('Invalid durable candidate lease.');
  return { id: row.id, submitter: row.submitter, digest: row.digest, policyId: row.policyId, policyDigest: row.policyDigest, baseRevision: row.baseRevision,
    status, record: row.record, attempt: row.attempt, token: row.token, leaseUntil: row.leaseUntil, reason: typeof row.reason === 'string' ? row.reason : undefined };
}

export function candidatePrefix(scope: string, revision: number) { return `${scope}candidate:${String(revision).padStart(16, '0')}:`; }
export function candidateKey(scope: string, revision: number, id: string) { return `${candidatePrefix(scope, revision)}${digest(id)}`; }
export function finishCandidate(candidate: CandidateRecord, status: CandidateStatus, reason?: string): CandidateRecord {
  return { id: candidate.id, baseRevision: candidate.baseRevision, digest: candidate.digest, submitter: candidate.submitter,
    policyId: candidate.policyId, policyDigest: candidate.policyDigest, status,
    ...(candidate.attempt === undefined ? {} : { attempt: candidate.attempt }), ...(reason ? { reason: reason.slice(0, 512) } : {}) };
}

export function weightDigest(policy: CombatAiPolicy | undefined) {
  return digest(JSON.stringify(Object.entries(policy?.scores ?? {}).filter(([, score]) => score !== 0).sort(([left], [right]) => left.localeCompare(right))));
}
