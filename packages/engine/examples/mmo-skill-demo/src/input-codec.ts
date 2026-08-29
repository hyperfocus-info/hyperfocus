import type { BinaryPayloadCodec } from "@hyperfocus/engine/protocol";
import { type MmoSkillDemoAction, type MmoSkillDemoInput } from "./shared-contracts.ts";

const textEncoder = new TextEncoder();

const actionByteEntries: readonly (readonly [MmoSkillDemoAction, number])[] = [
  ["idle", 0], ["lmb", 1], ["rmb", 2], ["space", 3], ["q", 4], ["e", 5], ["r", 6], ["attack", 7], ["mine", 8],
  ["woodcut", 9], ["interact", 10], ["travel", 11], ["bank", 12], ["trade", 13], ["use-item", 14], ["config", 15], ["dev", 16]
];

const actionToByte = new Map<MmoSkillDemoAction, number>(actionByteEntries);

const byteToAction = new Map<number, MmoSkillDemoAction>(actionByteEntries.map(([action, value]) => [value, action]));

const HAS_TARGET = 1 << 0;
const HAS_ITEM = 1 << 1;
const HAS_DEV_FIELD = 1 << 2;
const HAS_DEV_TEXT = 1 << 3;
const HAS_DEV_VALUE = 1 << 4;
const FIXED_BYTES = 12;

function axisByte(value: unknown) {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return Math.round(number * 127);
}

function axisValue(value: number) {
  return Math.max(-1, Math.min(1, value / 127));
}

function finiteOrNaN(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function encodeShortString(value: string | undefined) {
  const bytes = textEncoder.encode(value ?? "");
  if (bytes.byteLength > 255) throw new Error("input string exceeds 255 bytes");
  return bytes;
}

function writeShortString(frame: Uint8Array, offset: number, bytes: Uint8Array) {
  frame[offset] = bytes.byteLength;
  frame.set(bytes, offset + 1);
  return offset + 1 + bytes.byteLength;
}

function readShortString(bytes: Uint8Array, offset: number, end: number) {
  if (offset >= end) throw new Error("mmo input string length is missing");
  const length = bytes[offset];
  const start = offset + 1;
  const next = start + length;
  if (next > end) throw new Error("mmo input string exceeds the frame");
  return { value: decodeUtf8Range(bytes, start, length), offset: next };
}

function decodeUtf8Range(bytes: Uint8Array, start: number, length: number) {
  const end = start + length;
  let output = "";
  for (let offset = start; offset < end;) {
    const first = bytes[offset++];
    if (first < 0x80) {
      output += String.fromCharCode(first);
      continue;
    }
    const continuationCount = first < 0xe0 ? 1 : first < 0xf0 ? 2 : first < 0xf8 ? 3 : -1;
    if (continuationCount < 1 || offset + continuationCount > end) throw new Error("mmo input string is not valid UTF-8");
    let codePoint = first & (continuationCount === 1 ? 0x1f : continuationCount === 2 ? 0x0f : 0x07);
    for (let index = 0; index < continuationCount; index += 1) {
      const next = bytes[offset++];
      if ((next & 0xc0) !== 0x80) throw new Error("mmo input string is not valid UTF-8");
      codePoint = codePoint * 64 + (next & 0x3f);
    }
    const minimum = continuationCount === 1 ? 0x80 : continuationCount === 2 ? 0x800 : 0x10000;
    if (codePoint < minimum || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error("mmo input string is not valid UTF-8");
    }
    output += String.fromCodePoint(codePoint);
  }
  return output;
}

function decodeInputRange(bytes: Uint8Array, byteOffset: number, byteLength: number) {
  if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength)
    || byteOffset < 0 || byteLength < FIXED_BYTES || byteOffset + byteLength > bytes.byteLength) {
    throw new Error("mmo input frame range is invalid or too short");
  }
  const end = byteOffset + byteLength;
  const view = new DataView(bytes.buffer, bytes.byteOffset + byteOffset, byteLength);
  const flags = view.getUint8(1);
  let offset = byteOffset + FIXED_BYTES;
  const input: MmoSkillDemoInput = {
    action: byteToAction.get(view.getUint8(0)) ?? "idle",
    dx: axisValue(view.getInt8(2)),
    dy: axisValue(view.getInt8(3)),
    aimX: view.getFloat32(4, true),
    aimY: view.getFloat32(8, true)
  };
  if (flags & HAS_DEV_VALUE) {
    if (offset + 4 > end) throw new Error("mmo input dev value exceeds the frame");
    input.devValue = view.getFloat32(offset - byteOffset, true);
    offset += 4;
  }
  if (flags & HAS_TARGET) {
    const read = readShortString(bytes, offset, end);
    input.targetId = read.value;
    offset = read.offset;
  }
  if (flags & HAS_ITEM) {
    const read = readShortString(bytes, offset, end);
    input.itemId = read.value;
    offset = read.offset;
  }
  if (flags & HAS_DEV_FIELD) {
    const read = readShortString(bytes, offset, end);
    input.devField = read.value;
    offset = read.offset;
  }
  if (flags & HAS_DEV_TEXT) {
    const read = readShortString(bytes, offset, end);
    input.devText = read.value;
    offset = read.offset;
  }
  if (offset !== end) throw new Error("mmo input frame contains trailing bytes");
  return input;
}

export const mmoSkillDemoInputCodec: BinaryPayloadCodec<MmoSkillDemoInput> = {
  encode(input) {
    const target = encodeShortString(input.targetId);
    const item = encodeShortString(input.itemId);
    const devField = encodeShortString(input.devField);
    const devText = encodeShortString(input.devText);
    let flags = 0;
    if (target.byteLength > 0) flags |= HAS_TARGET;
    if (item.byteLength > 0) flags |= HAS_ITEM;
    if (devField.byteLength > 0) flags |= HAS_DEV_FIELD;
    if (devText.byteLength > 0) flags |= HAS_DEV_TEXT;
    if (typeof input.devValue === "number" && Number.isFinite(input.devValue)) flags |= HAS_DEV_VALUE;

    const variableBytes =
      (flags & HAS_TARGET ? 1 + target.byteLength : 0) +
      (flags & HAS_ITEM ? 1 + item.byteLength : 0) +
      (flags & HAS_DEV_FIELD ? 1 + devField.byteLength : 0) +
      (flags & HAS_DEV_TEXT ? 1 + devText.byteLength : 0) +
      (flags & HAS_DEV_VALUE ? 4 : 0);
    const frame = new Uint8Array(FIXED_BYTES + variableBytes);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    frame[0] = actionToByte.get(input.action ?? "idle") ?? 0;
    frame[1] = flags;
    view.setInt8(2, axisByte(input.dx));
    view.setInt8(3, axisByte(input.dy));
    view.setFloat32(4, finiteOrNaN(input.aimX), true);
    view.setFloat32(8, finiteOrNaN(input.aimY), true);
    let offset = FIXED_BYTES;
    if (flags & HAS_DEV_VALUE) {
      view.setFloat32(offset, input.devValue ?? 0, true);
      offset += 4;
    }
    if (flags & HAS_TARGET) offset = writeShortString(frame, offset, target);
    if (flags & HAS_ITEM) offset = writeShortString(frame, offset, item);
    if (flags & HAS_DEV_FIELD) offset = writeShortString(frame, offset, devField);
    if (flags & HAS_DEV_TEXT) offset = writeShortString(frame, offset, devText);
    return frame;
  },
  decode(bytes) {
    return decodeInputRange(bytes, 0, bytes.byteLength);
  },
  decodeRange: decodeInputRange
};
