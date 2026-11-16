import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryDurableServiceStore, createSqliteDurableServiceStore, type DurableServiceStore } from '@hyperfocus/engine/server';
import { createCombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import { createPolicyExperiment } from '../../src/learning/experiment.ts';
import { encodePolicyRecord, readPolicyRecord } from '../../src/learning/records.ts';
import { createPolicyLearningService } from './service.ts';
import { candidateKey, policyScope, readRecord, POLICY_BUCKET } from './records.ts';

type Head = Awaited<ReturnType<ReturnType<typeof createPolicyLearningService>['read']>>;
type Evaluation = Parameters<typeof createPolicyLearningService>[0]['evaluate'];
function candidate(seed = 123, head?: Pick<Head, 'policy' | 'previous' | 'revision'>) {
  const experiment = createPolicyExperiment({ seed, active: head?.policy, previous: head?.previous });
  let trial;
  while ((trial = experiment.next())) {
    const scores = trial.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((sum, value) => sum + value, 0));
    experiment.record({ id: trial.id, status: 'completed', winner: scores[0]! > scores[1]! ? 'player' : scores[0]! < scores[1]! ? 'opponent' : 'draw', ticks: 100 });
  }
  const evidence = experiment.snapshot();
  expect(evidence.status).toBe('approved');
  return { id: `candidate-${seed}`, baseRevision: head?.revision ?? 0,
    record: encodePolicyRecord({ version: 2, identity: 'city', revision: 1, active: 'approved', previous: 'base', evidence }) };
}

function fixture(evaluate: Evaluation = async request => ({ approved: true, evidence: { attempt: request.attempt } }), backend = createMemoryDurableServiceStore()) {
  let time = 1000;
  const options = { store: backend, contentId: 'city', evaluate, now: () => time, leaseMs: 3000 };
  return { store: backend, open: () => createPolicyLearningService(options), advance(milliseconds: number) { time += milliseconds; } };
}

test('client-approved candidates remain staged until a trusted server evaluation promotes them', async () => {
  let calls = 0;
  const { open } = fixture(async request => { calls++; expect(request.attempt).toBe(1); expect(request.excludedSeeds.length).toBeGreaterThan(0); return { approved: true, evidence: { server: true } }; });
  const service = open(), uploaded = candidate();
  expect((await service.submit({ submitter: 'alice', candidates: [uploaded] })).receipts[0]!.status).toBe('queued');
  expect((await service.read()).revision).toBe(0);
  expect(calls).toBe(0);
  expect((await service.processNext())?.status).toBe('promoted');
  const head = await service.read();
  expect(head.revision).toBe(1); expect(head.record).toBe(uploaded.record); expect(head.policy).toBeDefined();
  expect(calls).toBe(1);
  await service.dispose();
});

test('rejected trusted evaluation cannot activate locally passing weights', async () => {
  const { open } = fixture(async () => ({ approved: false, reason: 'held-out regression', evidence: { seeds: [77] } }));
  const service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] });
  expect((await service.processNext())?.status).toBe('rejected');
  expect((await service.read()).policy).toBeUndefined();
  expect((await service.read()).revision).toBe(0);
  await service.dispose();
});

test('multiple clients stage independent candidates; promotion makes the remaining base revision stale', async () => {
  const { open } = fixture(), first = open(), second = open();
  const a = candidate(), b = candidate(456);
  const results = await Promise.all([first.submit({ submitter: 'alice', candidates: [a] }), second.submit({ submitter: 'bob', candidates: [b] })]);
  expect(results.every(result => result.receipts[0]!.status === 'queued')).toBe(true);
  await first.processNext();
  expect(await second.processNext()).toBeUndefined();
  const head = await first.read();
  expect(head.revision).toBe(1);
  const retry = await second.submit({ submitter: 'bob', candidates: [b] });
  expect(['stale', 'promoted']).toContain(retry.receipts[0]!.status);
  expect((await second.read({ force: true })).policy).toEqual(head.policy);
  await Promise.all([first.dispose(), second.dispose()]);
});

test('idempotent batch retries do not allocate attempts or accept changed evidence under one ID', async () => {
  const { open, store } = fixture(), service = open(), uploaded = candidate();
  await service.submit({ submitter: 'alice', candidates: [uploaded] });
  const before = await store.exportRecords();
  await service.submit({ submitter: 'alice', candidates: [uploaded] });
  expect(await store.exportRecords()).toEqual(before);
  await expect(service.submit({ submitter: 'alice', candidates: [{ ...candidate(456), id: uploaded.id }] })).rejects.toThrow('reused');
  await expect(service.submit({ submitter: 'bob', candidates: [uploaded] })).rejects.toThrow('owner');
  expect(await store.exportRecords()).toEqual(before);
  await service.dispose();
});

