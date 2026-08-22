import { expect, test } from "bun:test";
import { createWorldRouter, type WorkerRoomEvent } from "./index.ts";

function postedRoom(id: string) {
  const events: WorkerRoomEvent[] = [];
  return {
    id,
    events,
    workerRoom: {
      id,
      post(event: WorkerRoomEvent) {
        events.push(event);
        return true;
      }
    }
  };
}

test("world router tracks clients and routes events to their room", () => {
  const roomEvents: WorkerRoomEvent[] = [];
  const router = createWorldRouter([{ id: "room-a", onEvent: (event) => roomEvents.push(event) }]);

  expect(router.addClient("client-1", "room-a")).toBe(true);
  expect(router.roomIdFor("client-1")).toBe("room-a");
  expect(router.clientsIn("room-a")).toEqual(["client-1"]);
  expect(router.routeEvent("client-1", { type: "input", payload: { x: 1 } })).toBe(true);

  expect(roomEvents).toEqual([
    { type: "client:join", roomId: "room-a", clientId: "client-1" },
    { type: "input", roomId: "room-a", clientId: "client-1", payload: { x: 1 } }
  ]);
});

test("world router transfers clients between worker rooms", () => {
  const roomA = postedRoom("room-a");
  const roomB = postedRoom("room-b");
  const router = createWorldRouter([roomA, roomB]);

  expect(router.addClient("client-1", "room-a")).toBe(true);
  expect(router.transferClient("client-1", "room-b")).toEqual({
    ok: true,
    clientId: "client-1",
    fromRoomId: "room-a",
    toRoomId: "room-b"
  });

  expect(router.roomFor("client-1")?.id).toBe("room-b");
  expect(router.clientsIn("room-a")).toEqual([]);
  expect(router.clientsIn("room-b")).toEqual(["client-1"]);
  expect(roomA.events.map((event) => event.type)).toEqual(["client:join", "client:leave"]);
  expect(roomA.events[1]).toMatchObject({ roomId: "room-a", clientId: "client-1", payload: { reason: "transfer", targetRoomId: "room-b" } });
  expect(roomB.events[0]).toMatchObject({ type: "client:join", roomId: "room-b", clientId: "client-1", payload: { fromRoomId: "room-a" } });

  expect(router.routeEvent("client-1", { type: "chat", payload: { text: "hi" } })).toBe(true);
  expect(roomB.events.at(-1)).toEqual({ type: "chat", roomId: "room-b", clientId: "client-1", payload: { text: "hi" } });
});

test("world router reports missing clients and rooms without side effects", () => {
  const roomA = postedRoom("room-a");
  const router = createWorldRouter([roomA]);

  expect(router.addClient("client-1", "missing")).toBe(false);
  expect(router.transferClient("client-1", "room-a")).toEqual({
    ok: false,
    clientId: "client-1",
    toRoomId: "room-a",
    reason: "client not routed"
  });

  expect(router.addClient("client-1", "room-a")).toBe(true);
  expect(router.transferClient("client-1", "missing")).toEqual({
    ok: false,
    clientId: "client-1",
    fromRoomId: "room-a",
    toRoomId: "missing",
    reason: "target room missing"
  });
  expect(router.roomIdFor("client-1")).toBe("room-a");

  expect(router.unregisterRoom("room-a")).toBe(true);
  expect(router.roomIdFor("client-1")).toBeUndefined();
});
