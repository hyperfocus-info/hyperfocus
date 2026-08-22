import type { MotionMaskSpec, MotionPoseComponent } from "./graph-types.ts";
import { getRigTagIndices, type CompiledSemanticRig } from "./rig.ts";

export type CompiledPoseMask = {
  readonly jointCount: number;
  readonly rotations: Uint32Array;
  readonly translations: Uint32Array;
  readonly scales: Uint32Array;
};

export type CompiledMotionMaskResult = {
  mask: CompiledPoseMask;
  missingTags: string[];
};

function wordCount(jointCount: number) {
  return Math.ceil(jointCount / 32);
}

export function createEmptyPoseMask(jointCount: number): CompiledPoseMask {
  const words = wordCount(jointCount);
  return {
    jointCount,
    rotations: new Uint32Array(words),
    translations: new Uint32Array(words),
    scales: new Uint32Array(words),
  };
}

function fillBits(words: Uint32Array, jointCount: number) {
  words.fill(0xffffffff);
  const remainder = jointCount % 32;
  if (remainder !== 0 && words.length > 0) words[words.length - 1] = 0xffffffff >>> (32 - remainder);
}

function componentWords(mask: CompiledPoseMask, component: MotionPoseComponent) {
  if (component === "rotation") return mask.rotations;
  if (component === "translation") return mask.translations;
  return mask.scales;
}

function setJoint(words: Uint32Array, jointIndex: number) {
  words[jointIndex >>> 5] |= 1 << (jointIndex & 31);
}

export function poseMaskHasJoint(mask: CompiledPoseMask, component: MotionPoseComponent, jointIndex: number) {
  if (jointIndex < 0 || jointIndex >= mask.jointCount) return false;
  const words = componentWords(mask, component);
  return (words[jointIndex >>> 5] & (1 << (jointIndex & 31))) !== 0;
}

export function compileMotionMask(rig: CompiledSemanticRig, spec: MotionMaskSpec | undefined): CompiledMotionMaskResult {
  const mask = createEmptyPoseMask(rig.totalCount);
  const missingTags: string[] = [];
  if (spec === undefined || spec === "*") {
    fillBits(mask.rotations, rig.totalCount);
    fillBits(mask.translations, rig.totalCount);
    fillBits(mask.scales, rig.totalCount);
    return { mask, missingTags };
  }

  const components = spec.components ?? ["rotation", "translation"];
  for (const tag of spec.tags) {
    const indices = getRigTagIndices(rig, tag);
    if (!indices) {
      missingTags.push(tag);
      continue;
    }
    for (const jointIndex of indices) {
      if (jointIndex >= rig.totalCount) continue;
      for (const component of components) setJoint(componentWords(mask, component), jointIndex);
    }
  }
  return { mask, missingTags };
}

export function clonePoseMask(mask: CompiledPoseMask): CompiledPoseMask {
  return {
    jointCount: mask.jointCount,
    rotations: mask.rotations.slice(),
    translations: mask.translations.slice(),
    scales: mask.scales.slice(),
  };
}

export function unionPoseMasks(target: CompiledPoseMask, source: CompiledPoseMask) {
  if (target.jointCount !== source.jointCount) throw new Error("pose mask joint counts must match");
  for (let index = 0; index < target.rotations.length; index += 1) {
    target.rotations[index] |= source.rotations[index];
    target.translations[index] |= source.translations[index];
    target.scales[index] |= source.scales[index];
  }
  return target;
}

export function poseMasksOverlap(a: CompiledPoseMask, b: CompiledPoseMask) {
  if (a.jointCount !== b.jointCount) return false;
  for (let index = 0; index < a.rotations.length; index += 1) {
    if ((a.rotations[index] & b.rotations[index]) !== 0) return true;
    if ((a.translations[index] & b.translations[index]) !== 0) return true;
    if ((a.scales[index] & b.scales[index]) !== 0) return true;
  }
  return false;
}

export function poseMaskContains(container: CompiledPoseMask, candidate: CompiledPoseMask) {
  if (container.jointCount !== candidate.jointCount) return false;
  for (let index = 0; index < container.rotations.length; index += 1) {
    if ((candidate.rotations[index] & ~container.rotations[index]) !== 0) return false;
    if ((candidate.translations[index] & ~container.translations[index]) !== 0) return false;
    if ((candidate.scales[index] & ~container.scales[index]) !== 0) return false;
  }
  return true;
}

export function isPoseMaskEmpty(mask: CompiledPoseMask) {
  for (let index = 0; index < mask.rotations.length; index += 1) {
    if (mask.rotations[index] !== 0 || mask.translations[index] !== 0 || mask.scales[index] !== 0) return false;
  }
  return true;
}
