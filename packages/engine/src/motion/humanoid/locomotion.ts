import { finiteOr as finiteNumberOr } from "@hyperfocus/utilities/math";
import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

import type { MotionVec3 } from "../math.ts";
import {
  createCanonicalHumanoidGaitSample,
  normalizeGaitPhase,
  sampleCanonicalHumanoidGait,
  type CanonicalHumanoidGaitSample,
} from "./gait-recipe.ts";
import type { HumanoidLocomotionPosture } from "./locomotion-intent.ts";
import { getHumanoidLocomotionProfile, inferHumanoidLocomotionPace, type HumanoidLocomotionPace } from "./locomotion-profile.ts";

const TAU = Math.PI * 2;
const EPSILON = 1e-6;

export type ProceduralLocomotionOptions = {
  /** Distance travelled by the character during one complete left-foot cycle. */
  cycleDistanceScale?: number;
  idleBreathsPerSecond?: number;
  maxTurnRate?: number;
  maxTurnLean?: number;
  fullStrideSpeed?: number;
  locomotionBlendResponse?: number;
  /**
   * Critically damped response used only for pose selection. Travel distance
   * still comes from collision-resolved root motion, so impact jitter cannot
   * snap the gait silhouette or desynchronize planted steps.
   */
  poseSpeedResponse?: number;
  /**
   * Critically damped response for the pose-space travel vector. Physics may
   * reverse or deflect instantly after a collision, but a planted body still
   * needs time to turn its hips and redirect its stride.
   */
  travelDirectionResponse?: number;
  /** Critically damped response between upright and crouched gait heights. */
  postureResponse?: number;
};

export type ProceduralLocomotionInput = {
  deltaSeconds: number;
  /** Actual displacement accepted by the motor after collision resolution. */
  resolvedRootDelta: ArrayLike<number>;
  velocity: ArrayLike<number>;
  facing: ArrayLike<number>;
  groundNormal: ArrayLike<number>;
  turnRate: number;
  isGrounded: boolean;
  /** Short, explicitly authored running flight keeps cadence but never fakes foot support. */
  plannedLocomotionFlight?: boolean;
  /** 0..1 compression authored immediately before a physics-owned jump impulse. */
  jumpAnticipation?: number;
  legLength: number;
  hipWidth: number;
  /** Explicit authoring pace. Direct-velocity callers may omit it. */
  pace?: HumanoidLocomotionPace;
  posture?: HumanoidLocomotionPosture;
  cycleDistanceScale?: number;
};

export type ProceduralMotionPhase = "idle" | "locomotion" | "takeoff" | "jump" | "fall" | "land";

export type ProceduralLocomotionFrame = {
  motionPhase: ProceduralMotionPhase;
  gaitPhase: number;
  gaitCycle: number;
  idlePhase: number;
  distanceTravelled: number;
  /** Instantaneous horizontal speed reported by the authoritative motor. */
  speed: number;
  /** Smoothed speed used to choose and blend locomotion poses. */
  poseSpeed: number;
  pace: HumanoidLocomotionPace;
  posture: HumanoidLocomotionPosture;
  /** Continuous crouch amount used by physics and presentation pose consumers. */
  crouchWeight: number;
  /** Continuous idle=0, walk=1, jog=2, run=3, sprint=4 pose coordinate. */
  paceBlend: number;
  paceIntensity: number;
  stanceRatio: number;
  targetLocomotionWeight: number;
  locomotionWeight: number;
  left: CanonicalHumanoidGaitSample;
  right: CanonicalHumanoidGaitSample;
  /** Local-space travel direction: +X right, +Z forward. */
  localTravelDirection: Float32Array;
  /** Local-space targets relative to MotionRoot. */
  leftFootTarget: Float32Array;
  rightFootTarget: Float32Array;
  pelvisOffset: Float32Array;
  /** Pitch around X and roll around Z for terrain alignment. */
  slope: Float32Array;
  turnLean: number;
  breath: number;
  verticalSpeed: number;
  jumpAnticipation: number;
  airborneSeconds: number;
  landingSeconds: number;
  landingWeight: number;
  torsoRoll: number;
  torsoYaw: number;
  pelvisYaw: number;
};

