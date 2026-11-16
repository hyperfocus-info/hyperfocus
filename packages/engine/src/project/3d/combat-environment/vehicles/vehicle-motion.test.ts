import { expect, test } from 'bun:test';
import { vehicleFixture } from './vehicle-fixture.ts';
import { sample3DFrame } from '../../../../frame/3d.ts';
import { createVehicleMotion } from './vehicle-motion.ts';
import { createRigidWorld3D } from '../../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration, SceneAnimation3D } from '../../declaration.ts';
import { sampleCircuitMotion3D } from '../../motion/circuit-motion.ts';

test('stopped vehicle validation requires all three actual finite coordinates', () => {
  const vehicles = createVehicleMotion({ world: createRigidWorld3D({ capacity: 1 }), entities: [],
    definition: { surfaces: [{ entityId: 'car', trigger: { kind: 'impact', minSpeed: 3 }, stopMotionIds: [] }] } });
  expect(() => vehicles.validate([{ entityId: 'car', position: [, 0, 0], cause: 'impact', blockerId: '' }])).toThrow('Invalid stopped vehicle state.');
});

test('a turning wreck freezes linked geometry at its actual heading and restores that transform', () => {
  const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
  const animation: SceneAnimation3D = { kind: 'ping-pong', offset: [0, 0, 40], phase: 0, periodSeconds: 12, travelSeconds: 4, turnRadius: 2, turnPivot: [0, 0, 0] };
  const entities: Hyperfocus3DDeclaration['scenes'][number]['entities'] = [
    { id: 'car', position: [0, 1, 0], rotationY: 0, scale: [1, 1, 2], meshId: 'mesh', materialId: 'material', animation },
    { id: 'trim', position: [0, 2, 2], rotationY: 0, scale: [.1, .1, .1], meshId: 'mesh', materialId: 'material', animation },
  ];
  world.addBody({ id: 'car', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 2 }, x: -2, y: 1, z: 42, rotation: [0, -.7071067811865475, 0, .7071067811865476] });
  const vehicles = createVehicleMotion({ world, entities, definition: { surfaces: [{ entityId: 'car', trigger: { kind: 'impact', minSpeed: 3 }, stopMotionIds: ['trim'] }] } });
  vehicles.plan(1740, 0);vehicles.stop('car');const saved = vehicles.capture();
  expect(saved[0]!.rotationY).toBeCloseTo(-1.5707963267948966, 6);
  expect(saved[0]!.wheelDistance).toBeCloseTo(sampleCircuitMotion3D(entities[0]!, 1740, 0)!.distance, 6);
  expect(vehicles.positions.get('trim')![0]).toBeCloseTo(-4, 6);expect(vehicles.positions.get('trim')![2]).toBeCloseTo(42, 6);
  const positions = [...vehicles.positions];vehicles.reset();vehicles.restore(vehicles.validate(JSON.parse(JSON.stringify(saved))));expect([...vehicles.positions]).toEqual(positions);
  expect(() => vehicles.validate([{ ...saved[0], rotationY: Infinity }])).toThrow('stopped vehicle');
  expect(() => vehicles.validate([{ ...saved[0], wheelDistance: Infinity }])).toThrow('stopped vehicle');
  expect(() => vehicles.validate([{ ...saved[0], wheelDistance: -1 }])).toThrow('stopped vehicle');
  const { wheelDistance: _distance, ...legacy } = saved[0]!;
  expect(vehicles.validate([legacy])[0]).toEqual(legacy);
});

