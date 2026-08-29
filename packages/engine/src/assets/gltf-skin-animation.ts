/** Vendor-neutral glTF 2.0 skin and TRS-animation cooking. This module performs no I/O. */

import {
  resolveGltfStaticBuffers,
  type GltfBufferResolverOptions,
} from "./gltf-static.ts";
import {
  resolveGltfSkinAnimationCookLimits as resolveLimits,
  type GltfSkinAnimationCookLimits,
  type ResolvedGltfSkinAnimationCookLimits as ResolvedLimits
} from "./gltf-skin-animation-limits.ts";
export type { GltfSkinAnimationCookLimits } from "./gltf-skin-animation-limits.ts";

const GLTF_BYTE = 5120;
const GLTF_UNSIGNED_BYTE = 5121;
const GLTF_SHORT = 5122;
const GLTF_UNSIGNED_SHORT = 5123;
const GLTF_FLOAT = 5126;
const GLTF_TRIANGLES = 4;
const MATRIX_STRIDE = 16;

export const GLTF_ANIMATION_PATH_TRANSLATION = 0;
export const GLTF_ANIMATION_PATH_ROTATION = 1;
export const GLTF_ANIMATION_PATH_SCALE = 2;
export const GLTF_ANIMATION_INTERPOLATION_LINEAR = 0;
export const GLTF_ANIMATION_INTERPOLATION_STEP = 1;

export type GltfSkinAnimationDiagnostic = {
  severity: "error" | "warning";
  code: string;
  pointer: string;
  message: string;
};

export type CookedGltfSkinStreams = {
  meshIndex: number;
  primitiveIndex: number;
  vertexCount: number;
  joints: Uint8Array | Uint16Array;
  weights: Float32Array;
};

export type CookedGltfSkinBinding = {
  nodeIndex: number;
  meshIndex: number;
  skinIndex: number;
};

export type CookedGltfSkeleton = {
  skinIndex: number;
  label: string;
  skeletonNode: number;
  jointNodes: Uint32Array;
  inverseBindMatrices: Float32Array;
};

export type CookedGltfAnimationClip = {
  animationIndex: number;
  label: string;
  duration: number;
  channelTargetNodes: Uint32Array;
  channelPaths: Uint8Array;
  channelInterpolations: Uint8Array;
  channelKeyOffsets: Uint32Array;
  channelKeyCounts: Uint32Array;
  channelValueOffsets: Uint32Array;
  keyframeTimes: Float32Array;
  keyframeValues: Float32Array;
};

export type CookedGltfRig = {
  nodeCount: number;
  nodeParents: Int32Array;
  nodeTopologicalOrder: Uint32Array;
  nodeTranslations: Float32Array;
  nodeRotations: Float32Array;
  nodeScales: Float32Array;
  nodeMatrices: Float32Array;
  nodeMatrixFlags: Uint8Array;
  skeletons: CookedGltfSkeleton[];
  skinBindings: CookedGltfSkinBinding[];
  meshes: CookedGltfSkinStreams[];
  clips: CookedGltfAnimationClip[];
};

export type GltfSkinAnimationCookResult = {
  ok: boolean;
  rig?: CookedGltfRig;
  diagnostics: GltfSkinAnimationDiagnostic[];
  outputBytes: number;
};

export type ResolveAndCookGltfSkinAnimationOptions = GltfBufferResolverOptions & {
  cook?: GltfSkinAnimationCookLimits;
};

export type GltfPoseOutput = {
  translations: Float32Array;
  rotations: Float32Array;
  scales: Float32Array;
  localMatrices: Float32Array;
  worldMatrices: Float32Array;
};

export type EvaluateGltfAnimationOptions = {
  skeleton: number;
  clip: number;
  timeSeconds: number;
  loop?: boolean;
  /** A node that references the selected skin. Its inverse world matrix makes the palette mesh-local. */
  meshNode?: number;
};

type JsonRecord = Record<string, unknown>;

type CookContext = {
  root: JsonRecord;
  buffers: Uint8Array[];
  bufferViews: unknown[];
  accessors: unknown[];
  limits: ResolvedLimits;
};

type AccessorLayout = {
  accessor: JsonRecord;
  pointer: string;
  count: number;
  componentType: number;
  componentBytes: number;
  components: number;
  normalized: boolean;
  bytes: Uint8Array;
  start: number;
  stride: number;
};

function createGltfRigFailure(code: string, pointer: string, message: string) { const error = new Error(message); error.name = "GltfRigFailure"; return Object.assign(error, { code, pointer }); }
type GltfRigFailure = ReturnType<typeof createGltfRigFailure>;
function isGltfRigFailure(cause: unknown): cause is GltfRigFailure { return cause instanceof Error && cause.name === "GltfRigFailure" && typeof Reflect.get(cause, "code") === "string" && typeof Reflect.get(cause, "pointer") === "string"; }

/** Cooks resolved glTF buffers into deterministic typed-array rig data. */
export function cookGltfSkinAnimations(
  document: unknown,
  buffers: readonly (ArrayBuffer | ArrayBufferView)[],
  options: GltfSkinAnimationCookLimits = {},
): GltfSkinAnimationCookResult {
  const diagnostics: GltfSkinAnimationDiagnostic[] = [];
  try {
    const limits = resolveLimits(options);
    const root = record(document, "", "document-type", "glTF document must be a JSON object.");
    validateAsset(root);
    validateRequiredExtensions(root);
    const declarations = array(root.buffers, "/buffers", "buffers-required", "glTF buffers must be an array.");
    const bufferViews = array(root.bufferViews, "/bufferViews", "buffer-views-required", "Skins and animations require a bufferViews array.");
    const accessors = array(root.accessors, "/accessors", "accessors-required", "Skins and animations require an accessors array.");
    const nodes = array(root.nodes, "/nodes", "nodes-required", "Skins and animations require a nodes array.");
    const meshes = root.meshes === undefined ? [] : array(root.meshes, "/meshes", "meshes-type", "meshes must be an array.");
    const skins = array(root.skins, "/skins", "skins-required", "Skin cooking requires a skins array.");
    const animations = root.animations === undefined ? [] : array(root.animations, "/animations", "animations-type", "animations must be an array.");
    enforceCount(declarations.length, limits.maxBuffers, "/buffers", "buffer-count-limit", "buffers");
    enforceCount(bufferViews.length, limits.maxBufferViews, "/bufferViews", "buffer-view-count-limit", "bufferViews");
    enforceCount(accessors.length, limits.maxAccessors, "/accessors", "accessor-count-limit", "accessors");
    enforceCount(nodes.length, limits.maxNodes, "/nodes", "node-count-limit", "nodes");
    enforceCount(meshes.length, limits.maxMeshes, "/meshes", "mesh-count-limit", "meshes");
    enforceCount(skins.length, limits.maxSkins, "/skins", "skin-count-limit", "skins");
    enforceCount(animations.length, limits.maxAnimations, "/animations", "animation-count-limit", "animations");
    if (!Array.isArray(buffers) || buffers.length !== declarations.length) {
      fail("buffer-count-mismatch", "/buffers", `Expected ${declarations.length} resolved buffers but received ${Array.isArray(buffers) ? buffers.length : "a non-array value"}.`);
    }
    const resolvedBuffers = validateBuffers(declarations, buffers, limits);
    const context: CookContext = { root, buffers: resolvedBuffers, bufferViews, accessors, limits };
    validateRelevantExtensions(context, nodes, meshes, skins, animations);
    const nodeData = cookNodes(nodes, limits);
    const cookedMeshes = cookSkinStreams(context, meshes);
    const cookedSkeletons = cookSkeletons(context, skins, nodes.length);
    const bindings = cookBindings(nodes, meshes, skins, cookedMeshes, cookedSkeletons);
    const clips = cookClips(context, animations, nodeData.nodeMatrixFlags);
    let outputBytes = nodeData.outputBytes;
    for (const mesh of cookedMeshes) outputBytes = addOutputBytes(outputBytes, mesh.joints.byteLength + mesh.weights.byteLength, limits, `/meshes/${mesh.meshIndex}/primitives/${mesh.primitiveIndex}`);
    for (const skeleton of cookedSkeletons) outputBytes = addOutputBytes(outputBytes, skeleton.jointNodes.byteLength + skeleton.inverseBindMatrices.byteLength, limits, `/skins/${skeleton.skinIndex}`);
    for (const clip of clips) {
      outputBytes = addOutputBytes(outputBytes,
        clip.channelTargetNodes.byteLength + clip.channelPaths.byteLength + clip.channelInterpolations.byteLength
          + clip.channelKeyOffsets.byteLength + clip.channelKeyCounts.byteLength + clip.channelValueOffsets.byteLength
          + clip.keyframeTimes.byteLength + clip.keyframeValues.byteLength,
        limits, `/animations/${clip.animationIndex}`);
    }
    const rig: CookedGltfRig = {
      nodeCount: nodes.length,
      nodeParents: nodeData.nodeParents,
      nodeTopologicalOrder: nodeData.nodeTopologicalOrder,
      nodeTranslations: nodeData.nodeTranslations,
      nodeRotations: nodeData.nodeRotations,
      nodeScales: nodeData.nodeScales,
      nodeMatrices: nodeData.nodeMatrices,
      nodeMatrixFlags: nodeData.nodeMatrixFlags,
      skeletons: cookedSkeletons,
      skinBindings: bindings,
      meshes: cookedMeshes,
      clips,
    };
    return { ok: true, rig, diagnostics, outputBytes };
  } catch (cause) {
    diagnostics.push(toDiagnostic(cause, ""));
    return { ok: false, diagnostics, outputBytes: 0 };
  }
}