export type ProceduralLocomotion = {
  readonly frame: ProceduralLocomotionFrame;
  update(input: ProceduralLocomotionInput): ProceduralLocomotionFrame;
  reset(options?: { gaitPhase?: number; idlePhase?: number }): ProceduralLocomotionFrame;
};

export function createProceduralLocomotion(
  options: ProceduralLocomotionOptions = {},
): ProceduralLocomotion {
  const cycleDistanceScale = positiveOr(options.cycleDistanceScale, 1.35);
  const idleBreathsPerSecond = nonNegativeOr(options.idleBreathsPerSecond, 0.22);
  const maxTurnRate = positiveOr(options.maxTurnRate, Math.PI * 3);
  const maxTurnLean = nonNegativeOr(options.maxTurnLean, 0.18);
  const fullStrideSpeed = positiveOr(options.fullStrideSpeed, 1.6);
  const locomotionBlendResponse = positiveOr(options.locomotionBlendResponse, 12);
  const poseSpeedResponse = positiveOr(options.poseSpeedResponse, 10);
  const travelDirectionResponse = positiveOr(options.travelDirectionResponse, 12);
  const postureResponse = positiveOr(options.postureResponse, 10);
  const frame: ProceduralLocomotionFrame = {
    motionPhase: "idle",
    gaitPhase: 0,
    gaitCycle: 0,
    idlePhase: 0,
    distanceTravelled: 0,
    speed: 0,
    poseSpeed: 0,
    pace: "idle",
    posture: "upright",
    crouchWeight: 0,
    paceBlend: 0,
    paceIntensity: 0,
    stanceRatio: getHumanoidLocomotionProfile("idle").stanceRatio,
    targetLocomotionWeight: 0,
    locomotionWeight: 0,
    left: createCanonicalHumanoidGaitSample(),
    right: createCanonicalHumanoidGaitSample(),
    localTravelDirection: new Float32Array([0, 0, 1]),
    leftFootTarget: new Float32Array(3),
    rightFootTarget: new Float32Array(3),
    pelvisOffset: new Float32Array(3),
    slope: new Float32Array(2),
    turnLean: 0,
    breath: 0,
    verticalSpeed: 0,
    jumpAnticipation: 0,
    airborneSeconds: 0,
    landingSeconds: 0,
    landingWeight: 0,
    torsoRoll: 0,
    torsoYaw: 0,
    pelvisYaw: 0,
  };
  const blendLeft = createCanonicalHumanoidGaitSample();
  const blendRight = createCanonicalHumanoidGaitSample();
  const targetTravelDirection = new Float32Array([0, 0, 1]);
  const travelDirectionVelocity = new Float32Array(2);
  let wasGrounded = true;
  let lastAirborneVerticalSpeed = 0;
  let landingImpact = 0;
  let locomotionWeightVelocity = 0;
  let poseSpeedVelocity = 0;
  let crouchWeightVelocity = 0;

  function reset(resetOptions: { gaitPhase?: number; idlePhase?: number } = {}) {
    frame.gaitPhase = normalizeGaitPhase(finiteOr(resetOptions.gaitPhase, 0));
    frame.motionPhase = "idle";
    frame.gaitCycle = 0;
    frame.idlePhase = normalizeGaitPhase(finiteOr(resetOptions.idlePhase, 0));
    frame.distanceTravelled = 0;
    frame.speed = 0;
    frame.poseSpeed = 0;
    frame.pace = "idle";
    frame.posture = "upright";
    frame.crouchWeight = 0;
    frame.paceBlend = 0;
    frame.paceIntensity = 0;
    frame.stanceRatio = getHumanoidLocomotionProfile("idle").stanceRatio;
    frame.targetLocomotionWeight = 0;
    frame.locomotionWeight = 0;
    locomotionWeightVelocity = 0;
    poseSpeedVelocity = 0;
    crouchWeightVelocity = 0;
    travelDirectionVelocity.fill(0);
    targetTravelDirection.set([0, 0, 1]);
    frame.localTravelDirection.set([0, 0, 1]);
    frame.leftFootTarget.fill(0);
    frame.rightFootTarget.fill(0);
    frame.pelvisOffset.fill(0);
    frame.slope.fill(0);
    frame.turnLean = 0;
    frame.breath = Math.sin(frame.idlePhase * TAU);
    frame.verticalSpeed = 0;
    frame.jumpAnticipation = 0;
    frame.airborneSeconds = 0;
    frame.landingSeconds = 0;
    frame.landingWeight = 0;
    frame.torsoRoll = 0;
    frame.torsoYaw = 0;
    frame.pelvisYaw = 0;
    wasGrounded = true;
    lastAirborneVerticalSpeed = 0;
    landingImpact = 0;
    sampleCanonicalHumanoidGait(frame.gaitPhase, frame.left);
    sampleCanonicalHumanoidGait(frame.gaitPhase + 0.5, frame.right);
    return frame;
  }

  function update(input: ProceduralLocomotionInput) {
    requireVector3(input.resolvedRootDelta, "resolvedRootDelta");
    requireVector3(input.velocity, "velocity");
    requireVector3(input.facing, "facing");
    requireVector3(input.groundNormal, "groundNormal");
    const deltaSeconds = Math.max(0, finite(input.deltaSeconds, "deltaSeconds"));
    const legLength = positiveOr(input.legLength, 1);
    const hipWidth = nonNegativeOr(input.hipWidth, legLength * 0.22);
    if (input.plannedLocomotionFlight !== undefined && typeof input.plannedLocomotionFlight !== "boolean") throw new TypeError("plannedLocomotionFlight must be boolean");
    frame.jumpAnticipation = clamp(finiteOr(input.jumpAnticipation, 0), 0, 1);
    const locomotionSupported = input.isGrounded || input.plannedLocomotionFlight === true;
    const dx = input.resolvedRootDelta[0];
    const dz = input.resolvedRootDelta[2];
    const travelled = locomotionSupported ? Math.hypot(dx, dz) : 0;
    frame.distanceTravelled += travelled;
    frame.speed = Math.hypot(input.velocity[0], input.velocity[2]);
    if (deltaSeconds <= 0) {
      frame.poseSpeed = frame.speed;
      poseSpeedVelocity = 0;
    } else {
      const error = frame.poseSpeed - frame.speed;
      const decay = Math.exp(-poseSpeedResponse * deltaSeconds);
      const impulse = (poseSpeedVelocity + poseSpeedResponse * error) * deltaSeconds;
      frame.poseSpeed = Math.max(0, frame.speed + (error + impulse) * decay);
      poseSpeedVelocity = (poseSpeedVelocity - poseSpeedResponse * impulse) * decay;
    }
    frame.pace = input.pace ?? inferHumanoidLocomotionPace(frame.poseSpeed);
    frame.posture = input.posture ?? "upright";
    const targetCrouchWeight = frame.posture === "crouch" ? 1 : 0;
    if (deltaSeconds <= 0) {
      frame.crouchWeight = targetCrouchWeight;
      crouchWeightVelocity = 0;
    } else {
      const error = frame.crouchWeight - targetCrouchWeight;
      const decay = Math.exp(-postureResponse * deltaSeconds);
      const impulse = (crouchWeightVelocity + postureResponse * error) * deltaSeconds;
      frame.crouchWeight = clamp(targetCrouchWeight + (error + impulse) * decay, 0, 1);
      crouchWeightVelocity = (crouchWeightVelocity - postureResponse * impulse) * decay;
    }
    frame.paceBlend = resolveHumanoidPaceBlend(frame.poseSpeed, input.pace);
    frame.paceIntensity = samplePaceProperty(frame.paceBlend, (profile) => paceIntensity(profile));
    frame.stanceRatio = samplePaceProperty(frame.paceBlend, (pace) => getHumanoidLocomotionProfile(pace).stanceRatio);
    const inferredCycleDistanceScale = input.pace === undefined
      ? cycleDistanceScale
      : samplePaceProperty(frame.paceBlend, (pace) => getHumanoidLocomotionProfile(pace).cycleDistanceScale);
    const resolvedCycleDistanceScale = input.cycleDistanceScale === undefined
      ? positiveOr(inferredCycleDistanceScale, cycleDistanceScale)
      : positiveOr(input.cycleDistanceScale, cycleDistanceScale);
    const unwrappedPhase = frame.gaitCycle + frame.gaitPhase + travelled / Math.max(EPSILON, legLength * resolvedCycleDistanceScale);
    frame.gaitCycle = Math.floor(unwrappedPhase);
    frame.gaitPhase = normalizeGaitPhase(unwrappedPhase);
    frame.idlePhase = normalizeGaitPhase(frame.idlePhase + deltaSeconds * idleBreathsPerSecond);
    frame.verticalSpeed = input.velocity[1];
    const authoredPaceSpeed = input.pace === undefined ? fullStrideSpeed : getHumanoidLocomotionProfile(frame.pace).speedMetersPerSecond;
    const fullPoseSpeed = input.pace === undefined ? fullStrideSpeed : Math.max(.08, authoredPaceSpeed * .65);
    const desiredWeight = locomotionSupported ? clamp(frame.poseSpeed / fullPoseSpeed, 0, 1) : 0;
    frame.targetLocomotionWeight = desiredWeight;
    // Exact critically damped spring integration. Pose position and velocity
    // both remain continuous when acceleration intent changes, so stand,
    // walk, and sprint cannot pop between silhouettes at a cue boundary.
    if (deltaSeconds > 0) {
      const error = frame.locomotionWeight - desiredWeight;
      const decay = Math.exp(-locomotionBlendResponse * deltaSeconds);
      const impulse = (locomotionWeightVelocity + locomotionBlendResponse * error) * deltaSeconds;
      frame.locomotionWeight = desiredWeight + (error + impulse) * decay;
      locomotionWeightVelocity = (locomotionWeightVelocity - locomotionBlendResponse * impulse) * decay;
      frame.locomotionWeight = clamp(frame.locomotionWeight, 0, 1);
    }
    frame.breath = Math.sin(frame.idlePhase * TAU);

    if (input.plannedLocomotionFlight) {
      frame.airborneSeconds = 0;
      frame.landingSeconds = 0;
      frame.landingWeight = 0;
      frame.motionPhase = desiredWeight > 0.05 ? "locomotion" : "idle";
    } else if (!input.isGrounded) {
      frame.airborneSeconds += deltaSeconds;
      frame.landingSeconds = 0;
      frame.landingWeight = 0;
      frame.motionPhase = frame.verticalSpeed > 0.35 ? "jump" : "fall";
      lastAirborneVerticalSpeed = frame.verticalSpeed;
    } else if (!wasGrounded) {
      frame.airborneSeconds = 0;
      frame.landingSeconds = 0;
      landingImpact = clamp(Math.max(0, -lastAirborneVerticalSpeed) / Math.max(1, fullStrideSpeed), 0.35, 1);
      frame.landingWeight = landingImpact;
      frame.motionPhase = "land";
      lastAirborneVerticalSpeed = 0;
    } else if (frame.jumpAnticipation > 0.001) {
      frame.airborneSeconds = 0;
      frame.landingSeconds = 0;
      frame.landingWeight = 0;
      frame.motionPhase = "takeoff";
    } else if (frame.landingWeight > 0.01) {
      frame.landingSeconds += deltaSeconds;
      const springTime = frame.landingSeconds * 18;
      frame.landingWeight = landingImpact * (1 + springTime) * Math.exp(-springTime);
      frame.motionPhase = frame.landingWeight > 0.01 ? "land" : (desiredWeight > 0.05 ? "locomotion" : "idle");
    } else {
      frame.landingWeight = 0;
      frame.motionPhase = desiredWeight > 0.05 ? "locomotion" : "idle";
    }

    resolveLocalTravelDirection(input.velocity, input.facing, targetTravelDirection);
    dampTravelDirection(frame.localTravelDirection, targetTravelDirection, travelDirectionVelocity, travelDirectionResponse, deltaSeconds);
    sampleBlendedPaceGait(frame.gaitPhase, frame.paceBlend, frame.left, blendLeft);
    sampleBlendedPaceGait(frame.gaitPhase + 0.5, frame.paceBlend, frame.right, blendRight);
    resolveFootTarget(frame.left, 1, frame.localTravelDirection, legLength, hipWidth, frame.leftFootTarget);
    resolveFootTarget(frame.right, -1, frame.localTravelDirection, legLength, hipWidth, frame.rightFootTarget);

    frame.pelvisOffset[0] = (frame.left.pelvisLateral - frame.right.pelvisLateral) * legLength * 0.5;
    frame.pelvisOffset[1] = (frame.left.pelvisVertical + frame.right.pelvisVertical) * legLength * 0.5;
    frame.pelvisOffset[2] = 0;
    resolveSlope(input.groundNormal, frame.slope);
    frame.turnLean = clamp(-finiteOr(input.turnRate, 0) / maxTurnRate, -1, 1) * maxTurnLean;
    const primarySway = Math.sin(frame.gaitPhase * TAU);
    const secondarySway = Math.sin(frame.gaitPhase * TAU * 2 + 0.35);
    frame.torsoRoll = (primarySway * 0.032 + secondarySway * 0.006) * frame.locomotionWeight;
    const counterRotation = frame.left.armSwing - frame.right.armSwing;
    frame.torsoYaw = counterRotation * lerp(.05, .11, frame.paceIntensity) * frame.locomotionWeight;
    frame.pelvisYaw = -frame.torsoYaw * lerp(.28, .42, frame.paceIntensity);
    wasGrounded = locomotionSupported;
    return frame;
  }

  reset();
  return { frame, update, reset };
}

