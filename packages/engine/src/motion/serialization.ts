import { isRecord } from "@hyperfocus/utilities/records";
import {
  MOTION_GRAPH_SCHEMA_VERSION,
  motionPassOrder,
  type MotionBlendMode,
  type MotionConnectionJson,
  type MotionEndpoint,
  type MotionGraphJson,
  type MotionMaskSpec,
  type MotionNodeJson,
  type MotionNodeKind,
} from "./graph-types.ts";

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}



function isStringArray(values: unknown[]): values is string[] {
  return values.every((entry) => typeof entry === "string");
}

function canonicalizeValue(value: unknown, propertyName?: string): unknown {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonicalizeValue(entry));
    if ((propertyName === "tags" || propertyName === "components") && isStringArray(values)) {
      values.sort(compareCodeUnits);
    }
    return values;
  }
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const entry = value[key];
    if (entry !== undefined) result[key] = canonicalizeValue(entry, key);
  }
  return result;
}

const motionPasses = new Set<string>(motionPassOrder);
const motionNodeKinds = new Set<string>(["reference-pose", "signal", "blend", "layer", "delay", "inertialize", "notify", "custom"]);
const motionPortTypes = new Set<string>(["pose", "pose-delta", "number", "boolean", "vec3", "quat", "token", "constraint"]);
const motionPoseComponents = new Set<string>(["rotation", "translation", "scale"]);
const motionBlendModes = new Set<string>(["override", "additive", "constraint"]);

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isMotionEndpoint(value: unknown): value is MotionEndpoint {
  return isRecord(value) && typeof value.node === "string" && typeof value.port === "string";
}

function isMotionMask(value: unknown): value is MotionMaskSpec {
  if (value === "*") return true;
  if (!isRecord(value) || !Array.isArray(value.tags) || !value.tags.every((entry) => typeof entry === "string")) return false;
  return value.components === undefined
    || (Array.isArray(value.components) && value.components.every((entry) => typeof entry === "string" && motionPoseComponents.has(entry)));
}

function hasMotionNodeBase(value: Record<string, unknown>): boolean {
  return typeof value.id === "string"
    && isOptionalString(value.label)
    && (value.pass === undefined || (typeof value.pass === "string" && motionPasses.has(value.pass)));
}

function isMotionNotifyEvent(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.phase === "number"
    && Number.isFinite(value.phase);
}

function isMotionNode(value: unknown): value is MotionNodeJson {
  if (!isRecord(value) || !hasMotionNodeBase(value) || typeof value.kind !== "string" || !motionNodeKinds.has(value.kind)) return false;
  switch (value.kind) {
    case "reference-pose":
      return true;
    case "signal":
      return typeof value.signal === "string";
    case "blend":
      return value.mask === undefined || isMotionMask(value.mask);
    case "layer":
      return isMotionMask(value.mask);
    case "delay":
      return typeof value.valueType === "string" && motionPortTypes.has(value.valueType);
    case "inertialize":
      return isOptionalFiniteNumber(value.halfLifeSeconds) && (value.mask === undefined || isMotionMask(value.mask));
    case "notify":
      return Array.isArray(value.events)
        && value.events.every(isMotionNotifyEvent)
        && isOptionalFiniteNumber(value.maxEventsPerFrame);
    case "custom":
      return typeof value.implementation === "string"
        && (value.parameters === undefined || isRecord(value.parameters))
        && (value.reads === undefined || isMotionMask(value.reads))
        && isMotionMask(value.writes);
    default:
      return false;
  }
}

function isMotionConnection(value: unknown): value is MotionConnectionJson {
  return isRecord(value)
    && typeof value.id === "string"
    && isMotionEndpoint(value.from)
    && isMotionEndpoint(value.to)
    && (value.blendMode === undefined || (typeof value.blendMode === "string" && motionBlendModes.has(value.blendMode)));
}

function isMotionGraph(value: unknown): value is MotionGraphJson {
  if (!isRecord(value)
    || value.schemaVersion !== MOTION_GRAPH_SCHEMA_VERSION
    || typeof value.id !== "string"
    || !Array.isArray(value.nodes)
    || !value.nodes.every(isMotionNode)
    || !Array.isArray(value.connections)
    || !value.connections.every(isMotionConnection)
    || !isMotionEndpoint(value.output)) return false;
  return value.settings === undefined || (isRecord(value.settings)
    && isOptionalFiniteNumber(value.settings.defaultInertialHalfLifeSeconds)
    && isOptionalFiniteNumber(value.settings.notifyCapacity));
}

export function canonicalizeMotionGraph(graph: MotionGraphJson): MotionGraphJson {
  const nodes = [...graph.nodes].sort((a, b) => compareCodeUnits(a.id, b.id)).map((node) => (
    node.kind === "notify"
      ? { ...node, events: [...node.events].sort((a, b) => a.phase - b.phase || compareCodeUnits(a.id, b.id)) }
      : node
  ));
  const canonical = canonicalizeValue({
    ...graph,
    connections: [...graph.connections].sort((a, b) => compareCodeUnits(a.id, b.id)),
    nodes,
  });
  if (!isMotionGraph(canonical)) throw new TypeError("canonical motion graph failed structural validation");
  return canonical;
}

export function serializeMotionGraph(graph: MotionGraphJson, indentation = 2) {
  return `${JSON.stringify(canonicalizeMotionGraph(graph), null, indentation)}\n`;
}

export function hashMotionGraph(graph: MotionGraphJson) {
  const source = serializeMotionGraph(graph, 0);
  return `fnv1a32:${fnv1a32(source)}`;
}

/** Creates a stable graph node key from authoring identity rather than array order. */
export function createMotionNodeId(kind: MotionNodeKind, authoringKey: string) {
  const key = requireAuthoringKey(authoringKey, "motion node authoringKey");
  return `node:${kind}:${fnv1a32(`${kind}\u0000${key}`)}`;
}

/** Creates a stable connection key from its endpoints and composition rule. */
export function createMotionConnectionId(
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
  blendMode?: MotionBlendMode,
) {
  const identity = [
    requireAuthoringKey(fromNode, "motion connection fromNode"),
    requireAuthoringKey(fromPort, "motion connection fromPort"),
    requireAuthoringKey(toNode, "motion connection toNode"),
    requireAuthoringKey(toPort, "motion connection toPort"),
    blendMode ?? "data",
  ].join("\u0000");
  return `connection:${fnv1a32(identity)}`;
}

function fnv1a32(source: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function requireAuthoringKey(value: string, label: string) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}
