import {
  T3_HUMANOID_PRESET,
  T3_RIG_MAPPER_VERSION,
  T3_RIG_SCHEMA_VERSION,
  assertSourceRigDescriptor,
  createEmptyT3RigSemanticMap,
  createRigBinding,
  humanoidSemantics,
  requiredHumanoidSemantics,
  type HumanoidSemantic,
  type RigDiagnostic,
  type SourceBoneDescriptor,
  type SourceRigDescriptor,
  type T3RigBoneBinding,
  type T3RigDocument,
  type T3RigSemanticMap,
} from "./rig.ts";
import { multiplyQuaternions, rotateVector3ByQuaternion } from "./math.ts";

export type HumanoidMapperProfile = "auto" | "mixamo" | "vrm" | "gltf";

export type AutoMapHumanoidRigOptions = {
  profile?: HumanoidMapperProfile;
  mapperVersion?: string;
  humanoidPreset?: string;
};

export type AutoMapHumanoidRigResult = {
  document: T3RigDocument;
  diagnostics: readonly RigDiagnostic[];
  validated: boolean;
};

const aliases: Record<HumanoidSemantic, readonly string[]> = {
  hips: ["hips", "pelvis", "hip"],
  spine: ["spine", "spine0", "spine01"],
  chest: ["chest", "spine1", "spine02", "torso"],
  upperChest: ["upperchest", "spine2", "spine03"],
  neck: ["neck", "neck1"],
  head: ["head"],
  leftShoulder: ["leftshoulder", "lshoulder", "shoulderl", "leftclavicle", "claviclel"],
  leftUpperArm: ["leftarm", "leftupperarm", "lupperarm", "upperarml", "arml"],
  leftLowerArm: ["leftforearm", "leftlowerarm", "lforearm", "lowerarml", "forearml"],
  leftHand: ["lefthand", "lhand", "handl", "leftwrist", "wristl"],
  rightShoulder: ["rightshoulder", "rshoulder", "shoulderr", "rightclavicle", "clavicler"],
  rightUpperArm: ["rightarm", "rightupperarm", "rupperarm", "upperarmr", "armr"],
  rightLowerArm: ["rightforearm", "rightlowerarm", "rforearm", "lowerarmr", "forearmr"],
  rightHand: ["righthand", "rhand", "handr", "rightwrist", "wristr"],
  leftUpperLeg: ["leftupleg", "leftupperleg", "leftthigh", "lthigh", "thighl", "uplegl"],
  leftLowerLeg: ["leftleg", "leftlowerleg", "leftshin", "lshin", "shinl", "calfl"],
  leftFoot: ["leftfoot", "lfoot", "footl", "leftankle", "anklel"],
  leftToes: ["lefttoe", "lefttoebase", "ltoe", "toel"],
  rightUpperLeg: ["rightupleg", "rightupperleg", "rightthigh", "rthigh", "thighr", "uplegr"],
  rightLowerLeg: ["rightleg", "rightlowerleg", "rightshin", "rshin", "shinr", "calfr"],
  rightFoot: ["rightfoot", "rfoot", "footr", "rightankle", "ankler"],
  rightToes: ["righttoe", "righttoebase", "rtoe", "toer"],
};

export function normalizeRigBoneName(name: string): string {
  const namespaceTail = name.split(":").at(-1) ?? name;
  return namespaceTail.toLowerCase().replace(/^mixamorig/, "").replace(/[^a-z0-9]/g, "");
}

function isMixamoBone(bone: SourceBoneDescriptor) {
  return /mixamorig/i.test(bone.name) || /mixamorig/i.test(bone.hierarchyPath);
}

function candidateScore(bone: SourceBoneDescriptor, semantic: HumanoidSemantic, profile: HumanoidMapperProfile) {
  const normalized = normalizeRigBoneName(bone.name);
  const names = aliases[semantic];
  let score = 0;
  for (const alias of names) {
    if (normalized === alias) score = Math.max(score, 0.96);
    else if (normalized.endsWith(alias)) score = Math.max(score, 0.88);
    else if (alias.length >= 5 && normalized.includes(alias)) score = Math.max(score, 0.76);
  }
  const mixamo = isMixamoBone(bone);
  if (mixamo && score > 0) score = Math.min(1, score + 0.04);
  if (profile === "mixamo" && !mixamo) score *= 0.5;
  if (profile === "vrm") score *= 0.8;
  return score;
}