function resolveLocalTravelDirection(
  velocity: ArrayLike<number>,
  facing: ArrayLike<number>,
  out: Float32Array,
) {
  let forwardX = facing[0];
  let forwardZ = facing[2];
  const facingLength = Math.hypot(forwardX, forwardZ);
  if (facingLength <= EPSILON) {
    forwardX = 0;
    forwardZ = 1;
  } else {
    forwardX /= facingLength;
    forwardZ /= facingLength;
  }
  const speed = Math.hypot(velocity[0], velocity[2]);
  if (speed <= EPSILON) return out;
  const worldX = velocity[0] / speed;
  const worldZ = velocity[2] / speed;
  const rightX = forwardZ;
  const rightZ = -forwardX;
  out[0] = worldX * rightX + worldZ * rightZ;
  out[1] = 0;
  out[2] = worldX * forwardX + worldZ * forwardZ;
  return out;
}

function dampTravelDirection(
  value: Float32Array,
  target: Float32Array,
  velocity: Float32Array,
  response: number,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    value[0] = target[0];
    value[2] = target[2];
    velocity.fill(0);
    return value;
  }
  const decay = Math.exp(-response * deltaSeconds);
  for (let axis = 0; axis < 2; axis += 1) {
    const outputAxis = axis === 0 ? 0 : 2;
    const error = value[outputAxis]! - target[outputAxis]!;
    const impulse = (velocity[axis]! + response * error) * deltaSeconds;
    value[outputAxis] = target[outputAxis]! + (error + impulse) * decay;
    velocity[axis] = (velocity[axis]! - response * impulse) * decay;
  }
  value[1] = 0;
  return value;
}

