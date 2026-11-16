import { describe, expect, test } from "bun:test";
import { createGridNavigator } from "./grid.ts";

describe("typed grid navigation", () => {
  test("finds a deterministic route around blockers with reusable storage", () => {
    const blocked = new Uint8Array(25);
    blocked[7] = blocked[12] = blocked[17] = 1;
    const navigator = createGridNavigator({ columns: 5, rows: 5, blocked });
    const first = new Int32Array(25);
    const second = new Int32Array(25);
    const a = navigator.findPath(10, 14, first);
    const b = navigator.findPath(10, 14, second);
    expect(a.status).toBe("found");
    expect([...first.slice(0, a.length)]).toEqual([...second.slice(0, b.length)]);
    expect(first[0]).toBe(10);
    expect(first[a.length - 1]).toBe(14);
  });

  test("prevents diagonal corner cutting unless explicitly enabled", () => {
    const blocked = new Uint8Array([0, 1, 1, 0]);
    const output = new Int32Array(4);
    expect(createGridNavigator({ columns: 2, rows: 2, blocked, diagonal: true }).findPath(0, 3, output).status).toBe("not-found");
    expect(createGridNavigator({ columns: 2, rows: 2, blocked, diagonal: true, allowCornerCutting: true }).findPath(0, 3, output)).toMatchObject({ status: "found", length: 2 });
  });

  test("uses weighted traversal cost instead of only geometric distance", () => {
    const costs = new Float32Array(9).fill(1);
    costs[1] = 20;
    const navigator = createGridNavigator({ columns: 3, rows: 3, costs });
    const output = new Int32Array(9);
    const result = navigator.findPath(0, 2, output);
    expect([...output.slice(0, result.length)]).toEqual([0, 3, 4, 5, 2]);
    expect(result.cost).toBe(4);
  });

  test("reports visit and output budgets without partial success", () => {
    const output = new Int32Array(2);
    const limited = createGridNavigator({ columns: 10, rows: 1, maxVisited: 2 });
    expect(limited.findPath(0, 9, output)).toMatchObject({ status: "budget-exceeded", visited: 2 });
    const normal = createGridNavigator({ columns: 4, rows: 1 });
    expect(normal.findPath(0, 3, output)).toMatchObject({ status: "output-too-small", length: 4 });
  });

  test("supports bounded obstacle updates and rejects invalid configuration", () => {
    const navigator = createGridNavigator({ columns: 2, rows: 1 });
    navigator.setBlocked(1, true);
    expect(navigator.findPath(0, 1, new Int32Array(2)).status).toBe("not-found");
    expect(() => navigator.setBlocked(2, true)).toThrow("outside");
    expect(() => createGridNavigator({ columns: 2, rows: 2, costs: new Float32Array([1, 0, 1, 1]) })).toThrow("greater than or equal to 1");
  });

  test("interleaved workspaces retain caller-owned masks and costs independently", () => {
    const blocked = new Uint8Array(6);
    const costs = new Float32Array(6).fill(1);
    const first = createGridNavigator({ columns: 3, rows: 2, blocked, costs });
    const second = createGridNavigator({ columns: 3, rows: 2 });
    const output = new Int32Array(6);
    expect(first.blocked).toBe(blocked);
    expect(first.costs).toBe(costs);
    for (let iteration = 0; iteration < 3; iteration++) {
      costs[1] = 20;
      expect(first.findPath(0, 2, output).cost).toBe(4);
      expect(second.findPath(0, 2, output).cost).toBe(2);
      first.setBlocked(1, true);
      expect(blocked[1]).toBe(1);
      expect(second.blocked[1]).toBe(0);
      first.setBlocked(1, false);
      costs[1] = 1;
      expect(first.findPath(0, 2, output).cost).toBe(2);
    }
  });
});

// Expected route/visited/cost frozen from the independent pre-redesign A*.
test("weighted diagonal heap relocation preserves tie order across repeated queries", () => {
  const blocked = new Uint8Array(35); blocked[9] = blocked[16] = blocked[23] = 1;
  const costs = Float32Array.from({ length: 35 }, (_, i) => 1 + (i * 13) % 4 / 4);
  const nav = createGridNavigator({ columns: 7, rows: 5, blocked, costs, diagonal: true });
  const output = new Int32Array(35);
  for (let i = 0; i < 4; i++) {
    expect(nav.findPath(0, 34, output)).toEqual({"status":"found","length":9,"visited":26,"cost":11.57842712474619});
    expect(Array.from(output.slice(0, 9))).toEqual([0,1,2,3,4,12,20,27,34]);
    expect(nav.findPath(34, 0, new Int32Array(0)).status).toBe("output-too-small");
  }
});
