export const HUMANOID_LOCOMOTION_PACES = ["idle", "walk", "jog", "run", "sprint"] as const;

export type HumanoidLocomotionPace = typeof HUMANOID_LOCOMOTION_PACES[number];

export type HumanoidLocomotionProfile = Readonly<{
  speedMetersPerSecond: number;
  cycleSeconds: number;
  /** Same-foot root travel during one cycle, expressed in leg lengths. */
  cycleDistanceScale: number;
  stanceRatio: number;
  liftHeightMeters: number;
  maximumStepDistanceMeters: number;
  strideScale: number;
  footLiftScale: number;
  kneeDriveScale: number;
  pelvisVerticalScale: number;
  pelvisLateralScale: number;
  torsoPitchOffsetRadians: number;
  armSwingScale: number;
}>;

/**
 * Pace shapes measured against the project's cooked human locomotion clips.
 * Walk, jog, and sprint use the source cycle durations (1.333s, .933s,
 * and .667s), observed contact ratios, and silhouette envelopes. Run is
 * interpolated between jog and sprint. The data remains rig-independent and
 * portable.
 */
export const HUMANOID_LOCOMOTION_PROFILES = Object.freeze({
  idle: profile(0, 1.2, 1, .64, .08, .3, .72, .68, .76, .8, 1, 0, .5),
  walk: profile(.753, 1.333, 1.209, .64, .1, .9, .8, .72, .8, .82, .94, 0, .5),
  jog: profile(2.706, .933, 3.041, .46, .14, 1.3, 1.45, 1.18, 1.2, 1.5, .74, .29, .72),
  run: profile(3.35, .76, 3.07, .38, .18, 1.65, 1.6, 1.34, 1.3, 1.18, .68, .43, .78),
  sprint: profile(3.866, .667, 3.106, .175, .23, 2, 1.7, 1.48, 1.38, 1.28, .64, .54, .8),
});

export function getHumanoidLocomotionProfile(pace: HumanoidLocomotionPace) {
  return HUMANOID_LOCOMOTION_PROFILES[pace];
}

/** Selects the nearest authored pace envelope for a physical ground speed. */
export function inferHumanoidLocomotionPace(speedMetersPerSecond: number): HumanoidLocomotionPace {
  if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond < 0) {
    throw new RangeError("Humanoid locomotion speedMetersPerSecond must be finite and non-negative.");
  }
  if (speedMetersPerSecond < .08) return "idle";
  if (speedMetersPerSecond < 1.75) return "walk";
  if (speedMetersPerSecond < 3.025) return "jog";
  if (speedMetersPerSecond < 3.61) return "run";
  return "sprint";
}

function profile(
  speedMetersPerSecond: number,
  cycleSeconds: number,
  cycleDistanceScale: number,
  stanceRatio: number,
  liftHeightMeters: number,
  maximumStepDistanceMeters: number,
  strideScale: number,
  footLiftScale: number,
  kneeDriveScale: number,
  pelvisVerticalScale: number,
  pelvisLateralScale: number,
  torsoPitchOffsetRadians: number,
  armSwingScale: number,
): HumanoidLocomotionProfile {
  return Object.freeze({
    speedMetersPerSecond,
    cycleSeconds,
    cycleDistanceScale,
    stanceRatio,
    liftHeightMeters,
    maximumStepDistanceMeters,
    strideScale,
    footLiftScale,
    kneeDriveScale,
    pelvisVerticalScale,
    pelvisLateralScale,
    torsoPitchOffsetRadians,
    armSwingScale,
  });
}