function bestNameCandidate(
  source: SourceRigDescriptor,
  semantic: HumanoidSemantic,
  used: ReadonlySet<number>,
  profile: HumanoidMapperProfile,
) {
  let best: { bone: SourceBoneDescriptor; score: number } | undefined;
  for (const bone of source.bones) {
    if (used.has(bone.index)) continue;
    const score = candidateScore(bone, semantic, profile);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && bone.index < best.bone.index)) best = { bone, score };
  }
  return best;
}

function provenanceFor(bone: SourceBoneDescriptor, profile: HumanoidMapperProfile) {
  if (isMixamoBone(bone)) return "mixamo" as const;
  return profile === "mixamo" ? "mixamo" as const : "gltf-heuristic" as const;
}

function bindSemantic(
  semantics: T3RigSemanticMap,
  semantic: HumanoidSemantic,
  binding: T3RigBoneBinding,
  used: Set<number>,
) {
  semantics[semantic] = binding;
  used.add(binding.boneIndex);
}

function findPathBetween(source: SourceRigDescriptor, ancestorIndex: number, descendantIndex: number) {
  const reverse: number[] = [];
  let cursor = descendantIndex;
  while (cursor >= 0 && cursor !== ancestorIndex) {
    reverse.push(cursor);
    cursor = source.bones[cursor]?.parentIndex ?? -1;
  }
  if (cursor !== ancestorIndex) return [];
  reverse.push(ancestorIndex);
  reverse.reverse();
  return reverse;
}

function fillMiddleJoint(
  source: SourceRigDescriptor,
  semantics: T3RigSemanticMap,
  start: HumanoidSemantic,
  middle: HumanoidSemantic,
  end: HumanoidSemantic,
  used: Set<number>,
) {
  if (semantics[middle] || !semantics[start] || !semantics[end]) return;
  const path = findPathBetween(source, semantics[start].boneIndex, semantics[end].boneIndex);
  if (path.length !== 3) return;
  const bone = source.bones[path[1]];
  if (used.has(bone.index)) return;
  bindSemantic(semantics, middle, createRigBinding(bone, "gltf-heuristic", 0.65), used);
}

type BindTopology = {
  children: number[][];
  height: number;
  maxY: number;
  minY: number;
  centerX: number;
  worldPositions: Float64Array;
};

type LimbBranch = {
  attachment: number;
  endpoint: number;
  joints: number[];
  length: number;
  reach: number;
  root: number;
  side: -1 | 1;
};

type BilateralPair = {
  left: LimbBranch;
  right: LimbBranch;
  score: number;
};

type HipsCandidate = {
  hips: number;
  legs: BilateralPair;
  score: number;
  trunkRoot: number;
};

type TopologyAssignment = {
  confidence: number;
  index: number;
};

function compareBoneOrder(source: SourceRigDescriptor, a: number, b: number) {
  const aBone = source.bones[a];
  const bBone = source.bones[b];
  return aBone.skinJointOrdinal - bBone.skinJointOrdinal
    || aBone.siblingOrdinal - bBone.siblingOrdinal
    || aBone.index - bBone.index;
}

