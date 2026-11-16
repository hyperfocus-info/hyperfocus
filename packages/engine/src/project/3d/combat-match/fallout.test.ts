import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatFallout3D } from './fallout.ts';
import { initialLearning, recordDecision, resolveLearning } from '../combat-ai/learning/model.ts';

const samples = () => [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }));
async function fightingFixture() {
  const fixture = await combatMotionFixture({ match: true, independentCombatInputs: true });
  const state = fixture.game.snapshot();state.combat!.match = { ...state.combat!.match!, phase: 'fighting', ticks: 0 };
  fixture.game.restore(state);
  return fixture;
}

test('a fallen living fighter dies immediately without a hitstop or an opponent attack credit', async () => {
  const { game, runtime } = await fightingFixture();
  runtime.physics.setPosition('a', 0, -20, 0);
  game.advance({ actions: [], fighterInputs: samples() });
  const state = game.snapshot().combat!;
  expect(state.state.fighters[0]!.health).toBe(0);
  expect(state.state.fighters[1]!.health).toBe(100);
  expect(state.hitstop.remaining).toBe(0);
  game.advance({ actions: [], fighterInputs: samples() });
  expect(game.combatMatch()!.winner).toBe('opponent');
});

test('fallout resolves independently of armor, guard, and protection and is emitted once', async () => {
  const { game, runtime } = await combatMotionFixture();
  const fallout = createCombatFallout3D({ runtime, fighterIds: ['a', 'b'] });
  const state = game.snapshot().combat!.state;
  Object.assign(state.fighters[0]!, { armorFrames: 60, protectionFrames: 60, guarding: true });
  runtime.physics.setPosition('a', 0, fallout.minimumY - .001, 0);
  const events = fallout.resolve(state);
  expect(events).toHaveLength(1);
  expect(events[0]!.defenseReason).toBe('out-of-bounds');
  expect(events[0]!.environmentId).toBe('out-of-bounds');
  expect(events[0]!.damage).toBe(100);
  expect(state.fighters[0]!.health).toBe(0);
  expect(fallout.resolve(state)).toEqual([]);
});

test('an opponent fallout censors an unproven action instead of learning fabricated attack success', async () => {
  const { game, runtime } = await combatMotionFixture();
  const state = game.snapshot().combat!.state;
  const model = initialLearning();const chosen = { id: 'wait', score: 1 };
  recordDecision(model, { frame: state.frame, context: 'near:ground:ground:neutral', candidates: [chosen], chosen, probability: 1 });
  runtime.physics.setPosition('b', 0, -20, 0);
  const events = createCombatFallout3D({ runtime, fighterIds: ['a', 'b'] }).resolve(state);
  resolveLearning(model, { state, events, fighterId: 'a', targetId: 'b' });
  expect(model.actions).toEqual([]);
  expect(model.traces[0]!.status).toBe('censored');
});

test('underground geometry and authored underground spawns lower the fixed boundary; roofs remain legal', async () => {
  const { game, runtime } = await combatMotionFixture();
  runtime.physics.setPosition('floor', 0, -30, 0);
  const fallout = createCombatFallout3D({ runtime, fighterIds: ['a', 'b'], spawnPositions: [[0, -50, 0]] });
  expect(fallout.minimumY).toBe(-54);
  const state = game.snapshot().combat!.state;
  for (const y of [150, 6, -29, -50, -54]) {
    runtime.physics.setPosition('a', 0, y, 0);
    expect(fallout.resolve(state)).toEqual([]);
  }
  runtime.physics.configureBody('floor', { collisionMask: 0 });runtime.physics.setPosition('floor', 0, -10000, 0);
  runtime.physics.setPosition('a', 0, -55, 0);
  expect(fallout.resolve(state)).toHaveLength(1);
});

test('fallout recovers at an authored pose and completes a three-round set rather than reviving in the void', async () => {
  const { game, runtime } = await fightingFixture();
  for (let round = 0; round < 3; round++) {
    runtime.physics.setPosition('a', 0, -20, 0);
    game.advance({ actions: [], fighterInputs: samples() });
    for (let tick = 0; tick < 391; tick++) game.advance({ actions: [], fighterInputs: samples() });
    expect(game.combatMatch()!.opponentWins).toBe(round + 1);
    if (round < 2) {
      expect(game.combatMatch()!.phase).toBe('fighting');
      expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(100);
      expect(runtime.physics.body('a')!.y).toBeGreaterThan(0);
    }
  }
  expect(game.combatMatch()!.phase).toBe('match-result');
});

test('simultaneous fallout is a draw and both fighters recover safely', async () => {
  const { game, runtime } = await fightingFixture();
  runtime.physics.setPosition('a', 0, -20, 0);runtime.physics.setPosition('b', 10, -20, 0);
  game.advance({ actions: [], fighterInputs: samples() });game.advance({ actions: [], fighterInputs: samples() });
  expect(game.combatMatch()!.winner).toBe('draw');
  for (let tick = 0; tick < 390; tick++) game.advance({ actions: [], fighterInputs: samples() });
  expect(game.combatMatch()!.playerWins).toBe(0);expect(game.combatMatch()!.opponentWins).toBe(0);
  for (const id of ['a', 'b']) expect(runtime.physics.body(id)!.y).toBeGreaterThan(0);
});

test('complete rollback repeats fallout and its recovery deterministically', async () => {
  const { game, runtime } = await fightingFixture();
  runtime.physics.setPosition('a', 0, -20, 0);
  const checkpoint = game.checkpoint();
  const continuation = () => { for (let tick = 0; tick < 392; tick++) game.advance({ actions: [], fighterInputs: samples() });return game.checkpoint().state; };
  const expected = continuation();checkpoint.restore();expect(continuation()).toEqual(expected);
});
