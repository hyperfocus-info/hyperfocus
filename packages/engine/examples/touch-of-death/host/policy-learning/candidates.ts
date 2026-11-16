import type { DurableServiceTransaction } from '@hyperfocus/engine/server';
import { encodePolicyRecord, readPolicyRecord, recordPolicies } from '../../src/learning/records.ts';
import { POLICY_BUCKET, candidateKey, candidatePrefix, digest, finishCandidate, readCandidate, readRecord, weightDigest, writeRecord, type CanonicalPolicySnapshot } from './records.ts';

export function prepareCandidates(options: { candidates: readonly { id: string; baseRevision: number; record: string }[]; submitter: string }, contentId: string) {
  if (!options || typeof options.submitter !== 'string' || !options.submitter || options.submitter.length > 256
    || !Array.isArray(options.candidates) || !options.candidates.length || options.candidates.length > 8) throw Error('A candidate batch must contain 1-8 candidates and a verified submitter.');
  const seen = new Set<string>();
  return options.candidates.map(candidate => {
    if (!candidate || typeof candidate.id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(candidate.id)
      || !Number.isSafeInteger(candidate.baseRevision) || candidate.baseRevision < 0 || typeof candidate.record !== 'string' || candidate.record.length > 262144) throw Error('Invalid policy candidate upload.');
    if (seen.has(candidate.id)) throw Error('Candidate IDs must be unique within a batch.');
    seen.add(candidate.id);
    const decoded = readPolicyRecord(candidate.record, contentId), policies = recordPolicies(decoded);
    if (decoded.active !== 'approved' || !decoded.evidence?.approved || !policies.active) throw Error('Candidate has no passing local evaluation.');
    const record = encodePolicyRecord({ version: 2, identity: contentId, revision: decoded.revision, active: 'approved', previous: 'base', evidence: decoded.evidence });
    return { ...candidate, record, evidence: decoded.evidence, policy: policies.active, policyDigest: weightDigest(policies.active), submitter: options.submitter,
      digest: digest(JSON.stringify({ baseRevision: candidate.baseRevision, record: candidate.record })) };
  });
}

export function acceptCandidates(transaction: DurableServiceTransaction, scope: string, head: CanonicalPolicySnapshot,
  candidates: ReturnType<typeof prepareCandidates>, now: number) {
  const existing = candidates.map(candidate => readCandidate(transaction.get(POLICY_BUCKET, candidateKey(scope, candidate.baseRevision, candidate.id))));
  const prefix = candidatePrefix(scope, head.revision), rows = transaction.scan(POLICY_BUCKET, { prefix, limit: 4097 });
  const retained = rows.map(row => readCandidate(row.value)).filter(row => row !== undefined);
  let pending = retained.filter(row => ['queued', 'evaluating'].includes(row.status)).length;
  let count = rows.length;
  const weights = new Set([weightDigest(head.policy), ...retained.map(row => row.policyDigest)]);
  const labels = new Map(retained.map(row => [row.policyId, row.policyDigest]));
  const fresh = candidates.filter((candidate, index) => !existing[index] && candidate.baseRevision === head.revision);
  const rateKey = `${scope}rate:${digest(candidates[0]!.submitter)}`;
  const rate = readRecord(transaction.get(POLICY_BUCKET, rateKey));
  if (fresh.length && typeof rate?.at === 'number' && now < rate.at + 60000) throw Error('Policy uploads are limited to one batch per minute per player.');
  const receipts = candidates.map((candidate, index) => {
    const prior = existing[index];
    if (prior) {
      if (prior.digest !== candidate.digest || prior.submitter !== candidate.submitter) throw Error('Candidate ID was reused with different evidence or owner.');
      return { id: candidate.id, status: prior.status };
    }
    if (candidate.baseRevision !== head.revision) return { id: candidate.id, status: 'stale' as const };
    for (const priorPolicy of [head.policy, head.previous]) {
      if (priorPolicy?.id === candidate.policy.id && JSON.stringify(priorPolicy) !== JSON.stringify(candidate.policy)) throw Error('Candidate policy ID conflicts with canonical weights.');
    }
    if (labels.has(candidate.policy.id) && labels.get(candidate.policy.id) !== candidate.policyDigest) throw Error('Candidate policy ID conflicts with retained weights.');
    const duplicate = weights.has(candidate.policyDigest);
    if ((!duplicate && ++pending > 64) || ++count > 4096) throw Error('Canonical policy candidate queue or revision admission budget is full.');
    const status = duplicate ? 'rejected' as const : 'queued' as const;
    writeRecord(transaction, candidateKey(scope, head.revision, candidate.id), { id: candidate.id, baseRevision: candidate.baseRevision,
      digest: candidate.digest, submitter: candidate.submitter, policyId: candidate.policy.id, policyDigest: candidate.policyDigest,
      ...(duplicate ? { reason: 'Duplicate weights for this canonical revision.' } : { record: candidate.record }), status });
    weights.add(candidate.policyDigest); labels.set(candidate.policy.id, candidate.policyDigest);
    return { id: candidate.id, status };
  });
  if (fresh.length) {
    for (const row of transaction.scan(POLICY_BUCKET, { prefix: `${scope}rate:`, limit: 8193 })) {
      const rate = readRecord(row.value);
      if (typeof rate?.at === 'number' && rate.at + 60000 <= now) transaction.delete(POLICY_BUCKET, row.key);
    }
    writeRecord(transaction, rateKey, { at: now });
  }
  return { revision: head.revision, receipts };
}

export function staleCandidates(transaction: DurableServiceTransaction, scope: string, revision: number) {
  const rows = transaction.scan(POLICY_BUCKET, { prefix: `${scope}candidate:`, limit: 8193 });
  for (const row of rows) {
    const candidate = readCandidate(row.value);
    if (!candidate || candidate.baseRevision >= revision) continue;
    // Keep one previous revision's retry receipts, remove older terminal history.
    if (candidate.baseRevision < revision - 1) transaction.delete(POLICY_BUCKET, row.key);
    else if (candidate.status === 'queued' || candidate.status === 'evaluating') writeRecord(transaction, row.key, finishCandidate(candidate, 'stale'));
  }
}
