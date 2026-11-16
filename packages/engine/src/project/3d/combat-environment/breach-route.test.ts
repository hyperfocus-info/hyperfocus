import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatBreachRoute } from './breach-route.ts';

test('breach plan compares real detour length and legal attack cost without changing wall state', () => {
  const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
  world.addBody({ id: 'a', shape: { kind: 'sphere', radius: .5 }, x: -3, y: 1 });
  world.addBody({ id: 'b', shape: { kind: 'sphere', radius: .5 }, x: 3, y: 1 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 10 }, y: 2 });
  const config = createTouchOfDeathPreset();
  config.moves.push({ ...config.moves.find(move => move.id === 'heavy')!, id: 'weapon-only', command: ['weapon-only'], startupFrames: 1, activeFrames: 1, recoveryFrames: 1 });
  config.moves.push({ ...config.moves.find(move => move.id === 'heavy')!, id: 'generated-tool-role', weaponAttack: 'heavy', command: ['heavy'], startupFrames: 1, activeFrames: 1, recoveryFrames: 1 });
  config.moves.push({ ...config.moves.find(move => move.id === 'heavy')!, id: 'dash-only-role', dashAttack: true, command: ['heavy'], startupFrames: 1, activeFrames: 1, recoveryFrames: 1 });
  const route = createCombatBreachRoute({ world, bodyIds: ['wall'], config, indirectMoveIds: ['weapon-only'], speed: 9.1, environment: { surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: 8 } }] } });
  const before = world.checkpoint();
  expect(route('a', 'b', 100, 0)?.direction.x).toBe(1);
  expect(world.checkpoint()).toEqual(before);expect(route('a', 'b', 0, 0)).toBeUndefined();
  world.setPosition('a', -3, 1, 9.9);world.setPosition('b', 3, 1, 9.9);
  expect(route('a', 'b', 100, 0)).toBeUndefined(); // Walking around the nearby end is quicker than committing to a strike.
  world.setPosition('b', 3, 1, 0);
  world.setPosition('a', -.9, 1, 0);expect(route('a', 'b', 100, 0)?.moveId).toBeDefined();
  expect(route('a', 'b', 100, 0)?.moveId).not.toBe('weapon-only');
  expect(route('a', 'b', 100, 0)?.moveId).not.toBe('generated-tool-role');
  expect(route('a', 'b', 100, 0)?.moveId).not.toBe('dash-only-role');
  world.configureBody('wall', { collisionMask: 0 });expect(route('a', 'b', 100, 0)).toBeUndefined();
  world.configureBody('wall', { collisionMask: 0xffffffff });world.setPosition('wall', 0, 2, 20);expect(route('a', 'b', 100, 0)).toBeUndefined();
});

test('high AI opens a blocking wall with ordinary attacks then pursues through it across rollback', async () => {
  const f = await combatMotionFixture({ match: true, obstacle: true });
  const definition = f.project.extensions.hyperfocusCombat;
  definition.environment = { surfaces: [{ entityId: 'obstacle', trigger: { kind: 'impact', minSpeed: 8 } }] };
  const runtime = await createHyperfocus3DRuntime(f.project, f.assets), game = createGameplay3D({ project: f.project, runtime });
  const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };
  for (const [index, actor] of saved.combat!.state.fighters.entries()) {
    actor.position.x = index ? 3 : -5;saved.entities.find(entity => entity.id === actor.id)!.position[0] = actor.position.x;
  }
  game.restore(saved);const checkpoint = game.checkpoint();
  const run = () => { for (let i = 0; i < 300 && game.snapshot().combat!.state.fighters[0]!.health === 100; i++) game.step([]);return game.snapshot(); };
  const after = run();
  expect(after.combat!.environment!.surfaces[0]!.phase).toBe('removed');
  expect(after.combat!.environment!.trace.some(event => event.actor === 'b' && event.cause === 'impact')).toBe(true);
  expect(after.combat!.state.fighters[0]!.health).toBeLessThan(100);
  checkpoint.restore();expect(run()).toEqual(after);
});
