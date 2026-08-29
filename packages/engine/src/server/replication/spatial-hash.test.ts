import { expect, test } from "bun:test";
import { createSpatialHash, type SpatialHashEntity } from "./spatial-hash.ts";

type Actor = SpatialHashEntity<string> & {
  kind: "player" | "hazard" | "loot";
};

function ids(actors: Actor[]) {
  return actors.map((actor) => actor.id).sort();
}

test("spatial hash upserts generic game entities and queries nearby by radius", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 16 });

  const inserted = hash.upsert({ id: "player", kind: "player", x: 0, y: 0, radius: 4 });
  hash.upsert({ id: "loot", kind: "loot", x: 12, y: 0 });
  hash.upsert({ id: "far", kind: "hazard", x: 40, y: 0 });

  expect(inserted).toMatchObject({
    kind: "inserted",
    nextCell: { x: 0, y: 0, key: "0,0" },
    dirtyCells: [{ x: 0, y: 0, key: "0,0" }]
  });
  expect(hash.size()).toBe(3);
  expect(ids(hash.queryNearby({ x: 0, y: 0, radius: 12 }))).toEqual(["loot", "player"]);
});

test("spatial hash includes entity radius even when center is outside query radius", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 10 });

  hash.upsert({ id: "wide", kind: "hazard", x: 35, y: 0, radius: 30 });

  expect(ids(hash.queryNearby({ x: 0, y: 0, radius: 10 }))).toEqual(["wide"]);

  hash.upsert({ id: "wide", kind: "hazard", x: 35, y: 0, radius: 1 });
  expect(hash.queryNearby({ x: 0, y: 0, radius: 10 })).toEqual([]);
});

test("spatial hash reports dirty cells only when movement crosses cell boundaries", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 10 });

  hash.upsert({ id: "mover", kind: "player", x: 1, y: 1 });
  const sameCell = hash.upsert({ id: "mover", kind: "player", x: 9, y: 1 });
  const nextCell = hash.upsert({ id: "mover", kind: "player", x: 10, y: 1 });

  expect(sameCell).toMatchObject({
    kind: "updated",
    moved: true,
    previousCell: { x: 0, y: 0, key: "0,0" },
    nextCell: { x: 0, y: 0, key: "0,0" },
    dirtyCells: []
  });
  expect(nextCell).toMatchObject({
    kind: "updated",
    moved: true,
    previousCell: { x: 0, y: 0, key: "0,0" },
    nextCell: { x: 1, y: 0, key: "1,0" },
    dirtyCells: [
      { x: 0, y: 0, key: "0,0" },
      { x: 1, y: 0, key: "1,0" }
    ]
  });
  expect(ids(hash.queryNearby({ x: 10, y: 1, radius: 1 }))).toEqual(["mover"]);
  expect(hash.queryNearby({ x: 1, y: 1, radius: 1 })).toEqual([]);
});

test("spatial hash removal returns dirty info and clears stale cells", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 10 });

  hash.upsert({ id: "gone", kind: "loot", x: -1, y: -1 });
  const removed = hash.remove("gone");
  const missing = hash.remove("gone");

  expect(removed).toMatchObject({
    kind: "removed",
    previousCell: { x: -1, y: -1, key: "-1,-1" },
    dirtyCells: [{ x: -1, y: -1, key: "-1,-1" }]
  });
  expect(missing).toMatchObject({
    kind: "missing",
    dirtyCells: []
  });
  expect(hash.size()).toBe(0);
  expect(hash.queryNearby({ x: -1, y: -1, radius: 5 })).toEqual([]);
});

test("spatial hash keeps negative cell queries isolated with packed keys", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 10 });

  hash.upsert({ id: "negative", kind: "player", x: -1, y: -1 });
  hash.upsert({ id: "origin", kind: "loot", x: 1, y: 1 });

  expect(hash.cellOf(-1, -1)).toEqual({ x: -1, y: -1, key: "-1,-1" });
  expect(ids(hash.queryNearby({ x: -1, y: -1, radius: 1 }))).toEqual(["negative"]);
  expect(ids(hash.queryNearby({ x: 1, y: 1, radius: 1 }))).toEqual(["origin"]);
});

test("spatial hash preserves far cell behavior outside packed-key range", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 1 });

  hash.upsert({ id: "far", kind: "hazard", x: 40_000_000, y: -40_000_000 });

  expect(hash.upsert({ id: "far", kind: "hazard", x: 40_000_001, y: -40_000_000 })).toMatchObject({
    kind: "updated",
    previousCell: { x: 40000000, y: -40000000, key: "40000000,-40000000" },
    nextCell: { x: 40000001, y: -40000000, key: "40000001,-40000000" }
  });
  expect(ids(hash.queryNearby({ x: 40_000_001, y: -40_000_000, radius: 0 }))).toEqual(["far"]);
  expect(hash.queryNearby({ x: 40_000_000, y: -40_000_000, radius: 0 })).toEqual([]);
});

test("spatial hash clears reused output arrays before each query", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 10 });
  const out: Actor[] = [];

  hash.upsert({ id: "near", kind: "player", x: 0, y: 0 });
  hash.upsert({ id: "far", kind: "loot", x: 100, y: 0 });

  expect(ids(hash.queryNearby({ x: 0, y: 0, radius: 5 }, out))).toEqual(["near"]);
  expect(hash.queryNearby({ x: 100, y: 0, radius: 5 }, out).map((actor) => actor.id)).toEqual(["far"]);
});

test("spatial hash rejects geometry that could create unbounded cell scans", () => {
  const hash = createSpatialHash<Actor>({ cellSize: 16 });
  expect(() => hash.upsert({ id: "bad", kind: "hazard", x: Number.POSITIVE_INFINITY, y: 0 })).toThrow("position must be finite");
  expect(() => hash.upsert({ id: "bad-radius", kind: "hazard", x: 0, y: 0, radius: -1 })).toThrow("radius must be non-negative");
  expect(() => hash.queryNearby({ x: 0, y: 0, radius: Number.POSITIVE_INFINITY })).toThrow("must be finite");
  expect(() => hash.cellOf(Number.NaN, 0)).toThrow("position must be finite");
});
