import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { runnerFixture } from './runner-test-fixture';
import { captureEngineeringEvidence } from './engineering';
import { formatEvidenceAccess, readEvidenceAccess, swarmEvidenceProgress } from './command-evidence';
import { createSwarmTaskContext } from './task-context';
import { preserveSwarmInterruptedPatch } from './failure-evidence';
import { createSwarmStore } from '../persistence/store';
import { swarmHandoff } from '../reasoning/model-turn';

test('capture/read progress and learned causes survive intervening turns and a fresh SQLite connection', async () => {
  const parent = resolve(import.meta.dir, '../../../../.local/swarm-tests');mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(resolve(parent, 'evidence-progress-')), database = resolve(directory, 'run.sqlite');
  const fixture = await runnerFixture({ database: new Database(database) }), signal = new AbortController().signal;
  let reopened: Database | undefined;
  try {
    const baseline = fixture.claim()!;fixture.finish(baseline);
    const task = fixture.claim('reader', ['reasoning'])!, workspace = await fixture.context.workspace(fixture.run, task, signal);
    const capture = fixture.provider.captureArtifacts;
    let payload = 'abcdefghij', captureCalls = 0;
    fixture.provider.captureArtifacts = async input => {
      if (!input.paths) return capture(input);
      captureCalls++;
      return [{ name: input.paths[0]!, mediaType: 'text/plain', bytes: new TextEncoder().encode(payload), sha256: '0'.repeat(64) }];
    };
    const first = await captureEngineeringEvidence(fixture.context, fixture.run, task, workspace, signal, ['.local/probe.txt']);
    const artifactId = first.artifactIds[0]!;
    expect((await fixture.context.readArtifact(fixture.run, task, { artifactId, maxCharacters: 4 }, signal)).text).toBe('abcd');
    fixture.context.message(fixture.run, task, 'Cause: the renderer never allocated the retained feedback material.', 'evidence', [artifactId]);
    await preserveSwarmInterruptedPatch({ context: fixture.context, run: fixture.run, task, workspace, reason: 'Keep partial repair', checkpoint: true });
    for (let index = 0; index < 6; index++) {
      await fixture.context.execute(fixture.run, task, workspace, `inspect-unrelated-${index}`, signal);
      swarmHandoff(fixture.context, fixture.run, task);
    }
    reopened = new Database(database);
    const store = createSwarmStore({ db: reopened });
    const context = createSwarmTaskContext({ store, provider: fixture.provider, artifacts: fixture.artifacts, recipes: fixture.context.recipes });
    const handoff = JSON.parse(swarmHandoff(context, fixture.run, task));
    expect(handoff.evidenceProgress.captures).toEqual([{ action: 'capture', artifactId, path: '.local/probe.txt', bytes: 10, sha256: createHash('sha256').update(payload).digest('hex'), reused: false, count: 1 }]);
    expect(handoff.evidenceProgress.reads).toMatchObject([{ artifactId, offset: 0, endOffset: 4, nextOffset: 4, count: 1 }]);
    expect(handoff.findings.some((finding: { text: string }) => finding.text.startsWith('Cause: the renderer'))).toBe(true);
    expect(handoff.checkpoints).toHaveLength(1);
    expect(handoff.checkpoints[0].name).toEndWith('-partial.json');
    const repeated = await captureEngineeringEvidence(context, fixture.run, task, workspace, signal, ['.local/probe.txt']);
    expect(repeated.artifactIds).toEqual(first.artifactIds);expect(captureCalls).toBe(2);
    expect(store.get(fixture.run.id)!.artifacts.filter(artifact => artifact.name === '.local/probe.txt')).toHaveLength(1);
    await context.readArtifact(fixture.run, task, { artifactId, maxCharacters: 4 }, signal);
    const next = await context.readArtifact(fixture.run, task, { artifactId, offset: handoff.evidenceProgress.reads[0].nextOffset, maxCharacters: 4 }, signal);
    expect(next.text).toBe('efgh');
    const progressed = JSON.parse(swarmHandoff(context, fixture.run, task)).evidenceProgress;
    expect(progressed.captures[0]).toMatchObject({ artifactId, reused: true, count: 2 });
    expect(progressed.reads).toMatchObject([{ offset: 0, count: 2 }, { offset: 4, nextOffset: 8, count: 1 }]);
    payload = 'ABCDEFGHIJ';
    const changed = await captureEngineeringEvidence(context, fixture.run, task, workspace, signal, ['.local/probe.txt']);
    expect(changed.artifactIds[0]).not.toBe(artifactId);expect(captureCalls).toBe(3);
    expect((await context.readArtifact(fixture.run, task, { artifactId, maxCharacters: 4 }, signal)).text).toBe('abcd');
    expect((await context.readArtifact(fixture.run, task, { artifactId: changed.artifactIds[0], maxCharacters: 4 }, signal)).text).toBe('ABCD');
  } finally {
    reopened?.close();await fixture.close();
    if (!resolve(directory).startsWith(parent + sep)) throw Error('Refusing cleanup outside owned fixture directory.');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('evidence progress stays within task/source ownership and denied reads create no trusted receipt', async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const baseline = fixture.claim()!;fixture.finish(baseline);
    const task = fixture.claim('first', ['reasoning'])!, other = fixture.claim('second', ['reasoning'])!;
    const workspace = await fixture.context.workspace(fixture.run, task, signal), otherWorkspace = await fixture.context.workspace(fixture.run, other, signal);
    fixture.provider.captureArtifacts = async ({ paths }) => [{ name: paths![0]!, mediaType: 'text/plain', bytes: new TextEncoder().encode('same bytes'), sha256: '0'.repeat(64) }];
    const foreign = await captureEngineeringEvidence(fixture.context, fixture.run, other, otherWorkspace, signal, ['.local/probe.txt']);
    const own = await captureEngineeringEvidence(fixture.context, fixture.run, task, workspace, signal, ['.local/probe.txt']);
    expect(own.artifactIds[0]).not.toBe(foreign.artifactIds[0]);
    const wrongWorkspace = await captureEngineeringEvidence(fixture.context, fixture.run, task, otherWorkspace, signal, ['.local/probe.txt']);
    expect(wrongWorkspace.artifactIds).toEqual([]);expect(wrongWorkspace.missing[0]).toContain('current task attempt');
    const wrongSource = await captureEngineeringEvidence(fixture.context, fixture.run, task, { ...workspace, sourceRevision: 'b'.repeat(40) }, signal, ['.local/probe.txt']);
    expect(wrongSource.artifactIds).toEqual([]);expect(wrongSource.missing[0]).toContain('current task attempt');
    const artifact = fixture.store.get(fixture.run.id)!.artifacts.find(artifact => artifact.id === own.artifactIds[0])!;
    const receipt = formatEvidenceAccess({ action: 'read', artifactId: artifact.id, sha256: artifact.sha256, offset: 0, endOffset: 4, totalCharacters: 10 });
    fixture.context.message(fixture.run, task, receipt, 'evidence', [artifact.id]);
    fixture.context.message(fixture.run, other, 'Other candidate private cause', 'evidence', foreign.artifactIds);
    fixture.store.change(fixture.run.id, run => {
      const original = run.messages.find(message => readEvidenceAccess(message)?.artifactId === artifact.id)!;
      run.messages.push({ ...original, id: 'stale-source-receipt', text: receipt, sourceRevision: 'b'.repeat(40) });
      run.messages.push({ ...original, id: 'wrong-agent-receipt', text: receipt, agentId: other.agentId });
      run.messages.push({ ...original, id: 'mismatched-hash-receipt', text: receipt.replace(artifact.sha256, 'c'.repeat(64)) });
      run.messages.push({ ...original, id: 'stale-source-finding', kind: 'evidence', text: 'Stale private cause', sourceRevision: 'b'.repeat(40) });
    });
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: foreign.artifactIds[0] }, signal)).rejects.toThrow('private');
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: artifact.id, offset: 99 }, signal)).rejects.toThrow('offset');
    const handoff = JSON.parse(swarmHandoff(fixture.context, fixture.run, task));
    expect(handoff.evidenceProgress.captures.map((capture: { artifactId: string }) => capture.artifactId)).toEqual(own.artifactIds);
    expect(handoff.evidenceProgress.reads).toEqual([]);
    expect(handoff.findings.some((finding: { text: string }) => finding.text.includes('private cause'))).toBe(false);
  } finally { await fixture.close(); }
});

