import type {
  MotionConnectionJson,
  MotionGraphDiagnostic,
  MotionGraphJson,
  MotionNodeJson,
  MotionNodePortSchema,
  MotionPass,
  MotionPortDefinition,
  MotionPortType,
} from "./graph-types.ts";
import { MOTION_GRAPH_SCHEMA_VERSION, motionPassOrder } from "./graph-types.ts";
import {
  clonePoseMask,
  compileMotionMask,
  createEmptyPoseMask,
  poseMasksOverlap,
  unionPoseMasks,
  type CompiledPoseMask,
} from "./masks.ts";
import type { MotionCustomNodeDefinition, MotionCustomNodeRegistry } from "./custom-node.ts";
import type { CompiledSemanticRig } from "./rig.ts";
import {
  compileMotionSignalLayout,
  standardMotionSignalSchema,
  type MotionSignalLayout,
  type MotionSignalSchema,
} from "./signals.ts";
import { hashMotionGraph } from "./serialization.ts";

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const emptyPorts = Object.freeze({}) as Readonly<Record<string, MotionPortDefinition>>;
const posePort = Object.freeze({ type: "pose" }) satisfies MotionPortDefinition;
const numberPort = Object.freeze({ type: "number" }) satisfies MotionPortDefinition;
const optionalNumberPort = Object.freeze({ type: "number", optional: true }) satisfies MotionPortDefinition;
const optionalTokenPort = Object.freeze({ type: "token", optional: true }) satisfies MotionPortDefinition;

export type CompiledMotionPortLocation =
  | { kind: "pose"; index: number; type: "pose" | "pose-delta" }
  | { kind: "value"; index: number; type: Exclude<MotionPortType, "pose" | "pose-delta"> };

export type CompiledMotionInput = {
  connectionId: string;
  location: CompiledMotionPortLocation;
  blendMode?: MotionConnectionJson["blendMode"];
};

export type CompiledMotionNode = {
  readonly id: string;
  readonly json: MotionNodeJson;
  readonly kind: MotionNodeJson["kind"];
  readonly pass: MotionPass;
  readonly passIndex: number;
  readonly scheduleIndex: number;
  readonly ports: MotionNodePortSchema;
  readonly inputs: Readonly<Record<string, CompiledMotionInput | undefined>>;
  readonly outputs: Readonly<Record<string, CompiledMotionPortLocation>>;
  readonly mask?: CompiledPoseMask;
  readonly reads?: CompiledPoseMask;
  readonly writes?: CompiledPoseMask;
  readonly customDefinition?: MotionCustomNodeDefinition;
  readonly stateOffset: number;
  readonly stateFloatCount: number;
};

export type CompiledMotionGraph = {
  readonly graphId: string;
  readonly contentHash: string;
  readonly rig: CompiledSemanticRig;
  readonly signalLayout: MotionSignalLayout;
  readonly schedule: readonly CompiledMotionNode[];
  readonly poseRegisterCount: number;
  readonly valueSlotCount: number;
  readonly stateFloatCount: number;
  readonly output: CompiledMotionPortLocation & { kind: "pose" };
  readonly delayedNodes: readonly CompiledMotionNode[];
  readonly diagnostics: readonly MotionGraphDiagnostic[];
  readonly notifyCapacity: number;
  readonly defaultInertialHalfLifeSeconds: number;
  readonly development: boolean;
};

export type CompileMotionGraphOptions = {
  rig: CompiledSemanticRig;
  signals?: MotionSignalSchema;
  customNodes?: MotionCustomNodeRegistry;
  development?: boolean;
};

export class MotionGraphCompileError extends Error {
  readonly diagnostics: readonly MotionGraphDiagnostic[];

  constructor(diagnostics: readonly MotionGraphDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "MotionGraphCompileError";
    this.diagnostics = diagnostics;
  }
}

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPoseType(type: MotionPortType): type is "pose" | "pose-delta" {
  return type === "pose" || type === "pose-delta";
}

function defaultPass(node: MotionNodeJson): MotionPass {
  if (node.kind === "signal") return "inputs";
  if (node.kind === "reference-pose") return "reference";
  if (node.kind === "custom") return node.pass ?? "state-layer";
  return node.pass ?? "state-layer";
}

