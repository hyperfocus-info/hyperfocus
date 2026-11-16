import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { runnerFixture } from './runner-test-fixture';
import { captureEngineeringBaseline, preserveInterruptedEngineeringBaseline } from './engineering';
import { deferred } from '../test-fixtures';

const paths = ['.local/audit/partial.json', '.local/audit/frame.png', '.local/audit/report.json'];
function captured(name: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  return { name, bytes, mediaType: name.endsWith('.png') ? 'image/png' : 'application/json', sha256: createHash('sha256').update(bytes).digest('hex') };
}

test('a check without an exit code retains its failed result in the baseline receipt', async () => {
  const fixture = await runnerFixture({ executionKind: 'engineering' });
  try {
    const recipe = fixture.context.recipe(fixture.run);
    recipe.artifactPaths = [];recipe.validationCommands = ['verify-interrupted'];
    const signal = new AbortController().signal, task = fixture.claim()!;
    const workspace = await fixture.context.workspace(fixture.run, task, signal);
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      return input.task.command === 'verify-interrupted' ? { ...result, exitCode: null, timedOut: true } : result;
    };
    await captureEngineeringBaseline(fixture.context, fixture.run, task, workspace, signal);
    const artifact = fixture.store.get(fixture.run.id)!.artifacts.find(value => value.name === 'baseline.json')!;
    const receipt = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 })));
    expect(receipt).toMatchObject({ passed: false, checks: [{ command: 'verify-interrupted', exitCode: null, timedOut: true, passed: false }] });
  } finally { await fixture.close(); }
});

test('throwing and aborted baseline checks retain declared partial outputs and preserve the original failure', async () => {
  for (const aborted of [false, true]) {
    const fixture = await runnerFixture({ executionKind: 'engineering' }), controller = new AbortController();
    try {
      const recipe = fixture.context.recipe(fixture.run);recipe.artifactPaths = paths;recipe.validationCommands = ['verify-completed', 'verify-fixture', 'verify-never'];
      const task = fixture.claim()!, workspace = await fixture.context.workspace(fixture.run, task, controller.signal);
      const execute = fixture.provider.execute, original = Error(aborted ? 'TASK_TIMED_OUT: browser still waiting' : 'Browser transport disconnected');
      fixture.provider.execute = async input => {
        const result = await execute(input);
        if (input.task.command === 'verify-fixture') {
          input.onOutput?.({ stream: 'stdout', text: 'Partial audit files were written before interruption.' });
          if (aborted) controller.abort(original);
          throw original;
        }
        return result;
      };
      const readback: Array<{ originalSignal: boolean; aborted: boolean }> = [];
      fixture.provider.captureArtifacts = async input => {
        readback.push({ originalSignal: input.signal === controller.signal, aborted: !!input.signal?.aborted });
        const path = input.paths![0]!;
        if (path === paths[2]) throw Error('Final report not written.');
        return [captured(path, path.endsWith('.json') ? '{"phase":"watch","complete":false}' : 'synthetic screenshot bytes')];
      };
      const error = await captureEngineeringBaseline(fixture.context, fixture.run, task, workspace, controller.signal).then(() => undefined, error => error);
      expect(error).toBe(original);
      expect(readback).toEqual(paths.map(() => ({ originalSignal: false, aborted: false })));
      expect(fixture.calls.some(call => call.command === 'verify-never')).toBe(false);
      const run = fixture.store.get(fixture.run.id)!, artifact = run.artifacts.find(artifact => artifact.name === 'baseline.json')!;
      const receipt = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 })));
      expect(receipt).toMatchObject({ status: 'INTERRUPTED', passed: false, error: original.message, sourceRevision: fixture.run.request.repository.revision,
        checks: [{ command: 'verify-completed', passed: true }] });
      expect(receipt.artifactIds).toHaveLength(2);expect(receipt.missing).toHaveLength(1);
      expect(receipt.missing[0]).toContain(paths[2]);
      fixture.finish(task, original.message);await fixture.context.remove(workspace);
      expect(fixture.store.get(fixture.run.id)!.tasks.find(value => value.id === task.id)!.status).toBe('FAILED');
      for (const id of receipt.artifactIds) {
        const retained = run.artifacts.find(artifact => artifact.id === id)!;
        expect((await fixture.artifacts.read({ sha256: retained.sha256 })).length).toBeGreaterThan(0);
      }
    } finally { await fixture.close(); }
  }
});