function resolveFootTarget(
  sample: CanonicalHumanoidGaitSample,
  side: -1 | 1,
  direction: ArrayLike<number>,
  legLength: number,
  hipWidth: number,
  out: Float32Array,
) {
  const travel = sample.footForward * legLength;
  out[0] = side * hipWidth * 0.5 + direction[0] * travel;
  // A pure strafe can otherwise carry the trailing foot through the body's
  // centre and make the legs swap sides. Preserve a narrow lane for each
  // foot while retaining the full outward step and forward/back stride.
  const minimumSideClearance = hipWidth * 0.12;
  if (out[0] * side < minimumSideClearance) out[0] = side * minimumSideClearance;
  out[1] = sample.footLift * legLength;
  out[2] = direction[2] * travel;
  return out;
}

function resolveSlope(normal: ArrayLike<number>, out: Float32Array) {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length <= EPSILON) {
    out.fill(0);
    return out;
  }
  const x = normal[0] / length;
  const y = normal[1] / length;
  const z = normal[2] / length;
  out[0] = Math.atan2(-z, Math.max(EPSILON, y));
  out[1] = Math.atan2(x, Math.max(EPSILON, y));
  return out;
}

function requireVector3(value: ArrayLike<number>, label: string): asserts value is MotionVec3 {
  if (value.length < 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new TypeError(`${label} must contain three finite values`);
  }
}

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function finiteOr(value: unknown, fallback: number) { return finiteNumberOr(Number(value), fallback); }

