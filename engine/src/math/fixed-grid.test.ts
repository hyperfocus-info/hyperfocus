import { expect, test } from "bun:test";
import { createFixedGridSpatialIndex } from "./fixed-grid.ts";

test("fixed grid spatial index queries nearby circles", () => {
  const index = createFixedGridSpatialIndex<{ id: string; x: number; y: number; radius: number }>({ cellSize: 10 });
  index.rebuild([
    { id: "near", x: 4, y: 0, radius: 2 },
    { id: "wide", x: 15, y: 0, radius: 8 },
    { id: "far", x: 40, y: 0, radius: 2 }
  ]);

  expect(index.queryCircle({ x: 0, y: 0, radius: 8 }).map((item) => item.id).sort()).toEqual(["near", "wide"]);
});

test("fixed grid spatial index supports wrapped worlds", () => {
  const index = createFixedGridSpatialIndex<{ id: string; x: number; y: number; radius: number }>({
    cellSize: 10,
    worldSize: 100
  });
  index.rebuild([
    { id: "wrapped", x: 48, y: 0, radius: 4 },
    { id: "far", x: 20, y: 0, radius: 4 }
  ]);

  expect(index.queryCircle({ x: -48, y: 0, radius: 5 }).map((item) => item.id)).toEqual(["wrapped"]);
});

test("wrapped distance handles coordinates separated by many world periods", () => {
  const index = createFixedGridSpatialIndex<{ id: string; x: number; y: number; radius: number }>({
    cellSize: 10,
    worldSize: 100
  });
  index.add({ id: "wrapped-many-times", x: 1048, y: -1000, radius: 1 });

  expect(index.queryCircle({ x: -48, y: 0, radius: 4 }).map((item) => item.id)).toEqual(["wrapped-many-times"]);
});

test("large finite queries use bounded populated-cell work and invalid queries fail fast", () => {
  const index = createFixedGridSpatialIndex<{ id: string; x: number; y: number }>({ cellSize: 0.000001 });
  index.add({ id: "only", x: 1, y: 1 });

  expect(index.queryCircle({ x: 0, y: 0, radius: Number.MAX_VALUE }).map((item) => item.id)).toEqual(["only"]);
  expect(() => index.queryCircle({ x: Infinity, y: 0, radius: 1 })).toThrow(/coordinates/);
  expect(() => index.queryCircle({ x: 0, y: 0, radius: Infinity })).toThrow(/radius/);
});

test("failed fixed-grid rebuilds leave the prior index intact", () => {
  const index = createFixedGridSpatialIndex<{ id: string; x: number; y: number }>({ cellSize: 10 });
  index.add({ id: "existing", x: 0, y: 0 });

  expect(() => index.rebuild([{ id: "invalid", x: NaN, y: 0 }])).toThrow(/coordinates/);
  expect(index.queryCircle({ x: 0, y: 0, radius: 1 }).map((item) => item.id)).toEqual(["existing"]);
});