function schemaForNode(
  node: MotionNodeJson,
  signalLayout: MotionSignalLayout,
  customNodes: MotionCustomNodeRegistry | undefined,
): { ports?: MotionNodePortSchema; customDefinition?: MotionCustomNodeDefinition; error?: string } {
  switch (node.kind) {
    case "reference-pose":
      return { ports: { inputs: emptyPorts, outputs: { pose: posePort } } };
    case "signal": {
      const signal = signalLayout.slots.get(node.signal);
      return signal
        ? { ports: { inputs: emptyPorts, outputs: { value: { type: signal.type } } } }
        : { error: `node ${node.id} references unknown motion signal ${node.signal}` };
    }
    case "blend":
      return {
        ports: {
          inputs: { a: posePort, b: posePort, weight: numberPort },
          outputs: { pose: posePort },
        },
      };
    case "layer":
      return {
        ports: {
          inputs: { base: posePort, layer: posePort, reference: { ...posePort, optional: true }, weight: optionalNumberPort },
          outputs: { pose: posePort },
        },
      };
    case "delay":
      return {
        ports: {
          inputs: { input: { type: node.valueType } },
          outputs: { output: { type: node.valueType } },
        },
      };
    case "inertialize":
      return {
        ports: {
          inputs: { pose: posePort, trigger: optionalTokenPort },
          outputs: { pose: posePort },
        },
      };
    case "notify":
      return {
        ports: {
          inputs: { phase: numberPort, cycle: optionalNumberPort, timeline: optionalTokenPort },
          outputs: emptyPorts,
        },
      };
    case "custom": {
      const definition = customNodes?.get(node.implementation);
      return definition
        ? { ports: definition.ports, customDefinition: definition }
        : { error: `node ${node.id} references unregistered custom implementation ${node.implementation}` };
    }
  }
}

function addError(diagnostics: MotionGraphDiagnostic[], code: string, message: string, details: Partial<MotionGraphDiagnostic> = {}) {
  diagnostics.push({ code, message, severity: "error", ...details });
}

function addWarning(diagnostics: MotionGraphDiagnostic[], code: string, message: string, details: Partial<MotionGraphDiagnostic> = {}) {
  diagnostics.push({ code, message, severity: "warning", ...details });
}

function throwIfErrors(diagnostics: readonly MotionGraphDiagnostic[]) {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new MotionGraphCompileError(diagnostics);
}

function validateNodeConfig(node: MotionNodeJson, diagnostics: MotionGraphDiagnostic[]) {
  if (node.kind === "custom" && node.pass === undefined) {
    addError(diagnostics, "custom-pass-required", `custom node ${node.id} must declare its evaluation pass`, { nodeId: node.id });
  }
  if (node.kind === "reference-pose" && node.pass !== undefined && node.pass !== "reference") {
    addError(diagnostics, "fixed-pass", `reference pose node ${node.id} must run in the reference pass`, { nodeId: node.id });
  }
  if (node.kind === "signal" && node.pass !== undefined && node.pass !== "inputs") {
    addError(diagnostics, "fixed-pass", `signal node ${node.id} must run in the inputs pass`, { nodeId: node.id });
  }
  if (node.kind === "inertialize" && node.halfLifeSeconds !== undefined
    && (!Number.isFinite(node.halfLifeSeconds) || node.halfLifeSeconds <= 0)) {
    addError(diagnostics, "invalid-half-life", `inertialize node ${node.id} halfLifeSeconds must be positive`, { nodeId: node.id });
  }
  if (node.kind === "notify") {
    const ids = new Set<string>();
    for (const event of node.events) {
      if (!stableIdPattern.test(event.id)) addError(diagnostics, "invalid-notify-id", `notify event id is invalid: ${event.id}`, { nodeId: node.id });
      if (ids.has(event.id)) addError(diagnostics, "duplicate-notify-id", `notify node ${node.id} repeats event id ${event.id}`, { nodeId: node.id });
      ids.add(event.id);
      if (!Number.isFinite(event.phase) || event.phase < 0 || event.phase >= 1) {
        addError(diagnostics, "invalid-notify-phase", `notify event ${event.id} phase must be in [0, 1)`, { nodeId: node.id });
      }
    }
    if (node.maxEventsPerFrame !== undefined
      && (!Number.isSafeInteger(node.maxEventsPerFrame) || node.maxEventsPerFrame <= 0)) {
      addError(diagnostics, "invalid-notify-limit", `notify node ${node.id} maxEventsPerFrame must be a positive integer`, { nodeId: node.id });
    }
  }
}

