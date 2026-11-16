import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentCombatCamera3D, type CombatCameraOrbit3D } from './camera.ts';

function fixture(pair: [number, number, number][]) {
  const state = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: pair.map((p, index) => ({
    id: `fighter:${index}`, position: { x: p[0], y: p[1], z: p[2] },
  })) }).capture();
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: [...pair.map((p, index): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: `fighter:${index}`, position: p, rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
      { id: 'tod:city:street', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true }],
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const orbit: CombatCameraOrbit3D = { yaw: 0 };
  return { frame, state, orbit };
}

function settle(options: ReturnType<typeof fixture>, aspect: number, count = 120) {
  for (let index = 0; index < count; index++) {
    options.frame.timeSeconds += 0.016666666666666666;
    presentCombatCamera3D({ ...options, viewportAspect: aspect, reducedMotion: true });
  }
}

function assertFit(options: ReturnType<typeof fixture>, aspect: number) {
  const { camera } = options.frame, yaw = options.orbit.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const dy = camera.position[1] - camera.target[1], forward = Math.hypot(camera.position[0] - camera.target[0], camera.position[2] - camera.target[2]);
  const distance = Math.hypot(dy, forward), tangent = Math.tan(camera.fovYRadians / 2);
  for (const root of options.frame.entities.slice(0, 2)) {
    const x = root.position[0] - camera.target[0], y = root.position[1] - camera.target[1], z = root.position[2] - camera.target[2];
    const horizontal = x * c - z * s, depthHorizontal = x * s + z * c;
    const depth = distance - (y * dy + depthHorizontal * forward) / distance;
    const vertical = (y * forward - depthHorizontal * dy) / distance;
    expect((Math.abs(horizontal) + 1.35) / (depth * tangent * aspect)).toBeLessThanOrEqual(.801);
    expect((Math.abs(vertical) + 2.15) / (depth * tangent)).toBeLessThanOrEqual(.801);
  }
}

test('city camera eases apart real native route and KO depth alignments in portrait and landscape', () => {
  const pairs: [number, number, number][][] = [
    [[0, 1, -1], [0, 1, 1]],
    [[-9.8368057679, .9997742936, 38.3884837897], [-9.3253893614, .9997742481, 40.3167555653]],
    [[-10.1586202944, .3540981919, 40.1067134191], [-10.00001, .9997742708, 41.7783420287]],
  ];
  for (const pair of pairs) for (const aspect of [0.4613733905579399, 1.7777777777777777]) {
    const options = fixture(structuredClone(pair)), state = structuredClone(options.state), entities = structuredClone(options.frame.entities);
    settle(options, aspect);
    const dx = pair[1]![0] - pair[0]![0], dz = pair[1]![2] - pair[0]![2];
    expect(Math.abs(dx * Math.cos(options.orbit.yaw) - dz * Math.sin(options.orbit.yaw))).toBeGreaterThan(Math.min(1.64, Math.hypot(dx, dz) * .84));
    assertFit(options, aspect);
    if (aspect === 1.7777777777777777) expect(Math.hypot(...options.frame.camera.position.map((v, i) => v - options.frame.camera.target[i]!))).toBeCloseTo(10.25);
    expect(options.frame.entities).toEqual(entities);expect(options.state).toEqual(state);
    const before = structuredClone(options.frame.camera);
    presentCombatCamera3D({ ...options, viewportAspect: aspect, reducedMotion: true, events: [{ id: 'hit', frame: 0, kind: 'hit', damage: 40, attackerId: 'fighter:0', targetId: 'fighter:1', moveId: 'heavy', impulse: { x: 1, y: 0, z: 0 } }] });
    expect(options.frame.camera).toEqual(before);
  }
});

test('orbit retains its side through x crossings, limits each move, and settles without oscillation', () => {
  const options = fixture([[0, 1, 0], [.8, 1, 2]]);
  settle(options, 0.4613733905579399);
  const side = Math.sign(options.orbit.yaw);
  for (let index = 0; index < 240; index++) {
    const before = options.orbit.yaw;
    options.frame.entities[1]!.position[0] = .8 - index / 239 * 1.6;
    options.frame.timeSeconds += 0.016666666666666666;
    presentCombatCamera3D({ ...options, viewportAspect: 0.4613733905579399, reducedMotion: true });
    expect(Math.sign(options.orbit.yaw)).toBe(side);
    expect(Math.abs(options.orbit.yaw - before)).toBeLessThanOrEqual(.0250001);
    assertFit(options, 0.4613733905579399);
  }
  settle(options, 0.4613733905579399);
  const stable = options.orbit.yaw;settle(options, 0.4613733905579399);
  expect(options.orbit.yaw).toBe(stable);
  options.frame.entities[1]!.position = [-4, 1, 0];
  settle(options, 0.4613733905579399, 300);
  expect(Math.abs(options.orbit.yaw)).toBeLessThan(.001);
});

test('normal x-separated city framing and original arena remain unchanged', () => {
  const options = fixture([[-2, 1, 0], [2, 1, 0]]);
  settle(options, 1.7777777777777777);expect(options.orbit.yaw).toBe(0);
  const camera = structuredClone(options.frame.camera);
  presentCombatCamera3D({ frame: options.frame, state: options.state, viewportAspect: 1.7777777777777777, reducedMotion: true });
  expect(options.frame.camera).toEqual(camera);
  options.frame.entities[2]!.id = 'tod:arena';options.orbit.yaw = 1;
  settle(options, 1.7777777777777777);
  expect(options.frame.camera.position[0]).toBe(options.frame.camera.target[0]);
});
