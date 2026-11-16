import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDemonstrationBudget } from "./budget";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = resolve(import.meta.dir, "../.local"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "budget-test-")); directories.push(directory);
  const now = Date.now();
  return { file: join(directory, "budget.json"), id: crypto.randomUUID(), maximumUsd: 2,
    expiresAt: new Date(now + 3_600_000).toISOString(), now: () => now };
}
test("shared budget reserves hosting, serializes concurrent admissions and survives bridge restart", async () => {
  const options = await fixture(), budget = await createDemonstrationBudget(options);
  expect(budget.snapshot().reservedUsd).toBe(1);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => budget.reserve({ cpu: 2, memoryGB: 2 })));
  expect(results.filter(value => value.status === "fulfilled")).toHaveLength(3);
  expect(budget.snapshot().reservedUsd).toBeLessThanOrEqual(2);
  const restarted = await createDemonstrationBudget(options);
  expect(restarted.snapshot().admissions).toHaveLength(3);
  await expect(restarted.reserve({ cpu: 2, memoryGB: 2 })).rejects.toThrow("budget exhausted");
  await expect(createDemonstrationBudget({ ...options, maximumUsd: 10 })).rejects.toThrow("identity changed");
});
test("expiry and draining block new execution even when money remains", async () => {
  const options = await fixture(), budget = await createDemonstrationBudget(options);
  budget.drain(); expect(() => budget.assertActive()).toThrow("draining");
  await expect(budget.reserve({ cpu: 1, memoryGB: 1 })).rejects.toThrow("draining");
  const expired = await createDemonstrationBudget({ ...options, now: () => Date.parse(options.expiresAt) });
  expect(expired.expired()).toBe(true); expect(() => expired.assertActive()).toThrow("expired");
  await expect(createDemonstrationBudget({ ...options, file: options.file + ".invalid", expiresAt: new Date(options.now() + 7_200_001).toISOString() })).rejects.toThrow("two hours");
});
test("persistent control keeps its cumulative worker allowance across days and restarts",async()=>{
  const initial=await fixture(),options={...initial,expiresAt:null};
  const budget=await createDemonstrationBudget(options);
  await budget.reserve({cpu:2,memoryGB:2});
  const restarted=await createDemonstrationBudget({...options,now:()=>initial.now()+604800000});
  expect(restarted.expired()).toBe(false);expect(restarted.snapshot().admissions).toHaveLength(1);
  await expect(createDemonstrationBudget({...options,maximumUsd:10})).rejects.toThrow("identity changed");
  await restarted.reserve({cpu:2,memoryGB:2});await restarted.reserve({cpu:2,memoryGB:2});
  await expect(restarted.reserve({cpu:2,memoryGB:2})).rejects.toThrow("budget exhausted");
});