function positiveOr(value: unknown, fallback: number) {
  const number = finiteOr(value, fallback);
  return number > 0 ? number : fallback;
}

function nonNegativeOr(value: unknown, fallback: number) {
  return Math.max(0, finiteOr(value, fallback));
}



function paceIntensity(pace: HumanoidLocomotionPace) {
  return pace === "idle" ? 0 : pace === "walk" ? .2 : pace === "jog" ? .48 : pace === "run" ? .74 : 1;
}

const PACES = ["idle", "walk", "jog", "run", "sprint"] as const;

/**
 * Resolves a continuous pose coordinate from accepted ground speed. An
 * explicit pace is a style ceiling, not permission to snap to its terminal
 * silhouette before the body has accelerated into it.
 */
export function resolveHumanoidPaceBlend(
  speedMetersPerSecond: number,
  pace?: HumanoidLocomotionPace,
) {
  const speed = Math.max(0, finite(speedMetersPerSecond, "speedMetersPerSecond"));
  let coordinate = PACES.length - 1;
  for (let index = 1; index < PACES.length; index += 1) {
    const previousSpeed = getHumanoidLocomotionProfile(PACES[index - 1]!).speedMetersPerSecond;
    const nextSpeed = getHumanoidLocomotionProfile(PACES[index]!).speedMetersPerSecond;
    if (speed > nextSpeed) continue;
    coordinate = index - 1 + clamp((speed - previousSpeed) / Math.max(EPSILON, nextSpeed - previousSpeed), 0, 1);
    break;
  }
  const ceiling = pace === undefined ? PACES.length - 1 : PACES.indexOf(pace);
  return Math.min(coordinate, Math.max(0, ceiling));
}

