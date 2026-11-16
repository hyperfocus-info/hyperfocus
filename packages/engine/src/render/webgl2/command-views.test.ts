import { expect, test } from 'bun:test';
import { createMat4, extractFrustumPlanes3D } from '../3d-core.ts';
import { createBoundedScene3D, createRenderCommandBuffer3D, MATERIAL_FLOAT_STRIDE_3D } from '../3d-scene.ts';
import { createCommandViews3D } from './command-views.ts';
import { transformedSphereIntersectsFrustum3D } from '../three/scene-compiler-support.ts';
import { computeMeshBounds } from '../three/scene-validation.ts';

function fixture(xs = [0, 20, -.5]) {
  const scene = createBoundedScene3D({ transforms: xs.length, meshes: 2, materials: 3, instances: xs.length, lights: 1, textures: 1, textureBytes: 16 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, .01, 0, 0, 0, .01, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 0, 1]) });
  const material = scene.createMaterial();
  for (const x of xs) {
    const transform = scene.transforms.create(); scene.transforms.setPosition(transform, x, 0, 0);
    scene.createInstance({ mesh, material, transform });
  }
  scene.createLight({ kind: 'ambient', intensity: .25 });
  const commands = createRenderCommandBuffer3D({ commands: Math.max(3, xs.length), instances: xs.length, lights: 1 });
  scene.compile(commands);
  return { scene, mesh, material, commands, views: createCommandViews3D(scene, commands, xs.length) };
}

test('packet matrices are authoritative, order/appearance/lights survive, and bounded output is reused', () => {
  const { scene, commands, views } = fixture();
  commands.instanceAppearance = Float32Array.from({ length: 24 }, (_, i) => i / 8);
  scene.transforms.setPosition(0, 100, 0, 0); // Packet must remain visible despite newer scene state.
  commands.instanceMatrices[28] = .25; // Packet changed to visible despite offscreen scene transform.
  commands.instanceMatrices[44] = 20;
  const output = views(commands, createMat4()).commands;
  expect(output).not.toBe(commands); expect(output.instanceCount).toBe(2);
  expect([...output.instanceSceneHandles.slice(0, 2)]).toEqual([0, 1]);
  expect([...output.instanceAppearance!.slice(0, 16)]).toEqual([...commands.instanceAppearance.slice(0, 16)]);
  expect([...output.instanceMatrices.slice(0, 32)]).toEqual([...commands.instanceMatrices.slice(0, 32)]);
  expect(output.culledInstances).toBe(1); expect(output.lightCount).toBe(1);
  expect(output.lightData).toEqual(commands.lightData);
  expect(views(commands, createMat4()).commands).toBe(output);
  commands.instanceAppearance = undefined;
  expect(views(commands, createMat4()).commands.instanceAppearance).toBeUndefined();
});

test('camera views preserve command order and optional light views remain independent', () => {
  const { scene, commands, views } = fixture([0, 20, -.5]);
  const other = scene.createMaterial({ baseColor: [.2, .3, .4, .5], alphaMode: 'blend' });
  commands.commandCount = 3;
  for (let i = 0; i < 3; i++) { commands.commandMeshHandles[i] = commands.commandMeshHandles[0]!; commands.commandFirstInstances[i] = i; commands.commandInstanceCounts[i] = 1; }
  commands.commandMaterialHandles[1] = other;
  const light = createMat4(); light[0] = .01;
  const result = views(commands, createMat4(), light);
  expect(result.commands.commandCount).toBe(2);
  expect([...result.commands.commandMaterialHandles.slice(0, 2)]).toEqual([0, 0]);
  expect([...result.commands.instanceSceneHandles.slice(0, 2)]).toEqual([0, 2]);
  expect(result.shadowCommands).toBe(commands); expect(result.shadowCommands!.instanceCount).toBe(3);
  expect(views(commands, createMat4()).shadowCommands).toBeUndefined();
});

test('outlines respond to direct material writes and transformed support retains shear', () => {
  const { scene, material, commands, views } = fixture([1.05, 20]);
  scene.updateMaterial(material, { shader: 'toon', toon: { outlineWidth: .1 } });
  expect(views(commands, createMat4()).commands.instanceCount).toBe(1);
  scene.materialData[material * MATERIAL_FLOAT_STRIDE_3D + 23] = 0;
  expect(views(commands, createMat4()).commands.instanceCount).toBe(0);
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]), bounds: { x: 0, y: 0, z: 0, radius: 1 } });
  commands.commandMeshHandles[0] = mesh;
  commands.instanceMatrices[0] = 3 / Math.SQRT2; commands.instanceMatrices[4] = -3 / Math.SQRT2; commands.instanceMatrices[1] = 1 / Math.SQRT2; commands.instanceMatrices[5] = 1 / Math.SQRT2; commands.instanceMatrices[12] = 3.8;
  expect(views(commands, createMat4()).commands.instanceCount).toBe(1);
  commands.instanceMatrices[12] = 4.1;
  expect(views(commands, createMat4()).commands.instanceCount).toBe(0);
});

