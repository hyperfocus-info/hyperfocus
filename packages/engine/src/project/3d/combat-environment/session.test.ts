import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatEnvironment } from './session.ts';
import { readCombatEnvironment, type CombatEnvironment } from './config.ts';
import { createWeaponSurfaceProbe } from '../combat-interaction/surfaces.ts';

function fixture(trigger: CombatEnvironment['surfaces'][number]['trigger'] = { kind: 'impact', minSpeed: 8 }) {
  const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 3, halfZ: 3 }, x: 1 });
  world.addBody({ id: 'a', type: 'dynamic', shape: { kind: 'sphere', radius: .3 }, continuous: true });
  const session = createCombatEnvironment({ world, definition: { surfaces: [{ entityId: 'wall', trigger }] }, entityIds: ['wall', 'a'] });
  const simulation = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }] });
  return { world, session, state: simulation.capture() };
}

test('512 authored surfaces read the contact stream once rather than once per prop', () => {
  const world = createRigidWorld3D({ capacity: 513, gravityY: 0 });
  const surfaces: CombatEnvironment['surfaces'] = [];
  for (let index = 0; index < 512; index++) {
    const entityId = `wall${index}`;surfaces.push({ entityId, trigger: { kind: 'impact', minSpeed: 8 } });
    world.addBody({ id: entityId, type: 'static', shape: { kind: 'box', halfX: .2, halfY: 3, halfZ: 3 }, x: 1 + index * 5 });
  }
  world.addBody({ id: 'a', type: 'dynamic', shape: { kind: 'sphere', radius: .3 }, x: .6 });
  const session = createCombatEnvironment({ world, definition: { surfaces }, entityIds: ['a', ...surfaces.map(surface => surface.entityId)] });
  const state = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'a', position: { x: .6, y: 0, z: 0 } }] }).capture();
  world.step(0.016666666666666666);const count = world.contactCount();expect(count).toBeGreaterThan(0);
  let reads = 0;const contact = world.contact.bind(world);world.contact = (...args) => { reads++;return contact(...args); };
  session.step(state);expect(reads).toBe(count);
});

test('direct active strikes chip then break an impact wall with a causal attacker trace and reversible collision', () => {
  const { session, state, world } = fixture(), config = createTouchOfDeathPreset();
  const jab = config.moves.find(move => move.id === 'jab')!, heavy = config.moves.find(move => move.id === 'heavy-toward') ?? config.moves.find(move => move.impulse >= 8)!;
  const fighter = state.fighters[0]!, initial = session.capture();
  fighter.moveId = jab.id;fighter.moveFrame = jab.startupFrames;session.attack(state, config);
  expect(session.capture().surfaces[0]!.phase).toBe('intact');
  fighter.moveFrame++;state.frame++;session.attack(state, config);
  expect(session.capture().surfaces[0]!.phase).toBe('warning');expect(world.body('wall')!.collisionMask).not.toBe(0);
  fighter.moveId = heavy.id;fighter.moveFrame = heavy.startupFrames + 1;state.frame++;session.attack(state, config);
  expect(session.capture().surfaces[0]!.phase).toBe('removed');expect(world.body('wall')!.collisionMask).toBe(0);
  expect(session.capture().trace.at(-1)).toMatchObject({ actor: 'a', cause: 'impact', kind: 'removed', speed: heavy.impulse });
  const removed = session.validate(session.capture());session.restore(initial);expect(world.body('wall')!.collisionMask).not.toBe(0);
  session.restore(removed);expect(world.body('wall')!.collisionMask).toBe(0);
});

test('direct structure strikes respect facing, reach and intervening solid geometry', () => {
  const { session, state, world } = fixture(), config = createTouchOfDeathPreset(), fighter = state.fighters[0]!;
  const move = config.moves.find(move => move.impulse >= 8)!;fighter.moveId = move.id;fighter.moveFrame = move.startupFrames + 1;
  fighter.facing.x = -1;session.attack(state, config);expect(session.capture().trace).toHaveLength(0);
  fighter.facing.x = 1;fighter.position.x = -10;session.attack(state, config);expect(session.capture().trace).toHaveLength(0);
  fighter.position.x = 0;world.addBody({ id: 'blocker', type: 'static', shape: { kind: 'box', halfX: .1, halfY: 2, halfZ: 2 }, x: .4 });
  const blocked = createCombatEnvironment({ world, definition: { surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: 8 } }] }, entityIds: ['wall', 'a', 'blocker'] });
  expect(blocked.attack(state, config)).toHaveLength(0);expect(blocked.capture().trace).toHaveLength(0);
});

