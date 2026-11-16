import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../combat/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../frame/3d.ts';
import { presentCombatDash3D } from './combat-visuals/dash-feedback.ts';
import { presentCombatVisuals3D } from './combat-visuals.ts';
import { poseCombatLimb } from './combat-visuals/effects.ts';
import { presentCombatEffects3D } from './combat-visuals/effects.ts';
import { presentCombatCamera3D, presentCombatTitleCamera3D } from './combat-visuals/camera.ts';
import { readableGuardYaw } from './combat-visuals/guard-fractures.ts';
test('shield presentation retains a visible face from side cameras without turning its fighter', () => {
  for (const yaw of [Math.PI / 2, -Math.PI / 2, Math.PI / 2 + .1, Math.PI / 2 - .1]) {
    const presented = readableGuardYaw(yaw, [0, 3, 10], [0, 1, 0]);
    expect(Math.abs(Math.cos(presented))).toBeGreaterThanOrEqual(.499);
    expect(Math.abs(presented - yaw)).toBeLessThanOrEqual(Math.PI / 6 + .001);
  }
  expect(readableGuardYaw(0, [0, 3, 10], [0, 1, 0])).toBe(0);
});

test('back heavy extends the boot to its contact while both hands remain in guard', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  const move = options.config.moves.find(move => move.id === 'heavy-away')!;
  fighter.moveId = move.id; fighter.moveFrame = move.startupFrames; fighter.facing = { x: 0, y: 0, z: 1 };
  presentCombatVisuals3D(options);
  const root = options.frame.entities.find(entity => entity.id === 'fighter')!;
  const boot = options.frame.entities.find(entity => entity.id === 'fighter:right-boot')!;
  expect(boot.position[2] - root.position[2]).toBeCloseTo(move.reach);
  expect(boot.position[1] - root.position[1]).toBeCloseTo(0);
  for (const side of ['left', 'right']) expect(options.frame.entities.find(entity => entity.id === `fighter:${side}-hand`)!.position[2] - root.position[2]).toBeLessThan(.4);
});

test('impact shake quadruples its former amplitude without changing the dolly or bloom curve', () => {
  for (const damage of [8, 24]) {
    const options = setup();options.state.frame = 6;
    presentCombatCamera3D(options);
    const base = structuredClone(options.frame.camera);
    const impulse = (damage >= 18 ? .085 : .018) * 0.8402777777777777;
    presentCombatCamera3D({ ...options, events: [{ id: 'hit', frame: 5, moveId: 'jab', attackerId: 'other', targetId: 'fighter', kind: 'hit', damage, impulse: { x: 0, y: 0, z: 0 } }] });
    expect(options.frame.camera.position[0] - base.position[0]).toBeCloseTo(Math.sin(2.7) * impulse * 8, 10);
    expect(options.frame.camera.position[1] - base.position[1]).toBeCloseTo(impulse * 4 * Math.sin(.42) + Math.cos(3.9) * impulse * 3.2, 10);
    expect(options.frame.camera.position[2] - base.position[2]).toBeCloseTo(impulse * 4 * Math.cos(.42), 10);
    expect(options.frame.renderGraph.bloom?.strength).toBeCloseTo(.22 + impulse * 1.5, 10);
  }
});