/** Resolves data, GLB, or caller-owned external buffers through the existing neutral resolver boundary. */
export async function resolveAndCookGltfSkinAnimations(
  document: unknown,
  options: ResolveAndCookGltfSkinAnimationOptions = {},
): Promise<GltfSkinAnimationCookResult> {
  const resolution = await resolveGltfStaticBuffers(document, options);
  if (!resolution.ok) return { ok: false, diagnostics: resolution.diagnostics, outputBytes: 0 };
  const cooked = cookGltfSkinAnimations(document, resolution.buffers, options.cook);
  return { ...cooked, diagnostics: [...resolution.diagnostics, ...cooked.diagnostics] };
}

/** Allocates the only scratch/output storage needed for allocation-free repeated pose evaluation. */
export function createGltfPoseOutput(rig: CookedGltfRig): GltfPoseOutput {
  if (!Number.isSafeInteger(rig.nodeCount) || rig.nodeCount < 0) throw new RangeError(`rig.nodeCount must be a non-negative safe integer; received ${rig.nodeCount}.`);
  return {
    translations: new Float32Array(rig.nodeCount * 3),
    rotations: new Float32Array(rig.nodeCount * 4),
    scales: new Float32Array(rig.nodeCount * 3),
    localMatrices: new Float32Array(rig.nodeCount * MATRIX_STRIDE),
    worldMatrices: new Float32Array(rig.nodeCount * MATRIX_STRIDE),
  };
}

/**
 * Samples a clip and writes final joint matrices into caller-owned storage.
 * Returns the resolved sample time. No arrays are allocated during evaluation.
 */
export function evaluateGltfAnimationPose(
  rig: CookedGltfRig,
  options: EvaluateGltfAnimationOptions,
  pose: GltfPoseOutput,
  palette: Float32Array,
): number {
  validatePoseOutput(rig, pose);
  const skeleton = requireIndex(rig.skeletons, options.skeleton, "skeleton");
  const clip = requireIndex(rig.clips, options.clip, "clip");
  const time = finite(options.timeSeconds, "timeSeconds");
  if (!(palette instanceof Float32Array) || palette.length !== skeleton.jointNodes.length * MATRIX_STRIDE) {
    throw new RangeError(`palette must be a Float32Array with exactly ${skeleton.jointNodes.length * MATRIX_STRIDE} values.`);
  }
  assertDistinctPoseStorage(pose, palette);
  pose.translations.set(rig.nodeTranslations);
  pose.rotations.set(rig.nodeRotations);
  pose.scales.set(rig.nodeScales);
  const sampleTime = resolveSampleTime(time, clip.duration, options.loop === true);
  for (let channel = 0; channel < clip.channelTargetNodes.length; channel += 1) {
    sampleChannel(clip, channel, sampleTime, pose);
  }
  for (let orderIndex = 0; orderIndex < rig.nodeTopologicalOrder.length; orderIndex += 1) {
    const node = rig.nodeTopologicalOrder[orderIndex];
    const matrixOffset = node * MATRIX_STRIDE;
    if (rig.nodeMatrixFlags[node] !== 0) copy16(pose.localMatrices, matrixOffset, rig.nodeMatrices, matrixOffset);
    else composeTrs(pose.localMatrices, matrixOffset, pose.translations, node * 3, pose.rotations, node * 4, pose.scales, node * 3);
    const parent = rig.nodeParents[node];
    if (parent === -1) copy16(pose.worldMatrices, matrixOffset, pose.localMatrices, matrixOffset);
    else multiply4x4(pose.worldMatrices, matrixOffset, pose.worldMatrices, parent * MATRIX_STRIDE, pose.localMatrices, matrixOffset);
  }
  let hasMeshInverse = false;
  if (options.meshNode !== undefined) {
    const node = requireNode(rig, options.meshNode, "meshNode");
    let bindingFound = false;
    for (let binding = 0; binding < rig.skinBindings.length; binding += 1) {
      const candidate = rig.skinBindings[binding];
      if (candidate.nodeIndex === node && candidate.skinIndex === skeleton.skinIndex) { bindingFound = true; break; }
    }
    if (!bindingFound) throw new RangeError(`meshNode ${node} does not reference skin ${skeleton.skinIndex}.`);
    if (!invert4x4(pose.localMatrices, 0, pose.worldMatrices, node * MATRIX_STRIDE)) throw new Error(`meshNode ${node} world matrix is singular and cannot produce a mesh-local skin palette.`);
    hasMeshInverse = true;
  }
  for (let joint = 0; joint < skeleton.jointNodes.length; joint += 1) {
    const node = skeleton.jointNodes[joint];
    const targetOffset = joint * MATRIX_STRIDE;
    multiply4x4(palette, targetOffset, pose.worldMatrices, node * MATRIX_STRIDE, skeleton.inverseBindMatrices, targetOffset);
    if (hasMeshInverse) multiply4x4(palette, targetOffset, pose.localMatrices, 0, palette, targetOffset);
  }
  return sampleTime;
}

