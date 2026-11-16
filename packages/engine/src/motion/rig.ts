import { isPlainRecord as isRecord } from "@hyperfocus/utilities/records";
import {
  isFiniteQuaternion,
  isFiniteVector3,
  isNormalizedQuaternion,
  multiplyQuaternions,
  rotateVector3ByQuaternion,
  type MotionQuaternion,
  type MotionVec3,
} from "./math.ts";

export const T3_RIG_SCHEMA_VERSION = 1;
export const T3_RIG_MAPPER_VERSION = "1.0.4";
export const T3_HUMANOID_PRESET = "humanoid-v1";

export type HumanoidSemantic =
  | "hips" | "spine" | "chest" | "upperChest" | "neck" | "head"
  | "leftShoulder" | "leftUpperArm" | "leftLowerArm" | "leftHand"
  | "rightShoulder" | "rightUpperArm" | "rightLowerArm" | "rightHand"
  | "leftUpperLeg" | "leftLowerLeg" | "leftFoot" | "leftToes"
  | "rightUpperLeg" | "rightLowerLeg" | "rightFoot" | "rightToes";

function defineHumanoidSemanticInventory<const T extends readonly HumanoidSemantic[]>(values: T): T {
  return values;
}

export const humanoidSemantics: readonly HumanoidSemantic[] = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
];

export const requiredHumanoidSemantics = defineHumanoidSemanticInventory([
  "hips",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
]);

export type HumanoidLimbName = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export const humanoidLimbNames: readonly HumanoidLimbName[] = ["leftArm", "rightArm", "leftLeg", "rightLeg"];

export type RigAxis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export type RigHandedness = "left" | "right";

export type RigTransform = {
  translation: MotionVec3;
  rotation: MotionQuaternion;
  scale?: MotionVec3;
};

export type RigFingerprint = {
  algorithm: string;
  value: string;
};

export type T3RigNormalization = {
  sourceUp: RigAxis;
  sourceForward: RigAxis;
  sourceHandedness: RigHandedness;
  metersPerUnit: number;
  sourceToCanonicalRotation: MotionQuaternion;
  mirrorX?: boolean;
};

export const canonicalRigCoordinates: Readonly<{
  up: RigAxis;
  forward: RigAxis;
  left: RigAxis;
  right: RigAxis;
  handedness: RigHandedness;
  unit: "meter";
}> = Object.freeze({ up: "+y", forward: "+z", left: "+x", right: "-x", handedness: "right", unit: "meter" });

export type RigBoneEvidence = {
  hierarchyPath: string;
  siblingOrdinal: number;
  bindTransform: RigTransform;
  skinJointOrdinal: number;
  structuralHash: RigFingerprint;
};

export type T3RigBindingProvenance = "manual" | "mixamo" | "vrm" | "gltf-heuristic" | "reconciled";

export type T3RigBoneBinding = {
  boneIndex: number;
  confidence: number;
  provenance: T3RigBindingProvenance;
  verified: boolean;
  evidence: RigBoneEvidence;
};

export type T3RigSemanticMap = Record<HumanoidSemantic, T3RigBoneBinding | null>;
export type T3RigTagMap = Record<string, readonly T3RigBoneBinding[]>;

export type T3RigJointLimitOverride = {
  maxSwingRadians?: number;
  minTwistRadians?: number;
  maxTwistRadians?: number;
};

export type T3RigOverrides = {
  jointLimits?: Record<string, T3RigJointLimitOverride>;
  maxStretch?: Partial<Record<HumanoidLimbName, number>>;
};

export type T3RigDocumentV1 = {
  schemaVersion: typeof T3_RIG_SCHEMA_VERSION;
  mapperVersion: string;
  humanoidPreset: string;
  assetFingerprint: RigFingerprint;
  skinFingerprint: RigFingerprint;
  normalization: T3RigNormalization;
  semantics: T3RigSemanticMap;
  tags: T3RigTagMap;
  overrides: T3RigOverrides;
};

export type T3RigDocument = T3RigDocumentV1;

export type SourceBoneDescriptor = {
  index: number;
  parentIndex: number;
  name: string;
  hierarchyPath: string;
  siblingOrdinal: number;
  skinJointOrdinal: number;
  /** Joint-local bind transform after conversion to canonical +Y-up, +Z-forward meters. */
  bindTransform: RigTransform;
  structuralHash: RigFingerprint;
};

export type SourceRigDescriptor = {
  assetFingerprint: RigFingerprint;
  skinFingerprint: RigFingerprint;
  normalization: T3RigNormalization;
  bones: readonly SourceBoneDescriptor[];
  vrmHumanoid?: Partial<Record<HumanoidSemantic, number>>;
};