function buildBindTopology(source: SourceRigDescriptor): BindTopology | undefined {
  if (source.bones.length < requiredHumanoidSemantics.length) return undefined;
  const children = Array.from({ length: source.bones.length }, () => [] as number[]);
  const roots: number[] = [];
  for (const bone of source.bones) {
    if (bone.parentIndex < 0) roots.push(bone.index);
    else children[bone.parentIndex].push(bone.index);
  }
  roots.sort((a, b) => compareBoneOrder(source, a, b));
  for (const list of children) list.sort((a, b) => compareBoneOrder(source, a, b));
  const order: number[] = [];
  const queue = [...roots];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    order.push(index);
    for (const child of children[index]) queue.push(child);
  }
  if (order.length !== source.bones.length) return undefined;

  const worldPositions = new Float64Array(source.bones.length * 3);
  const worldRotations = new Float64Array(source.bones.length * 4);
  const worldScales = new Float64Array(source.bones.length * 3);
  const scaledLocal = [0, 0, 0];
  const rotatedLocal = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  for (const index of order) {
    const bone = source.bones[index];
    const positionOffset = index * 3;
    const rotationOffset = index * 4;
    const localScale = bone.bindTransform.scale ?? [1, 1, 1];
    if (bone.parentIndex < 0) {
      worldPositions.set(bone.bindTransform.translation, positionOffset);
      worldRotations.set(bone.bindTransform.rotation, rotationOffset);
      worldScales.set(localScale, positionOffset);
      continue;
    }
    const parentPositionOffset = bone.parentIndex * 3;
    const parentRotationOffset = bone.parentIndex * 4;
    scaledLocal[0] = bone.bindTransform.translation[0] * worldScales[parentPositionOffset];
    scaledLocal[1] = bone.bindTransform.translation[1] * worldScales[parentPositionOffset + 1];
    scaledLocal[2] = bone.bindTransform.translation[2] * worldScales[parentPositionOffset + 2];
    rotateVector3ByQuaternion(
      scaledLocal,
      worldRotations.subarray(parentRotationOffset, parentRotationOffset + 4),
      rotatedLocal,
    );
    worldPositions[positionOffset] = worldPositions[parentPositionOffset] + rotatedLocal[0];
    worldPositions[positionOffset + 1] = worldPositions[parentPositionOffset + 1] + rotatedLocal[1];
    worldPositions[positionOffset + 2] = worldPositions[parentPositionOffset + 2] + rotatedLocal[2];
    multiplyQuaternions(
      worldRotations.subarray(parentRotationOffset, parentRotationOffset + 4),
      bone.bindTransform.rotation,
      rotation,
    );
    worldRotations.set(rotation, rotationOffset);
    worldScales[positionOffset] = worldScales[parentPositionOffset] * localScale[0];
    worldScales[positionOffset + 1] = worldScales[parentPositionOffset + 1] * localScale[1];
    worldScales[positionOffset + 2] = worldScales[parentPositionOffset + 2] * localScale[2];
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < source.bones.length; index += 1) {
    minX = Math.min(minX, worldPositions[index * 3]);
    maxX = Math.max(maxX, worldPositions[index * 3]);
    minY = Math.min(minY, worldPositions[index * 3 + 1]);
    maxY = Math.max(maxY, worldPositions[index * 3 + 1]);
  }
  const height = maxY - minY;
  if (!Number.isFinite(height) || height <= 1e-5) return undefined;
  return { children, height, maxY, minY, centerX: (minX + maxX) * 0.5, worldPositions };
}

function positionComponent(topology: BindTopology, index: number, component: 0 | 1 | 2) {
  return topology.worldPositions[index * 3 + component];
}

function distanceBetween(topology: BindTopology, a: number, b: number) {
  const dx = positionComponent(topology, a, 0) - positionComponent(topology, b, 0);
  const dy = positionComponent(topology, a, 1) - positionComponent(topology, b, 1);
  const dz = positionComponent(topology, a, 2) - positionComponent(topology, b, 2);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function collectDescendants(topology: BindTopology, source: SourceRigDescriptor, root: number) {
  const output: number[] = [];
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    output.push(index);
    for (const child of topology.children[index]) queue.push(child);
  }
  output.sort((a, b) => compareBoneOrder(source, a, b));
  return output;
}

function chooseExtreme(
  topology: BindTopology,
  source: SourceRigDescriptor,
  indices: readonly number[],
  component: 0 | 1,
  direction: -1 | 1,
) {
  let best = indices[0];
  let bestValue = positionComponent(topology, best, component) * direction;
  for (const index of indices.slice(1)) {
    const value = positionComponent(topology, index, component) * direction;
    if (value > bestValue + 1e-8 || (Math.abs(value - bestValue) <= 1e-8 && compareBoneOrder(source, index, best) < 0)) {
      best = index;
      bestValue = value;
    }
  }
  return best;
}