function cookNodes(nodes: unknown[], limits: ResolvedLimits): {
  nodeParents: Int32Array;
  nodeTopologicalOrder: Uint32Array;
  nodeTranslations: Float32Array;
  nodeRotations: Float32Array;
  nodeScales: Float32Array;
  nodeMatrices: Float32Array;
  nodeMatrixFlags: Uint8Array;
  outputBytes: number;
} {
  const count = nodes.length;
  const nodeParents = new Int32Array(count); nodeParents.fill(-1);
  const nodeTranslations = new Float32Array(count * 3);
  const nodeRotations = new Float32Array(count * 4);
  const nodeScales = new Float32Array(count * 3); nodeScales.fill(1);
  const nodeMatrices = new Float32Array(count * MATRIX_STRIDE);
  const nodeMatrixFlags = new Uint8Array(count);
  for (let nodeIndex = 0; nodeIndex < count; nodeIndex += 1) {
    const pointer = `/nodes/${nodeIndex}`;
    const node = record(nodes[nodeIndex], pointer, "node-type", "Node must be an object.");
    if (node.weights !== undefined) fail("morph-weights-unsupported", `${pointer}/weights`, "Morph weights are not supported by the skin-animation cooker.");
    const hasMatrix = node.matrix !== undefined;
    if (hasMatrix && (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined)) {
      fail("node-transform-conflict", `${pointer}/matrix`, "A glTF node matrix cannot be combined with translation, rotation, or scale.");
    }
    if (hasMatrix) {
      readNumberTuple(node.matrix, 16, `${pointer}/matrix`, nodeMatrices, nodeIndex * MATRIX_STRIDE);
      nodeMatrixFlags[nodeIndex] = 1;
    } else {
      if (node.translation !== undefined) readNumberTuple(node.translation, 3, `${pointer}/translation`, nodeTranslations, nodeIndex * 3);
      const rotationOffset = nodeIndex * 4;
      if (node.rotation !== undefined) readQuaternion(node.rotation, `${pointer}/rotation`, nodeRotations, rotationOffset);
      else nodeRotations[rotationOffset + 3] = 1;
      if (node.scale !== undefined) readNumberTuple(node.scale, 3, `${pointer}/scale`, nodeScales, nodeIndex * 3);
    }
    if (node.children !== undefined) {
      const children = array(node.children, `${pointer}/children`, "node-children-type", "Node children must be an array.");
      const seen = new Set<number>();
      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        const childPointer = `${pointer}/children/${childIndex}`;
        const child = arrayIndex(children[childIndex], count, childPointer, "node-child-index");
        if (child === nodeIndex) fail("node-self-parent", childPointer, `Node ${nodeIndex} cannot be its own child.`);
        if (seen.has(child)) fail("node-child-duplicate", childPointer, `Node ${child} is listed more than once by parent ${nodeIndex}.`);
        seen.add(child);
        if (nodeParents[child] !== -1) fail("node-multiple-parents", childPointer, `Node ${child} already has parent ${nodeParents[child]}.`);
        nodeParents[child] = nodeIndex;
      }
    }
  }
  const nodeTopologicalOrder = topologicalOrder(nodeParents);
  const outputBytes = addOutputBytes(0,
    nodeParents.byteLength + nodeTopologicalOrder.byteLength + nodeTranslations.byteLength + nodeRotations.byteLength
      + nodeScales.byteLength + nodeMatrices.byteLength + nodeMatrixFlags.byteLength,
    limits, "/nodes");
  return { nodeParents, nodeTopologicalOrder, nodeTranslations, nodeRotations, nodeScales, nodeMatrices, nodeMatrixFlags, outputBytes };
}

function cookSkinStreams(context: CookContext, meshes: unknown[]): CookedGltfSkinStreams[] {
  const output: CookedGltfSkinStreams[] = [];
  let primitiveCount = 0;
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    const meshPointer = `/meshes/${meshIndex}`;
    const mesh = record(meshes[meshIndex], meshPointer, "mesh-type", "Mesh must be an object.");
    if (mesh.weights !== undefined) fail("morph-weights-unsupported", `${meshPointer}/weights`, "Morph weights are not supported by the skin-animation cooker.");
    const primitives = array(mesh.primitives, `${meshPointer}/primitives`, "primitives-required", "Mesh primitives must be an array.");
    primitiveCount = checkedAdd(primitiveCount, primitives.length, context.limits.maxPrimitives, "/meshes", "primitive-count-limit", "Mesh primitives");
    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
      const pointer = `${meshPointer}/primitives/${primitiveIndex}`;
      const primitive = record(primitives[primitiveIndex], pointer, "primitive-type", "Mesh primitive must be an object.");
      if (primitive.targets !== undefined) fail("morph-targets-unsupported", `${pointer}/targets`, "Morph targets are not supported by the skin-animation cooker.");
      if (primitive.mode !== undefined && primitive.mode !== GLTF_TRIANGLES) fail("primitive-mode-unsupported", `${pointer}/mode`, `Only glTF TRIANGLES mode (${GLTF_TRIANGLES}) is supported.`);
      const attributes = record(primitive.attributes, `${pointer}/attributes`, "attributes-required", "Primitive attributes must be an object.");
      for (const semantic of Object.keys(attributes)) {
        if (semantic === "JOINTS_1" || semantic === "WEIGHTS_1" || /^(JOINTS|WEIGHTS)_[1-9][0-9]*$/.test(semantic)) {
          fail("extra-skin-influences-unsupported", `${pointer}/attributes/${escapePointer(semantic)}`, "Only JOINTS_0 and WEIGHTS_0 are supported.");
        }
      }
      const hasJoints = attributes.JOINTS_0 !== undefined;
      const hasWeights = attributes.WEIGHTS_0 !== undefined;
      if (!hasJoints && !hasWeights) continue;
      if (hasJoints !== hasWeights) fail("skin-stream-pair", `${pointer}/attributes`, "JOINTS_0 and WEIGHTS_0 must be provided together.");
      const jointAccessor = arrayIndex(attributes.JOINTS_0, context.accessors.length, `${pointer}/attributes/JOINTS_0`, "accessor-index");
      const weightAccessor = arrayIndex(attributes.WEIGHTS_0, context.accessors.length, `${pointer}/attributes/WEIGHTS_0`, "accessor-index");
      const joints = readJoints(context, jointAccessor);
      const weights = readWeights(context, weightAccessor);
      const vertexCount = joints.length / 4;
      enforceCount(vertexCount, context.limits.maxVertices, `${pointer}/attributes/JOINTS_0`, "vertex-count-limit", "vertices");
      if (weights.length / 4 !== vertexCount) fail("skin-stream-count-mismatch", `${pointer}/attributes/WEIGHTS_0`, "WEIGHTS_0 count must equal JOINTS_0 count.");
      if (attributes.POSITION !== undefined) {
        const positionAccessor = arrayIndex(attributes.POSITION, context.accessors.length, `${pointer}/attributes/POSITION`, "accessor-index");
        const layout = accessorLayout(context, positionAccessor, "VEC3", [GLTF_FLOAT], context.limits.maxVertices);
        if (layout.count !== vertexCount) fail("skin-stream-count-mismatch", `${pointer}/attributes/JOINTS_0`, "JOINTS_0 and WEIGHTS_0 count must equal POSITION count.");
      }
      output.push({ meshIndex, primitiveIndex, vertexCount, joints, weights });
    }
  }
  return output;
}

function cookSkeletons(context: CookContext, skins: unknown[], nodeCount: number): CookedGltfSkeleton[] {
  const output: CookedGltfSkeleton[] = [];
  for (let skinIndex = 0; skinIndex < skins.length; skinIndex += 1) {
    const pointer = `/skins/${skinIndex}`;
    const skin = record(skins[skinIndex], pointer, "skin-type", "Skin must be an object.");
    const jointsInput = array(skin.joints, `${pointer}/joints`, "skin-joints-required", "Skin joints must be a non-empty array.");
    if (jointsInput.length === 0) fail("skin-joints-empty", `${pointer}/joints`, "Skin joints must be non-empty.");
    enforceCount(jointsInput.length, context.limits.maxJointsPerSkin, `${pointer}/joints`, "joint-count-limit", "skin joints");
    const jointNodes = new Uint32Array(jointsInput.length);
    const seen = new Set<number>();
    for (let joint = 0; joint < jointsInput.length; joint += 1) {
      const node = arrayIndex(jointsInput[joint], nodeCount, `${pointer}/joints/${joint}`, "skin-joint-index");
      if (seen.has(node)) fail("skin-joint-duplicate", `${pointer}/joints/${joint}`, `Node ${node} appears more than once in this skin.`);
      seen.add(node); jointNodes[joint] = node;
    }
    const inverseBindMatrices = skin.inverseBindMatrices === undefined
      ? identityMatrices(jointsInput.length)
      : readInverseBindMatrices(context, arrayIndex(skin.inverseBindMatrices, context.accessors.length, `${pointer}/inverseBindMatrices`, "accessor-index"), jointsInput.length);
    const skeletonNode = skin.skeleton === undefined ? -1 : arrayIndex(skin.skeleton, nodeCount, `${pointer}/skeleton`, "skin-skeleton-index");
    const label = skin.name === undefined ? `skin-${skinIndex}` : text(skin.name, `${pointer}/name`, "skin-name", 256);
    output.push({ skinIndex, label, skeletonNode, jointNodes, inverseBindMatrices });
  }
  return output;
}

