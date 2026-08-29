import { describe, expect, test } from "bun:test";
import { createRetainedCursor } from "./retained-cursor.ts";

describe("retained cursor", () => {
  test("reuses a fixed stable record set without allocating frame views", () => {
    const cursor = createRetainedCursor({ capacity: 2, create: () => ({ x: 0, y: 0 }) });
    const view = cursor.view();
    const first = cursor.take();
    first.x = 4;
    cursor.take();
    expect(view.count).toBe(2);

    cursor.begin();
    expect(cursor.view()).toBe(view);
    expect(view.count).toBe(0);
    expect(cursor.take()).toBe(first);
    expect(first.x).toBe(4);
  });

  test("throws on fixed overflow by default", () => {
    const cursor = createRetainedCursor({ capacity: 1, create: (index) => index });
    cursor.take();
    expect(() => cursor.take()).toThrow("capacity 1 exceeded");
  });

  test("supports explicitly bounded growth", () => {
    const cursor = createRetainedCursor({ capacity: 1, maximumCapacity: 3, overflow: "grow", create: (index) => index });
    expect([cursor.take(), cursor.take(), cursor.take()]).toEqual([0, 1, 2]);
    expect(cursor.capacity()).toBe(3);
    expect(() => cursor.take()).toThrow("capacity 3 exceeded");
  });

  test("requires an explicit bound before enabling growth", () => {
    expect(() => createRetainedCursor({
      capacity: 1,
      overflow: "grow",
      create: () => ({ value: 0 })
    })).toThrow("maximumCapacity is required");
  });
});
