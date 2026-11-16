import { afterAll, beforeAll, expect, test } from 'bun:test';
import { verifySwarmIntegration } from './integration';
import { runnerFixture } from './runner-test-fixture';

let baseline: Awaited<ReturnType<typeof runnerFixture>>;
beforeAll(async () => {
  baseline = await runnerFixture({ addedTest: true });
  await baseline.coordinator.drain();
  baseline.coordinator.approve(baseline.run.id, 'candidate-1');
});
afterAll(async () => { await baseline?.close(); });

async function approvedFixture() {
  // Integration starts from an already reviewed proposal. Each case gets fresh
  // mutable run metadata/provider state; only immutable content-addressed bytes
  // are shared. The baseline's real file store survives until all cases finish.
  const fixture = await runnerFixture({ addedTest: true, artifacts: baseline.artifacts });
  const run = fixture.store.change(fixture.run.id, current => {
    Object.assign(current, structuredClone(baseline.store.get(baseline.run.id)!));
  });
  return { ...fixture, approved: run, sourceTree: run.candidates[0]!.sourceTree! };
}

test('integration rejects unapproved or different trees before provisioning', async () => {
  const fixture = await approvedFixture();
  try {
    const before = fixture.calls.length;
    await expect(verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: 'candidate-1', sourceTree: 'f'.repeat(40), signal: new AbortController().signal })).rejects.toThrow('reviewed candidate');
    fixture.store.change(fixture.run.id, run => { run.integration = undefined; });
    await expect(verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: 'candidate-1', sourceTree: fixture.sourceTree, signal: new AbortController().signal })).rejects.toThrow('reviewed candidate');
    expect(fixture.calls).toHaveLength(before);
    expect(fixture.workspaces.size).toBe(0);
    expect(fixture.store.get(fixture.run.id)!.tasks).toHaveLength(fixture.approved.tasks.length);
  } finally { await fixture.close(); }
});

test.each([true, false])('integration independently rejects verifier proposals even if stored approval claims they passed (changed test: %s)', async (changedTest) => {
    const fixture = await approvedFixture();
    try {
      const recipe = fixture.context.recipe(fixture.run);recipe.executionKind = 'engineering';
      // Simulate a forged approved engineering record with a matching trusted recipe.
      // The independent verifier-policy gate must reject it before provisioning.
      fixture.store.change(fixture.run.id, run => { run.executionKind = 'engineering'; });
      const before = fixture.store.get(fixture.run.id)!, candidate = before.candidates[0]!;
      const artifact = before.artifacts.find(artifact => artifact.id === candidate.patchArtifactId)!;
      if (changedTest) {
        const original = new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 }));
        const bytes = new TextEncoder().encode(original.replaceAll('frame/work.ts', 'frame/existing.test.ts'));
        const replacement = await fixture.artifacts.put({ name: artifact.name, mediaType: artifact.mediaType, bytes });
        fixture.store.change(before.id, current => { const retained = current.artifacts.find(value => value.id === artifact.id)!;retained.sha256 = replacement.sha256;retained.bytes = replacement.bytes; });
      } else recipe.validationPaths = ['packages/engine/src/frame/work.ts'];
      const calls = fixture.calls.length;
      await expect(verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: candidate.id, sourceTree: fixture.sourceTree, signal: new AbortController().signal })).rejects.toThrow('new immutable verifier baseline');
      expect(fixture.calls).toHaveLength(calls);expect(fixture.workspaces.size).toBe(0);
      expect(fixture.store.get(before.id)!.tasks).toHaveLength(before.tasks.length);
    } finally { await fixture.close(); }
});

