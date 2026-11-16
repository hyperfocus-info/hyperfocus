import { beforeAll, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createRigidWorld3D, type RigidBodyDefinition3D, type RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatObstaclePlanner } from './obstacle-route.ts';
import type { HazardRouteRegion } from './hazards/routes.ts';
import { isRecord } from '@hyperfocus/utilities/records';

let original: Awaited<ReturnType<typeof bundle>>;
let candidate: Awaited<ReturnType<typeof bundle>>['createCombatObstaclePlanner'] = createCombatObstaclePlanner;
beforeAll(async () => {
  // The immutable 2026-09-29 control preserves body order, cache keys and all
  // arithmetic. Override its real source path so relative dependencies resolve
  // normally; the text fixture needs no .local experiment files or public API.
  const frozenSource: unknown = JSON.parse(await Bun.file(new URL('./test-fixtures/obstacle-route-original.json', import.meta.url)).text());
  if (typeof frozenSource !== 'string') throw new Error('Frozen control must contain source text');
  const source = frozenSource.replace(/\r\n/g, '\n');
  // .gitattributes normalizes text to LF; verify canonical source across checkouts.
  expect(new Bun.CryptoHasher('sha256').update(source).digest('hex')).toBe('9b517c9a70e9b7f865228afb6d3feeed29516a5cebe6067244af18690bd0f15b');
  original = await bundle(source);
  // Local A/B evidence can exercise a frozen intermediate without changing
  // either production code or the immutable control. Ordinary CI uses current.
  if (process.env.TOD_ROUTE_PARITY_SOURCE) candidate = (await bundle(await Bun.file(process.env.TOD_ROUTE_PARITY_SOURCE).text())).createCombatObstaclePlanner;
});