function setup() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'fighter', position: { x: 4, y: 2, z: 3 } }] }).capture();
  const ids = ['fighter', 'fighter:left-hand', 'fighter:right-hand', 'fighter:guard-shell', 'fighter:impact', 'fighter:armor', 'fighter:guard-meter',
    'fighter:left-boot', 'fighter:right-boot', 'fighter:left-thigh', 'fighter:right-thigh', 'fighter:left-shin', 'fighter:right-shin', 'fighter:left-arm', 'fighter:right-arm',
    'fighter:shadow', 'fighter:head', 'fighter:hair', 'fighter:face', 'fighter:spark:0', 'fighter:trail:0', 'tod:arena', 'ordinary-model'];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ids.map(id => ({ id, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const entity = (suffix: string) => frame.entities.find(item => item.id === `fighter${suffix}`)!;
  entity('').position = [4, 2, 3];
  return { config, state, frame, entity };
}

test('fatigue posture blends continuously with stamina and leaves attacks and guard clear', () => {
  const options = setup(), fighter = options.state.fighters[0]!, original = structuredClone(options.frame);
  const sample = (fraction: number) => {
    fighter.stamina = (options.config.maxStamina ?? 100) * fraction;
    const frame = structuredClone(original);presentCombatVisuals3D({ ...options, frame, grounded: new Set(['fighter']), reducedMotion: true });return frame;
  };
  const fresh = sample(1), tired = sample(0);
  const part = (frame: typeof fresh, id: string) => frame.entities.find(entity => entity.id === `fighter:${id}`)!;
  expect(part(tired, 'right-hand').position[1]).toBeLessThan(part(fresh, 'right-hand').position[1] - .35);
  expect(Math.hypot(part(tired, 'head').position[0] - part(fresh, 'head').position[0], part(tired, 'head').position[2] - part(fresh, 'head').position[2])).toBeGreaterThan(.25);
  let previous = sample(.5);
  for (let i = 49; i >= 0; i--) {
    const current = sample(i / 100);
    expect(Math.abs(part(current, 'right-hand').position[1] - part(previous, 'right-hand').position[1])).toBeLessThan(.014);
    previous = current;
  }
  fighter.guarding = true;expect(sample(0).entities).toEqual(sample(1).entities);
  fighter.guarding = false;fighter.moveId = options.config.moves[0]!.id;fighter.moveFrame = 1;
  expect(sample(0).entities).toEqual(sample(1).entities);
});

test('rising knee presents its knee at the real contact while folding the boot underneath', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  const move = options.config.moves.find(move => move.pose === 'rising-knee')!;
  fighter.moveId = move.id;fighter.moveFrame = move.startupFrames;
  presentCombatVisuals3D(options);
  const root = options.entity(''), thigh = options.entity(':right-thigh'), boot = options.entity(':right-boot');
  const hip = [root.position[0] + .16 * fighter.facing.z, root.position[1] - .26, root.position[2] - .16 * fighter.facing.x];
  const knee = thigh.position.map((value, index) => value * 2 - hip[index]!);
  expect(knee[0]).toBeCloseTo(root.position[0] + fighter.facing.x * move.reach);
  expect(knee[1]).toBeCloseTo(root.position[1] + fighter.facing.y * move.reach);
  expect(knee[2]).toBeCloseTo(root.position[2] + fighter.facing.z * move.reach);
  expect(boot.position[1]).toBeLessThan(knee[1]! - .3);
});

test('travel lean follows world velocity and free look turns the pose without changing combat state', () => {
  const options = setup();options.state.fighters[0]!.facing = { x: 0, y: 0, z: 1 };const before = structuredClone(options.state);
  const velocities = new Map([['fighter', { x: 12, y: 0, z: 0 }]]);
  const grounded = new Set(['fighter']);
  presentCombatVisuals3D({ ...options, velocities, grounded, motion: [{ id: 'fighter', locked: true, dash: 1 }] });
  const head = [...options.entity(':head').position], feet = [options.entity(':left-boot').position, options.entity(':right-boot').position];
  presentCombatVisuals3D({ ...options, velocities, grounded, motion: [{ id: 'fighter', locked: true }] });
  expect(options.entity(':head').position[0]).toBeGreaterThan(head[0]! + .1);
  expect([options.entity(':left-boot').position, options.entity(':right-boot').position]).toEqual(feet);
  const lockedRotation = [...options.entity('').rotation];
  presentCombatVisuals3D({ ...options, velocities, grounded, motion: [{ id: 'fighter', locked: false }] });
  expect(options.entity('').rotation).not.toEqual(lockedRotation);
  expect(options.state).toEqual(before);
});

test('moving-city camera follows fighters on street and roof after replacing the old arena', () => {
  const options = setup();options.frame.entities.find(entity => entity.id === 'tod:arena')!.id = 'tod:city:street';
  for (const position of [[4, 1, 8], [-3, 7, -5]] as const) {
    options.entity('').position = [...position];
    presentCombatCamera3D({ ...options, viewportAspect: 0.46208530805687204 });
    expect(options.frame.camera.target).toEqual([position[0], position[1] - .10, position[2]]);
    expect(options.frame.camera.position[1]).toBeGreaterThan(position[1]);
    expect(options.frame.camera.position[2]).toBeGreaterThan(position[2]);
  }
});

test('title composition shifts the city beside desktop controls and restores a centered narrow fit without moving fighters', () => {
  const options = setup();options.frame.entities.find(entity => entity.id === 'tod:arena')!.id = 'tod:city:street';
  const entities = structuredClone(options.frame.entities), state = structuredClone(options.state);
  presentCombatCamera3D({ ...options, viewportAspect: 1.7777777777777777 });
  const center = options.frame.camera.target[0];
  presentCombatTitleCamera3D({ ...options, viewportAspect: 1.7777777777777777 });
  expect(options.frame.camera.target[0]).toBeLessThan(center);
  const title = structuredClone(options.frame.camera);
  presentCombatTitleCamera3D({ ...options, viewportAspect: 1.7777777777777777 });
  expect(options.frame.camera).toEqual(title);
  presentCombatTitleCamera3D({ ...options, viewportAspect: 0.46208530805687204 });
  expect(options.frame.camera.target[0]).toBe(center);
  expect(options.frame.entities).toEqual(entities);expect(options.state).toEqual(state);
});

test('exhausted neutral visibly drops the hands and leans forward without moving contact or feet', () => {
  const options = { ...setup(), grounded: new Set(['fighter']) }, fighter = options.state.fighters[0]!;
  presentCombatVisuals3D(options);const readyHand = options.entity(':left-hand').position[1], readyHead = [...options.entity(':head').position];
  fighter.stamina = 0;presentCombatVisuals3D(options);
  expect(options.entity(':left-hand').position[1]).toBeLessThan(readyHand - .3);
  expect(Math.hypot(options.entity(':head').position[0] - readyHead[0]!, options.entity(':head').position[2] - readyHead[2]!)).toBeGreaterThan(.1);
  fighter.guarding = true;presentCombatVisuals3D(options);expect(options.entity(':left-hand').position[1]).toBeGreaterThan(readyHand);
});

test('guard, break recovery and spent escape read directly from replayable state', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  fighter.guarding = true;
  presentCombatVisuals3D(options);
  expect(options.entity(':guard-shell').visible).toBe(true);
  expect(options.entity(':armor').visible).toBe(false);
  expect(options.entity(':guard-shell').position[0]).toBeCloseTo(4.7);
  fighter.guardBrokenFrames = 300; fighter.escapeCharges = 0;
  presentCombatVisuals3D(options);
  expect(options.entity(':guard-shell').visible).toBe(false);
  expect(options.entity(':armor').visible).toBe(false);
  expect(options.entity(':guard-meter').visible).toBe(false);
});

