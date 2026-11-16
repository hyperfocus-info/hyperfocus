import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { presentCombatVisuals3D } from '../../combat-visuals.ts';
import { presentCombatDash3D } from '../dash-feedback.ts';
import { presentDashPose } from './pose.ts';

function fixture() {
  const config = createTouchOfDeathPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const ids = ['a', 'a:head', 'a:hair', 'a:face', 'a:belt', ...['left', 'right'].flatMap(side => ['hand', 'arm', 'forearm', 'thigh', 'shin', 'boot'].map(part => `a:${side}-${part}`))];
  const frame: Hyperfocus3DEvaluatedFrame = { sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, entities: ids.map(id => ({ id, position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })), materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [], renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0 };
  presentCombatVisuals3D({ frame, config, state, grounded: new Set(['a']) });
  return { frame, state, config };
}

test('ground dash plants skidding soles while airborne dash tucks legs without changing root or simulation', () => {
  const { frame, state } = fixture(), ground = structuredClone(frame), air = structuredClone(frame), saved = structuredClone(state);
  const cue = { id: 'a', dx: 1, dz: 0, dashAge: 4, dashDuration: 10, dashCue: 10, dashCueKind: 1 };
  presentCombatDash3D({ frame: ground, state, motion: [{ ...cue, dashAirborne: false }] });
  presentCombatDash3D({ frame: air, state, motion: [{ ...cue, dashAirborne: true }] });
  for (const side of ['left', 'right']) {
    const id = `a:${side}-boot`, original = frame.entities.find(entity => entity.id === id)!;
    expect(ground.entities.find(entity => entity.id === id)!.position[1]).toBe(original.position[1]);
    expect(air.entities.find(entity => entity.id === id)!.position[1]).toBeGreaterThan(original.position[1] + .4);
  }
  expect(ground.entities[0]!.position).toEqual(frame.entities[0]!.position);expect(air.entities[0]!.position).toEqual(frame.entities[0]!.position);expect(state).toEqual(saved);
});

test('cancelled dash bridge fades during startup and cannot distort active contact or hit recoil', () => {
  const { frame, state, config } = fixture(), fighter = state.fighters[0]!, move = config.moves[0]!;
  fighter.moveId = move.id;fighter.moveFrame = 1;
  const cue = { id: 'a', dx: 0, dz: 1, dashCueKind: 1, dashCue: 8, dashAge: 4, dashDuration: 10, dashAirborne: true, dashCancelFrames: 3, dashCancelDuration: 6, dashCancelX: 1, dashCancelZ: 0 };
  const startup = structuredClone(frame);presentCombatDash3D({ frame: startup, state, config, motion: [cue] });expect(startup.entities).not.toEqual(frame.entities);
  fighter.moveFrame = move.startupFrames;
  const active = structuredClone(frame);presentCombatDash3D({ frame: active, state, config, motion: [cue] });expect(active).toEqual(frame);
  fighter.moveFrame = 1;fighter.stunFrames = 10;
  const hit = structuredClone(frame);presentCombatDash3D({ frame: hit, state, config, motion: [cue] });expect(hit).toEqual(frame);
});

test('dash entry and exit reconstruct continuously from fixed cue age with no hidden pose history', () => {
  const { frame } = fixture();
  for (const dashAirborne of [false, true]) {
    const sample = (dashAge: number) => { const fresh = structuredClone(frame);presentDashPose(fresh, { id: 'a', dx: 1, dz: 0, dashAge, dashDuration: 10, dashCue: 14 - dashAge, dashAirborne });return fresh; };
    expect(sample(0)).toEqual(frame);expect(sample(14)).toEqual(frame);
    for (const boundary of [0, 3, 10, 14]) {
      const before = sample(Math.max(0, boundary - .001)), after = sample(Math.min(14, boundary + .001));
      for (let i = 0; i < before.entities.length; i++) expect(Math.hypot(...before.entities[i]!.position.map((value, index) => value - after.entities[i]!.position[index]!))).toBeLessThan(.001);
    }
    expect(sample(6)).toEqual(sample(6));
  }
});
