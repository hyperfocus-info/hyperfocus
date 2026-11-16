import { expect, test } from 'bun:test';
import { createBoundedScene3D, MATERIAL_FLAG_CUTAWAY_3D, MATERIAL_FLOAT_STRIDE_3D, MATERIAL_FLAG_ALPHA_BLEND_3D, MATERIAL_FLAG_ADDITIVE_3D, MATERIAL_FLAG_SKINNED_3D, type Material3D } from '../../../render/3d-scene.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { createRuntimeMaterialApplicator3D } from './materials.ts';
import { retainImmutableMaterialLook3D } from "../../../frame/immutable-material-3d.ts";

test('certified immutable identity reuse still repairs live storage and rejects dead textures', () => {
  const f=fixture();Object.assign(f.frame[0]!.look.textures,{baseColor:'a'});
  f.frame[0]!.look=retainImmutableMaterialLook3D(f.frame[0]!.look);
  f.apply();f.apply();expect(f.updates()).toBe(2);
  expect(()=>Object.assign(f.frame[0]!.look.baseColor,{0:.5})).toThrow();
  f.scene.materialData[4]=42;f.apply();expect(f.updates()).toBe(4);
  f.scene.materialTextureHandles.fill(-1);f.scene.destroyTexture(f.textures.get('a')!);expect(f.apply).toThrow();
});

function fixture(alphaMode: Material3D['alphaMode'] = 'opaque') {
  const scene = createBoundedScene3D({ transforms: 1, instances: 1, materials: 4, meshes: 1, lights: 1, textures: 2, textureBytes: 32 });
  const a = scene.createMaterial(), b = scene.createMaterial({ skinning: true });
  const textures = new Map(['a', 'b'].map(id => [id, scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([255, 255, 255, 255]) })]));
  const declared = { id: 'surface', alphaMode }, look = structuredClone(materialPreset3D('toon-hero').look);
  const apply = createRuntimeMaterialApplicator3D({ scene, materials: [declared], handles: new Map([['surface', { static: a, skinned: b }]]), textures });
  let updates = 0;const update = scene.updateMaterial;
  scene.updateMaterial = (handle, value) => { updates++;update(handle, value); };
  const frame = [{ id: 'surface', look }];
  return { scene, a, b, declared, frame, apply: () => apply(frame), resetHistory: apply.resetHistory, updates: () => updates, textures };
}

test('material history reset gives the same cold and warm work without changing live resources', () => {
  const f = fixture();Object.assign(f.frame[0]!.look.textures, { baseColor: 'a' });
  const states: number[][] = [];
  for (let pass = 0; pass < 3; pass++) {
    f.apply();f.apply();
    const data = f.scene.materialData.slice(), flags = f.scene.materialFlags.slice(), textures = f.scene.materialTextureHandles.slice();
    const resource = f.scene.getTexture(f.textures.get('a')!), before = f.updates();
    f.resetHistory();
    expect(f.updates()).toBe(before);expect(f.scene.materialData).toEqual(data);expect(f.scene.materialFlags).toEqual(flags);
    expect(f.scene.materialTextureHandles).toEqual(textures);expect(f.scene.getTexture(f.textures.get('a')!)).toBe(resource);
    f.apply();const cold = f.updates() - before;f.apply();states.push([cold, f.updates() - before]);
  }
  expect(states).toEqual([[2, 2], [2, 2], [2, 2]]);
  // Reset never makes invalid numeric input or a dead handle safe.
  f.resetHistory();Object.assign(f.frame[0]!.look.uv, { rotation: NaN });expect(f.apply).toThrow();
  Object.assign(f.frame[0]!.look.uv, { rotation: 0 });f.apply();f.resetHistory();
  f.scene.destroyMaterial(f.a);expect(f.apply).toThrow();
});

test('unchanged detached frames skip material writes; in-place nested edits update static and skinned forms', () => {
  const f = fixture();f.apply();expect(f.updates()).toBe(2);
  for (let i = 0; i < 10; i++) { f.frame[0]!.look = structuredClone(f.frame[0]!.look);f.apply(); }
  expect(f.updates()).toBe(2);
  const look = f.frame[0]!.look;
  Object.assign(look.baseColor, { 0: .12 });Object.assign(look.uv.offset, { 1: .7 });Object.assign(look.toon!.outlineColor, { 2: .9 });
  f.apply();expect(f.updates()).toBe(4);
  expect(f.scene.materialData[f.a * MATERIAL_FLOAT_STRIDE_3D]).toBe(Math.fround(.12));
  expect(f.scene.materialData.slice(f.a * MATERIAL_FLOAT_STRIDE_3D, (f.a + 1) * MATERIAL_FLOAT_STRIDE_3D)).toEqual(f.scene.materialData.slice(f.b * MATERIAL_FLOAT_STRIDE_3D, (f.b + 1) * MATERIAL_FLOAT_STRIDE_3D));
  expect(f.scene.materialFlags[f.a]! & MATERIAL_FLAG_SKINNED_3D).toBe(0);expect(f.scene.materialFlags[f.b]! & MATERIAL_FLAG_SKINNED_3D).not.toBe(0);
  f.apply();expect(f.updates()).toBe(4);
});

