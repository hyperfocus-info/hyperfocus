import { expect, test } from 'bun:test';
import { createSwarmCoordinator } from './coordinator';
import { taskAttemptKey, transitionSwarm } from './persistence/store';
import { deferred, executionFixture, swarmFixture, until } from './test-fixtures';

test('coordinator executes the real graph under concurrency limits and resumes completed stages from persistence', async () => {
  const fixture = swarmFixture({ maxWorkers: 2 }), execution = executionFixture(), completed: string[] = [];
  let concurrent = 0, peak = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, maxWorkers: 2,
    handleTask: async ({ task, run }) => {
      concurrent++; peak = Math.max(peak, concurrent);
      await Promise.resolve();
      for (const dependency of task.dependencies) expect(fixture.store.get(run.id)?.tasks.find(value => value.id === dependency)?.status).toBe('SUCCEEDED');
      completed.push(task.id); concurrent--;
      if (task.kind === 'compare') fixture.store.change(run.id, value => transitionSwarm(value, 'AWAITING_APPROVAL'));
    },
  });
  try {
    await coordinator.drain();
    expect(peak).toBeLessThanOrEqual(2); expect(peak).toBeGreaterThan(1);
    expect(completed).toHaveLength(fixture.run.tasks.length);
    expect(new Set(completed).size).toBe(completed.length);
    expect(fixture.store.get(fixture.run.id)?.status).toBe('AWAITING_APPROVAL');
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('coordinator cancellation reaches active workers, prevents new tasks and destroys recorded environments', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), began = deferred(), stopped = deferred();
  let executed = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    handleTask: async ({ run, task, signal }) => {
      executed++;
      const workspace = await execution.provider.createWorkspace({ swarmId: run.id, taskId: task.id, source: { revision: run.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
      fixture.store.workspace(workspace); fixture.store.change(run.id, value => { value.tasks.find(current => current.id === task.id)!.workspaceId = workspace.id; }); began.resolve();
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { stopped.resolve(); resolve(); }, { once: true }));
      signal.throwIfAborted();
    },
  });
  try {
    await coordinator.tick(); await began.promise; coordinator.cancel(fixture.run.id); await stopped.promise; await coordinator.drain(); await coordinator.cleanup();
    expect(executed).toBe(1); expect(fixture.store.get(fixture.run.id)?.status).toBe('CANCELLED');
    expect(execution.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
    expect(fixture.store.get(fixture.run.id)?.tasks.every(task => task.status === 'CANCELLED')).toBe(true);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('bounded baseline failures become FAILED without launching candidate investigations', async () => {
  const fixture = swarmFixture(), execution = executionFixture(); let attempts = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => { attempts++; throw new Error('Provider unavailable'); } });
  try {
    await coordinator.drain(); expect(attempts).toBe(2);
    expect(fixture.store.get(fixture.run.id)?.status).toBe('FAILED');
    expect(fixture.store.get(fixture.run.id)?.tasks.filter(task => task.kind === 'investigate').every(task => task.attempt === 0)).toBe(true);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('coordinator rejects unavailable backends and does not start review-gated plans', async () => {
  const fixture = swarmFixture(), execution = executionFixture(); let calls = 0;
  fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED'));
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => { calls++; } });
  try {
    expect(() => coordinator.create({ ...fixture.request, backend: 'local' })).toThrow('fallback');
    const run = coordinator.create({ ...fixture.request, requestId: 'review-plan' });
    await coordinator.tick(); expect(run.status).toBe('READY'); expect(calls).toBe(0);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('explicit work kind is checked against the host recipe before planning without changing legacy requests', async () => {
  const fixture=swarmFixture(),execution=executionFixture();
  const coordinator=createSwarmCoordinator({store:fixture.store,provider:execution.provider,
    executionKind:projectId=>projectId==='engineering-project'?'engineering':'performance',handleTask:async()=>{throw Error('No execution expected');}});
  try{
    expect(()=>coordinator.create({...fixture.request,requestId:'mismatch',executionKind:'engineering'})).toThrow('supports performance work');
    expect(()=>coordinator.create({...fixture.request,requestId:'reverse-mismatch',projectId:'engineering-project',executionKind:'performance'})).toThrow('supports engineering work');
    const engineering=coordinator.create({...fixture.request,requestId:'matching-kind',projectId:'engineering-project',executionKind:'engineering',reviewPlan:true});
    expect(engineering.executionKind).toBe('engineering');expect(engineering.tasks.some(task=>task.kind==='benchmark')).toBe(false);
    expect(coordinator.create({...fixture.request,requestId:'legacy-kind',reviewPlan:true}).executionKind).toBe('performance');
    expect(execution.workspaces.size).toBe(0);
  }finally{await coordinator.close();fixture.db.close();}
});

test('closed coordinator rejects new creation and plan starts without changing durable state', async () => {
  const fixture = swarmFixture(), execution = executionFixture(); let calls = 0;
  fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED'));
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => { calls++; } });
  try {
    const prepared = coordinator.create({ ...fixture.request, requestId: 'prepared-before-close' });
    await coordinator.close();
    expect(() => coordinator.start(prepared.id)).toThrow('closed');
    expect(() => coordinator.create({ ...fixture.request, requestId: 'created-after-close' })).toThrow('closed');
    expect(fixture.store.get(prepared.id)).toEqual(prepared);
    expect(fixture.store.list()).toHaveLength(2); expect(calls).toBe(0);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('orphan recovery destroys unknown environments and retains a live baseline owner', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), baseline = fixture.claim()!;
  const owned = await execution.provider.createWorkspace({ swarmId: fixture.run.id, taskId: baseline.id, source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
  fixture.store.workspace(owned);
  fixture.store.change(fixture.run.id, run => { run.tasks.find(task => task.id === baseline.id)!.workspaceId = owned.id; });
  const orphan = await execution.provider.forkWorkspace({ workspace: owned, taskId: 'orphan' });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  try {
    await coordinator.recoverOrphans();
    expect(execution.destroyed).toContain(orphan.id); expect(execution.workspaces.has(owned.id)).toBe(true);
  } finally { fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED')); await coordinator.close(); fixture.db.close(); }
});

test('recovery destroys superseded and expired workspaces even while their task remains RUNNING', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), baseline = fixture.claim()!;
  const stale = await execution.provider.createWorkspace({ swarmId: fixture.run.id, taskId: baseline.id, source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
  const current = await execution.provider.forkWorkspace({ workspace: stale, taskId: baseline.id });
  fixture.store.workspace(stale); fixture.store.workspace(current);
  fixture.store.change(fixture.run.id, run => { run.tasks.find(task => task.id === baseline.id)!.workspaceId = current.id; });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  try {
    await coordinator.recoverOrphans();
    expect(execution.destroyed).toContain(stale.id); expect(execution.workspaces.has(current.id)).toBe(true);
    fixture.store.change(fixture.run.id, run => { run.tasks.find(task => task.id === baseline.id)!.leaseUntil = Date.now() - 1; });
    await coordinator.recoverOrphans();
    expect(execution.destroyed).toContain(current.id); expect(execution.workspaces.size).toBe(0);
  } finally { fixture.store.change(fixture.run.id, run => transitionSwarm(run, 'CANCELLED')); await coordinator.close(); fixture.db.close(); }
});

test('human approval requires patch, passed correctness, qualified performance and no blockers', async () => {
  const fixture = swarmFixture(), execution = executionFixture();
  fixture.store.change(fixture.run.id, run => { transitionSwarm(run, 'COMPARING'); transitionSwarm(run, 'AWAITING_APPROVAL'); });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  const id = fixture.run.candidates[0]!.id;
  try {
    expect(() => coordinator.approve(fixture.run.id, id)).toThrow('gates');
    fixture.store.change(fixture.run.id, run => { const candidate = run.candidates[0]!; candidate.correctness = 'passed'; candidate.patchArtifactId = 'patch'; candidate.comparison = { decision: 'IMPROVED', reasons: [] }; candidate.blockers = ['Image repeatability']; });
    expect(() => coordinator.approve(fixture.run.id, id)).toThrow('gates');
    fixture.store.change(fixture.run.id, run => { run.candidates[0]!.blockers = []; });
    expect(coordinator.approve(fixture.run.id, id).integration?.status).toBe('approved');
    expect(() => coordinator.approve(fixture.run.id, id)).toThrow('already approved');
    expect(() => coordinator.reject(fixture.run.id, id)).toThrow('already approved');
    expect(() => coordinator.integrated(fixture.run.id, { candidateId: 'other', status: 'integrated', detail: 'Wrong candidate' })).toThrow('approved');
    expect(coordinator.integrated(fixture.run.id, { candidateId: id, status: 'conflict', detail: 'Source changed' }).status).toBe('AWAITING_APPROVAL');
    coordinator.reject(fixture.run.id, id);
    expect(() => coordinator.approve(fixture.run.id, id)).toThrow('gates');
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('active lease loss aborts an old coordinator without completing a recovered task', async () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now }), execution = executionFixture(), began = deferred();
  let aborted = false;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, leaseMs: 30,
    handleTask: async ({ signal }) => { began.resolve(); await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true })); signal.throwIfAborted(); },
  });
  try {
    await coordinator.tick(); await began.promise; now += 31; fixture.store.recover(); await until(() => aborted);
    const run = fixture.store.get(fixture.run.id)!; expect(run.tasks[0]?.status).toBe('PENDING'); expect(run.tasks[0]?.leaseFence).toBeGreaterThan(1);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('recovery waits for the previous process to stop and its workspace to be destroyed before retrying', async () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now }), execution = executionFixture();
  const began = deferred(), stopping = deferred(), stopped = deferred(), order: string[] = [];
  const destroy = execution.provider.destroyWorkspace;
  execution.provider.destroyWorkspace = async input => { order.push('destroy'); await destroy(input); };
  let attempts = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, leaseMs: 30,
    handleTask: async ({ run, task, signal }) => {
      attempts++; order.push(`attempt-${attempts}`);
      if (attempts > 1) throw new Error('Bounded fixture retry');
      const workspace = await execution.provider.createWorkspace({ swarmId: run.id, taskId: task.id, source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
      fixture.store.workspace(workspace); fixture.store.change(run.id, value => { value.tasks[0]!.workspaceId = workspace.id; }); began.resolve();
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { stopping.resolve(); resolve(); }, { once: true }));
      await stopped.promise; order.push('stopped'); signal.throwIfAborted();
    },
  });
  try {
    await coordinator.tick(); await began.promise; now += 31;
    const recovery = coordinator.tick(); await stopping.promise;
    expect(attempts).toBe(1); expect(order).not.toContain('destroy');
    stopped.resolve(); await recovery; await until(() => attempts === 2);
    expect(order).toEqual(['attempt-1', 'stopped', 'destroy', 'attempt-2']);
  } finally { stopped.resolve(); await coordinator.close(); fixture.db.close(); }
});

