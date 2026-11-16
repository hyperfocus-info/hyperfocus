import { expect, test } from 'bun:test';
import { createMat4 } from '../3d-core.ts';
import { createBoundedScene3D, createRenderCommandBuffer3D } from '../3d-scene.ts';
import { createSceneViewCompiler3D } from './view-compiler.ts';

test('destroyed toon materials no longer widen the camera culling volume', () => {
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 2, instances: 1, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, .001, 0, 0, 0, .001, 0]) });
  const toon = scene.createMaterial({ shader: 'toon', toon: { outlineWidth: .1 } });
  const transform = scene.transforms.create(); scene.transforms.setPosition(transform, 1.05, 0, 0);
  scene.createInstance({ mesh, material: scene.createMaterial(), transform });
  const compile = createSceneViewCompiler3D(scene, createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }));
  expect(compile(createMat4()).commands.instanceCount).toBe(1);
  scene.destroyMaterial(toon);
  expect(compile(createMat4()).commands.instanceCount).toBe(0);
});

test('camera culling retains edge outlines while a separate light volume retains off-camera casters', () => {
  const scene = createBoundedScene3D({ transforms: 4, meshes: 1, materials: 1, instances: 4, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, .001, 0, 0, 0, .001, 0]) });
  const material = scene.createMaterial({ shader: 'toon', toon: { outlineWidth: .1 } });
  for (const x of [0, 1.05, 3, 20]) {
    const transform = scene.transforms.create();scene.transforms.setPosition(transform, x, 0, 0);
    scene.createInstance({ mesh, material, transform });
  }
  const compile = createSceneViewCompiler3D(scene, createRenderCommandBuffer3D({ commands: 4, instances: 4, lights: 0 }));
  const light = createMat4();light[0] = .25;
  const first = compile(createMat4(), light);
  expect(Array.from(first.commands.instanceSceneHandles.slice(0, first.commands.instanceCount))).toEqual([0, 1]);
  expect(Array.from(first.shadowCommands!.instanceSceneHandles.slice(0, first.shadowCommands!.instanceCount))).toEqual([0, 1, 2]);
  expect(first.commands.culledInstances).toBe(2);expect(first.shadowCommands!.culledInstances).toBe(1);
  expect(compile(createMat4(), light).shadowCommands).toBe(first.shadowCommands);
  expect(compile(createMat4()).shadowCommands).toBeUndefined();
});

test('plane projection remains conservative for hierarchy shear', () => {
  const scene = createBoundedScene3D({ transforms: 2, meshes: 1, materials: 1, instances: 1, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]), bounds: { x: 0, y: 0, z: 0, radius: 1 } });
  const material = scene.createMaterial(), parent = scene.transforms.create(), transform = scene.transforms.create(parent);
  scene.transforms.setScale(parent, 3, 1, 1);scene.transforms.setPosition(parent, 3.8, 0, 0);
  scene.transforms.setRotationQuaternion(transform, 0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8));
  scene.createInstance({ mesh, material, transform });
  const compile = createSceneViewCompiler3D(scene, createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }));
  expect(compile(createMat4()).commands.instanceCount).toBe(1);
  scene.transforms.setPosition(parent, 4.1, 0, 0);
  expect(compile(createMat4()).commands.instanceCount).toBe(0);
});

test('rest bounds cannot cull deforming meshes', () => {
  const scene = createBoundedScene3D({ transforms: 2, meshes: 2, materials: 2, instances: 2, lights: 0, skeletons: 1, jointsPerSkeleton: 1 });
  const positions = new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]);
  const morph = scene.registerMesh({ positions, morphPositions: [new Float32Array(9).fill(-100)], morphWeights: [1] });
  const skin = scene.registerMesh({ positions, joints: new Uint8Array(12), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) });
  const skeleton = scene.createSkeleton(1), palette = createMat4();palette[12] = -100;scene.setSkeletonMatrices(skeleton, palette);
  for (const mesh of [morph, skin]) {
    const transform = scene.transforms.create();scene.transforms.setPosition(transform, 100, 0, 0);
    scene.createInstance({ mesh, material: scene.createMaterial({ skinning: mesh === skin }), transform, ...(mesh === skin ? { skeleton } : {}) });
  }
  const compile = createSceneViewCompiler3D(scene, createRenderCommandBuffer3D({ commands: 2, instances: 2, lights: 0 }));
  expect(compile(createMat4()).commands.instanceCount).toBe(2);
});
