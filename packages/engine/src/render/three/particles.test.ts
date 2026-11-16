import { expect, test } from 'bun:test';
import { createParticleSystem3D } from '../../effects/particles3d/emitter.ts';
import { particleFixture } from '../../effects/particles3d/emitter.test.ts';
import { createMat4 } from '../3d-core.ts';
import { createBoundedScene3D, createRenderCommandBuffer3D, MATERIAL_FLAG_ADDITIVE_3D } from '../3d-scene.ts';
import { sortTransparentInstances3D } from '../webgl2/transparency.ts';
import { createParticleSceneBinding3D, particleFacingQuaternion, particleQuad3D } from './particle-scene.ts';

test('transparent instances sort globally across materials while tint and atlas stay attached', () => {
  const scene = createBoundedScene3D({ transforms: 4, instances: 4, meshes: 1, materials: 3, lights: 0 }), mesh = scene.registerMesh(particleQuad3D());
  const a = scene.createMaterial({ alphaMode: 'blend' }), b = scene.createMaterial({ alphaMode: 'blend' }), opaque = scene.createMaterial({});
  for (const [index, z] of [.1, .9, .5, -.5].entries()) { const transform = scene.transforms.create();scene.transforms.setPosition(transform, 0, 0, z);scene.createInstance({ transform, mesh, material: index === 3 ? opaque : index === 2 ? b : a, appearance: { color: [index / 4, 1, 1, 1], uvRect: [index / 4, 0, .25, 1] } }); }
  const commands = createRenderCommandBuffer3D({ commands: 4, instances: 4, lights: 0 });scene.compile(commands);
  const original = Array.from(commands.instanceMatrices), sorted = sortTransparentInstances3D(scene, commands, createMat4());
  expect(Array.from(sorted.instanceSceneHandles.subarray(0, 4))).toEqual([3, 1, 2, 0]);expect(sorted.commandCount).toBe(4);
  expect([sorted.instanceAppearance![0], sorted.instanceAppearance![8], sorted.instanceAppearance![16], sorted.instanceAppearance![24]]).toEqual([.75, .25, .5, 0]);
  expect(Array.from(commands.instanceMatrices)).toEqual(original);expect(sortTransparentInstances3D(scene, commands, createMat4())).toBe(sorted);
});
test('particle scene bindings preserve budgets, render without advancing and reclaim all owned slots', () => {
  const recipe = particleFixture();recipe.capacity = 8;
  const system = createParticleSystem3D(recipe), scene = createBoundedScene3D({ transforms: 8, instances: 8, meshes: 1, materials: 1, lights: 0 }), mesh = scene.registerMesh(particleQuad3D()), material = scene.createMaterial({ alphaMode: 'additive' });
  expect(scene.materialFlags[material]! & MATERIAL_FLAG_ADDITIVE_3D).toBe(MATERIAL_FLAG_ADDITIVE_3D);
  const binding = createParticleSceneBinding3D({ scene, system, mesh, material, facing: 'velocity' });system.emit(8);system.step(.1);const saved = system.snapshot();
  binding.present([0, 2, 8]);const commands = createRenderCommandBuffer3D({ commands: 8, instances: 8, lights: 0 });scene.compile(commands);
  expect(commands.instanceCount).toBe(8);expect(commands.instanceAppearance).toBeDefined();expect(Array.from(commands.instanceMatrices).every(Number.isFinite)).toBe(true);
  binding.present([0, 2, 8], 0);scene.compile(commands);expect(commands.instanceCount).toBe(0);expect(system.snapshot()).toEqual(saved);
  binding.dispose();expect(() => binding.present([0, 2, 8])).toThrow('disposed');
  const replacement = createParticleSceneBinding3D({ scene, system, mesh, material, facing: 'camera' });replacement.dispose();
  for (const position of [[0, 0, 0], [0, 1, 0]]) { const q = particleFacingQuaternion(position, [0, 1, 0], [0, 1, 0], 0);expect(q.every(Number.isFinite)).toBe(true);expect(Math.hypot(...q)).toBeCloseTo(1, 6); }
});
test('instance appearance validation is atomic and reused slots reset tint', () => {
  const scene = createBoundedScene3D({ transforms: 1, instances: 1, meshes: 1, materials: 1, lights: 0 }), mesh = scene.registerMesh(particleQuad3D()), material = scene.createMaterial({}), transform = scene.transforms.create();
  let instance = scene.createInstance({ mesh, material, transform, appearance: { color: [.2, .3, .4, .5] } });
  expect(() => scene.setInstanceAppearance(instance, { uvRect: [.8, 0, .5, 1] })).toThrow();scene.destroyInstance(instance);instance = scene.createInstance({ mesh, material, transform });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 });scene.compile(commands);expect(Array.from(commands.instanceAppearance!.subarray(0, 8))).toEqual([1, 1, 1, 1, 0, 0, 1, 1]);
});
