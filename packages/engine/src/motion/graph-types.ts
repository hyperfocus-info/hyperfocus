export const MOTION_GRAPH_SCHEMA_VERSION = 1 as const;

export const motionPassOrder = [
  "inputs",
  "reference",
  "base-locomotion",
  "state-layer",
  "full-body-action",
  "masked-additive",
  "aim-reach",
  "recoil",
  "constraints",
  "secondary",
  "physical",
  "final-limits",
] as const;

export type MotionPass = (typeof motionPassOrder)[number];
export type MotionNodeId = string;
export type MotionConnectionId = string;
export type MotionBlendMode = "override" | "additive" | "constraint";
export type MotionPortType = "pose" | "pose-delta" | "number" | "boolean" | "vec3" | "quat" | "token" | "constraint";
export type MotionPoseComponent = "rotation" | "translation" | "scale";

export type MotionEndpoint = {
  node: MotionNodeId;
  port: string;
};

export type MotionMaskSpec = "*" | {
  tags: string[];
  components?: MotionPoseComponent[];
};

export type MotionNodeBase = {
  id: MotionNodeId;
  label?: string;
  pass?: MotionPass;
};

export type MotionReferencePoseNodeJson = MotionNodeBase & {
  kind: "reference-pose";
};

export type MotionSignalNodeJson = MotionNodeBase & {
  kind: "signal";
  signal: string;
};

export type MotionBlendNodeJson = MotionNodeBase & {
  kind: "blend";
  mask?: MotionMaskSpec;
};

export type MotionLayerNodeJson = MotionNodeBase & {
  kind: "layer";
  mask: MotionMaskSpec;
};

export type MotionDelayNodeJson = MotionNodeBase & {
  kind: "delay";
  valueType: MotionPortType;
};

export type MotionInertializeNodeJson = MotionNodeBase & {
  kind: "inertialize";
  halfLifeSeconds?: number;
  mask?: MotionMaskSpec;
};

export type MotionNotifyEventJson = {
  id: string;
  name: string;
  phase: number;
  payload?: unknown;
};

export type MotionNotifyNodeJson = MotionNodeBase & {
  kind: "notify";
  events: MotionNotifyEventJson[];
  maxEventsPerFrame?: number;
};

export type MotionCustomNodeJson = MotionNodeBase & {
  kind: "custom";
  implementation: string;
  parameters?: Readonly<Record<string, unknown>>;
  reads?: MotionMaskSpec;
  writes: MotionMaskSpec;
};

export type MotionNodeJson =
  | MotionReferencePoseNodeJson
  | MotionSignalNodeJson
  | MotionBlendNodeJson
  | MotionLayerNodeJson
  | MotionDelayNodeJson
  | MotionInertializeNodeJson
  | MotionNotifyNodeJson
  | MotionCustomNodeJson;

export type MotionConnectionJson = {
  id: MotionConnectionId;
  from: MotionEndpoint;
  to: MotionEndpoint;
  blendMode?: MotionBlendMode;
};

export type MotionGraphJson = {
  schemaVersion: typeof MOTION_GRAPH_SCHEMA_VERSION;
  id: string;
  nodes: MotionNodeJson[];
  connections: MotionConnectionJson[];
  output: MotionEndpoint;
  settings?: {
    defaultInertialHalfLifeSeconds?: number;
    notifyCapacity?: number;
  };
};

export type MotionPortDefinition = {
  type: MotionPortType;
  optional?: boolean;
  multiple?: boolean;
};

export type MotionNodePortSchema = {
  inputs: Readonly<Record<string, MotionPortDefinition>>;
  outputs: Readonly<Record<string, MotionPortDefinition>>;
};

export type MotionDiagnosticSeverity = "warning" | "error";

export type MotionGraphDiagnostic = {
  code: string;
  message: string;
  severity: MotionDiagnosticSeverity;
  nodeId?: string;
  connectionId?: string;
  cycle?: string[];
};

export type MotionNotify = {
  frame: number;
  id: string;
  name: string;
  nodeId: string;
  phase: number;
  cycle: number;
  payload?: unknown;
};

export type MotionNodeKind = MotionNodeJson["kind"];
