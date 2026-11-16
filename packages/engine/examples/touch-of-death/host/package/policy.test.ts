import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteDurableServiceStore } from '@hyperfocus/engine/server';
import { createPolicyExperiment } from '../../src/learning/experiment.ts';
import { encodePolicyRecord, readPolicyRecord } from '../../src/learning/records.ts';
import { createPolicyLearningService } from '../policy-learning/service.ts';
import { POLICY_BUCKET, policyScope, writeRecord } from '../policy-learning/records.ts';
import { readDeploymentPolicy } from '../policy-learning/deployment.ts';
import { exportDevelopmentPolicy } from './policy.ts';

const contentId = 'package-current-city';
function candidate(identity: string, seed: number) {
  const experiment = createPolicyExperiment({ seed });let trial;
  while ((trial = experiment.next())) {
    const scores = trial.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((sum, value) => sum + value, 0));
    experiment.record({ id: trial.id, ticks: 10, status: 'completed', winner: scores[0]! > scores[1]! ? 'player' : scores[0]! < scores[1]! ? 'opponent' : 'draw' });
  }
  const evidence = experiment.snapshot();expect(evidence.status).toBe('approved');
  return { id: `candidate-${seed}`, baseRevision: 0, record: encodePolicyRecord({ version: 2, identity, revision: 1, active: 'approved', previous: 'base', evidence }) };
}
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'tod-policy-export-'));
  return { path, dispose() {
    if (!resolve(path).startsWith(`${resolve(tmpdir())}${sep}tod-policy-export-`)) throw Error('Unexpected test cleanup path.');
    rmSync(path, { recursive: true, force: true });
  } };
}

test('read-only SQLite export contains only the current content champion, excluding accounts and pending candidates', async () => {
  const temp = directory(), databasePath = join(temp.path, 'development.sqlite'), store = createSqliteDurableServiceStore({ path: databasePath });
  const service = createPolicyLearningService({ contentId, store, async evaluate() { return { approved: true, evidence: { trusted: true } }; } });
  const other = createPolicyLearningService({ contentId: 'OTHER_CONTENT_SECRET', store, async evaluate() { return { approved: true, evidence: { trusted: true } }; } });
  const db = new Database(databasePath);
  try {
    db.run('CREATE TABLE tod_guest_accounts (user_id TEXT, secret TEXT)');
    db.run('INSERT INTO tod_guest_accounts VALUES (?,?)', ['ACCOUNT_PRIVATE_NAME', 'ACCOUNT_PRIVATE_SECRET']);
    await service.submit({ submitter: 'PRIVATE_SUBMITTER', candidates: [candidate(contentId, 123)] });await service.processNext();
    await other.submit({ submitter: 'OTHER_PRIVATE_SUBMITTER', candidates: [candidate('OTHER_CONTENT_SECRET', 789)] });await other.processNext();
    const dangling = { ...candidate(contentId, 456), id: 'DANGLING_CANDIDATE_PRIVATE', baseRevision: 1 };
    await service.submit({ submitter: 'UNFINISHED_SUBMITTER', candidates: [dangling] });
    const before = await store.exportRecords(), champion = await service.read();
    const artifact = exportDevelopmentPolicy({ databasePath, contentId, required: true });
    const decoded = readDeploymentPolicy({ artifact, contentId });
    expect(decoded.sourceRevision).toBe(champion.revision);expect(decoded.record).toBe(champion.record);
    expect(readPolicyRecord(decoded.record, contentId).evidence?.approved).toEqual(champion.policy);
    for (const secret of ['ACCOUNT_PRIVATE_NAME', 'ACCOUNT_PRIVATE_SECRET', 'OTHER_CONTENT_SECRET', 'PRIVATE_SUBMITTER', 'UNFINISHED_SUBMITTER', 'DANGLING_CANDIDATE_PRIVATE']) expect(artifact).not.toContain(secret);
    expect(await store.exportRecords()).toEqual(before);
    expect(db.query('SELECT * FROM tod_guest_accounts').all()).toEqual([{ user_id: 'ACCOUNT_PRIVATE_NAME', secret: 'ACCOUNT_PRIVATE_SECRET' }]);
    expect(exportDevelopmentPolicy({ databasePath, contentId })).toBe(artifact);
  } finally { await service.dispose();await other.dispose();db.close();store.close();temp.dispose(); }
});