test('ordinary paid strike causes a bounded three-car crash, preserves solid wrecks and restores exactly', async () => {
  const { game, runtime } = await vehicleFixture({ followers: 2 });game.step(['match:practice']);
  for (let n = 0; n < 4; n++) game.step([]);
  const stamina = game.snapshot().combat!.state.fighters[0]!.stamina;game.step(['a:jab']);
  for (let n = 0; n < 30; n++) game.step([]);
  const wreck = game.snapshot().combat!.environment!;
  expect(wreck.surfaces[0]!.phase).toBe('removed');expect(wreck.vehicleStops?.[0]).toMatchObject({ entityId: 'car', cause: 'impact' });
  expect(wreck.trace.at(-1)).toMatchObject({ entityId: 'car', actor: 'a', cause: 'impact' });
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeLessThanOrEqual(stamina);
  const atImpact = runtime.physics.body('car')!.x;expect(runtime.physics.body('car')!.collisionMask).not.toBe(0);
  const clearLane = game.snapshot();clearLane.combat!.state.fighters[0]!.position.z = 10;clearLane.entities.find(entity => entity.id === 'a')!.position[2] = 10;game.restore(clearLane);
  const checkpoint = game.checkpoint();
  let restoredAtCrash = false;
  for (let n = 0; n < 160; n++) {
    game.step([]);
    if (!restoredAtCrash && game.snapshot().combat!.environment!.surfaces[1]!.phase === 'removed') {
      const atCrash = game.snapshot();game.restore(JSON.parse(JSON.stringify(atCrash)));expect(game.snapshot()).toEqual(atCrash);restoredAtCrash = true;
    }
  }
  expect(restoredAtCrash).toBe(true);
  const stopped = game.snapshot();expect(runtime.physics.body('car')!.x).toBe(atImpact);
  expect(stopped.combat!.environment!.vehicleStops).toHaveLength(3);
  expect(stopped.combat!.environment!.vehicleStops!.map(stop => stop.cause)).toEqual(['impact', 'impact', 'impact']);
  expect(stopped.combat!.environment!.trace.slice(-2)).toMatchObject([{ entityId: 'following', actor: 'car', cause: 'impact' }, { entityId: 'following-1', actor: 'following', cause: 'impact' }]);
  for (const event of stopped.combat!.environment!.trace.slice(-2)) expect(event.speed).toBeCloseTo(8);
  expect(stopped.combat!.environment!.surfaces.every(surface => surface.phase === 'removed')).toBe(true);
  expect(runtime.physics.body('following')!.x).toBeLessThan(atImpact - .5);
  checkpoint.restore();for (let n = 0; n < 160; n++) game.step([]);expect(game.snapshot()).toEqual(stopped);
  game.restore(stopped);expect(game.snapshot()).toEqual(stopped);
  const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: runtime.snapshot().tick, ticksPerSecond: 60 }, viewport: { width: 800, height: 600 } });game.presentFrame(frame);
  expect(frame.entities.find(entity => entity.id === 'car')!.visible).toBe(true);expect(frame.entities.find(entity => entity.id === 'car:glass')!.visible).toBe(false);
  expect(frame.entities.find(entity => entity.id === 'car')!.position[0]).toBe(atImpact);
  for (const id of ['following', 'following-1']) {
    expect(frame.entities.find(entity => entity.id === id + ':glass')!.visible).toBe(false);
    expect(frame.entities.find(entity => entity.id === id + ':damage')!.visible).toBe(true);
    expect(runtime.physics.body(id)!.collisionMask).not.toBe(0);
  }
  const standing = game.snapshot(), follower = runtime.physics.body('following')!;
  standing.combat!.state.fighters[0]!.position = { x: follower.x, y: 3.6, z: follower.z };
  standing.entities.find(entity => entity.id === 'a')!.position = [follower.x, 3.6, follower.z];game.restore(standing);
  for (let n = 0; n < 20; n++) game.step([]);
  expect(runtime.physics.body('a')!.y).toBeCloseTo(3.6, 2);
  const nextRound = game.snapshot();Object.assign(nextRound.combat!.match!, { phase: 'round-result', ticks: 1, winner: 'player' });nextRound.combat!.hitstop.remaining = 0;game.restore(nextRound);game.step([]);
  expect(game.snapshot().combat!.environment!.vehicleStops).toEqual(stopped.combat!.environment!.vehicleStops);
  expect(runtime.physics.body('car')!.collisionMask).not.toBe(0);
  game.reset();expect(game.snapshot().combat!.environment!.vehicleStops).toBeUndefined();
});

test('a slow approach queues without damage and preserves its older blocked snapshot representation', async () => {
  const { game, runtime } = await vehicleFixture({ followingTravelSeconds: 4 });game.step(['match:practice']);
  game.step(['a:jab']);for (let n = 0; n < 30; n++) game.step([]);
  const clear = game.snapshot();clear.combat!.state.fighters[0]!.position.z = 10;clear.entities.find(entity => entity.id === 'a')!.position[2] = 10;game.restore(clear);
  for (let n = 0; n < 180; n++) game.step([]);
  const saved = game.snapshot();
  expect(saved.combat!.environment!.vehicleStops).toMatchObject([{ entityId: 'car', cause: 'impact' }, { entityId: 'following', cause: 'blocked', blockerId: 'car' }]);
  expect(saved.combat!.environment!.surfaces[1]!.phase).toBe('intact');
  expect(saved.combat!.environment!.trace.filter(event => event.entityId === 'following')).toEqual([]);
  expect(runtime.physics.body('following')!.collisionMask).not.toBe(0);
  game.restore(JSON.parse(JSON.stringify(saved)));expect(game.snapshot()).toEqual(saved);
});

test('malformed stopped-state cannot silently remove solid wreck or split linked positions', async () => {
  const { game } = await vehicleFixture();game.step(['match:practice']);const saved = game.snapshot();
  saved.combat!.environment!.surfaces[0]!.phase = 'removed';
  expect(() => game.restore(saved)).toThrow('Wreck phase');
  const invalid = game.snapshot();Reflect.set(invalid.combat!.environment!, 'vehicleStops', [{ entityId: 'car:glass', position: [0, 0, 0], cause: 'impact', blockerId: '' }]);
  expect(() => game.restore(invalid)).toThrow('stopped vehicle');
});