test('handoff bounds evidence progress and findings without deleting durable receipts', async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const task = fixture.claim()!, workspace = await fixture.context.workspace(fixture.run, task, signal);
    fixture.provider.captureArtifacts = async ({ paths }) => [{ name: paths![0]!, mediaType: 'text/plain', bytes: new TextEncoder().encode('01234567890123456789'), sha256: '0'.repeat(64) }];
    for (let index = 0; index < 20; index++) {
      const captured = await captureEngineeringEvidence(fixture.context, fixture.run, task, workspace, signal, [`.local/probe-${index}.txt`]);
      await fixture.context.readArtifact(fixture.run, task, { artifactId: captured.artifactIds[0], offset: index, maxCharacters: 1 }, signal);
      fixture.context.message(fixture.run, task, `Cause ${index}: ` + 'detail '.repeat(200), 'evidence', captured.artifactIds);
    }
    const run = fixture.store.get(fixture.run.id)!, progress = swarmEvidenceProgress(run, task), handoff = JSON.parse(swarmHandoff(fixture.context, fixture.run, task));
    expect(progress.captures).toHaveLength(16);expect(progress.reads).toHaveLength(16);
    expect(progress.olderCaptures).toBe(4);expect(progress.olderReads).toBe(4);
    expect(handoff.findings).toHaveLength(4);expect(handoff.olderFindings).toBe(16);
    expect(handoff.findings.every((finding: { text: string }) => finding.text.length <= 1_000)).toBe(true);
    expect(run.messages.filter(message => readEvidenceAccess(message))).toHaveLength(40);
  } finally { await fixture.close(); }
});
