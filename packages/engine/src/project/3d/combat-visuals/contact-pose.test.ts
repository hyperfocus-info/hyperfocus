import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentWallPose } from './wall-pose.ts';
import { presentGrapplePose } from '../combat-interaction/grapple-pose.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';

function fixture(): Hyperfocus3DEvaluatedFrame {
  const parts = ['', ':head', ':hair', ':face', ...['left', 'right'].flatMap(side => ['hand', 'arm', 'forearm', 'thigh', 'shin', 'boot'].map(part => `:${side}-${part}`))];
  return {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['a', 'b'].flatMap(id => parts.map((part): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: id + part, position: [id === 'a' ? 0 : 2, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true }))),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
}

test('a grab whiff reaches into its saved stick direction without needing a target and expires', () => {
  const state = { weapons: [], grapples: [], lastAttacks: {}, trace: [{ frame: 10, kind: 'grapple-whiff', actor: 'a', target: '', value: Math.PI }] };
  const frame = fixture(), saved = structuredClone(state);presentGrapplePose(frame, state, 19);
  expect(frame.entities.find(entity => entity.id === 'a:left-hand')!.position[2]).toBeLessThan(-.8);
  expect(frame.entities.filter(entity => entity.id === 'b' || entity.id.startsWith('b:'))).toEqual(fixture().entities.filter(entity => entity.id === 'b' || entity.id.startsWith('b:')));
  expect(state).toEqual(saved);const replay = fixture();presentGrapplePose(replay, structuredClone(saved), 19);expect(replay).toEqual(frame);
  const expired = fixture();presentGrapplePose(expired, state, 28);expect(expired).toEqual(fixture());
});

test('wall-run plants hands toward either contact plane and alternates articulated feet without moving the body', () => {
  for (const normal of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }]) {
    const frame = fixture(), origin = structuredClone(frame.entities[0]!.position);
    presentWallPose(frame, 'a', 2, normal, true);
    const hand = frame.entities.find(entity => entity.id === 'a:left-hand')!;
    expect(hand.position[0] * normal.x + hand.position[2] * normal.z).toBeCloseTo(-.82);
    const feet = frame.entities.filter(entity => entity.id.startsWith('a:') && entity.id.endsWith('-boot'));
    expect(Math.abs(feet[0]!.position[1] - feet[1]!.position[1])).toBeGreaterThan(.5);
    const previous = structuredClone(feet);
    presentWallPose(frame, 'a', 7, normal, true);
    expect(feet[0]!.position[1]).not.toEqual(previous[0]!.position[1]);
    expect(frame.entities[0]!.position).toEqual(origin);
    const reconstructed = fixture();presentWallPose(reconstructed, 'a', 7, normal, true);
    expect(frame).toEqual(reconstructed);
  }
});

test('grab reaches then holds contested wrists; throw follows through and tech visibly separates hands', () => {
  const state = { weapons: [], lastAttacks: {}, grapples: [{ attacker: 'a', target: 'b', remaining: 12, direction: { x: 1, y: 0, z: 0 } }], trace: [{ frame: 10, kind: 'grapple-start', actor: 'a', target: 'b', value: 12 }] };
  const early = fixture();presentGrapplePose(early, state, 10);
  state.grapples[0]!.remaining = 8;
  const held = fixture(), saved = structuredClone(state);presentGrapplePose(held, state, 14);
  const hand = (frame: Hyperfocus3DEvaluatedFrame) => frame.entities.find(entity => entity.id === 'a:left-hand')!.position;
  expect(hand(held)[0]).toBeGreaterThan(hand(early)[0]);
  // The torso no longer uses the hit-recoil pose, so its head must follow the
  // new forward lean instead of remaining detached behind the shoulders.
  const head = held.entities.find(entity => entity.id === 'a:head')!;
  expect(head.position[0]).toBeCloseTo(.78 * Math.sin(.3), 4);
  expect(head.position[1]).toBeCloseTo(1 + .78 * Math.cos(.3), 4);
  expect(state).toEqual(saved);
  const reconstructed = fixture();presentGrapplePose(reconstructed, structuredClone(saved), 14);expect(reconstructed).toEqual(held);
  state.grapples = [];state.trace.push({ frame: 22, kind: 'grapple-throw', actor: 'a', target: 'b', value: 4 });
  const thrown = fixture();presentGrapplePose(thrown, state, 27);expect(hand(thrown)[1]).toBeLessThan(hand(held)[1]);
  state.trace[1] = { frame: 22, kind: 'grapple-tech', actor: 'b', target: 'a', value: 0 };
  const teched = fixture();presentGrapplePose(teched, state, 27);expect(Math.abs(hand(teched)[2])).toBeGreaterThan(Math.abs(hand(held)[2]));
  const expired = fixture();presentGrapplePose(expired, state, 40);expect(expired).toEqual(fixture());
  const combat = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] }).capture();
  combat.fighters[0]!.guarding = true;
  const guarding = fixture();presentGrapplePose(guarding, state, 27, combat);expect(guarding).toEqual(fixture());
});
