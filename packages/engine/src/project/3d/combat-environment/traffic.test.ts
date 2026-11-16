import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatTraffic } from './traffic.ts';
import { readCombatEnvironment } from './config.ts';
import { createCombatExchange3D } from '../combat-practice/exchange.ts';

function fixture() {
  const world = createRigidWorld3D({ capacity: 3, gravityY: 0 }), config = createCombatPreset();
  world.addBody({ id: 'car', type: 'static', shape: { kind: 'box', halfX: .5, halfY: .5, halfZ: 1 }, x: 5, y: .5 });
  for (const id of ['a', 'b']) world.addBody({ id, type: 'dynamic', shape: { kind: 'sphere', radius: .5 }, y: .5 });
  const entity: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = { id: 'car', meshId: 'mesh', materialId: 'material', position: [-5, .5, 0], scale: [.5, .5, 1], rotationY: 0,
    physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false }, animation: { kind: 'ping-pong', offset: [10, 0, 0], periodSeconds: 0.03333333333333333, phase: 0, travelSeconds: 0.016666666666666666 } };
  const state = createCombatSimulation({ config, fighters: ['a', 'b'].map(id => ({ id, position: { x: 0, y: .5, z: 0 } })) }).capture();state.frame = 1;
  const traffic = createCombatTraffic({ world, entities: [entity], definition: { surfaces: [], traffic: [{ entityId: 'car', moveId: 'heavy', minSpeed: 3 }] } });
  return { world, config, state, traffic, entity, grounded: new Set(['a', 'b']) };
}

test('heavy vehicle impact crushes ordinary move armor while escape armor absorbs its impulse', () => {
  const { traffic, state, config, grounded } = fixture();
  config.moves.push({ ...config.moves[0]!, id: 'escape', command: ['escape'], armoredEscape: true });
  state.fighters[0]!.armorFrames = 12; state.fighters[0]!.moveId = 'jab';
  state.fighters[1]!.armorFrames = 12; state.fighters[1]!.moveId = 'escape';
  const events = traffic.step(state, structuredClone(state), config, grounded, 1, 0);
  expect(state.fighters[0]!.armorFrames).toBe(0); expect(state.fighters[0]!.stunFrames).toBeGreaterThan(0);
  expect(state.fighters[1]!.stunFrames).toBe(0); expect(events[1]!.impulse).toEqual({ x: 0, y: 0, z: 0 });
});

test('fast vehicle sweep hits both seats even when its endpoint passed them, with truthful provenance', () => {
  const { traffic, state, config, grounded } = fixture(), before = structuredClone(state), exchange = createCombatExchange3D();
  const events = traffic.step(state, before, config, grounded, 1, 0);
  expect(events).toHaveLength(2);expect(state.fighters.map(fighter => fighter.health)).toEqual([80, 80]);
  for (const event of events) {
    expect(event).toMatchObject({ attackerId: 'car', environmentId: 'car', moveId: 'heavy', defenseReason: 'traffic-impact', damage: 20 });
    expect(event.impulse.x).toBe(8);expect(state.fighters.find(fighter => fighter.id === event.targetId)!.stunFrames).toBe(22);
  }
  exchange.observe(before, state, events);expect(exchange.summary()!.text).toContain('moving vehicle');
  expect(exchange.validate(exchange.capture())).toEqual(exchange.capture());
});

test('riders, airborne fighters, protected fighters and slow traffic do not take a vehicle strike', () => {
  for (const scenario of ['rider', 'air', 'protected', 'slow']) {
    const { traffic, state, config, grounded, world } = fixture();
    if (scenario === 'rider') for (const fighter of state.fighters) fighter.position.y = 1.5;
    if (scenario === 'air') { grounded.clear();for (const fighter of state.fighters) fighter.position.y = 3; }
    if (scenario === 'protected') for (const fighter of state.fighters) fighter.protectionFrames = 1;
    if (scenario === 'slow') world.setPosition('car', -4.99, .5, 0);
    expect(traffic.step(state, structuredClone(state), config, grounded, 1, 0)).toHaveLength(0);
    expect(state.fighters.map(fighter => fighter.health)).toEqual([100, 100]);
  }
});

