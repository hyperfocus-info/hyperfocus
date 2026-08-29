import { expect, test } from "bun:test";
import { aabbsOverlap, createAabb, createCollisionBroadphase } from "./broadphase.ts";

test("collision broadphase returns passive query candidates without owning entities", () => {
  const broadphase = createCollisionBroadphase<string>({ maxEntries: 4 });

  broadphase.upsert("player", createAabb(0, 0, 10, 10));
  broadphase.upsert("coin", createAabb(8, 8, 4, 4));
  broadphase.upsert("wall", createAabb(40, 40, 8, 8));

  expect(broadphase.count()).toBe(3);
  expect(broadphase.query(createAabb(9, 9, 1, 1)).sort()).toEqual(["coin", "player"]);
  expect(broadphase.query(createAabb(20, 20, 5, 5))).toEqual([]);
  expect(broadphase.collides(createAabb(42, 42, 1, 1))).toBe(true);
});

test("collision broadphase updates, removes, and rebuilds by consumer id", () => {
  const broadphase = createCollisionBroadphase<number>();

  broadphase.rebuild([
    { id: 1, ...createAabb(0, 0, 4, 4) },
    { id: 2, ...createAabb(20, 0, 4, 4) }
  ]);
  expect(broadphase.query(createAabb(1, 1, 1, 1))).toEqual([1]);

  broadphase.upsert(1, createAabb(30, 0, 4, 4));
  expect(broadphase.query(createAabb(1, 1, 1, 1))).toEqual([]);
  expect(broadphase.query(createAabb(31, 1, 1, 1))).toEqual([1]);
  expect(broadphase.remove(2)).toBe(true);
  expect(broadphase.remove(2)).toBe(false);
  expect(broadphase.count()).toBe(1);
});

test("collision broadphase reports unique overlapping pairs", () => {
  const broadphase = createCollisionBroadphase<string>({ maxEntries: 4 });

  broadphase.rebuild([
    { id: "a", ...createAabb(0, 0, 10, 10) },
    { id: "b", ...createAabb(5, 5, 10, 10) },
    { id: "c", ...createAabb(30, 30, 10, 10) },
    { id: "d", ...createAabb(8, 8, 2, 2) }
  ]);

  expect(broadphase.pairs()).toEqual([
    { a: "a", b: "b" },
    { a: "a", b: "d" },
    { a: "b", b: "d" }
  ]);
  const visited: string[] = [];
  expect(broadphase.forEachPair((a, b) => visited.push(`${a}:${b}`))).toBe(3);
  expect(visited.sort()).toEqual(["a:b", "a:d", "b:d"]);
});

test("aabb helpers normalize rectangles and keep edge-touching separate", () => {
  expect(createAabb(10, 10, -4, -6)).toEqual({ minX: 6, minY: 4, maxX: 10, maxY: 10 });
  expect(aabbsOverlap(createAabb(0, 0, 10, 10), createAabb(10, 0, 2, 2))).toBe(false);
  expect(aabbsOverlap(createAabb(0, 0, 10, 10), createAabb(9.99, 0, 2, 2))).toBe(true);
});

test("broadphase rejects invalid bounds and rebuilds transactionally", () => {
  const broadphase = createCollisionBroadphase<string>();
  broadphase.upsert("existing", createAabb(0, 0, 2, 2));

  expect(() => createAabb(Infinity, 0, 1, 1)).toThrow(/finite/);
  expect(() => broadphase.rebuild([
    { id: "next", ...createAabb(10, 10, 2, 2) },
    { id: "bad", minX: 0, minY: 0, maxX: NaN, maxY: 1 }
  ])).toThrow(/finite/);
  expect(broadphase.query(createAabb(0, 0, 1, 1))).toEqual(["existing"]);
});

test("broadphase rejects non-finite ids and option counts", () => {
  expect(() => createCollisionBroadphase({ maxEntries: Infinity })).toThrow(/maxEntries/);
  const broadphase = createCollisionBroadphase<number>();
  expect(() => broadphase.upsert(NaN, createAabb(0, 0, 1, 1))).toThrow(/ids/);
});

test("broadphase can bypass packed-index rebuilds for highly dynamic scenes", () => {
  const broadphase = createCollisionBroadphase<number>({
    strategy: "auto",
    linearScanThreshold: 0,
    dynamicUpdateRatio: 0.5
  });
  broadphase.rebuild(Array.from({ length: 40 }, (_, id) => ({ id, minX: id * 2, minY: 0, maxX: id * 2 + 1, maxY: 1 })));

  expect(broadphase.query(createAabb(0, 0, 4, 1)).sort((a, b) => a - b)).toEqual([0, 1]);
  expect(broadphase.queryStrategy()).toBe("packed");

  for (let id = 0; id < 30; id += 1) broadphase.upsert(id, createAabb(id * 2, 10, 1, 1));
  expect(broadphase.query(createAabb(0, 10, 4, 1))).toEqual([0, 1]);
  expect(broadphase.queryStrategy()).toBe("linear");
});

test("broadphase validates and honors an explicit linear strategy", () => {
  const broadphase = createCollisionBroadphase<string>({ strategy: "linear" });
  broadphase.upsert("a", createAabb(0, 0, 2, 2));
  expect(broadphase.collides(createAabb(1, 1, 1, 1))).toBe(true);
  expect(broadphase.queryStrategy()).toBe("linear");
  expect(() => Reflect.apply(createCollisionBroadphase, undefined, [{ strategy: "bad" }])).toThrow("strategy");
  expect(() => createCollisionBroadphase({ dynamicUpdateRatio: 2 })).toThrow("dynamicUpdateRatio");
});