test('uploads are one atomic bounded batch and limited to one batch per minute per verified player', async () => {
  const { open, advance, store } = fixture(), service = open(), a = candidate(), b = candidate(456);
  await service.submit({ submitter: 'alice', candidates: [a] });
  await expect(service.submit({ submitter: 'alice', candidates: [b] })).rejects.toThrow('one batch per minute');
  advance(60000);
  const before = await store.exportRecords();
  await expect(service.submit({ submitter: 'alice', candidates: [b, { ...a, record: '{broken' }] })).rejects.toThrow();
  expect(await store.exportRecords()).toEqual(before);
  await service.submit({ submitter: 'alice', candidates: [b] });
  await expect(service.submit({ submitter: 'bob', candidates: Array.from({ length: 9 }, (_, index) => ({ ...a, id: `over-${index}` })) })).rejects.toThrow('1-8');
  await service.dispose();
});

test('stale and wrong-content uploads cannot change the canonical policy or enter the queue', async () => {
  const { open, store } = fixture(), service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] }); await service.processNext();
  const before = await store.exportRecords();
  expect((await service.submit({ submitter: 'bob', candidates: [candidate(456)] })).receipts[0]!.status).toBe('stale');
  const wrong = candidate(789), record = readPolicyRecord(wrong.record, 'city'); record.identity = 'another-city';
  await expect(service.submit({ submitter: 'bob', candidates: [{ ...wrong, baseRevision: 1, record: encodePolicyRecord(record) }] })).rejects.toThrow('identity');
  expect(await store.exportRecords()).toEqual(before);
  await service.dispose();
});

test('private local branches can nominate weights but the server evaluates them against its current champion', async () => {
  const requests: Parameters<Evaluation>[0][] = [];
  const { open } = fixture(async request => { requests.push(request); return { approved: true, evidence: {} }; }), service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] }); await service.processNext();
  const head = await service.read();
  const privateBranch = candidate(456); privateBranch.baseRevision = head.revision;
  expect(readPolicyRecord(privateBranch.record, 'city').evidence?.active).toBeUndefined();
  await service.submit({ submitter: 'bob', candidates: [privateBranch] }); await service.processNext();
  expect(requests).toHaveLength(2);
  expect(requests[1]!.active).toEqual(head.policy);
  expect((await service.read()).revision).toBe(2);
  await service.dispose();
});

test('identical weights with different upload IDs are acknowledged without repeated server evaluation', async () => {
  const { open } = fixture(), service = open(), item = candidate();
  const result = await service.submit({ submitter: 'alice', candidates: [item, { ...item, id: 'duplicate' }] });
  expect(result.receipts.map(receipt => receipt.status)).toEqual(['queued', 'rejected']);
  expect((await service.submit({ submitter: 'alice', candidates: [{ ...item, id: 'duplicate' }] })).receipts[0]!.status).toBe('rejected');
  await service.dispose();
});

test('canonical nomination encoding drops irrelevant checksummed payload and preserves exact evaluated weights', async () => {
  const { open } = fixture(), service = open(), uploaded = candidate();
  const decoded = readPolicyRecord(uploaded.record, 'city');
  const padded = { ...decoded, ignoredPadding: 'x'.repeat(180000) };
  const oversized = { ...uploaded, record: encodePolicyRecord(padded) };
  await service.submit({ submitter: 'alice', candidates: [oversized] }); await service.processNext();
  const head = await service.read();
  expect(head.record).toBe(uploaded.record);
  expect(head.policy).toEqual(decoded.evidence?.approved);
  expect((await service.submit({ submitter: 'alice', candidates: [oversized] })).receipts[0]!.status).toBe('promoted');
  await service.dispose();
});

test('late concurrent evaluation results cannot overwrite a newer champion', async () => {
  const resolvers: ((result: { approved: boolean; evidence: unknown }) => void)[] = [];
  const { open } = fixture(() => new Promise(resolve => { resolvers.push(resolve); }));
  const first = open(), second = open();
  await first.submit({ submitter: 'alice', candidates: [candidate(), candidate(456)] });
  const a = first.processNext(), b = second.processNext();
  for (let index = 0; index < 10 && resolvers.length < 2; index++) await Promise.resolve();
  expect(resolvers).toHaveLength(2);
  resolvers[1]!({ approved: true, evidence: { winner: 'second' } });
  expect((await b)?.status).toBe('promoted');
  const champion = await second.read();
  resolvers[0]!({ approved: true, evidence: { winner: 'late' } });
  expect((await a)?.status).toBe('stale');
  expect((await first.read()).policy).toEqual(champion.policy);
  expect((await first.read()).revision).toBe(1);
  await Promise.all([first.dispose(), second.dispose()]);
});

