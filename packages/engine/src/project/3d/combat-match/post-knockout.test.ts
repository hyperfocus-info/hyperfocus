import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('a late post-KO punch completes its authored recovery across the interlude boundary', async () => {
  const { game, project } = await combatMotionFixture({ match: true });
  const saved = game.snapshot(), combat = saved.combat!, move = project.extensions.hyperfocusCombat.config.moves.find(move => move.id === 'jab')!;
  combat.match = { ...combat.match!, phase: 'round-result', ticks: 181, winner: 'player', playerWins: 2, held: [] };
  combat.state.fighters[1]!.health = 0;
  combat.state.fighters[0]!.moveId = move.id;combat.state.fighters[0]!.moveFrame = move.startupFrames;
  game.restore(saved);const checkpoint = game.checkpoint();
  const run = () => {
    game.step([]);expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('jab');
    expect(game.snapshot().combat!.state.fighters[0]!.moveFrame).toBe(move.startupFrames + 1);
    for (let i = 0; i < move.activeFrames + move.recoveryFrames; i++) game.step([]);
    expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('');return game.snapshot();
  };
  const after = run();checkpoint.restore();expect(run()).toEqual(after);
});

test('real lethal contact retains hitstop then permits paid post-KO attacks and restores the same rollback', async () => {
  const { game } = await combatMotionFixture({ match: true, independentCombatInputs: true });
  const saved = game.snapshot();
  saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };
  saved.combat!.state.fighters[1]!.health = 1;
  game.restore(saved);
  const step = (attack = false) => game.step([], [
    { actions: new Set(attack ? ['jab'] : []), direction: { x: 1, y: 0, z: 0 } },
    { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } },
  ]);
  step(true);
  for (let i = 0; i < 30 && game.snapshot().combat!.state.fighters[1]!.health; i++) step();
  const lethal = game.snapshot();
  expect(lethal.combat!.state.fighters[1]!.health).toBe(0);
  expect(lethal.combat!.hitstop.remaining).toBe(19);
  const attackFrame = lethal.combat!.state.fighters[0]!.moveFrame;
  for (let i = 0; i < lethal.combat!.hitstop.remaining; i++) {
    step();const frozen = game.snapshot();
    expect(frozen.combat!.state.frame).toBe(lethal.combat!.state.frame);
    expect(frozen.combat!.state.fighters[0]!.moveFrame).toBe(attackFrame);
    expect(frozen.combat!.match!.phase).toBe('fighting');
  }
  step();expect(game.snapshot().combat!.match).toMatchObject({ phase: 'round-result', ticks: 390, winner: 'player', playerWins: 0 });
  const checkpoint = game.checkpoint(), liveFrame = game.snapshot().combat!.state.frame;
  const run = () => { for (let i = 0; i < 80; i++) step(i % 25 === 0);return game.snapshot(); };
  const after = run();
  expect(after.combat!.state.fighters[0]!.attackSerial).toBeGreaterThan(lethal.combat!.state.fighters[0]!.attackSerial);
  expect(after.combat!.state.fighters[1]!.health).toBe(0);
  expect(after.combat!.match!.playerWins).toBe(0);
  expect(after.combat!.match!.ticks).toBe(390 - (after.combat!.state.frame - liveFrame));
  expect(after.combat!.match!.ticks).toBeGreaterThan(280); // Corpse contact also receives its ordinary short impact pause.
  checkpoint.restore();expect(run()).toEqual(after);
});
