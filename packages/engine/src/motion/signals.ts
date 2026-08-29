import type { MotionPortType } from "./graph-types.ts";
import type { MotionQuaternion as MotionQuat, MotionVec3 } from "./math.ts";

export type { MotionQuat, MotionVec3 };
export type MotionSignalVectorInput = ArrayLike<number>;
export type MotionSignalValue = number | boolean | string | null | MotionSignalVectorInput;
export type MotionSignalType = Exclude<MotionPortType, "pose" | "pose-delta" | "constraint">;

export type MotionSignalDefinition = {
  type: MotionSignalType;
  default: MotionSignalValue;
};

export type MotionSignalSchema = Readonly<Record<string, MotionSignalDefinition>>;

export const standardMotionSignalSchema = {
  acceleration: { type: "vec3", default: [0, 0, 0] },
  actionId: { type: "token", default: null },
  actionPhase: { type: "number", default: 0 },
  aimTarget: { type: "vec3", default: [0, 0, 0] },
  aimWeight: { type: "number", default: 0 },
  desiredVelocity: { type: "vec3", default: [0, 0, 0] },
  facing: { type: "vec3", default: [0, 0, 1] },
  gaitCycle: { type: "number", default: 0 },
  gaitPhase: { type: "number", default: 0 },
  groundNormal: { type: "vec3", default: [0, 1, 0] },
  isGrounded: { type: "boolean", default: false },
  resolvedRootDelta: { type: "vec3", default: [0, 0, 0] },
  rootPosition: { type: "vec3", default: [0, 0, 0] },
  turnRate: { type: "number", default: 0 },
  velocity: { type: "vec3", default: [0, 0, 0] },
} as const;

export type StandardMotionSignals = {
  acceleration: MotionVec3;
  actionId: string | null;
  actionPhase: number;
  aimTarget: MotionVec3;
  aimWeight: number;
  desiredVelocity: MotionVec3;
  facing: MotionVec3;
  gaitCycle: number;
  gaitPhase: number;
  groundNormal: MotionVec3;
  isGrounded: boolean;
  resolvedRootDelta: MotionVec3;
  rootPosition: MotionVec3;
  turnRate: number;
  velocity: MotionVec3;
};

type SignalSlot = {
  name: string;
  type: MotionSignalType;
  numericOffset: number;
  width: number;
  tokenOffset: number;
};

export type MotionSignalLayout = {
  readonly schema: MotionSignalSchema;
  readonly slots: ReadonlyMap<string, SignalSlot>;
  readonly numericCount: number;
  readonly tokenCount: number;
};

export type MotionSignalBuffer = {
  readonly layout: MotionSignalLayout;
  readonly numeric: Float32Array;
  readonly tokens: Array<string | null>;
  get(name: string): MotionSignalValue;
  set(name: string, value: MotionSignalValue): void;
  setMany(values: Readonly<Record<string, MotionSignalValue>>): void;
  reset(): void;
};

function widthForSignal(type: MotionSignalType) {
  if (type === "vec3") return 3;
  if (type === "quat") return 4;
  if (type === "token") return 0;
  return 1;
}

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compileMotionSignalLayout(schema: MotionSignalSchema = standardMotionSignalSchema): MotionSignalLayout {
  const slots = new Map<string, SignalSlot>();
  let numericCount = 0;
  let tokenCount = 0;
  for (const name of Object.keys(schema).sort(compareCodeUnits)) {
    const definition = schema[name];
    const width = widthForSignal(definition.type);
    slots.set(name, {
      name,
      type: definition.type,
      numericOffset: numericCount,
      width,
      tokenOffset: definition.type === "token" ? tokenCount : -1,
    });
    numericCount += width;
    if (definition.type === "token") tokenCount += 1;
  }
  return { schema, slots, numericCount, tokenCount };
}

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`motion signal ${name} must be finite`);
  return value;
}

function requireNumberSignal(name: string, value: MotionSignalValue) {
  if (typeof value !== "number") throw new TypeError(`motion signal ${name} must be a number`);
  return requireFinite(value, name);
}

function requireBooleanSignal(name: string, value: MotionSignalValue) {
  if (typeof value !== "boolean") throw new TypeError(`motion signal ${name} must be a boolean`);
  return value;
}

function requireTokenSignal(name: string, value: MotionSignalValue) {
  if (value !== null && typeof value !== "string") throw new TypeError(`motion signal ${name} must be a string or null`);
  return value;
}

function requireVectorSignal(name: string, type: "vec3" | "quat", value: MotionSignalValue): MotionSignalVectorInput {
  const width = type === "vec3" ? 3 : 4;
  if (!value || typeof value !== "object" || !("length" in value) || value.length !== width) {
    throw new TypeError(`motion signal ${name} must be a ${type}`);
  }
  for (let index = 0; index < width; index += 1) {
    const component = Reflect.get(value, index);
    if (typeof component !== "number") throw new TypeError(`motion signal ${name}[${index}] must be finite`);
    requireFinite(component, `${name}[${index}]`);
  }
  return value;
}

function requireVectorView(views: ReadonlyMap<string, Float32Array>, name: string) {
  const view = views.get(name);
  if (!view) throw new Error(`motion signal layout is missing vector storage for ${name}`);
  return view;
}

export function createMotionSignalBuffer(layout: MotionSignalLayout): MotionSignalBuffer {
  const numeric = new Float32Array(layout.numericCount);
  const tokens = new Array<string | null>(layout.tokenCount).fill(null);
  const vectorViews = new Map<string, Float32Array>();
  for (const slot of layout.slots.values()) {
    if (slot.width > 1) vectorViews.set(slot.name, numeric.subarray(slot.numericOffset, slot.numericOffset + slot.width));
  }

  function set(name: string, value: MotionSignalValue) {
    const slot = layout.slots.get(name);
    if (!slot) throw new Error(`unknown motion signal: ${name}`);
    if (slot.type === "token") {
      tokens[slot.tokenOffset] = requireTokenSignal(name, value);
    } else if (slot.type === "boolean") {
      numeric[slot.numericOffset] = requireBooleanSignal(name, value) ? 1 : 0;
    } else if (slot.type === "number") {
      numeric[slot.numericOffset] = requireNumberSignal(name, value);
    } else {
      const source = requireVectorSignal(name, slot.type, value);
      const view = requireVectorView(vectorViews, name);
      for (let index = 0; index < slot.width; index += 1) view[index] = source[index];
    }
  }

  function get(name: string): MotionSignalValue {
    const slot = layout.slots.get(name);
    if (!slot) throw new Error(`unknown motion signal: ${name}`);
    if (slot.type === "token") return tokens[slot.tokenOffset];
    if (slot.type === "boolean") return numeric[slot.numericOffset] !== 0;
    if (slot.width === 1) return numeric[slot.numericOffset];
    return requireVectorView(vectorViews, name);
  }

  const buffer: MotionSignalBuffer = {
    layout,
    numeric,
    tokens,
    get,
    set,
    setMany(values) {
      for (const [name, value] of Object.entries(values)) set(name, value);
    },
    reset() {
      numeric.fill(0);
      tokens.fill(null);
      for (const [name, definition] of Object.entries(layout.schema)) set(name, definition.default);
    },
  };
  buffer.reset();
  return buffer;
}
