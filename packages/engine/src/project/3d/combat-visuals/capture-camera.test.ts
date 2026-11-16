import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { sample3DFrame } from '../../runtime-3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { createCutawayTopologyWork3D } from './cutaways/scene-bindings.ts';

test('capture camera is finalized before scenery cutaways and culling', async () => {
  const { game, runtime } = await combatMotionFixture();
  const snapshot = game.snapshot();
  const sample = () => sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: snapshot.tick, ticksPerSecond: 60 }, viewport: { width: 1280, height: 720 }, simulation: new Map(snapshot.entities.map(entity => [entity.id, { position: entity.position, rotationY: entity.rotationY }])) });
  const frame = sample();
  frame.entities.push({ id: 'tod:city:wall:capture', position: [0, 2, 5], rotation: [0, 0, 0, 1], scale: [2, 4, 1], visible: true });
  frame.materials.push({ id: 'tod:city:wall:capture:occlusion', look: structuredClone(materialPreset3D('aged-iron').look) });
  frame.entities.push({ id: 'tod:city:finish:capture', position: [0, 1, -20], rotation: [0, 0, 0, 1], scale: [.1, .1, .1], visible: true });
  game.presentFrame(frame, { cameraTransform(camera) { camera.position = [0, 3, 10]; camera.target = [0, 1, 0]; } });
  expect(frame.materials.at(-1)!.look.opacity).toBe(.035);
  expect(frame.entities.at(-1)!.visible).toBe(true);
  const opposite = sample();opposite.entities.push(...structuredClone(frame.entities.slice(-2)));
  opposite.timeSeconds += .3; // A camera cut resets presentation history.
  opposite.materials.push({ id: 'tod:city:wall:capture:occlusion', look: structuredClone(materialPreset3D('aged-iron').look) });
  game.presentFrame(opposite, { cameraTransform(camera) { camera.position = [0, 3, -10]; camera.target = [0, 1, 0]; } });
  expect(opposite.materials.at(-1)!.look.opacity).toBe(1);
  expect(opposite.entities.at(-1)!.visible).toBe(false);
  expect(game.snapshot()).toEqual(snapshot);
});

test('presentation stage observations preserve frame and authoritative state', async () => {
  const { game, runtime } = await combatMotionFixture();
  const before = game.snapshot(), plain = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } });
  const observed = structuredClone(plain), stages: string[] = [];
  game.presentFrame(plain);
  game.presentFrame(observed, { onPresentationStage(stage) { stages.push(stage); } });
  expect(observed).toEqual(plain);
  expect(game.snapshot()).toEqual(before);
  expect(stages).toEqual([
    'combatCaptureMs', 'primitiveVisualsMs', 'dashVisualsMs', 'interactionVisualsMs',
    'matchVisualsMs', 'knockoutVisualsMs', 'recoveryVisualsMs', 'hazardVisualsMs',
    'weaponVisualsMs', 'cameraVisualsMs', 'cameraClearanceMs', 'obstructionsMs',
  ]);
});

test('host combat cues are finalized with the camera before obstruction queries', async () => {
  const { game, runtime } = await combatMotionFixture(), saved = game.snapshot();
  const frame = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } });
  game.presentFrame(frame, {
    cameraTransform(camera) { camera.position = [0, 1, 10];camera.target = [0, 1, 0]; },
    beforeVisibility(frame) {
      expect(frame.camera.position).toEqual([0, 1, 10]);
      const id = saved.combat!.state.fighters[0]!.id;
      frame.entities.find(entity => entity.id === id)!.position = [0, 1, 0];
      frame.entities.push({ id: `${id}:spark:99`, position: [2, 1, 0], rotation: [0, 0, 0, 1], scale: [.1, .1, .1], visible: true });
      frame.entities.push({ id: 'cue-wall', position: [1, 1, 5], rotation: [0, 0, 0, 1], scale: [.2, 1, .1], visible: true });
      frame.materials.push({ id: 'cue-wall:occlusion', look: structuredClone(materialPreset3D('aged-iron').look) });
    },
  });
  expect(frame.materials.at(-1)!.look.cutaway).toBe(true);
  expect(game.snapshot()).toEqual(saved);
});