async function bundle(source: string) {
  const build = await Bun.build({ entrypoints: [fileURLToPath(new URL('./obstacle-route.ts', import.meta.url))], target: 'bun', format: 'esm',
    plugins: [{ name: 'immutable-route-control', setup(builder) {
      builder.onLoad({ filter: /[\\/]obstacle-route\.ts$/ }, () => ({ contents: source, loader: 'ts' }));
    } }] });
  if (!build.success) throw Error(build.logs.join('\n'));
  const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(await build.outputs[0]!.text()).toString('base64')}`);
  if (!isRecord(loaded) || typeof loaded.createCombatObstaclePlanner !== 'function') throw Error('Missing frozen obstacle planner export');
  const createPlanner = loaded.createCombatObstaclePlanner;
  return { createCombatObstaclePlanner(options: Parameters<typeof createCombatObstaclePlanner>[0]) {
    const plan: unknown = createPlanner(options);
    if (typeof plan !== 'function') throw Error('Frozen obstacle planner must be callable');
    return (...args: Parameters<ReturnType<typeof createCombatObstaclePlanner>>) => {
      const result: unknown = plan(...args);
      if (result === undefined) return undefined;
      if (!isRecord(result) || typeof result.distance !== 'number') throw Error('Invalid frozen route distance');
      const direction = result.direction;
      if (direction === undefined) return { distance: result.distance, direction: undefined };
      if (!isRecord(direction) || typeof direction.x !== 'number' || typeof direction.y !== 'number' || typeof direction.z !== 'number') throw Error('Invalid frozen route direction');
      return { distance: result.distance, direction: { x: direction.x, y: direction.y, z: direction.z } };
    };
  } };
}

type Point = { x: number; y: number; z: number };
function exact(actual: unknown, expected: unknown, label: string) {
  expect(actual === undefined, label).toBe(expected === undefined);
  if (!actual || !expected) return;
  if (!isRecord(actual) || !isRecord(expected) || typeof actual.distance !== 'number' || typeof expected.distance !== 'number') throw Error(`Invalid route comparison: ${label}`);
  expect(Object.is(actual.distance, expected.distance), `${label}: distance`).toBe(true);
  expect(actual.direction === undefined, `${label}: direction`).toBe(expected.direction === undefined);
  if (actual.direction && expected.direction) for (const axis of ['x', 'y', 'z'] as const) {
    if (!isRecord(actual.direction) || !isRecord(expected.direction) || typeof actual.direction[axis] !== 'number' || typeof expected.direction[axis] !== 'number') throw Error(`Invalid route direction: ${label}/${axis}`);
    expect(Object.is(actual.direction[axis], expected.direction[axis]), `${label}: ${axis}`).toBe(true);
  }
}

function fixture(extra: RigidBodyDefinition3D[] = []) {
  const world = createRigidWorld3D({ capacity: 128, gravityY: 0 });
  world.addBody({ id: 'a', shape: { kind: 'sphere', radius: .5 }, x: -5, y: 1, z: 0 });
  world.addBody({ id: 'b', shape: { kind: 'sphere', radius: .5 }, x: 5, y: 1, z: 0 });
  const ids = ['a', 'b'];
  for (const definition of extra) { world.addBody(definition);ids.push(definition.id); }
  let hazards: HazardRouteRegion[] = [];
  const options = { world, bodyIds: ids, hazards: () => hazards };
  const control = original.createCombatObstaclePlanner(options), current = candidate(options);
  const check = (label: string, destination?: Point, ignored?: string) => {
    // Compare fresh and repeated cached routes plus the direct-segment gate.
    // Calling either planner must never change the actual world's state.
    const before = world.checkpoint();
    for (const directOnly of [false, true, false]) {
      exact(current('a', 'b', destination, ignored, directOnly), control('a', 'b', destination, ignored, directOnly), `${label}/${directOnly}`);
    }
    expect(world.checkpoint(), `${label}: pure planning`).toEqual(before);
  };
  return { world, ids, current, check, hazards: (regions: HazardRouteRegion[]) => { hazards = regions; } };
}

function replace(world: RigidWorld3D, definition: RigidBodyDefinition3D) {
  world.removeBody(definition.id);world.addBody(definition);
}

test('route parity includes rotated, thin and far-centered oversized solids and stable corner choices', () => {
  const f = fixture([{ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .05, halfY: 3, halfZ: 2 }, y: 1 },
    { id: 'remote', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 3, halfZ: 1 }, x: 80, y: 1, z: 60 }]);
  f.check('thin wall');expect(f.current('a', 'b')!.direction).toBeDefined();
  for (const rotation of [[0, .38, 0, .92], [.2, .3, -.15, .8], [.5, -.5, .5, .5]]) {
    f.world.setRotation('wall', rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!);f.check(`rotation ${rotation}`);
  }
  replace(f.world, { id: 'wall', type: 'static', shape: { kind: 'box', halfX: 70, halfY: 3, halfZ: .1 }, x: 65, y: 1, z: 0 });
  f.check('oversized far center crossing route');
  replace(f.world, { id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 3, halfZ: 1 }, y: 1 });
  f.world.setPosition('a', 1, 1, 1.8);f.check('expanded corner x + .001', { x: 1.001, y: 1, z: 1.8 });
  f.check('corner back to target');
});

test('route parity includes inside, outward overlap, grazing and zero-length segments', () => {
  const f = fixture([{ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: 1 }, y: 1 }]);
  for (const [label, start, destination] of [
    ['inside', [0, 0], [5, 0]], ['outward inflated overlap', [1.4, 0], [5, 0]],
    ['grazing', [-5, 1.6], [5, 1.6]], ['outside grazing', [-5, 1.600001], [5, 1.600001]],
    ['zero outside', [-5, 3], [-5, 3]], ['zero overlap', [1.6, 0], [1.6, 0]], ['zero inside', [0, 0], [0, 0]],
  ] as const) {
    f.world.setPosition('a', start[0], 1, start[1]);f.check(label, { x: destination[0], y: 1, z: destination[1] });
  }
});

test('route parity invalidates masks, removals, restorations, transforms, shapes and ignored breach walls', () => {
  const wall: RigidBodyDefinition3D = { id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 2 }, y: 1 };
  const f = fixture([wall]), checkpoint = f.world.checkpoint(), mask = f.world.body('wall')!.collisionMask;
  const first = f.current('a', 'b');f.check('original');f.check('ignored breach wall', undefined, 'wall');
  f.world.configureBody('wall', { collisionMask: 0 });f.check('disabled mask');expect(f.current('a', 'b')!.direction).toBeUndefined();
  f.world.configureBody('wall', { collisionMask: mask });f.check('restored mask');exact(f.current('a', 'b'), first, 'same original route');
  f.world.setPosition('wall', 2, 1, 3);f.check('moved');f.world.setRotation('wall', .3, .1, .2, .7);f.check('tilted');
  f.world.restoreCheckpoint(checkpoint);f.check('checkpoint restored');exact(f.current('a', 'b'), first, 'restored original route');
  f.world.removeBody('wall');f.check('removed');f.world.addBody(wall);f.check('readded');
  replace(f.world, { ...wall, shape: { kind: 'sphere', radius: 2 } });f.check('non-box');
  replace(f.world, { ...wall, trigger: true });f.check('trigger');
  replace(f.world, { ...wall, shape: { kind: 'box', halfX: 2, halfY: .1, halfZ: 4 }, y: 8 });f.check('above actor');
  replace(f.world, wall);f.check('original shape restored');exact(f.current('a', 'b'), first, 'original shape route');
});

test('route parity includes changing actor height/radius, actor boxes and active hazard costs', () => {
  const f = fixture([{ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 2 }, y: 1 }]);
  for (const radius of [.1, .5, 1.2]) {
    replace(f.world, { id: 'a', shape: { kind: 'sphere', radius }, x: -5, y: 1 });f.check(`radius ${radius}`);
  }
  replace(f.world, { id: 'a', shape: { kind: 'box', halfX: .3, halfY: 1.5, halfZ: .7 }, x: -5, y: 1 });f.check('box actor');
  for (const height of [.1, 1, 2.25, 2.250001, 4]) { f.world.setPosition('a', -5, height, 0);f.check(`height ${height}`); }
  f.world.setPosition('a', -5, 1, 0);f.world.configureBody('wall', { collisionMask: 0 });f.check('clear inactive hazard');
  f.hazards([{ id: 'fire', x: 0, z: 0, halfX: 1, halfZ: 1, penalty: 5 }]);f.check('active fire');
  expect(f.current('a', 'b')!.direction).toBeDefined();
  f.hazards([{ id: 'fire', x: 1, z: 2, halfX: .1, halfZ: 3, penalty: .7 }]);f.check('changed hazard');
  f.hazards([]);f.check('hazard removed');expect(f.current('a', 'b')!.direction).toBeUndefined();
});

test('cached graphs follow endpoint envelope growth and actual moving kinematic traffic blockers', () => {
  const f = fixture([{ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 3, halfZ: 2 }, y: 1 },
    { id: 'oversized', type: 'static', shape: { kind: 'box', halfX: 10, halfY: 12, halfZ: .05 }, x: 8, y: 6, z: 7, rotation: [.2, .3, -.2, .8] },
    { id: 'traffic', type: 'kinematic', shape: { kind: 'box', halfX: .7, halfY: 1, halfZ: 1.4 }, x: 0, y: 1, z: 20 }]);
  f.check('initial cached endpoint graph');
  // Positions are not in the original graph key; all local box IDs stay present.
  f.world.setPosition('b', 11, 1, -4);f.check('target grows graph envelope');
  f.world.setPosition('a', -11, 1, 5);f.check('actor grows graph envelope');
  f.world.setPosition('b', 5, 1, 0);f.world.setPosition('a', -5, 1, 0);f.check('endpoints restored');
  f.world.setPosition('traffic', -2, 1, 0);f.check('traffic crosses route');
  f.world.setRotation('traffic', 0, .7, 0, .7);f.check('traffic changes heading');
  f.world.setPosition('traffic', -2, 1, 5);f.check('traffic leaves route');
  f.world.configureBody('traffic', { collisionMask: 0 });f.check('traffic removed by mask');
  f.world.configureBody('traffic', { collisionMask: 0xffffffff });f.check('traffic mask restored');
});

test('seeded live boxes preserve exact direction, distance and cache results with original body ordering', () => {
  let seed = 651;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  for (let sample = 0; sample < 24; sample++) {
    const boxes: RigidBodyDefinition3D[] = [];
    for (let index = 0; index < 8; index++) boxes.push({ id: `box:${index}`, type: 'static',
      shape: { kind: 'box', halfX: .05 + random() * 2, halfY: .2 + random() * 3, halfZ: .05 + random() * 2 },
      x: random() * 20 - 10, y: random() * 4, z: random() * 12 - 6,
      rotation: [random() - .5, random() - .5, random() - .5, random() - .5] });
    for (let index = 0; index < 16; index++) boxes.push({ id: `remote:${index}`, type: 'static',
      shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: 1 }, x: 40 + index * 3, y: 1, z: 40 });
    const f = fixture(boxes);f.check(`seed 651 sample ${sample}`);
    f.world.setPosition('a', -7 + random() * 4, 1, random() * 4 - 2);f.check(`moved actor ${sample}`);
    f.world.setPosition('box:0', random() * 10 - 5, 1, random() * 6 - 3);f.check(`moved box ${sample}`);
    f.check(`ignored box ${sample}`, undefined, 'box:0');
  }
});
