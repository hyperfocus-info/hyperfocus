import { expect, test } from "bun:test";
import { createBoundedPathCache } from "./path-cache.ts";

type FakePath = { commands: string[]; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void };

function fakePath(): FakePath {
  const commands: string[] = [];
  return {
    commands,
    moveTo: (x, y) => commands.push(`M${x},${y}`),
    lineTo: (x, y) => commands.push(`L${x},${y}`),
    closePath: () => commands.push("Z"),
  };
}

test("bounded procedural path cache reuses hot paths and evicts least-recently-used entries", () => {
  let builds = 0;
  const cache = createBoundedPathCache<FakePath>({ maxEntries: 2, createPath: fakePath });
  const build = (path: FakePath) => { builds += 1; path.moveTo(0, 0); path.lineTo(1, 1); };
  const a = cache.get("a", build);
  expect(cache.get("a", build)).toBe(a);
  cache.get("b", build);
  cache.get("a", build);
  cache.get("c", build);
  expect(cache.has("a")).toBe(true);
  expect(cache.has("b")).toBe(false);
  expect(cache.size).toBe(2);
  expect(builds).toBe(3);
});
