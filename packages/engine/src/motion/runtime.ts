import { clamp01Or as clamp01 } from "@hyperfocus/utilities/math";
import type { CompiledMotionGraph, CompiledMotionInput, CompiledMotionNode, CompiledMotionPortLocation } from "./compiler.ts";
import {
  createDevelopmentPoseView,
  createReadonlyDevelopmentPoseView,
  validateCustomPoseWrites,
  type MotionCustomNodeContext,
} from "./custom-node.ts";
import type { MotionNotify, MotionNotifyEventJson, MotionPortType } from "./graph-types.ts";
import { createPoseInertializer, type PoseInertializer } from "./inertialization.ts";
import { invertQuaternion, multiplyQuaternions, slerpQuaternions } from "./math.ts";
import { poseMaskHasJoint } from "./masks.ts";
import {
  copyPoseBuffer,
  createPoseBuffer,
  createPoseBufferLayout,
  validatePoseBuffer,
  type PoseBuffer,
} from "./pose-buffer.ts";
import { createMotionSignalBuffer, type MotionSignalBuffer, type MotionSignalValue } from "./signals.ts";

export type MotionGraphRuntimeOptions = {
  referencePose?: PoseBuffer;
  development?: boolean;
  /** Optional ArrayBuffer, SharedArrayBuffer, or WebAssembly.Memory.buffer backing every graph pose register. */
  memory?: ArrayBufferLike;
  byteOffset?: number;
};

export type MotionGraphRuntime = {
  readonly compiled: CompiledMotionGraph;
  readonly signals: MotionSignalBuffer;
  readonly pose: PoseBuffer;
  readonly frame: number;
  readonly notifyCount: number;
  readonly droppedNotifyCount: number;
  evaluate(deltaSeconds: number): PoseBuffer;
  getNotify(index: number): Readonly<MotionNotify> | undefined;
  reset(): void;
};

export function createMotionCustomNodeValidationError(nodeId: string, message: string) {
  const error = new Error(`custom motion node ${nodeId}: ${message}`);
  error.name = "MotionCustomNodeValidationError";
  return Object.assign(error, { nodeId });
}

export type MotionCustomNodeValidationError = ReturnType<typeof createMotionCustomNodeValidationError>;

type RuntimeValue = MotionSignalValue | undefined;

type DelayState = {
  node: CompiledMotionNode;
  pose?: PoseBuffer;
  value?: RuntimeValue;
};

type InertialState = {
  inertializer: PoseInertializer;
  initializedTrigger: boolean;
  trigger: string | null;
};

type NotifyState = {
  initialized: boolean;
  previousUnwrapped: number;
  timeline: string | null;
  events: readonly MotionNotifyEventJson[];
};

type CustomState = {
  context: MotionCustomNodeContext & {
    deltaSeconds: number;
    frame: number;
    inputPose: PoseBuffer | undefined;
    outputPose: PoseBuffer | undefined;
  };
  state: Float32Array;
  developmentOutput?: PoseBuffer;
  developmentInput?: PoseBuffer;
  input?: CompiledMotionInput;
  output?: CompiledMotionPortLocation & { kind: "pose" };
};

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}



function firstPoseLocation(locations: Readonly<Record<string, CompiledMotionPortLocation>>) {
  for (const location of Object.values(locations)) if (location.kind === "pose") return location;
  return undefined;
}

function firstPoseInput(node: CompiledMotionNode) {
  for (const input of Object.values(node.inputs)) if (input?.location.kind === "pose") return input;
  return undefined;
}

function defaultValue(type: MotionPortType): RuntimeValue {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "token") return null;
  if (type === "vec3") return new Float32Array(3);
  if (type === "quat") return new Float32Array([0, 0, 0, 1]);
  return undefined;
}

function inputValue(input: CompiledMotionInput | undefined, poseRegisters: readonly PoseBuffer[], values: readonly RuntimeValue[]) {
  if (!input) return undefined;
  return input.location.kind === "pose" ? poseRegisters[input.location.index] : values[input.location.index];
}

function requirePoseInput(input: CompiledMotionInput | undefined, poseRegisters: readonly PoseBuffer[], label: string): PoseBuffer {
  if (!input || input.location.kind !== "pose") throw new Error(`${label} must reference a pose register`);
  return poseRegisters[input.location.index];
}

