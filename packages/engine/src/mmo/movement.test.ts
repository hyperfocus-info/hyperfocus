import { expect, test } from "bun:test";
import { createMmoOccupancyTester, moveMmoCircle, rectAroundPoint, teleportMmoEntityToTile } from "./movement.ts";

test("movement clamps delta and preserves axis-separated collision", () => {
  const tester = createMmoOccupancyTester({
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    solidRects: [{ x: 2, y: 0, width: 1, height: 3 }]
  });
  const entity = { x: 1, y: 1, radius: 0.4 };

  expect(rectAroundPoint({ x: 4, y: 5 }, 2)).toEqual({ x: 2, y: 3, width: 4, height: 4 });
  expect(moveMmoCircle(entity, 10, 0, tester, { maxDistance: 0.5 })).toMatchObject({ x: 1.5, y: 1, dx: 0.5, dy: 0, blockedX: false });
  expect(moveMmoCircle(entity, 1, 1, tester)).toMatchObject({ x: 1.5, y: 2, dx: 0, dy: 1, blockedX: true, blockedY: false });
});

test("teleport to tile uses tile centers and rejects occupied destinations", () => {
  const tester = createMmoOccupancyTester({
    tileSize: 16,
    width: 3,
    height: 3,
    isSolidTile: (tileX, tileY) => tileX === 2 && tileY === 1
  });
  const entity = { x: 0, y: 0, radius: 1 };

  expect(teleportMmoEntityToTile(entity, 1, 1, 16, tester)).toEqual({ ok: true, x: 24, y: 24 });
  expect(entity).toEqual({ x: 24, y: 24, radius: 1 });
  expect(teleportMmoEntityToTile(entity, 2, 1, 16, tester)).toEqual({ ok: false, x: 24, y: 24 });
  expect(entity).toEqual({ x: 24, y: 24, radius: 1 });
});

test("occupancy tester can cache static solid rect input", () => {
  let reads = 0;
  const rects = [{ x: 1, y: 1, width: 1, height: 1 }];
  const tester = createMmoOccupancyTester({
    cacheSolidRects: true,
    solidRects: () => {
      reads += 1;
      return rects;
    }
  });

  expect(tester.blockedAt(1.5, 1.5, 0.25)).toBe(true);
  rects.length = 0;
  expect(tester.blockedAt(1.5, 1.5, 0.25)).toBe(true);
  expect(reads).toBe(1);
});

test("dynamic solid rect input still refreshes by default", () => {
  let blocked = true;
  let reads = 0;
  const tester = createMmoOccupancyTester({
    solidRects: () => {
      reads += 1;
      return blocked ? [{ x: 1, y: 1, width: 1, height: 1 }] : [];
    }
  });

  expect(tester.blockedAt(1.5, 1.5, 0.25)).toBe(true);
  blocked = false;
  expect(tester.blockedAt(1.5, 1.5, 0.25)).toBe(false);
  expect(reads).toBe(2);
});

test("occupancy and teleport boundaries reject non-finite values before they can hang or corrupt positions", () => {
  expect(() => createMmoOccupancyTester({ tileSize: Number.POSITIVE_INFINITY })).toThrow("tileSize");
  expect(() => createMmoOccupancyTester({ width: 1.5 })).toThrow("non-negative safe integer");

  const tester = createMmoOccupancyTester({ tileSize: 1, isSolidTile: () => false });
  expect(() => tester.blockedAt(Number.POSITIVE_INFINITY, 0, 1)).toThrow("circle x must be finite");
  expect(() => tester.rectBlocked({ x: 0, y: 0, width: Number.NaN, height: 1 })).toThrow("width");

  const entity = { x: 2, y: 3, radius: 1 };
  expect(() => moveMmoCircle(entity, 1, 0, tester, { maxDistance: Number.NaN })).toThrow("maxDistance");
  expect(entity).toEqual({ x: 2, y: 3, radius: 1 });
  expect(() => teleportMmoEntityToTile(entity, Number.POSITIVE_INFINITY, 0, 16, tester)).toThrow("tileX");
  expect(entity).toEqual({ x: 2, y: 3, radius: 1 });
});
