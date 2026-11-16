import { expect, test } from 'bun:test';
import { cookRuntimeAssets3D } from '../runtime-assets.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('duplicate declarations reuse immutable cooked geometry while preserving per-mesh budgets', async () => {
  const { runtime, assets } = await combatMotionFixture();
  const declaration = structuredClone(runtime.declaration), original = declaration.meshes[0]!;
  declaration.meshes.push({ ...original, id: 'duplicate' });
  const cooked = await cookRuntimeAssets3D({ declaration, assets, diagnostics: [] });
  expect(cooked.work).toEqual({ containerParses: 1, meshCooks: 1, rigCooks: 0 });
  expect(cooked.cookedById.get(original.id)).toBe(cooked.cookedById.get('duplicate'));
  await expect(cookRuntimeAssets3D({ declaration: { ...declaration, budgets: { ...declaration.budgets, vertices: 5 } }, assets, diagnostics: [] })).rejects.toThrow('Cooked vertex count 6 exceeds budget 5');
});

test('dependency mappings and skin admission cannot reuse a different cook result', async () => {
  const { runtime, assets } = await combatMotionFixture();
  const declaration = structuredClone(runtime.declaration), original = declaration.meshes[0]!;
  const alternate = new Uint8Array(new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]).buffer);
  declaration.meshes.push({ ...original, id: 'alternate', buffers: [{ uri: 'mesh.bin', assetId: 'alternate-bin' }] });
  declaration.meshes.push({ ...original, id: 'skin-admission', skin: { rigId: 'r', meshIndex: 0, primitiveIndex: 0 } });
  const cooked = await cookRuntimeAssets3D({ declaration, assets: [...assets, { id: 'alternate-bin', mimeType: 'application/octet-stream', bytes: alternate }], diagnostics: [] });
  expect(cooked.work).toEqual({ containerParses: 1, meshCooks: 3, rigCooks: 0 });
  expect(cooked.cookedById.get(original.id)!.positions).not.toEqual(cooked.cookedById.get('alternate')!.positions);
  expect(cooked.cookedById.get(original.id)).not.toBe(cooked.cookedById.get('skin-admission'));
  const repeated = await cookRuntimeAssets3D({ declaration: runtime.declaration, assets, diagnostics: [] });
  expect(repeated.cookedById.get(original.id)).not.toBe(cooked.cookedById.get(original.id));
});

test('cached failures retain each declaration diagnostic pointer', async () => {
  const { runtime, assets } = await combatMotionFixture();
  const declaration = structuredClone(runtime.declaration), original = declaration.meshes[0]!;
  declaration.meshes.push({ ...original, id: 'duplicate', primitive: 999 });
  declaration.meshes[0]!.primitive = 998;
  const diagnostics: Parameters<typeof cookRuntimeAssets3D>[0]['diagnostics'] = [];
  await expect(cookRuntimeAssets3D({ declaration, assets, diagnostics })).rejects.toThrow('does not exist');
  expect(diagnostics.map(item => item.pointer)).toEqual(['/extensions/hyperfocus3D/meshes/0/primitive', '/extensions/hyperfocus3D/meshes/1/primitive']);
});

test('shared rig cooking keeps independent declaration validation', async () => {
  const { runtime } = await combatMotionFixture();
  const bytes = new Uint8Array(await Bun.file(new URL('../../../../fixtures/gltf-skin-animation/two-joint.gltf', import.meta.url)).arrayBuffer());
  const meshes = ['first', 'second'].map(id => ({ id, assetId: 'skin', primitive: 0, buffers: [], skin: { rigId: `${id}-rig`, meshIndex: 0, primitiveIndex: 0 } }));
  const rigs = meshes.map(mesh => ({ id: mesh.skin.rigId, meshId: mesh.id, clips: [{ id: 'wave', animation: 0, durationSeconds: 1 }] }));
  const declaration = { ...runtime.declaration, meshes, rigs }, assets = [{ id: 'skin', mimeType: 'model/gltf+json', bytes }];
  const result = await cookRuntimeAssets3D({ declaration, assets, diagnostics: [] });
  expect(result.work).toEqual({ containerParses: 1, meshCooks: 1, rigCooks: 1 });
  expect(result.rigById.get('first-rig')).toBe(result.rigById.get('second-rig'));
  rigs[1]!.clips[0]!.durationSeconds = 2;
  const diagnostics: Parameters<typeof cookRuntimeAssets3D>[0]['diagnostics'] = [];
  await expect(cookRuntimeAssets3D({ declaration, assets, diagnostics })).rejects.toThrow('does not match cooked duration');
  expect(diagnostics).toHaveLength(1);expect(diagnostics[0]!.pointer).toBe('/extensions/hyperfocus3D/rigs/1/clips/0/durationSeconds');
});