test('presentation is repeatable and does not change combat or unrelated scene entities', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  fighter.moveId = options.config.moves[0]!.id; fighter.moveFrame = options.config.moves[0]!.startupFrames;
  const before = structuredClone(options.state), other = structuredClone(options.frame.entities.at(-1));
  presentCombatVisuals3D(options);
  const once = structuredClone(options.frame);
  presentCombatVisuals3D(options);
  expect(options.frame).toEqual(once);
  expect(options.state).toEqual(before);
  expect(options.frame.entities.at(-1)).toEqual(other);
  expect(options.entity(':right-hand').position[0]).toBeGreaterThan(4.5);
  expect(options.entity(':impact').visible).toBe(false);
});

test('grounded articulated gait keeps boot soles above the collision support plane', () => {
  const options = setup();
  options.entity('').position[1] = .98;
  const velocities = new Map([['fighter', { x: 8, y: 0, z: 0 }]]);
  const poses: number[] = [];
  for (let tick = 0; tick < 30; tick++) {
    options.state.frame = tick;
    presentCombatVisuals3D({ ...options, velocities });
    for (const suffix of [':left-boot', ':right-boot']) {
      const boot = options.entity(suffix);
      expect(boot.position[1] - boot.scale[1]).toBeGreaterThanOrEqual(-.00001);
    }
    for (const suffix of [':left-arm', ':left-thigh', ':left-shin']) expect(Math.hypot(...options.entity(suffix).rotation)).toBeCloseTo(1);
    poses.push(options.entity(':left-boot').position[0]);
  }
  expect(Math.max(...poses) - Math.min(...poses)).toBeGreaterThan(.5);
  expect(options.entity(':trail:0').visible).toBe(true);
});

