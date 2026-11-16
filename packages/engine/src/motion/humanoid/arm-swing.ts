import { clamp01 } from "@hyperfocus/utilities/math";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { PoseTwoBoneIKSolver } from "../solvers/pose-ik.ts";
import type { WorldPose } from "../solvers/world-pose.ts";
import { normalizeGaitPhase } from "./gait-recipe.ts";
import type { HumanoidLocomotionPace } from "./locomotion-profile.ts";

export type HumanoidArmRuntime = {
  upper: number;
  solver: PoseTwoBoneIKSolver | null;
  length: number;
};

export type HumanoidArmSmoothingState = {
  readonly target: Float32Array;
  readonly targetVelocity: Float32Array;
  readonly pole: Float32Array;
  readonly poleVelocity: Float32Array;
  initialized: boolean;
};

export function createHumanoidArmSmoothingState(): HumanoidArmSmoothingState {
  return {
    target: new Float32Array(3),
    targetVelocity: new Float32Array(3),
    pole: new Float32Array(3),
    poleVelocity: new Float32Array(3),
    initialized: false,
  };
}

export function resetHumanoidArmSmoothingState(state: HumanoidArmSmoothingState) {
  state.target.fill(0);
  state.targetVelocity.fill(0);
  state.pole.fill(0);
  state.poleVelocity.fill(0);
  state.initialized = false;
}