test('failed stale-workspace cleanup blocks a retry until destruction succeeds', async () => {
  let now = Date.now(); const fixture = swarmFixture({ now: () => now }), execution = executionFixture(), task = fixture.claim()!;
  const workspace = await execution.provider.createWorkspace({ swarmId: fixture.run.id, taskId: task.id, source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
  fixture.store.workspace(workspace); fixture.store.change(fixture.run.id, run => { run.tasks[0]!.workspaceId = workspace.id; });
  const destroy = execution.provider.destroyWorkspace; let failCleanup = true, calls = 0;
  execution.provider.destroyWorkspace = async input => { if (failCleanup) throw new Error('Provider unavailable'); await destroy(input); };
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => { calls++; throw new Error('Bounded retry'); } });
  try {
    now += 1001; await coordinator.tick(); expect(calls).toBe(0); expect(execution.workspaces.size).toBe(1);
    failCleanup = false; await coordinator.tick(); await until(() => calls === 1);
    expect(execution.workspaces.size).toBe(0);
  } finally { failCleanup = false; await coordinator.close(); fixture.db.close(); }
});

test('orphan adoption recognizes only the currently leased attempt identity', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), task = fixture.claim()!;
  const current = await execution.provider.createWorkspace({ swarmId: fixture.run.id, taskId: taskAttemptKey(task), source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' }, lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
  const stale = await execution.provider.forkWorkspace({ workspace: current, taskId: taskAttemptKey({ ...task, leaseFence: task.leaseFence - 1 }) });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  try {
    await coordinator.recoverOrphans();
    expect(execution.destroyed).toContain(stale.id); expect(execution.workspaces.has(current.id)).toBe(true);
    expect(fixture.store.workspaces()[0]!.taskId).toBe(task.id);
    expect(fixture.store.get(fixture.run.id)!.tasks[0]!.workspaceId).toBe(current.id);
  } finally { coordinator.cancel(fixture.run.id); await coordinator.close(); fixture.db.close(); }
});

