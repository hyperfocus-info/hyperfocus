import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame as Frame } from '../../../frame/3d.ts';
import { createBoundedScene3D, createRenderCommandBuffer3D, MATERIAL_FLAG_SKINNED_3D } from '../../../render/3d-scene.ts';
import { createRenderFramePacket3D } from '../../../experimental/frame-packet-3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { createRuntimeEntityApplicator3D } from './entities.ts';
import { createRuntimeMaterialApplicator3D } from './materials.ts';
import { createRuntimeEndpointProducer3D } from './endpoint-producer.ts';
import { evaluatedFrameFixture3D } from '../../../test-support/evaluated-frame3d.ts';

function fixture(endpointMode: boolean, skeletons = 0, revisionNamespace?: string) {
  const scene = createBoundedScene3D({ transforms: 2, instances: 2, meshes: 2, materials: 2, textures: 1, textureBytes: 4, lights: 1 });
  const meshes = new Map(['a', 'b'].map(id => [id, scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) })]));
  const handles = new Map(['a', 'b'].map(id => [id, { static: scene.createMaterial() }]));
  const texture = scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([1, 2, 3, 255]) });
  const textures = new Map([['texture', texture]]), transform = scene.transforms.create();
  const instance = scene.createInstance({ transform, mesh: meshes.get('a')!, material: handles.get('a')!.static });
  const declared = [{ id: 'entity', meshId: 'a', materialId: 'a', variants: [{ id: 'other', meshId: 'b', materialId: 'b' }] }];
  const materialDefinitions = [{ id: 'a' }, { id: 'b' }];
  const entities = { scene, entities: declared, transforms: new Map([['entity', transform]]), instances: new Map([['entity', instance]]), meshes, materials: handles };
  const materials = { materials: materialDefinitions, handles, textures, revisionNamespace };
  const applyEntities = createRuntimeEntityApplicator3D(entities), applyMaterials = createRuntimeMaterialApplicator3D({ scene, ...materials });
  const frame: Frame = { ...evaluatedFrameFixture3D(), sceneId: 'scene', entities: [{ id: 'entity', position: [1, 2, 3], rotation: [0, 0, 0, 2], scale: [2, 3, 4], visible: false }],
    materials: materialDefinitions.map(({ id }) => ({ id, look: structuredClone(materialPreset3D('toon-hero').look) })),
    socketAttachments: [], performances: [], poseCorrections: [], ikCorrections: [], physicalBodies: [], effects: [], lights: [],
  };
  const commands = createRenderCommandBuffer3D({ commands: 2, instances: 2, lights: 1 });
  const compileAlias = scene.compile;compileAlias(commands);
  const packet = createRenderFramePacket3D({ scene, commands });
  const owner = endpointMode ? createRuntimeEndpointProducer3D({ sceneId: 'scene', entities, materials, skeletons }) : undefined;
  const apply = (value = frame) => {
    if (!owner?.tryApply(value)) { applyEntities(value.entities);applyMaterials(value.materials); }
    owner?.finish(value);
  };
  return { scene, frame, apply, owner, transform, instance, meshes, handles, texture, packet, commands, compileAlias };
}

test('endpoint producer removes static renderer work, keeps validation, and locks captured compile aliases after bootstrap', () => {
  const full = fixture(false), endpoint = fixture(true);
  expect(endpoint.packet.byteLength).toBe(full.packet.byteLength);
  const before = { positions: endpoint.scene.transforms.positions.slice(), materials: endpoint.scene.materialData.slice() };
  full.apply();endpoint.apply();
  expect(endpoint.scene.transforms.positions).toEqual(before.positions);expect(endpoint.scene.materialData).toEqual(before.materials);
  expect(full.scene.transforms.positions).not.toEqual(before.positions);expect(full.scene.materialData).not.toEqual(before.materials);
  expect(endpoint.owner!.work).toMatchObject({ applications: 1, staticApplications: 1, fullFallbacks: 0, entityVisits: 1, transformValidations: 1,
    instanceResourceValidations: 1, entityRendererComparisons: 0, entityRendererWrites: 0, materialVisits: 2, materialResourceValidations: 2,
    materialNumericValidations: 2, materialRendererComparisons: 0, materialRendererWrites: 0, materialRendererCacheBytesCopied: 0, scratchBytes: 112 });
  endpoint.apply(structuredClone(endpoint.frame));
  expect(endpoint.owner!.work).toMatchObject({ materialNumericValidations: 0, materialResourceValidations: 2, materialInputCacheCopies: 0 });
  expect(() => endpoint.compileAlias(endpoint.commands)).toThrow('Endpoint producer');
  expect(() => endpoint.scene.compile(endpoint.commands)).toThrow('Endpoint producer');
});

