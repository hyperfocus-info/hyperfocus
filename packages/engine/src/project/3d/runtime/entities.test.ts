import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { createBoundedScene3D, createRenderCommandBuffer3D, MATERIAL_FLAG_SKINNED_3D } from '../../../render/3d-scene.ts';
import { createRuntimeEntityApplicator3D } from './entities.ts';
import type { EntityApplicationStrategy3D } from './entity-transforms.ts';
import { createEntityInputLease3D, type EntityInputLease3D } from './entity-input-lease.ts';

function fixture(count = 3, strategy: EntityApplicationStrategy3D = 'original') {
  const scene = createBoundedScene3D({ transforms: count, instances: count, meshes: 2, materials: 2, lights: 1 });
  const meshes = new Map(['a', 'b'].map((id, i) => [id, scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1 + i, 0, 0, 0, 1, 0]) })]));
  const materials = new Map(['a', 'b'].map(id => [id, { static: scene.createMaterial() }]));
  const transforms = new Map<string, number>(), instances = new Map<string, number>();
  const declared = Array.from({ length: count }, (_, index) => {
    const id = `entity:${index}`, transform = scene.transforms.create();transforms.set(id, transform);
    instances.set(id, scene.createInstance({ transform, mesh: meshes.get('a')!, material: materials.get('a')!.static }));
    return { id, meshId: 'a', materialId: 'a', variants: [{ id: 'alternate', meshId: 'b', materialId: 'b' }] };
  });
  const frame: Hyperfocus3DEvaluatedFrame['entities'] = declared.map(({ id }) => ({ id, position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1], visible: true }));
  const apply = createRuntimeEntityApplicator3D({ scene, entities: declared, transforms, instances, meshes, materials, transformStrategy: strategy, diagnostics: true });
  const writes = { position: 0, scale: 0, rotation: 0 };
  const { setPosition, setScale, setRotationQuaternion } = scene.transforms;
  scene.transforms.setPosition = (...args) => { writes.position++;setPosition(...args); };
  scene.transforms.setScale = (...args) => { writes.scale++;setScale(...args); };
  scene.transforms.setRotationQuaternion = (...args) => { writes.rotation++;setRotationQuaternion(...args); };
  const compile = () => scene.compile(createRenderCommandBuffer3D({ commands: count, instances: count, lights: 1 }));
  return { scene, frame, apply, writes, transforms, instances, meshes, materials, declared, compile };
}