test('scheduler does not hide an active run behind more than 200 completed history rows', async () => {
  const fixture = swarmFixture(), execution = executionFixture(); let calls = 0;
  for (let index = 0; index < 201; index++) fixture.store.create({ ...fixture.run, id: `completed-${index}`, request: { ...fixture.request, requestId: `completed-${index}` }, status: 'COMPLETED', tasks: [], candidates: [] });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => { calls++; throw new Error('Fixture baseline failed'); } });
  try { await coordinator.drain(); expect(calls).toBe(2); expect(fixture.store.get(fixture.run.id)!.status).toBe('FAILED'); }
  finally { await coordinator.close(); fixture.db.close(); }
});

test('dispatch admission blocks resumed queued work before reservation or provisioning', async () => {
  const fixture = swarmFixture(), execution = executionFixture(); let calls = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    beforeDispatch: async () => ({ available: false, reason: 'Subscription account is unavailable; no paid API fallback.' }), handleTask: async () => { calls++; },
  });
  try {
    await coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('BLOCKED'); expect(run.reason).toContain('Subscription account');
    expect(run.tasks.every(task => task.attempt === 0)).toBe(true); expect(run.metrics.computeEstimatedUsd).toBe(0); expect(calls).toBe(0);
  } finally { await coordinator.close(); fixture.db.close(); }
});

