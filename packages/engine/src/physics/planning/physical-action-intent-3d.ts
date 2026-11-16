import { clamp, roundDecimal } from "@hyperfocus/utilities/math";
import { tuple3 } from "../../math/tuples.ts";
import { requiredPhysicalEffectorPeakSpeed3D, type PhysicalEffectorPath3D } from "../performance/effector-path-3d.ts";

export type PhysicalActionResponse3D = "snappy" | "natural" | "weighty";
export type PhysicalActionStyle3D = "straight" | "hook" | "overhand" | "kick" | "shove" | "weapon-swing";

export type PhysicalActionIntentPlan3D = {
  response: PhysicalActionResponse3D;
  anticipationFrames: number;
  travelFrames: number;
  consequenceFrames: number;
  recoveryFrames: number;
  contactToleranceFrames: number;
  effectorDrive: {
    anticipationDistanceMeters: number;
    contactDistanceMeters: number;
    followThroughDistanceMeters: number;
    recoveryDistanceMeters: number;
    peakSpeedMetersPerSecond: number;
    trackingGainPerSecond: number;
    velocityGain: number;
    maxTorqueImpulse: number;
    supportMode: "auto";
    path?: PhysicalEffectorPath3D;
    orientation?: {
      mode: "turn";
      axisWorld: [number, number, number];
      anticipationDegrees: number;
      contactDegrees: number;
      followThroughDegrees: number;
      recoveryDegrees: number;
      peakAngularSpeedDegreesPerSecond: number;
      trackingGainPerSecond: number;
      maxTorqueImpulse: number;
    };
  };
  step: {
    speedMetersPerSecond: number;
    predictionSeconds: number;
    maximumDistance: number;
    liftHeight: number;
    durationFrames: number;
  };
};

type ResponseTuning = {
  minimumAnticipationSeconds: number;
  maximumAnticipationSeconds: number;
  linearAcceleration: number;
  angularAcceleration: number;
  consequenceBaseSeconds: number;
  consequenceScale: number;
  recoveryBaseSeconds: number;
  recoveryScale: number;
  effectorSpeedScale: number;
  trackingGainPerSecond: number;
};

const RESPONSE: Readonly<Record<PhysicalActionResponse3D, ResponseTuning>> = {
  snappy: { minimumAnticipationSeconds: .1, maximumAnticipationSeconds: .32, linearAcceleration: 90, angularAcceleration: 2_880, consequenceBaseSeconds: .18, consequenceScale: .55, recoveryBaseSeconds: .28, recoveryScale: .62, effectorSpeedScale: 1.35, trackingGainPerSecond: 10 },
  natural: { minimumAnticipationSeconds: .18, maximumAnticipationSeconds: .5, linearAcceleration: 60, angularAcceleration: 2_160, consequenceBaseSeconds: .28, consequenceScale: .72, recoveryBaseSeconds: .42, recoveryScale: .8, effectorSpeedScale: 1.2, trackingGainPerSecond: 8 },
  weighty: { minimumAnticipationSeconds: .3, maximumAnticipationSeconds: .75, linearAcceleration: 40, angularAcceleration: 1_440, consequenceBaseSeconds: .42, consequenceScale: .9, recoveryBaseSeconds: .62, recoveryScale: 1, effectorSpeedScale: 1.1, trackingGainPerSecond: 6 },
};

