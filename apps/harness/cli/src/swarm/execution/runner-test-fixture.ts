import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from 'bun:sqlite';
import { createLocalAiRuntime, createMemoryOnlyProviderCredentialStore, type AiRuntimeAdapter } from '@hyperfocus/ai-runtime';
import { createFileSwarmArtifactStore } from '@hyperfocus/ai-runtime/swarm';
import type { SwarmArtifactStore } from '@hyperfocus/ai-runtime/swarm';
import type { CapturedArtifact } from '@hyperfocus/ai-core/swarm';
import { createSwarmTaskContext, swarmProjectRecipeSchema } from './task-context';
import { createSwarmTaskHandler } from './runner';
import { createSwarmCoordinator } from '../coordinator';
import { executionFixture, swarmFixture } from '../test-fixtures';

export async function runnerFixture(options: { artifacts?: SwarmArtifactStore; failValidation?: number[]; missingPatch?: number[]; patchPath?: string; addedTest?: boolean; maxRetries?: number; database?: Database; executionKind?: 'performance' | 'engineering' } = {}) {
  const fixture = swarmFixture({ maxRetries: options.maxRetries ?? 0, database: options.database, executionKind: options.executionKind }), execution = executionFixture();
  const parent = resolve(import.meta.dir, '../../../../.local/swarm-tests'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(resolve(parent, 'runner-'));
  const artifacts = options.artifacts ?? createFileSwarmArtifactStore({ directory: resolve(directory, 'artifacts') });
  const variant = new Map<string, number>(), calls: Array<{ workspaceId: string; taskId: string; command: string; environment: unknown; lane: string }> = [], forks: Array<{ source: string; target: string; task: string }> = [];
  const recipe = swarmProjectRecipeSchema.parse({ id: 'test-cpu', name: 'Synthetic orchestration test', executionKind: options.executionKind, repositoryUrls: ['https://example.invalid/repo.git'], preparationCommand: 'prepare-fixture', validationCommands: ['verify-fixture'], benchmarkCommand: 'benchmark-fixture', benchmarkMetric: 'presentation-ms', ownedPaths: ['packages/engine/src/'] });
  fixture.store.change(fixture.run.id, run => { run.request.repository.url = recipe.repositoryUrls[0]!; run.request.profile = { agentId: 'direct', providerId: 'test-provider', modelId: 'test-model', approvalPolicy: 'never' }; });
  const createWorkspace = execution.provider.createWorkspace, forkWorkspace = execution.provider.forkWorkspace;
  execution.provider.createWorkspace = async input => { const workspace = await createWorkspace(input); variant.set(workspace.id, 0); return workspace; };
  execution.provider.forkWorkspace = async input => {
    const workspace = await forkWorkspace(input); variant.set(workspace.id, 0); forks.push({ source: input.workspace.id, target: workspace.id, task: input.taskId }); return workspace;
  };
  function receipt(candidate: number) {
    return JSON.stringify({ samples: Array(30).fill(candidate ? 6 + candidate : 10), scenario: 'synthetic-unit-test', workloadHash: 'fixed-fixture', runtimeVersion: 'fixture', cpuModel: 'fixture CPU', platform: 'test', architecture: 'test', warmupMs: 1000, durationMs: 1000,
      memory: { rssBytes: 100, heapBytes: 50, allocatedBytes: null }, gc: { count: null, durationMs: null }, stages: { totalCpu: Array(30).fill(20) },
      structural: { finalStateHash: 'a'.repeat(64), entityCounts: Array(30).fill(100), commandCounts: Array(30).fill(80) } });
  }
  execution.provider.execute = async input => {
    const { workspace, task } = input; calls.push({ workspaceId: workspace.id, taskId: workspace.taskId, command: task.command, environment: task.environment, lane: workspace.lane });
    let stdout = '', exitCode = 0;
    const produced = /^produce-candidate-(\d)$/.exec(task.command);
    if (produced) variant.set(workspace.id, Number(produced[1]));
    if (task.command.startsWith('git reset --hard')) variant.set(workspace.id, 0);
    if (task.command.includes('base64 -d | git apply')) {
      const encoded = /printf '%s' '([A-Za-z0-9+/=]+)'/.exec(task.command)?.[1];
      if (!encoded) throw new Error('Malformed test apply transport.');
      const patch = Buffer.from(encoded, 'base64').toString('utf8'); variant.set(workspace.id, Number(/candidate-(\d)/.exec(patch)?.[1]));
    }
    const candidate = variant.get(workspace.id) ?? 0;
    if(task.command === 'git add -A && git write-tree') stdout = `${candidate}`.repeat(40);
    if(task.command.startsWith('git rev-parse ') && task.command.endsWith('^{tree}')) stdout = '0'.repeat(40);
    if(task.command.includes(' commit-tree ')) stdout = `${candidate + 3}`.repeat(40);
    if (task.command === 'verify-fixture' && options.failValidation?.includes(candidate)) { exitCode = 1; stdout = 'Correctness assertion failed'; }
    if (task.command === 'benchmark-fixture') stdout = receipt(candidate);
    input.onOutput?.({ stream: 'stdout', text: stdout || 'fixture command finished' });
    return { exitCode, stdout, stderr: '', timedOut: false, truncated: false, durationMs: 1 };
  };
  execution.provider.captureArtifacts = async ({ workspace }) => {
    const candidate = variant.get(workspace.id) ?? 0;
    if (options.missingPatch?.includes(candidate)) return [];
    const path = options.patchPath ?? 'packages/engine/src/frame/work.ts';
    const text = `diff --git a/${path} b/${path}\nindex aaaa..bbbb 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+candidate-${candidate}\n` + (options.addedTest ? 'diff --git a/packages/engine/src/frame/new-case.test.ts b/packages/engine/src/frame/new-case.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/packages/engine/src/frame/new-case.test.ts\n@@ -0,0 +1 @@\n+regression\n' : '');
    const bytes = new TextEncoder().encode(text), artifact: CapturedArtifact = { name: 'candidate.patch', mediaType: 'text/x-diff', sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
    return [artifact];
  };
  const turns = new Map<number, number>(), prompts: string[] = [], credentials = createMemoryOnlyProviderCredentialStore();
  credentials.set('test-provider', 'coordinator-only-secret');
  const adapter: AiRuntimeAdapter = {
    descriptor: { id: 'direct', label: 'Deterministic test provider', providerIds: ['test-provider'], supportsReasoning: true, supportsStructuredOutput: true, available: true },
    listCatalog: () => ({ providers: [{ id: 'test-provider', label: 'Fixture', authenticated: true, credentialSource: 'stored', modelIds: ['test-model'] }], models: [{ id: 'test-model', providerId: 'test-provider', label: 'Fixture model', reasoning: true, input: ['text'] }] }),
    async run(request) {
      prompts.push(request.systemPrompt ?? '');
      const engineeringCandidate = /Hypothesis: Investigation ([1-3]):/.exec(request.systemPrompt ?? '');
      const candidate = engineeringCandidate ? Number(engineeringCandidate[1]) : request.systemPrompt?.includes('Hypothesis: Measure repeated') ? 1 : request.systemPrompt?.includes('Hypothesis: Measure presentation') ? 2 : 3;
      const turn = turns.get(candidate) ?? 0; turns.set(candidate, turn + 1);
      const action = turn === 0 ? { action: 'execute', command: `produce-candidate-${candidate}`, purpose: 'Fixture isolated implementation' }
        : turn === 1 ? { action: 'finding', kind: 'evidence', text: `Candidate ${candidate} fixture finding` }
        : { action: 'finish', diagnosis: `Independent fixture candidate ${candidate}`, risks: ['Synthetic test only'], hypothesisSupported: true };
      return { requestId: request.requestId, profile: request.profile, text: JSON.stringify(action), stopReason: 'stop', usage: { inputTokens: 10, outputTokens: 10, costUsd: 0 } };
    },
  };
  const runtime = createLocalAiRuntime({ adapters: [adapter], credentialStore: credentials });
  const context = createSwarmTaskContext({ store: fixture.store, provider: execution.provider, artifacts, recipes: new Map([[fixture.request.projectId, recipe]]) });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: createSwarmTaskHandler({ context, runtime, maxTokenPriceUsd: 0 }) });
  return { ...fixture, run: fixture.store.get(fixture.run.id)!, ...execution, artifacts, context, coordinator, calls, forks, prompts,
    async close() {
      await coordinator.close(); fixture.db.close();
      if (!resolve(directory).startsWith(parent + sep)) throw new Error('Refusing cleanup outside owned fixture directory.');
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
