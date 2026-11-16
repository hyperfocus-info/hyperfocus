import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { readAppearanceCatalog3D, resolveAppearance3D } from '../appearance/catalog.ts';
import { createCombatRoundRecovery3D } from './round-recovery.ts';
import { presentCombatCamera3D } from './camera.ts';
import { poseContactArm, poseContactLeg } from './contact-pose.ts';

function fixture() {
  const state = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'a', position: { x: 3, y: 1, z: 4 } }, { id: 'b', position: { x: 5, y: .3, z: 4 } }] }).capture();
  state.fighters[1]!.health = 0;
  state.fighters[1]!.facing = { x: 1, y: 0, z: 0 };
  const parts = ['', ':head', ':hair', ':face', ':belt', ...['left', 'right'].flatMap(side => ['hand', 'arm', 'forearm', 'thigh', 'shin', 'boot'].map(part => `:${side}-${part}`)), ...Array.from({ length: 12 }, (_, index) => `:spark:${index}`)];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['a', 'b'].flatMap(id => parts.map((part): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: id + part, position: [id === 'a' ? 3 : 5, id === 'a' ? 1 : .3, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true }))),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  return { frame, state, winnerId: 'a', targets: new Map([['b', { x: 5, y: 1, z: 4 }]]) };
}

test('terminal match emote leaves the fallen fighter alone until recovery and honors the equipped victory gesture', () => {
  const options = fixture(), before = structuredClone(options.state), present = createCombatRoundRecovery3D();
  present({ ...options, ticks: 120, celebrate: true, poses: [{ actorId: 'a', phase: 'victory', style: 'salute' }] });
  expect(options.frame.entities.find(entity => entity.id === 'a:right-hand')!.position[1]).toBeGreaterThan(1.7);
  expect(options.frame.entities.find(entity => entity.id === 'b')!.position).toEqual([5, .3, 4]);
  expect(options.state).toEqual(before);
});

test('ordinary round never celebrates and terminal victory blends continuously from the finishing pose', () => {
  const ordinary = fixture(), base = structuredClone(ordinary.frame);
  createCombatRoundRecovery3D()({ ...ordinary, ticks: 120 });
  expect(ordinary.frame).toEqual(base);
  const options = fixture(), present = createCombatRoundRecovery3D();
  const hand = () => options.frame.entities.find(entity => entity.id === 'a:right-hand')!.position[1];
  const poses = [{ actorId: 'a', phase: 'victory' as const, style: 'salute' as const }];
  present({ ...options, ticks: 180, celebrate: true, allowRecovery: false, poses });expect(hand()).toBe(1);
  present({ ...options, ticks: 179, celebrate: true, allowRecovery: false, poses });expect(hand()).toBeGreaterThan(1);expect(hand()).toBeLessThan(1.01);
  present({ ...options, ticks: 165, celebrate: true, allowRecovery: false, poses });const middle = hand();
  present({ ...options, ticks: 150, celebrate: true, allowRecovery: false, poses });expect(hand()).toBeGreaterThan(middle);
  const complete = structuredClone(options.frame);present({ ...options, ticks: 0, celebrate: true, allowRecovery: false, poses });expect(options.frame).toEqual(complete);
});

test('get-up preserves connected elbows and knees throughout the corpse-to-recovery blend', () => {
  const endpoint = (entity: Hyperfocus3DEvaluatedFrame['entities'][number], sign: number) => {
    const [x, y, z, w] = entity.rotation, half = (entity.scale[1] - entity.scale[0] * .35) * sign;
    return [entity.position[0] + 2 * (x * y - z * w) * half,
      entity.position[1] + (1 - 2 * (x * x + z * z)) * half,
      entity.position[2] + 2 * (y * z + x * w) * half];
  };
  for (const style of ['stand-up', 'roll-up', 'kip-up']) {
    const options = fixture(), present = createCombatRoundRecovery3D();
    for (const side of [-1, 1]) {
      poseContactArm(options.frame, 'b', side, 0, [5 + side * .6, .2, 4.4], [5 + side * .3, .3, 4]);
      poseContactLeg(options.frame, 'b', side, 0, [5 + side * .2, .2, 4.4], [5 + side * .2, .2, 4.8], [5 + side * .16, .3, 4]);
    }
    for (let elapsed = 1; elapsed <= 90; elapsed++) {
      present({ ...options, ticks: 90 - elapsed, styles: [{ actorId: 'b', channel: 'recovery', style }] });
      for (const side of ['left', 'right']) for (const [upper, lower, tip] of [['arm', 'forearm', 'hand'], ['thigh', 'shin', 'boot']]) {
        const part = (name: string) => options.frame.entities.find(entity => entity.id === `b:${side}-${name}`)!;
        for (let axis = 0; axis < 3; axis++) {
          expect(endpoint(part(upper!), 1)[axis]).toBeCloseTo(endpoint(part(lower!), -1)[axis]!, 5);
          expect(endpoint(part(lower!), 1)[axis]).toBeCloseTo(part(tip!).position[axis]!, 5);
        }
      }
    }
  }
});

