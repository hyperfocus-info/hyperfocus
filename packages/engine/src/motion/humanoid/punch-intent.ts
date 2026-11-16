import { tuple3 } from "../../math/tuples.ts";
import { planPhysicalActionIntent3D, type PhysicalActionIntentPlan3D, type PhysicalActionResponse3D } from "../../physics/planning/physical-action-intent-3d.ts";

export type HumanoidPunchHand = "left" | "right";
export type HumanoidPunchStyle = "straight" | "hook" | "overhand";

export type HumanoidPunchIntent = Readonly<{
  /** World-space contact point. */
  target: readonly [number, number, number];
  hand?: HumanoidPunchHand;
  style?: HumanoidPunchStyle;
  power?: number;
  speedMetersPerSecond?: number;
  distanceMeters?: number;
  response?: PhysicalActionResponse3D;
}>;

export type HumanoidPunchIntentPlan = Readonly<{
  intent: Readonly<Required<Pick<HumanoidPunchIntent, "target" | "hand" | "style" | "power" | "speedMetersPerSecond" | "distanceMeters" | "response">>>;
  physical: PhysicalActionIntentPlan3D;
  totalFrames: number;
  /** Normalized action phase boundaries. */
  phases: Readonly<{ anticipation: number; contact: number; followThrough: number; recovery: 1 }>;
}>;

/** Shared compact punch intent for live controllers and portable video macros. */
export function planHumanoidPunchIntent(options: HumanoidPunchIntent & { frameRate?: number }): HumanoidPunchIntentPlan {
  if (!Array.isArray(options.target) || options.target.length !== 3 || !options.target.every(Number.isFinite)) throw new TypeError("Humanoid punch target must be a finite world-space 3D point.");
  const hand = options.hand ?? "right", style = options.style ?? "straight", power = options.power ?? 1, speed = options.speedMetersPerSecond ?? 8, distance = options.distanceMeters ?? .65, response = options.response ?? "natural", frameRate = options.frameRate ?? 60;
  if (hand !== "left" && hand !== "right") throw new TypeError("Humanoid punch hand must be left or right.");
  if (!Number.isFinite(power) || power < .1 || power > 2) throw new RangeError("Humanoid punch power must be from 0.1 through 2.");
  if (style !== "straight" && style !== "hook" && style !== "overhand") throw new TypeError("Humanoid punch style must be straight, hook, or overhand.");
  const physical = planPhysicalActionIntent3D({ frameRate, distanceMeters: distance, speedMetersPerSecond: speed, response, actionStyle: style, actionSide: hand === "left" ? 1 : -1 });
  const totalFrames = physical.anticipationFrames + physical.travelFrames + physical.consequenceFrames + physical.recoveryFrames;
  const followFrames = Math.max(1, Math.min(Math.round(frameRate * .18), physical.consequenceFrames));
  return Object.freeze({
    intent: Object.freeze({ target: tuple3(options.target[0], options.target[1], options.target[2]), hand, style, power, speedMetersPerSecond: speed, distanceMeters: distance, response }),
    physical,
    totalFrames,
    phases: Object.freeze({
      anticipation: physical.anticipationFrames / totalFrames,
      contact: (physical.anticipationFrames + physical.travelFrames) / totalFrames,
      followThrough: (physical.anticipationFrames + physical.travelFrames + followFrames) / totalFrames,
      recovery: 1,
    }),
  });
}
