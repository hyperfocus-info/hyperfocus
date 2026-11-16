import { expect, test } from 'bun:test';
import { validateSwarmPatch, swarmVerifierBlockers } from './patch-policy';

function patch(path: string, added = false) {
  return `diff --git a/${path} b/${path}\n${added ? 'new file mode 100644\n' : 'index aaaa..bbbb 100644\n'}--- ${added ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n${added ? '@@ -0,0 +1 @@\n' : '@@ -1 +1 @@\n-old\n'}+new\n`;
}
const check = (text: string) => validateSwarmPatch({ text, ownedPaths: ['packages/engine/src/'] });

test('an explicitly owned source file permits that file without granting a sibling', () => {
  const file='apps/engine-editor/src/scene3d/gamepad-input.ts';
  expect(validateSwarmPatch({text:patch(file),ownedPaths:[file]}).files).toEqual([file]);
  expect(()=>validateSwarmPatch({text:patch('apps/engine-editor/src/scene3d/gamepad-menu.ts'),ownedPaths:[file]})).toThrow('bounded assignment');
});

test('new regression tests are allowed and enumerated for independent validation', () => {
  expect(check(patch('packages/engine/src/frame/new-case.test.ts', true)).addedTests).toEqual(['packages/engine/src/frame/new-case.test.ts']);
  expect(check(patch('packages/engine/src/frame/sampling.ts')).files).toHaveLength(1);
  expect(() => check(patch('packages/engine/src/frame/existing.test.ts'))).toThrow('Existing');
});

test('patches cannot escape scope, disguise headers, modify validators or add symlinks', () => {
  for (const value of [
    patch('packages/engine/src/../../credentials'), patch('packages/engine/src-sibling/evil.ts'), patch('packages/engine/src/swarm/benchmark.ts', true),
    patch('packages/engine/src/frame/new.ts', true).replace('100644', '120000'),
    patch('packages/engine/src/frame/new.ts', true).replace('+++ b/packages/engine/src/frame/new.ts', '+++ b/other.ts'),
    patch('packages/engine/src/frame/new.ts') + patch('packages/engine/src/frame/new.ts'),
  ]) expect(() => check(value)).toThrow();
});

test('engineering retains verifier proposals while default performance policy stays strict', () => {
  for (const file of ['packages/engine/src/frame/existing.test.ts', 'packages/engine/src/swarm/runner.ts', 'packages/engine/src/package.json']) {
    const policy = validateSwarmPatch({ text: patch(file), ownedPaths: ['packages/engine/src/'], executionKind: 'engineering' });
    expect(policy.files).toEqual([file]);expect(policy.addedTests).toEqual([]);expect(policy.verifierChanges).toEqual([file]);
    expect(swarmVerifierBlockers(policy)[0]).toContain('host review and a new immutable verifier baseline');
    expect(() => check(patch(file))).toThrow();
  }
  const file = 'packages/engine/src/frame/existing.test.ts';
  expect(validateSwarmPatch({ text: patch(file).replace(`+++ b/${file}`, '+++ /dev/null'), ownedPaths: [file], executionKind: 'engineering' }).verifierChanges).toEqual([file]);
  const added = validateSwarmPatch({ text: patch(file, true), ownedPaths: [file], executionKind: 'engineering' });
  expect(added.addedTests).toEqual([file]);expect(swarmVerifierBlockers(added)).toEqual([]);
});

test('declared verifier directories and exact root files are proposals without broadening ownership', () => {
  const file = 'scripts/check.ts';
  expect(validateSwarmPatch({ text: patch(file), ownedPaths: [file], executionKind: 'engineering', validationPaths: ['scripts/'] }).verifierChanges).toEqual([file]);
  expect(validateSwarmPatch({ text: patch('bunfig.toml'), ownedPaths: ['bunfig.toml'], executionKind: 'engineering', validationPaths: ['bunfig.toml'] }).verifierChanges).toEqual(['bunfig.toml']);
  expect(() => validateSwarmPatch({ text: patch('other.toml'), ownedPaths: ['bunfig.toml'], executionKind: 'engineering' })).toThrow('bounded assignment');
});

test('engineering proposals cannot override explicit protection, sensitive paths or unsafe patch structure', () => {
  const file = 'packages/engine/src/frame/work.ts';
  expect(() => validateSwarmPatch({ text: patch(file), ownedPaths: [file], protectedPaths: [file], executionKind: 'engineering' })).toThrow('explicitly protected');
  for (const path of ['packages/engine/src/.env', 'packages/engine/src/auth.json', 'packages/engine/src/.aws/credentials']) {
    expect(() => validateSwarmPatch({ text: patch(path, true), ownedPaths: ['packages/engine/src/'], executionKind: 'engineering' })).toThrow('sensitive');
  }
  for (const text of [patch('packages/engine/src/../escape.ts'), patch(file, true).replace('100644', '120000'), patch(file) + patch(file)]) {
    expect(() => validateSwarmPatch({ text, ownedPaths: ['packages/engine/src/'], executionKind: 'engineering' })).toThrow();
  }
});