/** Converts compact physical intent into smooth, editable action timing and actuator defaults. */
export function planPhysicalActionIntent3D(options: {
  frameRate: number;
  distanceMeters: number;
  speedMetersPerSecond: number;
  direction?: readonly [number, number, number];
  angularVelocityDegreesPerSecond?: readonly [number, number, number];
  response?: PhysicalActionResponse3D;
  actionStyle?: PhysicalActionStyle3D;
  actionSide?: -1 | 1;
}): PhysicalActionIntentPlan3D {
  const frameRate = positive(options.frameRate, "physical action frameRate"), distance = positive(options.distanceMeters, "physical action distanceMeters"), speed = positive(options.speedMetersPerSecond, "physical action speedMetersPerSecond"), response = options.response ?? "natural", tuning = RESPONSE[response];
  if (!tuning) throw new TypeError(`Physical action response ${String(response)} is unsupported. Choose snappy, natural, or weighty.`);
  const angularVelocity = vector(options.angularVelocityDegreesPerSecond ?? [0, 0, 0], "physical action angularVelocityDegreesPerSecond"), angularSpeed = Math.hypot(...angularVelocity), direction = normalized(options.direction ?? [1, 0, 0], "physical action direction"), travelSeconds = distance / speed, actionStyle = options.actionStyle ?? "straight", actionSide = options.actionSide ?? 1;
  if (!["straight", "hook", "overhand", "kick", "shove", "weapon-swing"].includes(actionStyle)) throw new TypeError(`Physical action style ${String(actionStyle)} is unsupported.`);
  if (actionSide !== -1 && actionSide !== 1) throw new RangeError("physical action side must be -1 or 1.");
  const rampSeconds = Math.max(speed / tuning.linearAcceleration, angularSpeed / tuning.angularAcceleration), anticipationSeconds = clamp(rampSeconds, tuning.minimumAnticipationSeconds, tuning.maximumAnticipationSeconds);
  const severity = Math.sqrt(speed / 12) + Math.sqrt(distance / 2) + angularSpeed / 1_440;
  const consequenceSeconds = clamp(tuning.consequenceBaseSeconds + severity * .16 * tuning.consequenceScale, .22, 1.5), recoverySeconds = clamp(tuning.recoveryBaseSeconds + severity * .2 * tuning.recoveryScale, .35, 2);
  const anticipationFrames = frames(anticipationSeconds, frameRate), travelFrames = frames(travelSeconds, frameRate), consequenceFrames = frames(consequenceSeconds, frameRate), recoveryFrames = frames(recoverySeconds, frameRate), basePeakSpeed = speed * tuning.effectorSpeedScale;
  const followThroughFrames = Math.max(1, Math.min(Math.round(frameRate * .18), consequenceFrames)), returnFrames = Math.max(1, consequenceFrames - followThroughFrames);
  const phaseCapacity = (phaseFrames: number) => basePeakSpeed * phaseFrames / frameRate / 1.5;
  const anticipationDistance = Math.min(phaseCapacity(anticipationFrames) * .82, clamp(distance * .1, .06, .3));
  // Contact intent names a collider-surface gap, so the articulated effector must
  // actually traverse that gap. The old 32% heuristic left the remaining travel
  // to the one-shot launch impulse; planted limbs then decelerated before contact
  // and produced scene-dependent misses despite valid target-at-launch intent.
  const contactDistance = round(distance);
  const followThroughDistance = Math.min(phaseCapacity(followThroughFrames) * .82, clamp(contactDistance * .4, .04, .28)), recoveryDistance = Math.min(phaseCapacity(returnFrames) * .82, clamp(anticipationDistance + followThroughDistance, .08, .45));
  const path = planPhysicalActionStylePath3D({ style: actionStyle, distanceMeters: contactDistance, side: actionSide }), peakSpeed = Math.max(basePeakSpeed, requiredPhysicalEffectorPeakSpeed3D({ path, direction, distanceMeters: contactDistance, durationSeconds: travelFrames / frameRate }), requiredPhysicalEffectorPeakSpeed3D({ path, direction, distanceMeters: followThroughDistance, durationSeconds: followThroughFrames / frameRate }));
  const maxTorqueImpulse = round(clamp(speed * .25, .5, 8));
  const orientation = angularSpeed > 1e-6 ? planOrientation(angularVelocity, angularSpeed, anticipationFrames, travelFrames, followThroughFrames, returnFrames, frameRate, tuning.trackingGainPerSecond) : undefined;
  return {
    response,
    anticipationFrames,
    travelFrames,
    consequenceFrames,
    recoveryFrames,
    contactToleranceFrames: response === "snappy" ? 0 : 1,
    effectorDrive: {
      anticipationDistanceMeters: round(anticipationDistance),
      contactDistanceMeters: round(contactDistance),
      followThroughDistanceMeters: round(followThroughDistance),
      recoveryDistanceMeters: round(recoveryDistance),
      // Never round a feasibility bound downward; the expanded cue validates the
      // same curved path against this value at full precision.
      peakSpeedMetersPerSecond: roundUp(peakSpeed),
      trackingGainPerSecond: tuning.trackingGainPerSecond,
      velocityGain: .08,
      maxTorqueImpulse,
      supportMode: "auto",
      ...optionalPath(path),
      ...(orientation ? { orientation: { ...orientation, maxTorqueImpulse } } : {}),
    },
    step: {
      speedMetersPerSecond: round(clamp(speed * .18, .5, 6)),
      predictionSeconds: round(clamp(anticipationSeconds * .8, .12, .4)),
      maximumDistance: round(clamp(distance * .22, .25, 1.2)),
      liftHeight: round(clamp(.1 + speed / 300, .12, .24)),
      durationFrames: anticipationFrames,
    },
  };
}

