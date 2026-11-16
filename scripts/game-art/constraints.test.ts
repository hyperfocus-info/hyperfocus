import { expect, test } from 'bun:test';
import { parseArtifactConstraints, verifyArtifactConstraints } from '@hyperfocus/artifact-review/constraints';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(run: (options: { directory: string; manifestPath: string; bytes: Uint8Array }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'game-art-constraints-'));
  try {
    const bytes = new Uint8Array([1, 2, 3]), sha256 = createHash('sha256').update(bytes).digest('hex');
    await Bun.write(join(directory, 'forearm.glb'), bytes);
    await Bun.write(join(directory, 'direction.md'), 'Forearm scope only.');
    await Bun.write(join(directory, 'corpus.json'), JSON.stringify({ golden: [] }));
    const receipt = JSON.stringify({ quote: 'Forearms fit; locomotion needs work', scope: 'forearms only' });
    await Bun.write(join(directory, 'receipt.json'), receipt);
    const manifestPath = join(directory, 'constraints.json');
    await Bun.write(manifestPath, JSON.stringify({ schemaVersion: 1, id: 'fixture', constitution: 'direction.md', corpus: 'corpus.json',
      locks: [{ id: 'forearms', scope: 'forearms only', evidence: [{ path: 'receipt.json', sha256: createHash('sha256').update(receipt).digest('hex') }],
        assets: [{ id: 'forearm', path: 'forearm.glb', sha256 }] }] }));
    await run({ directory, manifestPath, bytes });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('public constraint API preserves scoped geometry while unrelated motion changes', async () => {
  await fixture(async ({ manifestPath, bytes }) => {
    const report = await verifyArtifactConstraints({ manifestPath, assets: [{ id: 'forearm', bytes }, { id: 'run', bytes: new Uint8Array([9]) }] });
    expect(report.assetsChecked).toBe(1);
    expect(report.locks[0]?.scope).toBe('forearms only');
    expect(report.status).toBe('constraints-preserved');
    expect('stage' in report).toBe(false);
  });
});
test('rejects omitted, modified and duplicate candidate assets', async () => {
  await fixture(async ({ manifestPath, bytes }) => {
    await expect(verifyArtifactConstraints({ manifestPath, assets: [] })).rejects.toThrow('Missing locked asset');
    await expect(verifyArtifactConstraints({ manifestPath, assets: [{ id: 'forearm', bytes: new Uint8Array([4]) }] })).rejects.toThrow('Locked asset changed');
    await expect(verifyArtifactConstraints({ manifestPath, assets: [{ id: 'forearm', bytes }, { id: 'forearm', bytes }] })).rejects.toThrow('Duplicate candidate');
  });
});
test('checks archived bytes and approval evidence rather than trusting manifest hashes', async () => {
  await fixture(async ({ directory, manifestPath }) => {
    expect((await verifyArtifactConstraints({ manifestPath })).filesChecked).toBe(2);
    await Bun.write(join(directory, 'receipt.json'), '{}');
    await expect(verifyArtifactConstraints({ manifestPath })).rejects.toThrow('Locked reference bytes changed');
    await rm(join(directory, 'forearm.glb'));
    await expect(verifyArtifactConstraints({ manifestPath })).rejects.toThrow('Missing locked reference');
  });
});
test('fails closed on empty, malformed or ambiguous lock manifests', async () => {
  await fixture(async ({ manifestPath }) => {
    const raw = await Bun.file(manifestPath).json();
    expect(() => parseArtifactConstraints({ ...raw, locks: [] })).toThrow();
    expect(() => parseArtifactConstraints({ ...raw, locks: [raw.locks[0], raw.locks[0]] })).toThrow('Duplicate lock');
    raw.locks[0].scope = '';
    expect(() => parseArtifactConstraints(raw)).toThrow();
  });
});

test('CLI checks inventory-relative asset files and exits unsuccessfully for changed bytes', async () => {
  await fixture(async ({ directory, manifestPath }) => {
    const inventory = join(directory, 'inventory.json');
    await Bun.write(inventory, JSON.stringify({ assets: [{ id: 'forearm', path: 'forearm.glb' }] }));
    const run = () => spawnBackgroundProcessSync({ cmd: [process.execPath, join(import.meta.dir, 'check.ts'), manifestPath, inventory], stdout: 'pipe', stderr: 'pipe' });
    const valid = run();
    expect(valid.exitCode).toBe(0);
    expect(JSON.parse(valid.stdout.toString()).assetsChecked).toBe(1);
    await Bun.write(join(directory, 'wrong.glb'), new Uint8Array([9]));
    await Bun.write(inventory, JSON.stringify({ assets: [{ id: 'forearm', path: 'wrong.glb' }] }));
    const changed = run();
    expect(changed.exitCode).not.toBe(0);
    expect(changed.stderr.toString()).toContain('Locked asset changed');
  });
});
