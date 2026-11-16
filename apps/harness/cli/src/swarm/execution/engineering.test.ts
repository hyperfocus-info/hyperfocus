import { canApproveSwarmCandidate } from '@hyperfocus/ai-core/swarm';
import { expect,test } from 'bun:test';
import { createHash } from 'node:crypto';
import { patch } from "../../test-support/fixtures/patch";
import { engineeringSwarmRecipe } from '../engineering-recipe';
import { planSwarm } from '../plan';
import { captureEngineeringBaseline,captureEngineeringEvidence,compareEngineeringCandidates } from './engineering';
import { validateSwarmPatch } from './patch-policy';
import { runnerFixture } from './runner-test-fixture';
import { swarmProjectRecipeSchema } from './task-context';

test('generic engineering plans derive work from the goal and do not schedule performance tasks', async () => {
  const fixture = await runnerFixture();
  try {
    const engineering = planSwarm({ id: fixture.run.id, request: fixture.run.request, executionKind: 'engineering' });
    expect(engineering.tasks.some(task => task.kind === 'benchmark' || task.kind === 'experiment')).toBe(false);
    expect(engineering.candidates.every(candidate => candidate.hypothesis.includes("user's goal"))).toBe(true);
    expect(planSwarm({ id: fixture.run.id, request: fixture.run.request }).tasks.some(task => task.kind === 'benchmark')).toBe(true);
    expect(swarmProjectRecipeSchema.safeParse({ id: 'generic', name: 'Generic', executionKind: 'engineering', preparationCommand: 'prepare', validationCommands: ['verify'], ownedPaths: ['src/'] }).success).toBe(true);
    expect(swarmProjectRecipeSchema.safeParse({ id: 'performance', name: 'Performance', preparationCommand: 'prepare', validationCommands: ['verify'], ownedPaths: ['src/'] }).success).toBe(false);
  } finally { await fixture.close(); }
});

test('generic recipe permits named root configuration proposals and keeps credentials outside its scope', () => {

  for (const file of ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'eslint.config.mjs']) {
    expect(validateSwarmPatch({ ...engineeringSwarmRecipe, text: patch(file) }).verifierChanges).toEqual([file]);
  }
  expect(validateSwarmPatch({ ...engineeringSwarmRecipe, text: patch('README.md') }).verifierChanges).toEqual([]);
  expect(() => validateSwarmPatch({ ...engineeringSwarmRecipe, text: patch('.env') })).toThrow();
  expect(() => validateSwarmPatch({ ...engineeringSwarmRecipe, text: patch('apps/game/auth.json') })).toThrow('sensitive');
});

test('engineering retains existing-test proposals and independent validation reinstates their promotion blocker', async () => {
  const fixture = await runnerFixture({ executionKind: 'engineering', patchPath: 'packages/engine/src/frame/existing.test.ts' });
  try {
    const readPatch = fixture.context.patch;let retainedBlockers = 0;
    fixture.context.patch = async (run, candidateId) => {
      fixture.store.change(run.id, current => {
        const candidate = current.candidates.find(candidate => candidate.id === candidateId)!;
        if (candidate.blockers.some(blocker => blocker.includes('immutable verifier baseline'))) retainedBlockers++;
        candidate.blockers = [];
      });
      return readPatch(run, candidateId);
    };
    await fixture.coordinator.drain();const run = fixture.store.get(fixture.run.id)!;
    expect(retainedBlockers).toBe(3);
    expect(run.tasks.some(task => task.kind === 'benchmark')).toBe(false);
    expect(fixture.calls.some(call => call.command === 'benchmark-fixture')).toBe(false);
    for (const candidate of run.candidates) {
      expect(candidate.patchArtifactId).toBeDefined();expect(candidate.sourceTree).toBeDefined();expect(candidate.correctness).toBe('passed');
      expect(candidate.blockers.some(blocker => blocker.includes('immutable verifier baseline'))).toBe(true);
      expect(candidate.comparison?.decision).toBe('UNVERIFIED');expect(canApproveSwarmCandidate(run, candidate)).toBe(false);
      expect(() => fixture.coordinator.approve(run.id, candidate.id)).toThrow();
      const artifact = run.artifacts.find(artifact => artifact.id === candidate.validationArtifactIds[0])!;
      expect(JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 }))).verifierChanges).toEqual(['packages/engine/src/frame/existing.test.ts']);
    }
    expect(fixture.prompts.some(prompt => prompt.includes('you may propose changes to existing tests'))).toBe(true);
  } finally { await fixture.close(); }
});

