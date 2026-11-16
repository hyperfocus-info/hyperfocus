import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createSwarmStore, transitionSwarm } from './store';
import { swarmFixture } from '../test-fixtures';

test('durable creation is idempotent and rejects a changed request under the same key', () => {
  const fixture = swarmFixture();
  try {
    expect(fixture.store.create({ ...fixture.run, id: 'second-id' }).id).toBe(fixture.run.id);
    expect(() => fixture.store.create({ ...fixture.run, id: 'second-id', request: { ...fixture.request, goal: 'Different intent' } })).toThrow('Idempotency');
    expect(fixture.store.list()).toHaveLength(1);
  } finally { fixture.db.close(); }
});

test('task graph schedules baseline first, then independent investigations under declared concurrency and capabilities', () => {
  const fixture = swarmFixture({ maxWorkers: 2 });
  try {
    expect(fixture.claim('reasoner', ['reasoning'])).toBeUndefined();
    const baseline = fixture.claim()!; expect(baseline.kind).toBe('baseline');
    expect(fixture.claim()).toBeUndefined(); fixture.finish(baseline);
    const a = fixture.claim()!, b = fixture.claim()!;
    expect(a.kind).toBe('investigate'); expect(b.kind).toBe('investigate');
    expect(a.candidateId).not.toBe(b.candidateId); expect(fixture.claim()).toBeUndefined();
    fixture.finish(a); expect(fixture.claim('validator', ['execution'])?.kind).toBe('validate');
  } finally { fixture.db.close(); }
});

test('failed tasks retry only within their bounded attempts and dependent validation is blocked', () => {
  const fixture = swarmFixture();
  try {
    fixture.finish(fixture.claim()!);
    const first = fixture.claim()!; fixture.finish(first, 'temporary provider failure');
    const second = fixture.claim()!; expect(second.id).toBe(first.id); expect(second.leaseFence).toBeGreaterThan(first.leaseFence);
    expect(fixture.store.get(fixture.run.id)!.messages.some(message => message.taskId === first.id && message.text.includes('temporary provider failure'))).toBe(true);
    fixture.finish(second, 'second failure');
    const next = fixture.claim()!; expect(next.candidateId).not.toBe(first.candidateId);
    const failed = fixture.store.get(fixture.run.id)!;
    expect(failed.tasks.find(task => task.id === first.id)?.status).toBe('FAILED');
    expect(failed.tasks.find(task => task.kind === 'validate' && task.candidateId === first.candidateId)?.status).toBe('BLOCKED');
    expect(failed.metrics.failedTasks).toBe(2);
  } finally { fixture.db.close(); }
});

test('readiness resolves failed dependencies without reserving resources and leaves failed joins claimable', () => {
  const fixture = swarmFixture();
  try {
    fixture.finish(fixture.claim()!);
    fixture.store.change(fixture.run.id, run => { for (const task of run.tasks) if (task.kind === 'investigate') task.status = 'FAILED'; });
    const reserved = fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd;
    expect(fixture.store.readyTask({ runId: fixture.run.id, capabilities: ['execution'] })).toBeUndefined();
    const waiting = fixture.store.get(fixture.run.id)!;
    expect(waiting.tasks.filter(task => task.kind === 'validate').every(task => task.status === 'BLOCKED')).toBe(true);
    expect(waiting.metrics.computeEstimatedUsd).toBe(reserved);
    const ready = fixture.store.readyTask({ runId: fixture.run.id, capabilities: ['benchmark'] })!;
    expect(ready.kind).toBe('benchmark'); expect(ready.status).toBe('PENDING'); expect(ready.attempt).toBe(0);
    expect(fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd).toBe(reserved);
    expect(fixture.claim('measurer', ['benchmark'])?.id).toBe(ready.id);
  } finally { fixture.db.close(); }
});