function findCycle(nodeIds: readonly string[], adjacency: ReadonlyMap<string, readonly string[]>) {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const positions = new Map<string, number>();
  let found: string[] | undefined;

  function visit(nodeId: string) {
    state.set(nodeId, 1);
    positions.set(nodeId, stack.length);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (state.get(next) === 1) {
        const start = positions.get(next) ?? 0;
        found = [...stack.slice(start), next];
        return true;
      }
      if ((state.get(next) ?? 0) === 0 && visit(next)) return true;
    }
    stack.pop();
    positions.delete(nodeId);
    state.set(nodeId, 2);
    return false;
  }

  for (const nodeId of nodeIds) {
    if ((state.get(nodeId) ?? 0) === 0 && visit(nodeId)) break;
  }
  return found;
}

function mergeSchemas(custom: MotionSignalSchema | undefined, diagnostics: MotionGraphDiagnostic[]): MotionSignalSchema {
  if (!custom) return standardMotionSignalSchema;
  const merged: Record<string, MotionSignalSchema[string]> = { ...standardMotionSignalSchema };
  for (const [name, definition] of Object.entries(custom)) {
    const standard = standardMotionSignalSchema[name as keyof typeof standardMotionSignalSchema];
    if (standard) {
      if (standard.type !== definition.type || JSON.stringify(standard.default) !== JSON.stringify(definition.default)) {
        addError(diagnostics, "standard-signal-override", `standard motion signal ${name} cannot be redefined`);
      }
      continue;
    }
    merged[name] = definition;
  }
  return merged;
}

function locationKey(nodeId: string, port: string) {
  return `${nodeId}\u0000${port}`;
}

