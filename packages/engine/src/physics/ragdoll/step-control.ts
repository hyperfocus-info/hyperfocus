import { atan2, hypot, sqrt } from '../../math/simulation.ts';
import { closestExpandedSupportPoint3D } from "../ragdoll-3d-balance.ts";
import { findRagdollRecoveryBodyObstruction3D, hasStableRagdollRecoverySupport3D, type RagdollRecoveryBlocker3D, type RagdollRecoveryBodyClearance3D } from "../ragdoll-3d-recovery.ts";
import type { RagdollImpactResponsePolicy3D, RagdollImpactResponseStatus3D, RagdollLandingStatus3D, RagdollLocomotionState3D, RagdollMode3D, RagdollStepStatus3D, RagdollSupportIntent3D, RagdollSupportStatus3D } from "../ragdoll-3d.ts";
import { type RigidBodyState3D, type RigidRaycastHit3D, type RigidWorld3D } from "../rigid-3d.ts";

export type RagdollState = {
  id: string;
  rootBoneId: string;
  bodyByBone: Map<string, number>;
  bodyHandles: number[];
  motorByJoint: Array<{ id: string; handle: number; parentHandle: number; childHandle: number; localAnchorParent: [number, number, number]; localAnchorChild: [number, number, number]; poseJointIndex: number; stiffness: number; damping: number; maxTorqueImpulse: number }>;
  constraintHandles: number[];
  pose: Float64Array;
  mode: RagdollMode3D;
  fromWeight: number;
  motorWeight: number;
  toWeight: number;
  transitionSeconds: number;
  transitionElapsed: number;
  activeMotorWeight: number;
  minimumTransitionSeconds: number;
  settleLinearSpeed: number;
  settleAngularSpeed: number;
  settleDurationSeconds: number;
  settledSeconds: number;
  recoveryPositionTolerance: number;
  recoveryAngularSpeed: number;
  maxRootImpulse: number;
  maxRootTorqueImpulse: number;
  rootReferenceRotation: [number, number, number, number];
  /** Transient authored travel direction for the current fixed step. */
  rootMotionDirectionX: number;
  rootMotionDirectionZ: number;
  /** Canonical standing root height captured the first time each locomotion support is planted. */
  supportRootHeights: Map<string, number>;
  locomotion?: { supportBoneIds: string[]; groundLayerMask: number; probeDistance: number; minimumNormalY: number; maximumGroundedVerticalSpeedMetersPerSecond: number; minimumLandingSpeedMetersPerSecond: number; fullImpactLandingSpeedMetersPerSecond: number; landingDurationSeconds: number; landingMotorYield: number };
  locomotionState: RagdollLocomotionState3D;
  landing?: Omit<RagdollLandingStatus3D, "progress"> & { elapsedSeconds: number; durationSeconds: number };
  impactPolicy?: Required<RagdollImpactResponsePolicy3D>;
  impactResponse?: Omit<RagdollImpactResponseStatus3D, "progress"> & { elapsedSeconds: number; durationSeconds: number };
  supports: Map<string, { boneId: string; handle: number; targetBodyId: string; point: [number, number, number]; rootHeightMeters: number; balanceRadiusMeters: number; balanceStiffness: number; balanceDamping: number; maxBalanceImpulse: number; predictionSeconds: number; forceDistribution: "whole-body" | "root" }>;
  steps: Map<string, NormalizedStep>;
  recovery?: NormalizedRecovery;
  recoveryBlocker?: RagdollRecoveryBlocker3D;
};

export function landingMotorScale(state: RagdollState) { if (!state.landing || !state.locomotion) return 1; const recovery = smootherstep(state.landing.elapsedSeconds / state.landing.durationSeconds); return 1 - state.landing.severity * (1 - state.locomotion.landingMotorYield) * (1 - recovery); }

export function impactMotorScale(state: RagdollState) { if (!state.impactResponse || !state.impactPolicy) return 1; const recovery = smootherstep(state.impactResponse.elapsedSeconds / state.impactResponse.durationSeconds); return 1 - state.impactResponse.severity * (1 - state.impactPolicy.staggerMotorYield) * (1 - recovery); }

