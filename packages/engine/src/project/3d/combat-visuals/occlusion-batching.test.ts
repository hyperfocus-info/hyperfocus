import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { presentBoundCombatObstructions3D, presentCombatObstructions3D } from './obstructions.ts';
import { clearBoundCombatCameraSurfaces, clearCombatCameraSurfaces } from './camera-clearance.ts';
import { cutawaySceneBindings } from './cutaways/scene-bindings.ts';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCutawayFade } from './cutaways/cutaway-fade.ts';
import type { WeaponState } from '../combat-interaction/weapons/utility.ts';

function fixture() {
  const state = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'fighter', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const ids = ['tod:city:wall:a', 'tod:city:wall:b', 'tod:city:wall:c'];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 3, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['fighter', ...ids].map((id, index) => ({ id, position: index ? [8 + index, 1, 5] : [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: ids.map(id => ({ id: `${id}:occlusion`, look: structuredClone(materialPreset3D('aged-iron').look) })),
    performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const materialIds = new Map(ids.map(id => [id, `${id}:occlusion`]));
  return { frame, state, materialIds };
}

test('one validated binding serves clearance and obstruction without rescanning authored identities', () => {
  const direct = fixture(), bound = structuredClone(direct);
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 20, halfY: .2, halfZ: 20 }, y: 0 });
  for (const options of [direct, bound]) options.frame.camera.position = [0, .1, 10];
  clearCombatCameraSurfaces({ ...direct, world, bodyIds: ['floor'] });presentCombatObstructions3D(direct);
  let reads = 0;
  const original = bound.materialIds.get.bind(bound.materialIds);
  bound.materialIds.get = id => { reads++;return original(id); };
  const bindings = cutawaySceneBindings(bound.frame, bound.materialIds), validatedReads = reads;
  clearBoundCombatCameraSurfaces({ ...bound, world, bodyIds: ['floor'] }, bindings);
  presentBoundCombatObstructions3D(bound, bindings);
  expect(bound.frame).toEqual(direct.frame);
  // This scene has no follower lookups: binding validation is the only authored-map reader.
  expect(reads).toBe(validatedReads);expect(validatedReads).toBeGreaterThan(0);
});

test('cached scenery radii follow scale changes and match a fresh presenter in both directions', () => {
  const options = fixture();options.frame.entities[1]!.position = [0, 1, 5];
  presentCombatObstructions3D(options);
  for (const size of [.01, 10, .1, 2]) {
    const next = fixture();next.frame.entities[1]!.position = [0, 1, 5];next.frame.entities[1]!.scale = [size, size, size];
    const uncached = structuredClone(next);
    presentCombatObstructions3D({ ...next, materialIds: options.materialIds });presentCombatObstructions3D(uncached);
    expect(next.frame).toEqual(uncached.frame);
  }
});

test('cached oriented bounds preserve uncached sightlines as walls move, rotate and resize', () => {
  const materialIds = fixture().materialIds;
  let seed = 0x5eed;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 0x100000000;
  for (let index = 0; index < 256; index++) {
    const options = fixture(), wall = options.frame.entities[1]!;
    wall.position = [random() * 30 - 15, random() * 12 - 4, random() * 24 - 8];
    wall.scale = [.02 + random() * 30, .02 + random() * 10, .02 + random() * 2];
    const axis = [random() - .5, random() - .5, random() - .5], length = Math.hypot(...axis), angle = random() * Math.PI;
    wall.rotation = [axis[0]! / length * Math.sin(angle), axis[1]! / length * Math.sin(angle), axis[2]! / length * Math.sin(angle), Math.cos(angle)];
    // Caller-supplied non-unit quaternions retain the original conservative path.
    if (index % 17 === 0) wall.rotation[3] *= 2;
    if (index % 19 === 0) wall.scale[0] *= -1;
    const uncached = structuredClone(options);
    presentCombatObstructions3D({ ...options, materialIds, fade: index % 2 ? createCutawayFade() : undefined });
    presentCombatObstructions3D({ frame: uncached.frame, state: uncached.state, fade: index % 2 ? createCutawayFade() : undefined });
    expect(options.frame.materials).toEqual(uncached.frame.materials);
    expect(options.frame.entities.map(entity => entity.visible)).toEqual(uncached.frame.entities.map(entity => entity.visible));
    expect(options.state).toEqual(uncached.state);
  }
});

test('nested dressing follows faded support independently of material order', () => {
  const options = fixture();options.frame.entities[1]!.position = [0, 1, 5];
  const railId = 'tod:city:rail', clothId = 'tod:city:cloth';
  const railMaterial = 'tod:city:wall:a:occlusion-follow:rail', clothMaterial = `${railId}:occlusion-follow:cloth`;
  options.frame.entities.push(...[railId, clothId].map(id => ({ ...structuredClone(options.frame.entities[2]!), id })));
  options.frame.materials.unshift({ id: clothMaterial, look: structuredClone(options.frame.materials[0]!.look) });
  options.frame.materials.push({ id: railMaterial, look: structuredClone(options.frame.materials[1]!.look) });
  options.materialIds.set(railId, railMaterial);options.materialIds.set(clothId, clothMaterial);
  presentCombatObstructions3D(options);
  expect(options.frame.materials.find(m => m.id === clothMaterial)!.look.opacity).toBeCloseTo(.035);
  options.frame.entities[1]!.visible = false;presentCombatObstructions3D(options);
  expect(options.frame.materials.find(m => m.id === clothMaterial)!.look.opacity).toBe(0);
});

test('sight volume keeps extended limbs, pickups, close ceilings and vertical or reversed camera views', () => {
  const cameras: [number, number, number][] = [[0, 3, 10], [10, 2, 10], [0, 30, 0], [0, 1, -1], [0, .5, 0]];
  for (const camera of cameras) for (let index = 0; index < 60; index++) {
    const options = fixture(), wall = options.frame.entities[1]!;
    options.frame.camera.position = camera;
    options.frame.entities.push({ id: 'fighter:right-hand', position: [4, 2, 0], scale: [.2, .3, .2], rotation: [0, 0, 0, 1], visible: true });
    wall.position = [index % 6 - 2, index % 5, Math.floor(index / 6) - 3];wall.scale = index % 2 ? [.1, 3, 2] : [4, .3, 3];
    const angle = index * .17;wall.rotation = [0, Math.sin(angle), 0, Math.cos(angle)];
    const weapon: WeaponState = { id: 'stock', owner: '', projectileOwner: '', active: true, durability: 1, length: 1, serial: 0, position: { x: -4, y: .2, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
    const reference = structuredClone(options);
    presentCombatObstructions3D({ ...options, weapons: [weapon], fade: createCutawayFade() });
    // Without authored IDs, the original radius-only path remains the oracle.
    presentCombatObstructions3D({ frame: reference.frame, state: reference.state, weapons: [weapon], fade: createCutawayFade() });
    expect(options.frame.materials).toEqual(reference.frame.materials);
    expect(options.frame.entities.map(entity => entity.visible)).toEqual(reference.frame.entities.map(entity => entity.visible));
    expect(options.state).toEqual(reference.state);
  }
});

test('wide low stock supports remain visible beneath opaque pickups', () => {
  const options = fixture(), counter = options.frame.entities[1]!;
  counter.position = [0, .4, 1];counter.scale = [2.8, .4, .8];
  const weapon: WeaponState = { id: 'stock', owner: '', projectileOwner: '', active: true, durability: 1, length: 1, serial: 0, position: { x: 0, y: .83, z: 1 }, velocity: { x: 0, y: 0, z: 0 } };
  presentCombatObstructions3D({ ...options, weapons: [weapon] });
  expect(options.frame.materials[0]!.look.opacity).toBe(.42);
});

test('equivalent opaque city materials batch only in presentation and keep independently fading owners', () => {
  const options = fixture(), originalIds = [...options.materialIds], state = structuredClone(options.state);
  presentCombatObstructions3D(options);
  expect(options.frame.entities[2]!.renderMaterialId).toBe('tod:city:wall:a:occlusion');
  expect(options.frame.entities[3]!.renderMaterialId).toBe('tod:city:wall:a:occlusion');
  options.frame.entities[1]!.position = [0, 1, 5];presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  expect(options.frame.entities[1]!.renderMaterialId).toBeUndefined();
  expect(options.frame.entities[2]!.renderMaterialId).toBeUndefined();
  expect(options.frame.entities[3]!.renderMaterialId).toBe('tod:city:wall:b:occlusion');
  options.frame.entities[2]!.position = [0, 1, 5];presentCombatObstructions3D(options);
  expect(options.frame.entities[3]!.renderMaterialId).toBeUndefined();
  options.frame.entities[1]!.position[0] = 9;options.frame.entities[2]!.position[0] = 10;presentCombatObstructions3D(options);
  expect(options.frame.entities[2]!.renderMaterialId).toBe('tod:city:wall:a:occlusion');
  expect(options.frame.entities[3]!.renderMaterialId).toBe('tod:city:wall:a:occlusion');
  expect([...options.materialIds]).toEqual(originalIds);expect(options.state).toEqual(state);
  expect(options.frame.materials.map(material => material.id)).toEqual(originalIds.map(([, id]) => id));
});

test('current textures, emissive, UV, toon and color changes never reuse an incompatible opaque handle', () => {
  for (const trait of ['texture', 'emissive', 'uv', 'toon', 'color', 'shader', 'sided', 'roughness'] as const) {
    const options = fixture();presentCombatObstructions3D(options);
    const material = options.frame.materials[1]!, look = material.look;
    switch (trait) {
      case 'texture': material.look = { ...look, textures: { ...look.textures, normal: 'hazard-normal' } };break;
      case 'emissive': material.look = { ...look, emissive: [1, 0, 0] };break;
      case 'uv': material.look = { ...look, uv: { ...look.uv, rotation: .5 } };break;
      case 'toon': material.look = { ...look, toon: { bands: 3, shadowColor: [0, 0, 0], rimColor: [1, 1, 1], rimStrength: .3, outlineColor: [0, 0, 0, 1], outlineWidth: .01 } };break;
      case 'color': material.look = { ...look, baseColor: [1, 0, 0, 1] };break;
      case 'shader': material.look = { ...look, shader: 'unlit' };break;
      case 'sided': material.look = { ...look, doubleSided: !look.doubleSided };break;
      case 'roughness': material.look = { ...look, roughness: .25 };break;
    }
    const before = structuredClone(material.look);presentCombatObstructions3D(options);
    expect(options.frame.entities[2]!.renderMaterialId).toBeUndefined();expect(material.look).toEqual(before);
    expect(options.frame.entities[3]!.renderMaterialId).toBe('tod:city:wall:a:occlusion');
  }
});

test('authored translucency, model variants and non-city opt-ins remain independent', () => {
  const options = fixture();
  options.frame.materials[1]!.look = { ...options.frame.materials[1]!.look, opacity: .8 };
  options.frame.entities[3]!.variantId = 'broken';
  presentCombatObstructions3D(options);
  expect(options.frame.entities[2]!.renderMaterialId).toBeUndefined();expect(options.frame.materials[1]!.look.opacity).toBe(.8);
  expect(options.frame.entities[3]!.renderMaterialId).toBeUndefined();expect(options.frame.entities[3]!.variantId).toBe('broken');
  options.frame.entities[1]!.id = 'ordinary:wall';
  options.materialIds.delete('tod:city:wall:a');options.materialIds.set('ordinary:wall', 'ordinary:wall:occlusion');
  options.frame.materials[0]!.id = 'ordinary:wall:occlusion';presentCombatObstructions3D(options);
  expect(options.frame.entities[1]!.renderMaterialId).toBeUndefined();
});

test('city finishes and neighborhood fixtures cull only outside the conservative view without changing state', () => {
  const options = fixture(), state = structuredClone(options.state), camera = structuredClone(options.frame.camera);
  const pieces: Hyperfocus3DEvaluatedFrame['entities'] = [];
  for (const category of ['finish', 'neighborhood']) for (const [name, x] of [['local', 0], ['shadow-margin', 12], ['distant', 100]] as const) {
    pieces.push({ id: `tod:city:${category}:${name}`, position: [x, 1, 0], rotation: [0, 0, 0, 1], scale: [.1, .1, .1], visible: true });
  }
  const authored = structuredClone(pieces);options.frame.entities.push(...pieces);
  presentCombatObstructions3D({ ...options, viewportAspect: 1.7777777777777777 });
  for (const piece of pieces) expect(piece.visible).toBe(!piece.id.endsWith(':distant'));
  expect(pieces.map(piece => ({ ...piece, visible: true }))).toEqual(authored);
  expect(options.state).toEqual(state);expect(options.frame.camera).toEqual(camera);
});
