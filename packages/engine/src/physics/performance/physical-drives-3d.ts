import { tuple3 } from "../../math/tuples.ts";
import type { PhysicalBodyReference3D, PhysicalCharacterState3D, PhysicalLocomotionProfile3D, PhysicalPerformanceCue3D } from "../physical-performance-3d.ts";
import { PHYSICAL_BODY_STATE_STRIDE_3D, samplePhysicalLocomotionSpeed3D } from "../physical-performance-3d.ts";
import { createRagdollSystem3D } from "../ragdoll-3d.ts";
import { createRigidWorld3D, type RigidBodyState3D } from "../rigid-3d.ts";
import { sampleEffectorAngularVelocity, type ResolvedEffectorOrientation3D } from "./effector-orientation-3d.ts";
import { samplePhysicalEffectorPath3D } from "./effector-path-3d.ts";

export function resolveHandle(reference: PhysicalBodyReference3D, world: ReturnType<typeof createRigidWorld3D>, ragdolls: ReturnType<typeof createRagdollSystem3D>) {
  if ("bodyId" in reference) return requireBody(world, reference.bodyId, reference.bodyId).handle;
  return requireBodyState(ragdolls.body(reference.ragdollId, reference.boneId), `${reference.ragdollId}/${reference.boneId}`).handle;
}

export function requireBody(world: ReturnType<typeof createRigidWorld3D>, handle: number | string, label: string) { return requireBodyState(world.body(handle), label); }

export function requireBodyState<T>(body: T | undefined, label: string): T { if (!body) throw new Error(`Physical body ${label} does not exist.`); return body; }

export function normalized(input: ArrayLike<number>, label: string): [number, number, number] { const vector = vector3(input, label), length = Math.hypot(...vector); if (length <= 1e-12) throw new RangeError(`${label} must be non-zero.`); return [vector[0] / length, vector[1] / length, vector[2] / length]; }

export function vector3(input: ArrayLike<number>, label: string): [number, number, number] { if (!input || input.length < 3) throw new RangeError(`${label} needs three values.`); return [finite(input[0]!, `${label}[0]`), finite(input[1]!, `${label}[1]`), finite(input[2]!, `${label}[2]`)]; }

export function finite(value: number, label: string) { if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new RangeError(`${label} must be finite.`); return value; }

export type ActivePhysicalEffectorDrive3D = { cue: Extract<PhysicalPerformanceCue3D, { kind: "effector-drive" }>; start: [number, number, number]; startRotation: [number, number, number, number]; orientationGoal?: ResolvedEffectorOrientation3D; support?: { boneId: string; jointIds: string[] }; startTick: number };

export type PhysicalDriveContext3D = {
  world: ReturnType<typeof createRigidWorld3D>;
  ragdolls: ReturnType<typeof createRagdollSystem3D>;
  jointDrives: Extract<PhysicalPerformanceCue3D, { kind: "joint-drive" }>[];
  effectorDrives: Map<string, ActivePhysicalEffectorDrive3D>;
  forcedHandles: Set<number>;
  cueIndexById: Map<string, number>;
  locomotionProfiles: PhysicalLocomotionProfile3D[];
  simulationHz: number; stepsPerFrame: number; frameRate: number; readonly simulationTick: number;
  allowActionCue: (cue: Extract<PhysicalPerformanceCue3D, { kind: "joint-drive" | "effector-drive" | "launch" }>, interrupted: boolean) => boolean;
  characterState: (id: string) => PhysicalCharacterState3D;
};

