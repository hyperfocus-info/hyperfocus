import { expect, test } from "bun:test";
import { createMmoEntityRegistry, createMmoInterestSnapshotter } from "./index.ts";

test("interest snapshotter filters by AOI zone visibility cap and owner-only rules", () => {
  const registry = createMmoEntityRegistry();
  registry.upsert({ id: "near", type: "npc", x: 10, y: 0, zoneId: "field", publicData: { hp: 8 } });
  registry.upsert({ id: "far", type: "npc", x: 400, y: 0, zoneId: "field", publicData: { hp: 8 } });
  registry.upsert({ id: "other-zone", type: "npc", x: 8, y: 0, zoneId: "dungeon", publicData: { hp: 8 } });
  registry.upsert({ id: "global", type: "notice", x: 900, y: 900, global: true, priority: 10, publicData: { text: "event" } });
  registry.upsert({ id: "loot", type: "loot", x: 12, y: 0, ownerId: "alice", visibility: "owner", publicData: { item: "coin" } });

  const snapshotter = createMmoInterestSnapshotter({ registry, defaultRadius: 64, maxEntities: 3 });
  const owner = snapshotter.snapshotFor("alice", { x: 0, y: 0, zoneId: "field" });
  const other = snapshotter.snapshotFor("bob", { x: 0, y: 0, zoneId: "field" });

  expect(owner.visibleIds).toEqual(["global", "near", "loot"]);
  expect(owner.overflow).toBe(0);
  expect(other.visibleIds).toEqual(["global", "near"]);
  expect(other.snapshot.entities.loot).toBeUndefined();
  expect(other.snapshot.entities.far).toBeUndefined();
  expect(other.snapshot.entities["other-zone"]).toBeUndefined();
});

test("interest snapshotter reports enter and leave deltas", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [
      { id: "a", type: "npc", x: 0, y: 0 },
      { id: "b", type: "npc", x: 200, y: 0 }
    ]
  });
  const snapshotter = createMmoInterestSnapshotter({ registry, defaultRadius: 32 });

  expect(snapshotter.snapshotFor("p1", { x: 0, y: 0 }).entered).toEqual(["a"]);
  expect(snapshotter.snapshotFor("p1", { x: 200, y: 0 }).left).toEqual(["a"]);
  expect(snapshotter.snapshotFor("p1", { x: 200, y: 0 }).entered).toEqual([]);
});

test("interest snapshotter keeps custom filters on clone-safe path", () => {
  const registry = createMmoEntityRegistry({
    initialEntities: [{ id: "a", type: "npc", x: 0, y: 0 }]
  });
  const snapshotter = createMmoInterestSnapshotter({
    registry,
    filter(entity) {
      entity.publicData = { mutated: true };
      return true;
    }
  });

  expect(snapshotter.visibleIdsFor("p1", { x: 0, y: 0, radius: 32 })).toEqual(["a"]);
  expect(registry.get("a")?.publicData).toEqual({});
});

test("interest snapshotter validates standalone limits and normalizes hostile target radii", () => {
  const registry = createMmoEntityRegistry({ initialEntities: [{ id: "a", type: "npc", x: 0, y: 0 }] });
  expect(() => createMmoInterestSnapshotter({ registry, defaultRadius: Number.NaN })).toThrow("non-negative finite");
  expect(() => createMmoInterestSnapshotter({ registry, maxEntities: Number.POSITIVE_INFINITY })).toThrow("non-negative safe integer");

  const snapshotter = createMmoInterestSnapshotter({ registry, defaultRadius: 4 });
  expect(snapshotter.snapshotFor("viewer", { x: 0, y: 0, radius: -10 }).target.radius).toBe(4);
});