test('integration checks the reconstructed remote tree, reruns checks and persists evidence after destruction', async () => {
  const fixture = await approvedFixture();
  try {
    const before = fixture.calls.length;
    await verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: 'candidate-1', sourceTree: fixture.sourceTree, signal: new AbortController().signal });
    const calls = fixture.calls.slice(before), run = fixture.store.get(fixture.run.id)!;
    expect(new Set(calls.map(call => call.workspaceId)).size).toBe(1);
    expect(calls.map(call => call.command)).toContain('git add -A && git write-tree');
    expect(calls.map(call => call.command)).toContain('verify-fixture');
    expect(calls.map(call => call.command)).toContain('bun test packages/engine/src/frame/new-case.test.ts --timeout 30000');
    expect(calls.some(call => call.command === 'benchmark-fixture' || call.command.startsWith('produce-candidate'))).toBe(false);
    expect(calls.every(({ environment }) => typeof environment === 'object' && environment !== null && 'HYPERFOCUS_SWARM_BACKEND' in environment && environment.HYPERFOCUS_SWARM_BACKEND === 'railway')).toBe(true);
    const verification = run.tasks.find(task => task.title === 'Verify integrated source')!;
    expect(verification.status).toBe('SUCCEEDED');
    expect(run.integration?.status).toBe('approved');
    expect(run.status).toBe('AWAITING_APPROVAL');
    const report = run.artifacts.find(artifact => artifact.name === 'integration-validation.json')!;
    expect(run.candidates[0]!.validationArtifactIds).toContain(report.id);
    const evidence = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: report.sha256 })));
    expect(evidence).toMatchObject({ sourceTree: fixture.sourceTree, passed: true });
    expect(fixture.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
  } finally { await fixture.close(); }
});

test('integration reserves compute budget before creating remote resources', async () => {
  const fixture = await approvedFixture();
  try {
    const before = fixture.calls.length;
    const run = fixture.store.change(fixture.run.id, current => { current.request.budget.maxComputeUsd = current.metrics.computeEstimatedUsd; });
    await expect(verifySwarmIntegration({ context: fixture.context, run, candidateId: 'candidate-1', sourceTree: fixture.sourceTree, signal: new AbortController().signal })).rejects.toThrow('compute budget');
    expect(fixture.calls).toHaveLength(before);
    expect(fixture.store.get(fixture.run.id)!.tasks).toHaveLength(fixture.approved.tasks.length);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('remote verification failures preserve approval, patch evidence and cleanup ownership', async () => {
  const fixture = await approvedFixture();
  try {
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      return input.task.command === 'verify-fixture' ? { ...result, exitCode: 1, stdout: 'New regression found during integration.' } : result;
    };
    await expect(verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: 'candidate-1', sourceTree: fixture.sourceTree, signal: new AbortController().signal })).rejects.toThrow('correctness checks failed');
    const run = fixture.store.get(fixture.run.id)!;
    expect(run.integration?.status).toBe('approved'); expect(run.status).toBe('AWAITING_APPROVAL');
    expect(run.candidates[0]!.disposition).toBe(fixture.approved.candidates[0]!.disposition);
    expect(run.tasks.find(task => task.title === 'Verify integrated source')!.status).toBe('FAILED');
    const report = run.artifacts.find(artifact => artifact.name === 'integration-validation.json')!;
    expect(JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: report.sha256 })))).toMatchObject({ passed: false, checks: [{ command: 'verify-fixture', exitCode: 1 }] });
    const patch = run.artifacts.find(artifact => artifact.id === run.candidates[0]!.patchArtifactId)!;
    expect(new TextDecoder().decode(await fixture.artifacts.read({ sha256: patch.sha256 }))).toContain('candidate-1');
    expect(fixture.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
  } finally { await fixture.close(); }
});

test('a reconstruction mismatch stops before remote correctness checks', async () => {
  const fixture = await approvedFixture();
  try {
    const before = fixture.calls.length, execute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      return input.task.command === 'git add -A && git write-tree' ? { ...result, stdout: 'f'.repeat(40) } : result;
    };
    await expect(verifySwarmIntegration({ context: fixture.context, run: fixture.approved, candidateId: 'candidate-1', sourceTree: fixture.sourceTree, signal: new AbortController().signal })).rejects.toThrow('Reconstructed source tree');
    expect(fixture.calls.slice(before).some(call => call.command === 'verify-fixture')).toBe(false);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('truncated integration output remains incomplete evidence even when the command exits zero',async()=>{
  const fixture=await approvedFixture();
  try{
    const execute=fixture.provider.execute;
    fixture.provider.execute=async input=>{const result=await execute(input);return input.task.command==='verify-fixture'?{...result,truncated:true}:result;};
    await expect(verifySwarmIntegration({context:fixture.context,run:fixture.approved,candidateId:'candidate-1',sourceTree:fixture.sourceTree,signal:new AbortController().signal})).rejects.toThrow('incomplete evidence');
    const report=fixture.store.get(fixture.run.id)!.artifacts.find(artifact=>artifact.name==='integration-validation.json')!;
    expect(JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({sha256:report.sha256}))).passed).toBe(false);
    expect(fixture.workspaces.size).toBe(0);
  }finally{await fixture.close();}
});
