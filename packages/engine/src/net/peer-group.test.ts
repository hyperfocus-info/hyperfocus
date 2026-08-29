import { expect, test } from "bun:test";
import { createMemoryPeerGroup } from "./memory-peer-group.ts";
import { isSignalingMessage } from "./peer-group.ts";

test("signaling messages require bounded identities and known message types", () => {
  expect(isSignalingMessage({ type: "offer", lobbyId: "room", from: "a", to: "b", data: {} })).toBe(true);
  expect(isSignalingMessage({ type: "offer", lobbyId: "", from: "a", to: "b" })).toBe(false);
  expect(isSignalingMessage({ type: "unknown", lobbyId: "room", from: "a" })).toBe(false);
  expect(isSignalingMessage({ type: "offer", lobbyId: "room", from: "a", to: 7 })).toBe(false);
});

test("memory peer group links peers and delivers reliable/input messages", () => {
  const a = createMemoryPeerGroup({ lobbyId: "net-test", peerId: "a" });
  const b = createMemoryPeerGroup({ lobbyId: "net-test", peerId: "b" });
  const reliable: unknown[] = [];
  const input: unknown[] = [];

  b.peers()[0].reliable.onMessage((payload, peerId) => reliable.push({ payload, peerId }));
  b.peers()[0].input.onMessage((payload, peerId) => input.push({ payload, peerId }));
  expect(a.broadcastReliable({ type: "hello" })).toEqual({ sent: 1, rejected: 0 });
  expect(a.broadcastInput({ frame: 1, input: 7 })).toEqual({ sent: 1, rejected: 0 });

  expect(reliable).toEqual([{ payload: { type: "hello" }, peerId: "a" }]);
  expect(input).toEqual([{ payload: { frame: 1, input: 7 }, peerId: "a" }]);

  a.close();
  b.close();
});

test("memory peer group channel listeners stay scoped to their peer", () => {
  const a = createMemoryPeerGroup({ lobbyId: "net-scope-test", peerId: "a" });
  const b = createMemoryPeerGroup({ lobbyId: "net-scope-test", peerId: "b" });
  const c = createMemoryPeerGroup({ lobbyId: "net-scope-test", peerId: "c" });
  const fromA: unknown[] = [];

  const aView = c.peers().find((peer) => peer.id === "a");
  aView?.reliable.onMessage((payload, peerId) => fromA.push({ payload, peerId }));

  b.broadcastReliable("from-b");
  a.broadcastReliable("from-a");

  expect(fromA).toEqual([{ payload: "from-a", peerId: "a" }]);

  a.close();
  b.close();
  c.close();
});

test("memory peer groups reject duplicate live ids and isolate payload objects", () => {
  const a = createMemoryPeerGroup({ lobbyId: "net-identity-test", peerId: "a" });
  expect(() => createMemoryPeerGroup({ lobbyId: "net-identity-test", peerId: "a" })).toThrow("already joined");
  const b = createMemoryPeerGroup({ lobbyId: "net-identity-test", peerId: "b" });
  const payload = { nested: { value: 1 } };
  b.peers()[0].reliable.onMessage((received) => {
    if (typeof received !== "object" || received === null || !Reflect.has(received, "nested")) throw new Error("Expected a nested peer payload");
    const nested = Reflect.get(received, "nested");
    if (typeof nested !== "object" || nested === null) throw new Error("Expected nested peer payload data");
    Reflect.set(nested, "value", 9);
  });

  a.broadcastReliable(payload);

  expect(payload.nested.value).toBe(1);
  a.close();
  b.close();
});

test("closed memory peer groups drop held channel deliveries and permit a clean reconnect", () => {
  const a = createMemoryPeerGroup({ lobbyId: "net-reconnect-test", peerId: "a" });
  const b = createMemoryPeerGroup({ lobbyId: "net-reconnect-test", peerId: "b" });
  const staleView = a.peers()[0];
  let received = 0;
  b.peers()[0].reliable.onMessage(() => received += 1);
  b.close();

  staleView.reliable.send("stale");
  const reconnected = createMemoryPeerGroup({ lobbyId: "net-reconnect-test", peerId: "b" });
  expect(received).toBe(0);
  expect(a.peers().map((peer) => peer.id)).toEqual(["b"]);

  a.close();
  reconnected.close();
});

test("memory peer groups enforce production payload limits and isolate listeners", () => {
  const a = createMemoryPeerGroup({ lobbyId: "net-limits-test", peerId: "a", maxPayloadBytes: 16, maxBufferedAmount: 4 });
  const b = createMemoryPeerGroup({ lobbyId: "net-limits-test", peerId: "b" });
  let delivered = 0;
  b.peers()[0].reliable.onMessage(() => { throw new Error("consumer failed"); });
  b.peers()[0].reliable.onMessage(() => { delivered += 1; });

  expect(a.peers()[0].reliable.send("12345")).toEqual({ status: "rejected", reason: "backpressure" });
  expect(a.peers()[0].reliable.send("ok")).toEqual({ status: "sent", bytes: 2 });
  expect(a.peers()[0].reliable.send({ value: Number.NaN })).toEqual({ status: "rejected", reason: "invalid-payload" });
  expect(delivered).toBe(1);

  a.close();
  b.close();
});
