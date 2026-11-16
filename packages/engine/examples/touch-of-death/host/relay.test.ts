import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultProject, createHyperfocusProjectFiles, migrateProject, stableProjectJson } from '@hyperfocus/engine/project';
import { readLocalCombatProject, startLocalCombatRelay } from './relay.ts';

test('trusted relay disk loading preserves exact catalog and bytes with its own bounded archive allowance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tod-relay-project-')), pair = join(directory, '.hyperfocus');
  const project = createDefaultProject('Relay bytes');project.assets.push({ id: 'music', name: 'music.mp3', kind: 'audio', source: 'imported', mimeType: 'audio/mpeg', size: 4, lastModified: 0 });
  const bytes = new Uint8Array([1, 7, 13, 29]);
  const files = await createHyperfocusProjectFiles(project, [{ id: 'music', name: 'music.mp3', mimeType: 'audio/mpeg', bytes }], { compression: 'none' });
  try {
    await mkdir(pair);await Bun.write(join(pair, 'project.json'), files.projectJson);await Bun.write(join(pair, 'assets.hfp'), files.assetsArchive);
    const opened = await readLocalCombatProject({ projectRoot: directory });
    expect(stableProjectJson(opened.project)).toBe(stableProjectJson(migrateProject(JSON.parse(new TextDecoder().decode(files.projectJson)))));
    const digest = opened.project.assets.find(asset => asset.id === 'music')?.sha256;
    if (!digest) throw Error('Missing fixture asset digest');
    expect(opened.assets[0]?.bytes).toEqual(bytes);expect(opened.assets[0]?.sha256).toBe(digest);
    const archive = files.assetsArchive.slice(), view = new DataView(archive.buffer);
    let central = -1;
    for (let offset = 0; offset <= archive.length - 4; offset++) if (view.getUint32(offset, true) === 0x02014b50) { central = offset;break; }
    if (central < 0) throw Error('Missing central directory');
    // Header-only probes prove the cap before allocating or decompressing large data.
    view.setUint32(central + 24, 268435457, true);await Bun.write(join(pair, 'assets.hfp'), archive);
    await expect(readLocalCombatProject({ projectRoot: directory })).rejects.toThrow('headers disagree');
    view.setUint32(central + 24, 536870913, true);await Bun.write(join(pair, 'assets.hfp'), archive);
    await expect(readLocalCombatProject({ projectRoot: directory })).rejects.toThrow('unpacked byte limit 536870912');
  } finally {
    await rm(join(pair, 'project.json'), { force: true });await rm(join(pair, 'assets.hfp'), { force: true });await rmdir(pair);await rmdir(directory);
  }
});

test('invalid prebuilt moderation scripts fail before project loading or socket startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tod-moderation-script-'));
  const script = join(directory, 'moderation.js');
  try {
    const options = { projectRoot: join(directory, 'absent-project'), port: 8801,
      moderationScriptPath: script, moderator: { token: 'x'.repeat(32), reviewerId: 'test-host' } };
    await expect(startLocalCombatRelay(options)).rejects.toThrow();
    await Bun.write(script, '  \n');
    await expect(startLocalCombatRelay(options)).rejects.toThrow('prebuilt host moderation script is empty');
  } finally { await rm(script, { force: true });await rmdir(directory); }
});
