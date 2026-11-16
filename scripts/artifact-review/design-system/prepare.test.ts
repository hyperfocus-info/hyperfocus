import { expect, test } from 'bun:test';
import { mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareDesignReview, relocateDesignReview } from './prepare';
import { artifactManifestSchema } from "@hyperfocus/artifact-review/schema";
import { openArtifactReviews } from "@hyperfocus/artifact-review/persistence";

test('pairs exact filenames, labels unmatched evidence, and preserves identity across changed bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'design-review-'));
  try {
    await Bun.write(join(root, 'batch-app/before/task.png'), 'baseline');
    await Bun.write(join(root, 'batch-app/after/task.png'), 'updated');
    await Bun.write(join(root, 'batch-app/after/recovery.png'), 'recovery only');
    const outputPath = join(root, 'manifest.json');
    const result = await prepareDesignReview({ evidenceRoot: root, batch: 'batch', outputPath });
    expect(result.comparisons).toBe(1); expect(result.unpaired).toBe(1);
    const first = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    const after = first.items.find(item => item.comparison?.phase === 'after')!;
    const unmatched = first.items.find(item => !item.comparison)!;
    expect(unmatched.description).toContain('Unpaired');
    await prepareDesignReview({ evidenceRoot: root, batch: 'all', outputPath });
    expect(artifactManifestSchema.parse(await Bun.file(outputPath).json()).items).toEqual(first.items);
    await Bun.write(join(root, 'batch-app/after/task.png'), 'revision');
    await prepareDesignReview({ evidenceRoot: root, batch: 'batch', outputPath });
    const next = artifactManifestSchema.parse(await Bun.file(outputPath).json()).items.find(item => item.id === after.id)!;
    expect(next.sha256).not.toBe(after.sha256); expect(next.version).not.toBe(after.version);
    await Bun.write(join(root, 'batch-app/before/recovery.png'), 'new baseline');
    await prepareDesignReview({ evidenceRoot: root, batch: 'batch', outputPath });
    const paired = artifactManifestSchema.parse(await Bun.file(outputPath).json()).items.find(item => item.id === unmatched.id)!;
    expect(paired.sha256).toBe(unmatched.sha256); expect(paired.version).not.toBe(unmatched.version);
    await Bun.write(join(root, 'next-app/after/new.png'), 'next batch');
    await prepareDesignReview({ evidenceRoot: root, batch: 'next', outputPath, append: true });
    const appended = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    expect(appended.items).toHaveLength(5);
    expect(appended.items.find(item => item.id === paired.id)?.version).toBe(paired.version);
    await prepareDesignReview({ evidenceRoot: root, batch: 'next', outputPath, append: true });
    expect(artifactManifestSchema.parse(await Bun.file(outputPath).json()).items).toEqual(appended.items);
    const preservedManifest = await Bun.file(outputPath).text();
    await Bun.write(join(root, 'batch-app/after/task.png'), 'silently replaced old capture');
    await expect(prepareDesignReview({ evidenceRoot: root, batch: 'next', outputPath, append: true })).rejects.toThrow('Source bytes changed');
    expect(await Bun.file(outputPath).text()).toBe(preservedManifest);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('comparison schema rejects missing or duplicate phases and non-images', () => {
  const image = { id: 'before', title: 'Before', version: 1, sha256: 'a'.repeat(64), kind: 'image', media: 'before.png', comparison: { id: 'pair', phase: 'before' } };
  const input = { id: 'test', title: 'Test', items: [image] };
  expect(() => artifactManifestSchema.parse(input)).toThrow('both before and after');
  expect(() => artifactManifestSchema.parse({ ...input, items: [image, { ...image, id: 'duplicate' }] })).toThrow('Duplicate comparison');
  expect(() => artifactManifestSchema.parse({ ...input, items: [{ ...image, kind: 'audio' }] })).toThrow('before/after images');
});

test('relocation preserves exact review identities and feedback, and refuses changed source bytes before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'design-relocation-'));
  try {
    const previousEvidenceRoot = join(root, 'old'), evidenceRoot = join(root, 'moved'), outputPath = join(root, 'manifest.json');
    await Bun.write(join(previousEvidenceRoot, 'batch-app/after/task.png'), 'original capture');
    await prepareDesignReview({ evidenceRoot: previousEvidenceRoot, batch: 'all', outputPath });
    const original = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    const item = original.items[0];
    if (!item) throw new Error('Expected fixture asset');
    const databasePath = join(root, 'feedback.sqlite');
    const host = await openArtifactReviews({ manifestPath: outputPath, databasePath, manifest: original });
    const feedback = { notes: 'Keep the hierarchy', grade: 'A' };
    host.save(item.id, item.version, 0, feedback); host.close();
    const databaseBefore = await Bun.file(databasePath).arrayBuffer();
    await rename(previousEvidenceRoot, evidenceRoot);
    await relocateDesignReview({ previousEvidenceRoot, evidenceRoot, outputPath });
    const moved = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    expect(moved.items).toEqual(original.items.map(asset => ({ ...asset, media: join(evidenceRoot, 'batch-app/after/task.png') })));
    expect(await Bun.file(databasePath).arrayBuffer()).toEqual(databaseBefore);
    const reopened = await openArtifactReviews({ manifestPath: outputPath, databasePath, manifest: moved });
    expect(reopened.read(item.id, item.version).review).toEqual(feedback);
    expect(reopened.history(item.id)).toHaveLength(1); reopened.close();
    const savedManifest = await Bun.file(outputPath).text();
    await Bun.write(join(evidenceRoot, 'batch-app/after/task.png'), 'different capture');
    await expect(relocateDesignReview({ previousEvidenceRoot, evidenceRoot, outputPath })).rejects.toThrow('changed bytes');
    expect(await Bun.file(outputPath).text()).toBe(savedManifest);
    const revised = await relocateDesignReview({ previousEvidenceRoot, evidenceRoot, outputPath, reviseChanged: true });
    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions[0]?.previous).toEqual({ version: item.version, sha256: item.sha256 });
    expect(revised.revisions[0]?.current.version).not.toBe(item.version);
    if (!revised.history) throw new Error('Expected immutable manifest receipt');
    expect(await Bun.file(revised.history).text()).toBe(savedManifest);
    const current = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    const updatedHost = await openArtifactReviews({ manifestPath: outputPath, databasePath, manifest: current });
    expect(updatedHost.read(item.id, item.version).review).toEqual(feedback);
    const updated = current.items[0];
    if (!updated) throw new Error('Expected updated asset');
    expect(updatedHost.read(item.id, updated.version).review).toBeNull();
    expect(updatedHost.history(item.id)).toHaveLength(2); updatedHost.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