test('failed engineering baselines retain defects and partial declared artifacts without becoming passing evidence', async () => {
  const fixture = await runnerFixture({ executionKind: 'engineering', failValidation: [0] });
  try {
    const recipe = fixture.context.recipe(fixture.run);
    recipe.artifactPaths = ['.local/report.json', '.local/missing.png'];
    fixture.provider.captureArtifacts = async ({ paths }) => {
      if (paths?.[0] !== '.local/report.json') throw Error('No image captured.');
      const bytes = new TextEncoder().encode('{"passed":false,"defect":"real failing fixture"}');
      return [{ name: paths[0], mediaType: 'application/json', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }];
    };
    const task = fixture.claim()!, signal = new AbortController().signal;
    const workspace = await fixture.context.workspace(fixture.run, task, signal);
    await captureEngineeringBaseline(fixture.context, fixture.run, task, workspace, signal);
    const run = fixture.store.get(fixture.run.id)!;
    const receipt = run.artifacts.find(artifact => artifact.name === 'baseline.json')!;
    const raw = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: receipt.sha256 })));
    expect(raw.passed).toBe(false);expect(raw.checks[0].exitCode).toBe(1);
    expect(raw.missing).toHaveLength(1);expect(raw.artifactIds).toHaveLength(1);
    expect(fixture.calls.some(call => call.command === 'benchmark-fixture')).toBe(false);
    expect((await captureEngineeringEvidence(fixture.context, fixture.run, task, workspace, signal)).missing).toHaveLength(1);
  } finally { fixture.coordinator.cancel(fixture.run.id);await fixture.close(); }
});

test('engineering approval requires independent validation and explicit review, while performance still requires IMPROVED', async () => {
  const fixture = await runnerFixture();
  try {
    const task = fixture.claim()!;
    const retained=await fixture.context.artifact(fixture.run,task,{name:'synthetic-verification.json',kind:'validation',mediaType:'application/json',bytes:'{"passed":true,"simulated":true}'});
    fixture.store.change(fixture.run.id, run => {
      run.status='COMPARING';run.executionKind = 'engineering';run.modelPlan = { planning: run.request.profile!, implementation: run.request.profile!, review: run.request.profile!, valueImplementation: run.request.profile!, difficulty: 'bounded', reason: 'Fixture' };
      const validator=run.tasks.find(value=>value.kind==='validate'&&value.candidateId===run.candidates[0]!.id)!;
      run.tasks.push({...task,id:'review-task',kind:'review',agentId:'reviewer',status:'SUCCEEDED'});
      run.artifacts.push({...retained,id:'validation',taskId:validator.id,agentId:validator.agentId},{...retained,id:'review',taskId:'review-task',agentId:'reviewer',kind:'report'});
      run.completion = { status: 'met', summary: 'Fixture evidence checked', criteria: run.request.doneCriteria.map(criterion=>({criterion,status:'met',artifactIds:['validation'],reason:'Synthetic test evidence'})), artifactId: 'review' };
      const candidate = run.candidates[0]!;candidate.correctness = 'passed';candidate.patchArtifactId = 'patch';candidate.validationArtifactIds = ['validation'];
    });
    await compareEngineeringCandidates(fixture.context, fixture.run, task);
    const run = fixture.store.get(fixture.run.id)!, candidate = run.candidates[0]!;
    expect(candidate.comparison?.decision).toBe('VERIFIED');expect(canApproveSwarmCandidate(run, candidate)).toBe(true);
    expect(canApproveSwarmCandidate({ ...run, executionKind: 'performance' }, candidate)).toBe(false);
    expect(canApproveSwarmCandidate(run, { ...candidate, correctness: 'failed' })).toBe(false);
  } finally { fixture.coordinator.cancel(fixture.run.id);await fixture.close(); }
});