function cookBindings(
  nodes: unknown[], meshes: unknown[], skins: unknown[], streams: CookedGltfSkinStreams[], skeletons: CookedGltfSkeleton[],
): CookedGltfSkinBinding[] {
  const output: CookedGltfSkinBinding[] = [];
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const pointer = `/nodes/${nodeIndex}`;
    const node = record(nodes[nodeIndex], pointer, "node-type", "Node must be an object.");
    if (node.skin === undefined && node.mesh === undefined) continue;
    if (node.skin === undefined || node.mesh === undefined) {
      if (node.skin !== undefined) fail("skin-node-mesh-required", `${pointer}/mesh`, "A node with skin must also reference a mesh.");
      continue;
    }
    const skinIndex = arrayIndex(node.skin, skins.length, `${pointer}/skin`, "skin-index");
    const meshIndex = arrayIndex(node.mesh, meshes.length, `${pointer}/mesh`, "mesh-index");
    const mesh = record(meshes[meshIndex], `/meshes/${meshIndex}`, "mesh-type", "Mesh must be an object.");
    const primitives = array(mesh.primitives, `/meshes/${meshIndex}/primitives`, "primitives-required", "Mesh primitives must be an array.");
    const skeleton = skeletons[skinIndex];
    for (let primitive = 0; primitive < primitives.length; primitive += 1) {
      const stream = streams.find((item) => item.meshIndex === meshIndex && item.primitiveIndex === primitive);
      if (!stream) fail("skin-streams-required", `/meshes/${meshIndex}/primitives/${primitive}/attributes`, `Mesh ${meshIndex} is used by skin ${skinIndex} and requires JOINTS_0 and WEIGHTS_0.`);
      let maximum = 0;
      for (const joint of stream.joints) maximum = Math.max(maximum, joint);
      if (maximum >= skeleton.jointNodes.length) fail("joint-index-out-of-range", `/meshes/${meshIndex}/primitives/${primitive}/attributes/JOINTS_0`, `Joint index ${maximum} exceeds skin ${skinIndex} joint count ${skeleton.jointNodes.length}.`);
    }
    output.push({ nodeIndex, meshIndex, skinIndex });
  }
  return output;
}

function cookClips(context: CookContext, animations: unknown[], nodeMatrixFlags: Uint8Array): CookedGltfAnimationClip[] {
  const output: CookedGltfAnimationClip[] = [];
  let totalChannels = 0, totalKeys = 0;
  for (let animationIndex = 0; animationIndex < animations.length; animationIndex += 1) {
    const pointer = `/animations/${animationIndex}`;
    const animation = record(animations[animationIndex], pointer, "animation-type", "Animation must be an object.");
    const samplers = array(animation.samplers, `${pointer}/samplers`, "animation-samplers-required", "Animation samplers must be an array.");
    const channels = array(animation.channels, `${pointer}/channels`, "animation-channels-required", "Animation channels must be an array.");
    totalChannels = checkedAdd(totalChannels, channels.length, context.limits.maxChannels, "/animations", "channel-count-limit", "Animation channels");
    const channelTargetNodes = new Uint32Array(channels.length);
    const channelPaths = new Uint8Array(channels.length);
    const channelInterpolations = new Uint8Array(channels.length);
    const channelKeyOffsets = new Uint32Array(channels.length);
    const channelKeyCounts = new Uint32Array(channels.length);
    const channelValueOffsets = new Uint32Array(channels.length);
    const timeChunks: Float32Array[] = [], valueChunks: Float32Array[] = [];
    const targets = new Set<string>();
    let timeCount = 0, valueCount = 0, duration = 0;
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const channelPointer = `${pointer}/channels/${channelIndex}`;
      const channel = record(channels[channelIndex], channelPointer, "animation-channel-type", "Animation channel must be an object.");
      const samplerIndex = arrayIndex(channel.sampler, samplers.length, `${channelPointer}/sampler`, "animation-sampler-index");
      const target = record(channel.target, `${channelPointer}/target`, "animation-target-required", "Animation channel target must be an object.");
      if (target.path === "weights") fail("morph-animation-unsupported", `${channelPointer}/target/path`, "Morph-weight animation is not supported.");
      const path = animationPath(target.path, `${channelPointer}/target/path`);
      const node = arrayIndex(target.node, nodeMatrixFlags.length, `${channelPointer}/target/node`, "animation-target-node");
      if (nodeMatrixFlags[node] !== 0) fail("matrix-node-animation-unsupported", `${channelPointer}/target/node`, `Node ${node} uses matrix and cannot be targeted by a TRS channel.`);
      const targetKey = `${node}:${path}`;
      if (targets.has(targetKey)) fail("animation-target-duplicate", `${channelPointer}/target`, `Node ${node} path ${String(target.path)} is targeted more than once in this animation.`);
      targets.add(targetKey);
      const samplerPointer = `${pointer}/samplers/${samplerIndex}`;
      const sampler = record(samplers[samplerIndex], samplerPointer, "animation-sampler-type", "Animation sampler must be an object.");
      const interpolation = animationInterpolation(sampler.interpolation, `${samplerPointer}/interpolation`);
      const input = readAnimationInput(context, arrayIndex(sampler.input, context.accessors.length, `${samplerPointer}/input`, "accessor-index"));
      const components = path === GLTF_ANIMATION_PATH_ROTATION ? 4 : 3;
      const values = readAnimationOutput(context, arrayIndex(sampler.output, context.accessors.length, `${samplerPointer}/output`, "accessor-index"), components, path);
      if (values.length !== input.length * components) fail("animation-sampler-count-mismatch", `${samplerPointer}/output`, `Animation output count must equal input count ${input.length}.`);
      totalKeys = checkedAdd(totalKeys, input.length, context.limits.maxKeyframes, "/animations", "keyframe-count-limit", "Animation keyframes");
      channelTargetNodes[channelIndex] = node;
      channelPaths[channelIndex] = path;
      channelInterpolations[channelIndex] = interpolation;
      channelKeyOffsets[channelIndex] = timeCount;
      channelKeyCounts[channelIndex] = input.length;
      channelValueOffsets[channelIndex] = valueCount;
      timeChunks.push(input); valueChunks.push(values);
      timeCount += input.length; valueCount += values.length;
      duration = Math.max(duration, input[input.length - 1]);
    }
    const keyframeTimes = concatenate(timeChunks, timeCount);
    const keyframeValues = concatenate(valueChunks, valueCount);
    const label = animation.name === undefined ? `animation-${animationIndex}` : text(animation.name, `${pointer}/name`, "animation-name", 256);
    output.push({
      animationIndex, label, duration, channelTargetNodes, channelPaths, channelInterpolations,
      channelKeyOffsets, channelKeyCounts, channelValueOffsets, keyframeTimes, keyframeValues,
    });
  }
  return output;
}