export function compileMotionGraph(graph: MotionGraphJson, options: CompileMotionGraphOptions): CompiledMotionGraph {
  const diagnostics: MotionGraphDiagnostic[] = [];
  if (graph.schemaVersion !== MOTION_GRAPH_SCHEMA_VERSION) {
    addError(diagnostics, "schema-version", `motion graph schemaVersion must be ${MOTION_GRAPH_SCHEMA_VERSION}`);
  }
  if (!stableIdPattern.test(graph.id)) addError(diagnostics, "invalid-graph-id", `motion graph id is invalid: ${graph.id}`);
  if (graph.settings?.notifyCapacity !== undefined
    && (!Number.isSafeInteger(graph.settings.notifyCapacity) || graph.settings.notifyCapacity <= 0)) {
    addError(diagnostics, "invalid-notify-capacity", "motion graph notifyCapacity must be a positive safe integer");
  }
  if (graph.settings?.defaultInertialHalfLifeSeconds !== undefined
    && (!Number.isFinite(graph.settings.defaultInertialHalfLifeSeconds) || graph.settings.defaultInertialHalfLifeSeconds <= 0)) {
    addError(diagnostics, "invalid-half-life", "motion graph default inertial half-life must be positive");
  }

  const signalLayout = compileMotionSignalLayout(mergeSchemas(options.signals, diagnostics));
  const nodes = new Map<string, MotionNodeJson>();
  const schemas = new Map<string, MotionNodePortSchema>();
  const customDefinitions = new Map<string, MotionCustomNodeDefinition>();
  const passes = new Map<string, MotionPass>();
  for (const node of graph.nodes) {
    if (!stableIdPattern.test(node.id)) addError(diagnostics, "invalid-node-id", `motion node id is invalid: ${node.id}`, { nodeId: node.id });
    if (nodes.has(node.id)) addError(diagnostics, "duplicate-node-id", `motion node id is duplicated: ${node.id}`, { nodeId: node.id });
    nodes.set(node.id, node);
    validateNodeConfig(node, diagnostics);
    const resolved = schemaForNode(node, signalLayout, options.customNodes);
    if (resolved.error) addError(diagnostics, "node-schema", resolved.error, { nodeId: node.id });
    if (resolved.ports) schemas.set(node.id, resolved.ports);
    if (resolved.customDefinition) customDefinitions.set(node.id, resolved.customDefinition);
    const pass = defaultPass(node);
    if (!motionPassOrder.includes(pass)) addError(diagnostics, "invalid-pass", `node ${node.id} has invalid pass ${pass}`, { nodeId: node.id });
    passes.set(node.id, pass);
    if (resolved.customDefinition?.writePolicy === "resolve"
      && pass !== "constraints" && pass !== "physical" && pass !== "final-limits") {
      addError(diagnostics, "resolver-pass", `resolver custom node ${node.id} must run in constraints, physical, or final-limits`, { nodeId: node.id });
    }
  }

  const connections = new Map<string, MotionConnectionJson>();
  const incoming = new Map<string, MotionConnectionJson[]>();
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const nodeId of nodes.keys()) {
    adjacency.set(nodeId, []);
    indegree.set(nodeId, 0);
  }

  for (const connection of graph.connections) {
    if (!stableIdPattern.test(connection.id)) addError(diagnostics, "invalid-connection-id", `motion connection id is invalid: ${connection.id}`, { connectionId: connection.id });
    if (connections.has(connection.id)) addError(diagnostics, "duplicate-connection-id", `motion connection id is duplicated: ${connection.id}`, { connectionId: connection.id });
    connections.set(connection.id, connection);
    const sourceNode = nodes.get(connection.from.node);
    const targetNode = nodes.get(connection.to.node);
    const sourcePort = schemas.get(connection.from.node)?.outputs[connection.from.port];
    const targetPort = schemas.get(connection.to.node)?.inputs[connection.to.port];
    if (!sourceNode) addError(diagnostics, "missing-source-node", `connection ${connection.id} source node does not exist`, { connectionId: connection.id });
    if (!targetNode) addError(diagnostics, "missing-target-node", `connection ${connection.id} target node does not exist`, { connectionId: connection.id });
    if (sourceNode && !sourcePort) addError(diagnostics, "missing-source-port", `connection ${connection.id} source port does not exist`, { connectionId: connection.id });
    if (targetNode && !targetPort) addError(diagnostics, "missing-target-port", `connection ${connection.id} target port does not exist`, { connectionId: connection.id });
    if (!sourceNode || !targetNode || !sourcePort || !targetPort) continue;

    const poseConnection = isPoseType(sourcePort.type) || isPoseType(targetPort.type) || sourcePort.type === "constraint" || targetPort.type === "constraint";
    const additiveLayer = targetNode.kind === "layer" && connection.to.port === "layer" && connection.blendMode === "additive";
    const compatible = sourcePort.type === targetPort.type || (additiveLayer && sourcePort.type === "pose" && targetPort.type === "pose");
    if (!compatible) {
      addError(diagnostics, "port-type-mismatch", `connection ${connection.id} cannot connect ${sourcePort.type} to ${targetPort.type}`, { connectionId: connection.id });
    }
    if (poseConnection && connection.blendMode === undefined) {
      addError(diagnostics, "blend-mode-required", `pose connection ${connection.id} must declare blendMode`, { connectionId: connection.id });
    }
    if (!poseConnection && connection.blendMode !== undefined) {
      addError(diagnostics, "blend-mode-forbidden", `data connection ${connection.id} cannot declare blendMode`, { connectionId: connection.id });
    }
    if (connection.blendMode === "constraint" && (sourcePort.type !== "constraint" || targetPort.type !== "constraint")) {
      addError(diagnostics, "constraint-type", `connection ${connection.id} uses constraint mode without constraint ports`, { connectionId: connection.id });
    }
    if (connection.blendMode === "additive" && !(targetNode.kind === "layer" && connection.to.port === "layer")) {
      addError(diagnostics, "additive-target", `connection ${connection.id} additive mode is only valid on a layer input`, { connectionId: connection.id });
    }
    if (targetNode.kind === "blend" && isPoseType(targetPort.type) && connection.blendMode !== "override") {
      addError(diagnostics, "blend-input-mode", `blend node ${targetNode.id} pose inputs must use override mode`, { connectionId: connection.id });
    }
    if (targetNode.kind === "layer" && connection.to.port !== "layer" && isPoseType(targetPort.type) && connection.blendMode !== "override") {
      addError(diagnostics, "layer-input-mode", `layer node ${targetNode.id} ${connection.to.port} input must use override mode`, { connectionId: connection.id });
    }

    const inputKey = locationKey(connection.to.node, connection.to.port);
    const inputConnections = incoming.get(inputKey) ?? [];
    inputConnections.push(connection);
    incoming.set(inputKey, inputConnections);
    if (!targetPort.multiple && inputConnections.length > 1) {
      addError(diagnostics, "multiple-input-writers", `node ${targetNode.id} input ${connection.to.port} has multiple connections`, { nodeId: targetNode.id });
    }

    const deferred = targetNode.kind === "delay" && connection.to.port === "input";
    if (!deferred) {
      adjacency.get(sourceNode.id)!.push(targetNode.id);
      indegree.set(targetNode.id, (indegree.get(targetNode.id) ?? 0) + 1);
      const sourcePass = motionPassOrder.indexOf(passes.get(sourceNode.id)!);
      const targetPass = motionPassOrder.indexOf(passes.get(targetNode.id)!);
      if (sourcePass > targetPass) {
        addError(diagnostics, "backward-pass-edge", `connection ${connection.id} moves backward from ${passes.get(sourceNode.id)} to ${passes.get(targetNode.id)}`, { connectionId: connection.id });
      }
    }
  }

  for (const values of adjacency.values()) values.sort(compareCodeUnits);
  for (const node of graph.nodes) {
    const schema = schemas.get(node.id);
    if (!schema) continue;
    for (const [portName, port] of Object.entries(schema.inputs)) {
      if (!port.optional && !(incoming.get(locationKey(node.id, portName))?.length)) {
        addError(diagnostics, "missing-required-input", `node ${node.id} input ${portName} is required`, { nodeId: node.id });
      }
    }
    if (node.kind === "layer") {
      const layerConnection = incoming.get(locationKey(node.id, "layer"))?.[0];
      if (layerConnection?.blendMode === "additive" && !incoming.get(locationKey(node.id, "reference"))?.length) {
        addError(diagnostics, "additive-reference-required", `additive layer node ${node.id} requires an explicit reference pose`, { nodeId: node.id });
      }
    }
  }

  const outputNode = nodes.get(graph.output.node);
  const outputPort = schemas.get(graph.output.node)?.outputs[graph.output.port];
  if (!outputNode || !outputPort) addError(diagnostics, "invalid-output", "motion graph output endpoint does not exist");
  else if (outputPort.type !== "pose") addError(diagnostics, "invalid-output-type", "motion graph output must be a pose port");

  const sortedIds = [...nodes.keys()].sort(compareCodeUnits);
  const cycle = findCycle(sortedIds, adjacency);
  if (cycle) addError(diagnostics, "graph-cycle", `motion graph contains a same-frame cycle: ${cycle.join(" -> ")}`, { cycle });
  throwIfErrors(diagnostics);

  const available = sortedIds.filter((id) => indegree.get(id) === 0);
  const scheduleIds: string[] = [];
  function compareScheduledIds(a: string, b: string) {
    const passDelta = motionPassOrder.indexOf(passes.get(a)!) - motionPassOrder.indexOf(passes.get(b)!);
    return passDelta || compareCodeUnits(a, b);
  }
  available.sort(compareScheduledIds);
  while (available.length > 0) {
    const nodeId = available.shift()!;
    scheduleIds.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        available.push(target);
        available.sort(compareScheduledIds);
      }
    }
  }

  let poseRegisterCount = 0;
  let valueSlotCount = 0;
  let stateFloatCount = 0;
  const locations = new Map<string, CompiledMotionPortLocation>();
  for (const nodeId of scheduleIds) {
    for (const [portName, port] of Object.entries(schemas.get(nodeId)!.outputs)) {
      const location: CompiledMotionPortLocation = isPoseType(port.type)
        ? { kind: "pose", index: poseRegisterCount++, type: port.type }
        : { kind: "value", index: valueSlotCount++, type: port.type };
      locations.set(locationKey(nodeId, portName), location);
    }
  }

  const compiledNodes: CompiledMotionNode[] = [];
  for (const [scheduleIndex, nodeId] of scheduleIds.entries()) {
    const node = nodes.get(nodeId)!;
    const ports = schemas.get(nodeId)!;
    const inputs: Record<string, CompiledMotionInput | undefined> = {};
    const outputs: Record<string, CompiledMotionPortLocation> = {};
    for (const portName of Object.keys(ports.inputs)) {
      const connection = incoming.get(locationKey(nodeId, portName))?.[0];
      if (connection) {
        inputs[portName] = {
          connectionId: connection.id,
          location: locations.get(locationKey(connection.from.node, connection.from.port))!,
          blendMode: connection.blendMode,
        };
      }
    }
    for (const portName of Object.keys(ports.outputs)) outputs[portName] = locations.get(locationKey(nodeId, portName))!;

    let mask: CompiledPoseMask | undefined;
    let reads: CompiledPoseMask | undefined;
    let writes: CompiledPoseMask | undefined;
    const maskSpec = node.kind === "blend" || node.kind === "layer" || node.kind === "inertialize" ? node.mask : undefined;
    if (maskSpec !== undefined || node.kind === "blend" || node.kind === "inertialize") {
      const result = compileMotionMask(options.rig, maskSpec);
      mask = result.mask;
      for (const tag of result.missingTags) addWarning(diagnostics, "missing-mask-tag", `node ${node.id} mask tag is not present in the rig: ${tag}`, { nodeId: node.id });
    }
    if (node.kind === "layer") {
      const result = compileMotionMask(options.rig, node.mask);
      mask = result.mask;
      for (const tag of result.missingTags) addWarning(diagnostics, "missing-mask-tag", `node ${node.id} mask tag is not present in the rig: ${tag}`, { nodeId: node.id });
    }
    const definition = customDefinitions.get(nodeId);
    if (node.kind === "custom") {
      const readResult = compileMotionMask(options.rig, node.reads);
      const writeResult = compileMotionMask(options.rig, node.writes);
      reads = readResult.mask;
      writes = writeResult.mask;
      for (const tag of [...readResult.missingTags, ...writeResult.missingTags]) {
        addWarning(diagnostics, "missing-mask-tag", `node ${node.id} mask tag is not present in the rig: ${tag}`, { nodeId: node.id });
      }
    }
    const nodeStateFloatCount = Math.max(0, definition?.stateFloatCount ?? 0);
    compiledNodes.push({
      id: nodeId,
      json: node,
      kind: node.kind,
      pass: passes.get(nodeId)!,
      passIndex: motionPassOrder.indexOf(passes.get(nodeId)!),
      scheduleIndex,
      ports,
      inputs,
      outputs,
      mask,
      reads,
      writes,
      customDefinition: definition,
      stateOffset: stateFloatCount,
      stateFloatCount: nodeStateFloatCount,
    });
    stateFloatCount += nodeStateFloatCount;
  }

  const provenance = new Map<number, CompiledPoseMask>();
  const fullMask = compileMotionMask(options.rig, "*").mask;
  for (const compiled of compiledNodes) {
    const inputMasks: CompiledPoseMask[] = [];
    for (const input of Object.values(compiled.inputs)) {
      if (input?.location.kind !== "pose") continue;
      inputMasks.push(provenance.get(input.location.index) ?? createEmptyPoseMask(options.rig.totalCount));
    }
    if (compiled.kind !== "blend" && compiled.kind !== "layer") {
      for (let left = 0; left < inputMasks.length; left += 1) {
        for (let right = left + 1; right < inputMasks.length; right += 1) {
          if (poseMasksOverlap(inputMasks[left], inputMasks[right])) {
            addError(diagnostics, "unresolved-writer-conflict", `node ${compiled.id} merges overlapping pose writers without a Blend or Layer node`, { nodeId: compiled.id });
          }
        }
      }
    }
    const result = createEmptyPoseMask(options.rig.totalCount);
    for (const inputMask of inputMasks) unionPoseMasks(result, inputMask);
    if (compiled.json.kind === "delay" && isPoseType(compiled.json.valueType)) unionPoseMasks(result, fullMask);
    if (compiled.kind === "custom" && compiled.writes) {
      const resolveWrite = compiled.customDefinition?.writePolicy === "resolve";
      if (!resolveWrite && poseMasksOverlap(result, compiled.writes)) {
        addError(diagnostics, "unresolved-writer-conflict", `custom node ${compiled.id} writes joints already authored upstream without a Blend or Layer node`, { nodeId: compiled.id });
      }
      unionPoseMasks(result, compiled.writes);
    }
    for (const output of Object.values(compiled.outputs)) {
      if (output.kind === "pose") provenance.set(output.index, clonePoseMask(result));
    }
  }
  throwIfErrors(diagnostics);

  const output = locations.get(locationKey(graph.output.node, graph.output.port));
  if (!output || output.kind !== "pose") throw new Error("compiled motion graph lost its pose output");
  const delayedNodes = compiledNodes.filter((node) => node.kind === "delay");
  return Object.freeze({
    graphId: graph.id,
    contentHash: hashMotionGraph(graph),
    rig: options.rig,
    signalLayout,
    schedule: Object.freeze(compiledNodes),
    poseRegisterCount,
    valueSlotCount,
    stateFloatCount,
    output,
    delayedNodes: Object.freeze(delayedNodes),
    diagnostics: Object.freeze(diagnostics),
    notifyCapacity: graph.settings?.notifyCapacity ?? 32,
    defaultInertialHalfLifeSeconds: graph.settings?.defaultInertialHalfLifeSeconds ?? 0.08,
    development: options.development ?? false,
  });
}
