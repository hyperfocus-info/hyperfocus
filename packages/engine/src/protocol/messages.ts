export const PROTOCOL_VERSION = 1;
export const PROTOCOL_CONTROL_FRAME_MAX_BYTES = 1024 * 1024;
export const PROTOCOL_BINARY_INPUT_MAX_BYTES = 64 * 1024;

export const protocolMessageTypes = [
  "client_hello",
  "server_welcome",
  "join_room",
  "join_accepted",
  "join_rejected",
  "input",
  "event",
  "snapshot",
  "delta",
  "ping",
  "pong",
  "disconnect",
  "error"
] as const;

export type ProtocolMessageType = (typeof protocolMessageTypes)[number];

export type ProtocolMessage<TPayload = unknown> = {
  v: number;
  type: ProtocolMessageType;
  seq?: number;
  roomId?: string;
  playerId?: string;
  payload?: TPayload;
};

export type BinaryPayloadCodec<TPayload = unknown> = {
  encode(payload: TPayload): Uint8Array;
  decode(bytes: Uint8Array): TPayload;
  /** Synchronously decodes a range of `bytes`; enables the borrowed parser path without a subarray allocation. */
  decodeRange?(bytes: Uint8Array, byteOffset: number, byteLength: number): TPayload;
};

export type BinaryInputPayloadOwnership = "copy" | "borrow";

export type BinaryProtocolParseOptions = {
  /** Borrow avoids a payload copy. The codec must decode synchronously and must not retain the view. */
  payloadOwnership?: BinaryInputPayloadOwnership;
};

export type BinaryProtocolParser<TInput> = {
  readonly payloadOwnership: BinaryInputPayloadOwnership;
  readonly payloadViewObjectsPerParse: 0 | 1;
  parse(value: ArrayBuffer | Uint8Array): ProtocolMessage<TInput>;
};

const BINARY_HEADER_BYTES = 6;
const BINARY_MESSAGE_INPUT = 16;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 100_000;
const MAX_JSON_TEXT_UNITS = PROTOCOL_CONTROL_FRAME_MAX_BYTES;
const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonWireSafe(
  value: unknown,
  allowUndefined = false,
  ancestors = new WeakSet<object>(),
  depth = 0,
  budget = { nodes: 0, textUnits: 0 }
): boolean {
  budget.nodes += 1;
  if (depth > MAX_JSON_DEPTH || budget.nodes > MAX_JSON_NODES) return false;
  if (value === undefined) return allowUndefined;
  if (typeof value === "string") {
    budget.textUnits += value.length;
    return budget.textUnits <= MAX_JSON_TEXT_UNITS;
  }
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor) || !isJsonWireSafe(descriptor.value, false, ancestors, depth + 1, budget)) return false;
      }
      return true;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      budget.textUnits += key.length;
      if (budget.textUnits > MAX_JSON_TEXT_UNITS) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || !isJsonWireSafe(descriptor.value, false, ancestors, depth + 1, budget)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function assertOptionalId(message: Record<string, unknown>, field: "roomId" | "playerId") {
  const value = message[field];
  if (value !== undefined && (typeof value !== "string" || value.length === 0 || value.length > 1024)) {
    throw new Error(`protocol message ${field} must be a non-empty string of at most 1024 characters`);
  }
}

function assertOptionalSequence(value: unknown) {
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
    throw new Error(`protocol message seq must be an integer between 0 and 4294967295: ${String(value)}`);
  }
}

function isProtocolMessageType(value: unknown): value is ProtocolMessageType {
  return typeof value === "string" && protocolMessageTypes.some((type) => type === value);
}

