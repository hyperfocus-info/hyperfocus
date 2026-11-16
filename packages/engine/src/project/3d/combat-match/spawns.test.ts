import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('starting locations advance between matches in physics and saved combat; practice reset stays first', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const definition = fixture.project.extensions.hyperfocusCombat;
  definition.spawns = Array.from({ length: 5 }, (_, index) => ({ id: `Court ${index}`, positions: [[index * 12, 1, 0], [index * 12 + 4, 1, 0]] }));
  const runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets);
  const game = createGameplay3D({ project: fixture.project, runtime });
  for (let round = 1; round < 5; round++) {
    const saved = game.snapshot(), combat = saved.combat!;
    combat.match = { ...combat.match!, phase: 'match-result', ticks: 0, playerWins: 3, opponentWins: 0, winner: 'player', held: [] };
    game.restore(saved);const checkpoint = game.checkpoint();game.step(['match:replay']);
    expect(game.snapshot().combat!.state.fighters[0]!.position.x).toBe(round * 12);
    expect(runtime.physics.body('a')!.x).toBe(round * 12);
    expect(game.snapshot().combat!.state.fighters[1]!.facing.x).toBe(-1);
    const next = game.snapshot();checkpoint.restore();game.step(['match:replay']);expect(game.snapshot()).toEqual(next);
  }
  game.reset();game.step(['match:practice']);game.step(['a:reset']);
  expect(runtime.physics.body('a')!.x).toBe(0);
  expect(game.snapshot().combat!.match!.phase).toBe('practice');
  for (const bad of [[], [{ id: 'bad', positions: [[NaN, 1, 0], [4, 1, 0]] }], [{ id: 'bad', positions: [[1, 2, 3]] }]]) {
    expect(() => readCombatProject3D({ ...definition, spawns: bad })).toThrow();
  }
});

test('a round recovery preserves positions and clocks instead of applying the next match spawn', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const game = fixture.game, saved = game.snapshot(), combat = saved.combat!;
  combat.match = { ...combat.match!, phase: 'round-result', ticks: 1, playerWins: 0, opponentWins: 0, winner: 'player', held: [] };
  combat.state.frame = 300;
  for (const [index, fighter] of combat.state.fighters.entries()) {
    fighter.position = { x: 20 + index * 4, y: 2, z: 10 };fighter.health = index ? 0 : 70;
    saved.entities.find(entity => entity.id === fighter.id)!.position = [fighter.position.x, fighter.position.y, fighter.position.z];
  }
  game.restore(saved);const before = game.snapshot(), checkpoint = game.checkpoint();game.step([]);
  const after = game.snapshot();
  expect(after.combat!.match!.phase).toBe('fighting');expect(after.combat!.match!.matchIndex ?? 0).toBe(0);
  expect(after.combat!.state.frame).toBeGreaterThan(before.combat!.state.frame);expect(after.tick).toBeGreaterThan(before.tick);
  expect(after.combat!.state.fighters.map(fighter => fighter.health)).toEqual([100, 100]);
  expect(after.combat!.state.fighters[0]!.position.x).toBe(20);expect(after.combat!.state.fighters[1]!.position.x).toBe(24);
  expect(Math.atan2(after.combat!.state.fighters[0]!.facing.x, after.combat!.state.fighters[0]!.facing.z)).toBeCloseTo(Math.PI / 2);
  expect(Math.atan2(after.combat!.state.fighters[1]!.facing.x, after.combat!.state.fighters[1]!.facing.z)).toBeCloseTo(-Math.PI / 2);
  checkpoint.restore();game.step([]);expect(game.snapshot()).toEqual(after);
});