function pathFromAncestor(source: SourceRigDescriptor, ancestor: number, descendant: number) {
  const reverse: number[] = [];
  let cursor = descendant;
  while (cursor >= 0 && cursor !== ancestor) {
    reverse.push(cursor);
    cursor = source.bones[cursor]?.parentIndex ?? -1;
  }
  if (cursor !== ancestor) return [];
  reverse.push(ancestor);
  reverse.reverse();
  return reverse;
}

function pathLength(topology: BindTopology, path: readonly number[]) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += distanceBetween(topology, path[index - 1], path[index]);
  return length;
}

function significantPath(topology: BindTopology, path: readonly number[]) {
  if (!path.length) return [];
  const output = [path[0]];
  let anchor = path[0];
  let accumulated = 0;
  const minimumSegment = topology.height * 0.035;
  for (let index = 1; index < path.length; index += 1) {
    accumulated += distanceBetween(topology, path[index - 1], path[index]);
    if (accumulated >= minimumSegment) {
      output.push(path[index]);
      anchor = path[index];
      accumulated = 0;
    }
  }
  const endpoint = path[path.length - 1];
  if (output[output.length - 1] !== endpoint && distanceBetween(topology, anchor, endpoint) >= minimumSegment * 0.6) output.push(endpoint);
  return output;
}

function compareBranches(source: SourceRigDescriptor, a: LimbBranch, b: LimbBranch) {
  return compareBoneOrder(source, a.root, b.root) || compareBoneOrder(source, a.endpoint, b.endpoint);
}

function bestBilateralPair(source: SourceRigDescriptor, left: readonly LimbBranch[], right: readonly LimbBranch[], height: number) {
  let best: BilateralPair | undefined;
  for (const leftBranch of left) {
    for (const rightBranch of right) {
      const longest = Math.max(leftBranch.length, rightBranch.length, 1e-6);
      const symmetry = 1 - Math.min(1, Math.abs(leftBranch.length - rightBranch.length) / longest);
      const attachmentDelta = Math.abs(leftBranch.attachment - rightBranch.attachment);
      const sameAttachment = attachmentDelta === 0 ? 1 : 0;
      const reach = Math.min(1, (leftBranch.reach + rightBranch.reach) / (height * 0.7));
      const score = reach * 0.45 + symmetry * 0.35 + sameAttachment * 0.2;
      const candidate = { left: leftBranch, right: rightBranch, score };
      if (!best || score > best.score + 1e-8
        || (Math.abs(score - best.score) <= 1e-8
          && (compareBranches(source, leftBranch, best.left) < 0
            || (compareBranches(source, leftBranch, best.left) === 0 && compareBranches(source, rightBranch, best.right) < 0)))) {
        best = candidate;
      }
    }
  }
  return best;
}

function legBranch(
  topology: BindTopology,
  source: SourceRigDescriptor,
  hips: number,
  root: number,
): LimbBranch | undefined {
  const descendants = collectDescendants(topology, source, root);
  const endpoint = chooseExtreme(topology, source, descendants, 1, -1);
  const drop = positionComponent(topology, hips, 1) - positionComponent(topology, endpoint, 1);
  if (drop < topology.height * 0.18) return undefined;
  const rawPath = pathFromAncestor(source, root, endpoint);
  const joints = significantPath(topology, rawPath);
  if (joints.length < 3) return undefined;
  const sideOffset = (positionComponent(topology, root, 0) + positionComponent(topology, endpoint, 0)) * 0.5
    - positionComponent(topology, hips, 0);
  if (Math.abs(sideOffset) < topology.height * 0.018) return undefined;
  return {
    attachment: hips,
    endpoint,
    joints,
    length: pathLength(topology, rawPath),
    reach: drop,
    root,
    side: sideOffset > 0 ? 1 : -1,
  };
}

