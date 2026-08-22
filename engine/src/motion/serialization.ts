import type { MotionBlendMode, MotionGraphJson, MotionNodeKind } from "./graph-types.ts";

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalizeValue(value: unknown, propertyName?: string): unknown {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonicalizeValue(entry));
    if ((propertyName === "tags" || propertyName === "components") && values.every((entry) => typeof entry === "string")) {
      values.sort((a, b) => compareCodeUnits(a as string, b as string));
    }
    return values;
  }
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort(compareCodeUnits)) {
    const entry = source[key];
    if (entry !== undefined) result[key] = canonicalizeValue(entry, key);
  }
  return result;
}

export function canonicalizeMotionGraph(graph: MotionGraphJson): MotionGraphJson {
  const nodes = [...graph.nodes].sort((a, b) => compareCodeUnits(a.id, b.id)).map((node) => (
    node.kind === "notify"
      ? { ...node, events: [...node.events].sort((a, b) => a.phase - b.phase || compareCodeUnits(a.id, b.id)) }
      : node
  ));
  return canonicalizeValue({
    ...graph,
    connections: [...graph.connections].sort((a, b) => compareCodeUnits(a.id, b.id)),
    nodes,
  }) as MotionGraphJson;
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
