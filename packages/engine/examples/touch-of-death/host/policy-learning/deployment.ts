import type { DurableServiceStore } from '@hyperfocus/engine/server';
import { prepareCandidates, acceptCandidates } from './candidates.ts';
import { digest, POLICY_BUCKET, policyScope, readHead, readRecord, writeRecord, type CanonicalPolicySnapshot } from './records.ts';
import { isObject } from '@hyperfocus/utilities/records';

const MAX_BYTES = 1048576;
export function encodeDeploymentPolicy(options: { head: CanonicalPolicySnapshot }) {
  const { contentId, revision: sourceRevision } = options.head;
  const candidate = options.head.record === undefined ? undefined : prepareCandidates({ submitter: 'deployment',
    candidates: [{ id: 'deployment', baseRevision: 0, record: options.head.record }] }, contentId)[0];
  if (JSON.stringify(candidate?.policy) !== JSON.stringify(options.head.policy)) throw Error('Deployment champion does not match its approved record.');
  const record = candidate?.record;
  const payload = JSON.stringify({ version: 1, contentId, sourceRevision, ...(record === undefined ? {} : { record }) });
  const artifact = JSON.stringify({ payload, sha256: digest(payload) });
  readDeploymentPolicy({ artifact, contentId });return artifact;
}

/** Release artifacts contain only weights and reproducible local evidence, never database rows. */
export function readDeploymentPolicy(options: { artifact: string; contentId: string }) {
  if (new TextEncoder().encode(options.artifact).byteLength > MAX_BYTES) throw Error('Deployment policy exceeds its byte limit.');
  const envelope: unknown = JSON.parse(options.artifact);
  if (!isObject(envelope) || typeof envelope.payload !== 'string' || digest(envelope.payload) !== envelope.sha256) throw Error('Deployment policy checksum failed.');
  const value: unknown = JSON.parse(envelope.payload);
  if (!isObject(value) || value.version !== 1 || value.contentId !== options.contentId || typeof value.sourceRevision !== 'number' || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 0
    || value.record !== undefined && (typeof value.record !== 'string' || value.sourceRevision < 1)) throw Error('Deployment policy content or revision is invalid.');
  const record = value.record === undefined ? undefined : prepareCandidates({ submitter: 'deployment', candidates: [{ id: 'deployment', baseRevision: 0, record: value.record }] }, options.contentId)[0]!.record;
  const normalized = JSON.stringify({ version: 1, contentId: options.contentId, sourceRevision: value.sourceRevision, ...(record === undefined ? {} : { record }) });
  return { id: digest(normalized), contentId: options.contentId, sourceRevision: value.sourceRevision, record };
}

/** Persist a one-time nomination and its receipt together; activation remains the evaluator's job. */
export async function stageDeploymentPolicy(options: { store: DurableServiceStore; policy: ReturnType<typeof readDeploymentPolicy>; now?: () => number }) {
  const { policy } = options;if (!policy.record) return { status: 'empty' as const };
  const scope = policyScope(policy.contentId), key = `${scope}deployment:${policy.id}`;
  return options.store.transaction(transaction => {
    const prior = readRecord(transaction.get(POLICY_BUCKET, key));
    if (prior) {
      if (prior.id !== policy.id || !Number.isSafeInteger(prior.baseRevision)) throw Error('Corrupt deployment policy receipt.');
      return { status: 'already-staged' as const };
    }
    // Release receipts deliberately outlive ordinary candidate retention, preventing replay on restart.
    if (transaction.scan(POLICY_BUCKET, { prefix: `${scope}deployment:`, limit: 4096 }).length >= 4096) throw Error('Deployment policy receipt capacity reached.');
    const head = readHead(transaction, scope, policy.contentId);
    const candidates = prepareCandidates({ submitter: `deployment:${policy.id}`, candidates: [{ id: `release:${policy.id}`, baseRevision: head.revision, record: policy.record! }] }, policy.contentId);
    const result = acceptCandidates(transaction, scope, head, candidates, (options.now ?? Date.now)());
    writeRecord(transaction, key, { id: policy.id, sourceRevision: policy.sourceRevision, baseRevision: head.revision, candidateId: candidates[0]!.id });
    return { status: result.receipts[0]!.status };
  });
}

export async function loadDeploymentPolicy(options: { path: string; contentId: string }) {
  const file = Bun.file(options.path);
  if (file.size > MAX_BYTES) throw Error('Deployment policy exceeds its byte limit.');
  return readDeploymentPolicy({ artifact: await file.text(), contentId: options.contentId });
}