test('endpoint producer rejects invalid entity/material inputs using the same validation owners', () => {
  const mutations: Array<(frame: Frame) => void> = [
    f => { f.entities[0]!.position[0] = NaN; }, f => { f.entities[0]!.scale[2] = Infinity; },
    f => { f.entities[0]!.rotation = [0, 0, 0, 0]; }, f => { f.entities[0]!.rotation[2] = NaN; },
    f => { f.entities[0]!.id = 'missing'; }, f => { f.entities[0]!.variantId = 'missing'; }, f => { f.entities[0]!.renderMaterialId = 'missing'; },
    f => { Object.assign(f.materials[0]!.look.uv, { rotation: NaN }); }, f => { Object.assign(f.materials[0]!.look, { opacity: -1 }); },
    f => { Object.assign(f.materials[0]!.look, { metallic: 2 }); }, f => { Object.assign(f.materials[0]!.look, { roughness: Infinity }); },
    f => { Object.assign(f.materials[0]!.look.toon!, { bands: 20 }); }, f => { Object.assign(f.materials[0]!.look.textures, { normal: 'missing' }); },
    f => { Object.assign(f.materials[0]!.look, { shader: 'missing' }); },
  ];
  for (const mutate of mutations) for (const warmed of [false, true]) {
    const errors = [false, true].map(mode => {
      const f = fixture(mode);if (warmed) f.apply();mutate(f.frame);
      let message = '';try { f.apply(); } catch (error) { message = String(error); }
      expect(message).not.toBe('');expect(() => f.apply()).toThrow();return message;
    });
    expect(errors[1]).toBe(errors[0]);
  }
});

test('endpoint producer rechecks destroyed resources and changed live skinning flags', () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.scene.destroyInstance(f.instance); },
    f => { f.scene.transforms.destroy(f.transform); },
    f => { f.scene.destroyMesh(f.meshes.get('b')!);f.frame.entities[0]!.variantId = 'other'; },
    f => { f.scene.destroyMaterial(f.handles.get('b')!.static);f.frame.entities[0]!.renderMaterialId = 'b'; },
    f => { f.scene.destroyTexture(f.texture);Object.assign(f.frame.materials[0]!.look.textures, { normal: 'texture' }); },
    f => { f.scene.materialFlags[f.handles.get('a')!.static] = MATERIAL_FLAG_SKINNED_3D; },
  ];
  for (const mutate of mutations) for (const mode of [false, true]) {
    const f = fixture(mode);f.apply();mutate(f);expect(() => f.apply()).toThrow();
  }
  // This texture was validated in the endpoint cache but never bound to renderer
  // storage; deletion can succeed and must still be caught on an unchanged input.
  const f = fixture(true);Object.assign(f.frame.materials[0]!.look.textures, { normal: 'texture' });f.apply();
  f.scene.destroyTexture(f.texture);expect(() => f.apply()).toThrow();
});

test('endpoint producer and full fallbacks keep independent caches through mutable and detached input changes', () => {
  const f = fixture(true);f.apply();
  const fallback = structuredClone(f.frame);fallback.entities[0]!.position[0] = 20;Object.assign(fallback.materials[0]!.look.baseColor, { 0: .12 });
  fallback.performances = [{ entityId: 'unbound', rigId: 'unbound-rig', clipId: 'unbound-clip', timeSeconds: 0, sourceStartSeconds: 0, loop: false }];
  f.apply(fallback);expect(f.owner!.work).toMatchObject({ fullFallbacks: 1, performanceFallbacks: 1, staticApplications: 0 });
  expect(f.scene.transforms.positions[0]).toBe(20);expect(f.scene.materialData[0]).toBe(Math.fround(.12));
  f.apply();expect(f.owner!.work).toMatchObject({ staticApplications: 1, fullFallbacks: 0, materialNumericValidations: 0 });
  expect(f.scene.transforms.positions[0]).toBe(20);expect(f.scene.materialData[0]).toBe(Math.fround(.12));
  const again = structuredClone(f.frame);again.performances = fallback.performances;f.apply(again);
  expect(f.scene.transforms.positions[0]).toBe(1);expect(f.scene.materialData[0]).toBe(Math.fround(again.materials[0]!.look.baseColor[0]));
  const skeletal = fixture(true, 1);skeletal.apply();expect(skeletal.owner!.work).toMatchObject({ fullFallbacks: 1, skeletonFallbacks: 1, staticApplications: 0 });
});