test('fades preserve declared blend/additive modes and notice declaration edits', () => {
  for (const mode of ['opaque', 'blend', 'additive'] as const) {
    const f = fixture(mode);f.apply();const original = f.scene.materialFlags.slice();
    Object.assign(f.frame[0]!.look, { opacity: .035 });f.apply();expect(f.scene.materialData[3]).toBe(Math.fround(.035));expect(f.scene.materialFlags[0]! & MATERIAL_FLAG_ALPHA_BLEND_3D).not.toBe(0);
    Object.assign(f.frame[0]!.look, { opacity: 1 });f.apply();expect(f.scene.materialFlags).toEqual(original);
    f.declared.alphaMode = 'additive';f.apply();expect(f.scene.materialFlags[0]! & MATERIAL_FLAG_ADDITIVE_3D).not.toBe(0);
  }
});

test('cutaway shader state reaches static and skinned forms and can be cleared independently of opacity', () => {
  const f = fixture();Object.assign(f.frame[0]!.look, { opacity: .035, cutaway: true });f.apply();
  for (const handle of [f.a, f.b]) expect(f.scene.materialFlags[handle]! & MATERIAL_FLAG_CUTAWAY_3D).not.toBe(0);
  const updates = f.updates();f.apply();expect(f.updates()).toBe(updates);
  Object.assign(f.frame[0]!.look, { cutaway: false });f.apply();
  for (const handle of [f.a, f.b]) expect(f.scene.materialFlags[handle]! & MATERIAL_FLAG_CUTAWAY_3D).toBe(0);
});

test('all texture slots change, detach and validate; replacing pixels keeps the handle live', () => {
  const f = fixture();f.apply();
  for (const [index, slot] of ['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive'].entries()) {
    Object.assign(f.frame[0]!.look.textures, { [slot]: 'a' });f.apply();expect(f.scene.materialTextureHandles[index]).toBe(f.textures.get('a')!);
    Object.assign(f.frame[0]!.look.textures, { [slot]: 'b' });f.apply();expect(f.scene.materialTextureHandles[index]).toBe(f.textures.get('b')!);
    Object.assign(f.frame[0]!.look.textures, { [slot]: undefined });f.apply();expect(f.scene.materialTextureHandles[index]).toBe(-1);
  }
  Object.assign(f.frame[0]!.look.textures, { baseColor: 'a' });f.apply();const before = f.updates();
  f.scene.replaceTexture({ handle: f.textures.get('a')!, width: 1, height: 1, pixels: new Uint8Array([10, 20, 30, 255]) });f.apply();
  expect(f.updates()).toBe(before);expect(f.scene.getTexture(f.textures.get('a')!).pixels[0]).toBe(10);
  Object.assign(f.frame[0]!.look.textures, { normal: 'missing' });expect(f.apply).toThrow('missing');expect(f.apply).toThrow('missing');
  Object.assign(f.frame[0]!.look.textures, { normal: 'b' });f.apply();expect(f.scene.materialTextureHandles[2]).toBe(f.textures.get('b')!);
});

test('frame application restores external scene writes and does not hide released resources or invalid input', () => {
  const f = fixture();f.apply();const data = f.scene.materialData.slice(), flags = f.scene.materialFlags.slice(), textures = f.scene.materialTextureHandles.slice();
  f.scene.updateMaterial(f.a, { baseColor: [.8, .1, .2, 1] });f.apply();expect(f.scene.materialData).toEqual(data);expect(f.scene.materialFlags).toEqual(flags);
  f.scene.materialData[4] = 42;f.scene.materialFlags[f.b] = 0;f.scene.materialTextureHandles[0] = f.textures.get('b')!;
  f.apply();expect(f.scene.materialData).toEqual(data);expect(f.scene.materialFlags).toEqual(flags);expect(f.scene.materialTextureHandles).toEqual(textures);
  Object.assign(f.frame[0]!.look.uv, { rotation: NaN });expect(f.apply).toThrow();expect(f.apply).toThrow();
  Object.assign(f.frame[0]!.look.uv, { rotation: 0 });f.apply();expect(f.scene.materialData).toEqual(data);
  f.scene.destroyMaterial(f.a);expect(f.apply).toThrow();
});

test('shader, lighting, UV and toon controls invalidate independently', () => {
  const mutations = [
    { path: 'look', value: { metallic: .8 } }, { path: 'look', value: { roughness: .2 } }, { path: 'look', value: { shader: 'retro' } },
    { path: 'look', value: { shading: 'unlit' } }, { path: 'look', value: { doubleSided: true } },
    { path: 'uv', value: { rotation: .2 } }, { path: 'toon', value: { bands: 5 } }, { path: 'toon', value: { rimStrength: .8 } }, { path: 'toon', value: { outlineWidth: .01 } },
  ];
  for (const mutation of mutations) {
    const f = fixture();f.apply();const look = f.frame[0]!.look;
    Object.assign(mutation.path === 'look' ? look : mutation.path === 'uv' ? look.uv : look.toon!, mutation.value);
    f.apply();expect(f.updates()).toBe(4);f.apply();expect(f.updates()).toBe(4);
  }
  for (const field of ['emissive', 'scale', 'shadowColor', 'rimColor']) {
    const f = fixture();f.apply();const look = f.frame[0]!.look;
    Object.assign(field === 'emissive' ? look.emissive : field === 'scale' ? look.uv.scale : field === 'shadowColor' ? look.toon!.shadowColor : look.toon!.rimColor, { 0: .123 });
    f.apply();expect(f.updates()).toBe(4);
  }
});
