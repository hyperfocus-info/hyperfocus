import type { MotionVec3 } from "../math.ts";
import {
  createCanonicalHumanoidGaitSample,
  normalizeGaitPhase,
  sampleCanonicalHumanoidGait,
  type CanonicalHumanoidGaitSample,
} from "./gait-recipe.ts";

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
  legLength: number;
  hipWidth: number;
};

export type ProceduralMotionPhase = "idle" | "locomotion" | "jump" | "fall" | "land";

export type ProceduralLocomotionFrame = {
  motionPhase: ProceduralMotionPhase;
  gaitPhase: number;
  gaitCycle: number;
  idlePhase: number;
  distanceTravelled: number;
  speed: number;
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
  airborneSeconds: number;
  landingSeconds: number;
  landingWeight: number;
  torsoRoll: number;
  torsoYaw: number;
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
  const frame: ProceduralLocomotionFrame = {
    motionPhase: "idle",
    gaitPhase: 0,
    gaitCycle: 0,
    idlePhase: 0,
    distanceTravelled: 0,
    speed: 0,
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
    airborneSeconds: 0,
    landingSeconds: 0,
    landingWeight: 0,
    torsoRoll: 0,
    torsoYaw: 0,
  };
  let wasGrounded = true;
  let landingImpact = 0;

  function reset(resetOptions: { gaitPhase?: number; idlePhase?: number } = {}) {
    frame.gaitPhase = normalizeGaitPhase(finiteOr(resetOptions.gaitPhase, 0));
    frame.motionPhase = "idle";
    frame.gaitCycle = 0;
    frame.idlePhase = normalizeGaitPhase(finiteOr(resetOptions.idlePhase, 0));
    frame.distanceTravelled = 0;
    frame.speed = 0;
    frame.targetLocomotionWeight = 0;
    frame.locomotionWeight = 0;
    frame.localTravelDirection.set([0, 0, 1]);
    frame.leftFootTarget.fill(0);
    frame.rightFootTarget.fill(0);
    frame.pelvisOffset.fill(0);
    frame.slope.fill(0);
    frame.turnLean = 0;
    frame.breath = Math.sin(frame.idlePhase * TAU);
    frame.verticalSpeed = 0;
    frame.airborneSeconds = 0;
    frame.landingSeconds = 0;
    frame.landingWeight = 0;
    frame.torsoRoll = 0;
    frame.torsoYaw = 0;
    wasGrounded = true;
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
    const dx = input.resolvedRootDelta[0];
    const dz = input.resolvedRootDelta[2];
    const travelled = input.isGrounded ? Math.hypot(dx, dz) : 0;
    frame.distanceTravelled += travelled;
    const unwrappedPhase = frame.gaitCycle + frame.gaitPhase + travelled / Math.max(EPSILON, legLength * cycleDistanceScale);
    frame.gaitCycle = Math.floor(unwrappedPhase);
    frame.gaitPhase = normalizeGaitPhase(unwrappedPhase);
    frame.idlePhase = normalizeGaitPhase(frame.idlePhase + deltaSeconds * idleBreathsPerSecond);
    frame.speed = Math.hypot(input.velocity[0], input.velocity[2]);
    frame.verticalSpeed = input.velocity[1];
    const desiredWeight = input.isGrounded ? clamp(frame.speed / fullStrideSpeed, 0, 1) : 0;
    frame.targetLocomotionWeight = desiredWeight;
    frame.locomotionWeight += (desiredWeight - frame.locomotionWeight)
      * (1 - Math.exp(-locomotionBlendResponse * deltaSeconds));
    frame.breath = Math.sin(frame.idlePhase * TAU);

    if (!input.isGrounded) {
      frame.airborneSeconds += deltaSeconds;
      frame.landingSeconds = 0;
      frame.landingWeight = 0;
      frame.motionPhase = frame.verticalSpeed > 0.35 ? "jump" : "fall";
    } else if (!wasGrounded) {
      frame.airborneSeconds = 0;
      frame.landingSeconds = 0;
      landingImpact = clamp(Math.max(0, -frame.verticalSpeed) / Math.max(1, fullStrideSpeed), 0.35, 1);
      frame.landingWeight = landingImpact;
      frame.motionPhase = "land";
    } else if (frame.landingWeight > 0.01) {
      frame.landingSeconds += deltaSeconds;
      const springTime = frame.landingSeconds * 18;
      frame.landingWeight = landingImpact * (1 + springTime) * Math.exp(-springTime);
      frame.motionPhase = frame.landingWeight > 0.01 ? "land" : (desiredWeight > 0.05 ? "locomotion" : "idle");
    } else {
      frame.landingWeight = 0;
      frame.motionPhase = desiredWeight > 0.05 ? "locomotion" : "idle";
    }

    resolveLocalTravelDirection(input.velocity, input.facing, frame.localTravelDirection);
    sampleCanonicalHumanoidGait(frame.gaitPhase, frame.left);
    sampleCanonicalHumanoidGait(frame.gaitPhase + 0.5, frame.right);
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
    frame.torsoYaw = (frame.left.armSwing - frame.right.armSwing) * 0.065 * frame.locomotionWeight;
    wasGrounded = input.isGrounded;
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

function finiteOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveOr(value: unknown, fallback: number) {
  const number = finiteOr(value, fallback);
  return number > 0 ? number : fallback;
}

function nonNegativeOr(value: unknown, fallback: number) {
  return Math.max(0, finiteOr(value, fallback));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
