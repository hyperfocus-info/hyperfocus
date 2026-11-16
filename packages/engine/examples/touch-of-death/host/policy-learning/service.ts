import type { CombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import type { DurableServiceStore, DurableServiceTransaction } from '@hyperfocus/engine/server';
import { acceptCandidates, prepareCandidates, staleCandidates } from './candidates.ts';
import { claimCandidate, currentClaim, type PolicyClaim } from './claims.ts';
import { POLICY_BUCKET, digest, finishCandidate, policyScope, readHead, writeRecord, type CanonicalPolicySnapshot } from './records.ts';

type TrustedEvaluation = { approved: boolean; reason?: string; evidence: unknown };
type EvaluationRequest = { candidate: CombatAiPolicy; active?: CombatAiPolicy; previous?: CombatAiPolicy; attempt: number; excludedSeeds: number[]; signal: AbortSignal };
const CACHE_MS = 1800000;

export function createPolicyLearningService(options: { contentId: string; store: DurableServiceStore; evaluate(request: EvaluationRequest): Promise<TrustedEvaluation>;
  now?: () => number; leaseMs?: number }) {
  const { store, contentId } = options, scope = policyScope(contentId), now = options.now ?? Date.now, leaseMs = options.leaseMs ?? 120000;
  if (!Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw Error('Invalid policy evaluation lease.');
  let cache: CanonicalPolicySnapshot | undefined, expires = 0, retry = 0, error: string | undefined, generation = 0, disposed = false;
  let reading: Promise<ReturnType<typeof cached>> | undefined, processing: Promise<Awaited<ReturnType<typeof process>>> | undefined;
  let controller: AbortController | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
  function cached() {
    if (!cache) throw Error(error ?? 'Canonical policy has not been loaded.');
    return structuredClone({ ...cache, stale: now() >= expires, ...(error ? { error } : {}) });
  }
  function validateRevision(head: CanonicalPolicySnapshot) {
    if (cache && (head.revision < cache.revision || head.revision === cache.revision && JSON.stringify(head) !== JSON.stringify(cache))) throw Error('Canonical policy revision regressed or conflicted.');
  }
  function authoritative(transaction: DurableServiceTransaction) {
    const head = readHead(transaction, scope, contentId); validateRevision(head); return head;
  }
  function adopt(head: CanonicalPolicySnapshot) {
    validateRevision(head);
    cache = head; expires = now() + CACHE_MS; retry = 0; error = undefined; generation++;
  }
  async function read(request: { force?: boolean } = {}) {
    if (disposed) throw Error('Policy coordinator is disposed.');
    if (reading) return reading;
    if (!request.force && cache && (now() < expires || now() < retry)) return cached();
    const started = generation;
    reading = store.transaction(authoritative).then(head => {
      if (!disposed && generation === started) adopt(head);
      return cached();
    }).catch(failure => {
      if (generation === started) { error = String(failure); expires = 0; retry = now() + 30000; }
      if (!cache) throw failure;
      return cached();
    }).finally(() => { reading = undefined; });
    return reading;
  }
  async function submit(request: Parameters<typeof prepareCandidates>[0]) {
    if (disposed) throw Error('Policy coordinator is disposed.');
    const candidates = prepareCandidates(request, contentId);
    return store.transaction(transaction => acceptCandidates(transaction, scope, authoritative(transaction), candidates, now()));
  }
  async function renew(claim: PolicyClaim, signal: AbortController) {
    try {
      await store.transaction(transaction => {
        const candidate = currentClaim(transaction, claim, now()), head = authoritative(transaction);
        if (!candidate || head.revision !== claim.head.revision) throw Error('Policy evaluation lease is no longer current.');
        writeRecord(transaction, claim.key, { ...candidate, leaseUntil: now() + leaseMs });
      });
    } catch (failure) { signal.abort(failure); }
  }
  async function finish(claim: PolicyClaim, result: TrustedEvaluation, aborted: boolean) {
    const evidence = JSON.stringify(result.evidence);
    if (typeof result.approved !== 'boolean' || !evidence || evidence.length > 500000) throw Error('Trusted policy evaluation returned invalid or oversized evidence.');
    const outcome = await store.transaction(transaction => {
      const head = authoritative(transaction), candidate = currentClaim(transaction, claim, now());
      if (!candidate) return { head, status: 'stale' as const };
      const status = aborted ? 'failed' as const : head.revision !== claim.head.revision ? 'stale' as const : result.approved ? 'promoted' as const : 'rejected' as const;
      writeRecord(transaction, claim.key, finishCandidate(candidate, status, result.reason));
      writeRecord(transaction, `${scope}evidence:${String(claim.attempt).padStart(16, '0')}`, { attempt: claim.attempt, candidateId: candidate.id,
        baseRevision: candidate.baseRevision, policyId: claim.policy.id, status, evidence: result.evidence, evidenceHash: digest(evidence) });
      const reports = transaction.scan(POLICY_BUCKET, { prefix: `${scope}evidence:`, limit: 65, reverse: true });
      for (const report of reports.slice(64)) transaction.delete(POLICY_BUCKET, report.key);
      if (status !== 'promoted') return { head, status };
      if (head.revision >= Number.MAX_SAFE_INTEGER) throw Error('Canonical policy revision is exhausted.');
      const next = { ...head, revision: head.revision + 1, previous: head.policy, previousRecord: head.record, policy: claim.policy, record: candidate.record };
      writeRecord(transaction, `${scope}head`, next); staleCandidates(transaction, scope, next.revision);
      return { head: next, status };
    });
    if (!disposed && (!cache || outcome.head.revision >= cache.revision)) adopt(outcome.head);
    return { id: claim.candidate.id, status: outcome.status, revision: outcome.head.revision, attempt: claim.attempt };
  }
  async function process() {
    const claim = await store.transaction(transaction => claimCandidate(transaction, scope, authoritative(transaction), now(), leaseMs));
    if (!claim || disposed) return undefined;
    controller = new AbortController();
    const signal = controller;
    let renewal: Promise<void> | undefined;
    heartbeat = setInterval(() => {
      renewal ??= renew(claim, signal).finally(() => { renewal = undefined; });
    }, Math.floor(leaseMs / 3));
    try {
      let result: TrustedEvaluation, failed = false;
      try {
        result = await options.evaluate({ candidate: structuredClone(claim.policy), active: structuredClone(claim.head.policy), previous: structuredClone(claim.head.previous),
          attempt: claim.attempt, excludedSeeds: claim.excludedSeeds, signal: signal.signal });
      } catch (failure) {
        if (disposed) return undefined;
        failed = true; result = { approved: false, reason: String(failure), evidence: { error: String(failure).slice(0, 1024) } };
      }
      // A failed commit must leave the claim recoverable; never turn it into a terminal rejection.
      return await finish(claim, result, failed || disposed || signal.signal.aborted);
    } finally { clearInterval(heartbeat); heartbeat = undefined; await renewal; controller = undefined; }
  }
  return {
    read, submit,
    processNext() {
      if (disposed) return Promise.reject(Error('Policy coordinator is disposed.'));
      processing ??= process().finally(() => { processing = undefined; });
      return processing;
    },
    async rollback(request: { expectedRevision: number }) {
      if (disposed) throw Error('Policy coordinator is disposed.');
      const head = await store.transaction(transaction => {
        const current = authoritative(transaction);
        if (!current.revision || current.revision !== request.expectedRevision || current.revision >= Number.MAX_SAFE_INTEGER) throw Error('Canonical policy rollback revision changed or is unavailable.');
        const next = { ...current, revision: current.revision + 1, policy: current.previous, previous: current.policy, record: current.previousRecord, previousRecord: current.record };
        writeRecord(transaction, `${scope}head`, next); staleCandidates(transaction, scope, next.revision); return next;
      });
      if (!cache || head.revision >= cache.revision) adopt(head);
      return cached();
    },
    async dispose() { disposed = true; generation++; controller?.abort(Error('Policy coordinator is shutting down.')); clearInterval(heartbeat); await processing?.catch(() => undefined); },
  };
}
export type PolicyLearningService = ReturnType<typeof createPolicyLearningService>;
