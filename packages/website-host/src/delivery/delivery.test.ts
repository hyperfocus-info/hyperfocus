import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, verifyArtifact } from './artifact';
import { inspectRailwayDeployment, uploadDeploymentId, uploadRailway } from './railway';
import { createAcceptanceManifest } from './acceptance';

test('artifact checks reject mutation, extras, traversal and mismatched evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'delivery-contract-'));
  try {
    await Bun.write(join(directory, 'app.js'), 'application');
    const manifest = { schema: 'fixture', files: [{ path: 'app.js', sha256: digest('application') }] };
    const file = join(directory, 'artifact.json'); await Bun.write(file, JSON.stringify(manifest));
    expect((await verifyArtifact({ directory })).receipt.files).toHaveLength(1);
    await Bun.write(join(directory, 'extra'), 'private');
    await expect(verifyArtifact({ directory })).rejects.toThrow('Unexpected'); await rm(join(directory, 'extra'));
    await Bun.write(join(directory, 'app.js'), 'changed'); await expect(verifyArtifact({ directory })).rejects.toThrow('changed');
    manifest.files[0]!.path = '../app.js'; await Bun.write(file, JSON.stringify(manifest));
    await expect(verifyArtifact({ directory })).rejects.toThrow('relative');
    const report = join(directory, 'report.json'); await Bun.write(report, JSON.stringify({ passed: true, artifactSha256: digest('other') }));
    await expect(createAcceptanceManifest({ artifactPath: file, reports: [report] })).rejects.toThrow('another artifact');
    await Bun.write(report, JSON.stringify({ passed: true, artifactSha256: digest(await Bun.file(file).bytes()) }));
    expect((await createAcceptanceManifest({ artifactPath: file, reports: [report] })).humanApproved).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Railway status follows uploaded identity even when a newer release succeeds', async () => {
  const id = crypto.randomUUID(), target = { projectId: crypto.randomUUID(), environmentId: crypto.randomUUID(), serviceId: crypto.randomUUID() };
  expect(uploadDeploymentId(JSON.stringify({ deploymentId: id }))).toBe(id);
  expect(() => uploadDeploymentId('{}')).toThrow('may have completed');
  let args: string[] = [];
  await uploadRailway({ directory: '/candidate', target, message: 'artifact:hash', run: async input => { args = input; return JSON.stringify({ deploymentId: id }); } });
  expect(args).toContain('--project'); expect(args).not.toContain('--no-gitignore');
  const result = await inspectRailwayDeployment({ id, target, run: async () => JSON.stringify([{ id: crypto.randomUUID(), status: 'SUCCESS' }, { id, status: 'FAILED' }]) });
  expect(result.status).toBe('FAILED');
  await expect(inspectRailwayDeployment({ id, target, run: async () => '[]' })).rejects.toThrow('do not substitute');
});
