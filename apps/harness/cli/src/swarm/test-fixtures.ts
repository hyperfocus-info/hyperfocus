import { Database } from 'bun:sqlite';
import { createSwarmRequestSchema, swarmRunSchema, type ExecutionProvider, type ExecutionWorkspace } from '@hyperfocus/ai-core/swarm';
import { planSwarm } from './plan';
import { createSwarmStore } from './persistence/store';

export function swarmFixture(options: { now?: () => number; database?: Database; maxWorkers?: number; maxRetries?: number; maxComputeUsd?: number; executionKind?: 'performance' | 'engineering' } = {}) {
  const db = options.database ?? new Database(':memory:');
  const store = createSwarmStore({ db, now: options.now });
  const request = createSwarmRequestSchema.parse({ requestId: 'test-request', projectId: 'touch-of-death', goal: 'Find three independently verified improvements.',
    repository: { revision: 'a'.repeat(40) }, backend: 'railway', reviewPlan: true, maxWorkers: options.maxWorkers ?? 3,
    budget: { maxRetries: options.maxRetries ?? 1, maxComputeUsd: options.maxComputeUsd ?? 5, maxModelUsd: 5 } });
  const run = swarmRunSchema.parse({ id: 'swarm-fixture', request, status: 'RUNNING', createdAt: options.now?.() ?? Date.now(), updatedAt: Date.now(), startedAt: options.now?.() ?? Date.now(),
    ...planSwarm({ id: 'swarm-fixture', request, executionKind: options.executionKind }), artifacts: [], messages: [], metrics: {} });
  store.create(run);
  const claim = (owner = 'worker-1', capabilities: Parameters<typeof store.claim>[0]['capabilities'] = ['execution', 'reasoning', 'benchmark']) => store.claim({ runId: run.id, owner, ttlMs: 1000, capabilities, computeReservationUsd: 0.05 });
  const finish = (task: NonNullable<ReturnType<typeof claim>>, error?: string) => store.finish({ runId: run.id, taskId: task.id, owner: task.leaseOwner!, fence: task.leaseFence, error });
  return { db, store, request, run, claim, finish };
}

export function executionFixture() {
  const workspaces = new Map<string, ExecutionWorkspace>(), destroyed: string[] = [];
  const provider: ExecutionProvider = {
    kind: 'railway',
    async createWorkspace(options) {
      const workspace: ExecutionWorkspace = { id: crypto.randomUUID(), provider: 'railway', swarmId: options.swarmId, taskId: options.taskId,
        sourceRevision: options.source.revision, root: '/workspace', resources: options.resources, lane: options.lane, createdAt: new Date().toISOString() };
      workspaces.set(workspace.id, workspace); return workspace;
    },
    async forkWorkspace(options) { const workspace = { ...options.workspace, id: crypto.randomUUID(), taskId: options.taskId }; workspaces.set(workspace.id, workspace); return workspace; },
    async execute() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false, truncated: false, durationMs: 0 }; },
    async captureArtifacts() { return []; },
    async destroyWorkspace({ workspaceId }) { destroyed.push(workspaceId); workspaces.delete(workspaceId); },
    async listWorkspaces() { return [...workspaces.values()]; },
  };
  return { provider, workspaces, destroyed };
}

export function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Test condition was not reached.');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}
