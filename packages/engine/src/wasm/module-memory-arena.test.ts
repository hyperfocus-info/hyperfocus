import { describe, expect, test } from "bun:test";
import { createWasmMemoryArena } from "./module-memory-arena";

describe("WASM module memory arena", () => {
  test("leases bounded memory without exposing views beyond the lease", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    let cursor = 64;
    const arena = createWasmMemoryArena({
      memory,
      allocate(bytes) {
        const pointer = cursor;
        cursor += bytes;
        return pointer;
      },
      fixedCapacityBytes: 128
    });
    const lease = arena.lease(32);
    const source = new Float32Array([1, 2, 3, 4]);
    const target = new Float32Array(4);
    lease.writeFloat32(0, source, source.length);
    lease.readFloat32(0, target, target.length);

    expect([...target]).toEqual([1, 2, 3, 4]);
    expect(arena.leased).toBe(true);
    expect(() => arena.lease(1)).toThrow("active lease");
    lease.release();
    expect(arena.leased).toBe(false);
    expect(() => lease.readFloat32(0, target, 1)).toThrow("released");
    expect(() => arena.lease(129)).toThrow("capacity 128 bytes");
  });

  test("grows geometrically and refreshes its epoch after memory growth", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    let cursor = 64;
    const arena = createWasmMemoryArena({
      memory,
      allocate(bytes) {
        if (cursor + bytes > memory.buffer.byteLength) memory.grow(1);
        const pointer = cursor;
        cursor += bytes;
        return pointer;
      }
    });
    const initialEpoch = arena.epoch;
    const first = arena.lease(100);
    expect(first.capacityBytes).toBe(1024);
    first.release();
    const second = arena.lease(70_000);

    expect(second).toBe(first);
    expect(second.capacityBytes).toBe(70_000);
    expect(second.epoch).toBeGreaterThan(initialEpoch);
    second.release();
  });

  test("bounds geometric growth before invoking the module allocator", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const allocations: number[] = [];
    let cursor = 64;
    const arena = createWasmMemoryArena({
      memory,
      allocate(bytes) {
        allocations.push(bytes);
        const pointer = cursor;
        cursor += bytes;
        return pointer;
      },
      maximumCapacityBytes: 2_048
    });

    arena.lease(100).release();
    arena.lease(1_500).release();

    expect(allocations).toEqual([1_024, 2_048]);
    expect(() => arena.lease(2_049)).toThrow("maximum capacity 2048 bytes");
    expect(allocations).toHaveLength(2);
    expect(() => createWasmMemoryArena({
      memory,
      allocate: () => 64,
      fixedCapacityBytes: 128,
      maximumCapacityBytes: 127
    })).toThrow("fixedCapacityBytes cannot exceed maximumCapacityBytes");
  });

  test("supports a reusable initial capacity without forcing fixed overflow behavior", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const allocations: number[] = [];
    let cursor = 64;
    const arena = createWasmMemoryArena({
      memory,
      allocate(bytes) {
        allocations.push(bytes);
        const pointer = cursor;
        cursor += bytes;
        return pointer;
      },
      initialCapacityBytes: 128,
      maximumCapacityBytes: 1_024,
      label: "test scratch"
    });

    arena.lease(64).release();
    arena.lease(256).release();
    expect(allocations).toEqual([128, 256]);
    expect(() => arena.lease(1_025)).toThrow("test scratch maximum capacity 1024 bytes");
  });
});
