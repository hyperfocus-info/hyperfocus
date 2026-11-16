import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D } from '../../gameplay.ts';
import { initialLearning } from './model.ts';
import { readLearning } from './validation.ts';

test('both dormant and active gameplay seats persist optional models/tuning and return detached evidence', async () => {
  const { runtime, project } = await combatMotionFixture({ match: true });
  const first = initialLearning({ opponentId: 'seat-one-policy' }), second = initialLearning({ opponentId: 'seat-zero-policy' });
  first.actions = [{ context: 'near:ground:ground:neutral', action: 'attack:jab', samples: 4, reward: 1 }];
  const game = createGameplay3D({ runtime, project, combatAiLearning: [first, second], combatAiTuning: [
    { mode: 'adaptive', opponentId: first.opponentId }, { mode: 'adaptive', learningFrozen: true, opponentId: second.opponentId },
  ] });
  first.actions[0]!.reward = -4;
  const saved = JSON.parse(JSON.stringify(game.snapshot()));
  expect(saved.combat.playerAi.learning.actions[0].reward).toBe(1);
  expect(saved.combat.playerAi.tuning.mode).toBe('adaptive');
  expect(saved.combat.ai.tuning.learningFrozen).toBe(true);
  const models = game.combatAiLearning()!;
  expect(readLearning(models[0]).actions[0]!.reward).toBe(1);
  models[0]!.actions[0]!.reward = -4;
  expect(game.combatAiLearning()![0]!.actions[0]!.reward).toBe(1);
  const restored = createGameplay3D({ runtime, project });restored.restore(saved);
  expect(restored.combatAiLearning()).toEqual(game.combatAiLearning());
  expect(restored.snapshot().combat!.playerAi!.tuning).toEqual(saved.combat.playerAi.tuning);
  const checkpoint = restored.checkpoint();restored.advance({ actions: ['match:theater'] });checkpoint.restore();
  expect(restored.snapshot().combat!.playerAi!.learning).toEqual(saved.combat.playerAi.learning);
});

test('legacy checkpoint restoration adopts adaptive defaults without fabricating learning history', async () => {
  const { runtime, project, game } = await combatMotionFixture({ match: true });
  const saved = JSON.parse(JSON.stringify(game.snapshot()));
  delete saved.combat.ai.tuning;delete saved.combat.ai.learning;
  if (saved.combat.playerAi) { delete saved.combat.playerAi.tuning;delete saved.combat.playerAi.learning; }
  const configured = createGameplay3D({ runtime, project, combatAiTuning: [{ mode: 'adaptive' }, { mode: 'adaptive' }] });
  configured.restore(saved);
  expect(configured.snapshot().combat!.ai!.tuning).toEqual({ mode: 'adaptive', adaptation: true, compression: false });
  expect(configured.snapshot().combat!.playerAi?.tuning).toEqual({ mode: 'adaptive', adaptation: true, compression: false });
  expect(configured.combatAiLearning()![0]).toBeUndefined();
  expect(configured.combatAiLearning()![1]).toBeUndefined();
});
