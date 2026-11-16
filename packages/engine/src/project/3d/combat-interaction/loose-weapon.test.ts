import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createGameplay3D, createHyperfocus3DRuntime, readCombatProject3D } from '../../runtime-3d.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { stepLooseWeapon } from './loose-weapon.ts';
import { createWeaponSurfaceProbe } from './surfaces.ts';
import { createCombatPreset } from '../../../combat/config.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatInteractions } from './session.ts';

test('loose tools preserve authored clearance, fall onto real elevated support, and fall again when it disappears', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .25, halfZ: 10 }, y: -.25 });
  world.addBody({ id: 'platform', type: 'kinematic', shape: { kind: 'box', halfX: 2, halfY: .25, halfZ: 2 }, y: 2 });
  const probe = createWeaponSurfaceProbe(world, ['floor', 'platform']);
  const resting = { position: { x: 5, y: .15, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const before = structuredClone(resting);for (let i = 0; i < 60; i++) stepLooseWeapon(resting, probe);expect(resting.position).toEqual(before.position);expect(resting.velocity).toEqual(before.velocity);
  const dropped = { position: { x: 0, y: 4, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  stepLooseWeapon(dropped, probe);expect(dropped.position.y).toBeLessThan(4);expect(dropped.position.y).toBeGreaterThan(3.9);
  for (let i = 0; i < 90; i++) stepLooseWeapon(dropped, probe);
  expect(dropped.position.y).toBeCloseTo(2.315, 3);
  world.setPosition('platform', 0, 2.1, 0);stepLooseWeapon(dropped, probe);expect(dropped.position.y).toBeCloseTo(2.415, 3);
  world.configureBody('platform', { collisionMask: 0 });
  for (let i = 0; i < 90; i++) stepLooseWeapon(dropped, probe);
  expect(dropped.position.y).toBeCloseTo(.065, 3);
});

test('a competing side overlap cannot turn resting floor contact into sixty drop impacts per second', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .25, halfZ: 10 }, y: -.25 });
  world.addBody({ id: 'overhang', type: 'static', shape: { kind: 'box', halfX: .1, halfY: .18, halfZ: 1 }, x: -.09, y: .4 });
  const probe = createWeaponSurfaceProbe(world, ['floor', 'overhang']);
  const item = { position: { x: 0, y: .12, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  let impacts = 0;for (let frame = 0; frame < 180; frame++) if (stepLooseWeapon(item, probe)) impacts++;
  expect(impacts).toBe(1);expect(item.position.y).toBeCloseTo(.065, 6);
});

test('support-plane rest poses settle on the actual surface without legacy sweep padding', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .25, halfZ: 10 }, y: -.25 });
  world.addBody({ id: 'table', type: 'kinematic', shape: { kind: 'box', halfX: 2, halfY: .465, halfZ: 2 }, y: .465 });
  const probe = createWeaponSurfaceProbe(world, ['floor', 'table']);
  const item = { position: { x: 0, y: 3, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  let impacts = 0;
  for (let frame = 0; frame < 180; frame++) if (stepLooseWeapon(item, probe, true)) impacts++;
  expect(impacts).toBe(1);expect(item.position.y).toBeCloseTo(.93, 6);
  world.setPosition('table', 0, .565, 0);stepLooseWeapon(item, probe, true);
  expect(item.position.y).toBeCloseTo(1.03, 6);
  world.configureBody('table', { collisionMask: 0 });
  for (let frame = 0; frame < 180; frame++) if (stepLooseWeapon(item, probe, true)) impacts++;
  expect(impacts).toBe(2);expect(item.position.y).toBeCloseTo(0, 6);
});

