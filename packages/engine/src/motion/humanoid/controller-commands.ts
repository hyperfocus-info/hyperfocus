import type { CharacterMotor3D, Vec3Input } from "../../physics/3d.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";
import type { FootPlantSolver } from "../solvers/foot-plant.ts";
import type { RecoilSolver } from "../solvers/recoil.ts";
import { createHumanoidActionPoseRecipe, type HumanoidActionPoseRecipe } from "./action-pose.ts";
import type { HumanoidMotionController, HumanoidMotionState } from "./controller.ts";
import { planHumanoidLocomotionIntent, type HumanoidLocomotionIntent, type HumanoidLocomotionPace, type HumanoidLocomotionPosture } from "./locomotion-intent.ts";
import { planHumanoidPunchIntent, type HumanoidPunchIntent, type HumanoidPunchIntentPlan } from "./punch-intent.ts";

export type HumanoidControlState = {
  basePose: PoseBuffer | null;
  readonly aimTarget: Float32Array;
  readonly leftHandGripTarget: Float32Array;
  readonly rightHandGripTarget: Float32Array;
  aimWeight: number;
  handTargetWeight: number;
  hasLeftHandTarget: boolean;
  hasRightHandTarget: boolean;
  actionId: string | null;
  actionPhase: number;
  actionPose: HumanoidActionPoseRecipe | null;
  locomotionPace: HumanoidLocomotionPace | null;
  locomotionPosture: HumanoidLocomotionPosture;
  locomotionCycleDistanceScale: number | null;
  punchPlan: HumanoidPunchIntentPlan | null;
  punchElapsedSeconds: number;
  readonly punchStartTarget: Float32Array;
  readonly punchGuardStartTarget: Float32Array;
  hasPunchStartTarget: boolean;
  hasPunchGuardStartTarget: boolean;
};

type HumanoidControllerCommandsOptions = {
  rig: CompiledSemanticRig;
  motor: CharacterMotor3D;
  state: HumanoidMotionState;
  controls: HumanoidControlState;
  leftFootPlant: FootPlantSolver | null;
  rightFootPlant: FootPlantSolver | null;
  recoilSolver: RecoilSolver | null;
  update(deltaSeconds: number): HumanoidMotionState;
  updateFromPhysics(sample: Parameters<HumanoidMotionController["updateFromPhysics"]>[0]): HumanoidMotionState;
  reset(): HumanoidMotionState;
};

export function createHumanoidControlState(): HumanoidControlState {
  return {
    basePose: null,
    aimTarget: new Float32Array(3),
    leftHandGripTarget: new Float32Array(3),
    rightHandGripTarget: new Float32Array(3),
    aimWeight: 0,
    handTargetWeight: 0,
    hasLeftHandTarget: false,
    hasRightHandTarget: false,
    actionId: null,
    actionPhase: 0,
    actionPose: null,
    locomotionPace: null,
    locomotionPosture: "upright",
    locomotionCycleDistanceScale: null,
    punchPlan: null,
    punchElapsedSeconds: 0,
    punchStartTarget: new Float32Array(3),
    punchGuardStartTarget: new Float32Array(3),
    hasPunchStartTarget: false,
    hasPunchGuardStartTarget: false,
  };
}

export function resetHumanoidControlState(controls: HumanoidControlState) {
  controls.actionId = null;
  controls.actionPhase = 0;
  controls.actionPose = null;
  controls.locomotionPace = null;
  controls.locomotionPosture = "upright";
  controls.locomotionCycleDistanceScale = null;
  controls.punchPlan = null;
  controls.punchElapsedSeconds = 0;
  controls.hasPunchStartTarget = false;
  controls.hasPunchGuardStartTarget = false;
  controls.aimWeight = 0;
  controls.handTargetWeight = 0;
  controls.hasLeftHandTarget = false;
  controls.hasRightHandTarget = false;
}