test('attack recovery retracts the striking hand instead of snapping immediately to idle', () => {
  const options = setup(), fighter = options.state.fighters[0]!, move = options.config.moves[0]!;
  fighter.moveId = move.id;
  const reaches: number[] = [];
  for (const recovery of [0, Math.floor(move.recoveryFrames / 2), move.recoveryFrames]) {
    fighter.moveFrame = move.startupFrames + move.activeFrames + recovery;
    presentCombatVisuals3D(options);
    reaches.push(options.entity(':right-hand').position[0]);
  }
  expect(reaches[0]!).toBeGreaterThan(reaches[1]!);
  expect(reaches[1]!).toBeGreaterThan(reaches[2]!);
});

test('contact particles and camera impulse are bounded, replayable and expire', () => {
  const options = setup();
  const events = [{ id: 'contact', frame: 10, moveId: 'jab', attackerId: 'other', targetId: 'fighter', kind: 'hit' as const, damage: 20, impulse: { x: 4, y: 0, z: 0 } }];
  options.state.frame = 11;
  presentCombatVisuals3D({ ...options, events });
  expect(options.entity(':spark:0').visible).toBe(true);
  const impact = structuredClone(options.frame);
  presentCombatVisuals3D({ ...options, events });
  expect(options.frame).toEqual(impact);
  options.state.frame = 29;
  presentCombatVisuals3D({ ...options, events });
  expect(options.entity(':spark:0').visible).toBe(false);
  expect(options.frame.camera.position).not.toEqual(impact.camera.position);
  const settled = structuredClone(options.frame.camera);
  options.state.frame = 90;
  presentCombatVisuals3D({ ...options, events });
  expect(options.frame.camera).toEqual(settled);
});

test('radius-one primitive bounds match limb endpoints and humanoid proportions', () => {
  const options = setup();
  const limb = options.entity(':left-arm');
  poseCombatLimb(limb, [0, 0, 0], [0, 1, 0], .2);
  expect(limb.position[1] - limb.scale[1]).toBeCloseTo(-.035);
  expect(limb.position[1] + limb.scale[1]).toBeCloseTo(1.035);
  expect(limb.scale[0] * 2).toBeCloseTo(.2);
  presentCombatVisuals3D(options);
  expect(options.entity(':head').scale).toEqual([.24, .27, .225]);
  expect(options.entity(':left-hand').scale).toEqual([.145, .145, .145]);
  const head = options.entity(':head'), hair = options.entity(':hair');
  expect(hair.position[1] + hair.scale[1]).toBeGreaterThan(head.position[1] + head.scale[1]);
  expect(hair.scale[0]).toBeGreaterThan(head.scale[0]);
});

