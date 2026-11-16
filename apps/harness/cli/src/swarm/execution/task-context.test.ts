import { expect, test } from 'bun:test';
import { runnerFixture } from './runner-test-fixture';
import { deferred } from '../test-fixtures';
import { taskAttemptKey } from '../persistence/store';

test('command evidence includes the executed command and redacts secrets across output chunks', async () => {
  const fixture = await runnerFixture();
  try {
    const task = fixture.claim()!, signal = new AbortController().signal;
    const workspace = await fixture.context.workspace(fixture.run, task, signal);
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      input.onOutput?.({ stream: 'stdout', text: 'Authorization: Bearer synthetic-' });
      input.onOutput?.({ stream: 'stdout', text: 'credential-value\nOPENAI_API_KEY=sk-proj-fixture_private_value\nordinary diagnostic' });
      return execute(input);
    };
    await fixture.context.execute(fixture.run, task, workspace, 'inspect-current-preparation', signal);
    const logs = fixture.store.get(fixture.run.id)!.artifacts.filter(artifact => artifact.kind === 'log');
    const log = new TextDecoder().decode(await fixture.artifacts.read({ sha256: logs.at(-1)!.sha256 }));
    expect(log).toContain('Command: inspect-current-preparation');
    expect(log).toContain('ordinary diagnostic');
    expect(log).toContain('[redacted');
    expect(log).not.toContain('synthetic-credential-value');
    expect(log).not.toContain('fixture_private_value');
  } finally { fixture.coordinator.cancel(fixture.run.id); await fixture.close(); }
});

test('remote workspace identities are per attempt while durable ownership remains canonical', async () => {
  const fixture = await runnerFixture({ maxRetries: 1 });
  try {
    const task = fixture.claim()!, signal = new AbortController().signal;
    const first = await fixture.context.workspace(fixture.run, task, signal);
    expect(first.taskId).toBe(task.id);
    expect(fixture.workspaces.get(first.id)!.taskId).toBe(taskAttemptKey(task));
    fixture.store.change(fixture.run.id, run => { run.tasks[0]!.leaseUntil = Date.now() - 1; }); fixture.store.recover();
    expect(fixture.claim('replacement')).toBeUndefined();
    await fixture.context.remove(first);
    const replacement = fixture.claim('replacement')!;
    const second = await fixture.context.workspace(fixture.run, replacement, signal);
    expect(taskAttemptKey(task)).not.toBe(taskAttemptKey(replacement));
    expect(fixture.workspaces.get(second.id)!.taskId).toBe(taskAttemptKey(replacement));
    expect(fixture.store.workspaces()[0]!.taskId).toBe(task.id);
  } finally { fixture.coordinator.cancel(fixture.run.id); await fixture.close(); }
});

test('an expired worker cannot publish late commands, artifacts, messages or candidate state', async () => {
  const fixture = await runnerFixture({ maxRetries: 1 }), response = deferred(), began = deferred();
  try {
    const task = fixture.claim()!, signal = new AbortController().signal;
    const workspace = await fixture.context.workspace(fixture.run, task, signal);
    const evidence = await fixture.context.artifact(fixture.run, task, { name: 'prior-evidence.txt', kind: 'report', bytes: 'Useful evidence before recovery' });
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => { if (input.task.command === 'late-result') { began.resolve(); await response.promise; } return execute(input); };
    const pending = fixture.context.execute(fixture.run, task, workspace, 'late-result', signal);
    const rejected = pending.then(() => undefined, error => error instanceof Error ? error : Error(String(error)));
    await began.promise;
    fixture.store.change(fixture.run.id, run => { run.tasks[0]!.leaseUntil = Date.now() - 1; }); fixture.store.recover();
    await fixture.context.remove(workspace);
    const replacement = fixture.claim('replacement')!;
    fixture.context.change(fixture.run, replacement, run => { run.candidates[0]!.diagnosis = 'Replacement result'; });
    response.resolve(); expect((await rejected)?.message).toContain('Stale task lease');
    expect(() => fixture.context.change(fixture.run, task, run => { run.candidates[0]!.diagnosis = 'Stale overwrite'; })).toThrow('Stale task lease');
    expect(() => fixture.context.message(fixture.run, task, 'Stale finding')).toThrow('Stale task lease');
    await expect(fixture.context.artifact(fixture.run, task, { name: 'stale.txt', kind: 'report', bytes: 'Stale artifact' })).rejects.toThrow('Stale task lease');
    const run = fixture.store.get(fixture.run.id)!;
    expect(run.candidates[0]!.diagnosis).toBe('Replacement result');
    expect(run.artifacts.some(artifact => artifact.id === evidence.id)).toBe(true);
    expect(new TextDecoder().decode(await fixture.artifacts.read({ sha256: evidence.sha256 }))).toBe('Useful evidence before recovery');
    expect(run.artifacts.some(artifact => artifact.name === 'stale.txt')).toBe(false);
  } finally { response.resolve(); fixture.coordinator.cancel(fixture.run.id); await fixture.close(); }
});

test('preparation failure destroys its workspace before rejecting to the caller', async () => {
  const fixture = await runnerFixture();
  try {
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => ({ ...await execute(input), exitCode: 1 });
    await expect(fixture.context.workspace(fixture.run, fixture.claim()!, new AbortController().signal)).rejects.toThrow('Dependency preparation failed');
    expect(fixture.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
    expect(fixture.store.get(fixture.run.id)!.artifacts.some(artifact => artifact.kind === 'log')).toBe(true);
  } finally { fixture.coordinator.cancel(fixture.run.id); await fixture.close(); }
});

test('a workspace created after lease recovery is recorded for cleanup and never prepared', async () => {
  const fixture = await runnerFixture({ maxRetries: 1 }), created = deferred(), release = deferred();
  try {
    const create = fixture.provider.createWorkspace;
    fixture.provider.createWorkspace = async input => { const value = await create(input); created.resolve(); await release.promise; return value; };
    const task = fixture.claim()!, pending = fixture.context.workspace(fixture.run, task, new AbortController().signal);
    const rejected = pending.then(() => undefined, error => error instanceof Error ? error : Error(String(error)));
    await created.promise;
    fixture.store.change(fixture.run.id, run => { run.tasks[0]!.leaseUntil = Date.now() - 1; }); fixture.store.recover();
    release.resolve(); expect((await rejected)?.message).toContain('Stale task lease');
    expect(fixture.calls).toHaveLength(0); expect(fixture.workspaces.size).toBe(0); expect(fixture.store.workspaces()).toHaveLength(0);
  } finally { release.resolve(); fixture.coordinator.cancel(fixture.run.id); await fixture.close(); }
});
