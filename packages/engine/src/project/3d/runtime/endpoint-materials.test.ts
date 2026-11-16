import { expect, test } from 'bun:test';
import { acquireSceneEndpointWriter3D, createBoundedScene3D } from '../../../render/3d-scene.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { createRuntimeEndpointMaterials3D } from './endpoint-materials.ts';

function fixture(revisionNamespace?: string) {
  const scene = createBoundedScene3D({ transforms: 1, instances: 1, meshes: 1, materials: 2, textures: 1, textureBytes: 4, lights: 1 });
  const definitions = ['a', 'b'].map(id => ({ id })), handles = new Map(definitions.map(({ id }) => [id, { static: scene.createMaterial() }]));
  const texture = scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([1, 2, 3, 255]) });
  const frame = definitions.map(({ id }) => ({ id, look: structuredClone(materialPreset3D('toon-hero').look) }));
  for (const entry of frame) Object.assign(entry.look.textures, { baseColor: 't' });
  const owner = createRuntimeEndpointMaterials3D({ endpoint: acquireSceneEndpointWriter3D(scene), materials: definitions, handles,
    textures: new Map([['t', texture]]), revisionNamespace });
  return { scene, handles, frame, texture, owner };
}

test('revision values preserve duplicate input order, unknown IDs and monotonic restoration', () => {
  const f = fixture('ordered:endpoint');f.owner.apply(f.frame);const first = f.owner.readInputRevisions().values.slice();
  const changed = structuredClone(f.frame[0]!);Object.assign(changed.look.baseColor, { 0: .125 });
  const duplicate = [f.frame[0]!, changed];f.owner.apply(duplicate);const ordered = f.owner.readInputRevisions().values.slice();
  expect(ordered[0]).toBe(first[0]);expect(ordered[1]).toBeGreaterThan(ordered[0]!);
  f.owner.apply(duplicate);const again = f.owner.readInputRevisions().values.slice();
  expect(again[0]).toBeGreaterThan(ordered[1]!);expect(again[1]).toBeGreaterThan(again[0]!);
  f.owner.apply([changed, f.frame[0]!]);const reversed = f.owner.readInputRevisions().values.slice();
  expect(reversed[0]).toBe(again[1]);expect(reversed[1]).toBeGreaterThan(reversed[0]!);
  f.owner.apply([...f.frame, { ...changed, id: 'unknown' }]);const window = f.owner.readInputRevisions();
  expect(window.values[2]).toBe(0);expect(window.values[0]).toBe(reversed[1]);expect(window.values[1]).toBe(first[1]);
  const stable = window.values.slice();f.owner.invalidateInputRevisions();expect(() => f.owner.readInputRevisions()).toThrow('complete successful');
  f.owner.apply([...f.frame, { ...changed, id: 'unknown' }]);expect(f.owner.readInputRevisions().values).toEqual(stable);
});

test('revision buffers remain bounded and disabled owners allocate no revision arrays', () => {
  const original = fixture();original.owner.apply(original.frame);expect(original.owner.readInputRevisionWork()).toBeUndefined();
  expect(() => original.owner.readInputRevisions()).toThrow('enabled');
  const f = fixture('bounded:endpoint');f.owner.apply(f.frame);const initial = f.owner.readInputRevisions().values;
  for (let index = 0; index < 20; index++) f.owner.apply(structuredClone(f.frame));
  expect(f.owner.readInputRevisions().values).toBe(initial);
  expect(f.owner.readInputRevisionWork()).toMatchObject({ entries: 2, backingBytes: 16, allocations: 1, writes: 2, changes: 0 });
  f.owner.apply([...f.frame, { ...f.frame[0]!, id: 'unknown' }]);
  expect(f.owner.readInputRevisionWork()).toMatchObject({ entries: 3, backingBytes: 24, allocations: 2 });
  f.owner.apply(f.frame);expect(f.owner.readInputRevisionWork()).toMatchObject({ entries: 2, backingBytes: 16, allocations: 3 });
  expect(() => f.owner.apply(Array(20001).fill(f.frame[0]))).toThrow('20000');
  expect(() => f.owner.readInputRevisions()).toThrow('complete successful');
  expect(f.owner.readInputRevisionWork()).toMatchObject({ available: 0, backingBytes: 16, allocations: 3, writes: 0, changes: 0 });
  for (const namespace of ['', 'x'.repeat(257), 1]) {
    const input = { namespace: '' };Object.assign(input, { namespace });
    expect(() => fixture(input.namespace)).toThrow('namespace');
  }
});

test('resource replacement keeps input revisions while destruction invalidates publication on every retry', () => {
  const f = fixture('resources:endpoint');f.owner.apply(f.frame);const before = f.owner.readInputRevisions().values.slice();
  f.scene.replaceTexture({ handle: f.texture, width: 1, height: 1, pixels: new Uint8Array([9, 8, 7, 255]) });
  f.owner.resetWork();f.owner.apply(f.frame);
  expect(f.owner.readInputRevisions().values).toEqual(before);
  expect(f.owner.work).toMatchObject({ inputComparisons: 2, resourceValidations: 2, numericValidations: 0, inputCacheCopies: 0 });
  f.scene.destroyTexture(f.texture);
  for (let retry = 0; retry < 2; retry++) {
    expect(() => f.owner.apply(f.frame)).toThrow();expect(() => f.owner.readInputRevisions()).toThrow('complete successful');
  }
  const restored = f.scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([4, 5, 6, 255]) });
  expect(restored).toBe(f.texture);f.owner.apply(f.frame);expect(f.owner.readInputRevisions().values).toEqual(before);
});
