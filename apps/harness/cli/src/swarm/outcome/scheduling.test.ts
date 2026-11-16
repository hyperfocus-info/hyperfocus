import { expect, test } from "bun:test";
import { createSwarmCoordinator } from "../coordinator";
import { executionFixture, swarmFixture } from "../test-fixtures";

test("measurement waits for investigations across runs and excludes new work until durable completion", () => {
  const fixture = swarmFixture();
  try {
    fixture.finish(fixture.claim()!);
    const investigation = fixture.claim()!;
    const other = structuredClone(fixture.run);
    other.id = "other-run"; other.request.requestId = "other-request";
    for (const task of other.tasks) { task.id = `other-${task.id}`; task.swarmId = other.id; task.dependencies = task.dependencies.map(id => `other-${id}`); }
    fixture.store.create(other);
    const claimOther = () => fixture.store.claim({ runId: other.id, owner: "other-worker", ttlMs: 1_000, capabilities: ["execution", "benchmark", "reasoning"], computeReservationUsd: 0 });
    expect(claimOther()).toBeUndefined();
    fixture.finish(investigation);
    const measurement = claimOther()!;
    expect(measurement.kind).toBe("baseline");
    expect(fixture.claim()).toBeUndefined();
    fixture.store.finish({ runId: other.id, taskId: measurement.id, owner: measurement.leaseOwner!, fence: measurement.leaseFence });
    expect(fixture.claim()).toBeDefined();
  } finally { fixture.db.close(); }
});

test("global measurement exclusion skips idle admission checks for other runs", async () => {
  const fixture = swarmFixture(), execution = executionFixture(), measurement = fixture.claim()!;
  const other = structuredClone(fixture.run);
  other.id = "waiting-run"; other.request.requestId = "waiting-request";
  for (const task of other.tasks) { task.id = `waiting-${task.id}`; task.swarmId = other.id; task.dependencies = task.dependencies.map(id => `waiting-${id}`); }
  fixture.store.create(other);
  let admissionCalls = 0, calls = 0;
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider,
    beforeDispatch: async () => { admissionCalls++; return { available: false, reason: "Subscription unavailable." }; },
    handleTask: async () => { calls++; },
  });
  try {
    for (let index = 0; index < 25; index++) await coordinator.tick();
    expect(admissionCalls).toBe(0); expect(calls).toBe(0);
    expect(fixture.store.get(other.id)!.metrics.computeEstimatedUsd).toBe(0);
    fixture.finish(measurement); coordinator.cancel(fixture.run.id);
    await coordinator.tick();
    expect(admissionCalls).toBe(1); expect(calls).toBe(0);
    expect(fixture.store.get(other.id)!.status).toBe("BLOCKED");
    expect(fixture.store.get(other.id)!.metrics.computeEstimatedUsd).toBe(0);
  } finally { await coordinator.close(); fixture.db.close(); }
});