function sampleChannel(clip: CookedGltfAnimationClip, channel: number, time: number, pose: GltfPoseOutput): void {
  const keyOffset = clip.channelKeyOffsets[channel], keyCount = clip.channelKeyCounts[channel];
  let left = 0;
  if (keyCount > 1) {
    let low = 0, high = keyCount - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (clip.keyframeTimes[keyOffset + middle] <= time) { left = middle; low = middle + 1; }
      else high = middle - 1;
    }
  }
  const right = Math.min(left + 1, keyCount - 1);
  const path = clip.channelPaths[channel], components = path === GLTF_ANIMATION_PATH_ROTATION ? 4 : 3;
  const valueOffset = clip.channelValueOffsets[channel];
  let alpha = 0;
  if (right !== left && clip.channelInterpolations[channel] === GLTF_ANIMATION_INTERPOLATION_LINEAR) {
    const leftTime = clip.keyframeTimes[keyOffset + left], rightTime = clip.keyframeTimes[keyOffset + right];
    alpha = (time - leftTime) / (rightTime - leftTime);
  }
  const targetNode = clip.channelTargetNodes[channel];
  if (path === GLTF_ANIMATION_PATH_ROTATION) {
    slerpQuaternion(pose.rotations, targetNode * 4, clip.keyframeValues, valueOffset + left * components, valueOffset + right * components, alpha);
  } else {
    const target = path === GLTF_ANIMATION_PATH_TRANSLATION ? pose.translations : pose.scales;
    const targetOffset = targetNode * 3;
    for (let component = 0; component < 3; component += 1) {
      const a = clip.keyframeValues[valueOffset + left * components + component];
      const b = clip.keyframeValues[valueOffset + right * components + component];
      target[targetOffset + component] = a + (b - a) * alpha;
    }
  }
}

function readJoints(context: CookContext, accessorIndex: number): Uint8Array | Uint16Array {
  const layout = accessorLayout(context, accessorIndex, "VEC4", [GLTF_UNSIGNED_BYTE, GLTF_UNSIGNED_SHORT], context.limits.maxVertices);
  if (layout.normalized) fail("joints-normalized", `${layout.pointer}/normalized`, "JOINTS_0 must not be normalized.");
  const output = layout.componentType === GLTF_UNSIGNED_BYTE ? new Uint8Array(layout.count * 4) : new Uint16Array(layout.count * 4);
  for (let element = 0; element < layout.count; element += 1) {
    for (let component = 0; component < 4; component += 1) output[element * 4 + component] = readComponent(layout, element, component);
  }
  return output;
}

function readWeights(context: CookContext, accessorIndex: number): Float32Array {
  const layout = accessorLayout(context, accessorIndex, "VEC4", [GLTF_FLOAT, GLTF_UNSIGNED_BYTE, GLTF_UNSIGNED_SHORT], context.limits.maxVertices);
  if (layout.componentType !== GLTF_FLOAT && !layout.normalized) fail("weights-normalized-required", `${layout.pointer}/normalized`, "Integer WEIGHTS_0 accessors must set normalized to true.");
  if (layout.componentType === GLTF_FLOAT && layout.normalized) fail("weights-float-normalized", `${layout.pointer}/normalized`, "FLOAT WEIGHTS_0 accessors cannot be normalized.");
  const output = new Float32Array(layout.count * 4);
  for (let element = 0; element < layout.count; element += 1) {
    let total = 0;
    for (let component = 0; component < 4; component += 1) {
      const value = readNormalizedComponent(layout, element, component);
      if (!Number.isFinite(value) || value < 0) fail("weights-invalid", layout.pointer, `WEIGHTS_0 element ${element} contains an invalid weight.`);
      output[element * 4 + component] = value; total += value;
    }
    if (!(total > 0)) fail("weights-zero", layout.pointer, `WEIGHTS_0 element ${element} has zero total influence.`);
    for (let component = 0; component < 4; component += 1) output[element * 4 + component] /= total;
  }
  return output;
}

function readInverseBindMatrices(context: CookContext, accessorIndex: number, jointCount: number): Float32Array {
  const layout = accessorLayout(context, accessorIndex, "MAT4", [GLTF_FLOAT], context.limits.maxJointsPerSkin);
  if (layout.normalized) fail("inverse-bind-normalized", `${layout.pointer}/normalized`, "inverseBindMatrices cannot be normalized.");
  if (layout.count !== jointCount) fail("inverse-bind-count", layout.pointer, `inverseBindMatrices count ${layout.count} must equal joint count ${jointCount}.`);
  return readFloatLayout(layout);
}

function readAnimationInput(context: CookContext, accessorIndex: number): Float32Array {
  const layout = accessorLayout(context, accessorIndex, "SCALAR", [GLTF_FLOAT], context.limits.maxKeyframes);
  if (layout.normalized) fail("animation-input-normalized", `${layout.pointer}/normalized`, "Animation input times cannot be normalized.");
  const output = readFloatLayout(layout);
  for (let index = 0; index < output.length; index += 1) {
    if (!Number.isFinite(output[index]) || output[index] < 0) fail("animation-input-time", layout.pointer, `Animation input time ${index} must be finite and non-negative.`);
    if (index > 0 && output[index] <= output[index - 1]) fail("animation-input-order", layout.pointer, "Animation input times must be strictly increasing.");
  }
  return output;
}

function readAnimationOutput(context: CookContext, accessorIndex: number, components: number, path: number): Float32Array {
  const layout = accessorLayout(context, accessorIndex, components === 4 ? "VEC4" : "VEC3", [GLTF_FLOAT], context.limits.maxKeyframes);
  if (layout.normalized) fail("animation-output-normalized", `${layout.pointer}/normalized`, "Animation output values cannot be normalized.");
  const output = readFloatLayout(layout);
  if (path === GLTF_ANIMATION_PATH_ROTATION) {
    for (let key = 0; key < layout.count; key += 1) normalizeQuaternion(output, key * 4, layout.pointer);
  }
  return output;
}

function accessorLayout(
  context: CookContext,
  accessorIndex: number,
  expectedType: string,
  componentTypes: readonly number[],
  maximumCount: number,
): AccessorLayout {
  const pointer = `/accessors/${accessorIndex}`;
  const accessor = record(context.accessors[accessorIndex], pointer, "accessor-type", "Accessor must be an object.");
  rejectExtensions(accessor, pointer);
  if (accessor.sparse !== undefined) fail("sparse-accessor-unsupported", `${pointer}/sparse`, "Sparse accessors are not supported.");
  if (accessor.type !== expectedType) fail("accessor-element-type", `${pointer}/type`, `Accessor type must be ${expectedType}.`);
  const componentType = uint(accessor.componentType, `${pointer}/componentType`, "accessor-component-type", 1, 65_535);
  if (!componentTypes.includes(componentType)) fail("accessor-component-type", `${pointer}/componentType`, `Accessor componentType ${componentType} is unsupported here.`);
  const normalized = accessor.normalized === true;
  if (accessor.normalized !== undefined && typeof accessor.normalized !== "boolean") fail("accessor-normalized", `${pointer}/normalized`, "Accessor normalized must be boolean.");
  const count = uint(accessor.count, `${pointer}/count`, "accessor-count", 1, maximumCount);
  const viewIndex = arrayIndex(accessor.bufferView, context.bufferViews.length, `${pointer}/bufferView`, "buffer-view-index");
  const viewPointer = `/bufferViews/${viewIndex}`;
  const view = record(context.bufferViews[viewIndex], viewPointer, "buffer-view-type", "bufferView must be an object.");
  rejectExtensions(view, viewPointer);
  const bufferIndex = arrayIndex(view.buffer, context.buffers.length, `${viewPointer}/buffer`, "buffer-index");
  const viewOffset = optionalUint(view.byteOffset, 0, `${viewPointer}/byteOffset`, "buffer-view-offset", 0, context.limits.maxBufferBytes);
  const viewLength = uint(view.byteLength, `${viewPointer}/byteLength`, "buffer-view-length", 1, context.limits.maxBufferBytes);
  if (viewOffset + viewLength > context.buffers[bufferIndex].byteLength) fail("buffer-view-out-of-bounds", viewPointer, "bufferView exceeds its resolved buffer.");
  const componentBytes = componentByteSize(componentType), components = typeComponents(expectedType);
  const elementBytes = componentBytes * components;
  const stride = optionalUint(view.byteStride, elementBytes, `${viewPointer}/byteStride`, "buffer-view-stride", elementBytes, 252);
  if (stride % componentBytes !== 0) fail("buffer-view-stride", `${viewPointer}/byteStride`, `byteStride must be aligned to ${componentBytes} bytes.`);
  const accessorOffset = optionalUint(accessor.byteOffset, 0, `${pointer}/byteOffset`, "accessor-offset", 0, viewLength);
  if ((viewOffset + accessorOffset) % componentBytes !== 0) fail("accessor-alignment", `${pointer}/byteOffset`, `Accessor data must be aligned to ${componentBytes} bytes.`);
  const required = accessorOffset + (count - 1) * stride + elementBytes;
  if (!Number.isSafeInteger(required) || required > viewLength) fail("accessor-out-of-bounds", pointer, `Accessor requires ${required} bytes inside a ${viewLength}-byte bufferView.`);
  return { accessor, pointer, count, componentType, componentBytes, components, normalized, bytes: context.buffers[bufferIndex], start: viewOffset + accessorOffset, stride };
}