test('bounded readback retains earlier files, reports missing output and ignores a late provider response', async () => {
  const fixture = await runnerFixture({ executionKind: 'engineering' }), release = deferred();
  let lateSignal: AbortSignal | undefined;
  try {
    fixture.context.recipe(fixture.run).artifactPaths = paths;
    const task = fixture.claim()!, workspace = await fixture.context.workspace(fixture.run, task, new AbortController().signal);
    fixture.provider.captureArtifacts = async input => {
      const path = input.paths![0]!;
      if (path !== paths[0]) { lateSignal = input.signal;await release.promise; }
      return [captured(path, '{"partial":true}')];
    };
    expect(await preserveInterruptedEngineeringBaseline({ context: fixture.context, run: fixture.run, task, workspace, checks: [], error: Error('Original command timeout'), timeoutMs: 250 })).toBe(true);
    expect(lateSignal?.aborted).toBe(true);
    const before = fixture.store.get(fixture.run.id)!, artifact = before.artifacts.find(artifact => artifact.name === 'baseline.json')!;
    const receipt = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 })));
    expect(receipt).toMatchObject({ passed: false, error: 'Original command timeout', captureError: 'Interrupted baseline evidence readback timed out.' });
    expect(receipt.artifactIds).toHaveLength(1);expect(receipt.missing).toHaveLength(2);
    release.resolve();await new Promise(resolve => setTimeout(resolve, 0));
    expect(fixture.store.get(fixture.run.id)!.artifacts.map(artifact => artifact.id)).toEqual(before.artifacts.map(artifact => artifact.id));
  } finally { release.resolve();await fixture.close(); }
});

test('cancellation or lease recovery during readback prevents late baseline evidence publication', async () => {
  for (const stop of ['cancel', 'recover']) {
    const fixture = await runnerFixture({ executionKind: 'engineering', maxRetries: 1 }), began = deferred(), release = deferred();
    try {
      fixture.context.recipe(fixture.run).artifactPaths = paths;
      const task = fixture.claim()!, workspace = await fixture.context.workspace(fixture.run, task, new AbortController().signal);
      fixture.provider.captureArtifacts = async input => { began.resolve();await release.promise;return [captured(input.paths![0]!, '{"partial":true}')]; };
      const pending = preserveInterruptedEngineeringBaseline({ context: fixture.context, run: fixture.run, task, workspace, checks: [], error: Error('Original interrupted command') });
      await began.promise;
      if (stop === 'cancel') fixture.coordinator.cancel(fixture.run.id);
      else { fixture.store.change(fixture.run.id, run => { run.tasks.find(value => value.id === task.id)!.leaseUntil = Date.now() - 1; });fixture.store.recover(); }
      release.resolve();expect(await pending).toBe(false);
      expect(fixture.store.get(fixture.run.id)!.artifacts.some(artifact => paths.includes(artifact.name) || artifact.name === 'baseline.json')).toBe(false);
      let captures = 0;fixture.provider.captureArtifacts = async () => { captures++;return []; };
      expect(await preserveInterruptedEngineeringBaseline({ context: fixture.context, run: fixture.run, task, workspace, checks: [], error: Error('Still stopped') })).toBe(false);
      expect(captures).toBe(0);
    } finally { release.resolve();fixture.coordinator.cancel(fixture.run.id);await fixture.close(); }
  }
});
