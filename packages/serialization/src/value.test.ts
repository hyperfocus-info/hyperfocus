import { expect, test } from "bun:test";
import { fromBinary, toJson } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import { createValueCodec, decodeValue, encodeValue, readStoredValue } from "./value";
import { decodeStoredText, encodeStoredText } from "./text";
import { readValueFrame } from "./frame";
import { encodeStorageValue } from "./storage";

test("portable protobuf values interoperate with the standard Value schema", () => {
  for (const value of [null, false, 0, -3.125, "雪 🎵", [], {}, { empty: "", missing: undefined, list: [true, null, undefined, { n: 9007199254740991 }] }]) {
    const bytes = encodeValue(value);
    const expected = JSON.parse(JSON.stringify(value));
    expect(decodeValue(bytes)).toEqual(expected);
    expect(toJson(ValueSchema, fromBinary(ValueSchema, bytes.subarray(5)))).toEqual(expected);
    expect(decodeStoredText(encodeStoredText(value))).toEqual(expected);
    expect(readStoredValue(JSON.stringify(value))).toEqual(expected);
  }
});

test("legacy text is read without permitting corrupt or unknown protobuf to fall back", () => {
  expect(decodeStoredText('{"old":true}')).toEqual({ old: true });
  for (const input of ["hf:pb:2:e30=", "hf:pb:1:!!!!", "hf:pb:1:e30=", "hf:pb:1:", "hf:pb:1:SEZQQgE=", "{bad"]) {
    expect(() => decodeStoredText(input)).toThrow();
  }
  const bytes = encodeValue({ text: "hello" });
  expect(() => decodeValue(bytes.subarray(0, bytes.length - 1))).toThrow();
  bytes[4] = 2;
  expect(() => decodeValue(bytes)).toThrow("Unsupported");
});

test("bounds and unsupported values fail at the codec boundary", () => {
  const cycle: unknown[] = []; cycle.push(cycle);
  for (const value of [cycle, Infinity, NaN, 1n, new Date(), new Map(), () => 1, undefined]) expect(() => encodeValue(value)).toThrow();
  const deep = { a: { b: { c: 1 } } };
  expect(() => encodeValue(deep, { maxDepth: 1 })).toThrow("structure");
  expect(() => decodeValue(encodeValue(deep), { maxDepth: 1 })).toThrow();
  expect(() => encodeValue([1, 2, 3], { maxNodes: 2 })).toThrow("structure");
  expect(() => encodeValue("snow 雪", { maxBytes: 3 })).toThrow("byte");
  expect(() => decodeStoredText(encodeStoredText("long text"), { maxBytes: 3 })).toThrow("byte");
  expect(() => readStoredValue('"雪雪"', { maxBytes: 7 })).toThrow("byte");
  expect(() => encodeValue(null, { maxBytes: 0 })).toThrow("limits");
});

test("domain validators and unusual object keys survive the binary boundary", () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":0,"toString":null}');
  expect(decodeValue(encodeValue(value))).toEqual(value);
  expect(Object.prototype).not.toHaveProperty("polluted");
  const codec = createValueCodec({ parse(value) {
    if (typeof value !== "string") throw new Error("Expected string");
    return value;
  } });
  expect(codec.decode(codec.encode("ok"))).toBe("ok");
  expect(() => codec.decode(encodeValue(3))).toThrow("Expected string");
});

test("JSON remains the storage default and binary frame views respect their offsets", () => {
  const value = { message: "snow \u96ea \ud83c\udfb5", empty: null };
  expect(encodeStorageValue(value)).toBe(JSON.stringify(value));
  const bytes = encodeStorageValue(value, { encoding: "protobuf" });
  if (typeof bytes === "string") throw new Error("Expected binary storage");
  const padded = new Uint8Array(bytes.length + 8); padded.set(bytes, 4);
  expect(readValueFrame(new DataView(padded.buffer, 4, bytes.length))).toEqual(value);
  expect(readValueFrame(JSON.stringify(value))).toEqual(value);
  expect(() => readValueFrame({ value })).toThrow("frame");
  expect(() => encodeValue("\ud800")).toThrow("Unicode");
  expect(() => encodeValue({ "\udfff": true })).toThrow("Unicode");
  expect(Object.is(decodeValue(encodeValue(-0)), 0)).toBe(true);
});
