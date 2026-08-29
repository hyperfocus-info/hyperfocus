import { expect, test } from "bun:test";
import { createBitReader, createBitWriter } from "./bit-buffer.ts";

test("bit buffers pack bounded fields across byte boundaries", () => {
  const writer = createBitWriter(1);
  writer.writeBits(3, 2);
  writer.writeBool(true);
  writer.writeBits(17, 5);
  writer.writeSigned(-7, 5);
  writer.writeBits(0x1234, 16);

  const bytes = writer.toUint8Array();
  const reader = createBitReader(bytes);
  expect(bytes.byteLength).toBe(4);
  expect(reader.readBits(2)).toBe(3);
  expect(reader.readBool()).toBe(true);
  expect(reader.readBits(5)).toBe(17);
  expect(reader.readSigned(5)).toBe(-7);
  expect(reader.readBits(16)).toBe(0x1234);
  expect(reader.bitOffset).toBe(29);
});

test("bit buffers handle full unsigned words without signed coercion", () => {
  const writer = createBitWriter();
  writer.writeBits(0xffff_ffff, 32);
  expect(createBitReader(writer.toUint8Array()).readBits(32)).toBe(0xffff_ffff);
});

test("bit buffers reject overflow and truncated reads", () => {
  const writer = createBitWriter();
  expect(() => writer.writeBits(4, 2)).toThrow("does not fit");
  expect(() => writer.writeSigned(16, 5)).toThrow("does not fit");
  expect(() => writer.writeBits(0, 33)).toThrow("bit count");
  expect(() => createBitReader(Uint8Array.of(1)).readBits(9)).toThrow("buffer length");
});

test("bit buffers can align mixed bit-packed and byte-oriented sections", () => {
  const writer = createBitWriter();
  writer.writeBits(5, 3);
  writer.alignToByte();
  writer.writeBits(0xab, 8);
  expect([...writer.toUint8Array()]).toEqual([5, 0xab]);

  const reader = createBitReader(writer.toUint8Array());
  expect(reader.readBits(3)).toBe(5);
  reader.alignToByte();
  expect(reader.readBits(8)).toBe(0xab);
});