test('an external stage observer invalidates borrowed topology before obstruction presentation', async () => {
  const { game, runtime } = await combatMotionFixture(), before = game.snapshot();
  const frame = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } });
  game.presentFrame(frame, {
    cameraTransform(camera) { camera.position = [0, 3, 10];camera.target = [0, 1, 0]; },
    onPresentationStage(stage) {
      if (stage !== 'cameraClearanceMs') return;
      frame.entities.reverse();frame.materials.reverse();
      frame.entities.push({ id: 'tod:city:observer', position: [0, 2, 5], rotation: [0, 0, 0, 1], scale: [2, 4, 1], visible: true });
      frame.materials.push({ id: 'tod:city:observer:occlusion', look: structuredClone(materialPreset3D('aged-iron').look) });
    },
  });
  expect(frame.materials.at(-1)!.look.opacity).toBe(.035);
  expect(game.snapshot()).toEqual(before);
});

test('synchronous topology removes only the second scan and preserves observed presentation', async () => {
  const { game, runtime } = await combatMotionFixture();
  const source = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } }), before = game.snapshot();
  // Warm the binding so both sides count validation of an existing topology.
  game.presentFrame(structuredClone(source));
  const checked = structuredClone(source), synchronous = structuredClone(source);
  const checkedWork = createCutawayTopologyWork3D(), synchronousWork = createCutawayTopologyWork3D();
  const checkedStages: string[] = [], synchronousStages: string[] = [];
  game.presentFrame(checked, { onPresentationStage: stage => checkedStages.push(stage), cutawayTopologyWork: checkedWork });
  game.presentFrame(synchronous, { presentationTopology: 'synchronous', onPresentationStage: stage => synchronousStages.push(stage), cutawayTopologyWork: synchronousWork });
  expect(synchronous).toEqual(checked);expect(synchronousStages).toEqual(checkedStages);
  expect(game.snapshot()).toEqual(before);
  expect(checkedWork).toEqual({ calls: 2, validationEntityVisits: source.entities.length * 2, validationMaterialVisits: source.materials.length * 2, builds: 0, builtEntities: 0, builtMaterials: 0 });
  expect(synchronousWork).toEqual({ calls: 1, validationEntityVisits: source.entities.length, validationMaterialVisits: source.materials.length, builds: 0, builtEntities: 0, builtMaterials: 0 });
});

test('synchronous topology still discovers changed topology before every ownership window', async () => {
  const { game, runtime } = await combatMotionFixture();
  game.presentFrame(runtime.sampleFrame({ viewport: { width: 1280, height: 720 } }), { presentationTopology: 'synchronous' });
  const frame = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } }), work = createCutawayTopologyWork3D();
  game.presentFrame(frame, {
    presentationTopology: 'synchronous', cutawayTopologyWork: work,
    cameraTransform(camera) { camera.position = [0, 3, 10];camera.target = [0, 1, 0]; },
    onPresentationStage(stage) {
      // Before the borrow begins, even this strategy permits arbitrary edits.
      if (stage !== 'cameraVisualsMs') return;
      frame.entities.reverse();frame.materials.reverse();
      frame.entities.push({ id: 'tod:city:new-window', position: [0, 2, 5], rotation: [0, 0, 0, 1], scale: [2, 4, 1], visible: true });
      frame.materials.push({ id: 'tod:city:new-window:occlusion', look: structuredClone(materialPreset3D('aged-iron').look) });
    },
  });
  expect(frame.materials.at(-1)!.look.opacity).toBe(.035);
  expect(work.calls).toBe(1);expect(work.builds).toBe(1);
  expect(work.builtEntities).toBe(frame.entities.length);expect(work.builtMaterials).toBe(frame.materials.length);
  const next = structuredClone(frame), nextWork = createCutawayTopologyWork3D();
  game.presentFrame(next, { presentationTopology: 'synchronous', cutawayTopologyWork: nextWork, onPresentationStage() {} });
  expect(nextWork.calls).toBe(1);expect(nextWork.builds).toBe(0);
  expect(nextWork.validationEntityVisits).toBe(next.entities.length);expect(nextWork.validationMaterialVisits).toBe(next.materials.length);
});

test('presentation rejects unsupported topology strategies before mutating a frame', async () => {
  const { game, runtime } = await combatMotionFixture(), frame = runtime.sampleFrame({ viewport: { width: 1280, height: 720 } }), before = structuredClone(frame);
  expect(() => Reflect.apply(game.presentFrame, game, [frame, { presentationTopology: 'untracked' }])).toThrow('Unsupported presentation topology strategy');
  expect(frame).toEqual(before);
});
