import type { BinaryPayloadCodec } from "@hyperfocus/engine/protocol";
import type { MmoSkillDemoAction, MmoSkillDemoInput } from "./shared.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const actionToByte: Record<MmoSkillDemoAction, number> = {
  idle: 0,
  lmb: 1,
  rmb: 2,
  space: 3,
  q: 4,
  e: 5,
  r: 6,
  attack: 7,
  mine: 8,
  woodcut: 9,
  interact: 10,
  travel: 11,
  bank: 12,
  trade: 13,
  "use-item": 14,
  config: 15,
  dev: 16
};

const byteToAction = Object.fromEntries(Object.entries(actionToByte).map(([action, value]) => [value, action])) as Record<number, MmoSkillDemoAction>;

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

function readShortString(bytes: Uint8Array, offset: number) {
  const length = bytes[offset];
  const start = offset + 1;
  return { value: textDecoder.decode(bytes.slice(start, start + length)), offset: start + length };
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
    frame[0] = actionToByte[input.action ?? "idle"] ?? 0;
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
    if (bytes.byteLength < FIXED_BYTES) throw new Error("mmo input frame too short");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const flags = view.getUint8(1);
    let offset = FIXED_BYTES;
    const input: MmoSkillDemoInput = {
      action: byteToAction[view.getUint8(0)] ?? "idle",
      dx: axisValue(view.getInt8(2)),
      dy: axisValue(view.getInt8(3)),
      aimX: view.getFloat32(4, true),
      aimY: view.getFloat32(8, true)
    };
    if (flags & HAS_DEV_VALUE) {
      input.devValue = view.getFloat32(offset, true);
      offset += 4;
    }
    if (flags & HAS_TARGET) {
      const read = readShortString(bytes, offset);
      input.targetId = read.value;
      offset = read.offset;
    }
    if (flags & HAS_ITEM) {
      const read = readShortString(bytes, offset);
      input.itemId = read.value;
      offset = read.offset;
    }
    if (flags & HAS_DEV_FIELD) {
      const read = readShortString(bytes, offset);
      input.devField = read.value;
      offset = read.offset;
    }
    if (flags & HAS_DEV_TEXT) {
      const read = readShortString(bytes, offset);
      input.devText = read.value;
    }
    return input;
  }
};
