import { expect, test } from "bun:test";
import { createCooperativeTaskCoordinator } from "./cooperative-tasks.ts";

test("cooperative tasks distribute across available peer capacity", () => {
  const coordinator = createCooperativeTaskCoordinator<{ cell: number }>({ leaseMs: 100 });
  coordinator.updatePeers([{ id: "a" }, { id: "b" }]);
  coordinator.enqueue("one", { cell: 1 });
  coordinator.enqueue("two", { cell: 2 });
  expect(coordinator.assign(0).map((assignment) => assignment.peerId)).toEqual(["a", "b"]);
});

test("expired cooperative leases reassign away from the timed-out peer", () => {
  const coordinator = createCooperativeTaskCoordinator<number>({ leaseMs: 10, maxAttempts: 3 });
  coordinator.updatePeers([{ id: "a" }, { id: "b" }]);
  coordinator.enqueue("path", 7);
  const first = coordinator.assign(0)[0];
  const second = coordinator.assign(10)[0];
  expect([first.peerId, second.peerId]).toEqual(["a", "b"]);
  expect(second.attempt).toBe(2);
  expect(coordinator.submitResult("path", "a", first.leaseToken, 99, 10)).toBe(false);
});

test("peer results remain untrusted until explicitly accepted or rejected", () => {
  const coordinator = createCooperativeTaskCoordinator<number>({ leaseMs: 100 });
  coordinator.updatePeers([{ id: "peer" }]);
  coordinator.enqueue("work", 5);
  const assignment = coordinator.assign(0)[0];
  expect(coordinator.submitResult("work", "peer", assignment.leaseToken, { answer: 10 }, 5)).toBe(true);
  expect(coordinator.state("work")?.state).toBe("verifying");
  expect(coordinator.pendingResult("work")?.result).toEqual({ answer: 10 });
  expect(coordinator.acceptResult("work")).toBe(true);
  expect(coordinator.state("work")?.state).toBe("completed");
});

test("cooperative task attempts fail closed after the configured bound", () => {
  const coordinator = createCooperativeTaskCoordinator<number>({ leaseMs: 1, maxAttempts: 1 });
  coordinator.updatePeers([{ id: "peer" }]);
  coordinator.enqueue("work", 1);
  coordinator.assign(0);
  expect(coordinator.expire(1)).toBe(1);
  expect(coordinator.state("work")?.state).toBe("failed");
  expect(coordinator.assign(2)).toEqual([]);
});
