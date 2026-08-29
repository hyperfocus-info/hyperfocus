import { expect, test } from "bun:test";
import {
  createMmoInventoryOps,
} from "./inventory.ts";
import {
  addMmoId,
  hasMmoId,
  parseMmoIdSet,
  removeMmoId,
} from "./id-set.ts";
import {
  useMmoConsumable,
  type MmoConsumableDefinition
} from "./consumable.ts";

test("inventory ops normalize aliases add and remove many and clean zero counts", () => {
  const ops = createMmoInventoryOps({ aliases: { copper: "coin", c: "coin" }, maxStack: { coin: 10, herb: 5 } });
  const inventory: Record<string, number> = { copper: 2, coin: 0, junk: -1 };

  expect(ops.get(inventory, "coin")).toBe(2);
  expect(inventory).toEqual({ coin: 2 });
  expect(ops.add(inventory, "c", 20)).toBe(10);
  expect(ops.addMany(inventory, { herb: 3, copper: 3 })).toEqual({ coin: 10, herb: 3 });
  expect(ops.removeMany(inventory, new Map([["copper", 4], ["herb", 2]]))).toBe(true);
  expect(inventory).toEqual({ coin: 6, herb: 1 });
  expect(ops.removeMany(inventory, { coin: 7, herb: 1 })).toBe(false);
  expect(inventory).toEqual({ coin: 6, herb: 1 });
  expect(ops.remove(inventory, "herb")).toBe(true);
  expect(inventory).toEqual({ coin: 6 });
  expect(ops.has(inventory, "copper", 6)).toBe(true);
  expect(ops.entries(inventory)).toEqual([["coin", 6]]);
});

test("id set helpers parse truthy flags and mutate record flags", () => {
  const flags = parseMmoIdSet({ a: true, b: false });

  expect(flags).toEqual({ a: true });
  expect(hasMmoId(flags, "a")).toBe(true);
  expect(hasMmoId(flags, "b")).toBe(false);
  addMmoId(flags, "b");
  expect(flags).toEqual({ a: true, b: true });
  removeMmoId(flags, "a");
  expect(flags).toEqual({ b: true });
  expect(parseMmoIdSet(["x", "y", "x"])).toEqual({ x: true, y: true });
});

test("id sets safely support object prototype property names", () => {
  const flags = parseMmoIdSet(["__proto__", "constructor"]);

  expect(Object.getPrototypeOf(flags)).toBeNull();
  expect(hasMmoId(flags, "__proto__")).toBe(true);
  expect(hasMmoId(flags, "constructor")).toBe(true);

  const ordinary: Record<string, boolean> = {};
  addMmoId(ordinary, "__proto__");
  expect(Object.getPrototypeOf(ordinary)).toBe(Object.prototype);
  expect(hasMmoId(ordinary, "__proto__")).toBe(true);
});

test("inventory rejects invalid requests and safely stores prototype-like item ids", () => {
  const ops = createMmoInventoryOps();
  const inventory: Record<string, number> = {};

  expect(ops.add(inventory, "__proto__", 2)).toBe(2);
  expect(Object.getPrototypeOf(inventory)).toBe(Object.prototype);
  expect(ops.get(inventory, "__proto__")).toBe(2);
  expect(ops.remove(inventory, "__proto__", -1)).toBe(false);
  expect(ops.remove(inventory, "__proto__", Number.NaN)).toBe(false);
  expect(ops.has(inventory, "__proto__", Number.NaN)).toBe(false);
  expect(ops.get(inventory, "__proto__")).toBe(2);
});

test("inventory alias cycles resolve to one deterministic canonical id", () => {
  const ops = createMmoInventoryOps({ aliases: { a: "b", b: "a" } });
  const inventory = { a: 2, b: 3 };

  expect(ops.compact(inventory)).toEqual({ a: 5 });
  expect(ops.get(inventory, "a")).toBe(5);
  expect(ops.get(inventory, "b")).toBe(5);
});

test("inventory preserves exact counts at the safe-integer boundary", () => {
  const ops = createMmoInventoryOps();
  const inventory = { coin: Number.MAX_SAFE_INTEGER - 1 };

  expect(ops.add(inventory, "coin", 2)).toBe(Number.MAX_SAFE_INTEGER);
  expect(ops.add(inventory, "coin", Number.MAX_SAFE_INTEGER + 1)).toBe(Number.MAX_SAFE_INTEGER);
  expect(ops.remove(inventory, "coin", Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  expect(inventory.coin).toBe(Number.MAX_SAFE_INTEGER);

  expect(ops.removeMany(inventory, [["coin", Number.MAX_SAFE_INTEGER], ["coin", 1]])).toBe(false);
  expect(inventory.coin).toBe(Number.MAX_SAFE_INTEGER);
});

test("inventory bulk mutations are transactional when a later entry fails", () => {
  const ops = createMmoInventoryOps({
    maxStack(itemId) {
      if (itemId === "broken") throw new Error("broken max stack");
      return 10;
    }
  });
  const inventory = { coin: 2 };

  expect(() => ops.addMany(inventory, [["coin", 1], ["broken", 1]])).toThrow("broken max stack");
  expect(inventory).toEqual({ coin: 2 });
});

test("consumables consume inventory only after successful use", () => {
  const actor: { hp: number } = { hp: 1 };
  const inventory: Record<string, number> = { potion: 2, fizz: 1 };
  const definitions: Record<string, MmoConsumableDefinition<typeof actor, unknown, "healed">> = {
    potion: {
      consume: 1,
      canUse: ({ actor }) => actor.hp < 5,
      apply: ({ actor }) => {
        actor.hp += 2;
        return "healed" as const;
      }
    },
    fizz: {
      consume: 1,
      apply: () => false
    }
  };

  expect(useMmoConsumable(actor, inventory, "potion", definitions)).toEqual({ ok: true, itemId: "potion", consumed: 1, result: "healed" });
  expect(actor.hp).toBe(3);
  expect(inventory).toEqual({ potion: 1, fizz: 1 });

  actor.hp = 5;
  expect(useMmoConsumable(actor, inventory, "potion", definitions)).toEqual({ ok: false, itemId: "potion", consumed: 0, reason: "blocked" });
  expect(inventory).toEqual({ potion: 1, fizz: 1 });

  expect(useMmoConsumable(actor, inventory, "fizz", definitions)).toEqual({ ok: false, itemId: "fizz", consumed: 0, reason: "apply-failed" });
  expect(inventory).toEqual({ potion: 1, fizz: 1 });
});