test('missing optional databases and missing content export an empty artifact without creating or importing data', async () => {
  const temp = directory(), databasePath = join(temp.path, 'missing.sqlite');
  try {
    const empty = readDeploymentPolicy({ artifact: exportDevelopmentPolicy({ databasePath, contentId }), contentId });
    expect(empty.sourceRevision).toBe(0);expect(empty.record).toBeUndefined();expect(existsSync(databasePath)).toBe(false);
    expect(() => exportDevelopmentPolicy({ databasePath, contentId, required: true })).toThrow('does not exist');
    expect(existsSync(databasePath)).toBe(false);
    const store = createSqliteDurableServiceStore({ path: databasePath });
    const service = createPolicyLearningService({ contentId: 'other-city', store, async evaluate() { return { approved: true, evidence: {} }; } });
    try {
      await service.submit({ submitter: 'someone', candidates: [candidate('other-city', 123)] });await service.processNext();
      const before = await store.exportRecords();
      const absent = readDeploymentPolicy({ artifact: exportDevelopmentPolicy({ databasePath, contentId, required: true }), contentId });
      expect(absent.record).toBeUndefined();expect(absent.sourceRevision).toBe(0);expect(await store.exportRecords()).toEqual(before);
    } finally { await service.dispose();store.close(); }
  } finally { temp.dispose(); }
});

test('legacy champion records are normalized before export so ignored metadata cannot leak', async () => {
  const temp = directory(), databasePath = join(temp.path, 'legacy.sqlite'), store = createSqliteDurableServiceStore({ path: databasePath });
  const service = createPolicyLearningService({ contentId, store, async evaluate() { return { approved: true, evidence: {} }; } });
  try {
    await service.submit({ submitter: 'player', candidates: [candidate(contentId, 123)] });await service.processNext();
    const head = await service.read(), legacy = { ...readPolicyRecord(head.record, contentId), ignoredAccountToken: 'LEGACY_SECRET_MUST_NOT_SHIP' };
    const legacyRecord = encodePolicyRecord(legacy);
    await store.transaction(transaction => writeRecord(transaction, `${policyScope(contentId)}head`, { ...head, record: legacyRecord }));
    const before = await store.exportRecords(), artifact = exportDevelopmentPolicy({ databasePath, contentId, required: true });
    expect(artifact).not.toContain('LEGACY_SECRET_MUST_NOT_SHIP');
    expect(readDeploymentPolicy({ artifact, contentId }).record).toBe(head.record);
    expect(await store.exportRecords()).toEqual(before);
  } finally { await service.dispose();store.close();temp.dispose(); }
});

test('corrupt or unrelated database files fail instead of substituting an unverified champion', async () => {
  const temp = directory(), invalid = join(temp.path, 'invalid.sqlite'), noTables = join(temp.path, 'empty.sqlite');
  try {
    writeFileSync(invalid, 'THIS_IS_NOT_A_DATABASE');
    expect(() => exportDevelopmentPolicy({ databasePath: invalid, contentId })).toThrow();
    new Database(noTables, { create: true }).close();
    expect(() => exportDevelopmentPolicy({ databasePath: noTables, contentId })).toThrow('no durable policy storage');
    const databasePath = join(temp.path, 'corrupt-head.sqlite'), store = createSqliteDurableServiceStore({ path: databasePath });
    const service = createPolicyLearningService({ contentId, store, async evaluate() { return { approved: true, evidence: {} }; } });
    try {
      await service.submit({ submitter: 'player', candidates: [candidate(contentId, 123)] });await service.processNext();
      const head = await service.read(), key = `${policyScope(contentId)}head`;
      for (const invalidHead of [undefined, { ...head, contentId: 'wrong-content' }, { ...head, record: '{corrupt' },
        { ...head, policy: { ...head.policy!, scores: { approach: 2 } } }]) {
        await store.transaction(transaction => invalidHead === undefined ? transaction.put(POLICY_BUCKET, key, '{corrupt') : writeRecord(transaction, key, invalidHead));
        const before = await store.exportRecords();
        expect(() => exportDevelopmentPolicy({ databasePath, contentId })).toThrow();expect(await store.exportRecords()).toEqual(before);
      }
    } finally { await service.dispose();store.close(); }
  } finally { temp.dispose(); }
});
