import {
  getHumanoidLocomotionProfile,
  HUMANOID_LOCOMOTION_PACES,
  inferHumanoidLocomotionPace,
  type HumanoidLocomotionPace,
} from "./locomotion-profile.ts";

export { HUMANOID_LOCOMOTION_PACES, inferHumanoidLocomotionPace, type HumanoidLocomotionPace } from "./locomotion-profile.ts";

export const HUMANOID_LOCOMOTION_POSTURES = ["upright", "crouch"] as const;
export type HumanoidLocomotionPosture = (typeof HUMANOID_LOCOMOTION_POSTURES)[number];

export type HumanoidLocomotionIntent = Readonly<{
  /** World-space travel direction. Vertical input is ignored while grounded. */
  direction: readonly [number, number, number];
  pace?: HumanoidLocomotionPace;
  /** Body-height intent layered onto the same physics-driven gait. */
  posture?: HumanoidLocomotionPosture;
  /** Optional authored override. The pace remains useful for pose and cadence. */
  speedMetersPerSecond?: number;
  /** Expert cadence override. Omit to blend cadence continuously from speed. */
  cycleDistanceScale?: number;
  faceTravel?: boolean;
}>;

export type HumanoidLocomotionIntentPlan = Readonly<{
  pace: HumanoidLocomotionPace;
  posture: HumanoidLocomotionPosture;
  direction: readonly [number, number, number];
  velocity: readonly [number, number, number];
  speedMetersPerSecond: number;
  cycleDistanceScale: number;
  stanceRatio: number;
  liftHeightMeters: number;
  maximumStepDistanceMeters: number;
  cycleSeconds: number;
}>;

/**
 * Expands beginner locomotion intent into deterministic controller and
 * physical-performance parameters. This is portable data, not sampled poses.
 */
export function planHumanoidLocomotionIntent(
  intent: HumanoidLocomotionIntent,
): HumanoidLocomotionIntentPlan {
  const authoredSpeed = intent.speedMetersPerSecond;
  if (authoredSpeed !== undefined && (!Number.isFinite(authoredSpeed) || authoredSpeed < 0)) throw new RangeError("Humanoid locomotion speedMetersPerSecond must be finite and non-negative.");
  if (intent.cycleDistanceScale !== undefined && (!Number.isFinite(intent.cycleDistanceScale) || intent.cycleDistanceScale <= 0)) throw new RangeError("Humanoid locomotion cycleDistanceScale must be finite and positive.");
  const posture = intent.posture ?? "upright";
  if (!HUMANOID_LOCOMOTION_POSTURES.includes(posture)) throw new TypeError(`Humanoid locomotion posture ${String(posture)} is unsupported. Choose ${HUMANOID_LOCOMOTION_POSTURES.join(", ")}.`);
  const pace = intent.pace ?? (authoredSpeed === undefined ? "walk" : inferHumanoidLocomotionPace(authoredSpeed)), profile = getHumanoidLocomotionProfile(pace);
  if (!profile) throw new TypeError(`Humanoid locomotion pace ${String(pace)} is unsupported. Choose ${HUMANOID_LOCOMOTION_PACES.join(", ")}.`);
  if (!Array.isArray(intent.direction) || intent.direction.length !== 3 || !intent.direction.every(Number.isFinite)) throw new TypeError("Humanoid locomotion direction must be a finite 3D vector.");
  const horizontal = Math.hypot(intent.direction[0], intent.direction[2]);
  if (pace !== "idle" && horizontal <= 1e-12) throw new RangeError("Moving humanoid locomotion intent needs a non-zero horizontal direction.");
  const speed = authoredSpeed ?? profile.speedMetersPerSecond;
  if (pace === "idle" && speed > 1e-9) throw new RangeError("Idle humanoid locomotion cannot have a positive speed override. Choose walk, jog, run, or sprint.");
  const direction = horizontal > 1e-12
    ? [intent.direction[0] / horizontal, 0, intent.direction[2] / horizontal] as const
    : [0, 0, 0] as const;
  // Speed overrides change cadence, not anatomy. Keeping the profile's
  // distance-per-cycle while shortening the cycle prevents a fast walk or run
  // from stretching the support target beyond the character's reachable step.
  const cycleSeconds = speed > 1e-9 && profile.speedMetersPerSecond > 1e-9
    ? profile.cycleSeconds * profile.speedMetersPerSecond / speed
    : profile.cycleSeconds;
  return Object.freeze({
    pace,
    posture,
    direction,
    velocity: [direction[0] * speed, 0, direction[2] * speed] as const,
    speedMetersPerSecond: speed,
    cycleDistanceScale: intent.cycleDistanceScale ?? profile.cycleDistanceScale,
    stanceRatio: profile.stanceRatio,
    liftHeightMeters: profile.liftHeightMeters,
    maximumStepDistanceMeters: profile.maximumStepDistanceMeters,
    cycleSeconds,
  });
}
