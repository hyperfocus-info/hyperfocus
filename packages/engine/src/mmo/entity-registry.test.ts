import { expect, test } from "bun:test";
import { createMmoEntityRegistry } from "./entity-registry.ts";

test("entity registry filters public owner-only and private state", () => {
  const registry = createMmoEntityRegistry();
  registry.upsert({ id: "npc-1", type: "npc", x: 0, y: 0, publicData: { hp: 10 }, privateData: { seed: "hidden" } });
  registry.upsert({
    id: "loot-1",
    type: "loot",
    x: 8,
    y: 0,
    ownerId: "alice",
    visibility: "owner",
    publicData: { itemId: "iron" },
    ownerData: { pickupToken: "a1" },
    privateData: { dropRoll: 17 }
  });
  registry.upsert({ id: "spawn-1", type: "spawn", x: 2, y: 2, visibility: "private", privateData: { wave: 3 } });

  const ownerSnapshot = registry.snapshot("alice");
  const otherSnapshot = registry.snapshot("bob");

  expect(ownerSnapshot.visibleIds).toEqual(["loot-1", "npc-1"]);
  expect(ownerSnapshot.entities["loot-1"].ownerData).toEqual({ pickupToken: "a1" });
  expect("privateData" in ownerSnapshot.entities["npc-1"]).toBe(false);
  expect(otherSnapshot.visibleIds).toEqual(["npc-1"]);
  expect(otherSnapshot.entities["loot-1"]).toBeUndefined();
  expect(otherSnapshot.omittedIds).toEqual(["loot-1", "spawn-1"]);
});

test("entity registry encodes and decodes normalized snapshots", () => {
  const registry = createMmoEntityRegistry({ initialEntities: [{ id: "player-1", type: "player", x: 4, y: 5, publicData: { name: "Ada" } }] });
  const encoded = registry.encodeSnapshot(registry.snapshot("player-1", { meta: { tick: 7 } }));
  const decoded = registry.decodeSnapshot(encoded);
  const mirror = createMmoEntityRegistry();

  mirror.applySnapshot(decoded);

  expect(encoded.entities.map((entity) => entity.id)).toEqual(["player-1"]);
  expect(decoded.meta).toEqual({ tick: 7 });
  expect(mirror.get("player-1")).toMatchObject({ id: "player-1", type: "player", x: 4, y: 5 });
  expect(mirror.snapshot("player-1").entities["player-1"].publicData).toEqual({ name: "Ada" });
});

test("entity registry exposes internal visible read views without public clone changes", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [
      { id: "public", type: "npc", x: 0, y: 0, publicData: { hp: 10 } },
      { id: "owner", type: "loot", x: 1, y: 0, ownerId: "alice", visibility: "owner", ownerData: { token: "a1" } },
      { id: "private", type: "spawn", x: 2, y: 0, visibility: "private" }
    ]
  });
  const visible: string[] = [];

  registry.forEachVisibleReadable?.("alice", (entity) => visible.push(entity.id));
  const clone = registry.get("public");
  if (clone) clone.x = 99;

  expect(visible).toEqual(["public", "owner"]);
  expect(registry.get("public")?.x).toBe(0);
});

test("entity registry deeply isolates mutable entity data and tags", () => {
  const publicData = { stats: { hp: 10 }, inventory: ["coin"] };
  const tags = ["alive"];
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "nested", type: "player", x: 0, y: 0, publicData, tags }]
  });
  const revision = registry.revision();

  publicData.stats.hp = 1;
  publicData.inventory.push("potion");
  tags.push("mutated");
  const read = registry.get("nested");
  if (!read) throw new Error("missing entity");
  const readData = read.publicData;
  if (!readData) throw new Error("missing public entity data");
  readData.stats.hp = 2;
  readData.inventory.push("sword");
  const snapshot = registry.snapshot();
  const snapshotData = snapshot.entities.nested.publicData;
  if (!snapshotData) throw new Error("missing snapshot public data");
  snapshotData.stats.hp = 3;

  expect(registry.get("nested")?.publicData).toEqual({ stats: { hp: 10 }, inventory: ["coin"] });
  expect(registry.get("nested")?.tags).toEqual(["alive"]);
  expect(registry.revision()).toBe(revision);
});

