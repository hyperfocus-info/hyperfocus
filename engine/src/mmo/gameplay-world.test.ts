import { expect, test } from "bun:test";
import { createMmoGameplayKit, createMmoRoomType, createMmoWorld, type MmoResourceState } from "./index.ts";

test("gameplay kit composes skills inventory cooldowns loot resources and quests", () => {
  const kit = createMmoGameplayKit({
    skills: [{ id: "combat", levelForXp: (xp) => 1 + Math.floor(xp / 50) }],
    lootTables: { goblin: [{ itemId: "coin", min: 2, max: 2 }] },
    quests: [{ id: "intro", goals: { kills: 2 } }]
  });
  const skills = {};
  const inventory = {};
  const cooldowns = {};
  const quests = {};
  const resource: MmoResourceState = { hp: 3, maxHp: 3, respawnMs: 10 };

  expect(kit.awardXp(skills, "combat", 100)).toEqual({ xp: 100, level: 3 });
  expect(kit.addItem(inventory, "coin", 3)).toBe(3);
  expect(kit.removeItem(inventory, "coin", 2)).toBe(true);
  kit.startCooldown(cooldowns, "swing", 20);
  kit.tickCooldowns(cooldowns, 20);
  expect(kit.cooldownReady(cooldowns, "swing")).toBe(true);
  expect(kit.rollLoot("goblin", () => 0)).toEqual({ itemId: "coin", amount: 2 });
  expect(kit.damageResource(resource, 3)).toBe(true);
  kit.tickResource(resource, 10);
  expect(resource.depleted).toBe(false);
  kit.startQuest(quests, "intro");
  kit.progressQuest(quests, "intro", "kills", 2);
  expect(kit.completeQuest(quests, "intro")).toBe(true);
});

test("gameplay kit rejects corrupting numeric and record-key inputs", () => {
  const kit = createMmoGameplayKit({
    lootTables: {
      empty: [{ itemId: "coin", weight: 0 }],
      mixed: [
        { itemId: "impossible", weight: 0 },
        { itemId: "coin", weight: 1 }
      ],
      overflow: [
        { itemId: "a", weight: Number.MAX_VALUE },
        { itemId: "b", weight: Number.MAX_VALUE }
      ]
    },
    quests: [{ id: "safe", goals: { count: 1 } }]
  });
  const inventory: Record<string, number> = {};

  expect(() => kit.removeItem(inventory, "coin", -5)).toThrow("positive safe integer");
  expect(() => kit.addItem(inventory, "__proto__", 1)).toThrow("reserved");
  expect(() => kit.startCooldown({}, "swing", Number.NaN)).toThrow("non-negative finite");
  expect(() => kit.damageResource({ hp: 1, maxHp: 1 }, -1)).toThrow("non-negative finite");
  expect(kit.rollLoot("empty", () => 0)).toBeUndefined();
  expect(kit.rollLoot("mixed", () => 0)?.itemId).toBe("coin");
  expect(() => kit.rollLoot("overflow", () => 0)).toThrow("total weight must be finite");
  expect(() => kit.addItem({ coin: Number.MAX_SAFE_INTEGER }, "coin", 1)).toThrow("safe integer range");
  expect(() => kit.tickCooldowns({ swing: Number.NaN }, 1)).toThrow("non-negative finite");
  expect(() => kit.tickResource({ hp: Number.NaN, maxHp: 1, depleted: true, respawnMs: 0 }, 1)).toThrow("non-negative finite");
  const questState: Record<string, { status: "active" | "complete"; goals: Record<string, number> }> = {};
  const quest = kit.startQuest(questState, "safe");
  quest.goals.count = Number.NaN;
  expect(() => kit.completeQuest(questState, "safe")).toThrow("non-negative finite");
  expect(inventory).toEqual({});
});

test("MMO world registers generated room types", () => {
  const room = createMmoRoomType({ name: "field" });
  const world = createMmoWorld({ id: "demo", rooms: [room] });

  expect(world.id).toBe("demo");
  expect(world.getRoomType("field")).toBe(room);
  expect(world.roomTypes().map((roomType) => roomType.name)).toEqual(["field"]);
});