test('expired worker lease recovers once, fences stale completion and preserves completed work', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    const baseline = fixture.claim()!; fixture.finish(baseline);
    const stale = fixture.claim()!; now += 1001;
    expect(fixture.store.recover()).toEqual([stale.id]); expect(fixture.store.recover()).toEqual([]);
    const replacement = fixture.claim('replacement')!;
    expect(replacement.id).toBe(stale.id); expect(replacement.leaseFence).toBeGreaterThan(stale.leaseFence);
    expect(() => fixture.finish(stale)).toThrow('Stale'); fixture.finish(replacement);
    expect(fixture.store.get(fixture.run.id)?.tasks.find(task => task.id === baseline.id)?.status).toBe('SUCCEEDED');
  } finally { fixture.db.close(); }
});

test('an exhausted baseline lease fails the run instead of leaving an unrecoverable running graph', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now, maxRetries: 0 });
  try {
    fixture.claim(); now += 1001; fixture.store.recover();
    expect(fixture.store.get(fixture.run.id)?.status).toBe('FAILED');
    expect(fixture.claim()).toBeUndefined();
  } finally { fixture.db.close(); }
});

test('recovery clears workspace ownership and cannot reclaim until the old environment is destroyed', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    const task = fixture.claim()!;
    fixture.store.workspace({ id: 'old-environment', provider: 'railway', swarmId: fixture.run.id, taskId: task.id, sourceRevision: fixture.request.repository.revision, root: '/workspace', resources: { cpu: 2, memoryGB: 2 }, lane: 'investigation', createdAt: new Date().toISOString() });
    fixture.store.change(fixture.run.id, run => { run.tasks[0]!.workspaceId = 'old-environment'; });
    now += 1001; fixture.store.recover();
    expect(fixture.store.get(fixture.run.id)!.tasks[0]!.workspaceId).toBeUndefined();
    expect(fixture.claim('replacement')).toBeUndefined();
    fixture.store.destroyed('old-environment');
    expect(fixture.claim('replacement')?.id).toBe(task.id);
  } finally { fixture.db.close(); }
});

test('recovery scans active runs beyond the bounded UI history', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    const task = fixture.claim()!;
    for (let index = 0; index < 201; index++) fixture.store.create({ ...fixture.run, id: `history-${index}`, request: { ...fixture.request, requestId: `history-${index}` }, status: 'COMPLETED', tasks: [], candidates: [] });
    expect(fixture.store.list()).toHaveLength(200); expect(fixture.store.list().some(run => run.id === fixture.run.id)).toBe(false);
    expect(fixture.store.activeRuns().map(run => run.id)).toEqual([fixture.run.id]);
    now += 1001; expect(fixture.store.recover()).toEqual([task.id]);
  } finally { fixture.db.close(); }
});

test('late model usage is still recorded after cancellation without reopening a stopped run', () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.claim()!;
    fixture.store.reserveModel(fixture.run.id, task.id, 20, 0);
    fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED'));
    fixture.store.settleModel({ runId: fixture.run.id, taskId: task.id, reservedTokens: 20, reservedCost: 0, inputTokens: 15, outputTokens: 10, costUsd: 0 });
    const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('CANCELLED'); expect(run.metrics.inputTokens).toBe(15); expect(run.metrics.outputTokens).toBe(10); expect(run.metrics.modelReportedUsd).toBe(0);
  } finally { fixture.db.close(); }
});

test('reported task overage stops that worker without blocking siblings', () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.claim()!;
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTokensPerAgent = 256; run.request.budget.maxModelUsd = 0; });
    fixture.store.reserveModel(fixture.run.id, task.id, 10, 0);
    fixture.store.settleModel({ runId: fixture.run.id, taskId: task.id, reservedTokens: 10, reservedCost: 0, inputTokens: 90, outputTokens: 10, costUsd: 0 });
    expect(fixture.store.get(fixture.run.id)!.status).toBe('RUNNING'); expect(fixture.store.get(fixture.run.id)!.budgetExhausted).toBe(false);
    fixture.store.reserveModel(fixture.run.id, task.id, 120, 0);
    expect(() => fixture.store.settleModel({ runId: fixture.run.id, taskId: task.id, reservedTokens: 120, reservedCost: 0, inputTokens: 150, outputTokens: 20, costUsd: 0 })).toThrow('task tokens');
    const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('RUNNING'); expect(run.budgetExhausted).toBe(false); expect(run.metrics.inputTokens + run.metrics.outputTokens).toBe(270);
    expect(run.budgetRejection).toMatchObject({scope:'task',dimension:'tokens',phase:'reported-usage',used:270,limit:256});
    expect(() => fixture.store.reserveModel(fixture.run.id, task.id, 1, 0)).toThrow('MODEL_BUDGET_EXHAUSTED');
  } finally { fixture.db.close(); }
});