function optionalPoseInput(input: CompiledMotionInput | undefined, poseRegisters: readonly PoseBuffer[], label: string): PoseBuffer | undefined {
  return input ? requirePoseInput(input, poseRegisters, label) : undefined;
}

function valueInput(input: CompiledMotionInput | undefined, values: readonly RuntimeValue[], label: string): RuntimeValue {
  if (!input || input.location.kind !== "value") throw new Error(`${label} must reference a value register`);
  return values[input.location.index];
}

function requireNumberInput(input: CompiledMotionInput | undefined, values: readonly RuntimeValue[], label: string): number {
  const value = valueInput(input, values, label);
  if (typeof value !== "number") throw new TypeError(`${label} must be a number`);
  return value;
}

function optionalNumberInput(input: CompiledMotionInput | undefined, values: readonly RuntimeValue[], label: string): number | undefined {
  if (!input) return undefined;
  return requireNumberInput(input, values, label);
}

function optionalTokenInput(input: CompiledMotionInput | undefined, values: readonly RuntimeValue[], label: string): string | null | undefined {
  if (!input) return undefined;
  const value = valueInput(input, values, label);
  if (value !== null && typeof value !== "string") throw new TypeError(`${label} must be a token`);
  return value;
}

function requireNodeMask(node: CompiledMotionNode) {
  if (!node.mask) throw new Error(`motion node ${node.id} is missing its compiled pose mask`);
  return node.mask;
}

function createReferencePose(compiled: CompiledMotionGraph, supplied?: PoseBuffer) {
  const rig = compiled.rig;
  const layout = createPoseBufferLayout(rig.deformCount, rig.totalCount, { includeScales: true });
  const pose = createPoseBuffer(layout);
  if (supplied) {
    copyPoseBuffer(supplied, pose);
    return pose;
  }
  pose.rotations.set(rig.referenceRotations);
  pose.translations.set(rig.referenceTranslations);
  pose.scales?.set(rig.referenceScales);
  return pose;
}

function blendPose(a: PoseBuffer, b: PoseBuffer, weight: number, output: PoseBuffer, node: CompiledMotionNode, scratch: Float32Array[]) {
  copyPoseBuffer(a, output);
  const mask = requireNodeMask(node);
  const t = clamp01(weight);
  for (let jointIndex = 0; jointIndex < output.totalCount; jointIndex += 1) {
    const rotationOffset = jointIndex * 4;
    if (poseMaskHasJoint(mask, "rotation", jointIndex)) {
      for (let component = 0; component < 4; component += 1) {
        scratch[0][component] = a.rotations[rotationOffset + component];
        scratch[1][component] = b.rotations[rotationOffset + component];
      }
      slerpQuaternions(scratch[0], scratch[1], t, scratch[2]);
      output.rotations.set(scratch[2], rotationOffset);
    }
    const translationOffset = jointIndex * 3;
    if (poseMaskHasJoint(mask, "translation", jointIndex)) {
      for (let axis = 0; axis < 3; axis += 1) {
        const index = translationOffset + axis;
        output.translations[index] = a.translations[index] + (b.translations[index] - a.translations[index]) * t;
      }
    }
    if (output.scales && a.scales && b.scales && poseMaskHasJoint(mask, "scale", jointIndex)) {
      for (let axis = 0; axis < 3; axis += 1) {
        const index = translationOffset + axis;
        output.scales[index] = a.scales[index] + (b.scales[index] - a.scales[index]) * t;
      }
    }
  }
}