export function solveArm(
  limb: HumanoidArmRuntime,
  side: -1 | 1,
  pose: PoseBuffer,
  world: WorldPose,
  armSwing: number,
  locomotionWeight: number,
  paceIntensity: number,
  paceBlend: number,
  gaitPhase: number,
  localTravelDirection: ArrayLike<number>,
  facing: { x: number; y: number; z: number },
  airborneSettleWeight: number,
  airbornePhase: number,
  gripTarget: ArrayLike<number> | null,
  gripWeight: number,
  target: Float32Array,
  pole: Float32Array,
  smoothing: HumanoidArmSmoothingState,
  deltaSeconds: number,
  targetResponse: number,
  poleResponse: number,
) {
  if (!limb.solver) return;
  const shoulderOffset = limb.upper * 3;
  const rightX = facing.z, rightZ = -facing.x;
  const travelX = rightX * localTravelDirection[0] + facing.x * localTravelDirection[2];
  const travelZ = rightZ * localTravelDirection[0] + facing.z * localTravelDirection[2];
  const runningDrive = clamp01((paceIntensity - .2) / .8);
  const catalogLateral = sampleBlendedArmPath(paceBlend, gaitPhase, "lateral", .11);
  const catalogDown = sampleBlendedArmPath(paceBlend, gaitPhase, "down", .955);
  const catalogForward = sampleBlendedArmPath(paceBlend, gaitPhase, "forward", -armSwing * .45);
  const catalogElbowLateral = sampleBlendedArmPath(paceBlend, gaitPhase, "elbowLateral", .85);
  const catalogElbowDown = sampleBlendedArmPath(paceBlend, gaitPhase, "elbowDown", -.35);
  const catalogElbowForward = sampleBlendedArmPath(paceBlend, gaitPhase, "elbowForward", .15);
  // Start and stop from a relaxed hanging arm. Locomotion blends toward the
  // measured shoulder-relative hand path; explicit hand intents remain the
  // final layer and can interrupt either arm independently.
  let lateralReach = lerp(.11, catalogLateral, locomotionWeight);
  let verticalReach = lerp(.955, catalogDown, locomotionWeight);
  let foreAftReach = catalogForward * locomotionWeight;
  // Launch does not reset either arm. The existing shoulder-relative spring
  // carries the incoming gait velocity, then settles toward a small airborne
  // balance loop measured from the repository's universal Jump_Loop. Landing
  // uses the inverse envelope, so the same spring returns to the outgoing
  // stride without a clip switch or a one-frame ownership change.
  const flightWeight = clamp01(airborneSettleWeight) * (1 - clamp01(gripWeight));
  const airborneCycle = Math.sin(normalizeGaitPhase(airbornePhase) * Math.PI * 2);
  const airborneLateral = .88 + airborneCycle * .025;
  const airborneDown = (side === 1 ? .3 : .18) + airborneCycle * side * .035;
  const airborneForward = (side === 1 ? .27 : -.33) + airborneCycle * .025;
  lateralReach = lerp(lateralReach, airborneLateral, flightWeight);
  verticalReach = lerp(verticalReach, airborneDown, flightWeight);
  foreAftReach = lerp(foreAftReach, airborneForward, flightWeight);
  const maximumReach = lerp(.97, .76, runningDrive), targetRadius = Math.hypot(foreAftReach, lateralReach, verticalReach);
  const radiusScale = targetRadius > maximumReach ? maximumReach / targetRadius : 1;
  foreAftReach *= radiusScale; lateralReach *= radiusScale; verticalReach *= radiusScale;
  target[0] = world.translations[shoulderOffset]
    + rightX * side * limb.length * lateralReach
    + travelX * limb.length * foreAftReach;
  target[1] = world.translations[shoulderOffset + 1] - limb.length * verticalReach;
  target[2] = world.translations[shoulderOffset + 2]
    + rightZ * side * limb.length * lateralReach
    + travelZ * limb.length * foreAftReach;
  if (gripTarget && gripWeight > 0) {
    target[0] = lerp(target[0], gripTarget[0], gripWeight);
    target[1] = lerp(target[1], gripTarget[1], gripWeight);
    target[2] = lerp(target[2], gripTarget[2], gripWeight);
  }
  // The hand target alone does not define a human-looking arm: the elbow can
  // still solve into an anatomically valid but visually mechanical plane. Use
  // the catalog's shoulder-relative elbow arc as the pole direction, then
  // yield that arc to explicit per-hand intents such as a punch or prop grip.
  const catalogPoleWeight = locomotionWeight * (1 - clamp01(gripWeight));
  const elbowLateral = lerp(lerp(.85, catalogElbowLateral, catalogPoleWeight), .66, flightWeight);
  const elbowDown = lerp(lerp(-.35, catalogElbowDown, catalogPoleWeight), -.08, flightWeight);
  const elbowForward = lerp(lerp(.15, catalogElbowForward, catalogPoleWeight), side === 1 ? .2 : -.2, flightWeight);
  pole[0] = rightX * side * elbowLateral + travelX * elbowForward;
  pole[1] = elbowDown;
  pole[2] = rightZ * side * elbowLateral + travelZ * elbowForward;
  // Smooth in shoulder-relative space. A world-space spring would leave the
  // hands behind while the character runs, stretching both arms toward an
  // obsolete point even though the authored hand path itself is continuous.
  target[0] -= world.translations[shoulderOffset];
  target[1] -= world.translations[shoulderOffset + 1];
  target[2] -= world.translations[shoulderOffset + 2];
  if (gripTarget && gripWeight > 0) {
    // Explicit grips remain exact. Seed the procedural state from that pose so
    // releasing the prop returns to gait without a one-frame elbow reset.
    smoothing.target.set(target);
    smoothing.pole.set(pole);
    smoothing.targetVelocity.fill(0);
    smoothing.poleVelocity.fill(0);
    smoothing.initialized = true;
  } else if (!smoothing.initialized || deltaSeconds <= 0) {
    smoothing.target.set(target);
    smoothing.pole.set(pole);
    smoothing.targetVelocity.fill(0);
    smoothing.poleVelocity.fill(0);
    smoothing.initialized = true;
  } else {
    dampVector(smoothing.target, target, smoothing.targetVelocity, targetResponse, deltaSeconds);
    dampVector(smoothing.pole, pole, smoothing.poleVelocity, poleResponse, deltaSeconds);
    pole.set(smoothing.pole);
  }
  target[0] = world.translations[shoulderOffset] + smoothing.target[0]!;
  target[1] = world.translations[shoulderOffset + 1] + smoothing.target[1]!;
  target[2] = world.translations[shoulderOffset + 2] + smoothing.target[2]!;
  limb.solver.apply(pose, target, pole, { worldIsCurrent: true });
}

function dampVector(
  value: Float32Array,
  target: Float32Array,
  velocity: Float32Array,
  response: number,
  deltaSeconds: number,
) {
  const decay = Math.exp(-response * deltaSeconds);
  for (let axis = 0; axis < 3; axis += 1) {
    const error = value[axis]! - target[axis]!;
    const impulse = (velocity[axis]! + response * error) * deltaSeconds;
    value[axis] = target[axis]! + (error + impulse) * decay;
    velocity[axis] = (velocity[axis]! - response * impulse) * decay;
  }
}

