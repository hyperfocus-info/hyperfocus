import type {
  MotionCustomNodeJson,
  MotionNodePortSchema,
  MotionNotify,
  MotionPortType,
} from "./graph-types.ts";
import { poseMaskHasJoint, type CompiledPoseMask } from "./masks.ts";
import type { PoseBuffer } from "./pose-buffer.ts";
import type { MotionSignalBuffer, MotionSignalValue } from "./signals.ts";

export type MotionCustomNodeContext = {
  readonly deltaSeconds: number;
  readonly frame: number;
  readonly inputPose: PoseBuffer | undefined;
  readonly outputPose: PoseBuffer | undefined;
  readonly signals: MotionSignalBuffer;
  readonly state: Float32Array;
  getInput(name: string): MotionSignalValue | PoseBuffer | undefined;
  setOutput(name: string, value: MotionSignalValue | PoseBuffer): void;
  emitNotify(notify: Omit<MotionNotify, "frame" | "nodeId">): void;
};

export type MotionCustomNodeDefinition = {
  implementation: string;
  version?: number;
  ports: MotionNodePortSchema;
  stateFloatCount?: number;
  writePolicy?: "author" | "resolve";
  evaluate(context: MotionCustomNodeContext, node: MotionCustomNodeJson): void;
};

export type MotionCustomNodeRegistry = {
  readonly size: number;
  get(implementation: string): MotionCustomNodeDefinition | undefined;
  register(definition: MotionCustomNodeDefinition): MotionCustomNodeRegistry;
};

export function createMotionCustomNodeRegistry(definitions: readonly MotionCustomNodeDefinition[] = []): MotionCustomNodeRegistry {
  const values = new Map<string, MotionCustomNodeDefinition>();
  const registry: MotionCustomNodeRegistry = {
    get size() {
      return values.size;
    },
    get(implementation) {
      return values.get(implementation);
    },
    register(definition) {
      if (!definition.implementation.trim()) throw new Error("custom motion node implementation must be non-empty");
      if (values.has(definition.implementation)) throw new Error(`custom motion node already registered: ${definition.implementation}`);
      values.set(definition.implementation, definition);
      return registry;
    },
  };
  for (const definition of definitions) registry.register(definition);
  return registry;
}

function numericPropertyIndex(property: string | symbol) {
  if (typeof property !== "string" || !/^(?:0|[1-9]\d*)$/.test(property)) return -1;
  return Number(property);
}

const mutatingTypedArrayMethods = new Set(["copyWithin", "fill", "reverse", "set", "sort"]);

function checkedView(source: Float32Array, label: string, readonly = false): Float32Array {
  return new Proxy(source, {
    get(target, property) {
      if (readonly && typeof property === "string" && mutatingTypedArrayMethods.has(property)) {
        return () => {
          throw new TypeError(`${label} is a read-only custom-node input`);
        };
      }
      if (property === "set") {
        return (values: ArrayLike<number>, offset = 0) => {
          if (!Number.isInteger(offset) || offset < 0 || offset + values.length > target.length) {
            throw new RangeError(`${label} write is outside the PoseBuffer`);
          }
          target.set(values, offset);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      const index = numericPropertyIndex(property);
      if (readonly && index >= 0) throw new TypeError(`${label} is a read-only custom-node input`);
      if (index >= target.length) throw new RangeError(`${label}[${index}] write is outside the PoseBuffer`);
      return Reflect.set(target, property, value, target);
    },
  });
}

export function createDevelopmentPoseView(pose: PoseBuffer): PoseBuffer {
  return {
    ...pose,
    rotations: checkedView(pose.rotations, "rotations"),
    translations: checkedView(pose.translations, "translations"),
    scales: pose.scales ? checkedView(pose.scales, "scales") : undefined,
  };
}

export function createReadonlyDevelopmentPoseView(pose: PoseBuffer): PoseBuffer {
  return {
    ...pose,
    rotations: checkedView(pose.rotations, "rotations", true),
    translations: checkedView(pose.translations, "translations", true),
    scales: pose.scales ? checkedView(pose.scales, "scales", true) : undefined,
  };
}

export type CustomPoseValidationIssue = {
  component: "rotation" | "translation" | "scale";
  jointIndex: number;
  reason: "undeclared-write" | "non-finite";
};

function validateComponentWrites(
  before: Float32Array,
  after: Float32Array,
  width: number,
  component: "rotation" | "translation" | "scale",
  writes: CompiledPoseMask,
  issues: CustomPoseValidationIssue[],
) {
  for (let index = 0; index < after.length; index += 1) {
    const jointIndex = Math.floor(index / width);
    const changed = !Object.is(before[index], after[index]);
    if (changed && !poseMaskHasJoint(writes, component, jointIndex)) {
      issues.push({ component, jointIndex, reason: "undeclared-write" });
    }
    if (changed && !Number.isFinite(after[index])) issues.push({ component, jointIndex, reason: "non-finite" });
  }
}

export function validateCustomPoseWrites(before: PoseBuffer, after: PoseBuffer, writes: CompiledPoseMask) {
  const issues: CustomPoseValidationIssue[] = [];
  validateComponentWrites(before.rotations, after.rotations, 4, "rotation", writes, issues);
  validateComponentWrites(before.translations, after.translations, 3, "translation", writes, issues);
  if (before.scales && after.scales) validateComponentWrites(before.scales, after.scales, 3, "scale", writes, issues);
  return issues;
}

export function portWidth(type: MotionPortType) {
  return type === "vec3" ? 3 : type === "quat" ? 4 : 1;
}
