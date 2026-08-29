import { afterEach, expect, test } from "bun:test";
import { connectLobby, disconnect, listRooms, onLobby } from "./network.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  disconnect();
  globalThis.fetch = originalFetch;
});

test("global lobby subscriptions can be removed after a reconnect", async () => {
  globalThis.fetch = Object.assign(async () => Response.json({ rooms: [] }), { preconnect: originalFetch.preconnect });
  await connectLobby({ roomsUrl: "http://localhost/rooms.json" });

  let calls = 0;
  const remove = onLobby(() => {
    calls += 1;
  });
  await connectLobby({ roomsUrl: "http://localhost/rooms.json" });
  const callsBeforeRemoval = calls;
  remove();
  await listRooms();

  expect(callsBeforeRemoval).toBeGreaterThan(0);
  expect(calls).toBe(callsBeforeRemoval);
});

test("lobby rejects non-websocket authoritative URL schemes", async () => {
  await expect(connectLobby({ url: "javascript:alert(1)", roomsUrl: "http://localhost/rooms.json" })).rejects.toThrow("must use ws:");
});
