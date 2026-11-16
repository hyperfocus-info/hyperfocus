import { exact } from "./rig-preparation-oracle.ts";
import { expect, test } from 'bun:test';
import type { Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { presentArtFighter } from './pose.ts';
import { sampleArtMotion } from './motion.ts';
import { createRigFrameLookup, createRigPreparationWork } from './rig-preparation.ts';
import { presentFighterExpression } from './integration/expression.ts';
import { bridgeDirectedWardrobe } from './integration/wardrobe.ts';
import { presentDirectedKnockout } from './integration/knockout.ts';
import { legacyParts } from './integration/contract.ts';

function fixture() {
  const names = ['torso', 'head', 'hair', 'mouth', 'neck', 'hem', 'collar', 'closure', 'zip-pull', 'pocket', 'pocket-flap', 'service-tag', 'cosmetic-panel',
    ...[-1, 1].flatMap(side => [`brow:${side}`, `eye:${side}`, `eye-light:${side}`]),
    ...['left', 'right'].flatMap(side => ['sleeve', 'forearm', 'thigh', 'shin', 'shoe', 'sole', 'boot-detail', 'hand', 'thumb', 'wrist-wrap', 'knuckle-folds'].map(part => `${side}-${part}`))];
  const rest = names.map((name, i): NonNullable<Parameters<typeof presentArtFighter>[0]['bindPose']>[number] => ({ id: `rig:${name}`, position: [i % 3 * .1, 1.2 + i * .01, i % 2 ? -0 : .2], scale: [1, .9, 1], rotationY: i % 3 ? -.17 : -0 }));
  const authored: Hyperfocus3DDeclaration['scenes'][number]['entities'] = [...rest.map(part => ({ ...part, meshId: 'fixture-mesh', materialId: 'fixture-material' })), ...Object.values(legacyParts).map((suffix): Hyperfocus3DDeclaration['scenes'][number]['entities'][number] => ({ id: `actor${suffix}`, meshId: 'fixture-mesh', materialId: 'fixture-material', position: [0, 1, 0], scale: [1, 1, 1], rotationY: 0 }))];
  const entities = authored.map((row): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: row.id, position: [...row.position], rotation: [0, 0, 0, 1], scale: [...row.scale], visible: true }));
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'scene', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities, materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const declaration: Hyperfocus3DDeclaration = {
    version: 1, activeSceneId: 'scene', budgets: { meshes: 1, vertices: 1, indices: 1, textures: 1, textureBytes: 1, materials: 1, lights: 1, entities: authored.length },
    meshes: [], textures: [], materials: [], scenes: [{ id: 'scene', camera: structuredClone(frame.camera), lights: [], entities: authored }],
    audio: { policy: 'disabled', cues: [] }, save: { restoreOnBoot: false, slot: 'test', maxBytes: 1024 },
  };
  return { frame, declaration, binding: { entityId: 'actor', rigId: 'rig', rootHeight: 1, rest } };
}

test('prepared standing writer preserves exact outputs, detached arrays, writes and IK across poses', () => {
  for (const kind of ['idle', 'heavy', 'hit'] as const) for (const tick of [0, 20, 45]) for (const yaw of [0, -0, .3, NaN, Infinity]) {
    const a = fixture(), b = structuredClone(a), pose = sampleArtMotion({ kind, frame: tick });
    if (tick === 45) delete pose.head;
    const aw = createRigPreparationWork(), bw = createRigPreparationWork();
    const input: Pick<Parameters<typeof presentArtFighter>[0], 'id' | 'root' | 'yaw' | 'motion'> = { id: 'rig', root: [1, -0, 3], yaw, motion: pose };
    const first = presentArtFighter({ ...input, ...a, bindPose: a.binding.rest, work: aw });
    const second = presentArtFighter({ ...input, ...b, bindPose: b.binding.rest, preparation: 'prepared', lookup: createRigFrameLookup(b.frame, bw), work: bw });
    expect(exact(a.frame, b.frame)).toBe(true);expect(exact(first, second)).toBe(true);
    expect(bw.partWrites).toBe(aw.partWrites);expect(bw.partVisits).toBe(aw.partVisits);expect(bw.ikSolves).toBe(4);
    expect(bw.trigCalls).toBeLessThan(aw.trigCalls);expect(bw.bodyPivotCalculations).toBe(1);expect(bw.preparedRetainedFrameReferences).toBe(0);
    expect(b.frame.entities[0]!.position).not.toBe(a.frame.entities[0]!.position);
  }
});