test('standing winner turns gradually toward the recovered opponent and terminal rounds never turn', () => {
  const options = fixture(), initial = structuredClone(options.frame), before = structuredClone(options.state), present = createCombatRoundRecovery3D();
  const yaw = () => { const [x, y, z, w] = options.frame.entities.find(entity => entity.id === 'a')!.rotation;return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z)); };
  let previous = 0;
  for (let elapsed = 0; elapsed <= 90; elapsed++) {
    present({ ...options, ticks: 90 - elapsed });
    const current = yaw();expect(current - previous).toBeGreaterThanOrEqual(-.00001);expect(current - previous).toBeLessThan(.027);
    previous = current;
  }
  expect(yaw()).toBeCloseTo(Math.PI / 2);expect(options.state).toEqual(before);
  expect(options.frame.entities.find(entity => entity.id === 'a')!.position).toEqual([3, 1, 4]);
  const reconstructed = { ...options, frame: structuredClone(initial) };
  createCombatRoundRecovery3D()({ ...reconstructed, ticks: 0 });expect(reconstructed.frame).toEqual(options.frame);
  const terminal = { ...options, frame: initial };
  createCombatRoundRecovery3D()({ ...terminal, ticks: 0, allowRecovery: false });
  expect(terminal.frame.entities.find(entity => entity.id === 'a')!.rotation).toEqual([0, 0, 0, 1]);
});

test('every recovery style finishes at the supplied standing position and reconstructs without changing combat state', () => {
  const middle: unknown[] = [];
  for (const style of ['stand-up', 'roll-up', 'kip-up', 'materialize']) {
    const options = fixture(), before = structuredClone(options.state), present = createCombatRoundRecovery3D();
    const styles = [{ actorId: 'b', channel: 'recovery' as const, style }];
    present({ ...options, styles, ticks: 45 });middle.push(structuredClone(options.frame.entities.find(entity => entity.id === 'b')));
    if (style === 'kip-up') {
      const body = options.frame.entities.find(entity => entity.id === 'b')!;
      expect(options.frame.entities.find(entity => entity.id === 'b:left-arm')!.position[1]).toBeLessThan(body.position[1] - .2);
    }
    const same = structuredClone(options.frame);present({ ...options, styles, ticks: 45 });expect(options.frame).toEqual(same);
    present({ ...options, styles, ticks: 0 });
    const root = options.frame.entities.find(entity => entity.id === 'b')!;
    expect(root.position).toEqual([5, 1, 4]);expect(root.scale).toEqual([1, 1, 1]);
    expect(2 * (root.rotation[3] * root.rotation[1] + root.rotation[0] * root.rotation[2])).toBeLessThan(-.99);
    expect(options.frame.entities.find(entity => entity.id === 'b:left-boot')!.position[1]).toBeCloseTo(.18);
    expect(options.state).toEqual(before);
  }
  expect(new Set(middle.map(value => JSON.stringify(value))).size).toBe(4);
});

test('recovery wardrobe validates and resolves selected styles without accepting arbitrary animation names', () => {
  const source = { version: 1, actors: [{ entityId: 'a' }], slots: [{ id: 'recovery', label: 'Recovery', defaultOptionId: 'stand', options: [{ id: 'stand', label: 'Stand up', styles: [{ channel: 'recovery', style: 'stand-up' }] }, { id: 'kip', label: 'Kip up', styles: [{ channel: 'recovery', style: 'kip-up' }] }] }] };
  const catalog = readAppearanceCatalog3D(source)!;
  expect(resolveAppearance3D({ catalog, actorId: 'a', selections: { recovery: 'kip' } }).styles).toEqual([{ actorId: 'a', channel: 'recovery', style: 'kip-up' }]);
  source.slots[0]!.options[0]!.styles[0]!.style = 'teleport-anywhere';expect(() => readAppearanceCatalog3D(source)).toThrow();
});