for (const strategy of ['original', 'retained-input', 'leased-input'] as const) {
test(`${strategy}: city-sized detached frames write only changed transforms, including sub-float and normalized rotations`, () => {
  const f = fixture(3420, strategy);f.apply(f.frame);f.writes.rotation = 0;
  for (let index = 0; index < 8; index++) f.apply(structuredClone(f.frame));
  expect(f.writes).toEqual({ position: 0, scale: 0, rotation: 0 });
  f.frame[200]!.position[0] = 12;f.frame[400]!.scale[2] = .3;f.frame[600]!.rotation = [0, 1, 0, 2];
  f.apply(f.frame);expect(f.writes).toEqual({ position: 1, scale: 1, rotation: 1 });
  f.apply(structuredClone(f.frame));expect(f.writes).toEqual({ position: 1, scale: 1, rotation: 1 });
  f.frame[200]!.position[0] = 12.0000000001;f.apply(f.frame);expect(f.writes.position).toBe(1);
});

test(`${strategy}: bindings survive reordered and partial records, restore and direct scene writes without retaining frames`, () => {
  const f = fixture(3, strategy);f.apply(f.frame);
  const before = f.compile().instanceMatrices.slice();
  f.scene.transforms.positions[0] = 99;f.scene.transforms.scales[1] = 2;f.scene.transforms.rotations[0] = .5;
  const instance = f.instances.get('entity:0')!;
  f.scene.setInstanceMesh(instance, f.meshes.get('b')!);f.scene.setInstanceMaterial(instance, f.materials.get('b')!.static);f.scene.setInstanceVisible(instance, false);
  f.scene.setInstanceBounds(instance, { x: 1000, y: 1000, z: 1000, radius: 0 });
  f.apply([...structuredClone(f.frame)].reverse());expect(f.compile().instanceMatrices).toEqual(before);expect(f.compile().commandCount).toBe(1);
  f.frame[1]!.position[1] = 7;f.apply([f.frame[1]!]);expect(f.scene.transforms.positions[4]).toBe(7);
  f.apply(f.frame);expect(f.scene.transforms.positions[4]).toBe(7);
  const restored = structuredClone(f.frame);restored[1]!.position[1] = 0;f.apply(restored);expect(f.compile().instanceMatrices).toEqual(before);
  f.frame[1]!.position[1] = 42;expect(f.scene.transforms.positions[4]).toBe(0);
});

test(`${strategy}: variant, material alias and authored edits restore the same bindings and keep invalid inputs visible`, () => {
  const f = fixture(3, strategy);f.apply(f.frame);
  f.frame[1]!.variantId = 'alternate';f.apply(f.frame);expect(f.compile().commandCount).toBe(2);
  f.frame[1]!.renderMaterialId = 'a';f.apply(f.frame);expect(f.compile().commandMaterialHandles[1]).toBe(f.materials.get('a')!.static);
  delete f.frame[1]!.variantId;delete f.frame[1]!.renderMaterialId;f.apply(f.frame);expect(f.compile().commandCount).toBe(1);
  f.declared[1]!.materialId = 'b';f.apply(f.frame);expect(f.compile().commandCount).toBe(2);
  f.frame[1]!.variantId = 'missing';expect(() => f.apply(f.frame)).toThrow('canonical model variant');delete f.frame[1]!.variantId;
  for (const invalid of [NaN, Infinity]) { f.frame[1]!.position[0] = invalid;expect(() => f.apply(f.frame)).toThrow(); }f.frame[1]!.position[0] = 0;
  f.frame[1]!.rotation = [0, 0, 0, 0];expect(() => f.apply(f.frame)).toThrow('non-zero');f.frame[1]!.rotation = [0, 0, 0, 1];
  f.scene.materialFlags[f.materials.get('a')!.static] |= MATERIAL_FLAG_SKINNED_3D;expect(() => f.apply(f.frame)).toThrow('skinning');
});

test(`${strategy}: released transforms and instances cannot be hidden by unchanged records`, () => {
  const f = fixture(3, strategy);f.apply(f.frame);f.scene.transforms.destroy(f.transforms.get('entity:0')!);expect(() => f.apply(f.frame)).toThrow();
  const g = fixture(3, strategy);g.apply(g.frame);g.scene.destroyInstance(g.instances.get('entity:0')!);expect(() => g.apply(g.frame)).toThrow();
});
}

test('retained input owns bounded revisions, counts the remaining scans, and repairs live bits without changing input revision', () => {
  const f = fixture(3420, 'retained-input');f.apply(f.frame);
  expect(f.apply.readWork().entityInputRevisionChanges).toBe(3420);
  f.apply(structuredClone(f.frame));
  expect(f.apply.readWork()).toEqual({ entityTransformComparisons: 0, entityInputRevisionScans: 3420, entityInputRevisionChanges: 0,
    entityTransformReuses: 3420, entityTransformLiveChecks: 3420, entityTransformRepairs: 0, entityTransformWrites: 0,
    entityTransformCacheBytes: 437760, entityTransformCacheEntries: 3420 });
  f.scene.transforms.positions[0] = -0;f.scene.transforms.scales[4] = NaN;f.scene.transforms.rotations[8] = .5;
  f.apply(f.frame);expect(f.apply.readWork().entityTransformRepairs).toBe(3);expect(f.apply.readWork().entityInputRevisionChanges).toBe(0);
  expect(Object.is(f.scene.transforms.positions[0], 0)).toBe(true);expect(f.scene.transforms.scales[4]).toBe(1);expect(f.scene.transforms.rotations[8]).toBe(0);
  f.frame[0]!.position[0] = 0.000000000000001;f.apply(f.frame);
  expect(f.apply.readWork().entityInputRevisionChanges).toBe(1);expect(f.apply.readWork().entityTransformComparisons).toBe(1);
  f.frame[1]!.rotation = [0, 0, 0, 0];expect(() => f.apply(f.frame)).toThrow();expect(() => f.apply(f.frame)).toThrow();
  f.frame[1]!.rotation = [0, 1, 0, 2];f.apply(f.frame);f.apply(structuredClone(f.frame));expect(f.apply.readWork().entityTransformReuses).toBe(3420);
  expect(f.apply.readWork().entityTransformCacheEntries).toBe(3420);
});

