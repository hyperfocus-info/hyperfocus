import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readAppearanceCatalog3D, type AppearanceCatalog3D } from './catalog.ts';
import { resolveAppearanceTexture3D, applyAppearanceTexture3D } from './texture-targets.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { evaluatedFrameFixture3D } from '../../../test-support/evaluated-frame3d.ts';

async function fixture() {
  const f = await combatMotionFixture(), declaration = structuredClone(f.runtime.declaration);
  for (const actor of ['a', 'b']) {
    const entity = declaration.scenes[0]!.entities.find(entity => entity.id === actor)!;
    const material = structuredClone(declaration.materials.find(value => value.id === entity.materialId)!);material.id = `${actor}:shirt`;material.baseColor[3] = 1;material.alphaMode = 'opaque';entity.materialId = material.id;declaration.materials.push(material);
    declaration.textures.push({ id: `${actor}:image`, assetId: `placeholder-${actor}`, width: 16, height: 16, filter: 'linear', wrap: 'clamp', flipY: false });
  }
  const catalog: AppearanceCatalog3D = { version: 1, actors: [{ entityId: 'a' }, { entityId: 'b' }], slots: [{ id: 'color', label: 'Color', defaultOptionId: 'red', options: [{ id: 'red', label: 'Red', colors: [{ materialSuffix: ':shirt', baseColor: [1, 0, 0, 1] }] }] }],
    textureSlots: [{ id: 'emblem', label: 'Emblem', materialSuffix: ':shirt', textureSuffix: ':image' }] };
  return { catalog, declaration };
}
test('dedicated actor texture targets coexist with palettes and resolve without changing declarations', async () => {
  const { catalog, declaration } = await fixture(), before = structuredClone(declaration);
  const parsed = readAppearanceCatalog3D(catalog, declaration)!;expect(resolveAppearanceTexture3D({ catalog: parsed, actorId: 'b', slotId: 'emblem' })).toEqual({ materialId: 'b:shirt', textureId: 'b:image' });
  expect(declaration).toEqual(before);
  for (const options of [{ actorId: 'missing', slotId: 'emblem' }, { actorId: 'a', slotId: 'missing' }]) expect(() => resolveAppearanceTexture3D({ catalog, ...options })).toThrow();
  for (const value of [{ ...catalog, textureSlots: [...catalog.textureSlots!, ...catalog.textureSlots!] }, { ...catalog, textureSlots: [{ ...catalog.textureSlots![0], extra: true }] }, { ...catalog, textureSlots: Array(5).fill(catalog.textureSlots![0]) }]) expect(() => readAppearanceCatalog3D(value)).toThrow();
});
test('missing references, transparent materials and cross-scene or cross-channel sharing reject', async () => {
  const { catalog, declaration } = await fixture();
  const invalid = (change: (value: typeof declaration) => void) => { const value = structuredClone(declaration);change(value);expect(() => readAppearanceCatalog3D(catalog, value)).toThrow(); };
  invalid(value => { value.textures.splice(0); });invalid(value => { value.materials.find(value => value.id === 'a:shirt')!.alphaMode = 'blend'; });
  invalid(value => { value.materials[0]!.textureId = 'a:image'; });invalid(value => { value.materials.find(value => value.id === 'a:shirt')!.textureIds = { normal: 'a:image' }; });
  invalid(value => { const other = structuredClone(value.scenes[0]!);other.id = 'other';other.entities[0]!.id = 'outside';other.entities[0]!.materialId = 'a:shirt';value.scenes.push(other); });
});
test('fresh-frame texture overlay changes only base color binding', () => {
  const material: Hyperfocus3DEvaluatedFrame['materials'][number] = { id: 'a:shirt', look: { ...structuredClone(materialPreset3D('toon-hero').look), baseColor: [1, 0, 0, 1], opacity: 1, shader: 'toon', textures: { baseColor: 'old', normal: 'normal' } } };
  const frame: Hyperfocus3DEvaluatedFrame = { ...evaluatedFrameFixture3D(), entities: [{ id: 'a', position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true }], materials: [material] };
  const before = structuredClone(frame);applyAppearanceTexture3D({ frame, target: { materialId: 'a:shirt', textureId: 'a:image' } });
  expect(frame).toEqual({ ...before, materials: [{ ...before.materials[0], look: { ...before.materials[0]!.look, textures: { ...before.materials[0]!.look.textures, baseColor: 'a:image' } } }] });
  expect(() => applyAppearanceTexture3D({ frame, target: { materialId: 'missing', textureId: 'a:image' } })).toThrow();
});