test('reduced motion substitutes a plain get-up and suppresses the cosmetic particle burst', () => {
  const reduced = fixture(), plain = fixture();
  for (const options of [reduced, plain]) for (const entity of options.frame.entities) if (entity.id.includes(':spark:')) entity.visible = false;
  createCombatRoundRecovery3D()({ ...reduced, ticks: 45, reducedMotion: true, styles: [{ actorId: 'b', channel: 'recovery', style: 'kip-up' }] });
  createCombatRoundRecovery3D()({ ...plain, ticks: 45, reducedMotion: true, styles: [{ actorId: 'b', channel: 'recovery', style: 'stand-up' }] });
  expect(reduced.frame).toEqual(plain.frame);
  expect(reduced.frame.entities.filter(entity => entity.id.includes(':spark:') && entity.visible)).toHaveLength(0);
});

test('recovery camera converges to the resumed standing composition on wide and narrow viewports', () => {
  for (const viewportAspect of [1.7777777777777777, .45]) {
    const options = fixture();
    options.frame.entities.push({ id: 'tod:city:street', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true });
    const resumed = structuredClone(options.frame);resumed.entities.find(entity => entity.id === 'b')!.position = [5, 1, 4];
    presentCombatCamera3D({ frame: resumed, state: options.state, viewportAspect, reducedMotion: true });
    createCombatRoundRecovery3D()({ ...options, ticks: 1, viewportAspect });
    const delta = Math.hypot(...options.frame.camera.position.map((value, index) => value - resumed.camera.position[index]!));
    expect(delta).toBeLessThan(.01);
    expect(Math.abs(options.frame.camera.target[1] - resumed.camera.target[1])).toBeLessThan(.001);
  }
});

test('terminal round keeps the defeated fighter down throughout the victory interlude', () => {
  const options = fixture(), present = createCombatRoundRecovery3D();
  const fallen = structuredClone(options.frame.entities.filter(entity => entity.id === 'b' || entity.id.startsWith('b:')));
  for (const ticks of [180, 90, 45, 1, 0]) {
    present({ ...options, ticks, allowRecovery: false });
    expect(options.frame.entities.filter(entity => entity.id === 'b' || entity.id.startsWith('b:'))).toEqual(fallen);
  }
});

test('forced clearance rolls over the full recovery window instead of snapping sideways during pose entry', () => {
  const options = fixture(), present = createCombatRoundRecovery3D();
  options.targets.set('b', { x: 9, y: 1, z: 4 });
  const initial = structuredClone(options.frame), positions: number[] = [], heights: number[] = [];
  for (let elapsed = 0; elapsed <= 90; elapsed++) {
    present({ ...options, ticks: 90 - elapsed });
    positions.push(options.frame.entities.find(entity => entity.id === 'b')!.position[0]);
    heights.push(options.frame.entities.find(entity => entity.id === 'b')!.position[1]);
    if (elapsed >= 17) for (const entity of options.frame.entities) {
      if (!entity.id.startsWith('b:')) continue;
      const radius = entity.id.endsWith(':head') ? .25 : /-(hand|boot)$/.test(entity.id) ? .12 : 0;
      if (radius) expect(entity.position[1] - radius).toBeGreaterThanOrEqual(0.059989999999999995);
    }
  }
  expect(positions[0]).toBe(5);expect(positions[90]).toBe(9);
  expect(positions[16]).toBeLessThan(5.4);
  expect(positions[45]).toBeCloseTo(7);
  for (let frame = 1; frame < positions.length; frame++) {
    expect(positions[frame]! - positions[frame - 1]!).toBeGreaterThanOrEqual(0);
    expect(positions[frame]! - positions[frame - 1]!).toBeLessThan(.075);
    expect(Math.abs(heights[frame]! - heights[frame - 1]!)).toBeLessThan(.11);
  }
  expect(positions[90]! - positions[89]!).toBeLessThan(.002);
  const reconstructed = { ...options, frame: initial };
  createCombatRoundRecovery3D()({ ...reconstructed, ticks: 45 });
  present({ ...options, ticks: 45 });
  expect(reconstructed.frame).toEqual(options.frame);
  expect(options.frame.entities.find(entity => entity.id === 'b')!.rotation[0]).not.toBe(0);
});