function layerPose(
  base: PoseBuffer,
  layer: PoseBuffer,
  reference: PoseBuffer | undefined,
  weight: number,
  mode: CompiledMotionInput["blendMode"],
  output: PoseBuffer,
  node: CompiledMotionNode,
  scratch: Float32Array[],
) {
  copyPoseBuffer(base, output);
  const mask = requireNodeMask(node);
  const t = clamp01(weight);
  for (let jointIndex = 0; jointIndex < output.totalCount; jointIndex += 1) {
    const rotationOffset = jointIndex * 4;
    if (poseMaskHasJoint(mask, "rotation", jointIndex)) {
      for (let component = 0; component < 4; component += 1) {
        scratch[0][component] = base.rotations[rotationOffset + component];
        scratch[1][component] = layer.rotations[rotationOffset + component];
      }
      if (mode === "additive") {
        if (!reference) throw new Error(`additive layer ${node.id} has no reference pose`);
        for (let component = 0; component < 4; component += 1) scratch[3][component] = reference.rotations[rotationOffset + component];
        invertQuaternion(scratch[3], scratch[4]);
        multiplyQuaternions(scratch[1], scratch[4], scratch[5]);
        scratch[3][0] = 0;
        scratch[3][1] = 0;
        scratch[3][2] = 0;
        scratch[3][3] = 1;
        slerpQuaternions(scratch[3], scratch[5], t, scratch[2]);
        multiplyQuaternions(scratch[2], scratch[0], scratch[5]);
        output.rotations.set(scratch[5], rotationOffset);
      } else {
        slerpQuaternions(scratch[0], scratch[1], t, scratch[2]);
        output.rotations.set(scratch[2], rotationOffset);
      }
    }
    const translationOffset = jointIndex * 3;
    if (poseMaskHasJoint(mask, "translation", jointIndex)) {
      for (let axis = 0; axis < 3; axis += 1) {
        const index = translationOffset + axis;
        output.translations[index] = mode === "additive"
          ? base.translations[index] + (layer.translations[index] - (reference?.translations[index] ?? 0)) * t
          : base.translations[index] + (layer.translations[index] - base.translations[index]) * t;
      }
    }
    if (output.scales && base.scales && layer.scales && poseMaskHasJoint(mask, "scale", jointIndex)) {
      for (let axis = 0; axis < 3; axis += 1) {
        const index = translationOffset + axis;
        output.scales[index] = mode === "additive"
          ? base.scales[index] + (layer.scales[index] - (reference?.scales?.[index] ?? 1)) * t
          : base.scales[index] + (layer.scales[index] - base.scales[index]) * t;
      }
    }
  }
}