function samplePaceProperty(
  paceBlend: number,
  read: (pace: HumanoidLocomotionPace) => number,
) {
  const lowerIndex = Math.max(0, Math.min(PACES.length - 1, Math.floor(paceBlend)));
  const upperIndex = Math.min(PACES.length - 1, lowerIndex + 1);
  const amount = smootherstep(paceBlend - lowerIndex);
  return lerp(read(PACES[lowerIndex]!), read(PACES[upperIndex]!), amount);
}

function sampleBlendedPaceGait(
  phase: number,
  paceBlend: number,
  out: CanonicalHumanoidGaitSample,
  upper: CanonicalHumanoidGaitSample,
) {
  const lowerIndex = Math.max(0, Math.min(PACES.length - 1, Math.floor(paceBlend)));
  const upperIndex = Math.min(PACES.length - 1, lowerIndex + 1);
  samplePaceGait(phase, PACES[lowerIndex]!, out);
  if (upperIndex === lowerIndex) return out;
  samplePaceGait(phase, PACES[upperIndex]!, upper);
  const amount = smootherstep(paceBlend - lowerIndex);
  out.footForward = lerp(out.footForward, upper.footForward, amount);
  out.footLift = lerp(out.footLift, upper.footLift, amount);
  out.kneeDrive = lerp(out.kneeDrive, upper.kneeDrive, amount);
  out.pelvisVertical = lerp(out.pelvisVertical, upper.pelvisVertical, amount);
  out.pelvisLateral = lerp(out.pelvisLateral, upper.pelvisLateral, amount);
  out.torsoPitch = lerp(out.torsoPitch, upper.torsoPitch, amount);
  out.armSwing = lerp(out.armSwing, upper.armSwing, amount);
  return out;
}