test('shared last-match lookup preserves duplicate IDs, wardrobe and expression writes', () => {
  const a = fixture();
  a.frame.entities.unshift(structuredClone(a.frame.entities.find(row => row.id === 'rig:left-hand')!));
  a.frame.entities[0]!.position[0] = 81;
  a.binding.rest.push({ ...structuredClone(a.binding.rest[0]!), position: [2, 3, 4] });
  const b = structuredClone(a), aw = createRigPreparationWork(), bw = createRigPreparationWork();
  for (const [side, work, prepared] of [[a, aw, false], [b, bw, true]] as const) {
    const lookup = prepared ? createRigFrameLookup(side.frame, work) : undefined;
    presentArtFighter({ frame: side.frame, declaration: side.declaration, bindPose: side.binding.rest, id: 'rig', root: [0, 0, 0], yaw: -.3, motion: sampleArtMotion({ kind: 'heavy', frame: 25 }), preparation: prepared ? 'prepared' : 'original', lookup, work });
    bridgeDirectedWardrobe(side.frame, side.declaration, side.binding, lookup, work);
    presentFighterExpression(side.frame, 'rig', 'hurt', .7, true, lookup, work);
  }
  expect(exact(a.frame, b.frame)).toBe(true);expect(a.frame.entities[0]!.position[0]).toBe(81);
  expect(aw.frameMapBuilds).toBe(3);expect(bw.frameMapBuilds).toBe(1);expect(aw.frameMapTemporaryArrays).toBe(5);expect(bw.frameMapTemporaryArrays).toBe(0);
  // New membership on the next call is observed; no cache survives the call.
  const added = { ...structuredClone(b.frame.entities[0]!), id: 'rig:new' };b.frame.entities.push(added);
  expect(createRigFrameLookup(b.frame).get(added.id)).toBe(added);
});

test('knockout keeps first-match semantics and failed applications do not retain a frame', () => {
  const a = fixture(), first = a.frame.entities.find(row => row.id === 'actor:head')!;
  first.position = [10, 20, 30];const duplicate = structuredClone(first);duplicate.position = [80, 90, 100];a.frame.entities.push(duplicate);
  const b = structuredClone(a);b.frame.entities.pop();
  const am = presentDirectedKnockout(a.frame, a.binding), bm = presentDirectedKnockout(b.frame, b.binding);
  expect(exact(am, bm)).toBe(true);expect(exact(a.frame.entities.filter(e => e.id.startsWith('rig:')), b.frame.entities.filter(e => e.id.startsWith('rig:')))).toBe(true);
  const x = fixture();x.frame.entities = x.frame.entities.filter(e => e.id !== 'rig:left-sleeve');const y = structuredClone(x);
  for (const [value, preparation] of [[x, 'original'], [y, 'prepared']] as const) {
    const work = createRigPreparationWork();
    expect(() => presentArtFighter({ ...value, bindPose: value.binding.rest, id: 'rig', root: [0, 0, 0], yaw: 0, motion: sampleArtMotion({ kind: 'idle', frame: 2 }), preparation, work })).toThrow('Missing articulated segment');
    expect(work.preparedRetainedFrameReferences).toBe(0);
  }
  expect(exact(x.frame, y.frame)).toBe(true);
});