test('one candidate cannot be claimed twice before lease expiry and restart consumes a new durable attempt', async () => {
  const attempts: number[] = [], resolvers: ((result: { approved: boolean; evidence: unknown }) => void)[] = [];
  const { open, advance } = fixture(request => { attempts.push(request.attempt); return new Promise(resolve => { resolvers.push(resolve); }); });
  const first = open(), second = open();
  await first.submit({ submitter: 'alice', candidates: [candidate()] });
  const original = first.processNext();
  for (let index = 0; index < 5; index++) await Promise.resolve();
  expect(await second.processNext()).toBeUndefined();
  advance(3001);
  const recovered = second.processNext();
  for (let index = 0; index < 5; index++) await Promise.resolve();
  expect(attempts).toEqual([1, 2]);
  resolvers[0]!({ approved: true, evidence: {} });
  expect((await original)?.status).toBe('stale');
  resolvers[1]!({ approved: true, evidence: {} });
  expect((await recovered)?.attempt).toBe(2);
  expect((await second.read()).revision).toBe(1);
  await Promise.all([first.dispose(), second.dispose()]);
});

test('30-minute public cache coalesces reads; failed refresh retains last-good and backs off', async () => {
  const backend = createMemoryDurableServiceStore(), transaction = backend.transaction;
  let calls = 0, fail = false;
  backend.transaction = async operation => { calls++; if (fail) throw Error('database offline'); return transaction(operation); };
  const { open, advance } = fixture(undefined, backend), service = open();
  await Promise.all(Array.from({ length: 20 }, () => service.read()));
  expect(calls).toBe(1);
  advance(1799999); await service.read(); expect(calls).toBe(1);
  advance(1); fail = true;
  expect((await service.read()).stale).toBe(true);
  const failedCalls = calls;
  await service.read(); expect(calls).toBe(failedCalls);
  advance(30000); await service.read(); expect(calls).toBe(failedCalls + 1);
  fail = false; expect((await service.read({ force: true })).stale).toBe(false);
  await service.dispose();
});

test('failed candidate batch and failed promotion writes cannot alter durable champion', async () => {
  const backend = createMemoryDurableServiceStore(), transaction = backend.transaction;
  let fail = false;
  backend.transaction = operation => transaction(tx => { const result = operation(tx); if (fail) throw Error('write failed'); return result; });
  const { open } = fixture(async () => { fail = true; return { approved: true, evidence: {} }; }, backend), service = open();
  await service.read();
  fail = true;
  await expect(service.submit({ submitter: 'alice', candidates: [candidate()] })).rejects.toThrow('write failed');
  expect(await backend.exportRecords()).toEqual([]);
  fail = false; await service.submit({ submitter: 'alice', candidates: [candidate()] });
  await expect(service.processNext()).rejects.toThrow('write failed');
  expect((await service.read()).revision).toBe(0);
  fail = false;
  expect((await service.read({ force: true })).policy).toBeUndefined();
  await service.dispose();
});

test('a transient promotion write failure leaves the claim recoverable with a new attempt after lease expiry', async () => {
  const backend = createMemoryDurableServiceStore(), transaction = backend.transaction;
  let failOnce = true;
  backend.transaction = operation => transaction(tx => operation({ ...tx,
    put(bucket, key, value) {
      if (key.endsWith(':head') && failOnce) { failOnce = false; throw Error('transient commit failure'); }
      tx.put(bucket, key, value);
    },
  }));
  const attempts: number[] = [];
  const { open, advance } = fixture(async request => { attempts.push(request.attempt); return { approved: true, evidence: {} }; }, backend), service = open();
  const uploaded = candidate();
  await service.submit({ submitter: 'alice', candidates: [uploaded] });
  await expect(service.processNext()).rejects.toThrow('transient commit failure');
  expect((await service.read()).revision).toBe(0);
  expect((await service.submit({ submitter: 'alice', candidates: [uploaded] })).receipts[0]!.status).toBe('evaluating');
  advance(3001);
  expect((await service.processNext())?.status).toBe('promoted');
  expect(attempts).toEqual([1, 2]);
  expect((await service.read()).revision).toBe(1);
  await service.dispose();
});

