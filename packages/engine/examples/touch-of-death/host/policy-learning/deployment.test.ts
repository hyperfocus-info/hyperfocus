import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryDurableServiceStore, createSqliteDurableServiceStore } from '@hyperfocus/engine/server';
import { createPolicyExperiment } from '../../src/learning/experiment.ts';
import { encodePolicyRecord, readPolicyRecord } from '../../src/learning/records.ts';
import { encodeDeploymentPolicy, readDeploymentPolicy, stageDeploymentPolicy } from './deployment.ts';
import { createPolicyLearningService } from './service.ts';
import { digest, POLICY_BUCKET, policyScope, readHeadValue, readRecord } from './records.ts';

const contentId = 'deployment-city';
function candidate(seed: number) {
  const experiment = createPolicyExperiment({ seed });let trial;
  while ((trial = experiment.next())) {
    const strength = trial.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((sum, score) => sum + score, 0));
    experiment.record({ id: trial.id, status: 'completed', ticks: 10, winner: strength[0]! > strength[1]! ? 'player' : strength[0]! < strength[1]! ? 'opponent' : 'draw' });
  }
  const evidence = experiment.snapshot();expect(evidence.status).toBe('approved');
  const record = encodePolicyRecord({ version: 2, identity: contentId, revision: 1, active: 'approved', previous: 'base', evidence });
  return { evidence, record, id: `candidate-${seed}`, baseRevision: 0 };
}
function deployment(seed = 456, sourceRevision = 77) {
  const value = candidate(seed), head = { ...readHeadValue(undefined, contentId), revision: sourceRevision, policy: value.evidence.approved, record: value.record };
  return readDeploymentPolicy({ artifact: encodeDeploymentPolicy({ head }), contentId });
}
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'tod-policy-deployment-'));
  return { path, dispose() {
    if (!resolve(path).startsWith(`${resolve(tmpdir())}${sep}tod-policy-deployment-`)) throw Error('Unexpected test cleanup path.');
    rmSync(path, { recursive: true, force: true });
  } };
}

test('deployment artifacts validate content, checksum, evidence and revision without trusting approval claims', async () => {
  const empty = encodeDeploymentPolicy({ head: readHeadValue(undefined, contentId) });
  expect(readDeploymentPolicy({ artifact: empty, contentId }).record).toBeUndefined();
  const store = createMemoryDurableServiceStore();
  expect(await stageDeploymentPolicy({ store, policy: readDeploymentPolicy({ artifact: empty, contentId }) })).toEqual({ status: 'empty' });
  expect(await store.exportRecords()).toEqual([]);
  const learned = candidate(456);
  const artifact = encodeDeploymentPolicy({ head: { ...readHeadValue(undefined, contentId), revision: 77, record: learned.record, policy: learned.evidence.approved } });
  const parsed = readDeploymentPolicy({ artifact, contentId });expect(parsed.sourceRevision).toBe(77);
  expect(readDeploymentPolicy({ artifact, contentId })).toEqual(parsed);
  expect(() => readDeploymentPolicy({ artifact, contentId: 'other-content' })).toThrow();
  const payload = JSON.parse(JSON.parse(artifact).payload);
  for (const patch of [{ version: 2 }, { sourceRevision: -1 }, { sourceRevision: 0 }, { sourceRevision: 1.5 }, { record: '{corrupt' }, { contentId: 'other-content' }]) {
    const text = JSON.stringify({ ...payload, ...patch });
    expect(() => readDeploymentPolicy({ artifact: JSON.stringify({ payload: text, sha256: digest(text) }), contentId })).toThrow();
  }
  for (const invalid of ['{corrupt', '{}', JSON.stringify({ payload: '{}', sha256: 'bad' }), 'x'.repeat(1048577)]) {
    expect(() => readDeploymentPolicy({ artifact: invalid, contentId })).toThrow();
  }
});

test('development revision is nominated against the current production champion and only trusted evaluation can activate it', async () => {
  const store = createMemoryDurableServiceStore();let approved = true;
  const evaluated: Parameters<Parameters<typeof createPolicyLearningService>[0]['evaluate']>[0][] = [];
  const service = createPolicyLearningService({ contentId, store, async evaluate(request) { evaluated.push(request);return { approved, evidence: { trusted: true } }; } });
  try {
    await service.submit({ submitter: 'production-player', candidates: [candidate(123)] });await service.processNext();
    const original = await service.read();expect(original.revision).toBe(1);
    const rejected = deployment();approved = false;
    expect(await stageDeploymentPolicy({ store, policy: rejected })).toEqual({ status: 'queued' });
    expect((await service.read()).policy).toEqual(original.policy);expect(evaluated).toHaveLength(1);
    const queued = await store.exportRecords();
    const receipt = queued.find(row => row.key === `${policyScope(contentId)}deployment:${rejected.id}`);
    expect(readRecord(receipt?.value)).toMatchObject({ sourceRevision: 77, baseRevision: 1 });
    expect((await service.processNext())?.status).toBe('rejected');expect((await service.read()).policy).toEqual(original.policy);
    expect(evaluated[1]?.active).toEqual(original.policy);expect(evaluated[1]?.candidate.id).toBe(candidate(456).evidence.approved!.id);
    const passing = deployment(789, 78);approved = true;
    expect(await stageDeploymentPolicy({ store, policy: passing })).toEqual({ status: 'queued' });
    expect((await service.processNext())?.status).toBe('promoted');
    expect((await service.read()).revision).toBe(2);expect((await service.read()).policy).toEqual(candidate(789).evidence.approved);
    expect(evaluated[2]?.active).toEqual(original.policy);
  } finally { await service.dispose(); }
});