test('heavy anticipation widens the planted stance and visibly draws back the striking hand', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  options.entity('').position[1] = .98;
  const move = options.config.moves.find(move => move.id === 'heavy')!;
  presentCombatVisuals3D(options);
  const idleHand = options.entity(':right-hand').position[0];
  const idleStance = Math.abs(options.entity(':left-boot').position[2] - options.entity(':right-boot').position[2]);
  fighter.moveId = move.id; fighter.moveFrame = Math.floor(move.startupFrames * .7);
  presentCombatVisuals3D(options);
  expect(idleHand - options.entity(':right-hand').position[0]).toBeGreaterThan(.8);
  expect(Math.abs(options.entity(':left-boot').position[2] - options.entity(':right-boot').position[2])).toBeGreaterThan(idleStance + .2);
  expect(options.entity(':left-boot').position[1] - options.entity(':left-boot').scale[1]).toBeCloseTo(0);
  const pose = structuredClone(options.frame);
  presentCombatVisuals3D(options);
  expect(options.frame).toEqual(pose);
  expect(options.entity(':shadow').position[1]).toBe(-.012);
  expect(options.entity(':impact').scale[0]).toBeLessThanOrEqual(.12);
});

test('optional forearms bend at the elbow and preserve the collision-aligned hand endpoint', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  for (const side of ['left', 'right']) options.frame.entities.push({ id: `fighter:${side}-forearm`, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true });
  const move = { ...options.config.moves.find(move => move.id === 'heavy')!, id: 'generic-side-test', direction: 'side' as const };
  options.config.moves.push(move);
  fighter.moveId = move.id; fighter.moveFrame = move.startupFrames; fighter.attackSide = 1;
  presentCombatVisuals3D(options);
  const hand = options.entity(':right-hand'), root = options.entity('');
  expect(hand.position[0]).toBeCloseTo(root.position[0] + fighter.facing.x * move.reach);
  expect(hand.position[1]).toBeCloseTo(root.position[1] + fighter.facing.y * move.reach);
  expect(hand.position[2]).toBeCloseTo(root.position[2] + fighter.facing.z * move.reach);
  expect(options.entity(':right-arm').position).not.toEqual(options.entity(':right-forearm').position);
  expect(Math.hypot(...options.entity(':right-forearm').rotation)).toBeCloseTo(1);
});

test('contact streaks travel with impulse, stay anchored after separation and preserve physical state', () => {
  const options = setup();
  for (let index = 1; index < 12; index++) options.frame.entities.push({ ...structuredClone(options.entity(':spark:0')), id: `fighter:spark:${index}` });
  const events = [{ id: 'launch-contact', frame: 10, moveId: 'heavy', attackerId: 'other', targetId: 'fighter', kind: 'hit' as const, damage: 20, contactPoint: { x: 2, y: 3, z: 4 }, impulse: { x: 0, y: 8, z: 0 } }];
  options.state.frame = 13;
  const state = structuredClone(options.state);
  presentCombatEffects3D({ ...options, events });
  const sparks = options.frame.entities.filter(entity => entity.id.includes(':spark:'));
  for (const spark of sparks) {
    expect(spark.visible).toBe(true);expect(spark.position[1]).toBeGreaterThan(3);
    expect(spark.scale[1]).toBeGreaterThan(spark.scale[0] * 3);
    expect(Math.hypot(...spark.rotation)).toBeCloseTo(1, 8);
  }
  const anchored = structuredClone(sparks);
  options.entity('').position = [30, 20, 10];presentCombatEffects3D({ ...options, events });
  expect(sparks).toEqual(anchored);expect(options.state).toEqual(state);
  presentCombatEffects3D({ ...options, events, reducedMotion: true });
  expect(sparks.filter(spark => spark.visible)).toHaveLength(4);
  options.state.frame = 28;presentCombatEffects3D({ ...options, events });
  expect(sparks.every(spark => !spark.visible)).toBe(true);
});