export type VirtualRigHub = {
  id: string;
  parent: "motionRoot" | HumanoidSemantic;
  transform?: RigTransform;
  tags?: readonly string[];
};

export type RigDiagnosticSeverity = "warning" | "error";

export type RigDiagnostic = {
  code: string;
  message: string;
  severity: RigDiagnosticSeverity;
  semantic?: HumanoidSemantic;
  feature?: keyof HumanoidRigCapabilities;
  boneIndex?: number;
};

export type HumanoidRigCapabilities = {
  baseLocomotion: boolean;
  aim: boolean;
  leftArm: boolean;
  rightArm: boolean;
  leftLeg: boolean;
  rightLeg: boolean;
  leftReach: boolean;
  rightReach: boolean;
  leftFootPlant: boolean;
  rightFootPlant: boolean;
};

export type CompiledSemanticRig = {
  readonly deformCount: number;
  readonly totalCount: number;
  readonly motionRootIndex: number;
  readonly sourceParents: Int32Array;
  readonly semanticParents: Int32Array;
  readonly evaluationOrder: Uint32Array;
  readonly referenceRotations: Float32Array;
  readonly referenceTranslations: Float32Array;
  readonly referenceScales: Float32Array;
  readonly sourceReferenceRotations: Float32Array;
  readonly sourceReferenceTranslations: Float32Array;
  readonly sourceReferenceScales: Float32Array;
  readonly semanticIndices: Int32Array;
  readonly tags: ReadonlyMap<string, Uint32Array>;
  readonly capabilities: Readonly<HumanoidRigCapabilities>;
  readonly diagnostics: readonly RigDiagnostic[];
  readonly validated: boolean;
};

export type CompileSemanticRigOptions = {
  virtualHubs?: readonly VirtualRigHub[];
};

const identityTransform: RigTransform = Object.freeze({
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});

const allowedProvenance: readonly T3RigBindingProvenance[] = [
  "manual",
  "mixamo",
  "vrm",
  "gltf-heuristic",
  "reconciled",
];

const rigAxes: readonly RigAxis[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
const jointLimitKeys: readonly (keyof T3RigJointLimitOverride)[] = ["maxSwingRadians", "maxTwistRadians", "minTwistRadians"];

const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);



function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function requireExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string) {
  const requiredKeys = new Set(required);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported property ${JSON.stringify(key)}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(record, key)) throw new TypeError(`${label} is missing property ${JSON.stringify(key)}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function readRigAxis(value: unknown, label: string): RigAxis {
  const input = requireString(value, label);
  const axis = rigAxes.find((candidate) => candidate === input);
  if (!axis) throw new TypeError(`${label} is not a supported axis`);
  return axis;
}

function readRigHandedness(value: unknown, label: string): RigHandedness {
  const input = requireString(value, label);
  if (input !== "left" && input !== "right") throw new TypeError(`${label} must be left or right`);
  return input;
}

function readBindingProvenance(value: unknown, label: string): T3RigBindingProvenance {
  const input = requireString(value, label);
  const provenance = allowedProvenance.find((candidate) => candidate === input);
  if (!provenance) throw new TypeError(`${label} is unsupported`);
  return provenance;
}

function isHumanoidSemantic(value: string): value is HumanoidSemantic {
  return humanoidSemantics.some((semantic) => semantic === value);
}

function readVector3(value: unknown, label: string): MotionVec3 {
  if (!Array.isArray(value) || value.length !== 3 || !isFiniteVector3(value)) {
    throw new TypeError(`${label} must contain exactly three finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

function readQuaternion(value: unknown, label: string): MotionQuaternion {
  if (!Array.isArray(value) || value.length !== 4 || !isFiniteQuaternion(value)) {
    throw new TypeError(`${label} must contain exactly four finite numbers`);
  }
  if (!isNormalizedQuaternion(value, 1e-3)) throw new TypeError(`${label} must be normalized`);
  return [value[0], value[1], value[2], value[3]];
}

function readTransform(value: unknown, label: string): RigTransform {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["rotation", "translation"], ["scale"], label);
  const scale = record.scale === undefined ? undefined : readVector3(record.scale, `${label}.scale`);
  return {
    translation: readVector3(record.translation, `${label}.translation`),
    rotation: readQuaternion(record.rotation, `${label}.rotation`),
    ...(scale ? { scale } : {}),
  };
}

function readFingerprint(value: unknown, label: string): RigFingerprint {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["algorithm", "value"], [], label);
  return {
    algorithm: requireString(record.algorithm, `${label}.algorithm`),
    value: requireString(record.value, `${label}.value`),
  };
}

