import { expect, test } from 'bun:test';
import { readGameplayProject3D } from './project-reader.ts';

test('reads the narrow gameplay project without editor metadata or applying defaults', () => {
  const source = { activeSceneId: 's', scenes: [{ id: 's', label: 'scene', entities: [{ id: 'entity', components: [{ id: 'c', type: 'behavior', enabled: true, values: { module: 'm.ts', value: 1, flag: false } }] }] }], assets: [{ id: 'a', mimeType: 'audio/wav', detail: { original: true } }], extensions: { custom: { value: [1] } } };
  const decoded = readGameplayProject3D(source);
  expect(decoded).toEqual(source);
  decoded.extensions!.custom = false;
  expect(source.extensions.custom).toEqual({ value: [1] });
  expect(readGameplayProject3D({ activeSceneId: '', scenes: [] })).toEqual({ activeSceneId: '', scenes: [] });
});

test('rejects nested component/asset corruption instead of claiming a full project', () => {
  for (const values of [{ x: null }, { x: Infinity }, { x: [] }, { x: {} }]) expect(() => readGameplayProject3D({ activeSceneId: 's', scenes: [{ id: 's', entities: [{ components: [{ id: 'c', type: 'behavior', enabled: true, values }] }] }] })).toThrow();
  for (const asset of [{ id: false }, { id: 'a', mimeType: 3 }]) expect(() => readGameplayProject3D({ activeSceneId: 's', scenes: [], assets: [asset] })).toThrow();
  expect(() => readGameplayProject3D({ activeSceneId: 's', scenes: [{ id: 's', entities: [{ components: [{ id: 'c', type: 'behavior', enabled: 'yes', values: {} }] }] }] })).toThrow();
});