test('a prop behind a thin wall cannot steal an overlapping attack contact from that wall', () => {
  for (const reverse of [false, true]) {
    const { state, world } = fixture(), config = createTouchOfDeathPreset();
    world.addBody({ id: 'behind', type: 'static', shape: { kind: 'box', halfX: .4, halfY: 1, halfZ: 1 }, x: 1.8 });
    const ids = reverse ? ['behind', 'wall'] : ['wall', 'behind'];
    const session = createCombatEnvironment({ world, definition: { surfaces: ids.map(entityId => ({ entityId, trigger: { kind: 'impact', minSpeed: 8 } })) }, entityIds: [...ids, 'a'] });
    const move = config.moves.find(move => move.id === 'heavy-toward')!;
    Object.assign(state.fighters[0]!, { moveId: move.id, moveFrame: move.startupFrames + 1, attackSerial: 1 });
    expect(session.attack(state, config)).toMatchObject([{ entityId: 'wall' }]);
    expect(session.capture().surfaces.find(surface => surface.entityId === 'wall')!.phase).toBe('removed');
    expect(session.capture().surfaces.find(surface => surface.entityId === 'behind')!.phase).toBe('intact');
  }
});

test('actual capsule radius and height contact terrain on later active frames with rollback-safe hitstop dedup', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'ledge', type: 'static', shape: { kind: 'box', halfX: .1, halfY: .1, halfZ: .1 }, x: 1, y: 1.2, z: .4 });
  const session = createCombatEnvironment({ world, definition: { surfaces: [{ entityId: 'ledge', trigger: { kind: 'impact', minSpeed: 100 } }] }, entityIds: ['ledge'] });
  const config = createTouchOfDeathPreset(), move = config.moves.find(move => move.id === 'jab')!;
  Object.assign(move, { reach: 1, hitRadius: .35, hitHeight: 1.2, activeFrames: 5 });
  const state = createCombatSimulation({ config, fighters: [{ id: 'human-or-ai', position: { x: -3, y: 0, z: 0 } }] }).capture();
  const fighter = state.fighters[0]!;Object.assign(fighter, { moveId: move.id, moveFrame: move.startupFrames + 1, attackSerial: 1, facing: { x: 1, y: 0, z: 0 } });
  expect(session.attack(state, config)).toHaveLength(0);
  fighter.position.x = 0;fighter.moveFrame++;
  expect(session.attack(state, config)).toMatchObject([{ actor: fighter.id, entityId: 'ledge', moveId: move.id }]);
  const saved = session.validate(session.capture());session.reset();session.restore(saved);
  expect(session.attack(state, config)).toHaveLength(0);
  fighter.attackSerial++;expect(session.attack(state, config)).toHaveLength(1);
  fighter.attackSerial++;move.hitHeight = 0;expect(session.attack(state, config)).toHaveLength(0);
});

test('two distinct light contacts break a weakened surface and shortened weapons miss correctly', () => {
  const { session, state } = fixture(), config = createTouchOfDeathPreset(), fighter = state.fighters[0]!;
  const move = config.moves.find(move => move.id === 'jab')!;
  Object.assign(fighter, { moveId: move.id, moveFrame: move.startupFrames + 1, attackSerial: 1 });
  expect(session.attack(state, config, { a: .1 })).toHaveLength(0);
  expect(session.attack(state, config)).toHaveLength(1);
  expect(session.capture().surfaces[0]!.phase).toBe('warning');
  expect(session.attack(state, config)).toHaveLength(0);
  fighter.attackSerial++;
  expect(session.attack(state, config)).toHaveLength(1);
  expect(session.capture().surfaces[0]!.phase).toBe('removed');
  fighter.attackSerial++;expect(session.attack(state, config)).toHaveLength(0);
});

