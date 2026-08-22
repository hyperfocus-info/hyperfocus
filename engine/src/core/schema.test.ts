import { expect, test } from "bun:test";
import { SHARED_CACHE_LINE_BYTE_SIZE, createSharedMemoryPool, defineSharedSchema, sharedEntityBytes } from "./schema.ts";

test("shared schema computes aligned byte layout", () => {
  const schema = defineSharedSchema({
    flags: "u8",
    hp: "u16",
    x: "f32",
    y: "f32",
    alive: "bool"
  });

  expect(schema.fieldMap.flags.offset).toBe(0);
  expect(schema.fieldMap.hp.offset).toBe(2);
  expect(schema.fieldMap.x.offset).toBe(4);
  expect(schema.fieldMap.y.offset).toBe(8);
  expect(schema.fieldMap.alive.offset).toBe(12);
  expect(schema.byteSize).toBe(16);
});

test("shared memory pool exposes transparent entity proxies", () => {
  const schema = defineSharedSchema({
    x: "f32",
    y: "f32",
    hp: "u16",
    flags: "u8",
    alive: "bool"
  });
  const pool = createSharedMemoryPool(schema, { capacity: 2 });
  const { entity, slot } = pool.spawn({ x: 1, y: 2, hp: 100, alive: true });

  entity.x += 4;
  entity.hp = 42;
  entity.flags = 3;

  expect(entity.x).toBe(5);
  expect(entity.y).toBe(2);
  expect(entity.hp).toBe(42);
  expect(entity.flags).toBe(3);
  expect(entity.alive).toBe(true);
  expect(Object.keys(entity)).toEqual(["x", "y", "hp", "flags", "alive"]);
  expect(sharedEntityBytes(entity)).toMatchObject({ slot, byteLength: schema.byteSize });
  expect(pool.getEntityByteSlice(slot).byteLength).toBe(schema.byteSize);
});

test("shared memory sections and optional multi-writer slots are cache-line isolated", () => {
  const schema = defineSharedSchema({ x: "f32", y: "f32" });
  const compact = createSharedMemoryPool(schema, { capacity: 2 });
  expect(compact.dataByteOffset % SHARED_CACHE_LINE_BYTE_SIZE).toBe(0);
  expect(compact.slotStrideByteSize).toBe(schema.byteSize);

  const isolated = createSharedMemoryPool(schema, { capacity: 2, cacheLineAlignedSlots: true });
  expect(isolated.dataByteOffset % SHARED_CACHE_LINE_BYTE_SIZE).toBe(0);
  expect(isolated.slotStrideByteSize).toBe(SHARED_CACHE_LINE_BYTE_SIZE);
  expect(isolated.getEntityByteOffset(1) - isolated.getEntityByteOffset(0)).toBe(SHARED_CACHE_LINE_BYTE_SIZE);
});

test("shared memory exposes reusable compact field columns without entity proxies", () => {
  const schema = defineSharedSchema({ x: "f32", hp: "u16", alive: "bool" });
  const pool = createSharedMemoryPool(schema, { capacity: 3 });
  const first = pool.spawn({ x: 1.5, hp: 10, alive: true });
  const second = pool.spawn({ x: 2.5, hp: 20 });
  const slots = pool.occupiedSlots([]);
  expect(slots).toEqual([first.slot, second.slot]);

  const x = pool.readFieldColumn("x", slots, new Float32Array(2));
  expect(Array.from(x)).toEqual([1.5, 2.5]);
  pool.writeFieldColumn("hp", slots, new Uint16Array([11, 22]));
  pool.writeFieldColumn("alive", slots, new Uint8Array([0, 1]));
  expect([first.entity.hp, second.entity.hp]).toEqual([11, 22]);
  expect([first.entity.alive, second.entity.alive]).toEqual([false, true]);
});

test("shared memory stable reads wait for finished tick", () => {
  const schema = defineSharedSchema({ hp: "u16" });
  const pool = createSharedMemoryPool(schema, { capacity: 1 });
  const { entity, slot } = pool.spawn({ hp: 10 });

  expect(pool.readTick()).toBe(0);
  pool.beginTick();
  entity.hp = 12;
  expect(pool.readTick() % 2).toBe(1);
  pool.endTick();

  const stable = pool.readConsistentEntityBytes(slot);
  expect(stable.tick % 2).toBe(0);
  expect(stable.bytes.byteLength).toBe(schema.byteSize);
  expect(entity.hp).toBe(12);
});