export function createPhysicalDriveController3D(context: PhysicalDriveContext3D) {
  const { world, ragdolls, jointDrives, effectorDrives, forcedHandles, cueIndexById, locomotionProfiles, simulationHz, stepsPerFrame, frameRate, allowActionCue, characterState } = context;

  function directionToBody(cue: Extract<PhysicalPerformanceCue3D, { kind: "effector-drive" }>, source: RigidBodyState3D): [number, number, number] {
    if (cue.orientation?.mode !== "aim-at-body") throw new Error(`${cue.id} has no target-aware orientation.`);
    const target = requireBody(world, resolveHandle(cue.orientation.target, world, ragdolls), `${cue.id} orientation target`), direction = [target.x - source.x, target.y - source.y, target.z - source.z] as const;
    if (Math.hypot(...direction) <= 1e-12) throw new Error(`${cue.id} cannot aim at a body with the same center as its effector. Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/orientation/target. Move either body, choose another target, or use align-direction.`);
    return normalized(direction, `${cue.id} orientation target direction`);
  }

  function applyPhysicalDrives() {
    const sampleSeconds = (context.simulationTick + .5) / simulationHz;
    for (const cue of jointDrives) {
      const startSeconds = cue.frame / frameRate, durationSeconds = cue.durationFrames / frameRate, progress = (sampleSeconds - startSeconds) / durationSeconds;
      if (progress <= 0 || progress >= 1 || !allowActionCue(cue, true)) continue;
      const distanceRadians = cue.angularDistanceDegrees * Math.PI / 180, targetAngularVelocity = distanceRadians / durationSeconds * 6 * progress * (1 - progress);
      for (const handle of ragdolls.applyJointDrive(cue.ragdollId, { jointId: cue.jointId, axisParentLocal: cue.axisParentLocal, targetAngularVelocity, maxTorqueImpulse: cue.maxTorqueImpulse ?? 4 })) forcedHandles.add(handle);
    }
    for (const [id, active] of effectorDrives) {
      const cue = active.cue;
      const startSeconds = active.startTick / simulationHz, durationSeconds = cue.durationFrames / frameRate, progress = (sampleSeconds - startSeconds) / durationSeconds;
      if (progress <= 0) continue; if (progress >= 1) { effectorDrives.delete(id); continue; } if (!allowActionCue(cue, true)) continue;
      const body = requireBodyState(ragdolls.body(cue.ragdollId, cue.effectorBoneId), `${cue.ragdollId}/${cue.effectorBoneId}`), liveTarget = cue.translationTarget ? requireBody(world, resolveHandle(cue.translationTarget, world, ragdolls), `${cue.id} translation target`) : undefined, liveDelta = liveTarget ? [liveTarget.x - active.start[0], liveTarget.y - active.start[1], liveTarget.z - active.start[2]] as const : undefined, liveDistance = liveDelta ? Math.hypot(...liveDelta) : 0, direction = liveDelta && liveDistance > 1e-12 ? tuple3(liveDelta[0] / liveDistance, liveDelta[1] / liveDistance, liveDelta[2] / liveDistance) : normalized(cue.direction, `${cue.id} direction`), distanceMeters = liveTarget ? Math.min(cue.distanceMeters, liveDistance) : cue.distanceMeters, path = samplePhysicalEffectorPath3D({ path: cue.path, direction, distanceMeters, progress, durationSeconds }), gain = cue.trackingGainPerSecond ?? 8;
      const target = [active.start[0] + path.offset[0], active.start[1] + path.offset[1], active.start[2] + path.offset[2]] as const, requested = [path.velocity[0] + (target[0] - body.x) * gain, path.velocity[1] + (target[1] - body.y) * gain, path.velocity[2] + (target[2] - body.z) * gain] as const, requestedLength = Math.hypot(...requested), scale = requestedLength > cue.peakSpeedMetersPerSecond ? cue.peakSpeedMetersPerSecond / requestedLength : 1;
      const angular = active.orientationGoal ? sampleEffectorAngularVelocity(active.orientationGoal, [body.rotationX, body.rotationY, body.rotationZ, body.rotationW], progress, durationSeconds) : undefined;
      for (const handle of ragdolls.applyEffectorDrive(cue.ragdollId, { effectorBoneId: cue.effectorBoneId, jointIds: active.support?.jointIds ?? cue.jointIds, ...(active.support ? { baseBoneId: active.support.boneId } : {}), targetVelocity: [requested[0] * scale, requested[1] * scale, requested[2] * scale], velocityGain: cue.velocityGain, maxTorqueImpulse: cue.maxTorqueImpulse ?? .25, ...(angular ? { targetAngularVelocity: angular, maxAngularTorqueImpulse: cue.orientation!.maxTorqueImpulse ?? .1 } : {}) })) forcedHandles.add(handle);
    }
  }

  function applyPhysicalLocomotion() {
    const traveling = new Set<string>(), sampleTick = context.simulationTick + .5;
    for (const profile of locomotionProfiles) {
      const cue = profile.cue;
      const startTick = cue.frame * stepsPerFrame, durationTicks = cue.durationFrames * stepsPerFrame, progress = (sampleTick - startTick) / durationTicks;
      if (progress <= 0 || progress >= 1 || characterState(cue.ragdollId).authority !== "ready") continue;
      const horizontalLength = Math.hypot(cue.direction[0], cue.direction[2]);
      const speed = samplePhysicalLocomotionSpeed3D(profile, progress), directionX = cue.direction[0] / horizontalLength, directionZ = cue.direction[2] / horizontalLength;
      for (const handle of ragdolls.driveRootMotion(cue.ragdollId, { delta: [directionX * speed / simulationHz, 0, directionZ * speed / simulationHz], durationSeconds: 1 / simulationHz, maxImpulse: cue.maxImpulse, facing: [directionX, 0, directionZ] })) forcedHandles.add(handle);
      traveling.add(cue.ragdollId);
    }
    return traveling;
  }
  return { directionToBody, applyPhysicalDrives, applyPhysicalLocomotion };
}

export function writePhysicalBodyState(world: ReturnType<typeof createRigidWorld3D>, handles: readonly number[], output: Float32Array, offset = 0): number {
  const required = handles.length * PHYSICAL_BODY_STATE_STRIDE_3D;
  if (!(output instanceof Float32Array) || offset < 0 || !Number.isSafeInteger(offset) || output.length - offset < required) throw new RangeError(`Physical state output needs ${required} floats after offset.`);
  for (const handle of handles) {
    const body = requireBody(world, handle, "output");
    output.set([body.x, body.y, body.z, body.rotationX, body.rotationY, body.rotationZ, body.rotationW, body.velocityX, body.velocityY, body.velocityZ, body.angularVelocityX, body.angularVelocityY, body.angularVelocityZ], offset);
    offset += PHYSICAL_BODY_STATE_STRIDE_3D;
  }
  return required;
}


export function configureRagdollActivation3D(world: ReturnType<typeof createRigidWorld3D>, activationBodies: ReadonlyMap<string, readonly Pick<RigidBodyState3D, "handle" | "mass" | "collisionLayer" | "collisionMask" | "continuous">[]>, inactiveRagdolls: Set<string>, ragdollId: string, active: boolean) {
  const bodies = activationBodies.get(ragdollId); if (!bodies) throw new Error(`Physical ragdoll ${ragdollId} does not exist.`);
  for (const body of bodies) {
    world.configureBody(body.handle, active
      ? { type: "dynamic", mass: body.mass, collisionLayer: body.collisionLayer, collisionMask: body.collisionMask, continuous: body.continuous }
      : { type: "kinematic", collisionLayer: body.collisionLayer, collisionMask: 0, continuous: false });
    world.setVelocity(body.handle, 0, 0, 0); world.setAngularVelocity(body.handle, 0, 0, 0);
  }
  if (active) inactiveRagdolls.delete(ragdollId); else inactiveRagdolls.add(ragdollId);
}
