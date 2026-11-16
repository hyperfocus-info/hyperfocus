import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

import type { Object3D, Skeleton } from "three";
import {
  createCharacterMotor3D,
  type HeightField3D,
  type Physics3DRaycastProvider,
  type Vec3Input,
  type Vec3Like,
} from "@hyperfocus/engine/physics/3d";
import {
  createThreeHumanoidMotionController,
  type ThreeHumanoidMotionController,
} from "@hyperfocus/engine/motion/three";
import { getRigSemanticIndex, type T3RigDocument } from "@hyperfocus/engine/motion";

export type ThreeArenaPlayerMotionFrame = {
  position: Vec3Input;
  resolvedDelta: Vec3Input;
  desiredVelocity: Vec3Input;
  facing: Vec3Input;
  aimTarget: Vec3Input | null;
  aimWeight?: number;
  grounded: boolean;
  groundNormal: Vec3Input;
  teleport?: boolean;
};

export type ThreeArenaPlayerMotionOptions = {
  rigRoot: Object3D;
  motionRoot: Object3D;
  skeleton?: Skeleton;
  t3rig?: string | T3RigDocument;
  initialPosition: Vec3Input;
  initialFacing?: Vec3Input;
  initialGrounded?: boolean;
  initialGroundNormal?: Vec3Input;
  maxSpeed?: number;
  /** Speed at which the procedural gait reaches its full running stride. */
  fullStrideSpeed?: number;
  heightField?: HeightField3D;
  ground?: Physics3DRaycastProvider;
  discontinuityDistance?: number;
  positionTolerance?: number;
};

export type ThreeArenaPlayerMotionMetrics = {
  footSlipDistance: number;
  leftGripError: number;
  rightGripError: number;
  headAboveHipsMeters: number;
  hipsAimDeltaRadians: number;
  plantedVerticalError: number;
  poseChecksum: string;
  poseFinite: boolean;
  torsoFoldRadians: number;
};

export type ThreeArenaPlayerMotionSnapshot = {
  active: true;
  phase: ThreeHumanoidMotionController["state"]["locomotion"]["motionPhase"];
  mappingValidated: boolean;
  capabilities: {
    aim: boolean;
    baseLocomotion: boolean;
    leftFootPlant: boolean;
    rightFootPlant: boolean;
  };
  metrics: ThreeArenaPlayerMotionMetrics;
};

export type ThreeArenaPlayerMotion = {
  readonly controller: ThreeHumanoidMotionController;
  readonly diagnostics: ThreeHumanoidMotionController["mappingDiagnostics"];
  sync(frame: ThreeArenaPlayerMotionFrame, deltaSeconds: number): ThreeArenaPlayerMotionSnapshot;
  recoil(amount?: number): ThreeArenaPlayerMotionSnapshot;
  probeAim(pitchRadians: number): ThreeArenaPlayerMotionSnapshot;
  reset(position?: Vec3Input, facing?: Vec3Input): ThreeArenaPlayerMotionSnapshot;
  snapshot(): ThreeArenaPlayerMotionSnapshot;
};

const DEFAULT_FACING = new Float32Array([0, 0, 1]);
const DEFAULT_NORMAL = new Float32Array([0, 1, 0]);

