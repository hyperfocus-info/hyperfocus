import { inferHumanoidSemanticFromBoneName } from "../mapping.ts";
import type { HumanoidSemantic } from "../rig.ts";

export const HUMANOID_ACTION_POSE_VERSION = 1;
export const HUMANOID_ACTION_POSE_PHASES = Object.freeze({ anticipation: .25, contact: .62, followThrough: .82, ready: 1 });

export type HumanoidActionPoseStyle = "straight" | "hook" | "overhand" | "kick" | "shove" | "weapon-swing";
export type HumanoidActionPoseEffector = "left-hand" | "right-hand" | "left-foot" | "right-foot" | "tool";
export type HumanoidActionPoseVec3 = readonly [number, number, number];

/** One portable additive pose envelope. Phase and rotations are deterministic data. */
export type HumanoidActionPoseLobe = {
  semantic: HumanoidSemantic;
  peakPhase: number;
  fadeInPhase: number;
  fadeOutPhase: number;
  rotationEulerDegrees: HumanoidActionPoseVec3;
};

export type HumanoidActionPoseRecipe = {
  version: typeof HUMANOID_ACTION_POSE_VERSION;
  style: HumanoidActionPoseStyle;
  effector: HumanoidActionPoseEffector;
  power: number;
  lobes: readonly HumanoidActionPoseLobe[];
};

export type HumanoidActionPoseIntent = {
  style: HumanoidActionPoseStyle;
  effector: HumanoidActionPoseEffector;
  /** Normalized readable-body exaggeration. One is the authored baseline. */
  power?: number;
};

const REQUIRED_BODY_SEMANTICS = ["hips", "spine", "chest"] as const;

/** Builds the same compact pose recipe used by gameplay, editor preview, and video expansion. */
export function createHumanoidActionPoseRecipe(intent: Readonly<HumanoidActionPoseIntent>): HumanoidActionPoseRecipe {
  const power = finiteRange(intent.power ?? 1, .1, 2, "humanoid action pose power"), side = effectorSide(intent.effector);
  const lobes: HumanoidActionPoseLobe[] = [];
  const add = (semantic: HumanoidSemantic, peakPhase: number, fadeInPhase: number, fadeOutPhase: number, rotation: HumanoidActionPoseVec3) => {
    lobes.push({ semantic, peakPhase, fadeInPhase, fadeOutPhase, rotationEulerDegrees: scale3(rotation, power) });
  };
  const body = (windup: HumanoidActionPoseVec3, contact: HumanoidActionPoseVec3, follow: HumanoidActionPoseVec3) => {
    // These are increments down one parented chain, so their sum—not each bone's
    // individual value—is the visible torso turn. Keep the total at one to avoid
    // multiplying a requested 50-degree cross into a 100+ degree corkscrew.
    for (const [semantic, amount] of [["hips", .34], ["spine", .03], ["chest", .17], ["upperChest", .46]] as const) {
      add(semantic, .25, .25, .35, scale3(windup, amount));
      add(semantic, .62, .18, .24, scale3(contact, amount));
      add(semantic, .82, .16, .18, scale3(follow, amount));
    }
  };
  // Punch_Cross catalog deltas establish the baseline: the pelvis starts the turn,
  // the upper torso finishes it, and the head continues tracking the target.
  if (intent.style === "straight") body([6, -24 * side, -1 * side], [17, -55 * side, -6 * side], [15, -50 * side, -5 * side]);
  else if (intent.style === "hook") body([1, -18 * side, 7 * side], [-2, -48 * side, 12 * side], [4, -29 * side, 6 * side]);
  else if (intent.style === "overhand") body([-18, -12 * side, 5 * side], [24, -32 * side, 8 * side], [12, -19 * side, 4 * side]);
  else if (intent.style === "kick") body([5, -25 * side, -12 * side], [-9, 38 * side, 18 * side], [4, 22 * side, 9 * side]);
  else if (intent.style === "shove") body([-8, -12 * side, 2 * side], [14, 18 * side, -4 * side], [8, 8 * side, -2 * side]);
  else body([-16, -38 * side, 12 * side], [18, 54 * side, -17 * side], [10, 31 * side, -8 * side]);
  add(side > 0 ? "leftShoulder" : "rightShoulder", .25, .25, .34, [-10, -12 * side, 12 * side]);
  add(side > 0 ? "leftShoulder" : "rightShoulder", .62, .2, .24, [8, 20 * side, -18 * side]);
  add(side > 0 ? "rightShoulder" : "leftShoulder", .62, .2, .26, [-3, -10 * side, 7 * side]);
  add("head", .62, .24, .28, [0, -8 * side, 2 * side]);
  if (intent.style === "straight" || intent.style === "hook" || intent.style === "overhand") {
    const guardArm = side > 0 ? "rightUpperArm" : "leftUpperArm";
    const driveLeg = side > 0 ? "leftUpperLeg" : "rightUpperLeg", driveLowerLeg = side > 0 ? "leftLowerLeg" : "rightLowerLeg", driveFoot = side > 0 ? "leftFoot" : "rightFoot";
    add(guardArm, .25, .24, .34, [2, -8 * side, 6 * side]);
    add(guardArm, .62, .2, .3, [-2, -22 * side, 12 * side]);
    add(driveLeg, .25, .25, .34, [-3, -7 * side, 2 * side]);
    add(driveLeg, .62, .2, .3, [-5, -20 * side, 1 * side]);
    add(driveLeg, .82, .16, .18, [-3, -15 * side, 1 * side]);
    add(driveLowerLeg, .25, .25, .34, [4, -6 * side, -3 * side]);
    add(driveLowerLeg, .62, .2, .3, [10, -12 * side, -8 * side]);
    add(driveLowerLeg, .82, .16, .18, [8, -9 * side, -6 * side]);
    add(driveFoot, .25, .25, .34, [12, -6 * side, -8 * side]);
    add(driveFoot, .62, .2, .3, [28, -8 * side, -16 * side]);
    add(driveFoot, .82, .16, .18, [21, -4 * side, -13 * side]);
  }
  return { version: HUMANOID_ACTION_POSE_VERSION, style: intent.style, effector: intent.effector, power, lobes };
}

