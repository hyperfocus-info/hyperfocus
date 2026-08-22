import { expect, test } from "bun:test";
import { createObjectPool } from "./object-pool.ts";

test("object pool reuses reset POJOs", () => {
  const pool = createObjectPool({
    create: () => ({ active: false, x: 0, y: 0 }),
    reset: (item) => {
      item.active = false;
      item.x = 0;
      item.y = 0;
    },
    capacity: 2
  });

  const first = pool.acquire();
  first.active = true;
  first.x = 12;
  first.y = 24;

  pool.release(first);
  const second = pool.acquire();

  expect(second).toBe(first);
  expect(second).toEqual({ active: false, x: 0, y: 0 });
  expect(pool.createdCount()).toBe(1);
});

test("object pool respects capacity", () => {
  const pool = createObjectPool({
    create: () => ({ value: 0 }),
    reset: (item) => {
      item.value = 0;
    },
    capacity: 1
  });

  const first = pool.acquire();
  const second = pool.acquire();

  pool.release(first);
  pool.release(second);

  expect(pool.freeCount()).toBe(1);
});

test("object pool serializes free items and created count", () => {
  const pool = createObjectPool({
    create: () => ({ active: false, value: 0 }),
    reset: (item) => {
      item.active = false;
      item.value = 0;
    },
    capacity: 3
  });
  const first = pool.acquire();
  first.value = 9;
  pool.release(first);
  const snapshot = pool.serialize();

  const restored = createObjectPool({
    create: () => ({ active: false, value: -1 }),
    reset: (item) => {
      item.active = false;
      item.value = 0;
    },
    capacity: 3
  });
  restored.deserialize(snapshot);
  const acquired = restored.acquire();

  expect(restored.createdCount()).toBe(1);
  expect(acquired).toEqual({ active: false, value: 0 });
});

test("object pool reuses falsy values", () => {
  const pool = createObjectPool({
    create: () => 0,
    reset: () => {},
    capacity: 1
  });

  const first = pool.acquire();
  pool.release(first);
  expect(pool.acquire()).toBe(0);
  expect(pool.createdCount()).toBe(1);
});

test("object pool rejects invalid capacities and incompatible snapshots", () => {
  expect(() => createObjectPool({ create: () => 0, reset: () => {}, capacity: -1 })).toThrow("capacity");

  const pool = createObjectPool({ create: () => 0, reset: () => {}, capacity: 1 });
  expect(() => pool.preload(Number.POSITIVE_INFINITY)).toThrow("preload count");
  expect(() =>
    pool.deserialize({
      version: 1,
      capacity: 2,
      created: 0,
      free: []
    })
  ).toThrow("does not match pool capacity");
  expect(() =>
    pool.deserialize({
      version: 1,
      capacity: 1,
      created: 1,
      free: [0, 0]
    })
  ).toThrow("exceeds capacity");
});

test("object pool rejects foreign and duplicate releases", () => {
  const pool = createObjectPool({
    create: () => ({ value: 0 }),
    reset: (item) => { item.value = 0; },
    capacity: 2
  });
  const item = pool.acquire();

  expect(() => pool.release({ value: 0 })).toThrow("foreign or already released");
  pool.release(item);
  expect(() => pool.release(item)).toThrow("foreign or already released");
  expect(pool.freeCount()).toBe(1);
  expect(pool.acquire()).toBe(item);
});

test("object pool tracks repeated primitive values by multiplicity", () => {
  const pool = createObjectPool({ create: () => 0, reset: () => {}, capacity: 2 });
  const first = pool.acquire();
  const second = pool.acquire();

  pool.release(first);
  pool.release(second);
  expect(() => pool.release(0)).toThrow("foreign or already released");
  expect(pool.freeCount()).toBe(2);
  expect(pool.acquire()).toBe(0);
  expect(pool.acquire()).toBe(0);
});

test("object pool keeps ownership checked out when reset fails", () => {
  let fail = true;
  const pool = createObjectPool({
    create: () => ({ value: 1 }),
    reset: () => {
      if (fail) throw new Error("reset failed");
    },
    capacity: 1
  });
  const item = pool.acquire();

  expect(() => pool.release(item)).toThrow("reset failed");
  fail = false;
  pool.release(item);
  expect(pool.freeCount()).toBe(1);
});