export type NormalizedRecovery = { pose: Float64Array; sourcePose: Float64Array; position: [number, number, number]; rotation: [number, number, number, number]; durationSeconds: number; poseBlendSeconds: number; elapsedSeconds: number; requireStableSupport: boolean; supportBoneIds: string[]; groundLayerMask: number; supportProbeDistance: number; minimumSupportNormalY: number; padding: number };

export function projectRecoveryBodyClearance(state: RagdollState, recovery: NormalizedRecovery, world: RigidWorld3D): RagdollRecoveryBodyClearance3D[] {
  const rootHandle = requireBone(state.bodyByBone, state.rootBoneId, state.id), root = requireBody(world, rootHandle, state.id), transforms = new Map<number, { position: [number, number, number]; rotation: [number, number, number, number] }>();
  transforms.set(rootHandle, { position: [...recovery.position], rotation: [...recovery.rotation] });
  for (let pass = 0; pass < state.motorByJoint.length; pass += 1) { let changed = false; for (const motor of state.motorByJoint) { const parent = transforms.get(motor.parentHandle); if (parent === undefined || transforms.has(motor.childHandle)) continue; const rotation = multiplyRotation(parent.rotation, quaternionAt(recovery.pose, motor.poseJointIndex)), parentAnchor = rotate(parent.rotation, motor.localAnchorParent), childAnchor = rotate(rotation, motor.localAnchorChild); transforms.set(motor.childHandle, { position: [parent.position[0] + parentAnchor[0] - childAnchor[0], parent.position[1] + parentAnchor[1] - childAnchor[1], parent.position[2] + parentAnchor[2] - childAnchor[2]], rotation }); changed = true; } if (!changed) break; }
  const rootDelta = multiplyRotation(recovery.rotation, inverseRotation(bodyRotation(root)));
  const projected: RagdollRecoveryBodyClearance3D[] = [];
  for (const [boneId, handle] of state.bodyByBone) { const body = requireBody(world, handle, `${state.id}/${boneId}`), resolved = transforms.get(handle), relative = [body.x - root.x, body.y - root.y, body.z - root.z] as const, offset = rotate(rootDelta, relative); projected.push({ boneId, body, targetPosition: resolved?.position ?? [recovery.position[0] + offset[0], recovery.position[1] + offset[1], recovery.position[2] + offset[2]], targetRotation: resolved?.rotation ?? multiplyRotation(rootDelta, bodyRotation(body)) }); }
  return projected;
}

export type NormalizedStep = { id: string; boneId: string; bodyHandle: number; state: RagdollStepStatus3D["state"]; start: [number, number, number]; target: [number, number, number]; targetBodyId?: string; localTarget?: [number, number, number]; direction: [number, number, number]; speedMetersPerSecond: number; predictionSeconds: number; maximumDistance: number; durationSeconds: number; maximumWaitSeconds: number; elapsedSeconds: number; liftHeight: number; groundLayerMask: number; probeHeight: number; probeDistance: number; minimumNormalY: number; stiffness: number; damping: number; maximumDriveImpulse: number; landingTolerance: number; maximumLandingSpeed: number; allowFlight: boolean; takeoffVelocityY?: number; takeoffApplied?: boolean; reason?: string };

export function requireBone(map: ReadonlyMap<string, number>, boneId: string, ragdollId: string) { const handle = map.get(boneId); if (handle === undefined) throw new Error(`Ragdoll ${ragdollId} bone ${boneId} does not exist.`); return handle; }

export function requireBody(world: RigidWorld3D, handle: number, label: string) { const body = world.body(handle); if (!body) throw new Error(`Ragdoll body ${label} does not exist.`); return body; }

export function stepArcPoint(step: NormalizedStep, progress: number): [number, number, number] { const horizontal = smootherstep(progress), elevationChange = Math.abs(step.target[1] - step.start[1]), liftWeight = progress < .3 ? smootherstep(progress / .3) : progress <= .75 ? 1 : 1 - smootherstep((progress - .75) / .25), lift = liftWeight * (step.liftHeight + elevationChange); return [step.start[0] + (step.target[0] - step.start[0]) * horizontal, step.start[1] + (step.target[1] - step.start[1]) * horizontal + lift, step.start[2] + (step.target[2] - step.start[2]) * horizontal]; }

export function bodyWorldPoint(body: RigidBodyState3D, point: readonly [number, number, number]): [number, number, number] { const rotated = rotate([body.rotationX, body.rotationY, body.rotationZ, body.rotationW], point); return [body.x + rotated[0], body.y + rotated[1], body.z + rotated[2]]; }