for (const waiting of ['baseline', 'investigation dependencies', 'investigation capacity'] as const) test(`idle ticks during ${waiting} skip admission until another task is ready`, async () => {
  const fixture = swarmFixture({ maxWorkers: waiting === 'investigation capacity' ? 1 : 3 }), execution = executionFixture(), began = deferred(), release = deferred();
  if (waiting !== 'baseline') fixture.finish(fixture.claim()!);
  if (waiting === 'investigation dependencies') fixture.store.change(fixture.run.id, run => {
    const investigations = run.tasks.filter(task => task.kind === 'investigate');
    for (const task of investigations.slice(1)) task.dependencies = [investigations[0]!.id];
  });
  let admissionCalls = 0, calls = 0, available = true;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    beforeDispatch: async () => { admissionCalls++; return { available, reason: 'Subscription account unavailable.' }; },
    handleTask: async ({ signal }) => {
      calls++; began.resolve();
      await Promise.race([release.promise, new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))]);
      signal.throwIfAborted();
    },
  });
  try {
    await coordinator.tick(); await began.promise; available = false;
    const reserved = fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd;
    for (let index = 0; index < 25; index++) await coordinator.tick();
    expect(admissionCalls).toBe(1); expect(calls).toBe(1);
    expect(fixture.store.get(fixture.run.id)!.status).toBe('RUNNING');
    expect(fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd).toBe(reserved);
    release.resolve(); await until(() => fixture.store.get(fixture.run.id)!.tasks.every(task => task.status !== 'RUNNING'));
    await coordinator.tick();
    expect(admissionCalls).toBe(2); expect(calls).toBe(1);
    expect(fixture.store.get(fixture.run.id)!.status).toBe('BLOCKED');
    expect(fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd).toBe(reserved);
  } finally { release.resolve(); await coordinator.close(); fixture.db.close(); }
});

test('loss of dispatch admission for a newly ready task aborts active run work and prevents further tasks', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), began = deferred(); let available = true, aborted = false, calls = 0, admissionCalls = 0;
  fixture.finish(fixture.claim()!);
  fixture.store.change(fixture.run.id, run => {
    const investigations = run.tasks.filter(task => task.kind === 'investigate');
    for (const task of investigations.slice(1)) task.dependencies = [investigations[0]!.id];
  });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    beforeDispatch: async () => { admissionCalls++; return { available, reason: 'Subscription quota exhausted.' }; },
    handleTask: async ({ signal }) => { calls++; began.resolve(); await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true })); signal.throwIfAborted(); },
  });
  try {
    await coordinator.tick(); await began.promise; available = false;
    const reserved = fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd;
    fixture.store.change(fixture.run.id, run => { run.tasks.filter(task => task.kind === 'investigate')[1]!.dependencies = []; });
    await coordinator.tick();
    expect(admissionCalls).toBe(2); expect(aborted).toBe(true); expect(calls).toBe(1); expect(fixture.store.get(fixture.run.id)!.status).toBe('BLOCKED');
    expect(fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd).toBe(reserved);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test('shutdown awaits in-flight admission and never claims a task after closing', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), entered = deferred(), release = deferred();
  let calls = 0, closed = false;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    beforeDispatch: async () => { entered.resolve(); await release.promise; return { available: true }; },
    handleTask: async () => { calls++; },
  });
  try {
    const dispatch = coordinator.tick(); await entered.promise;
    const closing = coordinator.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(closed).toBe(false);
    release.resolve(); await closing; await dispatch;
    expect(calls).toBe(0);
    expect(fixture.store.get(fixture.run.id)!.tasks.every(task => task.attempt === 0)).toBe(true);
    expect(fixture.store.get(fixture.run.id)!.metrics.computeEstimatedUsd).toBe(0);
  } finally { release.resolve(); await coordinator.close(); fixture.db.close(); }
});

test('shutdown waits for cancellation cleanup before its database owner may close', async () => {
  const fixture = swarmFixture(), execution = executionFixture(), entered = deferred(), release = deferred();
  const workspace = await execution.provider.createWorkspace({ swarmId: fixture.run.id, taskId: fixture.run.tasks[0]!.id,
    source: { revision: fixture.request.repository.revision, repositoryUrl: 'https://example.invalid/repo.git' },
    lane: 'investigation', resources: { cpu: 1, memoryGB: 1 } });
  fixture.store.workspace(workspace);
  const destroy = execution.provider.destroyWorkspace;
  execution.provider.destroyWorkspace = async input => { entered.resolve(); await release.promise; await destroy(input); };
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  let closed = false;
  try {
    coordinator.cancel(fixture.run.id); await entered.promise;
    const closing = coordinator.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(closed).toBe(false);
    release.resolve(); await closing;
    expect(execution.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
    expect(execution.destroyed).toEqual([workspace.id]);
  } finally { release.resolve(); await coordinator.close(); fixture.db.close(); }
});
