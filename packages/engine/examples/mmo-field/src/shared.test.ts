import { expect, test } from "bun:test";
import { encodeSnapshot } from "@hyperfocus/engine/protocol";
import { createAuthoritativeRoom, createServerMetrics } from "@hyperfocus/engine/server";
import { fieldRoom, fieldSchema } from "./shared.ts";

function createField() {
  return createAuthoritativeRoom({
    id: "field-test",
    type: fieldRoom,
    now: () => 1_000,
    metrics: createServerMetrics()
  });
}

test("field movement is tick-based, finite, and independent of input message rate", async () => {
  const room = createField();
  const player = { id: "player-1", userId: "alice", sessionId: "session:alice", roomId: room.id, joinedAt: 1_000, lastInputAt: 1_000 };
  expect(await room.join(player)).toEqual({ ok: true });

  for (let index = 0; index < 100; index += 1) await room.input(player.id, { dx: 1, dy: 1 });
  expect(room.ctx.state.players[player.id]).toMatchObject({ x: 0, y: 0 });

  await room.update(0.05);
  expect(room.ctx.state.players[player.id]!.x).toBeCloseTo(Math.SQRT1_2 * 4);
  expect(room.ctx.state.players[player.id]!.y).toBeCloseTo(Math.SQRT1_2 * 4);

  await room.input(player.id, { dx: Number.NaN, dy: Number.POSITIVE_INFINITY });
  await room.update(0.05);
  expect(room.ctx.state.players[player.id]!.x).toBeCloseTo(Math.SQRT1_2 * 4);
  expect(room.ctx.state.players[player.id]!.y).toBeCloseTo(Math.SQRT1_2 * 4);
});

test("field snapshots enforce the advertised interest radius", async () => {
  const room = createField();
  const observer = { id: "observer", userId: "observer", sessionId: "s:o", roomId: room.id, joinedAt: 1_000, lastInputAt: 1_000 };
  const nearby = { id: "nearby", userId: "nearby", sessionId: "s:n", roomId: room.id, joinedAt: 1_000, lastInputAt: 1_000 };
  const distant = { id: "distant", userId: "distant", sessionId: "s:d", roomId: room.id, joinedAt: 1_000, lastInputAt: 1_000 };
  await room.join(observer);
  await room.join(nearby);
  await room.join(distant);
  room.ctx.state.players[nearby.id]!.x = 319;
  room.ctx.state.players[distant.id]!.x = 321;

  expect(Object.keys(room.snapshotFor(observer.id).players).sort()).toEqual(["nearby", "observer"]);
});

test("field tick wraps within its u32 replication schema", async () => {
  const room = createField();
  room.ctx.state.tick = 0xffff_ffff;
  await room.update(0.05);
  expect(room.ctx.state.tick).toBe(0);
});

test("field player names remain within the schema's UTF-8 byte limit", async () => {
  const room = createField();
  const player = {
    id: "player-unicode",
    userId: "😀".repeat(20),
    sessionId: "session:unicode",
    roomId: room.id,
    joinedAt: 1_000,
    lastInputAt: 1_000
  };
  expect(await room.join(player)).toEqual({ ok: true });

  const name = room.ctx.state.players[player.id]!.name;
  expect(new TextEncoder().encode(name).byteLength).toBe(32);
  expect(() => encodeSnapshot(fieldSchema, room.ctx.state)).not.toThrow();
});