test('camera fits wide and elevated opponents on portrait and landscape viewports', () => {
  for (const arena of ['tod:arena', 'tod:city:street']) for (const aspect of [.5, 1.7777777777777777]) {
    const options = setup();
    options.frame.entities.find(entity => entity.id === 'tod:arena')!.id = arena;
    options.state.fighters.push({ ...structuredClone(options.state.fighters[0]!), id: 'opponent' });
    options.frame.entities.push({ id: 'opponent', position: [-13, 12, -8], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true });
    options.entity('').position = [13, 1, 8];
    presentCombatCamera3D({ ...options, viewportAspect: aspect });
    const camera = options.frame.camera, tangent = Math.tan(camera.fovYRadians / 2);
    const dy = camera.position[1] - camera.target[1], dz = camera.position[2] - camera.target[2], length = Math.hypot(dy, dz);
    for (const root of options.frame.entities.filter(entity => entity.id === 'fighter' || entity.id === 'opponent')) {
      const y = root.position[1] - camera.target[1], z = root.position[2] - camera.target[2];
      const depth = length - (y * dy + z * dz) / length;
      expect((Math.abs(root.position[0] - camera.target[0]) + 1.35) / (depth * tangent * aspect)).toBeLessThanOrEqual(.81);
      expect((Math.abs((y * dz - z * dy) / length) + 2.15) / (depth * tangent)).toBeLessThanOrEqual(.81);
    }
    const far = length;
    options.entity('').position = [1, 1, 0];
    options.frame.entities.find(entity => entity.id === 'opponent')!.position = [-1, 1, 0];
    presentCombatCamera3D({ ...options, viewportAspect: aspect });
    expect(Math.hypot(camera.position[1] - camera.target[1], camera.position[2] - camera.target[2])).toBeLessThan(far);
  }
});

test('city framing retains floor clusters near each district start without shrinking fighters', () => {
  const cases: Array<{ pair: [[number, number, number], [number, number, number]]; cluster: [number, number, number] }> = [
    { pair: [[-2, 1, 8], [2, 1, 8]], cluster: [-1.1, .15, 10] },
    { pair: [[-52, 1, -18], [-48, 1, -18]], cluster: [-51.1, .15, -14] },
    { pair: [[48, 1, 18], [52, 1, 18]], cluster: [48.9, .15, 22] },
    { pair: [[-2, 1, 42], [2, 1, 42]], cluster: [-1.1, .15, 46] },
    { pair: [[-2, 1, -42], [2, 1, -42]], cluster: [-1.1, .15, -38] },
    { pair: [[-55, 7, -22], [-50, 7, -22]], cluster: [-53.6, 6.15, -20] },
  ];
  for (const fixture of cases) for (const aspect of [0.4613733905579399, 1.7777777777777777]) {
    const options = setup();options.frame.entities.find(entity => entity.id === 'tod:arena')!.id = 'tod:city:street';
    options.state.fighters.push({ ...structuredClone(options.state.fighters[0]!), id: 'opponent' });
    options.entity('').position = [...fixture.pair[0]];
    options.frame.entities.push({ id: 'opponent', position: [...fixture.pair[1]], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true });
    presentCombatCamera3D({ ...options, viewportAspect: aspect, reducedMotion: true });
    const camera = options.frame.camera, tangent = Math.tan(camera.fovYRadians / 2);
    const dy = camera.position[1] - camera.target[1], dz = camera.position[2] - camera.target[2], distance = Math.hypot(dy, dz);
    // Owner selected the current close composition on 2026-10-26. Preserve its
    // explicit floor independently of the presenter; portrait and cluster/body
    // projection protections below still require the actual geometric fit.
    expect(distance).toBeGreaterThanOrEqual(10.2499999999);
    if (aspect === 1.7777777777777777) expect(distance).toBeCloseTo(10.25, 10);
    const project = (point: readonly number[]) => {
      const y = point[1]! - camera.target[1], z = point[2]! - camera.target[2], depth = distance - (y * dy + z * dz) / distance;
      return [(point[0]! - camera.target[0]) / (depth * tangent * aspect), (y * dz - z * dy) / (distance * depth * tangent)];
    };
    for (const point of fixture.pair) for (const offset of [-1, 2.15]) {
      const projected = project([point[0]!, point[1]! + offset, point[2]!]);
      expect(Math.abs(projected[0]!)).toBeLessThan(.81);expect(Math.abs(projected[1]!)).toBeLessThan(.81);
    }
    const pickup = project(fixture.cluster);
    expect(Math.abs(pickup[0]!)).toBeLessThan(.9);expect(Math.abs(pickup[1]!)).toBeLessThan(.9);
    // The original arena still centers its presentation at the old height.
    options.frame.entities.find(entity => entity.id === 'tod:city:street')!.id = 'tod:arena';
    presentCombatCamera3D({ ...options, viewportAspect: aspect, reducedMotion: true });
    expect(camera.target[1]).toBeCloseTo(fixture.pair[0]![1]! + .55);
  }
});

