import { expect, test } from 'bun:test';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatKnockout3D } from './index.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';

test('physical corpse articulates, receives followup momentum, restores deterministically and cleans up', async () => {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }], bufferViews: [{ buffer: 0, byteLength: positions.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const project = { extensions: { hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
    meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [], materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
    scenes: [{ id: 'arena', camera: { position: [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [], entities: [
      { id: 'a', meshId: 'mesh', materialId: 'material', position: [0, 1, 0], scale: [1, 1, 1], rotationY: 0, physics: { type: 'dynamic', shape: 'sphere', gravityScale: 1, continuous: true } },
      { id: 'floor', meshId: 'mesh', materialId: 'material', position: [0, -1, 0], scale: [100, 1, 100], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] }], audio: { policy: 'disabled', cues: [] }, save: { restoreOnBoot: false, slot: 'test', maxBytes: 65536 } } } };
  const runtime = await createHyperfocus3DRuntime(project, [{ id: 'gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(JSON.stringify(gltf)) }, { id: 'bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(positions.buffer) }]);
  const knockout = createCombatKnockout3D({ runtime, fighterIds: ['a'] });
  const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();state.fighters[0]!.health = 0;
  const initialMask = runtime.physics.body('a')!.collisionMask;
  knockout.step(state, []);
  expect(knockout.capture()[0]!.bodies).toHaveLength(10);
  const initial = knockout.capture();
  for (let frame = 0; frame < 90; frame++) knockout.step(state, []);
  const settled = knockout.capture()[0]!;
  expect(settled.bodies[0]!.pose[1]).toBeLessThan(.6);
  expect(settled.bodies.every(body => body.pose[1]! > -.1)).toBe(true);
  expect(settled.bodies[1]!.pose.slice(0, 3)).not.toEqual(initial[0]!.bodies[1]!.pose.slice(0, 3));
  const saved = knockout.capture();
  knockout.step(state, [{ id: 'hit', frame: 1, attackerId: 'b', targetId: 'a', moveId: 'launcher', kind: 'hit', damage: 0, impulse: { x: 4, y: 8, z: 0 } }]);
  expect(knockout.capture()[0]!.bodies[0]!.pose[8]).toBeGreaterThan(1);
  for (let frame = 0; frame < 30; frame++) knockout.step(state, []);
  knockout.restore(knockout.validate(saved));
  for (let frame = 0; frame < 20; frame++) knockout.step(state, []);
  const replay = knockout.capture();knockout.restore(saved);
  for (let frame = 0; frame < 20; frame++) knockout.step(state, []);
  expect(knockout.capture()).toEqual(replay);
  // Ordinary zero-vertical-impulse strikes keep a corpse airborne without unbounded launch speed.
  for (let beat = 0; beat < 4; beat++) {
    knockout.step(state, [{ id: `juggle-${beat}`, frame: beat, attackerId: 'b', targetId: 'a', moveId: 'jab', kind: 'hit', damage: 0, impulse: { x: 2, y: 0, z: 0 } }]);
    expect(knockout.capture()[0]!.bodies[0]!.pose[8]).toBeGreaterThan(4);
    for (let frame = 0; frame < 12; frame++) knockout.step(state, []);
    expect(knockout.capture()[0]!.bodies[0]!.pose[1]).toBeGreaterThan(.7);
    expect(knockout.capture()[0]!.bodies[0]!.pose[8]).toBeLessThan(14);
  }
  expect(() => knockout.validate([{ id: 'a', bodies: [] }])).toThrow();
  knockout.reset();expect(knockout.capture()).toEqual([]);expect(runtime.physics.body('a')!.collisionMask).toBe(initialMask);
  // Repeated rounds reuse the same bounded physics world without accumulating bodies or constraints.
  for (let round = 0; round < 12; round++) { knockout.step(state, []);expect(knockout.capture()[0]!.bodies).toHaveLength(10);knockout.reset(); }
});