function hipsCandidateAt(topology: BindTopology, source: SourceRigDescriptor, hips: number): HipsCandidate | undefined {
  const branches = topology.children[hips]
    .map((child) => legBranch(topology, source, hips, child))
    .filter((branch): branch is LimbBranch => Boolean(branch));
  const legs = bestBilateralPair(
    source,
    branches.filter((branch) => branch.side > 0),
    branches.filter((branch) => branch.side < 0),
    topology.height,
  );
  if (!legs) return undefined;

  let trunkRoot = -1;
  let trunkHeight = Number.NEGATIVE_INFINITY;
  for (const child of topology.children[hips]) {
    if (child === legs.left.root || child === legs.right.root) continue;
    const descendants = collectDescendants(topology, source, child);
    const endpoint = chooseExtreme(topology, source, descendants, 1, 1);
    const height = positionComponent(topology, endpoint, 1) - positionComponent(topology, hips, 1);
    if (height > trunkHeight + 1e-8
      || (Math.abs(height - trunkHeight) <= 1e-8 && (trunkRoot < 0 || compareBoneOrder(source, child, trunkRoot) < 0))) {
      trunkHeight = height;
      trunkRoot = child;
    }
  }
  if (trunkRoot < 0 || trunkHeight < topology.height * 0.2) return undefined;

  const centrality = 1 - Math.min(1, Math.abs(positionComponent(topology, hips, 0) - topology.centerX) / (topology.height * 0.2));
  const targetY = topology.minY + topology.height * 0.5;
  const heightFit = 1 - Math.min(1, Math.abs(positionComponent(topology, hips, 1) - targetY) / (topology.height * 0.3));
  const score = legs.score * 0.45 + Math.min(1, trunkHeight / (topology.height * 0.5)) * 0.25 + centrality * 0.15 + heightFit * 0.15;
  return { hips, legs, score, trunkRoot };
}

function inferHips(topology: BindTopology, source: SourceRigDescriptor): HipsCandidate | undefined {
  let best: HipsCandidate | undefined;
  for (const bone of source.bones) {
    const candidate = hipsCandidateAt(topology, source, bone.index);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + 1e-8
      || (Math.abs(candidate.score - best.score) <= 1e-8 && compareBoneOrder(source, candidate.hips, best.hips) < 0)) best = candidate;
  }
  return best;
}

function inferHead(topology: BindTopology, source: SourceRigDescriptor, hips: number, trunkRoot: number) {
  const descendants = collectDescendants(topology, source, trunkRoot);
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const index of descendants) {
    const upward = (positionComponent(topology, index, 1) - positionComponent(topology, hips, 1)) / topology.height;
    if (upward < 0.2) continue;
    const lateral = Math.abs(positionComponent(topology, index, 0) - topology.centerX) / topology.height;
    const depth = Math.abs(positionComponent(topology, index, 2) - positionComponent(topology, hips, 2)) / topology.height;
    const terminal = topology.children[index].length === 0 ? 0.04 : 0;
    const score = upward * 0.8 - lateral * 0.4 - depth * 0.15 + terminal;
    if (score > bestScore + 1e-8
      || (Math.abs(score - bestScore) <= 1e-8 && (best < 0 || compareBoneOrder(source, index, best) < 0))) {
      best = index;
      bestScore = score;
    }
  }
  return best;
}

function armBranch(
  topology: BindTopology,
  source: SourceRigDescriptor,
  attachment: number,
  root: number,
  side: -1 | 1,
): LimbBranch | undefined {
  const descendants = collectDescendants(topology, source, root);
  const endpoint = chooseExtreme(topology, source, descendants, 0, side);
  const reach = Math.abs(positionComponent(topology, endpoint, 0) - positionComponent(topology, attachment, 0));
  if (reach < topology.height * 0.12) return undefined;
  const rawPath = pathFromAncestor(source, root, endpoint);
  const significant = significantPath(topology, rawPath);
  if (significant.length < 3) return undefined;
  let chainOffset = 0;
  if (significant.length >= 4) {
    const attachmentLength = distanceBetween(topology, attachment, significant[0]);
    const firstLimbLength = distanceBetween(topology, significant[0], significant[1]);
    if (attachmentLength < firstLimbLength * 0.85) chainOffset = 1;
  }
  if (significant.length - chainOffset < 3) return undefined;
  return {
    attachment,
    endpoint,
    joints: significant.slice(chainOffset),
    length: pathLength(topology, rawPath),
    reach,
    root,
    side,
  };
}