export function createMotionGraphRuntime(compiled: CompiledMotionGraph, options: MotionGraphRuntimeOptions = {}): MotionGraphRuntime {
  const storage = createMotionRuntimeStorage(compiled, options);
  const { referencePose, layout, poseRegisters, values, stateArena, signals, development, debugBefore, scratch } = storage;
  const notifyQueue: MotionNotify[] = [];
  for (let index = 0; index < compiled.notifyCapacity; index += 1) {
    notifyQueue.push({ frame: 0, id: "", name: "", nodeId: "", phase: 0, cycle: 0 });
  }
  let frame = 0;
  let notifyCount = 0;
  let droppedNotifyCount = 0;

  function pushNotify(nodeId: string, notify: Omit<MotionNotify, "frame" | "nodeId">) {
    if (notifyCount >= notifyQueue.length) {
      droppedNotifyCount += 1;
      return;
    }
    const target = notifyQueue[notifyCount++];
    target.frame = frame;
    target.nodeId = nodeId;
    target.id = notify.id;
    target.name = notify.name;
    target.phase = notify.phase;
    target.cycle = notify.cycle;
    target.payload = notify.payload;
  }

  const nodeStates = createMotionRuntimeNodeStates({
    compiled,
    layout,
    referencePose,
    stateArena,
    signals,
    poseRegisters,
    values,
    development,
    pushNotify,
  });
  const { delayStates, inertialStates, notifyStates, customStates } = nodeStates;
  const emitTimelineNotifies = createTimelineNotifyEmitter(notifyStates, pushNotify);

  function evaluateNode(node: CompiledMotionNode, deltaSeconds: number) {
    switch (node.json.kind) {
      case "reference-pose": {
        const output = node.outputs.pose;
        if (output.kind === "pose") copyPoseBuffer(referencePose, poseRegisters[output.index]);
        return;
      }
      case "signal": {
        const output = node.outputs.value;
        if (output.kind === "value") values[output.index] = signals.get(node.json.signal);
        return;
      }
      case "blend": {
        const a = requirePoseInput(node.inputs.a, poseRegisters, `${node.id}.a`);
        const b = requirePoseInput(node.inputs.b, poseRegisters, `${node.id}.b`);
        const weight = requireNumberInput(node.inputs.weight, values, `${node.id}.weight`);
        const output = node.outputs.pose;
        if (output.kind === "pose") blendPose(a, b, weight, poseRegisters[output.index], node, scratch);
        return;
      }
      case "layer": {
        const base = requirePoseInput(node.inputs.base, poseRegisters, `${node.id}.base`);
        const layer = requirePoseInput(node.inputs.layer, poseRegisters, `${node.id}.layer`);
        const reference = optionalPoseInput(node.inputs.reference, poseRegisters, `${node.id}.reference`);
        const weight = optionalNumberInput(node.inputs.weight, values, `${node.id}.weight`) ?? 1;
        const output = node.outputs.pose;
        if (output.kind === "pose") {
          layerPose(base, layer, reference, weight, node.inputs.layer?.blendMode, poseRegisters[output.index], node, scratch);
        }
        return;
      }
      case "delay": {
        const state = requireRuntimeState(delayStates, node.id, "delay");
        const output = node.outputs.output;
        if (output.kind === "pose") copyPoseBuffer(requireDelayPose(state), poseRegisters[output.index]);
        else values[output.index] = state.value;
        return;
      }
      case "inertialize": {
        const source = requirePoseInput(node.inputs.pose, poseRegisters, `${node.id}.pose`);
        const trigger = optionalTokenInput(node.inputs.trigger, values, `${node.id}.trigger`) ?? null;
        const state = requireRuntimeState(inertialStates, node.id, "inertialize");
        const transition = state.initializedTrigger && state.trigger !== trigger;
        state.initializedTrigger = true;
        state.trigger = trigger;
        const output = node.outputs.pose;
        if (output.kind === "pose") state.inertializer.update(source, deltaSeconds, poseRegisters[output.index], transition);
        return;
      }
      case "notify": {
        const phase = requireNumberInput(node.inputs.phase, values, `${node.id}.phase`);
        const cycle = optionalNumberInput(node.inputs.cycle, values, `${node.id}.cycle`);
        const timeline = optionalTokenInput(node.inputs.timeline, values, `${node.id}.timeline`) ?? null;
        emitTimelineNotifies(node, cycle === undefined ? phase : cycle + phase, timeline);
        return;
      }
      case "custom": {
        const custom = requireRuntimeState(customStates, node.id, "custom");
        const input = custom.input;
        const output = custom.output;
        const inputPose = input ? poseRegisters[input.location.index] : undefined;
        const outputPose = output ? poseRegisters[output.index] : undefined;
        if (outputPose) copyPoseBuffer(inputPose ?? referencePose, outputPose);
        if (development && outputPose && debugBefore) copyPoseBuffer(outputPose, debugBefore);
        custom.context.deltaSeconds = deltaSeconds;
        custom.context.frame = frame;
        custom.context.inputPose = custom.developmentInput ?? inputPose;
        custom.context.outputPose = custom.developmentOutput ?? outputPose;
        const definition = node.customDefinition;
        if (!definition) throw new Error(`custom motion node ${node.id} is missing its definition`);
        definition.evaluate(custom.context, node.json);
        if (development && outputPose && debugBefore && node.writes) {
          const issues = validateCustomPoseWrites(debugBefore, outputPose, node.writes);
          const first = issues[0];
          if (first) throw createMotionCustomNodeValidationError(node.id, `${first.reason} at ${first.component} joint ${first.jointIndex}`);
          const poseIssue = validatePoseBuffer(outputPose)[0];
          if (poseIssue) throw createMotionCustomNodeValidationError(node.id, poseIssue.message);
        }
        return;
      }
    }
  }

  function commitDelays() {
    for (const node of compiled.delayedNodes) {
      const state = requireRuntimeState(delayStates, node.id, "delay");
      if (state.pose) copyPoseBuffer(requirePoseInput(node.inputs.input, poseRegisters, `${node.id}.input`), state.pose);
      else state.value = valueInput(node.inputs.input, values, `${node.id}.input`);
    }
  }

  const runtime: MotionGraphRuntime = {
    compiled,
    signals,
    get pose() {
      return poseRegisters[compiled.output.index];
    },
    get frame() {
      return frame;
    },
    get notifyCount() {
      return notifyCount;
    },
    get droppedNotifyCount() {
      return droppedNotifyCount;
    },
    evaluate(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError("motion deltaSeconds must be non-negative and finite");
      notifyCount = 0;
      droppedNotifyCount = 0;
      frame += 1;
      for (const node of compiled.schedule) evaluateNode(node, deltaSeconds);
      commitDelays();
      return poseRegisters[compiled.output.index];
    },
    getNotify(index) {
      return index >= 0 && index < notifyCount ? notifyQueue[index] : undefined;
    },
    reset() {
      frame = 0;
      notifyCount = 0;
      droppedNotifyCount = 0;
      stateArena.fill(0);
      for (const pose of poseRegisters) copyPoseBuffer(referencePose, pose);
      for (const state of delayStates.values()) {
        if (state.pose) copyPoseBuffer(referencePose, state.pose);
        else state.value = defaultValue(state.node.json.kind === "delay" ? state.node.json.valueType : "number");
      }
      for (const state of inertialStates.values()) {
        state.inertializer.reset();
        state.initializedTrigger = false;
        state.trigger = null;
      }
      for (const state of notifyStates.values()) {
        state.initialized = false;
        state.previousUnwrapped = 0;
        state.timeline = null;
      }
    },
  };
  runtime.reset();
  return runtime;
}