export function quaternionAt(pose: ArrayLike<number>, index: number) { if (!Number.isSafeInteger(index) || index < 0 || index * 4 + 3 >= pose.length) throw new RangeError(`poseJointIndex ${index} is out of range.`); return [pose[index * 4]!, pose[index * 4 + 1]!, pose[index * 4 + 2]!, pose[index * 4 + 3]!] as const; }

export function quaternion(input: ArrayLike<number>, label: string): [number, number, number, number] { const x = finite(input[0]!, `${label}[0]`), y = finite(input[1]!, `${label}[1]`), z = finite(input[2]!, `${label}[2]`), w = finite(input[3]!, `${label}[3]`), length = hypot(x, y, z, w); if (length <= 1e-12) throw new RangeError(`${label} must be non-zero.`); return [x / length, y / length, z / length, w / length]; }

export function bodyRotation(body: RigidBodyState3D): [number, number, number, number] { return [body.rotationX, body.rotationY, body.rotationZ, body.rotationW]; }

export function blendQuaternion(a: readonly [number, number, number, number], b: readonly [number, number, number, number], weight: number): [number, number, number, number] { let bx = b[0], by = b[1], bz = b[2], bw = b[3]; if (a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; } const inverse = 1 - weight; return quaternion([a[0] * inverse + bx * weight, a[1] * inverse + by * weight, a[2] * inverse + bz * weight, a[3] * inverse + bw * weight], "blended recovery rotation"); }

export function rotationError(body: RigidBodyState3D, target: readonly [number, number, number, number], limit: number): [number, number, number] { const cx = -body.rotationX, cy = -body.rotationY, cz = -body.rotationZ, cw = body.rotationW; let x = target[3] * cx + target[0] * cw + target[1] * cz - target[2] * cy, y = target[3] * cy - target[0] * cz + target[1] * cw + target[2] * cx, z = target[3] * cz + target[0] * cy - target[1] * cx + target[2] * cw, w = target[3] * cw - target[0] * cx - target[1] * cy - target[2] * cz; if (w < 0) { x = -x; y = -y; z = -z; w = -w; } const length = hypot(x, y, z); if (length <= 1e-12) return [0, 0, 0]; const magnitude = Math.min(limit, 2 * atan2(length, Math.max(0, w))); return [x / length * magnitude, y / length * magnitude, z / length * magnitude]; }

export function clampVector(x: number, y: number, z: number, maximum: number): [number, number, number] { const length = hypot(x, y, z); if (length <= maximum) return [x, y, z]; const scale = maximum / length; return [x * scale, y * scale, z * scale]; }



export function multiplyRotation(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] { const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2], inverse = 1 / Math.max(1e-12, hypot(x, y, z, w)); return [x * inverse, y * inverse, z * inverse, w * inverse]; }

export function smootherstep(value: number) { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10); }

export function finite(value: number, label: string) { if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new RangeError(`${label} must be finite.`); return value; }

export type BalanceBuffers = { points: Float64Array; order: Uint32Array; hull: Uint32Array; target: Float64Array };

export function configureMotors(world: RigidWorld3D, state: RagdollState) {
  const recovery = state.recovery, blend = recovery ? smootherstep(recovery.poseBlendSeconds === 0 ? 1 : recovery.elapsedSeconds / recovery.poseBlendSeconds) : 1, responseScale = landingMotorScale(state) * impactMotorScale(state);
  for (const motor of state.motorByJoint) {
    const target = quaternionAt(state.pose, motor.poseJointIndex), source = recovery ? quaternionAt(recovery.sourcePose, motor.poseJointIndex) : target;
    const stepScale = movingStepMotorScale(state, motor);
    world.configureAngularMotorConstraint(motor.handle, { targetRelativeRotation: blendQuaternion(source, target, blend), stiffness: motor.stiffness * state.motorWeight * responseScale * stepScale, damping: Math.min(1, motor.damping * state.motorWeight * responseScale * Math.max(.25, sqrt(stepScale))), maxTorqueImpulse: motor.maxTorqueImpulse * state.motorWeight * responseScale * stepScale });
  }
}