function inferArms(
  topology: BindTopology,
  source: SourceRigDescriptor,
  hips: number,
  trunkPath: readonly number[],
) {
  const trunkSet = new Set(trunkPath);
  const left: LimbBranch[] = [];
  const right: LimbBranch[] = [];
  for (const attachment of trunkPath) {
    if (positionComponent(topology, attachment, 1) < positionComponent(topology, hips, 1) + topology.height * 0.12) continue;
    for (const child of topology.children[attachment]) {
      if (trunkSet.has(child)) continue;
      const descendants = collectDescendants(topology, source, child);
      const maxX = positionComponent(topology, chooseExtreme(topology, source, descendants, 0, 1), 0);
      const minX = positionComponent(topology, chooseExtreme(topology, source, descendants, 0, -1), 0);
      const attachmentX = positionComponent(topology, attachment, 0);
      const side: -1 | 1 = maxX - attachmentX >= attachmentX - minX ? 1 : -1;
      const branch = armBranch(topology, source, attachment, child, side);
      if (!branch) continue;
      if (side > 0) left.push(branch);
      else right.push(branch);
    }
  }
  return bestBilateralPair(source, left, right, topology.height);
}

function setTopologyAssignment(
  assignments: Partial<Record<HumanoidSemantic, TopologyAssignment>>,
  semantic: HumanoidSemantic,
  index: number | undefined,
  confidence: number,
) {
  if (index !== undefined && index >= 0) assignments[semantic] = { confidence, index };
}

function inferHumanoidTopology(source: SourceRigDescriptor, knownHips?: number): Partial<Record<HumanoidSemantic, TopologyAssignment>> {
  const topology = buildBindTopology(source);
  if (!topology) return {};
  const hipsCandidate = knownHips === undefined
    ? inferHips(topology, source)
    : hipsCandidateAt(topology, source, knownHips);
  if (!hipsCandidate) return {};
  const head = inferHead(topology, source, hipsCandidate.hips, hipsCandidate.trunkRoot);
  if (head < 0) return {};
  const trunkPath = pathFromAncestor(source, hipsCandidate.hips, head);
  if (trunkPath.length < 3) return {};
  const arms = inferArms(topology, source, hipsCandidate.hips, trunkPath);
  if (!arms) return {};

  const assignments: Partial<Record<HumanoidSemantic, TopologyAssignment>> = {};
  setTopologyAssignment(assignments, "hips", hipsCandidate.hips, 0.74);
  setTopologyAssignment(assignments, "head", head, 0.72);
  setTopologyAssignment(assignments, "leftUpperLeg", hipsCandidate.legs.left.joints[0], 0.72);
  setTopologyAssignment(assignments, "leftLowerLeg", hipsCandidate.legs.left.joints[1], 0.69);
  setTopologyAssignment(assignments, "leftFoot", hipsCandidate.legs.left.joints[2], 0.67);
  setTopologyAssignment(assignments, "rightUpperLeg", hipsCandidate.legs.right.joints[0], 0.72);
  setTopologyAssignment(assignments, "rightLowerLeg", hipsCandidate.legs.right.joints[1], 0.69);
  setTopologyAssignment(assignments, "rightFoot", hipsCandidate.legs.right.joints[2], 0.67);
  setTopologyAssignment(assignments, "leftUpperArm", arms.left.joints[0], 0.71);
  setTopologyAssignment(assignments, "leftLowerArm", arms.left.joints[1], 0.68);
  setTopologyAssignment(assignments, "leftHand", arms.left.joints[2], 0.66);
  setTopologyAssignment(assignments, "rightUpperArm", arms.right.joints[0], 0.71);
  setTopologyAssignment(assignments, "rightLowerArm", arms.right.joints[1], 0.68);
  setTopologyAssignment(assignments, "rightHand", arms.right.joints[2], 0.66);

  const intermediates = trunkPath.slice(1, -1);
  setTopologyAssignment(assignments, "spine", intermediates[0], 0.64);
  setTopologyAssignment(assignments, "neck", intermediates.at(-1), 0.62);
  if (intermediates.length >= 3) setTopologyAssignment(assignments, "chest", intermediates[1], 0.63);
  if (intermediates.length >= 4) setTopologyAssignment(assignments, "upperChest", intermediates[intermediates.length - 2], 0.62);
  if (arms.left.joints[0] !== arms.left.root) setTopologyAssignment(assignments, "leftShoulder", arms.left.root, 0.61);
  if (arms.right.joints[0] !== arms.right.root) setTopologyAssignment(assignments, "rightShoulder", arms.right.root, 0.61);
  return assignments;
}