function samplePaceGait(phase: number, pace: HumanoidLocomotionPace, sample: CanonicalHumanoidGaitSample) {
  sampleCanonicalHumanoidGait(phase, sample);
  const profile = getHumanoidLocomotionProfile(pace);
  const shape = CATALOG_GAIT_SHAPES[pace];
  if (shape) {
    sample.footForward = sampleCyclic(shape.footForward, phase);
    sample.footLift = Math.max(0, sampleCyclic(shape.footLift, phase));
    sample.kneeDrive = Math.max(0, sampleCyclic(shape.kneeDrive, phase));
    sample.pelvisVertical = sampleCyclic(shape.pelvisVertical, phase);
  } else {
    sample.footForward *= profile.strideScale;
    sample.footLift *= profile.footLiftScale;
    sample.kneeDrive *= profile.kneeDriveScale;
    sample.pelvisVertical *= profile.pelvisVerticalScale;
  }
  sample.pelvisLateral *= profile.pelvisLateralScale;
  sample.torsoPitch += profile.torsoPitchOffsetRadians;
  // The catalog has near-perfect contralateral hand/foot travel (100% of
  // readable walk samples and >96% of run samples). Mid-stance crosses under
  // the hips near quarter-cycle, so a cosine drive follows the physical
  // planted foot instead of the later zero crossing in the four-pose recipe.
  sample.armSwing = -Math.cos(normalizeGaitPhase(phase) * TAU) * profile.armSwingScale;
  return sample;
}

/**
 * Eight phase samples distilled from the editor's cooked Walk_Loop,
 * Jog_Fwd_Loop, and Sprint_Loop on the acceptance rig. Values are normalized
 * by leg length. In particular, the swing foot folds immediately after
 * toe-off, passes beneath the pelvis, then extends into contact; the old
 * four-pose curve incorrectly kept carrying it backward for most of swing.
 */
const CATALOG_GAIT_SHAPES: Partial<Record<HumanoidLocomotionPace, Readonly<{
  footForward: readonly number[];
  footLift: readonly number[];
  kneeDrive: readonly number[];
  pelvisVertical: readonly number[];
}>>> = Object.freeze({
  walk: Object.freeze({
    footForward: [.38, .185, -.007, -.17, -.34, -.39, -.11, .244],
    footLift: [0, 0, .005, .05, .073, .164, .295, .165],
    kneeDrive: [.11, .27, .12, .21, .22, .37, .68, .5],
    pelvisVertical: [-.031, -.023, .027, .019, -.031, -.023, .027, .019],
  }),
  jog: Object.freeze({
    footForward: [.637, -.106, -.634, -.708, -.767, -.006, .424, .616],
    footLift: [.07, .06, .31, .42, .51, .31, .34, .31],
    kneeDrive: [0, .7, .29, .23, .38, 1, .68, .4],
    pelvisVertical: [-.076, -.214, .005, .053, -.076, -.214, .005, .053],
  }),
  run: Object.freeze({
    footForward: [.55, -.073, -.607, -.679, -.619, -.048, .427, .621],
    footLift: [.035, .052, .243, .437, .507, .364, .306, .237],
    kneeDrive: [0, .64, .15, .34, .57, 1, .65, .25],
    pelvisVertical: [-.053, -.163, .008, .047, -.053, -.163, .008, .047],
  }),
  sprint: Object.freeze({
    footForward: [.47, -.037, -.58, -.648, -.47, -.087, .425, .625],
    footLift: [0, .043, .176, .453, .505, .417, .273, .164],
    kneeDrive: [0, .58, 0, .44, .76, 1, .62, .1],
    pelvisVertical: [-.03, -.111, .011, .042, -.03, -.111, .011, .042],
  }),
});

function sampleCyclic(values: readonly number[], phase: number) {
  const scaled = normalizeGaitPhase(phase) * values.length;
  const index = Math.floor(scaled) % values.length, amount = scaled - Math.floor(scaled);
  const previous = values[(index + values.length - 1) % values.length]!;
  const current = values[index]!;
  const next = values[(index + 1) % values.length]!;
  const afterNext = values[(index + 2) % values.length]!;
  return catmullRom(previous, current, next, afterNext, amount);
}

function catmullRom(previous: number, current: number, next: number, afterNext: number, amount: number) {
  const squared = amount * amount, cubed = squared * amount;
  return .5 * (2 * current + (-previous + next) * amount
    + (2 * previous - 5 * current + 4 * next - afterNext) * squared
    + (-previous + 3 * current - 3 * next + afterNext) * cubed);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function smootherstep(value: number) {
  const amount = clamp(value, 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
