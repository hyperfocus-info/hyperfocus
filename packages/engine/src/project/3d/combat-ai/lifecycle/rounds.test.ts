import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';

test('Theater preserves both personalities and learned moves between rounds, resamples each match, and replays exactly', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(['match:theater']);game.step([]);game.step(['match:start']);
  for (let i = 0; i < 260; i++) game.step([]);
  const saved = game.snapshot(), combat = saved.combat!;
  const memories = [combat.ai!, combat.playerAi!];
  expect(memories[0].personality).toBeDefined();expect(memories[1].personality).toBeDefined();
  expect(memories[0].personality!.preferences).not.toEqual(memories[1].personality!.preferences);
  const original = memories.map(brain => structuredClone(brain.personality!.preferences));
  for (const brain of memories) {
    brain.personality!.moves = [{ id: 'jab', attempts: 5, hits: 1, parries: 4, blocks: 0, whiffs: 0 }];
    brain.personality!.parried = 4;
  }
  combat.match = { ...combat.match!, phase: 'round-result', ticks: 1, winner: 'player', held: [] };
  combat.state.fighters[1]!.health = 0;
  game.restore(saved);game.step([]);
  const recovered = game.snapshot().combat!;
  for (const [index, brain] of [recovered.ai!, recovered.playerAi!].entries()) {
    expect(brain.personality!.preferences).toEqual(original[index]);
    expect(brain.personality!.rounds).toBe(1);
    expect(brain.personality!.parried).toBeCloseTo(3.2);
    expect(brain.personality!.moves.find(move => move.id === 'jab')!.parries).toBe(4);
  }
  const next = game.snapshot();next.combat!.match = { ...next.combat!.match!, phase: 'match-result', playerWins: 3, winner: 'player', held: [] };
  game.restore(next);game.step(['match:replay']);game.step([]);game.step(['match:start']);
  for (let i = 0; i < 181; i++) game.step([]);
  const fresh = game.snapshot().combat!;
  for (const [index, brain] of [fresh.ai!, fresh.playerAi!].entries()) {
    expect(brain.personality!.preferences).not.toEqual(original[index]);
    expect(brain.personality!.rounds).toBe(0);
    expect(brain.personality!.parried).toBe(0);
  }
  const checkpoint = game.checkpoint();
  for (let i = 0; i < 70; i++) game.step([]);
  const expected = game.snapshot();checkpoint.restore();
  for (let i = 0; i < 70; i++) game.step([]);
  expect(game.snapshot()).toEqual(expected);
});

test('AI walks off a fighter it landed on and resumes attacking instead of balancing forever', async () => {
  const { game } = await combatMotionFixture({ match: true });
  const saved = game.snapshot(), combat = saved.combat!;
  combat.match = { ...combat.match!, phase: 'fighting', held: [] };
  for (const [index, fighter] of combat.state.fighters.entries()) {
    fighter.position = { x: 0, y: index ? 4.05 : .85, z: 0 };
    saved.entities.find(entity => entity.id === fighter.id)!.position = [0, fighter.position.y, 0];
  }
  game.restore(saved);
  let separated = false, attacked = false;
  for (let tick = 0; tick < 450; tick++) {
    game.step();game.drainAudio();const fighters = game.snapshot().combat!.state.fighters;
    separated ||= Math.hypot(fighters[0]!.position.x - fighters[1]!.position.x, fighters[0]!.position.z - fighters[1]!.position.z) > 1;
    attacked ||= fighters[1]!.attackSerial > 0;
  }
  expect(separated).toBe(true);expect(attacked).toBe(true);
});