export function movingStepMotorScale(state: RagdollState, motor: RagdollState["motorByJoint"][number]) {
  for (const step of state.steps.values()) {
    if (step.state !== "moving") continue;
    let childHandle = step.bodyHandle;
    for (let depth = 0; depth < state.motorByJoint.length; depth += 1) {
      const parentMotor = state.motorByJoint.find((candidate) => candidate.childHandle === childHandle);
      if (!parentMotor) break;
      if (parentMotor.handle === motor.handle) {
        // The step drive already owns the effector's translation. Releasing
        // the ankle motor as well gives a spherical foot no orientation
        // reference, so it can roll through half a turn while its position
        // still follows the authored arc. Keep the effector joint oriented;
        // only yield upstream joints enough for the leg to reach the step.
        return depth === 0 ? 1 : .35;
      }
      childHandle = parentMotor.parentHandle;
    }
  }
  return 1;
}

export function capturePhysicalPose(world: RigidWorld3D, state: RagdollState) {
  const pose = new Float64Array(state.pose.length);
  for (const motor of state.motorByJoint) {
    const constraint = world.constraint(motor.handle); if (!constraint || constraint.kind !== "angular-motor") throw new Error(`Ragdoll ${state.id} motor ${motor.handle} does not exist.`);
    const parent = requireBody(world, constraint.a, state.id), child = requireBody(world, constraint.b, state.id), relative = multiplyRotation(inverseRotation(bodyRotation(parent)), bodyRotation(child));
    pose.set(relative, motor.poseJointIndex * 4);
  }
  return pose;
}

export function driveRecoveryRoot(world: RigidWorld3D, state: RagdollState, seconds: number) {
  const recovery = state.recovery!; recovery.elapsedSeconds += seconds;
  const handle = requireBone(state.bodyByBone, state.rootBoneId, state.id), root = requireBody(world, handle, `${state.id}/${state.rootBoneId}`), weight = smootherstep(Math.min(1, recovery.elapsedSeconds / recovery.durationSeconds));
  const desiredX = (recovery.position[0] - root.x) * (3 + weight * 7) - root.velocityX * (0.5 + weight * 0.5);
  const desiredY = (recovery.position[1] - root.y) * (3 + weight * 7) - root.velocityY * (0.5 + weight * 0.5);
  const desiredZ = (recovery.position[2] - root.z) * (3 + weight * 7) - root.velocityZ * (0.5 + weight * 0.5);
  const impulse = clampVector(desiredX * root.mass * weight, desiredY * root.mass * weight, desiredZ * root.mass * weight, state.maxRootImpulse * seconds * 60);
  world.applyImpulse(handle, impulse[0], impulse[1], impulse[2]);
  const torque = rotationError(root, recovery.rotation, state.maxRootTorqueImpulse * weight);
  world.applyTorqueImpulse(handle, torque[0], torque[1], torque[2]);
}