export function createThreeArenaPlayerMotion(
  options: ThreeArenaPlayerMotionOptions,
): ThreeArenaPlayerMotion {
  if (!options.rigRoot || !options.motionRoot) throw new Error("Three Arena player motion requires rigRoot and motionRoot");
  if (options.rigRoot === options.motionRoot || !isAncestor(options.motionRoot, options.rigRoot)) {
    throw new Error("Three Arena motionRoot must be a distinct ancestor of rigRoot");
  }
  const initialPosition = vector3(options.initialPosition, "initialPosition");
  const initialFacing = normalizedHorizontal(options.initialFacing ?? DEFAULT_FACING, "initialFacing");
  const maxSpeed = positiveFinite(options.maxSpeed ?? 32, "maxSpeed");
  const fullStrideSpeed = positiveFinite(options.fullStrideSpeed ?? maxSpeed * 0.72, "fullStrideSpeed");
  const discontinuityDistance = positiveFinite(
    options.discontinuityDistance ?? Math.max(1, maxSpeed * 0.25),
    "discontinuityDistance",
  );
  const positionTolerance = nonNegativeFinite(options.positionTolerance ?? 1e-4, "positionTolerance");
  const acceptedDelta = new Float32Array(3);
  const acceptedNormal = vector3(options.initialGroundNormal ?? DEFAULT_NORMAL, "initialGroundNormal");
  let acceptedGrounded = options.initialGrounded ?? true;
  const resolverResult = {
    delta: acceptedDelta,
    grounded: acceptedGrounded,
    groundNormal: acceptedNormal,
  };
  const motor = createCharacterMotor3D({
    position: initialPosition,
    facing: initialFacing,
    maxSpeed,
    acceleration: maxSpeed * 120,
    deceleration: maxSpeed * 120,
    maxTurnRate: 0,
    stickToGround: false,
    resolveDisplacement() {
      resolverResult.grounded = acceptedGrounded;
      return resolverResult;
    },
  });
  const controller = createThreeHumanoidMotionController({
    root: options.rigRoot,
    motionRoot: options.motionRoot,
    ...(options.skeleton ? { skeleton: options.skeleton } : {}),
    ...(options.t3rig ? { t3rig: options.t3rig } : {}),
    motor,
    ...(options.heightField ? { heightField: options.heightField } : {}),
    ...(options.ground ? { ground: options.ground } : {}),
    locomotion: { fullStrideSpeed },
    footPlantStanceRatio: 0.34,
  });
  const hipsIndex = getRigSemanticIndex(controller.rig, "hips");
  const headIndex = getRigSemanticIndex(controller.rig, "head");
  const chestIndex = getRigSemanticIndex(controller.rig, "chest");
  const leftHandIndex = getRigSemanticIndex(controller.rig, "leftHand");
  const rightHandIndex = getRigSemanticIndex(controller.rig, "rightHand");
  const chestHeight = chestIndex >= 0
    ? controller.binding.world.translations[chestIndex * 3 + 1] - initialPosition[1]
    : 1.35;
  const hipsBeforeAim = new Float32Array(4);
  const probeTarget = new Float32Array(3);
  const leftGripTarget = new Float32Array(3);
  const rightGripTarget = new Float32Array(3);
  let hipsAimDeltaRadians = 0;

  controller.teleport(initialPosition);
  controller.setFacing(initialFacing);
  controller.update(0);

  function snapshot(): ThreeArenaPlayerMotionSnapshot {
    const world = controller.binding.world;
    const hipsOffset = hipsIndex * 3;
    const headOffset = headIndex * 3;
    let headAboveHipsMeters = 0;
    let torsoFoldRadians = 0;
    if (hipsIndex >= 0 && headIndex >= 0) {
      const dx = world.translations[headOffset] - world.translations[hipsOffset];
      const dy = world.translations[headOffset + 1] - world.translations[hipsOffset + 1];
      const dz = world.translations[headOffset + 2] - world.translations[hipsOffset + 2];
      const length = Math.hypot(dx, dy, dz);
      headAboveHipsMeters = dy;
      torsoFoldRadians = length > 1e-8 ? Math.acos(clamp(dy / length, -1, 1)) : Math.PI;
    }
    const capabilities = controller.state.capabilities;
    return {
      active: true,
      phase: controller.state.locomotion.motionPhase,
      mappingValidated: controller.rig.validated,
      capabilities: {
        aim: capabilities.aim,
        baseLocomotion: capabilities.baseLocomotion,
        leftFootPlant: capabilities.leftFootPlant,
        rightFootPlant: capabilities.rightFootPlant,
      },
      metrics: {
        footSlipDistance: controller.state.metrics.footSlipDistance,
        leftGripError: distanceToJoint(controller.binding.world.translations, leftHandIndex, leftGripTarget),
        rightGripError: distanceToJoint(controller.binding.world.translations, rightHandIndex, rightGripTarget),
        headAboveHipsMeters,
        hipsAimDeltaRadians,
        plantedVerticalError: controller.state.metrics.plantedVerticalError,
        poseChecksum: checksumPose(controller),
        poseFinite: controller.state.metrics.poseFinite,
        torsoFoldRadians,
      },
    };
  }

  function sync(frame: ThreeArenaPlayerMotionFrame, deltaSeconds: number) {
    const dt = nonNegativeFinite(deltaSeconds, "deltaSeconds");
    const position = vector3(frame.position, "frame.position");
    const requestedDelta = vector3(frame.resolvedDelta, "frame.resolvedDelta");
    const desiredVelocity = vector3(frame.desiredVelocity, "frame.desiredVelocity");
    const facing = normalizedHorizontal(frame.facing, "frame.facing");
    const groundNormal = normalizedVector(frame.groundNormal, "frame.groundNormal");
    const expectedX = motor.state.position.x + requestedDelta[0];
    const expectedY = motor.state.position.y + requestedDelta[1];
    const expectedZ = motor.state.position.z + requestedDelta[2];
    const mismatchX = position[0] - expectedX;
    const mismatchY = position[1] - expectedY;
    const mismatchZ = position[2] - expectedZ;
    const mismatch = Math.hypot(mismatchX, mismatchY, mismatchZ);

    if (frame.teleport || mismatch > discontinuityDistance) {
      controller.reset();
      controller.teleport(position);
      acceptedDelta.fill(0);
    } else {
      acceptedDelta[0] = requestedDelta[0] + (mismatch > positionTolerance ? mismatchX : 0);
      acceptedDelta[1] = requestedDelta[1] + (mismatch > positionTolerance ? mismatchY : 0);
      acceptedDelta[2] = requestedDelta[2] + (mismatch > positionTolerance ? mismatchZ : 0);
    }
    acceptedGrounded = Boolean(frame.grounded);
    acceptedNormal.set(groundNormal);
    controller.move(desiredVelocity);
    controller.setFacing(facing);
    controller.setAimTarget(frame.aimTarget, frame.aimWeight ?? (frame.aimTarget ? 1 : 0));
    resolveCrossbowGripTargets(position, frame.aimTarget, facing, chestHeight, leftGripTarget, rightGripTarget);
    controller.setHandTargets(leftGripTarget, rightGripTarget, 1);
    hipsAimDeltaRadians = 0;
    controller.update(dt);
    acceptedDelta.fill(0);
    return snapshot();
  }

  function probeAim(pitchRadians: number) {
    const pitch = finite(pitchRadians, "pitchRadians");
    if (hipsIndex < 0 || headIndex < 0) return snapshot();
    // Rebuild the same zero-delta base pose before every probe so repeated
    // calls do not derive their target from an already-aimed head transform.
    controller.setAimTarget(null, 0);
    controller.update(0);
    const hipsRotationOffset = hipsIndex * 4;
    hipsBeforeAim.set(controller.state.pose.rotations.subarray(hipsRotationOffset, hipsRotationOffset + 4));
    const headOffset = headIndex * 3;
    const world = controller.binding.world;
    const facing = controller.motor.state.facing;
    const distance = 6;
    const horizontal = Math.cos(pitch) * distance;
    probeTarget[0] = world.translations[headOffset] + facing.x * horizontal;
    probeTarget[1] = world.translations[headOffset + 1] + Math.sin(pitch) * distance;
    probeTarget[2] = world.translations[headOffset + 2] + facing.z * horizontal;
    controller.setAimTarget(probeTarget, 1);
    controller.update(0);
    hipsAimDeltaRadians = quaternionAngle(
      hipsBeforeAim,
      controller.state.pose.rotations.subarray(hipsRotationOffset, hipsRotationOffset + 4),
    );
    return snapshot();
  }

  function recoil(amount = 1) {
    acceptedDelta.fill(0);
    controller.recoil(amount);
    controller.update(0.016666666666666666);
    return snapshot();
  }

  function reset(position: Vec3Input = initialPosition, facing: Vec3Input = initialFacing) {
    const nextPosition = vector3(position, "reset.position");
    const nextFacing = normalizedHorizontal(facing, "reset.facing");
    controller.reset();
    controller.teleport(nextPosition);
    controller.setFacing(nextFacing);
    acceptedDelta.fill(0);
    acceptedGrounded = options.initialGrounded ?? true;
    acceptedNormal.set(vector3(options.initialGroundNormal ?? DEFAULT_NORMAL, "initialGroundNormal"));
    hipsAimDeltaRadians = 0;
    controller.update(0);
    return snapshot();
  }

  return {
    controller,
    diagnostics: controller.mappingDiagnostics,
    sync,
    recoil,
    probeAim,
    reset,
    snapshot,
  };
}

