export type CanonicalHumanoidGaitSample = {
  footForward: number;
  footLift: number;
  kneeDrive: number;
  pelvisVertical: number;
  pelvisLateral: number;
  torsoPitch: number;
  armSwing: number;
};

export type CanonicalHumanoidGaitKeyPose = Readonly<CanonicalHumanoidGaitSample & {
  name: "contact" | "down" | "passing" | "up";
  phase: number;
}>;

export type CanonicalHumanoidGaitWindow = Readonly<{
  foot: "left" | "right";
  kind: "support" | "step";
  frameOffset: number;
  durationFrames: number;
}>;

/**
 * Normalized semantic gait data. Distances are fractions of leg length and
 * rotations are radians. The recipe contains no mesh-specific joint names.
 */
export const canonicalHumanoidGaitV1: readonly CanonicalHumanoidGaitKeyPose[] = Object.freeze([
  Object.freeze({
    name: "contact",
    phase: 0,
    footForward: 0.42,
    footLift: 0.02,
    kneeDrive: 0.08,
    pelvisVertical: 0.025,
    pelvisLateral: -0.026,
    torsoPitch: 0.14,
    armSwing: -0.55,
  }),
  Object.freeze({
    name: "down",
    phase: 0.25,
    footForward: 0.24,
    footLift: 0.03,
    kneeDrive: 0.32,
    pelvisVertical: -0.07,
    pelvisLateral: -0.018,
    torsoPitch: 0.18,
    armSwing: -0.24,
  }),
  Object.freeze({
    name: "passing",
    phase: 0.5,
    footForward: -0.08,
    footLift: 0.2,
    kneeDrive: 0.68,
    pelvisVertical: 0.015,
    pelvisLateral: 0.025,
    torsoPitch: 0.14,
    armSwing: 0.22,
  }),
  Object.freeze({
    name: "up",
    phase: 0.75,
    footForward: -0.38,
    footLift: 0.3,
    kneeDrive: 1,
    pelvisVertical: 0.05,
    pelvisLateral: 0.018,
    torsoPitch: 0.12,
    armSwing: 0.55,
  }),
]);

export function createCanonicalHumanoidGaitSample(): CanonicalHumanoidGaitSample {
  return {
    footForward: 0,
    footLift: 0,
    kneeDrive: 0,
    pelvisVertical: 0,
    pelvisLateral: 0,
    torsoPitch: 0,
    armSwing: 0,
  };
}

export function normalizeGaitPhase(phase: number) {
  if (!Number.isFinite(phase)) throw new TypeError("gait phase must be finite");
  return ((phase % 1) + 1) % 1;
}

/**
 * Quantizes the shared procedural gait cycle into portable, editable contact
 * windows. Sampling frame centers keeps arbitrary-range authoring deterministic
 * and avoids zero-duration contacts at exact phase boundaries.
 */
export function planCanonicalHumanoidGaitWindows(options: {
  durationFrames: number;
  cycleFrames: number;
  initialPhase?: number;
  stanceRatio?: number;
}): CanonicalHumanoidGaitWindow[] {
  if (!Number.isSafeInteger(options.durationFrames) || options.durationFrames <= 0) throw new RangeError("durationFrames must be a positive integer");
  if (!Number.isSafeInteger(options.cycleFrames) || options.cycleFrames < 4) throw new RangeError("cycleFrames must be an integer of at least 4");
  const initialPhase = options.initialPhase ?? 0, stanceRatio = options.stanceRatio ?? .6;
  if (!Number.isFinite(initialPhase)) throw new TypeError("initialPhase must be finite");
  if (!Number.isFinite(stanceRatio) || stanceRatio <= 0 || stanceRatio >= 1) throw new RangeError("stanceRatio must be between 0 and 1");
  const windows: CanonicalHumanoidGaitWindow[] = [];
  for (const [foot, offset] of [["left", 0], ["right", .5]] as const) {
    let start = 0, previous = gaitWindowKind(initialPhase, offset, .5, options.cycleFrames, stanceRatio);
    for (let frame = 1; frame <= options.durationFrames; frame++) {
      const current = frame < options.durationFrames ? gaitWindowKind(initialPhase, offset, frame + .5, options.cycleFrames, stanceRatio) : undefined;
      if (current === previous) continue;
      windows.push({ foot, kind: previous, frameOffset: start, durationFrames: frame - start });
      start = frame;
      if (current) previous = current;
    }
  }
  return windows.sort((a, b) => a.frameOffset - b.frameOffset || a.foot.localeCompare(b.foot));
}

export function sampleCanonicalHumanoidGait(
  phase: number,
  out: CanonicalHumanoidGaitSample = createCanonicalHumanoidGaitSample(),
): CanonicalHumanoidGaitSample {
  const normalized = normalizeGaitPhase(phase);
  const scaled = normalized * canonicalHumanoidGaitV1.length;
  const currentIndex = Math.floor(scaled) % canonicalHumanoidGaitV1.length;
  const amount = scaled - Math.floor(scaled);
  const previous = canonicalHumanoidGaitV1[(currentIndex + canonicalHumanoidGaitV1.length - 1) % canonicalHumanoidGaitV1.length];
  const current = canonicalHumanoidGaitV1[currentIndex];
  const next = canonicalHumanoidGaitV1[(currentIndex + 1) % canonicalHumanoidGaitV1.length];
  const afterNext = canonicalHumanoidGaitV1[(currentIndex + 2) % canonicalHumanoidGaitV1.length];
  out.footForward = cyclicCatmullRom(previous.footForward, current.footForward, next.footForward, afterNext.footForward, amount);
  out.footLift = Math.max(0, cyclicCatmullRom(previous.footLift, current.footLift, next.footLift, afterNext.footLift, amount));
  out.kneeDrive = Math.max(0, cyclicCatmullRom(previous.kneeDrive, current.kneeDrive, next.kneeDrive, afterNext.kneeDrive, amount));
  out.pelvisVertical = cyclicCatmullRom(previous.pelvisVertical, current.pelvisVertical, next.pelvisVertical, afterNext.pelvisVertical, amount);
  out.pelvisLateral = cyclicCatmullRom(previous.pelvisLateral, current.pelvisLateral, next.pelvisLateral, afterNext.pelvisLateral, amount);
  out.torsoPitch = cyclicCatmullRom(previous.torsoPitch, current.torsoPitch, next.torsoPitch, afterNext.torsoPitch, amount);
  out.armSwing = cyclicCatmullRom(previous.armSwing, current.armSwing, next.armSwing, afterNext.armSwing, amount);
  return out;
}

function cyclicCatmullRom(previous: number, current: number, next: number, afterNext: number, amount: number) {
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  return 0.5 * (
    2 * current
    + (-previous + next) * amount
    + (2 * previous - 5 * current + 4 * next - afterNext) * amountSquared
    + (-previous + 3 * current - 3 * next + afterNext) * amountCubed
  );
}

function gaitWindowKind(initialPhase: number, footOffset: number, frameCenter: number, cycleFrames: number, stanceRatio: number): "support" | "step" {
  return normalizeGaitPhase(initialPhase + footOffset + frameCenter / cycleFrames) < stanceRatio ? "support" : "step";
}