/** Shoulder-relative hand paths sampled from the editor's cooked locomotion
 * clips and normalized by the acceptance rig's 0.547 m arm length. */
const CATALOG_ARM_PATHS: Record<Exclude<HumanoidLocomotionPace, "idle">, Readonly<{
  lateral: readonly number[];
  down: readonly number[];
  forward: readonly number[];
  elbowLateral: readonly number[];
  elbowDown: readonly number[];
  elbowForward: readonly number[];
}>> = Object.freeze({
  walk: Object.freeze({
    lateral: [.139, .161, .221, .247, .23, .214, .19, .159],
    down: [.945, .941, .929, .874, .804, .839, .918, .941],
    forward: [-.099, -.115, .033, .267, .426, .355, .101, -.033],
    elbowLateral: [.075, .088, .137, .179, .196, .188, .152, .106],
    elbowDown: [-.459, -.455, -.464, -.468, -.457, -.464, -.466, -.463],
    elbowForward: [-.186, -.194, -.128, -.013, .071, .029, -.106, -.163],
  }),
  jog: Object.freeze({
    lateral: [.439, .426, .201, .064, .013, .43, .506, .459],
    down: [.444, .625, .675, .59, .481, .444, .442, .442],
    forward: [-.45, -.018, .185, .366, .484, .289, -.141, -.371],
    elbowLateral: [.091, .28, .336, .298, .249, .362, .221, .117],
    elbowDown: [-.088, -.26, -.338, -.402, -.433, -.296, -.148, -.095],
    elbowForward: [-.486, -.325, -.157, -.033, .048, -.183, -.426, -.479],
  }),
  run: Object.freeze({
    lateral: [.478, .463, .244, .108, .063, .307, .41, .456],
    down: [.42, .59, .667, .601, .512, .531, .527, .475],
    forward: [-.43, -.069, .152, .331, .442, .257, -.084, -.333],
    elbowLateral: [.14, .288, .334, .3, .253, .318, .23, .161],
    elbowDown: [-.056, -.217, -.32, -.392, -.431, -.334, -.2, -.099],
    elbowForward: [-.475, -.346, -.192, -.077, -.008, -.19, -.394, -.463],
  }),
  sprint: Object.freeze({
    lateral: [.517, .499, .287, .152, .112, .183, .314, .452],
    down: [.395, .556, .658, .612, .543, .618, .612, .508],
    forward: [-.41, -.119, .119, .296, .399, .225, -.027, -.294],
    elbowLateral: [.188, .296, .331, .302, .256, .274, .238, .205],
    elbowDown: [-.024, -.174, -.302, -.382, -.428, -.371, -.252, -.102],
    elbowForward: [-.464, -.366, -.227, -.121, -.064, -.197, -.362, -.446],
  }),
});

const ARM_PACES = ["idle", "walk", "jog", "run", "sprint"] as const;
type ArmPathChannel = keyof (typeof CATALOG_ARM_PATHS)["walk"];

function sampleBlendedArmPath(
  paceBlend: number,
  phase: number,
  channel: ArmPathChannel,
  idle: number,
) {
  const lowerIndex = Math.max(0, Math.min(ARM_PACES.length - 1, Math.floor(paceBlend)));
  const upperIndex = Math.min(ARM_PACES.length - 1, lowerIndex + 1);
  const read = (index: number) => {
    const pace = ARM_PACES[index]!;
    return pace === "idle" ? idle : sampleCyclic(CATALOG_ARM_PATHS[pace][channel], phase);
  };
  return lerp(read(lowerIndex), read(upperIndex), smootherstep(paceBlend - lowerIndex));
}

function sampleCyclic(values: readonly number[], phase: number) {
  const scaled = normalizeGaitPhase(phase) * values.length;
  const index = Math.floor(scaled) % values.length, amount = scaled - Math.floor(scaled);
  const previous = values[(index + values.length - 1) % values.length]!;
  const current = values[index]!, next = values[(index + 1) % values.length]!, afterNext = values[(index + 2) % values.length]!;
  const squared = amount * amount, cubed = squared * amount;
  return .5 * (2 * current + (-previous + next) * amount
    + (2 * previous - 5 * current + 4 * next - afterNext) * squared
    + (-previous + 3 * current - 3 * next + afterNext) * cubed);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}



function smootherstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