test('terrain contact is saved, validated and rearmed only by separation or a new pickup/throw', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .25, halfZ: 10 }, y: -.25 });
  world.addBody({ id: 'overhang', type: 'static', shape: { kind: 'box', halfX: .1, halfY: .18, halfZ: 1 }, x: -.09, y: .4 });
  const config = createCombatPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const probe = createWeaponSurfaceProbe(world, ['floor', 'overhang']);let missingSupport = false;
  const session = createCombatInteractions({ config, definition: { weapons: [{ entityId: 'glass', material: 'wood', acousticProfile: 'glass', durability: 30, length: 1, lightMoveId: 'jab', heavyMoveId: 'heavy' }] }, positions: new Map([['glass', { x: 0, y: .12, z: 0 }]]), fighterIds: ['a'], surface: (from, to) => missingSupport ? undefined : probe(from, to) });
  const step = () => { state.frame++;session.before(state, []);session.after(state, [], []);return session.transitions.filter(event => event.kind === 'weapon-dropped'); };
  const fall = () => { const impacts = [];for (let frame = 0; frame < 180; frame++) impacts.push(...step());return impacts; };
  expect(fall()).toHaveLength(1);const resting = session.capture();
  expect(resting.weapons[0]!.terrainContact?.y).toBeCloseTo(.065, 6);
  session.restore(session.validate(JSON.parse(JSON.stringify(resting))));expect(fall()).toEqual([]);
  missingSupport = true;expect(step()).toEqual([]);missingSupport = false;expect(step()).toEqual([]);
  const jittered = session.capture();session.restore(jittered);expect(fall()).toEqual([]);
  world.setPosition('floor', 0, -2.25, 0);const beforeFall = session.capture(), frameBeforeFall = state.frame;
  const drops = fall(), afterFall = session.capture();expect(drops).toHaveLength(1);expect(drops[0]!.position?.y).toBeCloseTo(-1.935, 6);
  session.restore(beforeFall);state.frame = frameBeforeFall;expect(fall()).toEqual(drops);expect(session.capture()).toEqual(afterFall);
  const held = session.capture();held.weapons[0]!.owner = 'a';session.restore(held);step();expect(session.capture().weapons[0]!.terrainContact).toBeUndefined();
  const thrown = session.capture(), item = thrown.weapons[0]!;item.owner = '';item.projectileOwner = 'a';item.position = { x: 3, y: 1, z: 0 };item.velocity = { x: 0, y: -1, z: 0 };
  session.restore(thrown);expect(fall()).toHaveLength(1);expect(fall()).toEqual([]);
  const malformed = session.capture();malformed.weapons[0]!.terrainContact = { x: 0, y: NaN, z: 0 };expect(() => session.validate(malformed)).toThrow();
  const legacy = session.capture();delete legacy.weapons[0]!.terrainContact;session.restore(session.validate(legacy));expect(fall()).toEqual([]);
});

test('a real knockout drops a held tool harmlessly onto the floor and checkpoint replay agrees', async () => {
  const f = await combatMotionFixture({ independentCombatInputs: true });
  const definition = readCombatProject3D(f.project.extensions.hyperfocusCombat)!;
  definition.interactions = { weapons: [{ entityId: 'tool', material: 'wood', durability: 30, length: 2, lightMoveId: definition.config.moves[0]!.id, heavyMoveId: definition.config.moves[1]!.id }] };
  f.project.extensions.hyperfocus3D.scenes[0]!.entities.push({ id: 'tool', meshId: 'mesh', materialId: 'material', position: [0, .2, -1], scale: [.1, .1, .1], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
  const project = { ...f.project, extensions: { ...f.project.extensions, hyperfocusCombat: definition } };
  const runtime = await createHyperfocus3DRuntime(project, f.assets), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const step = (a: string[] = [], b: string[] = []) => game.step([], [
    { actions: new Set(a), direction: { x: 0, y: 0, z: a.includes('interact') ? -1 : 0 } },
    { actions: new Set(b), direction: { x: 0, y: 0, z: 0 } },
  ]);
  for (let i = 0; i < 30; i++) step();
  step(['interact']);expect(game.snapshot().combat!.interactions!.weapons[0]!.owner).toBe('a');
  const saved = game.snapshot();saved.combat!.state.fighters[0]!.health = 1;game.restore(saved);
  step([], ['jab']);for (let i = 0; i < 30 && game.snapshot().combat!.state.fighters[0]!.health; i++) step();
  expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(0);
  const airborne = game.snapshot().combat!.interactions!.weapons[0]!;
  expect(airborne.owner).toBe('');expect(airborne.projectileOwner).toBe('');expect(airborne.position.y).toBeGreaterThan(1);
  const checkpoint = game.checkpoint();
  const run = () => { for (let i = 0; i < 120; i++) step();return game.snapshot(); };
  const landed = run();expect(landed.combat!.interactions!.weapons[0]!.position.y).toBeCloseTo(.315, 3);
  expect(landed.combat!.state.fighters[1]!.health).toBe(100);
  checkpoint.restore();expect(run()).toEqual(landed);
});
