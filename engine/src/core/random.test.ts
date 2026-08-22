import { expect, test } from "bun:test";
import { deriveSeed, SeedableRandom } from "./random.ts";

test("seedable random produces stable repeatable sequences", () => {
  const a = new SeedableRandom("catalog-sync");
  const b = new SeedableRandom("catalog-sync");

  expect([a.next(), a.next(), a.nextInt(10)]).toEqual([b.next(), b.next(), b.nextInt(10)]);
});

test("seedable random snapshots and restores state", () => {
  const rng = new SeedableRandom(42);
  rng.next();
  const snapshot = rng.snapshot();
  const expected = rng.next();

  rng.next();
  rng.restore(snapshot);

  expect(rng.next()).toBe(expected);
});

test("structured child seeds are stable, separated, and independent of parent draw order", () => {
  const root = new SeedableRandom("world-17");
  const expected = [root.fork("entity", 42).next(), root.fork("entity", 42).next()];
  root.next();
  root.next();

  expect(root.fork("entity", 42).next()).toBe(expected[0]);
  expect(deriveSeed("world-17", "ab", "c")).not.toBe(deriveSeed("world-17", "a", "bc"));
  expect(deriveSeed("world-17", 1)).not.toBe(deriveSeed("world-17", "1"));
  expect(expected[0]).toBe(expected[1]);
  expect(() => deriveSeed(1, Number.NaN)).toThrow("safe integers");
});
