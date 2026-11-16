import { expect, test } from 'bun:test';
import { probeCpuPreparation } from "./probe.ts";
import { createCpuPreparationWorkload } from "./workload.ts";
import { touchOfDeathSwarmRecipe } from "./recipe.ts";

test('real city application distinguishes unchanged work, one input edit and external live-state repair', async () => {
  const receipt = await probeCpuPreparation();
  expect(receipt.entityCount).toBeGreaterThan(1000);
  expect(receipt.unchanged.entityTransformComparisons).toBe(receipt.entityCount);
  expect(receipt.unchanged.entityTransformWrites).toBe(0);
  expect(receipt.changed.entityTransformWrites).toBe(1);
  expect(receipt.restored.entityTransformWrites).toBe(1);
  expect(receipt.repaired.entityTransformWrites).toBe(1);
  expect(receipt.hashes.changedFrame).not.toBe(receipt.hashes.frameBefore);
  expect(receipt.hashes.frameAfter).toBe(receipt.hashes.frameBefore);
  expect(receipt.hashes.gameplayAfter).toBe(receipt.hashes.gameplayBefore);
  expect(receipt.redundantUnchangedTraversal).toBe(true);
  expect(receipt.singleChangeStillScansScene).toBe(true);
  expect(receipt.liveStorageRequiresValidation).toBe(true);
  expect(await probeCpuPreparation()).toEqual(receipt);
}, 30000);

test('acceptance workload leaves structural diagnostics disabled', async () => {
  const workload = await createCpuPreparationWorkload();
  expect(workload.diagnostics).toBeUndefined();
}, 30000);

test('a supported live-storage invariant cannot authorize an optimization candidate', () => {
  const instrument = touchOfDeathSwarmRecipe.investigationInstruments.find(item => item.id === 'tod-live-storage-repair');
  expect(instrument?.implementationEligible).toBe(false);
});
