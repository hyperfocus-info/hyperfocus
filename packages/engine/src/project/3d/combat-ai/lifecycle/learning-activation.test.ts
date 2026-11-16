import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { canonicalSaveJson } from '../../../../save/index.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { initialLearning } from '../learning/model.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';

function model() {
  const model = initialLearning({ opponentId: 'general' });
  model.actions.push({ action: 'attack:jab', context: 'near:ground:ground:neutral', samples: 40, reward: 20 });
  return model;
}

test('queued learning preserves the current round and survives exact JSON restoration', () => {
  const brain = createCombatAi3D({ config: createTouchOfDeathPreset(), learning: initialLearning() });
  const next = model();brain.queueLearning({ model: next });next.actions[0]!.reward = -20;
  expect(brain.learning()?.actions).toEqual([]);
  brain.reset({ round: true });expect(brain.learning()?.actions).toEqual([]);
  const saved = JSON.parse(canonicalSaveJson(brain.capture()));
  brain.reset();expect(brain.learning()?.actions[0]?.reward).toBe(20);
  expect(brain.capture().queuedLearning).toBeUndefined();
  brain.restore(saved);expect(brain.capture()).toEqual(saved);
  brain.reset();expect(brain.learning()?.actions[0]?.reward).toBe(20);
  brain.reset();expect(brain.learning()?.actions[0]?.reward).toBe(20);
  brain.queueLearning({});brain.reset();expect(brain.learning()?.actions).toEqual([]);
});

test('gameplay adopts both saved models at the next match and preserves queued revisions through checkpoints', async () => {
  const { game } = await combatMotionFixture({ match: true });
  const next = model(), before = game.combatAiLearning();
  game.queueCombatAiLearning({ models: [next, next] });
  expect(game.combatAiLearning()).toEqual(before);
  const invalid = model();invalid.actions[0]!.samples = NaN;
  expect(() => game.queueCombatAiLearning({ models: [undefined, invalid] })).toThrow();
  expect(game.snapshot().combat?.playerAi?.queuedLearning?.actions).toEqual(next.actions);
  const saved = JSON.parse(canonicalSaveJson(game.snapshot())), checkpoint = game.checkpoint();
  game.step(['match:start']);
  expect(game.combatAiLearning()?.map(value => value?.actions)).toEqual([next.actions, next.actions]);
  expect(game.combatAiLearning()?.map(value => value?.opponentId)).toEqual(['b', 'a']);
  checkpoint.restore();expect(game.combatAiLearning()).toEqual(before);
  game.restore(saved);expect(game.snapshot()).toEqual(saved);
  game.step(['match:theater']);
  for (let tick = 0; tick < 430; tick++) game.step();
  // Observing the actual opponent must retain the durable rows after activation.
  expect(game.combatAiLearning()?.every(value => value?.actions.some(row => row.action === 'attack:jab' && row.samples >= 40))).toBe(true);
});