function resolveCrossbowGripTargets(
  position: ArrayLike<number>,
  aimTarget: Vec3Input | null,
  facing: ArrayLike<number>,
  chestHeight: number,
  leftGrip: Float32Array,
  rightGrip: Float32Array,
) {
  const aimX = aimTarget ? vectorValue(aimTarget, 0, "x") - position[0] : facing[0];
  const aimZ = aimTarget ? vectorValue(aimTarget, 2, "z") - position[2] : facing[2];
  const length = Math.hypot(aimX, aimZ);
  const forwardX = length > 1e-8 ? aimX / length : facing[0];
  const forwardZ = length > 1e-8 ? aimZ / length : facing[2];
  const leftX = forwardZ;
  const leftZ = -forwardX;
  const gripY = position[1] + chestHeight - 0.08;
  rightGrip[0] = position[0] + forwardX * 0.42 - leftX * 0.16;
  rightGrip[1] = gripY - 0.04;
  rightGrip[2] = position[2] + forwardZ * 0.42 - leftZ * 0.16;
  leftGrip[0] = position[0] + forwardX * 0.78 + leftX * 0.1;
  leftGrip[1] = gripY + 0.02;
  leftGrip[2] = position[2] + forwardZ * 0.78 + leftZ * 0.1;
}

function distanceToJoint(positions: ArrayLike<number>, index: number, target: ArrayLike<number>) {
  if (index < 0) return 0;
  const offset = index * 3;
  return Math.hypot(
    positions[offset] - target[0],
    positions[offset + 1] - target[1],
    positions[offset + 2] - target[2],
  );
}