test("attached shared memory pools coordinate slot allocation and clear reused slots", () => {
  const schema = defineSharedSchema({ hp: "u16" });
  const firstPool = createSharedMemoryPool(schema, { capacity: 2 });
  const secondPool = createSharedMemoryPool(schema, { capacity: 2, buffer: firstPool.buffer });

  const first = firstPool.spawn({ hp: 12 });
  const second = secondPool.spawn({ hp: 34 });
  expect(first.slot).toBe(0);
  expect(second.slot).toBe(1);
  expect(first.entity.hp).toBe(12);
  expect(second.entity.hp).toBe(34);

  firstPool.release(first);
  const reused = secondPool.spawn();
  expect(reused.slot).toBe(0);
  expect(reused.entity.hp).toBe(0);
});

test("shared memory attachments reject different schemas with the same byte size", () => {
  const firstSchema = defineSharedSchema({ value: "u32" });
  const incompatibleSchema = defineSharedSchema({ value: "f32" });
  const pool = createSharedMemoryPool(firstSchema, { capacity: 1 });

  expect(() => createSharedMemoryPool(incompatibleSchema, { capacity: 1, buffer: pool.buffer })).toThrow("does not match schema");
});

test("shared memory tick acquisition is owned and atomic across attachments", () => {
  const schema = defineSharedSchema({ value: "u8" });
  const firstPool = createSharedMemoryPool(schema, { capacity: 1 });
  const secondPool = createSharedMemoryPool(schema, { capacity: 1, buffer: firstPool.buffer });

  const openTick = firstPool.beginTick();
  expect(openTick % 2).toBe(1);
  expect(() => secondPool.beginTick()).toThrow("already open");
  expect(() => secondPool.endTick()).toThrow("not open for this pool");
  expect(firstPool.readTick()).toBe(openTick);
  expect(firstPool.endTick() % 2).toBe(0);
});

test("failed shared memory spawns release and clear their reserved slot", () => {
  const schema = defineSharedSchema({ hp: "u8" });
  const pool = createSharedMemoryPool(schema, { capacity: 1 });

  expect(() => pool.spawn({ hp: 300 })).toThrow("out of range");
  const next = pool.spawn();
  expect(next.slot).toBe(0);
  expect(next.entity.hp).toBe(0);
});

test("shared memory generations invalidate stale proxies and handle-based releases", () => {
  const schema = defineSharedSchema({ hp: "u8" });
  const pool = createSharedMemoryPool(schema, { capacity: 1 });
  const first = pool.spawn({ hp: 10 });
  const staleSerializer = (first.entity as typeof first.entity & { toJSON(): unknown }).toJSON;

  pool.release(first);
  expect(() => first.entity.hp).toThrow("stale");
  expect(() => pool.createEntityView(first.slot)).toThrow("not occupied");
  expect(() => pool.readField(first.slot, "hp")).toThrow("not occupied");

  const second = pool.spawn({ hp: 20 });
  expect(second.generation).not.toBe(first.generation);
  expect(sharedEntityBytes(second.entity).generation).toBe(second.generation);
  expect(() => {
    first.entity.hp = 99;
  }).toThrow("stale");
  expect(() => pool.release(first)).toThrow("handle is stale");
  expect(() => staleSerializer()).toThrow("stale");
  expect(second.entity.hp).toBe(20);
  expect(() => (pool.release as unknown as (slot: number) => void)(second.slot)).toThrow("requires a non-negative safe generation");
  pool.release(second.slot, second.generation);
});

test("shared schema rejects inherited primitive names and unsafe slot counts", () => {
  expect(() => defineSharedSchema({ value: "toString" } as never)).toThrow("unsupported");
  expect(() => defineSharedSchema({ toJSON: "u8" })).toThrow("reserved");
  const schema = defineSharedSchema({ value: "u8" });
  expect(() => createSharedMemoryPool(schema, { capacity: Number.MAX_SAFE_INTEGER + 1 })).toThrow("safe integer");
});