test('opt-in endpoint revisions preserve exact material changes, live checks and detached input ownership', () => {
  const f = fixture(true, 0, 'world-a:endpoint');f.apply();
  const first = f.owner!.readMaterialInputRevisions();expect(first.source).toBe('endpoint');
  if (first.source !== 'endpoint') throw Error('Missing endpoint revision window');
  const original = first.values.slice();expect(first.namespace).toBe('world-a:endpoint');
  expect(f.owner!.readMaterialInputRevisionWork()).toMatchObject({ available: 1, entries: 2, backingBytes: 16, allocations: 1, writes: 2, changes: 2 });
  const detached = structuredClone(f.frame);Object.assign(detached.materials[1]!.look.uv, { rotation: -0 });f.apply(detached);
  const changed = f.owner!.readMaterialInputRevisions();if (changed.source !== 'endpoint') throw Error('Missing endpoint revision window');
  expect(changed.values).toBe(first.values);expect(changed.values[0]).toBe(original[0]);expect(changed.values[1]).not.toBe(original[1]);
  const retained = changed.values.slice();Object.assign(detached.materials[1]!.look.uv, { rotation: .5 });
  // Mutating a caller's previous input cannot mutate detached caches or outputs.
  expect(changed.values).toEqual(retained);f.apply(detached);
  expect(f.owner!.readMaterialInputRevisionWork()).toMatchObject({ allocations: 1, writes: 2, changes: 1 });
  f.apply(detached);expect(f.owner!.work).toMatchObject({ materialInputComparisons: 2, materialResourceValidations: 2, materialNumericValidations: 0 });
  expect(f.owner!.readMaterialInputRevisionWork()).toMatchObject({ writes: 2, changes: 0 });
  f.scene.materialData[0] = 999;const stable = changed.values.slice();f.apply(detached);
  expect(changed.values).toEqual(stable);expect(f.owner!.work.materialResourceValidations).toBe(2);
  // The producer deliberately does not maintain renderer storage. This revision
  // certifies inputs only; the independent receiver still validates/repairs it.
  expect(f.scene.materialData[0]).toBe(999);
  f.scene.materialFlags[f.handles.get('a')!.static] |= MATERIAL_FLAG_SKINNED_3D;
  expect(() => f.apply(detached)).toThrow();expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  expect(f.owner!.readMaterialInputRevisionWork()!.available).toBe(0);
});

test('endpoint revision publication requires full successful application and explicitly selects fallback issuer', () => {
  const f = fixture(true, 0, 'world-b:endpoint');expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  expect(f.owner!.tryApply(f.frame)).toBe(true);expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  f.owner!.finish(f.frame);expect(f.owner!.readMaterialInputRevisions().source).toBe('endpoint');
  const badEntity = structuredClone(f.frame);badEntity.entities[0]!.position[0] = NaN;
  expect(() => f.apply(badEntity)).toThrow();expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  expect(f.owner!.readMaterialInputRevisionWork()).toMatchObject({ available: 0, writes: 0, changes: 0 });
  f.apply();
  const badMaterial = structuredClone(f.frame);Object.assign(badMaterial.materials[0]!.look.baseColor, { 0: .2 });Object.assign(badMaterial.materials[1]!.look, { roughness: NaN });
  expect(() => f.apply(badMaterial)).toThrow();expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  expect(f.owner!.readMaterialInputRevisionWork()).toMatchObject({ available: 0, writes: 1, changes: 1 });
  Object.assign(badMaterial.materials[1]!.look, { roughness: .4 });f.apply(badMaterial);
  expect(f.owner!.readMaterialInputRevisions().source).toBe('endpoint');
  const fallback = structuredClone(f.frame);fallback.performances = [{ entityId: 'unbound', rigId: 'unbound-rig', clipId: 'unbound-clip', timeSeconds: 0, sourceStartSeconds: 0, loop: false }];
  Object.assign(fallback.materials[1]!.look, { roughness: NaN });
  expect(() => f.apply(fallback)).toThrow();expect(() => f.owner!.readMaterialInputRevisions()).toThrow('unavailable');
  Object.assign(fallback.materials[1]!.look, { roughness: .3 });f.apply(fallback);
  expect(f.owner!.readMaterialInputRevisions()).toEqual({ source: 'full-fallback' });
  expect(f.owner!.readMaterialInputRevisionWork()!.available).toBe(0);
  f.apply();const resumed = f.owner!.readMaterialInputRevisions();
  expect(resumed.source).toBe('endpoint');if (resumed.source !== 'endpoint') throw Error('Missing endpoint revision window');
  expect(resumed.namespace).toBe('world-b:endpoint');expect(resumed.values.every(value => value > 0)).toBe(true);
  const reset = fixture(true, 0, 'world-c:endpoint');reset.apply();const restored = reset.owner!.readMaterialInputRevisions();
  expect(restored.source).toBe('endpoint');if (restored.source !== 'endpoint') throw Error('Missing endpoint revision window');
  expect(restored.namespace).not.toBe(resumed.namespace);
  const skeleton = fixture(true, 1, 'skeleton:endpoint');skeleton.apply();
  expect(skeleton.owner!.readMaterialInputRevisions()).toEqual({ source: 'full-fallback' });expect(skeleton.owner!.readMaterialInputRevisionWork()).toBeUndefined();
  const baseline = fixture(true);baseline.apply();expect(baseline.owner!.readMaterialInputRevisions()).toEqual({ source: 'disabled' });
  expect(baseline.owner!.readMaterialInputRevisionWork()).toBeUndefined();
});
