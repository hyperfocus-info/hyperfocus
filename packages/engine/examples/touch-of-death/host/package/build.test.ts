import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createDefaultProject, createHyperfocusProjectFiles, createStandalonePlayableHtml, migrateProject } from '@hyperfocus/engine/project';
import { combatContentSource } from '../../src/network/identity.ts';
import { buildTouchOfDeathPackage, readPackageArguments, validatePackagePair, railwayDockerfile } from './build.ts';

test('package CLI rejects missing, duplicate and unknown arguments', () => {
  expect(readPackageArguments(['--project', 'p', '--html', 'h', '--out', 'o'])).toEqual({ projectRoot: 'p', artifactPath: 'h', outputDirectory: 'o' });
  for (const args of [[], ['--project'], ['--project', 'p', '--html', 'h'], ['--project', 'p', '--project', 'q', '--out', 'o'], ['--project', 'p', '--html', 'h', '--out', 'o', '--force', 'yes']]) expect(() => readPackageArguments(args)).toThrow();
});

test('release accepts an explicit dev policy database and Railway loads the candidate with runtime PostgreSQL credentials', () => {
  expect(readPackageArguments(['--project', 'p', '--html', 'h', '--out', 'o', '--policy-db', 'dev.sqlite']))
    .toEqual({ projectRoot: 'p', artifactPath: 'h', outputDirectory: 'o', policyDatabasePath: 'dev.sqlite' });
  for (const args of [['--policy-db', 'db'], ['--project', 'p', '--html', 'h', '--out', 'o', '--policy-db'],
    ['--project', 'p', '--html', 'h', '--out', 'o', '--policy-db', 'one', '--policy-db', 'two']]) expect(() => readPackageArguments(args)).toThrow();
  const dockerfile = railwayDockerfile();
  expect(dockerfile).toContain('COPY host.js game.html moderation.js policy-candidate.json ./');
  expect(dockerfile).toContain('ENV TOUCH_OF_DEATH_STORAGE=postgres');
  expect(dockerfile).toContain('ENV TOUCH_OF_DEATH_REQUIRE_POSTGRES=1');
  expect(dockerfile).toContain('ENV TOUCH_OF_DEATH_POLICY_CANDIDATE=/app/policy-candidate.json');
  expect(dockerfile).not.toContain('DATABASE_URL=');expect(dockerfile).not.toContain('sqlite');
});
test('embedded pair validation preserves timestamp normalization but rejects different projects, archives and malformed payloads', async () => {
  const project = createDefaultProject('Package fixture'), files = await createHyperfocusProjectFiles(project, []);
  const html = createStandalonePlayableHtml({ ...files, project, runtimeSource: 'void 0;' });
  await validatePackagePair({ html, projectSource: combatContentSource(project), assetsArchive: files.assetsArchive });
  const timestampOnly = { ...project, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2001-01-01T00:00:00.000Z' };
  await validatePackagePair({ html, projectSource: combatContentSource(timestampOnly), assetsArchive: files.assetsArchive });
  const changed = structuredClone(project);changed.name = 'Other project';
  await expect(validatePackagePair({ html, projectSource: combatContentSource(changed), assetsArchive: files.assetsArchive })).rejects.toThrow('differs');
  await expect(validatePackagePair({ html, projectSource: combatContentSource(project), assetsArchive: new Uint8Array([1]) })).rejects.toThrow();
  await expect(validatePackagePair({ html: '<html></html>', projectSource: combatContentSource(project), assetsArchive: files.assetsArchive })).rejects.toThrow('exactly one');
  await expect(validatePackagePair({ html: html + html, projectSource: combatContentSource(project), assetsArchive: files.assetsArchive })).rejects.toThrow('exactly one');
});

test('validated repacking preserves exact asset content while changed bytes, MIME and missing assets reject', async () => {
  const project = createDefaultProject('Repacked fixture');
  const assets = [{ id: 'fixture', name: 'fixture.bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(4096).fill(42) }];
  project.assets.push({ id: 'fixture', name: 'fixture.bin', kind: 'data', mimeType: 'application/octet-stream', size: 4096, lastModified: 0, source: 'generated' });
  const canonical = await createHyperfocusProjectFiles(project, assets, { compression: 'none' });
  const projectSource = combatContentSource(JSON.parse(new TextDecoder().decode(canonical.projectJson)));
  const packed = await createHyperfocusProjectFiles(project, assets, { compression: 'deflate' });
  expect(Buffer.from(canonical.assetsArchive).equals(Buffer.from(packed.assetsArchive))).toBe(false);
  const html = createStandalonePlayableHtml({ ...packed, project, runtimeSource: 'void 0;' });
  await validatePackagePair({ html, projectSource, assetsArchive: canonical.assetsArchive });
  for (const changed of [[{ ...assets[0]!, bytes: new Uint8Array(4096).fill(43) }], [{ ...assets[0]!, mimeType: 'text/plain' }], []]) {
    const different = await createHyperfocusProjectFiles(project, changed);
    const differentHtml = createStandalonePlayableHtml({ ...different, project, runtimeSource: 'void 0;' });
    await expect(validatePackagePair({ html: differentHtml, projectSource, assetsArchive: canonical.assetsArchive })).rejects.toThrow();
  }
});
test('builder never overwrites an existing output or publishes partial output for invalid input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tod-package-'));
  try {
    const output = join(root, 'release');await mkdir(output);await writeFile(join(output, 'keep'), 'unchanged');
    await expect(buildTouchOfDeathPackage({ projectRoot: 'missing', artifactPath: 'missing', outputDirectory: output })).rejects.toThrow('already exists');
    expect(await Bun.file(join(output, 'keep')).text()).toBe('unchanged');
    const fresh = join(root, 'fresh');await expect(buildTouchOfDeathPackage({ projectRoot: join(root, 'missing'), artifactPath: 'missing', outputDirectory: fresh })).rejects.toThrow();
    expect(await readdir(root)).toEqual(['release']);
    await expect(buildTouchOfDeathPackage({ projectRoot: '', artifactPath: 'missing', outputDirectory: fresh })).rejects.toThrow('nonempty');
  } finally { if (dirname(resolve(root)) !== resolve(tmpdir())) throw Error('Unsafe fixture cleanup');await rm(root, { recursive: true, force: true }); }
});