test('a resting floor cannot steal a destructible capsule contact or freeze a terrain whiff', () => {
  const { session: _session, state, world } = fixture();
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 20, halfY: .1, halfZ: 20 }, y: -1 });
  const session = createCombatEnvironment({ world, definition: { surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: 100 } }] }, entityIds: ['wall', 'a', 'floor'] });
  const config = createTouchOfDeathPreset(), move = config.moves.find(move => move.id === 'jab')!;
  move.hitRadius = 1;
  Object.assign(state.fighters[0]!, { moveId: move.id, moveFrame: move.startupFrames + 1 });
  expect(session.attack(state, config)).toMatchObject([{ entityId: 'wall' }]);
  state.fighters[0]!.position.x = -10;state.fighters[0]!.attackSerial++;
  expect(session.attack(state, config)).toHaveLength(0);
});

test('earned normal-speed fighter impact opens a wall and retains forward momentum; restore closes it', () => {
  const { world, session, state } = fixture();
  state.fighters[0]!.stunKind = 'hit';state.fighters[0]!.stunFrames = 30;
  const initial = session.capture(), physics = world.checkpoint();
  world.setVelocity('a', 20, 0, 0);
  for (let frame = 0; frame < 4; frame++) { world.step(0.016666666666666666);state.frame++;session.step(state); }
  expect(session.capture().surfaces[0]!.phase).toBe('removed');
  expect(session.capture().trace).toHaveLength(1);
  expect(session.capture().trace[0]).toMatchObject({ actor: 'a', cause: 'impact', kind: 'removed' });
  expect(world.body('a')!.velocityX).toBeGreaterThan(10);
  expect(world.body('wall')!.collisionMask).toBe(0);
  const probe = createWeaponSurfaceProbe(world, ['wall']);
  expect(probe({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeUndefined();
  const removed = session.capture();
  session.restore(initial);world.restoreCheckpoint(physics);
  expect(world.body('wall')!.collisionMask).not.toBe(0);
  session.restore(session.validate(removed));
  expect(world.body('wall')!.collisionMask).toBe(0);
  session.reset();
  expect(world.body('wall')!.collisionMask).not.toBe(0);
  expect(session.capture()).toEqual(initial);
});

test('neutral sprint and fast tangential hitstun cannot destroy a wall', () => {
  for (const [hitstun, xSpeed, zSpeed] of [[false, 20, 0], [true, 2, 20]] as const) {
    const { world, session, state } = fixture();
    if (hitstun) { state.fighters[0]!.stunKind = 'hit';state.fighters[0]!.stunFrames = 30; }
    world.setPosition('a', .46, 0, 0);world.setVelocity('a', xSpeed, 0, zSpeed);
    for (let frame = 0; frame < 4; frame++) { world.step(0.016666666666666666);state.frame++;session.step(state); }
    expect(session.capture().surfaces[0]!.phase).toBe('intact');
    expect(session.capture().trace).toHaveLength(0);
  }
});

test('city warning precedes deterministic removal and survives trusted rewind', () => {
  const { world, session, state } = fixture({ kind: 'scheduled', warningFrame: 12, removeFrame: 20 });
  state.frame = 11;session.step(state);expect(session.capture().surfaces[0]!.phase).toBe('intact');
  state.frame = 12;session.step(state);expect(session.capture().surfaces[0]!.phase).toBe('warning');
  const saved = session.capture(), physics = world.checkpoint();
  state.frame = 19;session.step(state);expect(world.body('wall')!.collisionMask).not.toBe(0);
  state.frame = 20;session.step(state);const completed = session.capture();
  expect(completed.trace.map(event => event.kind)).toEqual(['warning', 'removed']);
  session.restore(saved);world.restoreCheckpoint(physics);
  state.frame = 20;session.step(state);expect(session.capture()).toEqual(completed);
  expect(world.body('wall')!.collisionMask).toBe(0);
  state.frame = 100;session.step(state);expect(session.capture().trace).toHaveLength(2);
  expect(() => session.validate({ ...saved, surfaces: [{ entityId: 'other', phase: 'removed' }] })).toThrow();
});

test('environment config rejects ambiguous or unbounded trigger data', () => {
  expect(() => readCombatEnvironment({ surfaces: [{ entityId: 'wall', trigger: { kind: 'scheduled', warningFrame: 20, removeFrame: 12 } }] })).toThrow();
  expect(() => readCombatEnvironment({ surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: NaN } }] })).toThrow();
  expect(() => readCombatEnvironment({ surfaces: [], retreatPenalty: 1 })).toThrow();
});