test('reduced motion removes impact zoom and shake while retaining stable postprocessing', () => {
  const options = setup(); options.state.frame = 5;
  presentCombatCamera3D({ ...options, reducedMotion: true });
  const baseline = structuredClone(options.frame.camera), graph = structuredClone(options.frame.renderGraph);
  presentCombatCamera3D({ ...options, reducedMotion: true, events: [{ id: 'counter', frame: 5, moveId: 'heavy', attackerId: 'other', targetId: 'fighter', kind: 'hit', counter: true, damage: 40, impulse: { x: 1, y: 0, z: 0 } }] });
  expect(options.frame.camera).toEqual(baseline);
  expect(options.frame.renderGraph).toEqual(graph);
  expect(graph.bloom?.strength).toBeGreaterThan(0);
});

test('grounded fighters keep their feet planted on elevated moving supports', () => {
  const options = setup(); options.entity('').position[1] = 4;
  presentCombatVisuals3D({ ...options, grounded: new Set(['fighter']) });
  expect(options.entity(':left-boot').position[1] - options.entity(':left-boot').scale[1]).toBeCloseTo(3.02);
  expect(options.entity(':shadow').position[1]).toBeCloseTo(3.008);
});

test('guard is a forward disc and block recoil stays much smaller than an unguarded hit', () => {
  const options = setup(), fighter = options.state.fighters[0]!;
  fighter.guarding = true;fighter.stunFrames = 12;fighter.stunKind = 'block';
  presentCombatVisuals3D(options);
  const blocked = Math.abs(options.entity('').rotation[0]);
  expect(options.entity(':guard-shell').scale[2]).toBeLessThan(.1);
  fighter.stunKind = 'hit';presentCombatVisuals3D(options);
  expect(Math.abs(options.entity('').rotation[0])).toBeGreaterThan(blocked * 3);
  expect(options.entity(':guard-shell').visible).toBe(false);
  fighter.stunKind = '';fighter.armorFrames = 12;presentCombatVisuals3D(options);
  expect(options.entity(':guard-shell').scale[2]).toBeGreaterThan(.5);
});


test('air dash presentation leans toward travel, distinguishes spent/rearm, and cannot hide hit or block recoil', () => {
  const options=setup(); const cue={id:'fighter',dashCue:10,dashCueKind:1,dx:1,dz:0};
  presentCombatVisuals3D(options); const before=structuredClone(options.frame);
  presentCombatDash3D({...options,motion:[cue]});
  const head=options.frame.entities.find(e=>e.id==='fighter:head')!;
  expect(head.position[0]).toBeGreaterThan(before.entities.find(e=>e.id===head.id)!.position[0]);
  const accepted=structuredClone(options.frame.entities.find(e=>e.id==='fighter:trail:0')!);
  options.frame=structuredClone(before);presentCombatDash3D({...options,motion:[{...cue,dashCueKind:2}]});
  const spent=structuredClone(options.frame.entities.find(e=>e.id==='fighter:trail:0')!);
  expect(spent.scale).not.toEqual(accepted.scale);
  options.frame=structuredClone(before);presentCombatDash3D({...options,motion:[{...cue,dashCueKind:3}]});
  expect(options.frame.entities.find(e=>e.id==='fighter:trail:0')!.position[1]).toBeLessThan(spent.position[1]);
  for(const kind of ['hit','block'] as const) {
    options.frame=structuredClone(before);Object.assign(options.state.fighters[0]!,{stunFrames:10,stunKind:kind});
    presentCombatDash3D({...options,motion:[cue]});expect(options.frame).toEqual(before);
  }
});