function readNormalization(value: unknown): T3RigNormalization {
  const record = requireRecord(value, "t3rig normalization");
  requireExactKeys(
    record,
    ["metersPerUnit", "sourceForward", "sourceHandedness", "sourceToCanonicalRotation", "sourceUp"],
    ["mirrorX"],
    "t3rig normalization",
  );
  const sourceUp = readRigAxis(record.sourceUp, "t3rig normalization.sourceUp");
  const sourceForward = readRigAxis(record.sourceForward, "t3rig normalization.sourceForward");
  if (sourceUp.slice(1) === sourceForward.slice(1)) throw new TypeError("t3rig source up and forward axes must differ");
  const sourceHandedness = readRigHandedness(record.sourceHandedness, "t3rig normalization.sourceHandedness");
  const metersPerUnit = requireFinite(record.metersPerUnit, "t3rig normalization.metersPerUnit");
  if (metersPerUnit <= 0) throw new RangeError("t3rig normalization.metersPerUnit must be positive");
  if (record.mirrorX !== undefined && typeof record.mirrorX !== "boolean") {
    throw new TypeError("t3rig normalization.mirrorX must be boolean");
  }
  return {
    sourceUp,
    sourceForward,
    sourceHandedness,
    metersPerUnit,
    sourceToCanonicalRotation: readQuaternion(record.sourceToCanonicalRotation, "t3rig normalization.sourceToCanonicalRotation"),
    ...(record.mirrorX === undefined ? {} : { mirrorX: record.mirrorX }),
  };
}

function readEvidence(value: unknown, label: string): RigBoneEvidence {
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["bindTransform", "hierarchyPath", "siblingOrdinal", "skinJointOrdinal", "structuralHash"],
    [],
    label,
  );
  return {
    hierarchyPath: requireString(record.hierarchyPath, `${label}.hierarchyPath`),
    siblingOrdinal: requireInteger(record.siblingOrdinal, `${label}.siblingOrdinal`),
    bindTransform: readTransform(record.bindTransform, `${label}.bindTransform`),
    skinJointOrdinal: requireInteger(record.skinJointOrdinal, `${label}.skinJointOrdinal`),
    structuralHash: readFingerprint(record.structuralHash, `${label}.structuralHash`),
  };
}

function readBinding(value: unknown, label: string): T3RigBoneBinding {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["boneIndex", "confidence", "evidence", "provenance", "verified"], [], label);
  const confidence = requireFinite(record.confidence, `${label}.confidence`);
  if (confidence < 0 || confidence > 1) throw new RangeError(`${label}.confidence must be between zero and one`);
  const provenance = readBindingProvenance(record.provenance, `${label}.provenance`);
  if (typeof record.verified !== "boolean") throw new TypeError(`${label}.verified must be boolean`);
  return {
    boneIndex: requireInteger(record.boneIndex, `${label}.boneIndex`),
    confidence,
    provenance,
    verified: record.verified,
    evidence: readEvidence(record.evidence, `${label}.evidence`),
  };
}

function readSemanticMap(value: unknown): T3RigSemanticMap {
  const record = requireRecord(value, "t3rig semantics");
  requireExactKeys(record, humanoidSemantics, [], "t3rig semantics");
  const result = createEmptyT3RigSemanticMap();
  for (const semantic of humanoidSemantics) {
    result[semantic] = record[semantic] === null ? null : readBinding(record[semantic], `t3rig semantics.${semantic}`);
  }
  return result;
}

function compareBindings(a: T3RigBoneBinding, b: T3RigBoneBinding) {
  return a.boneIndex - b.boneIndex
    || compareCodeUnits(a.evidence.hierarchyPath, b.evidence.hierarchyPath)
    || a.evidence.siblingOrdinal - b.evidence.siblingOrdinal;
}

function readTags(value: unknown): T3RigTagMap {
  const record = requireRecord(value, "t3rig tags");
  const result: Record<string, readonly T3RigBoneBinding[]> = {};
  for (const key of Object.keys(record)) {
    if (!key || unsafeRecordKeys.has(key)) throw new TypeError(`unsafe t3rig tag ${JSON.stringify(key)}`);
    const bindings = record[key];
    if (!Array.isArray(bindings)) throw new TypeError(`t3rig tag ${JSON.stringify(key)} must be an array`);
    result[key] = bindings.map((binding, index) => readBinding(binding, `t3rig tags.${key}[${index}]`)).sort(compareBindings);
  }
  return result;
}