function validateBuffers(declarations: unknown[], sources: readonly (ArrayBuffer | ArrayBufferView)[], limits: ResolvedLimits): Uint8Array[] {
  const output: Uint8Array[] = [];
  let total = 0;
  for (let index = 0; index < declarations.length; index += 1) {
    const pointer = `/buffers/${index}`;
    const declaration = record(declarations[index], pointer, "buffer-type", "Buffer declaration must be an object.");
    const declaredLength = uint(declaration.byteLength, `${pointer}/byteLength`, "buffer-byte-length", 1, limits.maxBufferBytes);
    const bytes = viewBytes(sources[index], pointer);
    if (bytes.byteLength < declaredLength) fail("buffer-too-short", pointer, `Resolved buffer has ${bytes.byteLength} bytes but declares ${declaredLength}.`);
    total = checkedAdd(total, bytes.byteLength, limits.maxBufferBytes, "/buffers", "buffer-byte-limit", "Combined resolved buffers");
    output.push(bytes);
  }
  return output;
}

function validateRelevantExtensions(context: CookContext, nodes: unknown[], meshes: unknown[], skins: unknown[], animations: unknown[]): void {
  for (let index = 0; index < nodes.length; index += 1) rejectExtensions(record(nodes[index], `/nodes/${index}`, "node-type", "Node must be an object."), `/nodes/${index}`);
  for (let index = 0; index < skins.length; index += 1) rejectExtensions(record(skins[index], `/skins/${index}`, "skin-type", "Skin must be an object."), `/skins/${index}`);
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    const mesh = record(meshes[meshIndex], `/meshes/${meshIndex}`, "mesh-type", "Mesh must be an object."); rejectExtensions(mesh, `/meshes/${meshIndex}`);
    const primitives = array(mesh.primitives, `/meshes/${meshIndex}/primitives`, "primitives-required", "Mesh primitives must be an array.");
    for (let primitive = 0; primitive < primitives.length; primitive += 1) rejectExtensions(record(primitives[primitive], `/meshes/${meshIndex}/primitives/${primitive}`, "primitive-type", "Primitive must be an object."), `/meshes/${meshIndex}/primitives/${primitive}`);
  }
  for (let animationIndex = 0; animationIndex < animations.length; animationIndex += 1) {
    const animation = record(animations[animationIndex], `/animations/${animationIndex}`, "animation-type", "Animation must be an object."); rejectExtensions(animation, `/animations/${animationIndex}`);
    const samplers = array(animation.samplers, `/animations/${animationIndex}/samplers`, "animation-samplers-required", "Animation samplers must be an array.");
    const channels = array(animation.channels, `/animations/${animationIndex}/channels`, "animation-channels-required", "Animation channels must be an array.");
    for (let index = 0; index < samplers.length; index += 1) rejectExtensions(record(samplers[index], `/animations/${animationIndex}/samplers/${index}`, "animation-sampler-type", "Animation sampler must be an object."), `/animations/${animationIndex}/samplers/${index}`);
    for (let index = 0; index < channels.length; index += 1) {
      const channel = record(channels[index], `/animations/${animationIndex}/channels/${index}`, "animation-channel-type", "Animation channel must be an object."); rejectExtensions(channel, `/animations/${animationIndex}/channels/${index}`);
      rejectExtensions(record(channel.target, `/animations/${animationIndex}/channels/${index}/target`, "animation-target-required", "Animation target must be an object."), `/animations/${animationIndex}/channels/${index}/target`);
    }
  }
  void context;
}

function validateAsset(root: JsonRecord): void {
  const asset = record(root.asset, "/asset", "asset-required", "glTF asset metadata is required.");
  if (asset.version !== "2.0") fail("asset-version", "/asset/version", "Only glTF asset version 2.0 is supported.");
  if (asset.minVersion !== undefined && asset.minVersion !== "2.0") fail("asset-min-version", "/asset/minVersion", `Unsupported glTF minimum version ${String(asset.minVersion)}.`);
}

function validateRequiredExtensions(root: JsonRecord): void {
  if (root.extensionsRequired === undefined) return;
  const extensions = array(root.extensionsRequired, "/extensionsRequired", "extensions-required-type", "extensionsRequired must be an array.");
  if (extensions.length > 0) {
    text(extensions[0], "/extensionsRequired/0", "extension-name", 256);
    fail("required-extension-unsupported", "/extensionsRequired/0", `Required extension ${JSON.stringify(extensions[0])} is not supported by this cooker.`);
  }
}

function rejectExtensions(value: JsonRecord, pointer: string): void {
  if (value.extensions === undefined) return;
  const extensions = record(value.extensions, `${pointer}/extensions`, "extensions-type", "extensions must be an object.");
  const names = Object.keys(extensions).sort();
  if (names.length > 0) fail("extension-unsupported", `${pointer}/extensions/${escapePointer(names[0])}`, `Extension ${names[0]} is not supported here.`);
}

function animationPath(value: unknown, pointer: string): number {
  if (value === "translation") return GLTF_ANIMATION_PATH_TRANSLATION;
  if (value === "rotation") return GLTF_ANIMATION_PATH_ROTATION;
  if (value === "scale") return GLTF_ANIMATION_PATH_SCALE;
  fail("animation-path-unsupported", pointer, `Animation target path ${String(value)} is unsupported.`);
}

function animationInterpolation(value: unknown, pointer: string): number {
  if (value === undefined || value === "LINEAR") return GLTF_ANIMATION_INTERPOLATION_LINEAR;
  if (value === "STEP") return GLTF_ANIMATION_INTERPOLATION_STEP;
  if (value === "CUBICSPLINE") fail("cubic-spline-unsupported", pointer, "CUBICSPLINE animation interpolation is not supported.");
  fail("animation-interpolation-unsupported", pointer, `Animation interpolation ${String(value)} is unsupported.`);
}

