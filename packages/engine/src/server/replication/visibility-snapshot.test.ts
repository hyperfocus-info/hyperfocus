import { expect, test } from "bun:test";
import { selectVisibleEntityBuckets } from "./visibility-snapshot.ts";

type TestEntity = {
  id: string;
  kind: "player" | "loot" | "npc";
  ownerId?: string;
  hp?: number;
  secret?: string;
};

test("visible entity buckets project entities for a viewer", () => {
  const source: Record<string, TestEntity> = {
    p1: { id: "p1", kind: "player", hp: 10, secret: "self-loadout" },
    p2: { id: "p2", kind: "player", hp: 8, secret: "remote-loadout" },
    loot1: { id: "loot1", kind: "loot", ownerId: "p1", secret: "gold" },
    loot2: { id: "loot2", kind: "loot", ownerId: "p2", secret: "silk" },
    npc1: { id: "npc1", kind: "npc", hp: 12 }
  };

  const result = selectVisibleEntityBuckets({
    source,
    ids: ["p2", "loot1", "loot2", "npc1", "p2"],
    includeIds: ["p1"],
    bucketNames: ["player", "loot", "npc"],
    bucketFor: (entity) => entity.kind,
    project(entity) {
      if (entity.kind === "loot" && entity.ownerId !== "p1") return undefined;
      if (entity.kind === "player" && entity.id !== "p1") return { id: entity.id, kind: entity.kind, hp: entity.hp };
      return entity;
    }
  });

  expect(result.count).toBe(4);
  expect(Object.keys(result.entities)).toEqual(["p2", "loot1", "npc1", "p1"]);
  const playerBucket = result.buckets.player;
  const lootBucket = result.buckets.loot;
  if (!playerBucket || !lootBucket) throw new Error("Expected initialized visibility buckets.");
  expect(playerBucket.p2).toEqual({ id: "p2", kind: "player", hp: 8 });
  expect(playerBucket.p1?.secret).toBe("self-loadout");
  expect(lootBucket.loot2).toBeUndefined();
});