test('a portable inventory above the browser hydration cap reaches package validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tod-package-large-'));
  try {
    const project = createDefaultProject('Large inventory'), bytes = new Uint8Array(26214400);
    project.assets.push({ id: 'large', name: 'large.bin', kind: 'data', source: 'imported', mimeType: 'application/octet-stream', size: bytes.length, lastModified: 0 });
    const files = await createHyperfocusProjectFiles(project, [{ id: 'large', name: 'large.bin', mimeType: 'application/octet-stream', bytes }]);
    await mkdir(join(root, '.hyperfocus'));await writeFile(join(root, '.hyperfocus/project.json'), files.projectJson);await writeFile(join(root, '.hyperfocus/assets.hfp'), files.assetsArchive);
    await expect(buildTouchOfDeathPackage({ projectRoot: root, artifactPath: 'unused', outputDirectory: join(root, 'release') })).rejects.toThrow('supported two-fighter');
  } finally { if (dirname(resolve(root)) !== resolve(tmpdir())) throw Error('Unsafe fixture cleanup');await rm(root, { recursive: true, force: true }); }
});

test('streamed exports preserve canonical identity and exact music bytes without embedding the library', async () => {
  const project = createDefaultProject('Streamed package'), bytes = new Uint8Array([73, 68, 51, 7]);
  project.assets.push({ id: 'song', name: 'song.mp3', kind: 'audio', source: 'imported', mimeType: 'audio/mpeg', size: bytes.length, lastModified: 0 });
  const files = await createHyperfocusProjectFiles(project, [{ id: 'song', name: 'song.mp3', mimeType: 'audio/mpeg', bytes }]);
  const canonical = migrateProject(JSON.parse(new TextDecoder().decode(files.projectJson))), delivery = structuredClone(canonical);
  const catalog = canonical.assets.find(asset => asset.id === 'song')!, delivered = delivery.assets.find(asset => asset.id === 'song')!;
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const source = { assetId: 'song', url: `audio/${sha256}.mp3`, sha256, size: bytes.length, durationSeconds: 1,
    originalCatalog: { source: catalog.source, sha256: catalog.sha256 } };
  delivered.source = 'generated';delete delivered.sha256;
  const packed = await createHyperfocusProjectFiles(delivery, []);
  const html = createStandalonePlayableHtml({ ...packed, project: delivery, runtimeSource: 'void 0;', streamedAudio: [source] });
  await validatePackagePair({ html, projectSource: combatContentSource(canonical), assetsArchive: files.assetsArchive });
  const wrong = { ...source, sha256: '0'.repeat(64), url: `audio/${'0'.repeat(64)}.mp3`, originalCatalog: { source: 'imported' as const } };
  const changed = createStandalonePlayableHtml({ ...packed, project: delivery, runtimeSource: 'void 0;', streamedAudio: [wrong] });
  await expect(validatePackagePair({ html: changed, projectSource: combatContentSource(canonical), assetsArchive: files.assetsArchive })).rejects.toThrow();
  const missing = createStandalonePlayableHtml({ ...packed, project: delivery, runtimeSource: 'void 0;' });
  await expect(validatePackagePair({ html: missing, projectSource: combatContentSource(canonical), assetsArchive: files.assetsArchive })).rejects.toThrow();
});
