import { describe, expect, test } from "bun:test";
import { createWasmMemoryArena } from "./module-memory-arena.ts";

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

    expect(second).not.toBe(first);
    expect(second.capacityBytes).toBe(70_000);
    expect(second.epoch).toBeGreaterThan(initialEpoch);
    second.release();
  });

  test("released identities cannot read, write or release a subsequent lease", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const arena = createWasmMemoryArena({ memory, allocate: () => 64, fixedCapacityBytes: 16 });
    const first = arena.lease(4);
    first.release();
    const second = arena.lease(4);
    second.writeFloat32(0, [42], 1);
    expect(() => first.writeFloat32(0, [99], 1)).toThrow("released");
    expect(() => first.readFloat32(0, [0], 1)).toThrow("released");
    expect(() => first.readUint8(0, [0], 1)).toThrow("released");
    expect(() => first.epoch).toThrow("released");
    first.release();
    expect(arena.leased).toBe(true);
    const out = [0];
    second.readFloat32(0, out, 1);
    expect(out).toEqual([42]);
    second.release();
    second.release();
    expect(arena.leased).toBe(false);
  });

  test("active reads and writes refresh views after unrelated memory growth", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const arena = createWasmMemoryArena({ memory, allocate: () => 64, fixedCapacityBytes: 16 });
    const lease = arena.lease(16);
    lease.writeFloat32(0, [42], 1);
    const initialEpoch = lease.epoch;
    memory.grow(1);
    const typed = new Float32Array(1), plain = [0];
    lease.readFloat32(0, typed, 1);
    lease.readFloat32(0, plain, 1);
    expect([...typed]).toEqual([42]);
    expect(plain).toEqual([42]);
    expect(lease.epoch).toBeGreaterThan(initialEpoch);
    memory.grow(1);
    lease.writeFloat32(0, new Float32Array([7]), 1);
    memory.grow(1);
    lease.writeFloat32(4, [9], 1);
    expect([...new Float32Array(memory.buffer, 64, 2)]).toEqual([7, 9]);
    new Uint8Array(memory.buffer)[72] = 123;
    memory.grow(1);
    const mask = new Uint8Array(1);
    lease.readUint8(8, mask, 1);
    lease.readUint8(8, plain, 1);
    expect([...mask]).toEqual([123]);
    expect(plain).toEqual([123]);
    lease.release();
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