export function planPhysicalActionStylePath3D(options: { style: PhysicalActionStyle3D; distanceMeters: number; side?: -1 | 1 }): PhysicalEffectorPath3D | undefined { const distance = positive(options.distanceMeters, "physical action style distanceMeters"), style = options.style, curved = style === "hook" || style === "weapon-swing" ? "horizontal" : style === "overhand" || style === "kick" ? "vertical" : undefined; if (!curved) return undefined; const scale = style === "weapon-swing" ? .9 : style === "hook" ? .72 : style === "overhand" ? .62 : .35; return { mode: "arc", plane: curved, heightMeters: round(clamp(distance * scale, .06, .45)), side: options.side ?? 1 }; }
function optionalPath(path: PhysicalEffectorPath3D | undefined): { path?: PhysicalEffectorPath3D } { return path ? { path } : {}; }

function planOrientation(angularVelocity: readonly [number, number, number], angularSpeed: number, anticipationFrames: number, travelFrames: number, followThroughFrames: number, returnFrames: number, frameRate: number, trackingGainPerSecond: number): NonNullable<PhysicalActionIntentPlan3D["effectorDrive"]["orientation"]> {
  const phaseDegrees = (phaseFrames: number, scale: number) => angularSpeed * phaseFrames / frameRate / 1.5 * scale;
  const anticipationDegrees = -phaseDegrees(anticipationFrames, .28), contactDegrees = phaseDegrees(travelFrames, .82), followThroughDegrees = phaseDegrees(followThroughFrames, .58), recoveryCapacity = phaseDegrees(returnFrames, .82), recoveryDegrees = -Math.min(recoveryCapacity, Math.max(0, anticipationDegrees + contactDegrees + followThroughDegrees));
  return { mode: "turn", axisWorld: tuple3(round((angularVelocity[0]!) / angularSpeed), round((angularVelocity[1]!) / angularSpeed), round((angularVelocity[2]!) / angularSpeed)), anticipationDegrees: round(anticipationDegrees), contactDegrees: round(contactDegrees), followThroughDegrees: round(followThroughDegrees), recoveryDegrees: round(recoveryDegrees), peakAngularSpeedDegreesPerSecond: round(angularSpeed), trackingGainPerSecond, maxTorqueImpulse: .25 };
}

function frames(seconds: number, frameRate: number) { return Math.max(1, Math.ceil(seconds * frameRate - 1e-9)); }

function round(value: number) { return roundDecimal(value, 6); }
function roundUp(value: number) { return Math.ceil(value * 1_000) / 1_000; }
function positive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite.`); return value; }
function vector(value: readonly [number, number, number], label: string): readonly [number, number, number] { if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new TypeError(`${label} must be a finite 3D vector.`); return value; }
function normalized(value: readonly [number, number, number], label: string): readonly [number, number, number] { const input = vector(value, label), length = Math.hypot(...input); if (length <= 1e-12) throw new RangeError(`${label} must be non-zero.`); return [input[0] / length, input[1] / length, input[2] / length]; }