function readJointLimit(value: unknown, label: string): T3RigJointLimitOverride {
  const record = requireRecord(value, label);
  requireExactKeys(record, [], ["maxSwingRadians", "maxTwistRadians", "minTwistRadians"], label);
  const result: T3RigJointLimitOverride = {};
  for (const key of jointLimitKeys) {
    if (record[key] !== undefined) result[key] = requireFinite(record[key], `${label}.${key}`);
  }
  if (result.maxSwingRadians !== undefined && result.maxSwingRadians < 0) {
    throw new RangeError(`${label}.maxSwingRadians cannot be negative`);
  }
  if (result.minTwistRadians !== undefined && result.maxTwistRadians !== undefined
    && result.minTwistRadians > result.maxTwistRadians) {
    throw new RangeError(`${label} minimum twist cannot exceed maximum twist`);
  }
  return result;
}

function readOverrides(value: unknown): T3RigOverrides {
  const record = requireRecord(value, "t3rig overrides");
  requireExactKeys(record, [], ["jointLimits", "maxStretch"], "t3rig overrides");
  const result: T3RigOverrides = {};
  if (record.jointLimits !== undefined) {
    const limits = requireRecord(record.jointLimits, "t3rig overrides.jointLimits");
    const output: Record<string, T3RigJointLimitOverride> = {};
    for (const key of Object.keys(limits)) {
      if (!key || unsafeRecordKeys.has(key)) throw new TypeError(`unsafe joint limit key ${JSON.stringify(key)}`);
      output[key] = readJointLimit(limits[key], `t3rig overrides.jointLimits.${key}`);
    }
    result.jointLimits = output;
  }
  if (record.maxStretch !== undefined) {
    const stretches = requireRecord(record.maxStretch, "t3rig overrides.maxStretch");
    requireExactKeys(stretches, [], humanoidLimbNames, "t3rig overrides.maxStretch");
    const output: Partial<Record<HumanoidLimbName, number>> = {};
    for (const limb of humanoidLimbNames) {
      if (stretches[limb] === undefined) continue;
      const stretch = requireFinite(stretches[limb], `t3rig overrides.maxStretch.${limb}`);
      if (stretch < 1) throw new RangeError(`t3rig overrides.maxStretch.${limb} must be at least one`);
      output[limb] = stretch;
    }
    result.maxStretch = output;
  }
  return result;
}

export function parseT3Rig(input: string | unknown): T3RigDocument {
  const decoded: unknown = typeof input === "string" ? JSON.parse(input) : input;
  const record = requireRecord(decoded, "t3rig document");
  requireExactKeys(
    record,
    [
      "assetFingerprint",
      "humanoidPreset",
      "mapperVersion",
      "normalization",
      "overrides",
      "schemaVersion",
      "semantics",
      "skinFingerprint",
      "tags",
    ],
    [],
    "t3rig document",
  );
  if (record.schemaVersion !== T3_RIG_SCHEMA_VERSION) {
    throw new RangeError(`unsupported t3rig schema version: ${String(record.schemaVersion)}`);
  }
  return {
    schemaVersion: T3_RIG_SCHEMA_VERSION,
    mapperVersion: requireString(record.mapperVersion, "t3rig mapperVersion"),
    humanoidPreset: requireString(record.humanoidPreset, "t3rig humanoidPreset"),
    assetFingerprint: readFingerprint(record.assetFingerprint, "t3rig assetFingerprint"),
    skinFingerprint: readFingerprint(record.skinFingerprint, "t3rig skinFingerprint"),
    normalization: readNormalization(record.normalization),
    semantics: readSemanticMap(record.semantics),
    tags: readTags(record.tags),
    overrides: readOverrides(record.overrides),
  };
}

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const entry = value[key];
    if (entry !== undefined) output[key] = canonicalize(entry);
  }
  return output;
}

export function serializeT3Rig(document: T3RigDocument, indentation = 2): string {
  if (!Number.isSafeInteger(indentation) || indentation < 0 || indentation > 10) {
    throw new RangeError("t3rig indentation must be an integer between zero and ten");
  }
  const normalized = parseT3Rig(document);
  return `${JSON.stringify(canonicalize(normalized), null, indentation)}\n`;
}

export function createEmptyT3RigSemanticMap(): T3RigSemanticMap {
  return {
    hips: null,
    spine: null,
    chest: null,
    upperChest: null,
    neck: null,
    head: null,
    leftShoulder: null,
    leftUpperArm: null,
    leftLowerArm: null,
    leftHand: null,
    rightShoulder: null,
    rightUpperArm: null,
    rightLowerArm: null,
    rightHand: null,
    leftUpperLeg: null,
    leftLowerLeg: null,
    leftFoot: null,
    leftToes: null,
    rightUpperLeg: null,
    rightLowerLeg: null,
    rightFoot: null,
    rightToes: null
  };
}

function fingerprintsEqual(a: RigFingerprint, b: RigFingerprint) {
  return a.algorithm === b.algorithm && a.value === b.value;
}

