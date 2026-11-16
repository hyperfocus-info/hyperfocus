import { expect, test } from 'bun:test';
import { createDefaultProject, migrateProject, validateProject } from '../editor.ts';
import { createHyperfocusProjectFiles, openHyperfocusProjectFiles } from '../index.ts';
import { validateAudioAssetMetadata } from './assets.ts';

test('portable song metadata keeps uncertain estimates and explicit undetected tempo', async () => {
  const project = createDefaultProject('Song tempo');
  project.assets.push({ id: 'song', name: 'Song.mp3', kind: 'audio', mimeType: 'audio/mpeg', size: 4,
    lastModified: 1, source: 'imported', audioMetadata: { bpm: 93.75, bpmConfidence: .53,
      bpmSource: 'synaesthetic-v4.0', bpmStatus: 'estimated' } });
  const files = await createHyperfocusProjectFiles(project, [{ id: 'song', name: 'Song.mp3', mimeType: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) }]);
  const restored = await openHyperfocusProjectFiles(files.projectJson, files.assetsArchive, { parseProject: migrateProject });
  expect(restored.project.assets.find(asset => asset.id === 'song')?.audioMetadata).toEqual(project.assets.at(-1)?.audioMetadata);
  expect(() => validateAudioAssetMetadata({ bpmConfidence: 0, bpmSource: 'synaesthetic-v4.0', bpmStatus: 'undetected' })).not.toThrow();
  project.assets.at(-1)!.audioMetadata = { bpm: 156, bpmConfidence: 1, bpmSource: 'ID3v2.3/TBPM', bpmStatus: 'tagged' };
  const tagged = await createHyperfocusProjectFiles(project, [{ id: 'song', name: 'Song.mp3', mimeType: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) }]);
  const reopened = await openHyperfocusProjectFiles(tagged.projectJson, tagged.assetsArchive, { parseProject: migrateProject });
  expect(reopened.project.assets.find(asset => asset.id === 'song')?.audioMetadata?.bpmStatus).toBe('tagged');
});

test('rejects contradictory tempo, non-finite confidence and tempo on non-audio assets', () => {
  for (const metadata of [
    { bpm: 120, bpmConfidence: 0, bpmSource: 'analysis', bpmStatus: 'undetected' },
    { bpmConfidence: .2, bpmSource: 'analysis', bpmStatus: 'undetected' },
    { bpmConfidence: .6, bpmSource: 'analysis', bpmStatus: 'estimated' },
    { bpm: 120, bpmConfidence: NaN, bpmSource: 'analysis', bpmStatus: 'estimated' },
    { bpm: 120, bpmConfidence: .5, bpmSource: 'ID3v2.3/TBPM', bpmStatus: 'tagged' },
  ]) expect(() => validateAudioAssetMetadata(metadata)).toThrow();
  const project = createDefaultProject();
  project.assets[0]!.audioMetadata = { bpm: 120, bpmConfidence: .9, bpmSource: 'analysis', bpmStatus: 'estimated' };
  expect(() => validateProject(project)).toThrow('requires an audio asset');
});