test('encoding strips valid legacy record extras before packaging and verifies champion identity', () => {
  const learned = candidate(456), head = { ...readHeadValue(undefined, contentId), revision: 77, policy: learned.evidence.approved, record: learned.record };
  const legacy = { ...readPolicyRecord(learned.record, contentId), privateAccounts: [{ recoverySecret: 'NEVER_PACKAGE_ACCOUNT_SECRET' }] };
  const legacyRecord = encodePolicyRecord(legacy);expect(legacyRecord).toContain('NEVER_PACKAGE_ACCOUNT_SECRET');
  const packaged = encodeDeploymentPolicy({ head: { ...head, record: legacyRecord } });
  expect(packaged).not.toContain('NEVER_PACKAGE_ACCOUNT_SECRET');expect(packaged).toBe(encodeDeploymentPolicy({ head }));
  expect(() => encodeDeploymentPolicy({ head: { ...head, policy: undefined } })).toThrow('does not match');
  expect(() => encodeDeploymentPolicy({ head: { ...head, record: undefined } })).toThrow('does not match');
});

test('concurrent SQLite hosts and restart stage a deployment exactly once', async () => {
  const temp = directory(), path = join(temp.path, 'production.sqlite'), policy = deployment();
  let first = createSqliteDurableServiceStore({ path }), second = createSqliteDurableServiceStore({ path });
  try {
    const results = await Promise.all([stageDeploymentPolicy({ store: first, policy }), stageDeploymentPolicy({ store: second, policy })]);
    expect(results.map(result => result.status).sort()).toEqual(['already-staged', 'queued']);
    const before = await first.exportRecords();expect(before.filter(row => row.key.includes(':deployment:'))).toHaveLength(1);
    expect(before.filter(row => row.key.includes(':candidate:'))).toHaveLength(1);
    first.close();second.close();first = createSqliteDurableServiceStore({ path });second = createSqliteDurableServiceStore({ path });
    expect(await stageDeploymentPolicy({ store: first, policy })).toEqual({ status: 'already-staged' });
    expect(await second.exportRecords()).toEqual(before);
  } finally { first.close();second.close();temp.dispose(); }
});

test('failed SQLite receipt writes roll back the nomination and retry atomically', async () => {
  const temp = directory(), path = join(temp.path, 'production.sqlite'), store = createSqliteDurableServiceStore({ path }), policy = deployment();
  const fault = new Database(path);
  try {
    fault.run("CREATE TRIGGER deny_deployment BEFORE INSERT ON durable_records WHEN NEW.bucket='combat-policy' AND NEW.key LIKE '%:deployment:%' BEGIN SELECT RAISE(ABORT,'receipt-write-failed'); END");
    await expect(stageDeploymentPolicy({ store, policy })).rejects.toThrow('receipt-write-failed');
    expect(await store.exportRecords()).toEqual([]);
    fault.run('DROP TRIGGER deny_deployment');
    expect(await stageDeploymentPolicy({ store, policy })).toEqual({ status: 'queued' });
    const saved = await store.exportRecords();expect(saved.filter(row => row.key.includes(':deployment:'))).toHaveLength(1);
    expect(saved.filter(row => row.key.includes(':candidate:'))).toHaveLength(1);
  } finally { fault.close();store.close();temp.dispose(); }
});

test('a previously staged artifact cannot replay after rollback or candidate retention cleanup', async () => {
  const store = createMemoryDurableServiceStore(), policy = deployment();
  const service = createPolicyLearningService({ contentId, store, async evaluate() { return { approved: true, evidence: { trusted: true } }; } });
  try {
    await stageDeploymentPolicy({ store, policy });await service.processNext();
    await service.rollback({ expectedRevision: 1 });
    const rolledBack = await store.exportRecords();
    expect(await stageDeploymentPolicy({ store, policy })).toEqual({ status: 'already-staged' });
    expect(await store.exportRecords()).toEqual(rolledBack);expect((await service.read()).policy).toBeUndefined();
    await service.submit({ submitter: 'other-player', candidates: [{ ...candidate(789), baseRevision: 2 }] });await service.processNext();
    const advanced = await store.exportRecords();
    expect(advanced.filter(row => row.bucket === POLICY_BUCKET && row.key.includes(':candidate:') && row.key.includes('0000000000000000'))).toHaveLength(0);
    expect(await stageDeploymentPolicy({ store, policy })).toEqual({ status: 'already-staged' });expect(await store.exportRecords()).toEqual(advanced);
    expect(await service.processNext()).toBeUndefined();expect((await service.read()).revision).toBe(3);
  } finally { await service.dispose(); }
});
