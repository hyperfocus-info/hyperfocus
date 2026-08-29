import { expect, test } from "bun:test";
import { createServerMetrics } from "./operations/metrics.ts";
import { createInterestGrid } from "./interest-grid.ts";
import { createHttpShardHandoffTransport, createShardRouter } from "./routing/shard-router.ts";
import {
  selectTransientEffectsForViewer,
  spawnTransientEffect,
  updateTransientEffects,
  type CompactTransientEffect
} from "./replication/transient-effects.ts";

test("interest grid filters visibility, tracks enter leave, and caps overflow", () => {
  const grid = createInterestGrid({ cellSize: 10, maxEntitiesPerClient: 2, hysteresisCells: 1 });
  grid.upsert({ id: "near", x: 1, y: 1, priority: 1 });
  grid.upsert({ id: "far", x: 100, y: 100 });
  grid.upsert({ id: "global", x: 999, y: 999, global: true, priority: 2 });

  const first = grid.computeVisibility("client", { x: 0, y: 0, radius: 5 });
  expect(first.visible).toEqual(["global", "near"]);
  expect(first.entered).toEqual(["global", "near"]);

  grid.remove("near");
  const second = grid.computeVisibility("client", { x: 0, y: 0, radius: 5 });
  expect(second.left).toEqual(["near"]);
});

test("interest grid removes entities from packed cell zero", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "origin", x: 1, y: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["origin"]);
  expect(grid.remove("origin")).toBe(true);
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
});

test("interest grid moves entities and toggles global visibility without stale cells", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "mover", x: 1, y: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 101, y: 101 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
  expect(grid.query({ x: 100, y: 100, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 500, y: 500, global: true });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 101, y: 101 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
  expect(grid.query({ x: 100, y: 100, radius: 5 })).toEqual(["mover"]);
});

test("interest grid caps low-priority effect types without dropping combat actors", () => {
  const grid = createInterestGrid({ cellSize: 10, maxEntitiesPerClient: 6, maxEntitiesPerClientByType: { hazard: 2 } });
  grid.upsert({ id: "player", type: "player", x: 0, y: 0, priority: 100 });
  grid.upsert({ id: "boss", type: "npc", x: 1, y: 0, priority: 80 });
  for (let i = 0; i < 6; i += 1) {
    grid.upsert({ id: `hazard-${i}`, type: "hazard", x: 2 + i, y: 0, priority: 40 - i });
  }

  const visible = grid.query({ x: 0, y: 0, radius: 20 });

  expect(visible).toContain("player");
  expect(visible).toContain("boss");
  expect(visible.filter((id) => id.startsWith("hazard-"))).toEqual(["hazard-0", "hazard-1"]);
});

test("interest grid includes large-radius entities whose centers are outside the target radius", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "wide-hazard", type: "hazard", x: 40, y: 0, radius: 35, priority: 1 });

  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual(["wide-hazard"]);

  grid.upsert({ id: "wide-hazard", type: "hazard", x: 40, y: 0, radius: 1, priority: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual([]);
});

test("interest grid tracks same-cell radius growth", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "growing-hazard", type: "hazard", x: 40, y: 0, radius: 1, priority: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual([]);

  grid.upsert({ id: "growing-hazard", type: "hazard", x: 40, y: 0, radius: 35, priority: 1 });

  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual(["growing-hazard"]);
});

test("interest grid rejects non-finite geometry and ignores inherited type caps", () => {
  expect(() => createInterestGrid({ cellSize: 0 })).toThrow("positive finite");
  expect(() => createInterestGrid({ maxEntitiesPerClient: -1 })).toThrow("non-negative safe integer");
  const grid = createInterestGrid({ maxEntitiesPerClient: 2, maxEntitiesPerClientByType: { hazard: 1 } });
  grid.upsert({ id: "constructor-entity", type: "constructor", x: 0, y: 0 });
  grid.upsert({ id: "hazard", type: "hazard", x: 1, y: 0 });

  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["constructor-entity", "hazard"]);
  expect(() => grid.upsert({ id: "invalid", x: Number.POSITIVE_INFINITY, y: 0 })).toThrow("position must be finite");
  expect(() => grid.query({ x: 0, y: 0, radius: Number.POSITIVE_INFINITY })).toThrow("must be finite");
});