/** Smooth deterministic envelope shared with ordinary editor pose-correction handles. */
export function sampleHumanoidActionPoseLobeWeight(lobe: Readonly<HumanoidActionPoseLobe>, phase: number): number {
  const value = Math.max(0, Math.min(1, finite(phase, "humanoid action phase"))), start = lobe.peakPhase - lobe.fadeInPhase, end = lobe.peakPhase + lobe.fadeOutPhase;
  if (value < start || value > end) return 0;
  const incoming = lobe.fadeInPhase > 0 ? smootherstep((value - start) / lobe.fadeInPhase) : 1;
  const outgoing = lobe.fadeOutPhase > 0 ? smootherstep((end - value) / lobe.fadeOutPhase) : 1;
  return Math.min(incoming, outgoing);
}

/** Stable bone IDs for body-pose expansion. Missing optional bones simply omit their lobes. */
export function resolveHumanoidActionPoseBones(boneIds: readonly string[]) {
  const bones: Partial<Record<HumanoidSemantic, string>> = {};
  for (const boneId of boneIds) {
    const semantic = inferHumanoidSemanticFromBoneName(boneId);
    if (semantic && !bones[semantic]) bones[semantic] = boneId;
  }
  const missing = REQUIRED_BODY_SEMANTICS.filter((semantic) => !bones[semantic]);
  return { bones, supported: missing.length === 0, missing } as const;
}

export function inferHumanoidActionPoseEffector(boneId: string): HumanoidActionPoseEffector {
  const semantic = inferHumanoidSemanticFromBoneName(boneId);
  if (semantic === "leftHand" || semantic === "leftLowerArm" || semantic === "leftUpperArm") return "left-hand";
  if (semantic === "rightHand" || semantic === "rightLowerArm" || semantic === "rightUpperArm") return "right-hand";
  if (semantic === "leftFoot" || semantic === "leftLowerLeg" || semantic === "leftUpperLeg") return "left-foot";
  if (semantic === "rightFoot" || semantic === "rightLowerLeg" || semantic === "rightUpperLeg") return "right-foot";
  return "tool";
}

function effectorSide(effector: HumanoidActionPoseEffector): -1 | 1 { return effector.startsWith("right") ? -1 : 1; }
function scale3(value: HumanoidActionPoseVec3, amount: number): HumanoidActionPoseVec3 { return [value[0] * amount, value[1] * amount, value[2] * amount]; }
function smootherstep(value: number) { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10); }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`); return value; }
function finiteRange(value: number, minimum: number, maximum: number, label: string) { const result = finite(value, label); if (result < minimum || result > maximum) throw new RangeError(`${label} must be from ${minimum} through ${maximum}`); return result; }