test("entity snapshots safely support prototype-like entity ids", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "__proto__", type: "npc", x: 0, y: 0, tags: ["safe"], publicData: { nested: { hp: 10 } } }]
  });
  const snapshot = registry.snapshot();

  expect(Object.getPrototypeOf(snapshot.entities)).toBeNull();
  expect(snapshot.entities.__proto__.id).toBe("__proto__");

  const decoded = registry.decodeSnapshot(registry.encodeSnapshot(snapshot));
  expect(Object.getPrototypeOf(decoded.entities)).toBeNull();
  expect(decoded.entities.__proto__.id).toBe("__proto__");

  const mirror = createMmoEntityRegistry();
  mirror.applySnapshot(decoded);
  const decodedEntity = decoded.entities.__proto__;
  if (!decodedEntity.tags || !decodedEntity.publicData) throw new Error("decoded entity data is incomplete");
  Reflect.apply(Array.prototype.push, decodedEntity.tags, ["mutated"]);
  const nested = decodedEntity.publicData.nested;
  if (typeof nested !== "object" || nested === null || !("hp" in nested) || typeof nested.hp !== "number") throw new Error("decoded nested data is invalid");
  nested.hp = 1;
  expect(mirror.get("__proto__")?.tags).toEqual(["safe"]);
  expect(mirror.get("__proto__")?.publicData).toEqual({ nested: { hp: 10 } });
});

test("failed entity mutations do not advance the registry revision", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "player", type: "player", x: 0, y: 0 }]
  });
  const revision = registry.revision();

  expect(() => registry.upsert({ id: "bad", type: "npc", x: Number.NaN, y: 0 })).toThrow("position must be finite");
  expect(() => registry.patch("player", { x: Number.POSITIVE_INFINITY })).toThrow("position must be finite");
  expect(registry.revision()).toBe(revision);
  expect(registry.get("player")?.x).toBe(0);
});

test("entity snapshot application validates and commits transactionally", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "original", type: "npc", x: 1, y: 2, publicData: { hp: 10 } }]
  });
  const revision = registry.revision();
  const invalid = registry.snapshot();
  invalid.revision = revision + 1;
  Object.defineProperty(invalid.entities, "broken", {
    enumerable: true,
    value: { id: "broken", type: "npc", x: Number.NaN, y: 0, visibility: "public", revision, publicData: {} }
  });

  expect(() => registry.applySnapshot(invalid)).toThrow("position must be finite");
  expect(registry.revision()).toBe(revision);
  expect(registry.get("original")?.publicData).toEqual({ hp: 10 });
  expect(registry.has("broken")).toBe(false);
});

test("entity data rejects values outside the structured-clone domain", () => {
  const registry = createMmoEntityRegistry();

  expect(() => registry.upsert({
    id: "bad-data",
    type: "npc",
    x: 0,
    y: 0,
    publicData: { marker: Symbol("not cloneable") }
  })).toThrow("non-cloneable");
  expect(registry.revision()).toBe(0);
  expect(registry.size()).toBe(0);
});

test("entity registry rejects revision overflow without mutating state", () => {
  const source = createMmoEntityRegistry({
    initialEntities: [{ id: "player", type: "player", x: 0, y: 0 }]
  });
  const snapshot = source.snapshot();
  snapshot.revision = Number.MAX_SAFE_INTEGER;
  const entity = snapshot.entities.player;
  entity.revision = Number.MAX_SAFE_INTEGER;

  const registry = createMmoEntityRegistry();
  registry.applySnapshot(snapshot);
  expect(() => registry.patch("player", { x: 1 })).toThrow("safe integer range");
  expect(registry.revision()).toBe(Number.MAX_SAFE_INTEGER);
  expect(registry.get("player")?.x).toBe(0);
});

test("entity registry rejects malformed optional spatial metadata transactionally", () => {
  expect(() => Reflect.apply(createMmoEntityRegistry, undefined, [{ defaultVisibility: "invalid" }])).toThrow("defaultVisibility");
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "safe", type: "npc", x: 0, y: 0, radius: 1, priority: 0 }]
  });
  const revision = registry.revision();

  expect(() => registry.patch("safe", { radius: Number.NaN })).toThrow("radius");
  expect(() => registry.patch("safe", { priority: Number.POSITIVE_INFINITY })).toThrow("priority");
  expect(() => Reflect.apply(registry.patch, registry, ["safe", { ownerId: 1 }])).toThrow("ownerId");
  expect(registry.revision()).toBe(revision);
  expect(registry.get("safe")).toMatchObject({ radius: 1, priority: 0 });
});