test("transient effect lane decays and selects compact AOI-capped effects", () => {
  const lane: CompactTransientEffect[] = [];
  for (let i = 0; i < 8; i += 1) {
    spawnTransientEffect(lane, {
      id: `fx-${i}`,
      kind: "line",
      zoneId: "arena",
      x: i * 8,
      y: 0,
      toX: i * 8 + 20,
      toY: 0,
      radius: 4,
      lifetimeMs: 100,
      effectKind: "arrow",
      priority: i
    });
  }

  expect(selectTransientEffectsForViewer(lane, { x: 0, y: 0, radius: 80, zoneId: "arena" }, { maxEffects: 3 }).map((effect) => effect.id)).toEqual(["fx-7", "fx-6", "fx-5"]);

  const reusable = lane[lane.length - 1];
  updateTransientEffects(lane, 0.11);
  expect(lane).toHaveLength(0);
  spawnTransientEffect(lane, {
    id: "fx-reuse",
    kind: "aoe",
    zoneId: "arena",
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
    radius: 8,
    lifetimeMs: 100,
    effectKind: "burst"
  });
  expect(lane[0]).toBe(reusable);
  expect(lane[0].id).toBe("fx-reuse");
});

test("metrics and shard router expose operational primitives", async () => {
  const metrics = createServerMetrics();
  metrics.record("tick_ms", 2);
  metrics.increment("auth_fail");
  const router = createShardRouter({
    strategy: "static-grid",
    zones: [{ id: "zone-a", roomId: "room-a", x: 0, y: 0, w: 10, h: 10 }]
  });

  expect(metrics.summary("tick_ms")?.latest).toBe(2);
  expect(router.route({ x: 5, y: 5 })?.roomId).toBe("room-a");
  await expect(router.handoff("player-1", "room-old", { id: "zone-b", roomId: "room-b" }, { hp: 3 })).resolves.toMatchObject({
    ok: true,
    playerId: "player-1",
    fromRoomId: "room-old",
    toRoomId: "room-b",
    state: { hp: 3 }
  });
});

test("server metrics distinguish gauges and cap series cardinality", () => {
  const metrics = createServerMetrics({ maxSeries: 2, maxTags: 1, maxTagLength: 8 });
  metrics.gauge("rooms", 2);
  metrics.gauge("rooms", 3);
  metrics.increment("joins", 1);
  metrics.increment("joins", 2);
  metrics.observe("overflow", 4);
  metrics.observe("tagged", 1, { room: "name-too-long" });

  expect(metrics.summary("rooms")).toMatchObject({ kind: "gauge", count: 2, latest: 3, total: 3 });
  expect(metrics.summary("joins")).toMatchObject({ kind: "counter", count: 2, latest: 3, total: 3 });
  expect(metrics.diagnostics()).toEqual({ series: 2, maxSeries: 2, droppedSeries: 1, rejectedTags: 1 });
});

test("shard router supports remote handoff transport and timeout failures", async () => {
  const target = { id: "zone-b", roomId: "room-b", endpoint: "https://shard-b.test" };
  const remote = createHttpShardHandoffTransport({
    fetch: async (request) => {
      expect(String(request)).toBe("https://shard-b.test/shard/handoff");
      return Response.json({ ok: true, playerId: "untrusted", fromRoomId: "untrusted", state: { loaded: true } });
    }
  });
  const router = createShardRouter({
    strategy: "room-label",
    zones: [{ ...target, label: "east" }],
    transport: remote
  });

  await expect(router.handoff("player-1", "room-a", target, { loaded: false })).resolves.toMatchObject({
    ok: true,
    playerId: "player-1",
    fromRoomId: "room-a",
    toRoomId: "room-b",
    state: { loaded: true }
  });

  const malformed = createHttpShardHandoffTransport({ fetch: async () => Response.json({ ok: "yes" }) });
  await expect(malformed.handoff({ playerId: "player-3", fromRoomId: "room-a", target, state: null })).resolves.toMatchObject({
    ok: false,
    reason: "shard handoff response ok must be boolean"
  });

  const stalled = createShardRouter({
    strategy: "room-label",
    zones: [target],
    handoffTimeoutMs: 1,
    transport: {
      handoff: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, playerId: "late", fromRoomId: "late", toRoomId: "late", target, state: null }), 50))
    }
  });

  await expect(stalled.handoff("player-2", "room-a", target, { x: 1 })).resolves.toMatchObject({
    ok: false,
    reason: "shard handoff timed out",
    playerId: "player-2",
    toRoomId: "room-b"
  });
});
