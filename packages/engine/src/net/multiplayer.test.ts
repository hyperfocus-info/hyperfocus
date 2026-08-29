import { expect, test } from "bun:test";
import { createMemoryPeerGroup } from "./memory-peer-group.ts";
import { createMultiplayer } from "./multiplayer.ts";

test("multiplayer memory sessions sync shared store patches", async () => {
  const a = await createMultiplayer({ lobbyId: "mp-test", peerId: "a", memory: true, initialStore: { players: { a: { color: "red" } } } });
  const b = await createMultiplayer({ lobbyId: "mp-test", peerId: "b", memory: true, initialStore: { players: { a: { color: "red" } } } });

  a.store.players.a.color = "blue";

  expect(b.store.players.a.color).toBe("blue");

  a.close();
  b.close();
});

test("multiplayer rejects patches whose author does not match the sending peer", async () => {
  const a = await createMultiplayer({ lobbyId: "mp-spoof-test", peerId: "a", memory: true, initialStore: { score: 0 } });
  const b = await createMultiplayer({ lobbyId: "mp-spoof-test", peerId: "b", memory: true, initialStore: { score: 0 } });

  b.group.peers()[0].reliable.send({
    type: "store-patch",
    patch: { path: ["score"], value: 99, timestamp: 100, peerId: "forged-peer" }
  });

  expect(a.store.score).toBe(0);
  a.close();
  b.close();
});

test("multiplayer bootstraps a late memory peer from the current leader snapshot", async () => {
  const a = await createMultiplayer({ lobbyId: "mp-late-test", peerId: "a", memory: true, initialStore: { color: "red", count: 0 } });
  a.store.color = "blue";
  a.store.count = 3;

  const b = await createMultiplayer({ lobbyId: "mp-late-test", peerId: "b", memory: true, initialStore: { color: "green", count: -1 } });

  expect(b.store.$snapshot()).toEqual({ color: "blue", count: 3 });
  a.close();
  b.close();
});

test("multiplayer keeps the incumbent snapshot when a lower-id peer joins late", async () => {
  const incumbent = await createMultiplayer({
    lobbyId: "mp-late-lower-id-test",
    peerId: "z-incumbent",
    memory: true,
    initialStore: { value: "incumbent" }
  });
  incumbent.store.value = "current";

  const newcomer = await createMultiplayer({
    lobbyId: "mp-late-lower-id-test",
    peerId: "a-newcomer",
    memory: true,
    initialStore: { value: "stale" }
  });

  expect(newcomer.store.value).toBe("current");
  expect(incumbent.store.value).toBe("current");
  incumbent.close();
  newcomer.close();
});

test("multiplayer rollback loops track peers that join and leave", async () => {
  const a = await createMultiplayer({ lobbyId: "mp-roster-test", peerId: "a", memory: true, initialStore: {} });
  const frames: string[][] = [];
  let state = { frames };
  const loop = a.createRollbackLoop<number, typeof state>({
    defaultInput: 0,
    getLocalInput: () => 0,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.frames.push(Object.keys(inputs).sort());
    }
  });

  loop.tick();
  const b = await createMultiplayer({ lobbyId: "mp-roster-test", peerId: "b", memory: true, initialStore: {} });
  loop.tick();
  b.close();
  loop.tick();

  expect(state.frames).toEqual([["a"], ["a", "b"], ["a"]]);
  a.close();
});

test("multiplayer setup failures do not leave a ghost peer in the memory room", async () => {
  await expect(
    createMultiplayer({ lobbyId: "mp-setup-cleanup", peerId: "peer", memory: true, initialStore: { bad: Number.NaN } })
  ).rejects.toThrow("wire-safe");

  const session = await createMultiplayer({ lobbyId: "mp-setup-cleanup", peerId: "peer", memory: true, initialStore: { ok: true } });
  expect(session.group.peers()).toHaveLength(0);
  session.close();
});

test("an unbootstrapped multiplayer peer queues snapshot requests until it receives valid state", async () => {
  const source = createMemoryPeerGroup({ lobbyId: "mp-bootstrap-gate", peerId: "a-source" });
  const middle = await createMultiplayer({ lobbyId: "mp-bootstrap-gate", peerId: "b-middle", memory: true, initialStore: { value: 0 } });
  const requester = createMemoryPeerGroup({ lobbyId: "mp-bootstrap-gate", peerId: "c-requester" });
  const middleView = requester.peers().find((peer) => peer.id === "b-middle")!;
  const responses: unknown[] = [];
  middleView.reliable.onMessage((payload) => responses.push(payload));

  middleView.reliable.send({ type: "store-sync-request" });
  expect(responses).toEqual([]);

  source.peers().find((peer) => peer.id === "b-middle")!.reliable.send({
    type: "store-snapshot",
    snapshot: { state: { value: 5 }, clocks: [] }
  });

  expect(middle.store.value).toBe(5);
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({ type: "store-snapshot" });
  requester.close();
  middle.close();
  source.close();
});