export function driveBalance(world: RigidWorld3D, balanceBuffers: BalanceBuffers, state: RagdollState, seconds: number, actuatedHandles?: Set<number>) {
  const { points: balancePoints, order: balanceOrder, hull: balanceHull, target: balanceTarget } = balanceBuffers;
  const travelX = state.rootMotionDirectionX, travelZ = state.rootMotionDirectionZ;
  state.rootMotionDirectionX = 0; state.rootMotionDirectionZ = 0;
  if (!state.supports.size || state.mode === "passive" || state.mode === "settled" || state.mode === "recovering") return;
  let supportCount = 0, supportHeight = 0, rootHeight = 0, radius = 0, stiffness = 0, damping = 0, maximumImpulse = 0, predictionSeconds = 0, forceDistribution: "whole-body" | "root" = "root";
  for (const support of state.supports.values()) {
    const constraint = world.constraint(support.handle), target = world.body(support.targetBodyId); if (!constraint || constraint.kind !== "point" || !target) continue;
    const point = bodyWorldPoint(target, constraint.localAnchorA); balancePoints[supportCount * 2] = point[0]; balancePoints[supportCount * 2 + 1] = point[2]; supportHeight += point[1]; rootHeight += support.rootHeightMeters; supportCount += 1;
    radius = Math.max(radius, support.balanceRadiusMeters); stiffness = Math.max(stiffness, support.balanceStiffness); damping = Math.max(damping, support.balanceDamping); maximumImpulse += support.maxBalanceImpulse; predictionSeconds = Math.max(predictionSeconds, support.predictionSeconds); if (support.forceDistribution === "whole-body") forceDistribution = "whole-body";
  }
  if (!supportCount || maximumImpulse <= 0 || stiffness <= 0) return;
  let totalMass = 0, centerX = 0, centerZ = 0, velocityX = 0, velocityY = 0, velocityZ = 0;
  for (const handle of state.bodyHandles) { const body = requireBody(world, handle, state.id); totalMass += body.mass; centerX += body.x * body.mass; centerZ += body.z * body.mass; velocityX += body.velocityX * body.mass; velocityY += body.velocityY * body.mass; velocityZ += body.velocityZ * body.mass; }
  if (totalMass <= 0 || !Number.isFinite(totalMass)) return;
  centerX /= totalMass; centerZ /= totalMass; velocityX /= totalMass; velocityY /= totalMass; velocityZ /= totalMass;
  const root = requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), `${state.id}/${state.rootBoneId}`), targetRootY = supportHeight / supportCount + rootHeight / supportCount, desiredVerticalVelocity = (targetRootY - root.y) * stiffness / Math.max(seconds, predictionSeconds || seconds) - velocityY * damping, verticalImpulse = Math.max(-maximumImpulse, Math.min(maximumImpulse, desiredVerticalVelocity * totalMass));
  if (forceDistribution === "root") { world.applyImpulse(root.handle, 0, verticalImpulse, 0); actuatedHandles?.add(root.handle); }
  else {
    let drivenMass = 0; for (const handle of state.bodyHandles) if (!isPlantedBody(world, state, handle)) drivenMass += requireBody(world, handle, state.id).mass;
    if (drivenMass > 0) for (const handle of state.bodyHandles) { if (isPlantedBody(world, state, handle)) continue; const body = requireBody(world, handle, state.id), share = body.mass / drivenMass; world.applyImpulse(handle, 0, verticalImpulse * share, 0); actuatedHandles?.add(handle); }
  }
  const currentOutside = closestExpandedSupportPoint3D(balancePoints, supportCount, centerX, centerZ, radius, balanceOrder, balanceHull, balanceTarget), currentTargetX = balanceTarget[0]!, currentTargetZ = balanceTarget[1]!;
  const projectedX = centerX + velocityX * predictionSeconds, projectedZ = centerZ + velocityZ * predictionSeconds, projectedOutside = closestExpandedSupportPoint3D(balancePoints, supportCount, projectedX, projectedZ, radius, balanceOrder, balanceHull, balanceTarget);
  const useCurrent = currentOutside >= projectedOutside, outside = useCurrent ? currentOutside : projectedOutside; if (outside <= 1e-9) return;
  const sourceX = useCurrent ? centerX : projectedX, sourceZ = useCurrent ? centerZ : projectedZ, targetX = useCurrent ? currentTargetX : balanceTarget[0]!, targetZ = useCurrent ? currentTargetZ : balanceTarget[1]!, horizon = useCurrent ? seconds : Math.max(seconds, predictionSeconds);
  const desiredX = (targetX - sourceX) * stiffness / horizon - velocityX * damping, desiredZ = (targetZ - sourceZ) * stiffness / horizon - velocityZ * damping, impulse = clampVector(desiredX * totalMass, 0, desiredZ * totalMass, maximumImpulse);
  // During authored locomotion the center of mass must intentionally travel
  // beyond the current stance so the next foot can capture it. Preserve the
  // lateral balance correction, but do not let the static support controller
  // apply a braking impulse opposite the current travel intent. Without this,
  // faster gait phases reverse the body before the swing foot can land.
  const travelLength = hypot(travelX, travelZ);
  if (travelLength > 1e-12) {
    const directionX = travelX / travelLength, directionZ = travelZ / travelLength;
    const alongTravel = impulse[0] * directionX + impulse[2] * directionZ;
    if (alongTravel < 0) { impulse[0] -= alongTravel * directionX; impulse[2] -= alongTravel * directionZ; }
  }
  if (forceDistribution === "root") { const root = requireBone(state.bodyByBone, state.rootBoneId, state.id); world.applyImpulse(root, impulse[0], 0, impulse[2]); actuatedHandles?.add(root); }
  else {
    let drivenMass = 0;
    for (const handle of state.bodyHandles) if (!isPlantedBody(world, state, handle)) drivenMass += requireBody(world, handle, state.id).mass;
    if (drivenMass <= 0) return;
    for (const handle of state.bodyHandles) { if (isPlantedBody(world, state, handle)) continue; const body = requireBody(world, handle, state.id), share = body.mass / drivenMass; world.applyImpulse(handle, impulse[0] * share, 0, impulse[2] * share); actuatedHandles?.add(handle); }
  }
}

