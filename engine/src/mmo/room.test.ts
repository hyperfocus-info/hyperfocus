import { expect, test } from "bun:test";
import { decodeSnapshot, encodeSnapshot } from "../protocol/index.ts";
import { createAuthoritativeRoom } from "../server/room.ts";
import { createAuthoritativeServer } from "../server/server.ts";
import type { AuthoritativePlayer, MetricsSink } from "../server/types.ts";
import { createMmoPersistenceBridge, createMmoRoomType } from "./index.ts";

type Profile = { x: number; gold: number };
type PublicData = { name?: string };
type OwnerData = { gold?: number };
type PrivateData = { loaded?: boolean };

const metrics: MetricsSink = {
  record() {}
};

function player(id: string): AuthoritativePlayer {
  return {
    id,
    userId: id,
    sessionId: `s-${id}`,
    roomId: "room-1",
    joinedAt: 0,
    lastInputAt: 0
  };
}

test("MMO room type loads profiles on join and saves owner state on leave", async () => {
  let saved: Profile | undefined;
  const bridge = createMmoPersistenceBridge<Profile, PublicData, OwnerData, PrivateData>({
    loadProfile: () => ({ x: 12, gold: 7 }),
    saveProfile: (_key, profile) => {
      saved = profile;
    },
    createEntity: ({ player: joined, profile }) => ({
      id: joined.id,
      type: "player",
      x: profile?.x ?? 0,
      y: 3,
      ownerId: joined.id,
      publicData: { name: joined.userId },
      ownerData: { gold: profile?.gold ?? 0 },
      privateData: { loaded: true }
    }),
    serializeProfile: ({ entity }) => ({
      x: entity?.x ?? 0,
      gold: Number(entity?.ownerData?.gold ?? 0)
    })
  });
  const roomType = createMmoRoomType<Record<string, never>, { dx?: number }, Profile, PublicData, OwnerData, PrivateData>({
    name: "mmo-test",
    persistence: bridge,
    defaultInterestRadius: 64
  });
  const room = createAuthoritativeRoom({ id: "room-1", type: roomType, now: () => 0, metrics });
  const joined = player("alice");

  expect(await room.join(joined)).toBe(true);
  expect(roomType.getRuntime("room-1")?.registry.get("alice")).toMatchObject({ x: 12, ownerData: { gold: 7 } });
  expect(room.snapshotFor("alice").entities.alice.ownerData).toEqual({ gold: 7 });

  roomType.getRuntime("room-1")?.registry.patch("alice", { x: 20, ownerData: { gold: 11 } });
  expect(await room.leave("alice")).toBe(true);

  expect(saved).toEqual({ x: 20, gold: 11 });
  expect(roomType.getRuntime("room-1")?.registry.has("alice")).toBe(false);
});

test("MMO room type stores inputs and updates normalized state", async () => {
  const roomType = createMmoRoomType<Record<string, never>, { dx?: number }>({
    name: "mmo-input",
    createPlayerEntity: ({ player: joined }) => ({ id: joined.id, type: "player", x: 0, y: 0, ownerId: joined.id }),
    update: ({ runtime }) => {
      for (const [playerId, input] of runtime.inputs) {
        const actor = runtime.registry.get(playerId);
        if (actor) runtime.registry.patch(playerId, { x: actor.x + (input.dx ?? 0) });
      }
    }
  });
  const room = createAuthoritativeRoom({ id: "room-2", type: roomType, now: () => 0, metrics });

  await room.join(player("bob"));
  expect(await room.input("bob", { dx: 4 })).toBe(true);
  await room.update(0.016);

  expect(room.ctx.state.tick).toBe(1);
  expect(room.ctx.state.entities.bob.x).toBe(4);

  const decoded = decodeSnapshot(roomType.schema, encodeSnapshot(roomType.schema, room.snapshotFor("bob"))) as {
    visibleIds: string[];
    entities: Record<string, { id: string; type: string; x: number; y: number; ownerId: string; publicData: unknown; ownerData: unknown }>;
  };
  expect(decoded.visibleIds).toEqual(["bob"]);
  expect(decoded.entities.bob).toMatchObject({ id: "bob", type: "player", x: 4, y: 0, ownerId: "bob", publicData: {}, ownerData: {} });
});

test("MMO persistence detaches custom entity ids", async () => {
  let savedEntityId: string | undefined;
  const bridge = createMmoPersistenceBridge<Profile, PublicData, OwnerData, PrivateData>({
    loadProfile: () => ({ x: 2, gold: 3 }),
    createEntity: ({ player: joined }) => ({
      id: `avatar-${joined.id}`,
      type: "player",
      x: 100,
      y: 0,
      ownerId: joined.id
    }),
    serializeProfile: ({ entity }) => {
      savedEntityId = entity?.id;
      return { x: entity?.x ?? 0, gold: 3 };
    },
    saveProfile() {}
  });
  const roomType = createMmoRoomType<Record<string, never>, unknown, Profile, PublicData, OwnerData, PrivateData>({
    name: "custom-entity-id",
    persistence: bridge,
    defaultInterestRadius: 1
  });
  const room = createAuthoritativeRoom({ id: "room-1", type: roomType, now: () => 0, metrics });
  const joined = player("custom");

  await room.join(joined);
  expect(roomType.getRuntime("room-1")?.registry.has("avatar-custom")).toBe(true);
  expect(room.snapshotFor(joined.id).visibleIds).toContain("avatar-custom");
  await room.leave(joined.id);

  expect(savedEntityId).toBe("avatar-custom");
  expect(roomType.getRuntime("room-1")?.registry.has("avatar-custom")).toBe(false);
});

test("idle MMO room disposal clears its runtime", async () => {
  let now = 0;
  const roomType = createMmoRoomType({ name: "disposable-mmo", idleDisposeMs: 1 });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    devMode: true
  });
  const joined = await server.joinRoom({ roomId: "disposable", roomType: "disposable-mmo", token: "dev:cleanup" });
  expect(joined.ok).toBe(true);
  expect(roomType.getRuntime("disposable")).toBeDefined();

  await server.leavePlayer(joined.player!.id);
  now = 2;
  await server.tick();

  expect(server.rooms()).toHaveLength(0);
  expect(roomType.getRuntime("disposable")).toBeUndefined();
  await server.stop();
});

test("MMO room counters preserve u32 ticks and safe-integer entity revisions", async () => {
  const roomType = createMmoRoomType({
    name: "counter-widths",
    createPlayerEntity: ({ player: joined }) => ({ id: joined.id, type: "player", x: 0, y: 0, ownerId: joined.id })
  });
  const room = createAuthoritativeRoom({ id: "counter-widths", type: roomType, now: () => 0, metrics });
  await room.join(player("counter"));
  room.ctx.state.tick = 0xffffffff;
  await room.update(0);
  expect(room.ctx.state.tick).toBe(0);

  const snapshot = room.snapshotFor("counter");
  snapshot.entities.counter.revision = 0x1_0000_0001;
  const decoded = decodeSnapshot(roomType.schema, encodeSnapshot(roomType.schema, snapshot));
  expect(decoded.entities.counter.revision).toBe(0x1_0000_0001);
});

test("MMO room configuration rejects unsafe lifecycle and interest limits", () => {
  expect(() => createMmoRoomType({ name: "", defaultInterestRadius: 1 })).toThrow("non-empty string");
  expect(() => createMmoRoomType({ name: "bad-radius", defaultInterestRadius: -1 })).toThrow("non-negative finite");
  expect(() => createMmoRoomType({ name: "bad-capacity", maxPlayers: -1 })).toThrow("non-negative safe integer");
});