export function assertSourceRigDescriptor(source: SourceRigDescriptor): void {
  readFingerprint(source.assetFingerprint, "source rig assetFingerprint");
  readFingerprint(source.skinFingerprint, "source rig skinFingerprint");
  readNormalization(source.normalization);
  const identityKeys = new Set<string>();
  const jointOrdinals = new Set<number>();
  const parents = new Int32Array(source.bones.length);
  for (const [arrayIndex, bone] of source.bones.entries()) {
    if (bone.index !== arrayIndex) throw new RangeError("source rig bone indices must be contiguous and match array order");
    if (!Number.isSafeInteger(bone.parentIndex) || bone.parentIndex < -1 || bone.parentIndex >= source.bones.length) {
      throw new RangeError(`source bone ${arrayIndex} has an invalid parent index`);
    }
    if (bone.parentIndex === arrayIndex) throw new RangeError(`source bone ${arrayIndex} cannot parent itself`);
    requireString(bone.name, `source bone ${arrayIndex} name`);
    requireString(bone.hierarchyPath, `source bone ${arrayIndex} hierarchyPath`);
    requireInteger(bone.siblingOrdinal, `source bone ${arrayIndex} siblingOrdinal`);
    requireInteger(bone.skinJointOrdinal, `source bone ${arrayIndex} skinJointOrdinal`);
    readTransform(bone.bindTransform, `source bone ${arrayIndex} bindTransform`);
    readFingerprint(bone.structuralHash, `source bone ${arrayIndex} structuralHash`);
    const identityKey = `${bone.hierarchyPath}\u0000${bone.siblingOrdinal}`;
    if (identityKeys.has(identityKey)) throw new RangeError(`duplicate source bone path and sibling ordinal: ${bone.hierarchyPath}`);
    identityKeys.add(identityKey);
    if (jointOrdinals.has(bone.skinJointOrdinal)) throw new RangeError(`duplicate source skin joint ordinal: ${bone.skinJointOrdinal}`);
    jointOrdinals.add(bone.skinJointOrdinal);
    parents[arrayIndex] = bone.parentIndex;
  }
  topologicalOrder(parents, "source rig");
  if (source.vrmHumanoid) {
    for (const [semantic, boneIndex] of Object.entries(source.vrmHumanoid)) {
      if (!isHumanoidSemantic(semantic)) throw new TypeError(`unsupported VRM semantic ${semantic}`);
      if (typeof boneIndex !== "number" || !Number.isSafeInteger(boneIndex) || boneIndex < 0 || boneIndex >= source.bones.length) {
        throw new RangeError(`VRM semantic ${semantic} has an invalid bone index`);
      }
    }
  }
}

function topologicalOrder(parents: Int32Array, label: string): Uint32Array {
  const childCounts = new Uint32Array(parents.length);
  for (let index = 0; index < parents.length; index += 1) {
    const parent = parents[index];
    if (parent >= 0) childCounts[parent] += 1;
  }
  const children: number[][] = Array.from({ length: parents.length }, () => []);
  const roots: number[] = [];
  for (let index = 0; index < parents.length; index += 1) {
    const parent = parents[index];
    if (parent < 0) roots.push(index);
    else children[parent].push(index);
  }
  roots.sort((a, b) => a - b);
  for (const list of children) list.sort((a, b) => a - b);
  const output = new Uint32Array(parents.length);
  let outputCount = 0;
  const queue = [...roots];
  let cursor = 0;
  while (cursor < queue.length) {
    const index = queue[cursor++];
    output[outputCount++] = index;
    for (const child of children[index]) queue.push(child);
  }
  if (outputCount !== parents.length) throw new RangeError(`${label} parent graph contains a cycle`);
  return output;
}

function bindingEvidenceForBone(bone: SourceBoneDescriptor): RigBoneEvidence {
  return {
    hierarchyPath: bone.hierarchyPath,
    siblingOrdinal: bone.siblingOrdinal,
    skinJointOrdinal: bone.skinJointOrdinal,
    bindTransform: {
      translation: copyMotionVector3(bone.bindTransform.translation),
      rotation: copyMotionQuaternion(bone.bindTransform.rotation),
      ...(bone.bindTransform.scale ? { scale: copyMotionVector3(bone.bindTransform.scale) } : {}),
    },
    structuralHash: { ...bone.structuralHash },
  };
}

function copyMotionVector3(value: MotionVec3): MotionVec3 {
  return [value[0], value[1], value[2]];
}

function copyMotionQuaternion(value: MotionQuaternion): MotionQuaternion {
  return [value[0], value[1], value[2], value[3]];
}