test('explicit history reset covers omitted/reordered bindings, releases leases and keeps live resource failures', () => {
  for (const strategy of ['original', 'retained-input', 'leased-input'] as const) {
    const f = fixture(3, strategy), lease = strategy === 'leased-input' ? createEntityInputLease3D(f.frame) : undefined;
    f.apply(f.frame, lease);f.apply(f.frame, lease);
    const packed = [f.scene.transforms.positions.slice(), f.scene.transforms.rotations.slice(), f.scene.transforms.scales.slice()];
    f.apply([f.frame[1]!, f.frame[1]!]);
    f.apply.resetTransformHistory();
    expect([f.scene.transforms.positions, f.scene.transforms.rotations, f.scene.transforms.scales]).toEqual(packed);
    expect(f.apply.readWork()).toMatchObject({ entityTransformWrites: 0, entityTransformCacheEntries: 0, entityTransformReuses: 0 });
    f.writes.position = f.writes.scale = f.writes.rotation = 0;
    f.apply(f.frame, lease);expect(f.writes).toEqual({ position: 0, scale: 0, rotation: 3 });
    expect(f.apply.readWork().entityTransformReuses).toBe(0);
    f.apply(f.frame, lease);expect(f.writes.rotation).toBe(3);
    if (lease) { f.apply.resetTransformHistory();lease.revoke();expect(() => f.apply(f.frame, lease)).toThrow('revoked'); }
    f.scene.destroyInstance(f.instances.get('entity:0')!);f.apply.resetTransformHistory();expect(() => f.apply(f.frame)).toThrow();
  }
});

test('retained transforms do not hide released meshes/materials, changed variants, missing entities or unsupported strategies', () => {
  const f = fixture(3, 'retained-input');f.apply(f.frame);
  for (const instance of f.instances.values()) f.scene.setInstanceMaterial(instance, f.materials.get('b')!.static!);
  f.scene.destroyMaterial(f.materials.get('a')!.static!);expect(() => f.apply(f.frame)).toThrow();
  const g = fixture(3, 'retained-input');g.apply(g.frame);
  for (const instance of g.instances.values()) g.scene.setInstanceMesh(instance, g.meshes.get('b')!);
  g.scene.destroyMesh(g.meshes.get('a')!);expect(() => g.apply(g.frame)).toThrow();
  const h = fixture(3, 'retained-input');h.apply(h.frame);h.frame[0]!.id = 'missing';expect(() => h.apply(h.frame)).toThrow('not available');
  const invalidStrategy = { strategy: 'original' as const };Object.assign(invalidStrategy, { strategy: 'missing' });
  expect(() => fixture(3, invalidStrategy.strategy)).toThrow('Unsupported entity application strategy');
});

test('leased endpoints remove input scans but still repair externally changed live transforms', () => {
  const f = fixture(3420, 'leased-input'), lease = createEntityInputLease3D(f.frame);
  f.apply(f.frame, lease);expect(f.apply.readWork().entityTransformComparisons).toBe(3420);
  f.apply(f.frame, lease);
  expect(f.apply.readWork()).toEqual({ entityTransformComparisons: 0, entityInputRevisionScans: 0, entityInputRevisionChanges: 0,
    entityTransformReuses: 3420, entityTransformLiveChecks: 3420, entityTransformRepairs: 0, entityTransformWrites: 0,
    entityTransformCacheBytes: 164160, entityTransformCacheEntries: 3420 });
  f.scene.transforms.positions[0] = -0;f.scene.transforms.scales[4] = NaN;f.scene.transforms.rotations[8] = .5;
  f.apply(f.frame, lease);expect(f.apply.readWork().entityTransformRepairs).toBe(3);expect(f.apply.readWork().entityTransformComparisons).toBe(3);
  expect(Object.is(f.scene.transforms.positions[0], 0)).toBe(true);expect(f.scene.transforms.scales[4]).toBe(1);expect(f.scene.transforms.rotations[8]).toBe(0);
  lease.revoke();expect(() => f.apply(f.frame, lease)).toThrow('revoked');
});

