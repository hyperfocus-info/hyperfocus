import { expect, test } from "bun:test";
import { isSwarmModelBudgetError } from "./model-budget";
import { swarmFixture } from "./test-fixtures";
import { createSwarmStore } from "./persistence/store";

test("rejected reservation persists exact dimension without charging or retrying it", () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.claim()!;
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTokensPerAgent = 256; });
    fixture.store.reserveModel(fixture.run.id, task.id, 200, 0);
    expect(() => {
      try { fixture.store.reserveModel(fixture.run.id, task.id, 100, 0); }
      catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ name: "SwarmModelBudgetError", rejection: { scope: "task", dimension: "tokens", requested: 100, used: 200, limit: 256, remaining: 56 } });
        expect(isSwarmModelBudgetError(error)).toBe(true);
        throw error;
      }
    }).toThrow("MODEL_BUDGET_EXHAUSTED: task tokens");
    const reopened = createSwarmStore({ db: fixture.db });
    expect(reopened.get(fixture.run.id)?.budgetRejection).toMatchObject({ taskId:task.id,scope:"task",dimension:"tokens",requested:100,used:200,limit:256,remaining:56 });
    expect(reopened.modelUsage(fixture.run.id, task.id)).toMatchObject({ calls:1,tokens:200 });
    expect(reopened.get(fixture.run.id)?.metrics.modelUnsettledTokens).toBe(200);
    reopened.settleModel({ runId:fixture.run.id,taskId:task.id,reservedTokens:200,reservedCost:0,inputTokens:90,outputTokens:10,costUsd:0 });
    expect(reopened.get(fixture.run.id)?.metrics.modelUnsettledTokens).toBe(0);
    reopened.reserveModel(fixture.run.id, task.id, 100, 0);
  } finally { fixture.db.close(); }
});

test("budget admission identity rejects a similarly shaped unrelated error", () => {
  const unrelated = Object.assign(new Error("MODEL_BUDGET_EXHAUSTED"), {
    name: "SwarmModelBudgetError", rejection: { scope: "run" },
  });
  expect(isSwarmModelBudgetError(unrelated)).toBe(false);
  expect(isSwarmModelBudgetError({ name: "SwarmModelBudgetError" })).toBe(false);
  expect(isSwarmModelBudgetError(null)).toBe(false);
});

test("aggregate overage persists usage and closes inference admission", () => {
  const fixture = swarmFixture();
  try {
    const task = fixture.claim()!;
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTotalTokens = 256; });
    fixture.store.reserveModel(fixture.run.id,task.id,200,0);
    expect(() => fixture.store.settleModel({ runId:fixture.run.id,taskId:task.id,reservedTokens:200,reservedCost:0,inputTokens:260,outputTokens:10,costUsd:0 })).toThrow("run tokens");
    expect(fixture.store.get(fixture.run.id)).toMatchObject({status:"BLOCKED",budgetExhausted:true,budgetRejection:{scope:"run",used:270,limit:256}});
    expect(() => fixture.store.reserveModel(fixture.run.id,task.id,1,0)).toThrow("Run stopped");
  } finally { fixture.db.close(); }
});