test('a low jump intersecting the vehicle still takes its airborne hitstun', () => {
  const { traffic, state, config, grounded } = fixture();grounded.clear();
  config.moves.find(move => move.id === 'heavy')!.groundedHitstunFrames = 8;
  for (const fighter of state.fighters) fighter.position.y = .8;
  expect(traffic.step(state, structuredClone(state), config, grounded, 1, 0)).toHaveLength(2);
  expect(state.fighters[0]!.stunFrames).toBe(22);
});

test('traffic contact latches prevent repeated damage and restore the exact next contact', () => {
  const { traffic, state, config, grounded, world } = fixture(), before = structuredClone(state);
  world.setPosition('car', 0, .5, 0);
  const initial = traffic.capture();const first = traffic.step(state, before, config, grounded, 1, 0), hit = structuredClone(state), saved = traffic.capture();
  expect(traffic.step(state, hit, config, grounded, 1, 0)).toHaveLength(0);expect(state).toEqual(hit);
  traffic.restore(traffic.validate(initial));const replay = structuredClone(before);
  expect(traffic.step(replay, before, config, grounded, 1, 0)).toEqual(first);expect(replay).toEqual(hit);expect(traffic.capture()).toEqual(saved);
  expect(() => traffic.validate([{ entityId: 'missing', fighterId: 'a' }])).toThrow();
});

test('environment accepts 512 individually authored props and rejects traffic identity mistakes', () => {
  const surfaces = Array.from({ length: 512 }, (_, index) => ({ entityId: `prop${index}`, trigger: { kind: 'impact', minSpeed: 3 } }));
  expect(readCombatEnvironment({ surfaces })!.surfaces).toHaveLength(512);
  expect(() => readCombatEnvironment({ surfaces: [...surfaces, { ...surfaces[0], entityId: 'extra' }] })).toThrow();
  expect(() => readCombatEnvironment({ surfaces, traffic: [{ entityId: 'prop0', moveId: 'heavy', minSpeed: 3 }] })).toThrow();
});

test('real runtime traffic causes heavy recoil and survives a checkpoint replay', async () => {
  const source = await combatMotionFixture(), project = source.project;
  const scene = project.extensions.hyperfocus3D.scenes[0]!;
  const car: typeof scene.entities[number] = { ...structuredClone(scene.entities.find(entity => entity.id === 'floor')!), id: 'car', position: [-4, .65, 0], scale: [1, .4, 2], animation: { kind: 'ping-pong', offset: [8, 0, 0], periodSeconds: 2, phase: 0, travelSeconds: .2 } };
  scene.entities.push(car);
  Object.assign(project.extensions.hyperfocusCombat, { environment: { surfaces: [], traffic: [{ entityId: 'car', moveId: 'heavy', minSpeed: 3 }] } });
  const runtime = await createHyperfocus3DRuntime(project, source.assets), game = createGameplay3D({ project, runtime });
  for (let index = 0; index < 50; index++) game.step([]);
  const checkpoint = game.checkpoint();
  for (let index = 0; index < 15; index++) game.step([]);
  const after = game.snapshot();expect(after.combat!.state.fighters.some(fighter => fighter.health < 100)).toBe(true);
  expect(after.combat!.exchange!.some(entry => entry.attackerId === 'car' && entry.reason === 'traffic-impact')).toBe(true);
  checkpoint.restore();for (let index = 0; index < 15; index++) game.step([]);expect(game.snapshot()).toEqual(after);
  const portable = JSON.parse(JSON.stringify(after));game.restore(portable);expect(game.snapshot()).toEqual(after);
  const next = game.step([]);game.restore(portable);const resumed = game.step([]);
  expect(resumed.combat!.environment).toEqual(next.combat!.environment);
  expect(resumed.combat!.exchange).toEqual(next.combat!.exchange);
  expect(resumed.combat!.state.fighters.map(fighter => fighter.health)).toEqual(next.combat!.state.fighters.map(fighter => fighter.health));
});