export function autoMapHumanoidRig(
  source: SourceRigDescriptor,
  options: AutoMapHumanoidRigOptions = {},
): AutoMapHumanoidRigResult {
  assertSourceRigDescriptor(source);
  const profile = options.profile ?? "auto";
  const semantics = createEmptyT3RigSemanticMap();
  const used = new Set<number>();

  if ((profile === "auto" || profile === "vrm") && source.vrmHumanoid) {
    for (const semantic of humanoidSemantics) {
      const boneIndex = source.vrmHumanoid[semantic];
      if (boneIndex === undefined || used.has(boneIndex)) continue;
      bindSemantic(semantics, semantic, createRigBinding(source.bones[boneIndex], "vrm", 1), used);
    }
  }

  for (const semantic of humanoidSemantics) {
    if (semantics[semantic]) continue;
    const candidate = bestNameCandidate(source, semantic, used, profile);
    if (!candidate) continue;
    bindSemantic(
      semantics,
      semantic,
      createRigBinding(candidate.bone, provenanceFor(candidate.bone, profile), candidate.score),
      used,
    );
  }

  fillMiddleJoint(source, semantics, "leftUpperArm", "leftLowerArm", "leftHand", used);
  fillMiddleJoint(source, semantics, "rightUpperArm", "rightLowerArm", "rightHand", used);
  fillMiddleJoint(source, semantics, "leftUpperLeg", "leftLowerLeg", "leftFoot", used);
  fillMiddleJoint(source, semantics, "rightUpperLeg", "rightLowerLeg", "rightFoot", used);

  const topologyMapped: HumanoidSemantic[] = [];
  const topologyAssignments = inferHumanoidTopology(source, semantics.hips?.boneIndex);
  for (const semantic of humanoidSemantics) {
    if (semantics[semantic]) continue;
    const assignment = topologyAssignments[semantic];
    if (!assignment || used.has(assignment.index)) continue;
    bindSemantic(
      semantics,
      semantic,
      createRigBinding(source.bones[assignment.index], "gltf-heuristic", assignment.confidence),
      used,
    );
    topologyMapped.push(semantic);
  }

  const diagnostics: RigDiagnostic[] = [];
  if (topologyMapped.length) {
    diagnostics.push({
      code: "topology-mapping-review",
      message: `Canonical bind geometry and topology inferred ${topologyMapped.length} semantic mappings; review low-confidence assignments before shipping`,
      severity: "warning",
    });
  }
  for (const semantic of requiredHumanoidSemantics) {
    if (!semantics[semantic]) {
      diagnostics.push({
        code: "semantic-unresolved",
        message: `Auto-mapper could not resolve ${semantic}`,
        severity: "warning",
        semantic,
      });
    }
  }
  const validated = diagnostics.length === 0;
  return {
    document: {
      schemaVersion: T3_RIG_SCHEMA_VERSION,
      mapperVersion: options.mapperVersion ?? T3_RIG_MAPPER_VERSION,
      humanoidPreset: options.humanoidPreset ?? T3_HUMANOID_PRESET,
      assetFingerprint: { ...source.assetFingerprint },
      skinFingerprint: { ...source.skinFingerprint },
      normalization: {
        ...source.normalization,
        sourceToCanonicalRotation: [...source.normalization.sourceToCanonicalRotation],
      },
      semantics,
      tags: {},
      overrides: {},
    },
    diagnostics,
    validated,
  };
}
