import { expect, test } from 'bun:test';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createGameplay3D } from '../gameplay.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { corruptStructuralLeaves } from '../../../test-support/structural-corruption.ts';
import { readGameplaySnapshot3D } from './snapshot-reader.ts';

test('actual combat+gameplay save round trips without mutation and restores deterministically', async () => {
  const { game } = await combatMotionFixture({ match: true, independentCombatInputs: true });
  const saved = game.snapshot(), decoded = readGameplaySnapshot3D(saved);
  expect(decoded).toEqual(saved);
  expect(game.snapshot()).toEqual(saved);
  game.advance({ fighterInputs: [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } })) });game.restore(decoded);expect(game.snapshot()).toEqual(saved);
  decoded.combat!.state.fighters[0]!.position.x = 999;
  expect(game.snapshot()).toEqual(saved);
  let checked = 0;
  for (const corrupt of corruptStructuralLeaves(saved)) {
    expect(() => readGameplaySnapshot3D(corrupt.value), corrupt.path).toThrow();checked++;
  }
  expect(checked).toBeGreaterThan(200);
  expect(game.snapshot()).toEqual(saved);
});

test('actual authored play save round trips with particles and restores through the existing owner', async () => {
  const base = await combatMotionFixture();
  const declaration = base.project.extensions.hyperfocus3D;
  const project = { ...base.project, extensions: { hyperfocus3D: { ...declaration, budgets: { ...declaration.budgets, entities: 16 }, scenes: declaration.scenes.map(scene => ({ ...scene, effectCapacity: 8, entities: scene.entities.map(entity => entity.id === 'a' ? { ...entity, physics: undefined } : entity) })) },
    hyperfocusPlay: { version: 1, genre: 'shooter', player: 'a', movement: { radius: .2, height: 1, speed: 3, acceleration: 20, gravity: 10, jumpSpeed: 5, anticipationTicks: 0, coyoteTicks: 2, bufferTicks: 2, resetY: -20 },
      camera: { distance: 3, height: 1, shoulder: 0, yaw: 0, pitch: 0, turnSpeed: 2, clearance: .1 }, colliders: [], animation: { mode: 'proxy' },
      shooter: { targets: [{ entityId: 'b', halfSize: [.5, .5, .5], health: 10 }], magazine: 3, reserve: 6, fireTicks: 2, reloadTicks: 5, range: 20, muzzle: [0, 0, 0] },
      effects: [{ id: 'shot', event: 'fire', materialId: 'material', facing: 'camera', count: 1, recipe: { capacity: 8, seed: 42, space: 'world', lifetime: [1, 2], speed: [1, 3], size: [.05, .2], shape: { kind: 'point' }, direction: [0, 1, 0], spreadRadians: .5, gravity: [0, -9.81, 0], drag: .1, sizeOverLife: [[0, 1], [1, 0]], colorOverLife: [[0, [1, .5, .2, 1]], [1, [.3, .1, .1, 0]]], rotation: [0, 3], angularVelocity: [-2, 2] } }],
    } } };
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime });
  game.step(['fire']);
  const saved = game.snapshot(), decoded = readGameplaySnapshot3D(saved);
  expect(decoded).toEqual(saved);expect(saved.play!.particles).toHaveLength(1);
  game.step();game.restore(decoded);expect(game.snapshot()).toEqual(saved);
  let checked = 0;
  for (const corrupt of corruptStructuralLeaves(saved)) { expect(() => readGameplaySnapshot3D(corrupt.value), corrupt.path).toThrow();checked++; }
  expect(checked).toBeGreaterThan(100);
});

test('current reader supplies no missing defaults and preserves optional absence/extensions', async () => {
  const { game } = await combatMotionFixture();
  const source = { ...game.snapshot(), extension: { evidence: [true, 2] } };
  expect(readGameplaySnapshot3D(source)).toEqual(source);
  const missing = { ...source, combat: { ...source.combat!, motion: source.combat!.motion.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'airJumpUsed'))) } };
  expect(() => readGameplaySnapshot3D(missing)).toThrow();
  // The legacy restore still owns its previous missing-field default.
  expect(() => game.restore(missing)).not.toThrow();
  expect(readGameplaySnapshot3D({ version: 1, sceneId: 's', tick: 0, entities: [] })).toEqual({ version: 1, sceneId: 's', tick: 0, entities: [] });
});