function isAncestor(ancestor: Object3D, child: Object3D) {
  let cursor: Object3D | null = child.parent;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function vector3(value: Vec3Input, label: string) {
  const x = vectorValue(value, 0, "x");
  const y = vectorValue(value, 1, "y");
  const z = vectorValue(value, 2, "z");
  if (![x, y, z].every(Number.isFinite)) throw new TypeError(`${label} must contain three finite values`);
  return new Float32Array([x, y, z]);
}

function vectorValue(value: Vec3Input, index: number, key: "x" | "y" | "z") {
  return isVec3Like(value) ? Number(value[key]) : Number(value[index]);
}

function isVec3Like(value: Vec3Input): value is Vec3Like {
  return "x" in value && "y" in value && "z" in value;
}

function normalizedHorizontal(value: Vec3Input, label: string) {
  const result = vector3(value, label);
  result[1] = 0;
  const length = Math.hypot(result[0], result[2]);
  if (length <= 1e-8) throw new RangeError(`${label} must have a non-zero horizontal direction`);
  result[0] /= length;
  result[2] /= length;
  return result;
}

function normalizedVector(value: Vec3Input, label: string) {
  const result = vector3(value, label);
  const length = Math.hypot(result[0], result[1], result[2]);
  if (length <= 1e-8) throw new RangeError(`${label} must have a non-zero direction`);
  result[0] /= length;
  result[1] /= length;
  result[2] /= length;
  return result;
}

function checksumPose(controller: ThreeHumanoidMotionController) {
  let hash = 2_166_136_261;
  for (const value of controller.state.pose.rotations) hash = checksumNumber(hash, value);
  for (const value of controller.state.pose.translations) hash = checksumNumber(hash, value);
  return hash.toString(16).padStart(8, "0");
}

function checksumNumber(hash: number, value: number) {
  return Math.imul((hash ^ Math.round(value * 100_000)) >>> 0, 16_777_619) >>> 0;
}

function quaternionAngle(a: ArrayLike<number>, b: ArrayLike<number>) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(clamp(dot, -1, 1));
}



function finite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function nonNegativeFinite(value: unknown, label: string) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative`);
  return number;
}

function positiveFinite(value: unknown, label: string) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive`);
  return number;
}
