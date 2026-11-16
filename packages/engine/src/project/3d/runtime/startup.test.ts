import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createRuntimeStartup3D } from './startup.ts';

test('startup owns independent scene, physics and initial pose storage without changing archive bytes', async () => {
  const { project, assets } = await combatMotionFixture();
  const original = assets.map(asset => asset.bytes.slice());
  const first = await createRuntimeStartup3D(project, assets);
  const second = await createRuntimeStartup3D(project, assets);
  expect(first.positions.get('a')).toEqual([0, 1, 0]);
  expect(first.rotations.get('a')).toBe(0);
  expect(first.physics.body('a')).toMatchObject({ x: 0, y: 1, z: 0 });
  expect(first.scene.compile(first.commands).instanceCount).toBe(3);
  expect(first.scene === second.scene).toBe(false);
  expect(first.physics === second.physics).toBe(false);
  expect(first.positions.get('a') === second.positions.get('a')).toBe(false);
  first.positions.get('a')![0] = 99;
  first.physics.setPosition('a', 99, 99, 99);
  first.scene.transforms.setPosition(first.transforms.get('a')!, 99, 99, 99);
  expect(second.positions.get('a')).toEqual([0, 1, 0]);
  expect(second.physics.body('a')).toMatchObject({ x: 0, y: 1, z: 0 });
  expect(second.scene.transforms.positions[0]).toBe(0);
  expect(assets.map(asset => asset.bytes)).toEqual(original);
});

test('preflight preserves structural and cooking diagnostics, and failed cooking cannot poison the next startup', async () => {
  const { project, assets } = await combatMotionFixture();
  const invalid = structuredClone(project);
  invalid.extensions.hyperfocus3D.scenes[0]!.entities[0]!.meshId = 'absent';
  await expect(createRuntimeStartup3D(invalid, assets)).rejects.toThrow(
    'Hyperfocus 3D preflight failed:\n- /extensions/hyperfocus3D/scenes/0/entities/0/meshId: Unknown mesh absent.',
  );
  const badPrimitive = structuredClone(project);
  badPrimitive.extensions.hyperfocus3D.meshes[0]!.primitive = 999;
  await expect(createRuntimeStartup3D(badPrimitive, assets)).rejects.toThrow(
    'Hyperfocus 3D preflight failed:\n- /extensions/hyperfocus3D/meshes/0/primitive: Cooked glTF has 1 primitives; index 999 does not exist.',
  );
  const initialized = await createRuntimeStartup3D(project, assets);
  expect(initialized.diagnostics).toEqual([]);
  expect(initialized.scene.compile(initialized.commands).instanceCount).toBe(3);
});

test('startup keeps active resource closure admission distinct from the full authored declaration', async () => {
  const { project, assets } = await combatMotionFixture();
  project.extensions.hyperfocus3D.meshes.push({ ...project.extensions.hyperfocus3D.meshes[0]!, id: 'optional', assetId: 'missing-optional' });
  const initialized = await createRuntimeStartup3D(project, assets);
  expect(initialized.declaration.meshes.map(mesh => mesh.id)).toEqual(['mesh', 'optional']);
  expect(initialized.scene.meshCount).toBe(1);
  project.extensions.hyperfocus3D.scenes[0]!.entities[0]!.meshId = 'optional';
  await expect(createRuntimeStartup3D(project, assets)).rejects.toThrow('Unknown archive asset missing-optional.');
});

test('authoring admission includes skeleton allocation and initial animation diagnostics after cooking', async () => {
  const fixture = await combatMotionFixture();
  const declaration = structuredClone((await createRuntimeStartup3D(fixture.project, fixture.assets)).declaration);
  declaration.meshes = [{ id: 'skin-mesh', assetId: 'skin', primitive: 0, buffers: [], skin: { rigId: 'rig', meshIndex: 0, primitiveIndex: 0 } }];
  declaration.rigs = [{ id: 'rig', meshId: 'skin-mesh', clips: [] }];
  declaration.scenes[0]!.entities = [{ id: 'actor', meshId: 'skin-mesh', materialId: 'material', position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0,
    skeleton: { rigId: 'rig', skinIndex: 0, meshNode: 3 } }];
  const project = { extensions: { hyperfocus3D: declaration } };
  const assets = [{ id: 'skin', mimeType: 'model/gltf+json', bytes: new Uint8Array(await Bun.file(new URL('../../../../fixtures/gltf-skin-animation/two-joint.gltf', import.meta.url)).arrayBuffer()) }];
  await expect(createRuntimeStartup3D(project, assets)).rejects.toThrow('Rig rig needs at least one declared clip.');
  declaration.rigs[0]!.clips = [{ id: 'wave', animation: 0, durationSeconds: 1 }];
  declaration.scenes[0]!.entities[0]!.skeleton!.skinIndex = 99;
  await expect(createRuntimeStartup3D(project, assets)).rejects.toThrow('Rig rig has no skin 99.');
  declaration.scenes[0]!.entities[0]!.skeleton!.skinIndex = 0;
  const initialized = await createRuntimeStartup3D(project, assets);
  expect(initialized.scene.skeletonCount).toBe(1);
  expect(initialized.scene.compile(initialized.commands).instanceCount).toBe(1);
});