export function createHumanoidControllerCommands(
  options: HumanoidControllerCommandsOptions,
): HumanoidMotionController {
  const { rig, motor, state, controls, leftFootPlant, rightFootPlant, recoilSolver } = options;
  return {
    rig,
    motor,
    state,
    move(velocity) {
      controls.locomotionPace = null;
      controls.locomotionPosture = "upright";
      controls.locomotionCycleDistanceScale = null;
      motor.move(velocity);
      return state;
    },
    setLocomotionIntent(intent: HumanoidLocomotionIntent) {
      const plan = planHumanoidLocomotionIntent(intent);
      controls.locomotionPace = plan.pace;
      controls.locomotionPosture = plan.posture;
      // The ordinary path lets accepted speed continuously blend cadence.
      // Only an explicitly authored scale overrides that physical relationship.
      controls.locomotionCycleDistanceScale = intent.cycleDistanceScale ?? null;
      motor.move(plan.velocity);
      if (intent.faceTravel !== false && plan.speedMetersPerSecond > 0) motor.setFacing(plan.direction);
      return state;
    },
    update: options.update,
    updateFromPhysics: options.updateFromPhysics,
    teleport(position) {
      motor.teleport(position);
      leftFootPlant?.reset();
      rightFootPlant?.reset();
      return state;
    },
    setFacing(facing) {
      motor.setFacing(facing);
      return state;
    },
    setAimTarget(target, weight = target ? 1 : 0) {
      if (target) copyVec3Input(target, controls.aimTarget);
      controls.aimWeight = clampFinite(weight, 0, 1, "aim weight");
      return state;
    },
    setHandTargets(left, right, weight = left || right ? 1 : 0) {
      if (left) copyVec3Input(left, controls.leftHandGripTarget);
      if (right) copyVec3Input(right, controls.rightHandGripTarget);
      controls.hasLeftHandTarget = left !== null;
      controls.hasRightHandTarget = right !== null;
      controls.handTargetWeight = clampFinite(weight, 0, 1, "hand target weight");
      return state;
    },
    setBasePose(basePose) {
      if (basePose && (basePose.deformCount !== rig.deformCount || basePose.totalCount !== rig.totalCount)) {
        throw new RangeError("base PoseBuffer counts must match the compiled semantic rig");
      }
      controls.basePose = basePose;
      return state;
    },
    setAction(actionId, actionPhase = 0) {
      if (actionId !== null && typeof actionId !== "string") throw new TypeError("actionId must be a string or null");
      controls.actionId = actionId;
      controls.actionPhase = finiteNonNegative(actionPhase, "actionPhase");
      controls.punchPlan = null;
      return state;
    },
    setActionPose(intent) {
      controls.actionPose = intent ? createHumanoidActionPoseRecipe(intent) : null;
      controls.punchPlan = null;
      return state;
    },
    punch(intent: HumanoidPunchIntent) {
      const plan = planHumanoidPunchIntent(intent);
      controls.punchPlan = plan;
      controls.punchElapsedSeconds = 0;
      controls.hasPunchStartTarget = false;
      controls.hasPunchGuardStartTarget = false;
      controls.actionId = `punch-${plan.intent.hand}-${plan.intent.style}`;
      controls.actionPhase = 0;
      controls.actionPose = createHumanoidActionPoseRecipe({ style: plan.intent.style, effector: `${plan.intent.hand}-hand`, power: plan.intent.power });
      controls.hasLeftHandTarget = false;
      controls.hasRightHandTarget = false;
      controls.handTargetWeight = 0;
      return state;
    },
    setActionPhase(actionPhase) {
      controls.actionPhase = finiteNonNegative(actionPhase, "actionPhase");
      return state;
    },
    requestRootMotion(delta) {
      motor.requestRootMotion(delta);
      return state;
    },
    recoil(amount = 1) {
      recoilSolver?.impulse(amount);
      return state;
    },
    reset: options.reset,
  };
}

function copyVec3Input(value: Vec3Input, out: Float32Array) {
  if ("length" in value) {
    out[0] = Number(value[0]);
    out[1] = Number(value[1]);
    out[2] = Number(value[2]);
  } else {
    out[0] = value.x;
    out[1] = value.y;
    out[2] = value.z;
  }
  if (!out.every(Number.isFinite)) throw new TypeError("vec3 input must contain finite values");
  return out;
}

function finiteNonNegative(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be a finite non-negative number`);
  return number;
}

function clampFinite(value: unknown, minimum: number, maximum: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError(`${label} must be finite`);
  return Math.max(minimum, Math.min(maximum, number));
}
