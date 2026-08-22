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
});
