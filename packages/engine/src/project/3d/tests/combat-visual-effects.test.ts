import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentCombatTimingRings } from '../combat-visuals/timing-rings.ts';
import { presentCombatEffects3D } from '../combat-visuals/effects.ts';

function setup() {
  const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: -2, y: 1, z: 0 } }, { id: 'b', position: { x: 0, y: 1, z: 0 } }] }).capture();
  state.frame = 11;
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['a', 'b', 'tod:arena', ...Array.from({ length: 12 }, (_, i) => `b:spark:${i}`)].map(id => ({ id, position: [id === 'a' ? -2 : 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const event: CombatEvent = { id: 'impact', frame: 10, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 8, impulse: { x: 1, y: 0, z: 0 } };
  return { state, frame, events: [event] };
}

test('contact streaks originate at the struck surface, block sheds fewer sparks, parry uses separate rings', () => {
  const options = setup();
  presentCombatEffects3D(options);
  const sparks = options.frame.entities.filter(entity => entity.id.includes(':spark:'));
  expect(sparks.every(spark => Math.hypot(spark.position[0] + .45, spark.position[1] - 1.2, spark.position[2]) < .6)).toBe(true);
  const fallback = sparks.map(spark => structuredClone(spark.position));
  options.events[0]!.contactPoint = { x: -.45, y: 1.2, z: 0 };
  presentCombatEffects3D(options);
  expect(sparks.map(spark => spark.position)).toEqual(fallback);
  expect(sparks.filter(spark => spark.visible)).toHaveLength(12);
  options.events[0]!.kind = 'block';
  presentCombatEffects3D(options);
  expect(sparks.filter(spark => spark.visible)).toHaveLength(6);
  options.events[0]!.kind = 'parry';
  presentCombatEffects3D(options);
  expect(sparks.some(spark => spark.visible)).toBe(false);
  options.state.frame = 30;
  presentCombatEffects3D(options);
  expect(sparks.some(spark => spark.visible)).toBe(false);
});

test('counterhit has a stronger cross burst, and reduced motion keeps framing without camera impulses', () => {
  const options = setup();
  presentCombatEffects3D(options);
  const lightSize = options.frame.entities.find(entity => entity.id === 'b:spark:0')!.scale[0];
  options.events[0]!.counter = true;
  presentCombatEffects3D(options);
  expect(options.frame.entities.find(entity => entity.id === 'b:spark:0')!.scale[0]).toBeGreaterThan(lightSize);
  const impactCamera = structuredClone(options.frame.camera);
  presentCombatEffects3D({ ...options, reducedMotion: true });
  const stableCamera = structuredClone(options.frame.camera);
  expect(stableCamera.position).not.toEqual(impactCamera.position);
  expect(stableCamera.target).toEqual(impactCamera.target);
  options.state.frame = 40;
  presentCombatEffects3D(options);
  expect(options.frame.camera).toEqual(stableCamera);
});

test('contact particles stay at the impact anchor after the defender is launched', () => {
  const options = setup();
  options.events[0]!.contactPoint = { x: -.4, y: 1.1, z: 0 };
  presentCombatEffects3D(options);
  const positions = options.frame.entities.filter(entity => entity.id.includes(':spark:')).map(entity => structuredClone(entity.position));
  options.frame.entities.find(entity => entity.id === 'b')!.position = [4, 8, 3];
  presentCombatEffects3D(options);
  expect(options.frame.entities.filter(entity => entity.id.includes(':spark:')).map(entity => entity.position)).toEqual(positions);
});

test('perfect parry has a separate double white ring rather than a block spark burst', () => {
  const options = setup();
  for (let index = 0; index < 24; index++) options.frame.entities.push({ id: `b:parry:${index}`, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [0, 0, 0], visible: false });
  options.events[0]!.kind = 'block';presentCombatTimingRings(options);
  expect(options.frame.entities.filter(entity => entity.id.includes(':parry:') && entity.visible)).toHaveLength(0);
  options.events[0]!.kind = 'parry';presentCombatTimingRings(options);
  expect(options.frame.entities.filter(entity => entity.id.includes(':parry:') && entity.visible)).toHaveLength(24);
  const ring = options.frame.entities.filter(entity => entity.id.includes(':parry:'));
  expect(Math.max(...ring.map(p => p.position[0])) - Math.min(...ring.map(p => p.position[0]))).toBeGreaterThan(.7);
  options.state.frame = 40;presentCombatTimingRings(options);
  expect(options.frame.entities.filter(entity => entity.id.includes(':parry:') && entity.visible)).toHaveLength(0);
});