test('subscription estimates preserve reported tokens without fabricating reported charges', () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.claim()!;
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxModelUsd = 0; });
    fixture.store.reserveModel(fixture.run.id, task.id, 20_000, 0);
    fixture.store.settleModel({ runId: fixture.run.id, taskId: task.id, reservedTokens: 20_000, reservedCost: 0, inputTokens: 10_177, outputTokens: 10, costUsd: 0, costSource: 'estimated' });
    const run = fixture.store.get(fixture.run.id)!;
    expect(run.metrics.inputTokens).toBe(10_177); expect(run.metrics.outputTokens).toBe(10);
    expect(run.metrics.modelEstimatedUsd).toBe(0); expect(run.metrics.modelReportedUsd).toBeNull();
    expect(run.status).toBe('RUNNING'); expect(run.budgetExhausted).toBe(false);
  } finally { fixture.db.close(); }
});

test('model reservations reject unknown task ownership and negative estimates', () => {
  const fixture = swarmFixture();
  try {
    expect(() => fixture.store.reserveModel(fixture.run.id, 'unknown-task', 100, 0.1)).toThrow();
    const task = fixture.run.tasks[0]!;
    fixture.store.reserveModel(fixture.run.id, task.id, 100, 0.1);
    expect(() => fixture.store.reserveModel(fixture.run.id, task.id, -50, -0.05)).toThrow();
    expect(fixture.store.get(fixture.run.id)?.metrics.modelEstimatedUsd).toBe(0.1);
  } finally { fixture.db.close(); }
});

test('resource lease is exclusive, renewal is fenced, and a stale release cannot unlock its replacement', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    const first = fixture.store.lease('benchmark-worker', 'first', 1000);
    expect(() => fixture.store.lease('benchmark-worker', 'second', 1000)).toThrow('occupied');
    now += 500; fixture.store.renewLease(first, 1000); now += 600; fixture.store.assertLease(first);
    now += 401; const second = fixture.store.lease('benchmark-worker', 'second', 1000);
    expect(second.fence).toBeGreaterThan(first.fence); expect(() => fixture.store.renewLease(first, 1000)).toThrow('lost');
    fixture.store.releaseLease(first); fixture.store.assertLease(second);
  } finally { fixture.db.close(); }
});

test('task recovery fences its benchmark resource even when the resource heartbeat expired later', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    const task = fixture.claim()!, resource = fixture.store.lease('benchmark-lane', task.id, 30_000);
    now += 1001; fixture.store.recover();
    expect(() => fixture.store.renewLease(resource, 30_000)).toThrow('lost');
    const next = fixture.store.lease('benchmark-lane', task.id, 30_000);
    expect(next.fence).toBeGreaterThan(resource.fence);
    fixture.store.releaseLease(resource); fixture.store.assertLease(next);
  } finally { fixture.db.close(); }
});

test('messages deduplicate and reject unknown actors and stale source revisions', () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.run.tasks[0]!;
    const message = { id: 'finding-1', swarmId: fixture.run.id, taskId: task.id, agentId: task.agentId, sourceRevision: fixture.request.repository.revision,
      kind: 'evidence' as const, text: 'Measured source-owned preparation.', artifactIds: [], createdAt: Date.now() };
    fixture.store.message(message); fixture.store.message(message);
    expect(fixture.store.get(fixture.run.id)?.messages).toHaveLength(1);
    expect(fixture.store.get(fixture.run.id)?.metrics.firstFindingAt).toBeDefined();
    expect(() => fixture.store.message({ ...message, id: 'bad-actor', agentId: 'unknown' })).toThrow('actor');
    expect(() => fixture.store.message({ ...message, id: 'bad-revision', sourceRevision: 'other' })).toThrow('revision');
  } finally { fixture.db.close(); }
});