export function createRigBinding(
  bone: SourceBoneDescriptor,
  provenance: T3RigBindingProvenance,
  confidence: number,
  verified = provenance === "manual",
): T3RigBoneBinding {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError("rig binding confidence must be between zero and one");
  }
  return {
    boneIndex: bone.index,
    confidence,
    provenance,
    verified,
    evidence: bindingEvidenceForBone(bone),
  };
}

function writeTransform(
  index: number,
  transform: RigTransform,
  rotations: Float32Array,
  translations: Float32Array,
  scales: Float32Array,
) {
  rotations.set(transform.rotation, index * 4);
  translations.set(transform.translation, index * 3);
  scales.set(transform.scale ?? [1, 1, 1], index * 3);
}

function computeWorldReference(source: SourceRigDescriptor) {
  const count = source.bones.length;
  const rotations = new Float32Array(count * 4);
  const translations = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const parents = Int32Array.from(source.bones, (bone) => bone.parentIndex);
  const order = topologicalOrder(parents, "source rig");
  const scaledLocal = new Float32Array(3);
  const rotatedLocal = new Float32Array(3);
  const rotationScratch = new Float32Array(4);
  for (const index of order) {
    const bone = source.bones[index];
    const parent = bone.parentIndex;
    const sourceScale = bone.bindTransform.scale ?? [1, 1, 1];
    if (parent < 0) {
      writeTransform(index, bone.bindTransform, rotations, translations, scales);
      continue;
    }
    const parentTranslationOffset = parent * 3;
    const parentRotationOffset = parent * 4;
    scaledLocal[0] = bone.bindTransform.translation[0] * scales[parentTranslationOffset];
    scaledLocal[1] = bone.bindTransform.translation[1] * scales[parentTranslationOffset + 1];
    scaledLocal[2] = bone.bindTransform.translation[2] * scales[parentTranslationOffset + 2];
    rotateVector3ByQuaternion(
      scaledLocal,
      rotations.subarray(parentRotationOffset, parentRotationOffset + 4),
      rotatedLocal,
    );
    translations[index * 3] = translations[parentTranslationOffset] + rotatedLocal[0];
    translations[index * 3 + 1] = translations[parentTranslationOffset + 1] + rotatedLocal[1];
    translations[index * 3 + 2] = translations[parentTranslationOffset + 2] + rotatedLocal[2];
    multiplyQuaternions(
      rotations.subarray(parentRotationOffset, parentRotationOffset + 4),
      bone.bindTransform.rotation,
      rotationScratch,
    );
    rotations.set(rotationScratch, index * 4);
    scales[index * 3] = scales[parentTranslationOffset] * sourceScale[0];
    scales[index * 3 + 1] = scales[parentTranslationOffset + 1] * sourceScale[1];
    scales[index * 3 + 2] = scales[parentTranslationOffset + 2] * sourceScale[2];
  }
  return { rotations, translations, scales };
}

function addTag(target: Map<string, number[]>, tag: string, indices: readonly number[]) {
  let values = target.get(tag);
  if (!values) {
    values = [];
    target.set(tag, values);
  }
  for (const index of indices) {
    if (!values.includes(index)) values.push(index);
  }
}

function chainIndices(semanticIndices: Int32Array, semantics: readonly HumanoidSemantic[]) {
  const indices: number[] = [];
  for (const semantic of semantics) {
    const index = semanticIndices[humanoidSemantics.indexOf(semantic)];
    if (index >= 0 && !indices.includes(index)) indices.push(index);
  }
  return indices;
}

function allDistinctMapped(semanticIndices: Int32Array, semantics: readonly HumanoidSemantic[]) {
  const indices = chainIndices(semanticIndices, semantics);
  return indices.length === semantics.length;
}

function compileCapabilities(semanticIndices: Int32Array): HumanoidRigCapabilities {
  const mapped = (semantic: HumanoidSemantic) => semanticIndices[humanoidSemantics.indexOf(semantic)] >= 0;
  const leftArm = allDistinctMapped(semanticIndices, ["leftUpperArm", "leftLowerArm", "leftHand"]);
  const rightArm = allDistinctMapped(semanticIndices, ["rightUpperArm", "rightLowerArm", "rightHand"]);
  const leftLeg = allDistinctMapped(semanticIndices, ["leftUpperLeg", "leftLowerLeg", "leftFoot"]);
  const rightLeg = allDistinctMapped(semanticIndices, ["rightUpperLeg", "rightLowerLeg", "rightFoot"]);
  return {
    baseLocomotion: mapped("hips") && (mapped("leftUpperLeg") || mapped("rightUpperLeg")),
    aim: mapped("head"),
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftReach: leftArm,
    rightReach: rightArm,
    leftFootPlant: leftLeg,
    rightFootPlant: rightLeg,
  };
}

