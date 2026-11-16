import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatProject3D, readCombatProject3D } from '../combat-declaration.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { combatArenaLayout, readCombatArenaLayouts } from './arena-layouts.ts';

const layouts = (): NonNullable<ReturnType<typeof createCombatProject3D>['arenaLayouts']> => Array.from({ length: 5 }, (_, district) => ({ id: `district-${district}`, variants: Array.from({ length: 3 }, (_, variant) => ({ id: `shape-${variant}`, props: [{ entityId: `wall-${district}`, position: [variant * 12, 2, district * 10] }] })) }));

test('structural districts vary independently of ten starting locations and always change on the next match', () => {
  const definition = createCombatProject3D();definition.arenaLayouts = layouts();
  for (const index of [...Array.from({ length: 150 }, (_, index) => index), 4294967293, 4294967294]) {
    const selected = combatArenaLayout(definition, index)!;
    expect(combatArenaLayout(definition, index)).toEqual(selected);
    const next = combatArenaLayout(definition, index + 1)!;
    expect(next.selected.every((item, slot) => item.variantId !== selected.selected[slot]!.variantId)).toBe(true);
    expect(selected.props).toHaveLength(5);
  }
  expect(combatArenaLayout(definition, 10)).not.toEqual(combatArenaLayout(definition, 0));
  for (const count of [1, 2, 4, 5, 6, 7, 8]) {
    definition.arenaLayouts = [{ id: 'district', variants: Array.from({ length: count }, (_, index) => ({ id: String(index), props: [] })) }];
    for (let index = 0; index < 100; index++) if (count > 1) expect(combatArenaLayout(definition, index)!.selected).not.toEqual(combatArenaLayout(definition, index + 1)!.selected);
  }
});

test('structural layouts reject conflicting ownership, inconsistent sets, unknown fields and unbounded input', () => {
  const valid = layouts();expect(readCombatArenaLayouts(valid)).toEqual(valid);expect(readCombatArenaLayouts([])).toBeUndefined();
  const invalid: unknown[] = [null, Array(9).fill(valid[0]), [{ ...valid[0], surprise: true }], [{ ...valid[0], variants: [] }], [{ ...valid[0], variants: Array(9).fill(valid[0]!.variants[0]) }]];
  const missing = structuredClone(valid);missing[0]!.variants[1]!.props = [];invalid.push(missing);
  const duplicate = structuredClone(valid);duplicate[1]!.variants.forEach(variant => { variant.props[0]!.entityId = 'wall-0'; });invalid.push(duplicate);
  for (const coordinate of [NaN, Infinity, 100001]) { const bad = structuredClone(valid);bad[0]!.variants[0]!.props[0]!.position[0] = coordinate;invalid.push(bad); }
  for (const value of invalid) expect(() => readCombatArenaLayouts(value)).toThrow();
  expect(() => readCombatArenaLayouts(valid, ['wall-0'])).toThrow();
  const definition = createCombatProject3D();definition.arenaLayouts = valid;
  definition.fighters = [{ entityId: 'wall-0', control: 'dummy', actionPrefix: 'wall:' }];expect(() => readCombatProject3D(definition)).toThrow();
  definition.fighters = [];definition.spawns = [{ id: 'start', positions: [], props: [{ entityId: 'wall-0', position: [0, 0, 0] }] }];expect(() => readCombatProject3D(definition)).toThrow();
});

test('selected structures move real physics, persist through rounds and JSON saves, and restore identically on rollback', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const definition = fixture.project.extensions.hyperfocusCombat;
  const scene = fixture.project.extensions.hyperfocus3D.scenes[0]!;
  const floor = scene.entities.find(entity => entity.id === 'floor')!;
  scene.entities.push({ ...structuredClone(floor), id: 'wall', position: [0, 2, 10], scale: [2, 4, 1] });
  definition.spawns = Array.from({ length: 10 }, (_, index) => ({ id: `start-${index}`, positions: [[0, 1, 0], [4, 1, 0]] }));
  definition.arenaLayouts = [{ id: 'market', variants: [0, 1, 2].map(index => ({ id: `shape-${index}`, props: [{ entityId: 'wall', position: [index * 12, 2, 10] }] })) }];
  const make = async () => {
    const runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets);
    return { runtime, game: createGameplay3D({ project: fixture.project, runtime, combatQueueSeed: 7, independentCombatInputs: true, externalCombatMatch: true }) };
  };
  const { game, runtime } = await make(), peer = await make();
  const selected = combatArenaLayout(definition, 7)!;
  expect(runtime.physics.body('wall')!.x).toBe(selected.props[0]!.position[0]);
  expect(peer.game.snapshot()).toEqual(game.snapshot());
  const idle = { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } };
  const step = (actions: string[] = []) => game.step(actions, [idle, idle]);
  const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'round-result', ticks: 1, winner: 'player', held: [] };
  game.restore(JSON.parse(JSON.stringify(saved)));step();
  expect(runtime.physics.body('wall')!.x).toBe(selected.props[0]!.position[0]);
  expect(game.snapshot().entities.find(entity => entity.id === 'wall')!.position).toEqual(selected.props[0]!.position);
  const round = game.snapshot();round.combat!.match = { ...round.combat!.match!, phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player', held: [] };
  game.restore(round);const checkpoint = game.checkpoint();step(['match:rematch:0', 'match:rematch:1']);
  expect(runtime.physics.body('wall')!.x).toBe(combatArenaLayout(definition, 8)!.props[0]!.position[0]);
  const next = game.snapshot();checkpoint.restore();step(['match:rematch:0', 'match:rematch:1']);expect(game.snapshot()).toEqual(next);
  game.restore(JSON.parse(JSON.stringify(next)));expect(runtime.physics.body('wall')!.x).toBe(combatArenaLayout(definition, 8)!.props[0]!.position[0]);
  const localRuntime = await createHyperfocus3DRuntime(fixture.project, fixture.assets), local = createGameplay3D({ project: fixture.project, runtime: localRuntime, combatQueueSeed: 7 });
  local.step(['match:practice']);local.step(['a:reset']);expect(localRuntime.physics.body('wall')!.x).toBe(0);
});

test('runtime rejects missing or animated structural objects', async () => {
  const fixture = await combatMotionFixture({ match: true });
  const definition = fixture.project.extensions.hyperfocusCombat;
  definition.arenaLayouts = [{ id: 'market', variants: [{ id: 'shape', props: [{ entityId: 'missing', position: [1, 2, 3] }] }] }];
  await expect(createHyperfocus3DRuntime(fixture.project, fixture.assets)).rejects.toThrow('existing non-animated');
  definition.arenaLayouts[0]!.variants[0]!.props[0]!.entityId = 'floor';
  Object.assign(fixture.project.extensions.hyperfocus3D.scenes[0]!.entities.find(entity => entity.id === 'floor')!, { animation: { kind: 'ping-pong', offset: [1, 0, 0], periodSeconds: 2 } });
  await expect(createHyperfocus3DRuntime(fixture.project, fixture.assets)).rejects.toThrow('existing non-animated');
});