test('leases attest one immutable array and expire explicitly before replacement, rewind or interpolation', () => {
  const f = fixture(3, 'leased-input'), endpoint = structuredClone(f.frame), lease = createEntityInputLease3D(endpoint);
  f.apply(endpoint, lease);f.apply(endpoint, lease);expect(f.apply.readWork().entityTransformReuses).toBe(3);
  expect(() => f.apply(structuredClone(endpoint), lease)).toThrow('different entity array');
  const invalidLease = { lease };Object.assign(invalidLease, { lease: {} });
  expect(() => f.apply(endpoint, invalidLease.lease)).toThrow('not issued');
  f.frame[0]!.position[0] = 42;f.apply(f.frame);expect(f.scene.transforms.positions[0]).toBe(42);
  f.apply(endpoint, lease);expect(f.apply.readWork().entityTransformComparisons).toBe(3);expect(f.scene.transforms.positions[0]).toBe(0);
  lease.revoke();endpoint[0]!.position[0] = 12;
  const replacement = createEntityInputLease3D(endpoint);f.apply(endpoint, replacement);expect(f.scene.transforms.positions[0]).toBe(12);
  const original = fixture();expect(() => original.apply(original.frame, createEntityInputLease3D(original.frame))).toThrow('require the leased-input strategy');
});

test('leased inputs keep resource liveness, variants and duplicate-ID ordered writes authoritative', () => {
  for (const resource of ['instance', 'transform', 'mesh', 'material'] as const) {
    const f = fixture(3, 'leased-input'), lease = createEntityInputLease3D(f.frame);f.apply(f.frame, lease);f.apply(f.frame, lease);
    if (resource === 'instance') f.scene.destroyInstance(f.instances.get('entity:0')!);
    if (resource === 'transform') f.scene.transforms.destroy(f.transforms.get('entity:0')!);
    if (resource === 'mesh') { for (const instance of f.instances.values()) f.scene.setInstanceMesh(instance, f.meshes.get('b')!);f.scene.destroyMesh(f.meshes.get('a')!); }
    if (resource === 'material') { for (const instance of f.instances.values()) f.scene.setInstanceMaterial(instance, f.materials.get('b')!.static);f.scene.destroyMaterial(f.materials.get('a')!.static); }
    expect(() => f.apply(f.frame, lease)).toThrow();lease.revoke();
  }
  const f = fixture(3, 'leased-input'), duplicate: typeof f.frame = [...f.frame, { ...f.frame[0]!, position: [8, 0, 0] }], lease = createEntityInputLease3D(duplicate);
  f.apply(duplicate, lease);expect(f.scene.transforms.positions[0]).toBe(8);
  f.apply(duplicate, lease);expect(f.scene.transforms.positions[0]).toBe(8);
  f.declared[0]!.materialId = 'b';f.apply(duplicate, lease);expect(f.compile().commandCount).toBe(2);
});

test('lease churn keeps fixed transform storage and revoked leases cannot authorize recycled decoder slots', () => {
  const f = fixture(3, 'leased-input'), retired: EntityInputLease3D[] = [];
  for (let index = 0; index < 200; index++) {
    f.frame[0]!.position[0] = index;
    const lease = createEntityInputLease3D(f.frame);f.apply(f.frame, lease);f.apply(f.frame, lease);
    expect(f.apply.readWork().entityTransformReuses).toBe(3);
    expect(f.apply.readWork().entityTransformCacheBytes).toBe(144);
    expect(f.apply.readWork().entityTransformCacheEntries).toBe(3);
    lease.revoke();retired.push(lease);
  }
  for (const lease of retired) expect(() => f.apply(f.frame, lease)).toThrow('revoked');
});