function capabilityDiagnostics(capabilities: HumanoidRigCapabilities): RigDiagnostic[] {
  const diagnostics: RigDiagnostic[] = [];
  const labels: Array<[keyof HumanoidRigCapabilities, string]> = [
    ["baseLocomotion", "Base locomotion is degraded because hips or upper legs are unresolved"],
    ["aim", "Aim is disabled because Head is unresolved"],
    ["leftReach", "Left-arm reaching is disabled because the limb chain is incomplete"],
    ["rightReach", "Right-arm reaching is disabled because the limb chain is incomplete"],
    ["leftFootPlant", "Left foot-planting is disabled because the leg chain is incomplete"],
    ["rightFootPlant", "Right foot-planting is disabled because the leg chain is incomplete"],
  ];
  for (const [feature, message] of labels) {
    if (!capabilities[feature]) diagnostics.push({ code: "capability-disabled", message, severity: "warning", feature });
  }
  return diagnostics;
}

export function compileSemanticRig(
  source: SourceRigDescriptor,
  documentInput: T3RigDocument,
  options: CompileSemanticRigOptions = {},
): CompiledSemanticRig {
  assertSourceRigDescriptor(source);
  const document = parseT3Rig(documentInput);
  const diagnostics: RigDiagnostic[] = [];
  if (!fingerprintsEqual(source.assetFingerprint, document.assetFingerprint)) {
    diagnostics.push({ code: "asset-fingerprint-mismatch", message: "Rig sidecar asset fingerprint differs from the imported asset", severity: "warning" });
  }
  if (!fingerprintsEqual(source.skinFingerprint, document.skinFingerprint)) {
    diagnostics.push({ code: "skin-fingerprint-mismatch", message: "Rig sidecar skin fingerprint differs from the imported skin", severity: "warning" });
  }
  const deformCount = source.bones.length;
  const motionRootIndex = deformCount;
  const virtualHubs = options.virtualHubs ?? [];
  const totalCount = deformCount + 1 + virtualHubs.length;
  const semanticIndices = new Int32Array(humanoidSemantics.length);
  semanticIndices.fill(-1);
  const claimedBones = new Map<number, HumanoidSemantic>();
  for (const [semanticOffset, semantic] of humanoidSemantics.entries()) {
    const binding = document.semantics[semantic];
    if (!binding) continue;
    if (binding.boneIndex >= deformCount) {
      diagnostics.push({
        code: "binding-out-of-range",
        message: `${semantic} maps to missing bone index ${binding.boneIndex}`,
        severity: "warning",
        semantic,
        boneIndex: binding.boneIndex,
      });
      continue;
    }
    const claimedBy = claimedBones.get(binding.boneIndex);
    if (claimedBy) {
      diagnostics.push({
        code: "binding-conflict",
        message: `${semantic} and ${claimedBy} both map to bone index ${binding.boneIndex}; ${semantic} is disabled`,
        severity: "warning",
        semantic,
        boneIndex: binding.boneIndex,
      });
      continue;
    }
    claimedBones.set(binding.boneIndex, semantic);
    semanticIndices[semanticOffset] = binding.boneIndex;
  }
  for (const semantic of requiredHumanoidSemantics) {
    if (semanticIndices[humanoidSemantics.indexOf(semantic)] < 0) {
      diagnostics.push({ code: "semantic-unresolved", message: `Required semantic ${semantic} is unresolved`, severity: "warning", semantic });
    }
  }

  const sourceParents = Int32Array.from(source.bones, (bone) => bone.parentIndex);
  const semanticParents = new Int32Array(totalCount);
  semanticParents.fill(-1);
  for (let index = 0; index < deformCount; index += 1) {
    semanticParents[index] = sourceParents[index] < 0 ? motionRootIndex : sourceParents[index];
  }
  const hipsIndex = semanticIndices[humanoidSemantics.indexOf("hips")];
  if (hipsIndex >= 0) semanticParents[hipsIndex] = motionRootIndex;
  semanticParents[motionRootIndex] = -1;

  const sourceReferenceRotations = new Float32Array(deformCount * 4);
  const sourceReferenceTranslations = new Float32Array(deformCount * 3);
  const sourceReferenceScales = new Float32Array(deformCount * 3);
  for (const bone of source.bones) {
    writeTransform(
      bone.index,
      bone.bindTransform,
      sourceReferenceRotations,
      sourceReferenceTranslations,
      sourceReferenceScales,
    );
  }
  const referenceRotations = new Float32Array(totalCount * 4);
  const referenceTranslations = new Float32Array(totalCount * 3);
  const referenceScales = new Float32Array(totalCount * 3);
  referenceRotations.set(sourceReferenceRotations);
  referenceTranslations.set(sourceReferenceTranslations);
  referenceScales.set(sourceReferenceScales);
  writeTransform(motionRootIndex, identityTransform, referenceRotations, referenceTranslations, referenceScales);
  if (hipsIndex >= 0 && sourceParents[hipsIndex] >= 0) {
    const world = computeWorldReference(source);
    referenceRotations.set(world.rotations.subarray(hipsIndex * 4, hipsIndex * 4 + 4), hipsIndex * 4);
    referenceTranslations.set(world.translations.subarray(hipsIndex * 3, hipsIndex * 3 + 3), hipsIndex * 3);
    referenceScales.set(world.scales.subarray(hipsIndex * 3, hipsIndex * 3 + 3), hipsIndex * 3);
  }

  const mutableTags = new Map<string, number[]>();
  addTag(mutableTags, "MotionRoot", [motionRootIndex]);
  for (const [semanticOffset, semantic] of humanoidSemantics.entries()) {
    const index = semanticIndices[semanticOffset];
    if (index >= 0) {
      addTag(mutableTags, semantic, [index]);
      addTag(mutableTags, `${semantic[0].toUpperCase()}${semantic.slice(1)}`, [index]);
    }
  }
  addTag(mutableTags, "LeftArmChain", chainIndices(semanticIndices, ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"]));
  addTag(mutableTags, "RightArmChain", chainIndices(semanticIndices, ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"]));
  addTag(mutableTags, "LeftLegChain", chainIndices(semanticIndices, ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"]));
  addTag(mutableTags, "RightLegChain", chainIndices(semanticIndices, ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"]));
  addTag(mutableTags, "SpineAndAbove", chainIndices(semanticIndices, ["spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"]));
  for (const [tag, bindings] of Object.entries(document.tags)) {
    for (const binding of bindings) {
      if (binding.boneIndex >= deformCount) {
        diagnostics.push({ code: "tag-binding-out-of-range", message: `Tag ${tag} references missing bone index ${binding.boneIndex}`, severity: "warning", boneIndex: binding.boneIndex });
      } else {
        addTag(mutableTags, tag, [binding.boneIndex]);
      }
    }
  }
  for (const [helperOffset, helper] of virtualHubs.entries()) {
    const index = deformCount + 1 + helperOffset;
    if (!helper.id || unsafeRecordKeys.has(helper.id)) throw new TypeError("virtual hub id must be a safe non-empty string");
    const parent = helper.parent === "motionRoot"
      ? motionRootIndex
      : semanticIndices[humanoidSemantics.indexOf(helper.parent)];
    semanticParents[index] = parent >= 0 ? parent : motionRootIndex;
    if (parent < 0) diagnostics.push({ code: "virtual-parent-unresolved", message: `Virtual hub ${helper.id} fell back to MotionRoot because ${helper.parent} is unresolved`, severity: "warning" });
    writeTransform(index, helper.transform ?? identityTransform, referenceRotations, referenceTranslations, referenceScales);
    addTag(mutableTags, helper.id, [index]);
    for (const tag of helper.tags ?? []) addTag(mutableTags, tag, [index]);
  }
  const evaluationOrder = topologicalOrder(semanticParents, "semantic rig");
  const tags = new Map<string, Uint32Array>();
  for (const [tag, indices] of mutableTags) {
    indices.sort((a, b) => a - b);
    tags.set(tag, Uint32Array.from(indices));
  }
  const capabilities = Object.freeze(compileCapabilities(semanticIndices));
  diagnostics.push(...capabilityDiagnostics(capabilities));
  const validated = requiredHumanoidSemantics.every((semantic) => semanticIndices[humanoidSemantics.indexOf(semantic)] >= 0);
  return {
    deformCount,
    totalCount,
    motionRootIndex,
    sourceParents,
    semanticParents,
    evaluationOrder,
    referenceRotations,
    referenceTranslations,
    referenceScales,
    sourceReferenceRotations,
    sourceReferenceTranslations,
    sourceReferenceScales,
    semanticIndices,
    tags,
    capabilities,
    diagnostics,
    validated,
  };
}

export function getRigSemanticIndex(rig: CompiledSemanticRig, semantic: HumanoidSemantic): number {
  return rig.semanticIndices[humanoidSemantics.indexOf(semantic)] ?? -1;
}

export function getRigTagIndices(rig: CompiledSemanticRig, tag: string): Uint32Array | undefined {
  return rig.tags.get(tag);
}

export function isManualRigBinding(binding: T3RigBoneBinding | null | undefined): boolean {
  return binding?.provenance === "manual";
}