test('session seeds choose different first locations and props stay synchronized through retry and rollback', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const definition = fixture.project.extensions.hyperfocusCombat;
  const scene = fixture.project.extensions.hyperfocus3D.scenes[0]!;
  const source = scene.entities.find(entity => !definition.fighters.some(fighter => fighter.entityId === entity.id))!;
  scene.entities.push({ ...structuredClone(source), id: 'layout-tool', position: [0, .1, 5], scale: [.8, .1, .1] });
  definition.interactions = { weapons: [{ entityId: 'layout-tool', material: 'wood', length: 1.6, durability: 50, lightMoveId: 'jab', heavyMoveId: 'heavy' }] };
  definition.spawns = [0, 1, 2].map(index => ({ id: `place${index}`, positions: [[index * 10, 1, 0], [index * 10 + 4, 1, 0]], props: [{ entityId: 'layout-tool', position: [index * 10, .1, 4] }] }));
  const make = async (seed: number, online = false) => {
    const runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets);
    return createGameplay3D({ project: fixture.project, runtime, combatQueueSeed: seed, independentCombatInputs: online, externalCombatMatch: online });
  };
  const game = await make(1), title = game.snapshot();
  expect(title.combat!.match!.phase).toBe('menu');
  expect(title.combat!.state.fighters[0]!.position.x).toBe(10);
  expect(title.entities.find(entity => entity.id === 'layout-tool')!.position[0]).toBe(10);
  game.step(['match:start']);
  expect(game.snapshot().entities.map(entity => [entity.id, entity.position])).toEqual(title.entities.map(entity => [entity.id, entity.position]));
  expect(game.snapshot().motionSeed).toBe(title.motionSeed);
  expect(game.snapshot().combat!.state.fighters[0]!.position.x).toBe(10);
  expect(game.snapshot().combat!.interactions!.weapons[0]!.position.x).toBe(10);
  expect(game.snapshot().entities.find(entity => entity.id === 'layout-tool')!.position[0]).toBe(10);
  const online = await make(2, true);
  expect(online.snapshot().combat!.state.fighters[0]!.position.x).toBe(20);
  expect(online.snapshot().combat!.interactions!.weapons[0]!.position.x).toBe(20);
  const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player', held: [] };
  game.restore(saved);const checkpoint = game.checkpoint();game.step(['match:replay']);
  expect(game.snapshot().combat!.state.fighters[0]!.position.x).toBe(20);
  expect(game.snapshot().combat!.interactions!.weapons[0]!.position.x).toBe(20);
  const next = game.snapshot();checkpoint.restore();game.step(['match:replay']);expect(game.snapshot()).toEqual(next);
  for (const props of [[{ entityId: 'a', position: [0, 1, 0] }], [{ entityId: 'layout-tool', position: [NaN, 0, 0] }], [{ entityId: 'layout-tool', position: [0, 0, 0] }, { entityId: 'layout-tool', position: [1, 0, 0] }]]) {
    expect(() => readCombatProject3D({ ...definition, spawns: [{ ...definition.spawns![0], props }] })).toThrow();
  }
});

test('district weapon selections survive round recovery, JSON restoration and replay with shared online seeds', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const definition = fixture.project.extensions.hyperfocusCombat;
  const scene = fixture.project.extensions.hyperfocus3D.scenes[0]!;
  const source = scene.entities.find(entity => !definition.fighters.some(fighter => fighter.entityId === entity.id))!;
  const ids = ['layout-glass', 'layout-pipe', 'layout-spray'];
  for (const id of ids) scene.entities.push({ ...structuredClone(source), id, position: [0, .15, 5], scale: [.2, .1, .1] });
  definition.interactions = { weapons: ids.map(entityId => ({ entityId, material: 'metal', length: .4, durability: 20, lightMoveId: 'jab', heavyMoveId: 'heavy' })) };
  definition.spawns = [{ id: 'court', positions: [[0, 1, 0], [4, 1, 0]] }];
  definition.weaponLayouts = [{ id: 'market', variants: ids.map((entityId, index) => ({ id: `stock-${index}`, props: [{ entityId, position: [index * 2, .15, 5] }] })) }];
  const make = async () => {
    const runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets);
    return createGameplay3D({ project: fixture.project, runtime, combatQueueSeed: 7, independentCombatInputs: true, externalCombatMatch: true });
  };
  const game = await make(), peer = await make();
  const idle = { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } };
  const step = (actions: string[] = []) => game.step(actions, [idle, idle]);
  expect(peer.snapshot()).toEqual(game.snapshot());
  const saved = game.snapshot(), stock = saved.combat!.interactions!.weapons;
  expect(stock.filter(item => item.active !== false).map(item => item.id)).toEqual(['layout-glass']);
  stock[0]!.durability = 0;
  saved.combat!.match = { ...saved.combat!.match!, phase: 'round-result', ticks: 1, winner: 'player', held: [] };
  game.restore(JSON.parse(JSON.stringify(saved)));step();
  expect(game.snapshot().combat!.interactions!.weapons).toEqual(stock);
  const round = game.snapshot();
  round.combat!.match = { ...round.combat!.match!, phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player', held: [] };
  game.restore(round);const checkpoint = game.checkpoint();
  step(['match:rematch:0', 'match:rematch:1']);
  expect(game.snapshot().combat!.interactions!.weapons.filter(item => item.active !== false).map(item => item.id)).toEqual(['layout-pipe']);
  const next = game.snapshot();checkpoint.restore();step(['match:rematch:0', 'match:rematch:1']);expect(game.snapshot()).toEqual(next);
});