test('unsupported camera and packet numeric domains return the original packet', () => {
  const { commands, views } = fixture();
  for (const value of [NaN, Infinity, -Infinity]) {
    const camera = createMat4(); camera[0] = value;
    expect(views(commands, camera).commands).toBe(commands);
  }
  expect(views(commands, new Float32Array(16)).commands).toBe(commands);
  expect(views(commands, Array.from(createMat4())).commands).toBe(commands);
  for (const [axis, value] of [[3, .1], [7, .1], [11, .1], [15, 2], [0, Infinity], [4, NaN]] as const) {
    const previous = commands.instanceMatrices[axis]!; commands.instanceMatrices[axis] = value;
    expect(views(commands, createMat4()).commands).toBe(commands); commands.instanceMatrices[axis] = previous;
  }
});

test('dead and unsupported resources cannot disappear behind offscreen bounds', () => {
  const { scene, commands, views } = fixture([20]);
  const originalMesh = commands.commandMeshHandles[0]!;
  commands.commandMeshHandles[0] = 123;
  expect(views(commands, createMat4()).commands).toBe(commands); commands.commandMeshHandles[0] = originalMesh;
  commands.commandMaterialHandles[0] = 123;
  expect(views(commands, createMat4()).commands).toBe(commands); commands.commandMaterialHandles[0] = 0;
  commands.commandSkeletonHandles[0] = 123;
  expect(views(commands, createMat4()).commands).toBe(commands); commands.commandSkeletonHandles[0] = -1;
  commands.commandFlags[0] = 1;
  expect(views(commands, createMat4()).commands).toBe(commands); commands.commandFlags[0] = 0;
  const texture = scene.registerTexture({ width: 2, height: 2, pixels: new Uint8Array(16) });
  scene.updateMaterial(0, { baseColorTexture: texture });
  const limited = createCommandViews3D(scene, commands, 1, { maxTextureSize: 1 });
  expect(limited(commands, createMat4()).commands).toBe(commands);
  scene.materialTextureHandles[0] = 123;
  expect(views(commands, createMat4()).commands).toBe(commands);
});

test('morph geometry and mismatched mesh skinning keep native validation and drawing', () => {
  const { scene, commands, views } = fixture([20]);
  const positions = new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]);
  const morph = scene.registerMesh({ positions, morphPositions: [new Float32Array(9)], morphWeights: [0] });
  commands.commandMeshHandles[0] = morph;
  expect(views(commands, createMat4()).commands).toBe(commands);
});

test('capacity changes and duplicate ranges fall back without overflowing bounded storage', () => {
  const { scene, commands, views } = fixture();
  commands.commandCount = 2; commands.commandFirstInstances[1] = 0; commands.commandInstanceCounts[1] = 3;
  expect(views(commands, createMat4()).commands).toBe(commands);
  const larger = createRenderCommandBuffer3D({ commands: 4, instances: 3, lights: 1 });
  larger.commandCount = 4;
  expect(views(larger, createMat4()).commands).toBe(larger);
  const next = createCommandViews3D(scene, commands, 3);
  commands.commandCount = 1; commands.commandInstanceCounts[0] = 3;
  const output = next(commands, createMat4()).commands;
  expect(output.instanceCount).toBe(2); expect(output.instanceMatrices.length).toBe(48);
});

test('cached bounds do not narrow large-coordinate centers and lose visible edge geometry', () => {
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, instances: 1, lights: 0 });
  const x = 16777216;
  const positions = new Float32Array([x, -.25, 0, x + 2, -.25, 0, x + 2, .25, 0]);
  const mesh = scene.registerMesh({ positions }), transform = scene.transforms.create();
  scene.transforms.setScale(transform, .5, 1, 1); scene.transforms.setPosition(transform, -8388610, 0, 0);
  scene.createInstance({ mesh, material: scene.createMaterial(), transform });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }); scene.compile(commands);
  const camera = createMat4(); camera[0] = .9;
  const sphere = computeMeshBounds(positions), planes = extractFrustumPlanes3D(new Float32Array(24), camera);
  const narrowed = new Float32Array([sphere.x, sphere.y, sphere.z, sphere.radius]);
  expect(sphere.x).toBe(x + 1); expect(narrowed[0]).toBe(x);
  expect(transformedSphereIntersectsFrustum3D(commands.instanceMatrices, 0, narrowed, 0, planes)).toBe(false);
  // The right two vertices are at world x=-1, inside the camera's -1/0.9 edge.
  expect((positions[3]! * .5 - 8388610) * camera[0]!).toBeGreaterThan(-1);
  const views = createCommandViews3D(scene, commands, 1);
  expect(views(commands, camera).commands.instanceCount).toBe(1);
  expect(views(commands, camera).commands.instanceCount).toBe(1);
});
