import { smoothstep01 as smooth01 } from "@hyperfocus/utilities/math";
import { clamp01Or as clamp01 } from "@hyperfocus/utilities/math";
import type { ProceduralMotionPhase } from "./locomotion.ts";

export type HumanoidJumpPosePhase = "none" | "takeoff" | "ascent" | "apex" | "descent" | "landing";

export type HumanoidJumpPoseInput = {
  motionPhase: ProceduralMotionPhase;
  jumpAnticipation: number;
  airborneSeconds: number;
  verticalSpeed: number;
  landingWeight: number;
};

export type HumanoidJumpPoseSample = {
  phase: HumanoidJumpPosePhase;
  weight: number;
  pelvisDropRatio: number;
  torsoPitchRadians: number;
  airborneArmWeight: number;
  airborneArmPhase: number;
};

/**
 * Samples a rig-independent takeoff -> ascent -> apex -> descent -> landing
 * pose recipe. Translation remains physics-owned; these values only shape the
 * semantic skeleton and IK targets around that authoritative trajectory.
 */
export function sampleHumanoidJumpPose(
  input: HumanoidJumpPoseInput,
  out: HumanoidJumpPoseSample = createHumanoidJumpPoseSample(),
) {
  reset(out);
  if (input.motionPhase === "takeoff") {
    out.phase = "takeoff";
    out.weight = smooth01(input.jumpAnticipation);
    writeTakeoff(out, out.weight);
    return out;
  }
  if (input.motionPhase === "land") {
    out.phase = "landing";
    out.weight = clamp01(input.landingWeight);
    writeLanding(out, out.weight);
    return out;
  }
  if (input.motionPhase !== "jump" && input.motionPhase !== "fall") return out;

  const entry = smooth01(input.airborneSeconds / .16);
  const ascent = smooth01((input.verticalSpeed + .15) / 2.55);
  const descent = smooth01((-input.verticalSpeed + .15) / 2.55);
  const apex = Math.max(0, 1 - Math.max(ascent, descent));
  const total = Math.max(1e-8, ascent + apex + descent);
  const ascentWeight = ascent / total;
  const apexWeight = apex / total;
  const descentWeight = descent / total;
  out.phase = ascentWeight >= apexWeight && ascentWeight >= descentWeight
    ? "ascent"
    : descentWeight >= apexWeight ? "descent" : "apex";
  out.weight = 1;
  // Translation and every limb keep their incoming locomotion state. Only the
  // launch compression releases after takeoff, like a spring riding a ballistic
  // physics body. This preserves gait velocity instead of switching to a
  // monolithic airborne pose.
  const launchCompression = 1 - entry;
  out.pelvisDropRatio = .17 * launchCompression;
  out.torsoPitchRadians = .18 * launchCompression
    + weighted(.04, .015, .07, ascentWeight, apexWeight, descentWeight) * entry;
  // Hands retain their exact incoming spring velocity through launch, then
  // settle into a restrained airborne balance cycle rather than switching to
  // a canned jump clip or a symmetric dead hang.
  out.airborneArmWeight = smooth01(input.airborneSeconds / .28);
  out.airborneArmPhase = normalizedPhase(input.airborneSeconds / .8);
  return out;
}

export function createHumanoidJumpPoseSample(): HumanoidJumpPoseSample {
  return {
    phase: "none",
    weight: 0,
    pelvisDropRatio: 0,
    torsoPitchRadians: 0,
    airborneArmWeight: 0,
    airborneArmPhase: 0,
  };
}

function writeTakeoff(out: HumanoidJumpPoseSample, weight: number) {
  out.pelvisDropRatio = .17 * weight;
  out.torsoPitchRadians = .21 * weight;
}

function writeLanding(out: HumanoidJumpPoseSample, weight: number) {
  out.pelvisDropRatio = .2 * weight;
  out.torsoPitchRadians = .22 * weight;
  out.airborneArmWeight = weight;
}

function reset(out: HumanoidJumpPoseSample) {
  out.phase = "none";
  out.weight = 0;
  out.pelvisDropRatio = 0;
  out.torsoPitchRadians = 0;
  out.airborneArmWeight = 0;
  out.airborneArmPhase = 0;
}

function weighted(a: number, b: number, c: number, wa: number, wb: number, wc: number) {
  return a * wa + b * wb + c * wc;
}



function normalizedPhase(value: number) { return ((value % 1) + 1) % 1; }
