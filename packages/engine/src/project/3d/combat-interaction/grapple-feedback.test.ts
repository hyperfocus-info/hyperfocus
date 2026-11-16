import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentGrappleFeedback } from './grapple-feedback.ts';

test('grapple cue counts down between fighters below overhead HUDs without mutating mechanics', () => {
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['a', 'b', ...Array.from({ length: 12 }, (_, index) => `b:spark:${index}`)].map(id => ({ id, position: [id === 'a' ? -2 : id === 'b' ? 2 : 0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const state = { weapons: [], grapples: [{ attacker: 'a', target: 'b', remaining: 12, direction: { x: 1, y: 0, z: 0 } }], lastAttacks: {}, trace: [{ frame: 0, kind: 'grapple-start', actor: 'a', target: 'b', value: 12 }] };
  const before = structuredClone(state);
  presentGrappleFeedback(frame, state);
  expect(frame.entities.filter(entity => entity.id.includes(':spark:') && entity.visible)).toHaveLength(12);
  expect(frame.entities[2]!.position[1]).toBeGreaterThan(.4);
  expect(frame.entities[2]!.position[1]).toBeLessThan(.8);
  expect(Math.abs(frame.entities[2]!.position[0])).toBeLessThan(.36);
  expect(state).toEqual(before);
  state.grapples[0]!.remaining = 3;
  presentGrappleFeedback(frame, state);
  expect(frame.entities.filter(entity => entity.id.includes(':spark:') && entity.visible)).toHaveLength(3);
  const unchanged = structuredClone(frame);
  presentGrappleFeedback(frame, state);expect(frame).toEqual(unchanged);
});
