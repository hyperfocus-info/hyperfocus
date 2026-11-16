import { expect, test } from 'bun:test';
import { createCpuPreparationWorkload } from "./workload.ts";
import { touchOfDeathSwarmRecipe } from "./recipe.ts";

test('CPU workload uses current game source and restores exact gameplay state between bounded trials', async () => {
  const workload = await createCpuPreparationWorkload();
  const first = workload.frame(), state = workload.checkpoint();
  workload.reset(); const repeated = workload.frame();
  expect(workload.checkpoint()).toEqual(state);
  expect(repeated.entityCount).toBe(first.entityCount);
  expect(repeated.commandCount).toBe(first.commandCount);
  expect(first.entityCount).toBeGreaterThan(1000);
  expect(first.commandCount).toBeGreaterThan(0);
}, 30000);

test('CPU recipe retains browser correctness blockers instead of promoting a narrow timing win', () => {
  expect(touchOfDeathSwarmRecipe.blockedPromotionReasons.some(reason => reason.includes('exact-image'))).toBe(true);
  expect(touchOfDeathSwarmRecipe.blockedPromotionReasons.some(reason => reason.includes('display freshness'))).toBe(true);
  expect(touchOfDeathSwarmRecipe.validationCommands.length).toBeGreaterThan(0);
});