test('invalid lifecycle transitions roll back atomically and terminal runs cannot restart', () => {
  const fixture = swarmFixture();
  try {
    expect(() => fixture.store.change(fixture.run.id, run => { run.reason = 'must not persist'; transitionSwarm(run, 'COMPLETED'); })).toThrow('Invalid');
    expect(fixture.store.get(fixture.run.id)?.reason).toBeUndefined();
    fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED'));
    expect(() => fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'RUNNING'))).toThrow('Invalid');
    expect(fixture.claim()).toBeUndefined();
  } finally { fixture.db.close(); }
});

test('compute reservation stops before provisioning and model reservations enforce cumulative limits', () => {
  const fixture = swarmFixture({ maxComputeUsd: 0 });
  try {
    expect(fixture.claim()).toBeUndefined();
    expect(fixture.store.get(fixture.run.id)?.status).toBe('BLOCKED');
    expect(fixture.store.get(fixture.run.id)?.budgetExhausted).toBe(true);
  } finally { fixture.db.close(); }
  const model = swarmFixture();
  try {
    model.store.change(model.run.id, run => { run.request.budget.maxCallsPerAgent = 1; run.request.budget.maxModelUsd = 0.5; });
    const task = model.run.tasks[0]!;
    model.store.reserveModel(model.run.id, task.id, 100, 0.1);
    expect(() => model.store.reserveModel(model.run.id, task.id, 100, 0.1)).toThrow('MODEL_BUDGET_EXHAUSTED');
    expect(model.store.get(model.run.id)?.metrics.modelCalls).toBe(1);
    expect(model.store.get(model.run.id)?.metrics.modelEstimatedUsd).toBe(0.1);
  } finally { model.db.close(); }
});

test('run deadlines stop new work without losing completed evidence', () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now });
  try {
    fixture.finish(fixture.claim()!); now += fixture.request.budget.maxDurationMs + 1;
    expect(fixture.store.readyTask({ runId: fixture.run.id, capabilities: ['execution', 'reasoning', 'benchmark'] })).toBeUndefined();
    expect(fixture.claim()).toBeUndefined(); expect(fixture.store.get(fixture.run.id)?.status).toBe('TIMED_OUT');
    expect(fixture.store.get(fixture.run.id)?.tasks[0]?.status).toBe('SUCCEEDED');
  } finally { fixture.db.close(); }
});

test('file-backed reopen retains source, partial findings, task completion and model accounting', () => {
  const parent = resolve(import.meta.dir, '../../../../../../.local/swarm-tests'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(resolve(parent, 'restart-')), file = resolve(directory, 'state.sqlite');
  let db = new Database(file);
  try {
    const fixture = swarmFixture({ database: db }); const completed = fixture.claim()!; fixture.finish(completed);
    fixture.store.reserveModel(fixture.run.id, completed.id, 20, 0.01);
    fixture.store.message({ id: 'persisted', swarmId: fixture.run.id, taskId: completed.id, agentId: completed.agentId, sourceRevision: fixture.request.repository.revision,
      kind: 'evidence', text: 'Persist before teardown', artifactIds: [], createdAt: Date.now() });
    db.close(); db = new Database(file); const reopened = createSwarmStore({ db }), run = reopened.get(fixture.run.id)!;
    expect(run.tasks[0]?.status).toBe('SUCCEEDED'); expect(run.messages[0]?.text).toBe('Persist before teardown');
    expect(run.metrics.modelEstimatedUsd).toBe(0.01); expect(run.request.repository.revision).toBe(fixture.request.repository.revision);
  } finally {
    db.close();
    if (!resolve(directory).startsWith(parent + sep)) throw new Error('Refusing cleanup outside owned fixture root.');
    rmSync(directory, { recursive: true, force: true });
  }
});
