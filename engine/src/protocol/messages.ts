export const PROTOCOL_VERSION = 1;

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
};

const BINARY_HEADER_BYTES = 6;
const BINARY_MESSAGE_INPUT = 16;
const BINARY_INPUT_PAYLOAD_VIEW_ENV = "ENGINE_PROTOCOL_BINARY_INPUT_VIEW";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonWireSafe(value: unknown, allowUndefined = false, ancestors = new WeakSet<object>()): boolean {
  if (value === undefined) return allowUndefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
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
        if (!descriptor?.enumerable || !("value" in descriptor) || !isJsonWireSafe(descriptor.value, false, ancestors)) return false;
      }
      return true;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || !isJsonWireSafe(descriptor.value, false, ancestors)) return false;
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
  if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffffffff)) {
    throw new Error(`protocol message seq must be an integer between 0 and 4294967295: ${String(value)}`);
  }
}

function validateProtocolMessage(value: unknown): asserts value is ProtocolMessage {
  if (!isRecord(value)) throw new Error("protocol message must be an object");
  if (value.v !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version: ${String(value.v)}`);
  if (typeof value.type !== "string" || !protocolMessageTypes.includes(value.type as ProtocolMessageType)) {
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
  const message: unknown = JSON.parse(value);
  validateProtocolMessage(message);
  return message;
}

export function encodeProtocolMessage(message: ProtocolMessage) {
  validateProtocolMessage(message);
  return JSON.stringify(message);
}

function bytesFromBinaryMessage(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function binaryInputPayloadViewEnabled() {
  return typeof process !== "undefined" && process.env[BINARY_INPUT_PAYLOAD_VIEW_ENV] === "1";
}

export function encodeBinaryInputMessage<TInput>(input: TInput, codec: BinaryPayloadCodec<TInput>, options: { seq?: number } = {}): Uint8Array {
  const payload = codec.encode(input);
  if (!(payload instanceof Uint8Array)) throw new Error("binary input codec must return Uint8Array");
  assertOptionalSequence(options.seq);
  const frame = new Uint8Array(BINARY_HEADER_BYTES + payload.byteLength);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = BINARY_MESSAGE_INPUT;
  view.setUint32(2, options.seq ?? 0, true);
  frame.set(payload, BINARY_HEADER_BYTES);
  return frame;
}

export function parseBinaryProtocolMessage<TInput>(value: ArrayBuffer | Uint8Array, inputCodec?: BinaryPayloadCodec<TInput>): ProtocolMessage<TInput> {
  const bytes = bytesFromBinaryMessage(value);
  if (bytes.byteLength < BINARY_HEADER_BYTES) throw new Error("binary protocol message too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version: ${version}`);
  const type = view.getUint8(1);
  if (type !== BINARY_MESSAGE_INPUT) throw new Error(`unsupported binary protocol message type: ${type}`);
  if (!inputCodec) throw new Error("binary input codec required");
  const payload = binaryInputPayloadViewEnabled() ? bytes.subarray(BINARY_HEADER_BYTES) : bytes.slice(BINARY_HEADER_BYTES);
  return createProtocolMessage("input", inputCodec.decode(payload), { seq: view.getUint32(2, true) });
}
