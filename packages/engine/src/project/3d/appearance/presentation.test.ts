import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { applyAppearance3D } from './presentation.ts';

test('appearance frame overlay changes only variants and opaque colors, atomically and without aliasing', async () => {
  const fixture = await combatMotionFixture(), frame = frameFor(fixture.runtime.declaration);
  const before = structuredClone(frame), resolved: Parameters<typeof applyAppearance3D>[1] = { variants: [{ entityId: 'a', variantId: 'coat' }], colors: [{ materialId: 'material', baseColor: [.2, .3, .4, 1] }] };
  applyAppearance3D(frame, resolved);expect(frame.entities[0]!.variantId).toBe('coat');expect(frame.materials[0]!.look.baseColor).toEqual([.2, .3, .4, 1]);
  const expected = structuredClone(before);expected.entities[0]!.variantId = 'coat';expected.materials[0]!.look = { ...expected.materials[0]!.look, baseColor: [.2, .3, .4, 1] };expect(frame).toEqual(expected);
  resolved.colors[0]!.baseColor[0] = 0;expect(frame.materials[0]!.look.baseColor[0]).toBe(.2);
  const unchanged = structuredClone(frame);expect(() => applyAppearance3D(frame, { ...resolved, colors: [{ ...resolved.colors[0]!, materialId: 'missing' }] })).toThrow();expect(frame).toEqual(unchanged);
});
test('real runtime switches authored material variants and resets missing variant selection without changing physics', async () => {
  const fixture = await combatMotionFixture();
  const project = structuredClone(fixture.project), declaration = structuredClone(fixture.runtime.declaration);
  declaration.materials.push({ ...declaration.materials[0]!, id: 'coat', baseColor: [.8, .1, .2, 1] });
  declaration.scenes[0]!.entities[0]!.variants = [{ id: 'coat', meshId: 'mesh', materialId: 'coat' }];
  const runtime = await createHyperfocus3DRuntime({ ...project, extensions: { ...project.extensions, hyperfocus3D: declaration } }, fixture.assets);
  const renderedMaterials = () => {
    const commands = runtime.compile();
    return Array.from(commands.commandMaterialHandles.subarray(0, commands.commandCount));
  };
  const base = frameFor(declaration), before = runtime.physics.checkpoint();runtime.applyFrame(base);
  const materials = renderedMaterials();
  expect(materials.length).toBeGreaterThan(0);
  const styled = structuredClone(base);applyAppearance3D(styled, { variants: [{ entityId: 'a', variantId: 'coat' }], colors: [] });runtime.applyFrame(styled);
  expect(renderedMaterials()).not.toEqual(materials);expect(runtime.physics.checkpoint()).toEqual(before);
  runtime.applyFrame(base);expect(renderedMaterials()).toEqual(materials);expect(runtime.physics.checkpoint()).toEqual(before);
  expect(runtime.declaration.scenes[0]!.entities[0]!.materialId).toBe('material');
});

function frameFor(declaration: Awaited<ReturnType<typeof combatMotionFixture>>['runtime']['declaration']): Hyperfocus3DEvaluatedFrame {
  const scene = declaration.scenes[0]!;
  return { sceneId: scene.id, frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, camera: structuredClone(scene.camera),
    entities: scene.entities.map(entity => ({ id: entity.id, position: [...entity.position], rotation: [0, 0, 0, 1], scale: [...entity.scale], visible: true })),
    materials: declaration.materials.map(material => ({ id: material.id, look: { ...structuredClone(materialPreset3D('aged-iron').look), baseColor: [...material.baseColor] } })),
    performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0 };
}
