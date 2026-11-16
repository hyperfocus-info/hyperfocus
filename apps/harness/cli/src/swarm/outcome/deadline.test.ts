import { expect, test } from "bun:test";
import { swarmModelDeadline } from "../reasoning/model-turn";
import { swarmFixture } from "../test-fixtures";

test("model response time uses the remaining task and run ceilings without a hidden two-minute timeout", () => {
  const fixture = swarmFixture();
  try {
    const run = fixture.run, task = run.tasks[0]!;
    run.startedAt = 1_000; run.request.budget.maxDurationMs = 900_000;
    task.startedAt = 10_000; run.request.budget.maxTaskDurationMs = 600_000;
    expect(swarmModelDeadline(run, task, 20_000)).toBe(610_000);
    expect(swarmModelDeadline(run, task, 400_000)).toBe(610_000);
    run.request.budget.maxDurationMs = 300_000;
    expect(swarmModelDeadline(run, task, 200_000)).toBe(301_000);
  } finally { fixture.db.close(); }
});
