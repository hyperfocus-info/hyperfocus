import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import type { GameplaySnapshot3D } from '../gameplay.ts';

function standOnFloor(snapshot: GameplaySnapshot3D) {
  for (const fighter of snapshot.combat!.state.fighters) {
    fighter.position.y = .8;snapshot.entities.find(entity => entity.id === fighter.id)!.position[1] = .8;
  }
}

test('a surviving round winner recovers stamina at the authored idle pace while the KO remains defeated', async () => {
  for (const winner of ['player', 'opponent'] as const) {
    const { game } = await combatMotionFixture({ match: true, independentCombatInputs: true, staminaRegen: .25, idleStaminaRegen: .5, airStaminaRegen: .1 });
    const saved = game.snapshot(), combat = saved.combat!, seat = winner === 'player' ? 0 : 1;
    standOnFloor(saved);
    combat.match = { ...combat.match!, phase: 'round-result', ticks: 180, winner, held: [] };
    const survivor = combat.state.fighters[seat]!, defeated = combat.state.fighters[1 - seat]!;
    survivor.stamina = 20;survivor.health = 70;defeated.health = 0;defeated.stamina = 12;
    game.restore(saved);const checkpoint = game.checkpoint();
    const run = () => {
      for (let i = 0; i < 60; i++) game.step([], [0, 1].map(() => ({ actions: new Set(['jab', 'dash']), direction: { x: 0, y: 0, z: 0 } })));
      return game.snapshot();
    };
    const after = run(), recovered = after.combat!.state.fighters[seat]!, knockedOut = after.combat!.state.fighters[1 - seat]!;
    expect(recovered.stamina).toBeCloseTo(50);expect(recovered.health).toBe(70);
    expect(recovered.attackSerial).toBe(survivor.attackSerial);expect(recovered.moveId).toBe('');
    expect(knockedOut.health).toBe(0);expect(knockedOut.stamina).toBe(12);
    expect(after.combat!.match).toMatchObject({ phase: 'round-result', ticks: 120, winner, playerWins: 0, opponentWins: 0 });
    checkpoint.restore();expect(run()).toEqual(after);
  }
});

test('finishing attack commitment still completes before interlude recovery and the next round keeps its authored refill', async () => {
  const { game, project } = await combatMotionFixture({ match: true, independentCombatInputs: true, staminaRegen: .25, idleStaminaRegen: .5 });
  const saved = game.snapshot(), combat = saved.combat!, move = project.extensions.hyperfocusCombat.config.moves.find(move => move.id === 'jab')!;
  standOnFloor(saved);
  const step = () => game.step([], [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } })));
  combat.match = { ...combat.match!, phase: 'round-result', ticks: 180, winner: 'player', held: [] };
  Object.assign(combat.state.fighters[0]!, { stamina: 20, moveId: move.id, moveFrame: move.startupFrames });
  Object.assign(combat.state.fighters[1]!, { health: 0, stamina: 12 });
  game.restore(saved);
  const remaining = move.activeFrames + move.recoveryFrames;
  for (let i = 0; i < remaining - 1; i++) step();
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(20);
  step();expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('');
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(20.5);
  const end = game.snapshot();end.combat!.match!.ticks = 1;
  game.restore(end);step();const next = game.snapshot().combat!;
  expect(next.match).toMatchObject({ phase: 'fighting', playerWins: 1, opponentWins: 0, winner: '' });
  expect(next.state.fighters.map(fighter => fighter.stamina)).toEqual([100, 100]);
  expect(next.state.fighters.map(fighter => fighter.health)).toEqual([100, 100]);
});

test('countdown and final result recovery cap normally without advancing attacks, health or frozen combat frames', async () => {
  for (const phase of ['countdown', 'match-result'] as const) {
    const { game } = await combatMotionFixture({ match: true, staminaRegen: .25, idleStaminaRegen: .5 });
    const saved = game.snapshot(), combat = saved.combat!;
    standOnFloor(saved);
    combat.match = { ...combat.match!, phase, ticks: phase === 'countdown' ? 120 : 0, playerWins: phase === 'match-result' ? 3 : 0, winner: phase === 'match-result' ? 'player' : '', held: [] };
    Object.assign(combat.state.fighters[0]!, { stamina: 99.2, health: 70 });
    Object.assign(combat.state.fighters[1]!, { health: 0, stamina: 12 });
    game.restore(saved);const before = game.snapshot();
    game.step(['a:jab']);const first = game.snapshot();expect(first.combat!.state.fighters[0]!.stamina).toBeCloseTo(99.7);
    for (let i = 0; i < 3; i++) game.step(['a:jab']);
    const after = game.snapshot();expect(after.combat!.state.fighters[0]!.stamina).toBe(100);
    expect(after.combat!.state.fighters[0]!.health).toBe(70);expect(after.combat!.state.fighters[1]!.health).toBe(0);
    expect(after.combat!.state.fighters[1]!.stamina).toBe(12);
    expect(after.combat!.state.frame).toBe(before.combat!.state.frame);
    expect(after.combat!.state.fighters.map(fighter => fighter.attackSerial)).toEqual(before.combat!.state.fighters.map(fighter => fighter.attackSerial));
    expect(after.combat!.match!.playerWins).toBe(before.combat!.match!.playerWins);
    expect(after.combat!.match!.phase).toBe(phase);
  }
});

test('airborne gaps use airborne recovery, and zero configured regeneration never creates stamina', async () => {
  for (const regen of [0, .1]) {
    const { game } = await combatMotionFixture({ match: true, staminaRegen: regen, idleStaminaRegen: regen ? .5 : 0, airStaminaRegen: regen });
    const saved = game.snapshot(), combat = saved.combat!;
    combat.match = { ...combat.match!, phase: 'round-result', ticks: 180, winner: 'player', held: [] };
    const survivor = combat.state.fighters[0]!;survivor.stamina = 20;survivor.position.y = 20;survivor.wasAirborne = true;
    saved.entities.find(entity => entity.id === survivor.id)!.position[1] = 20;
    combat.state.fighters[1]!.health = 0;
    game.restore(saved);game.step([]);
    expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(20 + regen);
  }
});