test('SQLite restart preserves champion, rollback, evidence and monotonically allocated attempt budget', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tod-policy-service-')), path = join(directory, 'policy.sqlite');
  let backend: DurableServiceStore | undefined;
  try {
    backend = createSqliteDurableServiceStore({ path });
    const first = createPolicyLearningService({ contentId: 'city', store: backend, evaluate: async request => ({ approved: true, evidence: { attempt: request.attempt } }) });
    await first.submit({ submitter: 'alice', candidates: [candidate()] }); await first.processNext();
    const champion = await first.read(); await first.dispose(); backend.close?.();
    backend = createSqliteDurableServiceStore({ path });
    const attempts: number[] = [];
    const second = createPolicyLearningService({ contentId: 'city', store: backend, evaluate: async request => { attempts.push(request.attempt); return { approved: true, evidence: {} }; } });
    expect((await second.read()).policy).toEqual(champion.policy);
    const rolled = await second.rollback({ expectedRevision: 1 });
    expect(rolled.revision).toBe(2); expect(rolled.policy).toBeUndefined(); expect(rolled.previous).toEqual(champion.policy);
    const restored = await second.rollback({ expectedRevision: 2 });
    expect(restored.policy).toEqual(champion.policy); expect(restored.record).toBe(champion.record);
    await second.submit({ submitter: 'bob', candidates: [candidate(456, restored)] });
    await second.processNext(); expect(attempts).toEqual([2]);
    expect((await second.read()).revision).toBe(4);
    await second.dispose();
  } finally { backend?.close?.(); rmSync(directory, { recursive: true, force: true }); }
});

test('corrupt canonical storage retains a running verified cache and never resets durable state silently', async () => {
  const { open, store } = fixture(), service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] }); await service.processNext();
  const before = await service.read();
  await store.transaction(tx => tx.put(POLICY_BUCKET, `${policyScope('city')}head`, '{broken'));
  const failed = await service.read({ force: true });
  expect(failed.policy).toEqual(before.policy); expect(failed.stale).toBe(true); expect(failed.error).toBeDefined();
  await expect(service.rollback({ expectedRevision: 1 })).rejects.toThrow();
  await expect(open().read()).rejects.toThrow();
  await service.dispose();
});

test('a missing or regressed database head cannot bypass the running coordinator last-good revision', async () => {
  const { open, store } = fixture(), service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] }); await service.processNext();
  const before = await service.read();
  await store.transaction(tx => tx.delete(POLICY_BUCKET, `${policyScope('city')}head`));
  await expect(service.submit({ submitter: 'bob', candidates: [candidate(456)] })).rejects.toThrow('regressed');
  await expect(service.processNext()).rejects.toThrow('regressed');
  expect((await service.read({ force: true })).policy).toEqual(before.policy);
  await service.dispose();
});

test('queue bounds fail the whole incoming batch without evicting earlier candidates', async () => {
  const { open, store } = fixture(), service = open();
  const branch = (index: number) => candidate(1000 + index, { revision: 0, previous: undefined, policy: createCombatAiPolicy({ id: `branch-${index}`, scores: { approach: index / 1000 } }) });
  for (let batch = 0; batch < 8; batch++) await service.submit({ submitter: `player-${batch}`, candidates: Array.from({ length: 8 }, (_, index) => ({ ...branch(batch * 8 + index), id: `queued-${batch}-${index}` })) });
  const before = await store.exportRecords();
  await expect(service.submit({ submitter: 'overflow', candidates: [{ ...branch(100), id: 'overflow' }] })).rejects.toThrow('full');
  expect(await store.exportRecords()).toEqual(before);
  const receipt = readRecord((await store.exportRecords()).find(row => row.key === candidateKey(policyScope('city'), 0, 'queued-0-0'))?.value);
  expect(receipt?.status).toBe('queued');
  await service.dispose();
});

test('lease heartbeat keeps a long trusted evaluation current and stops after completion', async () => {
  const store = createMemoryDurableServiceStore();
  const service = createPolicyLearningService({ contentId: 'city', store, leaseMs: 1000,
    evaluate: async () => { await new Promise(resolve => setTimeout(resolve, 1200)); return { approved: true, evidence: {} }; } });
  await service.submit({ submitter: 'alice', candidates: [candidate()] });
  expect((await service.processNext())?.status).toBe('promoted');
  await service.dispose();
  expect((await store.exportRecords()).some(row => row.key.endsWith(':head'))).toBe(true);
});

test('shutdown aborts in-flight evaluation without activating an approved result returned after cancellation', async () => {
  let entered: (() => void) | undefined;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const { open } = fixture(request => new Promise(resolve => {
    request.signal.addEventListener('abort', () => resolve({ approved: true, evidence: {} }), { once: true }); entered?.();
  }));
  const service = open();
  await service.submit({ submitter: 'alice', candidates: [candidate()] });
  const running = service.processNext(); await started; await service.dispose(); await running;
  const restarted = open();
  expect((await restarted.read()).revision).toBe(0);
  expect(await restarted.processNext()).toBeUndefined();
  await restarted.dispose();
});