export function isPlantedBody(world: RigidWorld3D, state: RagdollState, bodyHandle: number) { for (const support of state.supports.values()) { const constraint = world.constraint(support.handle); if (constraint?.kind === "point" && constraint.b === bodyHandle) return true; } return false; }

export function recoveryEnvironmentBlocker(world: RigidWorld3D, recoveryQueryHandles: Float64Array, recoveryRaycast: RigidRaycastHit3D, state: RagdollState): RagdollRecoveryBlocker3D | undefined {
  const recovery = state.recovery!;
  if (findRagdollRecoveryBodyObstruction3D({ world, bodies: projectRecoveryBodyClearance(state, recovery, world), selfHandles: state.bodyHandles, clearance: recovery, queryHandles: recoveryQueryHandles })) return "obstructed";
  if (!recovery.requireStableSupport) return undefined;
  const bodies = recovery.supportBoneIds.map((boneId) => requireBody(world, requireBone(state.bodyByBone, boneId, state.id), `${state.id}/${boneId}`));
  return hasStableRagdollRecoverySupport3D({ world, bodies, selfHandles: state.bodyHandles, groundLayerMask: recovery.groundLayerMask, probeDistance: recovery.supportProbeDistance, minimumNormalY: recovery.minimumSupportNormalY, hit: recoveryRaycast }) ? undefined : "unsupported";
}

export function driveSteps(world: RigidWorld3D, state: RagdollState, seconds: number, actuatedHandles?: Set<number>) { for (const step of state.steps.values()) { if (step.state !== "moving") continue; applyStepTakeoff(world, state, step, actuatedHandles); const body = requireBody(world, step.bodyHandle, `${state.id}/${step.boneId}`), targetBody = step.targetBodyId ? world.body(step.targetBodyId) : undefined; if (!targetBody || !step.localTarget) { step.state = "missed"; step.reason = "capture support disappeared before landing"; continue; } step.target = bodyWorldPoint(targetBody, step.localTarget); const prior = Math.min(1, step.elapsedSeconds / step.durationSeconds), nextElapsed = Math.min(step.durationSeconds + step.maximumWaitSeconds, step.elapsedSeconds + seconds), next = Math.min(1, nextElapsed / step.durationSeconds), priorPoint = stepArcPoint(step, prior), nextPoint = stepArcPoint(step, next), pathX = (nextPoint[0] - priorPoint[0]) / seconds, pathY = (nextPoint[1] - priorPoint[1]) / seconds, pathZ = (nextPoint[2] - priorPoint[2]) / seconds;
    // Track the authored arc with a bounded velocity servo. Dividing the full
    // position error by one 120 Hz step turns a few centimetres of lag into
    // tens of metres per second and causes the foot to oscillate through its
    // target. A duration-relative correction gain closes the same error while
    // the path-derived speed cap keeps the result independent of solver rate.
    const correctionGain = Math.min(12, 2 / step.durationSeconds), horizontalDistance = hypot(step.target[0] - step.start[0], step.target[2] - step.start[2]), elevationChange = Math.abs(step.target[1] - step.start[1]), horizontalPeakSpeed = horizontalDistance / step.durationSeconds * 1.875, verticalPeakSpeed = (elevationChange * 1.875 + (step.liftHeight + elevationChange) * 3.08) / step.durationSeconds, maximumSpeed = Math.max(step.maximumLandingSpeed, step.speedMetersPerSecond * 2, hypot(horizontalPeakSpeed, verticalPeakSpeed)), desired = clampVector(pathX + (nextPoint[0] - body.x) * correctionGain, pathY + (nextPoint[1] - body.y) * correctionGain, pathZ + (nextPoint[2] - body.z) * correctionGain, maximumSpeed);
    const impulse = clampVector((desired[0] - body.velocityX * step.damping) * body.mass * step.stiffness, (desired[1] - body.velocityY * step.damping) * body.mass * step.stiffness, (desired[2] - body.velocityZ * step.damping) * body.mass * step.stiffness, step.maximumDriveImpulse);
    world.applyImpulse(step.bodyHandle, impulse[0], impulse[1], impulse[2]); actuatedHandles?.add(step.bodyHandle); step.elapsedSeconds = nextElapsed; } }

