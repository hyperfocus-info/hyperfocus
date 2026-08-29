import { expect, test } from "bun:test";
import { SharedStateArena, createSharedStateArena } from "./shared-arena.ts";

test("state arena allocates aligned zero-copy typed views and attaches safely", () => {
  const arena = createSharedStateArena({ byteLength: 256, requireShared: true });
  const flags = arena.allocate(3, 1);
  const positions = arena.allocate(16, 16);
  expect(positions.byteOffset % 16).toBe(0);
  arena.float32(positions).set([1, 2, 3, 4]);
  expect(arena.publish()).toBe(1);
  const attached = createSharedStateArena({ buffer: arena.buffer, initialize: false, requireShared: true });
  expect(Array.from(attached.float32(positions))).toEqual([1, 2, 3, 4]);
  expect(attached.bytes(flags).length).toBe(3);
  expect(attached.epoch).toBe(1);
});

test("state arena enforces capacity, alignment, and sealing", () => {
  const arena = createSharedStateArena({ byteLength: 80 });
  expect(() => arena.allocate(4, 3)).toThrow("power of two");
  arena.allocate(16);
  expect(() => arena.allocate(1)).toThrow("capacity");
  arena.seal();
  expect(() => arena.allocate(0)).toThrow("sealed");
});

test("state arena preserves public constructor compatibility", () => {
  const arena = new SharedStateArena({ byteLength: 80 });
  expect(arena).toBeInstanceOf(SharedStateArena);
  expect(arena.usedBytes).toBe(64);
});