function createMotionRuntimeStorage(compiled: CompiledMotionGraph, options: MotionGraphRuntimeOptions) {
  const referencePose = createReferencePose(compiled, options.referencePose);
  const layout = createPoseBufferLayout(compiled.rig.deformCount, compiled.rig.totalCount, {
    includeScales: Boolean(referencePose.scales),
  });
  const arenaByteOffset = options.byteOffset ?? 0;
  const arenaByteLength = layout.byteLength * Math.max(1, compiled.poseRegisterCount);
  const arena = options.memory ?? new ArrayBuffer(arenaByteOffset + arenaByteLength);
  const poseRegisters: PoseBuffer[] = [];
  for (let index = 0; index < compiled.poseRegisterCount; index += 1) {
    const pose = createPoseBuffer(layout, {
      buffer: arena,
      byteOffset: arenaByteOffset + index * layout.byteLength,
      initialize: false,
    });
    copyPoseBuffer(referencePose, pose);
    poseRegisters.push(pose);
  }
  const development = options.development ?? compiled.development;
  return {
    referencePose,
    layout,
    poseRegisters,
    values: new Array<RuntimeValue>(compiled.valueSlotCount),
    stateArena: new Float32Array(compiled.stateFloatCount),
    signals: createMotionSignalBuffer(compiled.signalLayout),
    development,
    debugBefore: development ? createPoseBuffer(layout) : undefined,
    scratch: [
      new Float32Array(4), new Float32Array(4), new Float32Array(4),
      new Float32Array(4), new Float32Array(4), new Float32Array(4),
    ],
  };
}

function createMotionRuntimeNodeStates(input: {
  compiled: CompiledMotionGraph;
  layout: ReturnType<typeof createPoseBufferLayout>;
  referencePose: PoseBuffer;
  stateArena: Float32Array;
  signals: MotionSignalBuffer;
  poseRegisters: PoseBuffer[];
  values: RuntimeValue[];
  development: boolean;
  pushNotify(nodeId: string, notify: Omit<MotionNotify, "frame" | "nodeId">): void;
}) {
  const delayStates = new Map<string, DelayState>();
  const inertialStates = new Map<string, InertialState>();
  const notifyStates = new Map<string, NotifyState>();
  const customStates = new Map<string, CustomState>();
  for (const node of input.compiled.schedule) {
    if (node.json.kind === "delay") {
      const state: DelayState = { node };
      if (node.json.valueType === "pose" || node.json.valueType === "pose-delta") {
        state.pose = createPoseBuffer(input.layout);
        copyPoseBuffer(input.referencePose, state.pose);
      } else {
        state.value = defaultValue(node.json.valueType);
      }
      delayStates.set(node.id, state);
    } else if (node.json.kind === "inertialize") {
      if (!node.mask) throw new Error(`inertialize node ${node.id} is missing its compiled pose mask`);
      inertialStates.set(node.id, {
        inertializer: createPoseInertializer(
          input.referencePose,
          node.mask,
          node.json.halfLifeSeconds ?? input.compiled.defaultInertialHalfLifeSeconds,
        ),
        initializedTrigger: false,
        trigger: null,
      });
    } else if (node.json.kind === "notify") {
      notifyStates.set(node.id, {
        initialized: false,
        previousUnwrapped: 0,
        timeline: null,
        events: [...node.json.events].sort((a, b) => a.phase - b.phase || compareCodeUnits(a.id, b.id)),
      });
    } else if (node.json.kind === "custom") {
      const state = input.stateArena.subarray(node.stateOffset, node.stateOffset + node.stateFloatCount);
      const mutableContext: CustomState["context"] = {
        deltaSeconds: 0,
        frame: 0,
        inputPose: undefined,
        outputPose: undefined,
        signals: input.signals,
        state,
        getInput(name) {
          return inputValue(node.inputs[name], input.poseRegisters, input.values);
        },
        setOutput(name, value) {
          const location = node.outputs[name];
          if (!location) throw new Error(`custom node ${node.id} has no output ${name}`);
          if (location.kind === "pose") {
            if (!isPoseBufferValue(value)) throw new TypeError(`custom node ${node.id} output ${name} must be a PoseBuffer`);
            copyPoseBuffer(value, input.poseRegisters[location.index]);
          } else {
            if (!isMotionSignalValue(value)) throw new TypeError(`custom node ${node.id} output ${name} must be a motion signal value`);
            input.values[location.index] = value;
          }
        },
        emitNotify(notify) {
          input.pushNotify(node.id, notify);
        },
      };
      const output = firstPoseLocation(node.outputs);
      const custom: CustomState = {
        context: mutableContext,
        state,
        developmentOutput: input.development && output
          ? createDevelopmentPoseView(input.poseRegisters[output.index])
          : undefined,
        input: firstPoseInput(node),
        output,
      };
      if (input.development && custom.input) {
        custom.developmentInput = createReadonlyDevelopmentPoseView(input.poseRegisters[custom.input.location.index]);
      }
      customStates.set(node.id, custom);
    }
  }
  return { delayStates, inertialStates, notifyStates, customStates };
}

