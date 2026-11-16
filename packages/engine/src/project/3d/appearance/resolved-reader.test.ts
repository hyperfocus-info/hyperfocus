import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { readAppearanceCatalog3D, resolveAppearance3D } from './catalog.ts';
import { readResolvedAppearance3D, readResolvedAppearancePoses3D, readCombatFramePresentation3D, type CombatFramePresentationData3D } from './resolved-reader.ts';

test('the real catalog resolver roundtrips every resolved patch with detached optional and extra data', () => {
  const catalog = readAppearanceCatalog3D({ version: 1, actors: [{ entityId: 'actor' }], slots: [{ id: 'look', label: 'Look', defaultOptionId: 'original', options: [{ id: 'original', label: 'Original',
    variants: [{ entitySuffix: '', variantId: 'coat' }], colors: [{ materialSuffix: ':top', baseColor: [.2, .3, .4, 1] }],
    poses: [{ phase: 'intro', style: 'bow' }], styles: [{ channel: 'movement', style: 'loose' }],
  }] }] });
  if (!catalog) throw new Error('Missing fixture catalog');
  const resolved = Object.assign(resolveAppearance3D({ catalog, actorId: 'actor', selections: {} }), { metadata: { version: 'future' } });
  const parsed = readResolvedAppearance3D(resolved);
  expect(parsed).toEqual(resolved);
  parsed.colors[0]!.baseColor[0] = .8;
  expect(resolved.colors[0]!.baseColor[0]).toBe(.2);
  expect(requireRecord(parsed).metadata === resolved.metadata).toBe(false);
  const poses = resolved.poses;
  if (!poses) throw new Error('Missing resolved fixture poses');
  expect(readResolvedAppearancePoses3D(poses)).toEqual(poses);
  const explicit = readResolvedAppearance3D({ variants: [], colors: [], poses: undefined, styles: undefined });
  expect(Object.hasOwn(explicit, 'poses')).toBe(true);
  expect(Object.hasOwn(readResolvedAppearance3D({ variants: [], colors: [] }), 'poses')).toBe(false);
});

test('resolved presentation rejects corrupt nested data rather than claiming complete patches', () => {
  for (const value of [null, [], {}, { variants: [], colors: [{ materialId: 'top', baseColor: [0, 0, NaN, 1] }] },
    { variants: [], colors: [{ materialId: 'top', baseColor: [0, 0, 0, .5] }] },
    { variants: [{ entityId: 'actor', variantId: 1 }], colors: [] },
    { variants: [], colors: [], poses: [{ actorId: 'actor', phase: 'running', style: 'bow' }] },
    { variants: [], colors: [], styles: [{ actorId: 'actor', channel: 'movement', style: 'embers' }] },
    { variants: [], colors: [], styles: [{ actorId: 1, channel: 'hit', style: 'snap' }] },
  ]) expect(() => readResolvedAppearance3D(value)).toThrow();
});

test('worker presentation projection preserves all present fields and supplies no defaults', () => {
  const presentation: CombatFramePresentationData3D = { poses: [{ actorId: 'actor', phase: 'victory', style: 'salute' }], styles: [{ actorId: 'actor', channel: 'recovery', style: 'roll-up' }], reducedMotion: false };
  const input = Object.assign(presentation, { metadata: { kept: true } });
  const parsed = readCombatFramePresentation3D(input);
  expect(parsed).toEqual(input);
  expect(parsed.poses === input.poses).toBe(false);
  expect(readCombatFramePresentation3D({})).toEqual({});
  expect(Object.hasOwn(readCombatFramePresentation3D({ reducedMotion: undefined }), 'reducedMotion')).toBe(true);
  expect(() => readCombatFramePresentation3D({ reducedMotion: 'false' })).toThrow();
  expect(() => readCombatFramePresentation3D({ poses: [undefined] })).toThrow();
});