function validateProtocolMessage(value: unknown): asserts value is ProtocolMessage {
  if (!isRecord(value)) throw new Error("protocol message must be an object");
  if (value.v !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version: ${String(value.v)}`);
  if (!isProtocolMessageType(value.type)) {
    throw new Error(`unsupported protocol message type: ${String(value.type)}`);
  }
  assertOptionalSequence(value.seq);
  assertOptionalId(value, "roomId");
  assertOptionalId(value, "playerId");
  if (!isJsonWireSafe(value.payload, true)) throw new Error("protocol message payload must be JSON wire-safe");
}

export function createProtocolMessage<TPayload>(
  type: ProtocolMessageType,
  payload?: TPayload,
  options: Omit<ProtocolMessage<TPayload>, "v" | "type" | "payload"> = {}
): ProtocolMessage<TPayload> {
  const message = {
    v: PROTOCOL_VERSION,
    type,
    payload,
    ...options
  };
  validateProtocolMessage(message);
  return message;
}

export function parseProtocolMessage(value: string | ArrayBuffer | Uint8Array): ProtocolMessage {
  if (typeof value !== "string") throw new Error("binary protocol messages must be handled by replication decoder");
  if (value.length > PROTOCOL_CONTROL_FRAME_MAX_BYTES || textEncoder.encode(value).byteLength > PROTOCOL_CONTROL_FRAME_MAX_BYTES) {
    throw new Error(`protocol control frame exceeds ${PROTOCOL_CONTROL_FRAME_MAX_BYTES} bytes`);
  }
  const message: unknown = JSON.parse(value);
  validateProtocolMessage(message);
  return message;
}

export function encodeProtocolMessage(message: ProtocolMessage) {
  validateProtocolMessage(message);
  const encoded = JSON.stringify(message);
  if (textEncoder.encode(encoded).byteLength > PROTOCOL_CONTROL_FRAME_MAX_BYTES) {
    throw new Error(`protocol control frame exceeds ${PROTOCOL_CONTROL_FRAME_MAX_BYTES} bytes`);
  }
  return encoded;
}

function bytesFromBinaryMessage(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export function encodeBinaryInputMessage<TInput>(input: TInput, codec: BinaryPayloadCodec<TInput>, options: { seq?: number } = {}): Uint8Array<ArrayBuffer> {
  const payload = codec.encode(input);
  if (!(payload instanceof Uint8Array)) throw new Error("binary input codec must return Uint8Array");
  if (payload.byteLength > PROTOCOL_BINARY_INPUT_MAX_BYTES - BINARY_HEADER_BYTES) {
    throw new Error(`binary input payload exceeds ${PROTOCOL_BINARY_INPUT_MAX_BYTES - BINARY_HEADER_BYTES} bytes`);
  }
  assertOptionalSequence(options.seq);
  const frame = new Uint8Array(BINARY_HEADER_BYTES + payload.byteLength);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = BINARY_MESSAGE_INPUT;
  view.setUint32(2, options.seq ?? 0, true);
  frame.set(payload, BINARY_HEADER_BYTES);
  return frame;
}

export function parseBinaryProtocolMessage<TInput>(
  value: ArrayBuffer | Uint8Array,
  inputCodec?: BinaryPayloadCodec<TInput>,
  options: BinaryProtocolParseOptions = {}
): ProtocolMessage<TInput> {
  if (!inputCodec) throw new Error("binary input codec required");
  const payloadOwnership = resolvePayloadOwnership(options.payloadOwnership);
  return parseBinaryProtocolMessageWithOwnership(value, inputCodec, payloadOwnership);
}

export function createBinaryProtocolParser<TInput>(options: {
  inputCodec: BinaryPayloadCodec<TInput>;
  payloadOwnership?: BinaryInputPayloadOwnership;
}): BinaryProtocolParser<TInput> {
  const payloadOwnership = resolvePayloadOwnership(options.payloadOwnership);
  return {
    payloadOwnership,
    payloadViewObjectsPerParse: payloadOwnership === "borrow" && options.inputCodec.decodeRange ? 0 : 1,
    parse(value) {
      return parseBinaryProtocolMessageWithOwnership(value, options.inputCodec, payloadOwnership);
    }
  };
}

function parseBinaryProtocolMessageWithOwnership<TInput>(
  value: ArrayBuffer | Uint8Array,
  inputCodec: BinaryPayloadCodec<TInput>,
  payloadOwnership: BinaryInputPayloadOwnership
) {
  const bytes = bytesFromBinaryMessage(value);
  if (bytes.byteLength > PROTOCOL_BINARY_INPUT_MAX_BYTES) throw new Error(`binary input frame exceeds ${PROTOCOL_BINARY_INPUT_MAX_BYTES} bytes`);
  if (bytes.byteLength < BINARY_HEADER_BYTES) throw new Error("binary protocol message too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version: ${version}`);
  const type = view.getUint8(1);
  if (type !== BINARY_MESSAGE_INPUT) throw new Error(`unsupported binary protocol message type: ${type}`);
  const payloadLength = bytes.byteLength - BINARY_HEADER_BYTES;
  const decoded = payloadOwnership === "borrow" && inputCodec.decodeRange
    ? inputCodec.decodeRange(bytes, BINARY_HEADER_BYTES, payloadLength)
    : inputCodec.decode(payloadOwnership === "borrow"
      ? bytes.subarray(BINARY_HEADER_BYTES)
      : bytes.slice(BINARY_HEADER_BYTES));
  return createProtocolMessage("input", decoded, { seq: view.getUint32(2, true) });
}

function resolvePayloadOwnership(value: BinaryInputPayloadOwnership | undefined): BinaryInputPayloadOwnership {
  const payloadOwnership = value ?? "copy";
  if (payloadOwnership !== "copy" && payloadOwnership !== "borrow") {
    throw new Error(`binary input payloadOwnership must be copy or borrow: ${String(payloadOwnership)}`);
  }
  return payloadOwnership;
}
