import { expect, test } from "bun:test";
import { createMeshHostCoordinator } from "./mesh-host.ts";

test("mesh host election deterministically chooses the lowest connected peer after a grace period", () => {
  const coordinator = createMeshHostCoordinator({ localPeerId: "peer-b", electionDelayMs: 100, now: () => 0 });
  coordinator.updatePeers(["peer-c", "peer-a"], 0);
  expect(coordinator.serverDisconnected(10)).toMatchObject({ mode: "electing", role: "candidate", electionDeadline: 110 });
  expect(coordinator.tick(109).hostId).toBeUndefined();
  expect(coordinator.tick(110)).toMatchObject({ mode: "mesh", hostId: "peer-a", role: "mesh-peer" });
  expect(coordinator.announcement()).toEqual({ term: 1, hostId: "peer-a" });
});

test("mesh host loss triggers a new term and server reconnect revokes temporary authority", () => {
  const coordinator = createMeshHostCoordinator({ localPeerId: "peer-b", electionDelayMs: 0, now: () => 0 });
  coordinator.updatePeers(["peer-a"], 0);
  coordinator.serverDisconnected(1);
  expect(coordinator.state().hostId).toBe("peer-a");
  coordinator.updatePeers([], 2);
  expect(coordinator.state()).toMatchObject({ term: 2, hostId: "peer-b", role: "temporary-host" });
  expect(coordinator.serverReconnected(3)).toMatchObject({ mode: "server", term: 3, role: "server-client" });
  expect(coordinator.announcement()).toBeUndefined();
});

test("mesh announcements cannot elevate an ineligible peer", () => {
  const coordinator = createMeshHostCoordinator({ localPeerId: "b", electionDelayMs: 100, now: () => 0 });
  coordinator.updatePeers(["a", "c"], 0);
  coordinator.serverDisconnected(0);
  expect(coordinator.receiveAnnouncement({ term: 1, hostId: "c" }, 1)).toBe(false);
  expect(coordinator.receiveAnnouncement({ term: 5, hostId: "a" }, 1)).toBe(false);
  expect(coordinator.receiveAnnouncement({ term: 1, hostId: "a" }, 1)).toBe(true);
  expect(coordinator.state()).toMatchObject({ term: 1, hostId: "a" });
});