function createTimelineNotifyEmitter(
  notifyStates: ReadonlyMap<string, NotifyState>,
  pushNotify: (nodeId: string, notify: Omit<MotionNotify, "frame" | "nodeId">) => void,
) {
  return (node: CompiledMotionNode, current: number, timeline: string | null) => {
    const state = requireRuntimeState(notifyStates, node.id, "notify");
    if (!state.initialized || state.timeline !== timeline || !Number.isFinite(current)) {
      state.initialized = Number.isFinite(current);
      state.previousUnwrapped = Number.isFinite(current) ? current : 0;
      state.timeline = timeline;
      return;
    }
    const previous = state.previousUnwrapped;
    state.previousUnwrapped = current;
    if (current === previous) return;
    const limit = node.json.kind === "notify" ? (node.json.maxEventsPerFrame ?? 16) : 16;
    let emitted = 0;
    if (current > previous) {
      const firstCycle = Math.floor(previous);
      const lastCycle = Math.floor(current);
      outerForward: for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
        for (const event of state.events) {
          const crossing = cycle + event.phase;
          if (crossing > previous && crossing <= current) {
            pushNotify(node.id, { id: event.id, name: event.name, phase: event.phase, cycle, payload: event.payload });
            emitted += 1;
            if (emitted >= limit) break outerForward;
          }
        }
      }
    } else {
      const firstCycle = Math.floor(previous);
      const lastCycle = Math.floor(current);
      outerReverse: for (let cycle = firstCycle; cycle >= lastCycle; cycle -= 1) {
        for (let eventIndex = state.events.length - 1; eventIndex >= 0; eventIndex -= 1) {
          const event = state.events[eventIndex];
          const crossing = cycle + event.phase;
          if (crossing < previous && crossing >= current) {
            pushNotify(node.id, { id: event.id, name: event.name, phase: event.phase, cycle, payload: event.payload });
            emitted += 1;
            if (emitted >= limit) break outerReverse;
          }
        }
      }
    }
  };
}

function isPoseBufferValue(value: MotionSignalValue | PoseBuffer): value is PoseBuffer {
  return typeof value === "object"
    && value !== null
    && "rotations" in value
    && "translations" in value
    && value.rotations instanceof Float32Array
    && value.translations instanceof Float32Array;
}

function isMotionSignalValue(value: MotionSignalValue | PoseBuffer): value is MotionSignalValue {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  return typeof value === "object"
    && "length" in value
    && typeof value.length === "number";
}

function requireRuntimeState<T>(states: ReadonlyMap<string, T>, nodeId: string, kind: string): T {
  const state = states.get(nodeId);
  if (!state) throw new Error(`${kind} node ${nodeId} is missing runtime state`);
  return state;
}

function requireDelayPose(state: DelayState): PoseBuffer {
  if (!state.pose) throw new Error(`delay node ${state.node.id} is missing its pose state`);
  return state.pose;
}