function readFloatLayout(layout: AccessorLayout): Float32Array {
  const output = new Float32Array(layout.count * layout.components);
  for (let element = 0; element < layout.count; element += 1) {
    for (let component = 0; component < layout.components; component += 1) {
      const value = readComponent(layout, element, component);
      if (!Number.isFinite(value)) fail("accessor-non-finite", layout.pointer, `Accessor element ${element} contains a non-finite value.`);
      output[element * layout.components + component] = value;
    }
  }
  return output;
}

function readComponent(layout: AccessorLayout, element: number, component: number): number {
  const offset = layout.start + element * layout.stride + component * layout.componentBytes;
  const view = new DataView(layout.bytes.buffer, layout.bytes.byteOffset, layout.bytes.byteLength);
  if (layout.componentType === GLTF_FLOAT) return view.getFloat32(offset, true);
  if (layout.componentType === GLTF_BYTE) return view.getInt8(offset);
  if (layout.componentType === GLTF_UNSIGNED_BYTE) return view.getUint8(offset);
  if (layout.componentType === GLTF_SHORT) return view.getInt16(offset, true);
  if (layout.componentType === GLTF_UNSIGNED_SHORT) return view.getUint16(offset, true);
  fail("accessor-component-type", layout.pointer, `Unsupported componentType ${layout.componentType}.`);
}

function readNormalizedComponent(layout: AccessorLayout, element: number, component: number): number {
  const value = readComponent(layout, element, component);
  if (!layout.normalized || layout.componentType === GLTF_FLOAT) return value;
  if (layout.componentType === GLTF_UNSIGNED_BYTE) return value / 255;
  if (layout.componentType === GLTF_UNSIGNED_SHORT) return value / 65_535;
  if (layout.componentType === GLTF_BYTE) return Math.max(value / 127, -1);
  if (layout.componentType === GLTF_SHORT) return Math.max(value / 32_767, -1);
  return value;
}

function componentByteSize(type: number): number {
  if (type === GLTF_BYTE || type === GLTF_UNSIGNED_BYTE) return 1;
  if (type === GLTF_SHORT || type === GLTF_UNSIGNED_SHORT) return 2;
  if (type === GLTF_FLOAT) return 4;
  fail("accessor-component-type", "/accessors", `Unsupported componentType ${type}.`);
}

function typeComponents(type: string): number {
  if (type === "SCALAR") return 1;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  if (type === "MAT4") return 16;
  fail("accessor-element-type", "/accessors", `Unsupported accessor type ${type}.`);
}

function identityMatrices(count: number): Float32Array {
  const output = new Float32Array(count * MATRIX_STRIDE);
  for (let index = 0; index < count; index += 1) {
    const offset = index * MATRIX_STRIDE;
    output[offset] = 1; output[offset + 5] = 1; output[offset + 10] = 1; output[offset + 15] = 1;
  }
  return output;
}

function topologicalOrder(parents: Int32Array): Uint32Array {
  const count = parents.length, childCounts = new Uint32Array(count), offsets = new Uint32Array(count + 1);
  let roots = 0;
  for (let node = 0; node < count; node += 1) {
    const parent = parents[node];
    if (parent === -1) roots += 1;
    else childCounts[parent] += 1;
  }
  for (let node = 0; node < count; node += 1) offsets[node + 1] = offsets[node] + childCounts[node];
  const cursors = offsets.slice(0, count), children = new Uint32Array(count - roots);
  for (let node = 0; node < count; node += 1) {
    const parent = parents[node];
    if (parent !== -1) children[cursors[parent]++] = node;
  }
  const output = new Uint32Array(count);
  let read = 0, write = 0;
  for (let node = 0; node < count; node += 1) if (parents[node] === -1) output[write++] = node;
  while (read < write) {
    const node = output[read++];
    for (let child = offsets[node]; child < offsets[node + 1]; child += 1) output[write++] = children[child];
  }
  if (write !== count) fail("node-cycle", "/nodes", "Node hierarchy contains a cycle.");
  return output;
}

function composeTrs(target: Float32Array, offset: number, translations: Float32Array, t: number, rotations: Float32Array, r: number, scales: Float32Array, s: number): void {
  const x = rotations[r], y = rotations[r + 1], z = rotations[r + 2], w = rotations[r + 3];
  const sx = scales[s], sy = scales[s + 1], sz = scales[s + 2];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  target[offset] = (1 - (yy + zz)) * sx; target[offset + 1] = (xy + wz) * sx; target[offset + 2] = (xz - wy) * sx; target[offset + 3] = 0;
  target[offset + 4] = (xy - wz) * sy; target[offset + 5] = (1 - (xx + zz)) * sy; target[offset + 6] = (yz + wx) * sy; target[offset + 7] = 0;
  target[offset + 8] = (xz + wy) * sz; target[offset + 9] = (yz - wx) * sz; target[offset + 10] = (1 - (xx + yy)) * sz; target[offset + 11] = 0;
  target[offset + 12] = translations[t]; target[offset + 13] = translations[t + 1]; target[offset + 14] = translations[t + 2]; target[offset + 15] = 1;
}

function multiply4x4(target: Float32Array, targetOffset: number, a: Float32Array, aOffset: number, b: Float32Array, bOffset: number): void {
  for (let column = 0; column < 4; column += 1) {
    const b0 = b[bOffset + column * 4], b1 = b[bOffset + column * 4 + 1], b2 = b[bOffset + column * 4 + 2], b3 = b[bOffset + column * 4 + 3];
    target[targetOffset + column * 4] = a[aOffset] * b0 + a[aOffset + 4] * b1 + a[aOffset + 8] * b2 + a[aOffset + 12] * b3;
    target[targetOffset + column * 4 + 1] = a[aOffset + 1] * b0 + a[aOffset + 5] * b1 + a[aOffset + 9] * b2 + a[aOffset + 13] * b3;
    target[targetOffset + column * 4 + 2] = a[aOffset + 2] * b0 + a[aOffset + 6] * b1 + a[aOffset + 10] * b2 + a[aOffset + 14] * b3;
    target[targetOffset + column * 4 + 3] = a[aOffset + 3] * b0 + a[aOffset + 7] * b1 + a[aOffset + 11] * b2 + a[aOffset + 15] * b3;
  }
}

function invert4x4(target: Float32Array, targetOffset: number, source: Float32Array, sourceOffset: number): boolean {
  const a00 = source[sourceOffset], a01 = source[sourceOffset + 1], a02 = source[sourceOffset + 2], a03 = source[sourceOffset + 3];
  const a10 = source[sourceOffset + 4], a11 = source[sourceOffset + 5], a12 = source[sourceOffset + 6], a13 = source[sourceOffset + 7];
  const a20 = source[sourceOffset + 8], a21 = source[sourceOffset + 9], a22 = source[sourceOffset + 10], a23 = source[sourceOffset + 11];
  const a30 = source[sourceOffset + 12], a31 = source[sourceOffset + 13], a32 = source[sourceOffset + 14], a33 = source[sourceOffset + 15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) return false;
  determinant = 1 / determinant;
  target[targetOffset] = (a11 * b11 - a12 * b10 + a13 * b09) * determinant;
  target[targetOffset + 1] = (a02 * b10 - a01 * b11 - a03 * b09) * determinant;
  target[targetOffset + 2] = (a31 * b05 - a32 * b04 + a33 * b03) * determinant;
  target[targetOffset + 3] = (a22 * b04 - a21 * b05 - a23 * b03) * determinant;
  target[targetOffset + 4] = (a12 * b08 - a10 * b11 - a13 * b07) * determinant;
  target[targetOffset + 5] = (a00 * b11 - a02 * b08 + a03 * b07) * determinant;
  target[targetOffset + 6] = (a32 * b02 - a30 * b05 - a33 * b01) * determinant;
  target[targetOffset + 7] = (a20 * b05 - a22 * b02 + a23 * b01) * determinant;
  target[targetOffset + 8] = (a10 * b10 - a11 * b08 + a13 * b06) * determinant;
  target[targetOffset + 9] = (a01 * b08 - a00 * b10 - a03 * b06) * determinant;
  target[targetOffset + 10] = (a30 * b04 - a31 * b02 + a33 * b00) * determinant;
  target[targetOffset + 11] = (a21 * b02 - a20 * b04 - a23 * b00) * determinant;
  target[targetOffset + 12] = (a11 * b07 - a10 * b09 - a12 * b06) * determinant;
  target[targetOffset + 13] = (a00 * b09 - a01 * b07 + a02 * b06) * determinant;
  target[targetOffset + 14] = (a31 * b01 - a30 * b03 - a32 * b00) * determinant;
  target[targetOffset + 15] = (a20 * b03 - a21 * b01 + a22 * b00) * determinant;
  return true;
}