test('Drive trails follow the authored swing and protected tech exit points opposite travel without changing combat', () => {
  const options=setup(),fighter=options.state.fighters[0]!;
  fighter.moveId='drive-heavy';const move=options.config.moves.find(m=>m.id===fighter.moveId)!;fighter.moveFrame=move.startupFrames;
  const state=structuredClone(options.state);presentCombatVisuals3D(options);
  expect(options.entity(':trail:0').visible).toBe(true);expect(options.state).toEqual(state);
  fighter.moveFrame=move.startupFrames+move.activeFrames+move.recoveryFrames-1;presentCombatVisuals3D(options);expect(options.entity(':trail:0').visible).toBe(false);
  fighter.moveId='';fighter.protectionFrames=8;fighter.techDirection={x:1,y:0,z:0};presentCombatVisuals3D(options);
  const trail=options.entity(':trail:0');expect(trail.visible).toBe(true);expect(trail.position[0]).toBeLessThan(options.entity('').position[0]);
  fighter.protectionFrames=0;presentCombatVisuals3D(options);expect(trail.visible).toBe(false);
});


test('landing recovery crouches visibly but never overrides an immediate shield pose', () => {
  const options=setup(),fighter=options.state.fighters[0]!;presentCombatVisuals3D(options);const upright=options.entity('').scale[1];
  fighter.landingFrames=5;presentCombatVisuals3D(options);expect(options.entity('').scale[1]).toBeLessThan(upright);
  fighter.guarding=true;presentCombatVisuals3D(options);expect(options.entity('').scale[1]).toBe(upright);expect(options.entity(':guard-shell').visible).toBe(true);
});


test('tech ready chevrons wait for protection and lockout, then expire without a new event', () => {
  const options=setup(),fighter=options.state.fighters[0]!;options.state.frame=options.config.techProtectionFrames??8;
  const events=[{id:'tech',frame:0,attackerId:'fighter',targetId:'fighter',moveId:'',kind:'tech' as const,damage:0,impulse:{x:0,y:0,z:0}}];
  fighter.techLockoutFrames=1;presentCombatVisuals3D({...options,events});expect(options.entity(':trail:0').visible).toBe(false);
  fighter.techLockoutFrames=0;presentCombatVisuals3D({...options,events});expect(options.entity(':trail:0').visible).toBe(true);
  options.state.frame+=6;presentCombatVisuals3D({...options,events});expect(options.entity(':trail:0').visible).toBe(false);
});

test('wall traversal has visible run contact and jump takeoff without mutating combat', () => {
  const options = setup(); presentCombatVisuals3D(options);
  const state = structuredClone(options.state), before = structuredClone(options.frame);
  presentCombatDash3D({ ...options, motion: [{ id: 'fighter', dashCue: 0, dashCueKind: 0, dx: 1, dz: 0, wallRunning: true }] });
  expect(options.frame.entities.find(e => e.id === 'fighter:head')!.position[0]).toBeGreaterThan(before.entities.find(e => e.id === 'fighter:head')!.position[0]);
  expect(options.frame.entities.find(e => e.id === 'fighter:trail:0')!.visible).toBe(true);
  options.frame = structuredClone(before);
  presentCombatDash3D({ ...options, motion: [{ id: 'fighter', dashCue: 12, dashCueKind: 5, dx: 1, dz: 0 }] });
  expect(options.frame.entities.find(e => e.id === 'fighter:trail:0')!.visible).toBe(true);
  expect(options.state).toEqual(state);
});
