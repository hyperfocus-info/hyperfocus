import { expect, test } from 'bun:test';
import { runnerFixture } from './runner-test-fixture';

test('real runtime/coordinator flow isolates implementations and validation, compares candidates and retains artifacts after destruction', async () => {
  const fixture = await runnerFixture({ addedTest: true });
  try {
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('AWAITING_APPROVAL'); expect(run.selectedCandidateId).toBe('candidate-1');
    expect(run.candidates.every(candidate => candidate.correctness === 'passed')).toBe(true);
    expect(new Set(fixture.forks.map(fork => fork.target)).size).toBe(6);
    expect(new Set(fixture.forks.map(fork => fork.source)).size).toBe(1);
    const implementation = fixture.calls.filter(call => call.command.startsWith('produce-candidate'));
    expect(new Set(implementation.map(call => call.workspaceId)).size).toBe(3);
    expect(fixture.calls.filter(call => call.command.startsWith('bun test packages/engine/src/frame/new-case.test.ts'))).toHaveLength(3);
    const timed = fixture.calls.filter(call => call.lane === 'benchmark' && call.command === 'benchmark-fixture');
    expect(timed).toHaveLength(48); expect(new Set(timed.map(call => call.workspaceId)).size).toBe(1);
    expect(fixture.calls.filter(call => call.lane === 'benchmark').some(call => call.command.startsWith('produce-candidate'))).toBe(false);
    expect(fixture.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
    const patch = run.artifacts.find(artifact => artifact.id === run.candidates[0]!.patchArtifactId)!;
    expect(new TextDecoder().decode(await fixture.artifacts.read({ sha256: patch.sha256 }))).toContain('candidate-1');
    expect(run.messages.some(message => message.text.includes('fixture finding'))).toBe(true);
    expect(run.metrics.modelCalls).toBe(9);
    expect(run.candidates.map(candidate => candidate.sourceRevision)).toEqual(['4'.repeat(40), '5'.repeat(40), '6'.repeat(40)]);
    expect(fixture.calls.filter(call => call.command.includes(' commit-tree '))).toHaveLength(3);
    expect(JSON.stringify(fixture.calls)).not.toContain('coordinator-only-secret');
    expect(JSON.stringify(fixture.prompts)).not.toContain('coordinator-only-secret');
  } finally { await fixture.close(); }
});

test('failed correctness prevents benchmark provisioning even when every investigation returns a patch', async () => {
  const fixture = await runnerFixture({ failValidation: [1, 2, 3] });
  try {
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('AWAITING_APPROVAL'); expect(run.selectedCandidateId).toBeUndefined();
    expect(run.candidates.every(candidate => candidate.correctness === 'failed' && candidate.disposition === 'rejected')).toBe(true);
    expect(fixture.calls.some(call => call.lane === 'benchmark')).toBe(false);
    expect(fixture.calls.filter(call => call.command === 'benchmark-fixture')).toHaveLength(1);
    expect(run.candidates.every(candidate => candidate.validationArtifactIds.length > 0)).toBe(true);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('partial candidate failure preserves findings and compares remaining independent candidates', async () => {
  const fixture = await runnerFixture({ missingPatch: [2] });
  try {
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('AWAITING_APPROVAL'); expect(run.selectedCandidateId).toBe('candidate-1');
    expect(run.candidates[1]?.disposition).toBe('rejected');
    expect(run.candidates[1]?.blockers).toContain('Investigation produced no implementation patch.');
    expect(run.artifacts.some(artifact => artifact.name === 'candidate-2-diagnosis.json')).toBe(true);
    expect(fixture.calls.filter(call => call.lane === 'benchmark' && call.command === 'benchmark-fixture')).toHaveLength(32);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('rejected hypotheses without patches allocate no validation or measurement workspaces', async () => {
  const fixture = await runnerFixture({ missingPatch: [1, 2, 3] });
  try {
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe('AWAITING_APPROVAL');
    expect(run.selectedCandidateId).toBeUndefined();
    expect(fixture.forks).toHaveLength(3);
    expect(run.tasks.filter(task => task.kind === 'validate').every(task => !task.workspaceId)).toBe(true);
    expect(run.candidates.every(candidate => candidate.disposition === 'rejected' && candidate.validationArtifactIds.length === 0)).toBe(true);
    expect(run.messages.filter(message => message.text.includes('validation workspace and checks skipped.'))).toHaveLength(3);
    expect(fixture.calls.some(call => call.lane === 'benchmark')).toBe(false);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('protected assertions and out-of-scope patches never reach candidate validation or timing', async () => {
  for (const patchPath of ['packages/engine/src/frame/existing.test.ts', 'apps/harness/cli/src/server.ts']) {
    const fixture = await runnerFixture({ patchPath });
    try {
      await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
      expect(run.candidates.every(candidate => !candidate.patchArtifactId && candidate.disposition === 'rejected')).toBe(true);
      expect(fixture.calls.some(call => call.command.includes('base64 -d | git apply'))).toBe(false);
      expect(fixture.calls.some(call => call.lane === 'benchmark')).toBe(false);
      expect(fixture.workspaces.size).toBe(0);
    } finally { await fixture.close(); }
  }
});

test('fresh validation rejects a patch whose reconstructed tree differs from the recorded candidate', async () => {
  const fixture = await runnerFixture();
  try {
    const execute = fixture.provider.execute, validation = fixture.run.tasks.find(task => task.kind === 'validate' && task.candidateId === 'candidate-1')!;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      return input.workspace.taskId === validation.id && input.task.command === 'git add -A && git write-tree' ? { ...result, stdout: 'f'.repeat(40) } : result;
    };
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.candidates[0]!.correctness).toBe('failed');
    expect(run.candidates[0]!.blockers.join(' ')).toContain('Reconstructed source tree');
    expect(run.candidates[0]!.comparison).toBeUndefined(); expect(run.selectedCandidateId).toBe('candidate-2');
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test('source mutation during timing retains the raw trial but cannot produce a qualified comparison', async () => {
  const fixture = await runnerFixture();
  try {
    const execute = fixture.provider.execute; let changed = false;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      if (input.workspace.lane === 'benchmark' && input.task.command === 'benchmark-fixture' && JSON.parse(result.stdout).samples[0] === 7) changed = true;
      return changed && input.workspace.lane === 'benchmark' && input.task.command === 'git add -A && git write-tree' ? { ...result, stdout: 'f'.repeat(40) } : result;
    };
    await fixture.coordinator.drain(); const run = fixture.store.get(fixture.run.id)!;
    expect(run.tasks.find(task => task.kind === 'benchmark')!.status).toBe('FAILED');
    expect(run.candidates.every(candidate => !candidate.comparison)).toBe(true); expect(run.selectedCandidateId).toBeUndefined();
    expect(run.artifacts.some(artifact => artifact.name === 'candidate-1-0-0-candidate.json')).toBe(true);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});