function slerpQuaternion(target: Float32Array, targetOffset: number, values: Float32Array, left: number, right: number, alpha: number): void {
  let bx = values[right], by = values[right + 1], bz = values[right + 2], bw = values[right + 3];
  const ax = values[left], ay = values[left + 1], az = values[left + 2], aw = values[left + 3];
  let cosine = ax * bx + ay * by + az * bz + aw * bw;
  if (cosine < 0) { cosine = -cosine; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let leftWeight = 1 - alpha, rightWeight = alpha;
  if (1 - cosine > 1e-6) {
    const angle = Math.acos(Math.min(1, cosine)), sine = Math.sin(angle);
    leftWeight = Math.sin((1 - alpha) * angle) / sine; rightWeight = Math.sin(alpha * angle) / sine;
  }
  target[targetOffset] = ax * leftWeight + bx * rightWeight;
  target[targetOffset + 1] = ay * leftWeight + by * rightWeight;
  target[targetOffset + 2] = az * leftWeight + bz * rightWeight;
  target[targetOffset + 3] = aw * leftWeight + bw * rightWeight;
  normalizeQuaternion(target, targetOffset, "evaluated rotation");
}

function normalizeQuaternion(values: Float32Array, offset: number, pointer: string): void {
  const length = Math.hypot(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  if (!Number.isFinite(length) || length <= 1e-12) fail("rotation-invalid", pointer, "Rotation quaternion must be finite and non-zero.");
  const inverse = 1 / length;
  values[offset] *= inverse; values[offset + 1] *= inverse; values[offset + 2] *= inverse; values[offset + 3] *= inverse;
}

function resolveSampleTime(time: number, duration: number, loop: boolean): number {
  if (duration <= 0) return 0;
  if (!loop) return Math.min(duration, Math.max(0, time));
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

function validatePoseOutput(rig: CookedGltfRig, pose: GltfPoseOutput): void {
  validatePoseArray(pose.translations, rig.nodeCount * 3, "translations");
  validatePoseArray(pose.rotations, rig.nodeCount * 4, "rotations");
  validatePoseArray(pose.scales, rig.nodeCount * 3, "scales");
  validatePoseArray(pose.localMatrices, rig.nodeCount * 16, "localMatrices");
  validatePoseArray(pose.worldMatrices, rig.nodeCount * 16, "worldMatrices");
}

function validatePoseArray(value: Float32Array, expected: number, label: string): void {
  if (!(value instanceof Float32Array) || value.length !== expected) throw new RangeError(`pose.${label} must be a Float32Array with exactly ${expected} values.`);
}

function assertDistinctPoseStorage(pose: GltfPoseOutput, palette: Float32Array): void {
  const p = palette.buffer, t = pose.translations.buffer, r = pose.rotations.buffer, s = pose.scales.buffer;
  const l = pose.localMatrices.buffer, w = pose.worldMatrices.buffer;
  if (p === t || p === r || p === s || p === l || p === w) throw new Error("palette storage must not alias pose storage.");
  if (t === r || t === s || t === l || t === w || r === s || r === l || r === w || s === l || s === w || l === w) {
    throw new Error("pose arrays must use distinct storage.");
  }
}

function requireNode(rig: CookedGltfRig, value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= rig.nodeCount) throw new RangeError(`${label} ${value} is outside node count ${rig.nodeCount}.`);
  return value;
}

function requireIndex<T>(values: readonly T[], index: number, label: string): T {
  if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) throw new RangeError(`${label} index ${index} is outside count ${values.length}.`);
  return values[index];
}

function readNumberTuple(value: unknown, count: number, pointer: string, target: Float32Array, offset: number): void {
  const input = array(value, pointer, "number-tuple", `Expected an array with ${count} numbers.`);
  if (input.length !== count) fail("number-tuple", pointer, `Expected exactly ${count} numbers.`);
  for (let index = 0; index < count; index += 1) {
    const component = input[index];
    if (typeof component !== "number" || !Number.isFinite(component)) fail("node-transform-number", `${pointer}/${index}`, "Node transform values must be finite numbers.");
    target[offset + index] = component;
  }
}

function readQuaternion(value: unknown, pointer: string, target: Float32Array, offset: number): void {
  readNumberTuple(value, 4, pointer, target, offset);
  normalizeQuaternion(target, offset, pointer);
}

function concatenate(chunks: Float32Array[], total: number): Float32Array {
  const output = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function copy16(target: Float32Array, targetOffset: number, source: Float32Array, sourceOffset: number): void {
  for (let index = 0; index < 16; index += 1) target[targetOffset + index] = source[sourceOffset + index];
}

function addOutputBytes(current: number, addition: number, limits: ResolvedLimits, pointer: string): number {
  return checkedAdd(current, addition, limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked output bytes");
}

function checkedAdd(current: number, addition: number, maximum: number, pointer: string, code: string, label: string): number {
  const result = current + addition;
  if (!Number.isSafeInteger(result) || result > maximum) fail(code, pointer, `${label} exceed limit ${maximum}.`);
  return result;
}

function enforceCount(value: number, maximum: number, pointer: string, code: string, label: string): void {
  if (value > maximum) fail(code, pointer, `${label} count ${value} exceeds limit ${maximum}.`);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown, pointer: string, code: string, message: string): JsonRecord {
  if (!isJsonRecord(value)) fail(code, pointer, message);
  return value;
}

function array(value: unknown, pointer: string, code: string, message: string): unknown[] {
  if (!Array.isArray(value)) fail(code, pointer, message);
  return value;
}

function text(value: unknown, pointer: string, code: string, maximum: number): string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail(code, pointer, `Expected non-empty text no larger than ${maximum} bytes without control characters.`);
  return value;
}

function uint(value: unknown, pointer: string, code: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, pointer, `Expected an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function optionalUint(value: unknown, fallback: number, pointer: string, code: string, minimum: number, maximum: number): number {
  return value === undefined ? fallback : uint(value, pointer, code, minimum, maximum);
}

function arrayIndex(value: unknown, length: number, pointer: string, code: string): number {
  if (length <= 0) fail(code, pointer, "Referenced array is empty.");
  return uint(value, pointer, code, 0, length - 1);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be finite; received ${String(value)}.`);
  return value;
}

function viewBytes(value: ArrayBuffer | ArrayBufferView, pointer: string): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail("buffer-source-type", pointer, "Buffer source must be an ArrayBuffer or typed-array view.");
}

function fail(code: string, pointer: string, message: string): never {
  throw createGltfRigFailure(code, pointer, message);
}

function toDiagnostic(cause: unknown, fallbackPointer: string): GltfSkinAnimationDiagnostic {
  if (isGltfRigFailure(cause)) return { severity: "error", code: cause.code, pointer: cause.pointer, message: cause.message };
  return { severity: "error", code: "internal-validation-error", pointer: fallbackPointer, message: cause instanceof Error ? cause.message : String(cause) };
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
