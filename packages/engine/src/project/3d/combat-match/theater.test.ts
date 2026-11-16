import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatMatch3D } from './index.ts';
import { createFighter, type CombatSnapshot } from '../../../combat/state.ts';

test('theater runs two level-nine AIs, ignores spectator combat input, and replays both AI memories', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(new Set(['match:theater']));game.step(new Set());game.step(new Set(['match:start']));
  for (let i = 0; i < 180; i++) game.step(new Set());
  expect(game.snapshot().combat?.match).toMatchObject({ theater: true, difficulty: 9, phase: 'fighting' });
  for (let i = 0; i < 90; i++) game.step(new Set());
  const checkpoint = game.checkpoint();
  for (let i = 0; i < 30; i++) game.step(new Set(['a:heavy', 'a:guard', 'a:jump']));
  const withSpectator = game.snapshot();checkpoint.restore();
  for (let i = 0; i < 30; i++) game.step(new Set());
  expect(game.snapshot().combat).toEqual(withSpectator.combat);expect(game.snapshot().entities).toEqual(withSpectator.entities);
  expect(new Set(game.aiReport()?.choices.map(choice => choice.fighter)).size).toBe(2);
  game.step(new Set(['match:quit']));expect(game.snapshot().combat?.match?.phase).toBe('menu');expect(game.snapshot().combat?.match?.theater).toBeUndefined();
});

test('Theater result puts retry first and preserves both level-nine seats on a fresh match', () => {
  const match = createCombatMatch3D();
  match.restore({ ...match.capture(), theater: true, difficulty: 9, phase: 'match-result', playerWins: 3, winner: 'player', held: [] });
  const result = match.presentation({ title: 'Fight' });expect(result.actions?.[0]).toEqual({ action: 'match:replay', label: 'Retry theater' });
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [createFighter({ id: 'a', position: { x: 0, y: 1, z: 0 } }, 100), createFighter({ id: 'b', position: { x: 2, y: 1, z: 0 } }, 100)] };
  const next = match.step({ actions: new Set(['match:replay']), state, playerId: 'a', opponentId: 'b' });
  expect(next.resetRound).toBe(true);expect(match.capture()).toMatchObject({ phase: 'intro', theater: true, difficulty: 9, playerWins: 0, opponentWins: 0 });
});