export function applyStepTakeoff(world: RigidWorld3D, state: RagdollState, step: NormalizedStep, actuatedHandles?: Set<number>) {
  if (step.takeoffApplied || step.takeoffVelocityY === undefined) return;
  let totalMass = 0, verticalMomentum = 0;
  for (const handle of state.bodyHandles) { const body = requireBody(world, handle, state.id); totalMass += body.mass; verticalMomentum += body.velocityY * body.mass; }
  const deltaVelocity = step.takeoffVelocityY - verticalMomentum / Math.max(1e-12, totalMass);
  for (const handle of state.bodyHandles) { const body = requireBody(world, handle, state.id); world.applyImpulse(handle, 0, deltaVelocity * body.mass, 0); actuatedHandles?.add(handle); }
  step.takeoffApplied = true;
}

export function finishSteps(world: RigidWorld3D, recoveryRaycast: RigidRaycastHit3D, plantSupport: (id: string, intent: RagdollSupportIntent3D) => RagdollSupportStatus3D, state: RagdollState) {
  for (const step of state.steps.values()) {
    if (step.state !== "moving" || step.elapsedSeconds < step.durationSeconds) continue;
    const body = requireBody(world, step.bodyHandle, `${state.id}/${step.boneId}`);
    const distance = hypot(body.x - step.target[0], body.y - step.target[1], body.z - step.target[2]);
    const speed = hypot(body.velocityX, body.velocityY, body.velocityZ);
    const halfHeight = body.shape.kind === "sphere" ? body.shape.radius : body.shape.halfY, traveled = hypot(body.x - step.start[0], body.z - step.start[2]), maximumCarriedDistance = step.maximumDistance + step.speedMetersPerSecond * step.maximumWaitSeconds + step.landingTolerance, contactedGround = traveled <= maximumCarriedDistance && world.raycast(body.x, body.y, body.z, 0, -1, 0, halfHeight + step.landingTolerance, step.groundLayerMask, recoveryRaycast) && recoveryRaycast.normalY >= step.minimumNormalY;
    if ((distance <= step.landingTolerance || contactedGround) && speed <= step.maximumLandingSpeed) {
      // A landed capture step becomes the next stance. Its balance authority
      // must scale with the character and intended pace; the former fixed
      // 4 N*s cap let a normal root drive outrun its support and pitch a
      // sprinting body into an unintended airborne dive.
      let totalMass = 0;
      for (const handle of state.bodyHandles) totalMass += requireBody(world, handle, state.id).mass;
      const pace = Math.max(1, step.speedMetersPerSecond);
      const planted = plantSupport(state.id, {
        id: step.id,
        boneId: step.boneId,
        groundLayerMask: step.groundLayerMask,
        probeDistance: step.probeDistance,
        minimumNormalY: step.minimumNormalY,
        maximumPlantSpeed: step.maximumLandingSpeed,
        stiffness: .95,
        damping: .98,
        maxImpulse: Math.max(120, totalMass * pace * .8),
        breakImpulse: Math.max(450, totalMass * pace * 4),
        balanceRadiusMeters: Math.min(.42, .12 + pace * .045),
        balanceStiffness: Math.min(.8, .42 + pace * .06),
        balanceDamping: .9,
        maxBalanceImpulse: Math.max(4, totalMass * (.4 + pace * .08)),
        predictionSeconds: Math.min(.3, .16 + pace * .025),
        forceDistribution: "whole-body",
      });
      step.state = planted.planted ? "planted" : "missed";
      if (!planted.planted) step.reason = "swing foot reached its target but could not establish ground contact";
    } else if (step.elapsedSeconds >= step.durationSeconds + step.maximumWaitSeconds) {
      step.state = "missed";
      step.reason = "swing foot did not reach a stable landing before its bounded deadline";
    }
  }
}

export function clearSupports(world: RigidWorld3D, state: RagdollState) { for (const support of state.supports.values()) world.removeConstraint(support.handle); state.supports.clear(); state.steps.clear(); }
import { conjugateQuaternion as inverseRotation, rotateQuaternionVector3 as rotate } from "../../math/quaternion.ts";
