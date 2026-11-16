import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';

test('two level nines sustain varied actual exchanges and replay their pressure decisions', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(['match:theater']);game.step();game.step(['match:start']);
  const moves = new Map<string, number>(), serial = new Map<string, number>();
  const contacts = new Set<string>();let match = 0, longestRewardRun = 0, rewardRun = 0;
  let jabRun = 0, longestJabRun = 0;
  for (let tick = 0; tick < 6000; tick++) {
    game.advance();game.drainAudio();
    const state = game.combatState()!;
    for (const fighter of state.fighters) {
      if (fighter.moveId && serial.get(fighter.id) !== fighter.attackSerial) {
        moves.set(fighter.moveId, (moves.get(fighter.moveId) ?? 0) + 1);
        rewardRun = fighter.moveId === 'followup' ? rewardRun + 1 : 0;
        longestRewardRun = Math.max(longestRewardRun, rewardRun);
        jabRun = /^(followup|(?:drive-)?jab(?:-link)?)$/.test(fighter.moveId) ? jabRun + 1 : 0;
        longestJabRun = Math.max(longestJabRun, jabRun);
      }
      serial.set(fighter.id, fighter.attackSerial);
    }
    if (tick % 30 === 0) for (const outcome of game.aiReport()!.outcomes) contacts.add(`${match}:${outcome.event.id}`);
    if (game.combatMatch()?.phase === 'match-result') { game.step(['match:replay']);match++;serial.clear(); }
  }
  expect([...moves.values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(30);
  expect(moves.size).toBeGreaterThan(4);
  expect(contacts.size).toBeGreaterThan(15);
  expect(longestRewardRun).toBeLessThan(12);
  expect(longestJabRun).toBeLessThan(20);
  const checkpoint = game.checkpoint();
  for (let i = 0; i < 120; i++) game.advance();
  const continued = game.snapshot();checkpoint.restore();
  for (let i = 0; i < 120; i++) game.advance();
  expect(game.snapshot().combat).toEqual(continued.combat);
  expect(game.snapshot().entities).toEqual(continued.entities);
});
