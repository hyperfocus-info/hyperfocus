import { requireText } from "@hyperfocus/utilities/text";
import type { PhysicalPerformanceCue3D } from "../physical-performance-3d.ts";
import { RAGDOLL_POSTURES_3D, RAGDOLL_RECOVERY_ENVIRONMENTS_3D } from "../physical-performance-3d.ts";
import { createRagdollSystem3D, type RagdollDefinition3D, type RagdollPose3D, type RagdollRecoveryTarget3D } from "../ragdoll-3d.ts";
import { createRigidWorld3D, type RigidBodyState3D, type RigidRaycastHit3D } from "../rigid-3d.ts";
import { validateEffectorOrientation } from "./effector-orientation-3d.ts";
import { requiredPhysicalEffectorPeakSpeed3D, validatePhysicalEffectorPath3D } from "./effector-path-3d.ts";
import { finite, normalized, requireBody, requireBodyState, resolveHandle, vector3 } from "./physical-drives-3d.ts";

export function preflightCues(cues: readonly PhysicalPerformanceCue3D[], durationFrames: number, performanceFrameRate: number, world: ReturnType<typeof createRigidWorld3D>, ragdolls: ReturnType<typeof createRagdollSystem3D>, poses: ReadonlyMap<string, RagdollPose3D>, definitions: readonly RagdollDefinition3D[]) {
  const ids = new Set<string>(), supports = new Map<string, Array<{ start: number; end: number; id: string }>>(), drives = new Map<string, Array<{ start: number; end: number; id: string }>>(), travels = new Map<string, Array<{ start: number; end: number; id: string }>>(), launches = new Map(cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "launch" }> => cue.kind === "launch").map((cue) => [cue.id, cue] as const));
  for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
    const cue = cues[cueIndex]!;
    const id = text(cue.id, "cue id");
    if (ids.has(id)) throw new Error(`Physical cue ${id} is duplicated.`);
    ids.add(id);
    const activationFrame = validateContactAnchor(cue, cueIndex, launches, durationFrames);
    for (const ragdollId of cueRagdollIds(cue)) {
      const definitionIndex = definitions.findIndex((item) => item.id === ragdollId), definition = definitions[definitionIndex];
      if (!definition) continue;
      const requiredFrame = definition.activationFrame ?? 0;
      if (activationFrame < requiredFrame) throw new RangeError(`${cue.id} resolves at frame ${activationFrame} before ${ragdollId} takes physical authority at frame ${requiredFrame}. Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}/frame. Move the cue to frame ${requiredFrame} or later, or lower /extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/${definitionIndex}/activationFrame.`);
    }
    if (cue.kind === "launch") {
      resolveHandle(cue.attacker, world, ragdolls); if (cue.target) resolveHandle(cue.target, world, ragdolls);
      const targeting = cue.targeting ?? "authored";
      if (targeting !== "authored" && targeting !== "target-at-launch") throw new TypeError(`${cue.id} targeting is unsupported; choose authored or target-at-launch.`);
      if (targeting === "target-at-launch") {
        if (!cue.target) throw new Error(`${cue.id} target-at-launch needs a target body reference.`);
        if (cue.targetTravelPaddingMeters !== undefined) nonnegative(cue.targetTravelPaddingMeters, `${cue.id} targetTravelPaddingMeters`);
      } else {
        normalized(cue.direction!, `${cue.id} direction`); positive(cue.distanceMeters!, `${cue.id} distanceMeters`);
      }
      positive(cue.speedMetersPerSecond, `${cue.id} speedMetersPerSecond`);
      const actuation = cue.actuation ?? "external";
      if (actuation !== "whole-body" && actuation !== "external") throw new TypeError(`${cue.id} actuation is unsupported; choose whole-body or external.`);
      if (cue.allowAirborneExternalActuation !== undefined && typeof cue.allowAirborneExternalActuation !== "boolean") throw new TypeError(`${cue.id} allowAirborneExternalActuation must be boolean.`);
      validateAuthorityOverride(cue, cueIndex);
      if (actuation === "whole-body" && (definitions.find((definition) => definition.id === cue.attacker.ragdollId)?.bodies.length ?? 0) < 2) throw new Error(`${cue.id} whole-body actuation needs at least two physical bodies. Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}/actuation. Auto-rig the full character or choose external actuation for a deliberate launch.`);
      if (cue.angularVelocityDegreesPerSecond) vector3(cue.angularVelocityDegreesPerSecond, `${cue.id} angularVelocityDegreesPerSecond`);
      if (cue.localPoint) vector3(cue.localPoint, `${cue.id} localPoint`);
      if (cue.expectedContactFrame !== undefined) {
        frameIndex(cue.expectedContactFrame, durationFrames);
        if (cue.expectedContactFrame < cue.frame) throw new RangeError(`${cue.id} expectedContactFrame must be on or after its launch frame.`);
      }
      if (cue.contactToleranceFrames !== undefined) nonnegativeInteger(cue.contactToleranceFrames, `${cue.id} contactToleranceFrames`);
      if (cue.targetModeOnContact !== undefined && !["auto", "active", "passive"].includes(cue.targetModeOnContact)) throw new TypeError(`${cue.id} targetModeOnContact is unsupported; choose auto, active, or passive.`);
    } else if (cue.kind === "pose") ragdolls.validatePose(cue.ragdollId, cue.pose);
    else if (cue.kind === "locomotion") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`, duration = positiveInteger(cue.durationFrames, `${cue.id} durationFrames`), end = cue.frame + duration;
      if (end > durationFrames) throw new RangeError(`${cue.id} locomotion ends after physical performance duration. Project pointer: ${pointer}/durationFrames.`);
      ragdolls.status(cue.ragdollId);
      const direction = vector3(cue.direction, `${cue.id} direction`); if (Math.hypot(direction[0], direction[2]) <= 1e-12) throw new RangeError(`${cue.id} needs a non-zero horizontal direction. Project pointer: ${pointer}/direction.`);
      const distance = positive(cue.distanceMeters, `${cue.id} distanceMeters`), peak = positive(cue.peakSpeedMetersPerSecond, `${cue.id} peakSpeedMetersPerSecond`), requiredPeak = 1.5 * distance / (duration / performanceFrameRate);
      if (requiredPeak > peak + 1e-9) throw new RangeError(`${cue.id} needs ${requiredPeak.toFixed(3)} m/s for its smooth physical travel but is capped at ${peak}. Project pointer: ${pointer}/peakSpeedMetersPerSecond. Increase peak speed, shorten distance, or use at least ${Math.ceil(1.5 * distance / peak * performanceFrameRate)} frames.`);
      if (cue.maxImpulse !== undefined) positive(cue.maxImpulse, `${cue.id} maxImpulse`);
      if (cue.pace !== undefined && !["walk", "jog", "run", "sprint"].includes(cue.pace)) throw new TypeError(`${cue.id} locomotion pace is unsupported. Project pointer: ${pointer}/pace. Choose walk, jog, run, or sprint.`);
      if (cue.posture !== undefined && !["upright", "crouch"].includes(cue.posture)) throw new TypeError(`${cue.id} locomotion posture is unsupported. Project pointer: ${pointer}/posture. Choose upright or crouch.`);
      if (cue.cycleDistanceScale !== undefined) positive(cue.cycleDistanceScale, `${cue.id} cycleDistanceScale`);
      const windows = travels.get(cue.ragdollId) ?? [], overlap = windows.find((window) => cue.frame < window.end && end > window.start); if (overlap) throw new Error(`Physical locomotion ${cue.id} overlaps ${overlap.id} on ${cue.ragdollId}. Project pointer: ${pointer}/frame.`); windows.push({ start: cue.frame, end, id: cue.id }); travels.set(cue.ragdollId, windows);
    }
    else if (cue.kind === "jump") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`;
      const direction = vector3(cue.direction, `${cue.id} direction`), horizontal = Math.hypot(direction[0], direction[2]), horizontalSpeed = nonnegative(cue.horizontalSpeedMetersPerSecond, `${cue.id} horizontalSpeedMetersPerSecond`), verticalSpeed = positive(cue.verticalSpeedMetersPerSecond, `${cue.id} verticalSpeedMetersPerSecond`);
      if (horizontalSpeed > 0 && horizontal <= 1e-12) throw new RangeError(`${cue.id} needs a horizontal direction when horizontal speed is non-zero. Project pointer: ${pointer}/direction.`);
      try { ragdolls.validateTakeoff(cue.ragdollId, { supportBoneIds: cue.supportBoneIds, velocity: [horizontalSpeed, verticalSpeed, 0], groundLayerMask: cue.groundLayerMask, probeDistance: cue.probeDistance, minimumNormalY: cue.minimumNormalY, maximumGroundedVerticalSpeedMetersPerSecond: cue.maximumGroundedVerticalSpeedMetersPerSecond }); }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}. Choose stable foot or support bones and positive takeoff speed.`); }
    }
    else if (cue.kind === "joint-drive") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`, duration = positiveInteger(cue.durationFrames, `${cue.id} durationFrames`), end = cue.frame + duration;
      if (end > durationFrames) throw new RangeError(`${cue.id} joint drive ends after physical performance duration. Project pointer: ${pointer}/durationFrames.`);
      const distance = finite(cue.angularDistanceDegrees, `${cue.id} angularDistanceDegrees`); if (Math.abs(distance) <= 1e-6) throw new RangeError(`${cue.id} angularDistanceDegrees must be non-zero. Project pointer: ${pointer}/angularDistanceDegrees.`);
      const peak = positive(cue.peakAngularSpeedDegreesPerSecond, `${cue.id} peakAngularSpeedDegreesPerSecond`), requiredPeak = 1.5 * Math.abs(distance) / (duration / performanceFrameRate);
      if (requiredPeak > peak + 1e-9) throw new RangeError(`${cue.id} needs ${requiredPeak.toFixed(2)} degrees/s for its smooth distance but is capped at ${peak}. Project pointer: ${pointer}/peakAngularSpeedDegreesPerSecond. Increase the speed or use at least ${Math.ceil(1.5 * Math.abs(distance) / peak * performanceFrameRate)} frames.`);
      try { ragdolls.validateJointDrive(cue.ragdollId, { jointId: cue.jointId, axisParentLocal: cue.axisParentLocal, targetAngularVelocity: 0, maxTorqueImpulse: cue.maxTorqueImpulse ?? 4 }); }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}. Choose an existing driven joint and a non-zero parent-local axis.`); }
      if (cue.phase !== undefined && !["anticipation", "contact", "follow-through", "recovery"].includes(cue.phase)) throw new TypeError(`${cue.id} joint-drive phase is unsupported. Project pointer: ${pointer}/phase.`);
      validateAuthorityOverride(cue, cueIndex);
      const key = `${cue.ragdollId}/${cue.jointId}`, windows = drives.get(key) ?? [], overlap = windows.find((window) => cue.frame < window.end && end > window.start); if (overlap) throw new Error(`Physical joint drive ${cue.id} overlaps ${overlap.id} on ${key}. Project pointer: ${pointer}/frame.`); windows.push({ start: cue.frame, end, id: cue.id }); drives.set(key, windows);
    }
    else if (cue.kind === "effector-drive") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`, duration = positiveInteger(cue.durationFrames, `${cue.id} durationFrames`), end = cue.frame + duration;
      if (end > durationFrames) throw new RangeError(`${cue.id} effector drive ends after physical performance duration. Project pointer: ${pointer}/durationFrames.`);
      const direction = normalized(cue.direction, `${cue.id} direction`); if (cue.path) validatePhysicalEffectorPath3D(cue.path, `${pointer}/path`); const distance = positive(cue.distanceMeters, `${cue.id} distanceMeters`), peak = positive(cue.peakSpeedMetersPerSecond, `${cue.id} peakSpeedMetersPerSecond`), requiredPeak = requiredPhysicalEffectorPeakSpeed3D({ path: cue.path, direction, distanceMeters: distance, durationSeconds: duration / performanceFrameRate });
      if (requiredPeak > peak + 1e-9) throw new RangeError(`${cue.id} needs ${requiredPeak.toFixed(3)} m/s for its smooth distance but is capped at ${peak}. Project pointer: ${pointer}/peakSpeedMetersPerSecond. Increase the speed or use at least ${Math.ceil(1.5 * distance / peak * performanceFrameRate)} frames.`);
      if (cue.supportMode !== undefined && cue.supportMode !== "auto" && cue.supportMode !== "free") throw new TypeError(`${cue.id} supportMode is unsupported; choose auto or free. Project pointer: ${pointer}/supportMode.`);
      try { ragdolls.validateEffectorDrive(cue.ragdollId, { effectorBoneId: cue.effectorBoneId, jointIds: cue.jointIds, targetVelocity: [0, 0, 0], velocityGain: cue.velocityGain, maxTorqueImpulse: cue.maxTorqueImpulse ?? .25, ...(cue.orientation ? { targetAngularVelocity: [0, 0, 0], maxAngularTorqueImpulse: cue.orientation.maxTorqueImpulse ?? .1 } : {}) }); }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}. Choose one connected base-to-effector chain ending at the selected physical bone.`); }
      if (cue.orientation) {
        validateEffectorOrientation(cue.id, cue.orientation, duration, performanceFrameRate, `${pointer}/orientation`);
        if (cue.orientation.mode === "aim-at-body") {
          const effectorHandle = requireBodyState(ragdolls.body(cue.ragdollId, cue.effectorBoneId), `${cue.ragdollId}/${cue.effectorBoneId}`).handle;
          let targetHandle: number;
          try { targetHandle = resolveHandle(cue.orientation.target, world, ragdolls); }
          catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}/orientation/target. Choose an existing world body or physical character bone.`); }
          if (targetHandle === effectorHandle) throw new Error(`${cue.id} cannot aim its effector at itself. Project pointer: ${pointer}/orientation/target. Choose another body or use align-direction.`);
        }
      }
      if (cue.translationTarget) {
        const effectorHandle = requireBodyState(ragdolls.body(cue.ragdollId, cue.effectorBoneId), `${cue.ragdollId}/${cue.effectorBoneId}`).handle;
        let targetHandle: number;
        try { targetHandle = resolveHandle(cue.translationTarget, world, ragdolls); }
        catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}/translationTarget. Choose an existing world body or physical character bone.`); }
        if (targetHandle === effectorHandle) throw new Error(`${cue.id} cannot track its effector toward itself. Project pointer: ${pointer}/translationTarget. Choose another body or remove live target tracking.`);
      }
      if (cue.phase !== undefined && !["anticipation", "contact", "follow-through", "recovery"].includes(cue.phase)) throw new TypeError(`${cue.id} effector-drive phase is unsupported. Project pointer: ${pointer}/phase.`);
      validateAuthorityOverride(cue, cueIndex);
      if (cue.trackingGainPerSecond !== undefined) { const gain = finite(cue.trackingGainPerSecond, `${cue.id} trackingGainPerSecond`); if (gain < .1 || gain > 60) throw new RangeError(`${cue.id} trackingGainPerSecond must be from 0.1 through 60.`); }
      if (cue.afterContact) validateEffectorContactSource(cue, cue.afterContact.cueId, launches, `${pointer}/afterContact/cueId`);
      if (cue.stopAtContact) validateEffectorContactSource(cue, text(cue.stopAtContact.cueId, `${cue.id} stopAtContact cueId`), launches, `${pointer}/stopAtContact/cueId`);
      if (cue.afterContact && cue.stopAtContact && cue.afterContact.cueId === cue.stopAtContact.cueId) throw new Error(`${cue.id} cannot start and stop from the same contact event. Project pointer: ${pointer}/stopAtContact/cueId. Use separate phase cues for contact and follow-through.`);
      for (const jointId of cue.jointIds) { const key = `${cue.ragdollId}/${jointId}`, windows = drives.get(key) ?? [], overlap = windows.find((window) => cue.frame < window.end && end > window.start); if (overlap) throw new Error(`Physical effector drive ${cue.id} overlaps ${overlap.id} on ${key}. Project pointer: ${pointer}/frame.`); windows.push({ start: cue.frame, end, id: cue.id }); drives.set(key, windows); }
    }
    else if (cue.kind === "bind") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`, duration = positiveInteger(cue.durationFrames, `${cue.id} durationFrames`), end = activationFrame + duration;
      if (end > durationFrames) throw new RangeError(`${cue.id} bind cannot finish inside the physical performance. Project pointer: ${pointer}/durationFrames. Shorten the bind or extend the performance.`);
      const a = resolveHandle(cue.a, world, ragdolls), b = resolveHandle(cue.b, world, ragdolls); if (a === b) throw new Error(`${cue.id} cannot bind a physical body to itself. Project pointer: ${pointer}/b. Choose another body or bone.`);
      if (requireBody(world, a, cue.id).type !== "dynamic" && requireBody(world, b, cue.id).type !== "dynamic") throw new Error(`${cue.id} needs at least one dynamic endpoint. Project pointer: ${pointer}. Bind a dynamic hand, prop, or character body instead.`);
      if (cue.anchorMode !== "contact" && cue.anchorMode !== "authored") throw new TypeError(`${cue.id} anchorMode is unsupported. Project pointer: ${pointer}/anchorMode. Choose contact or authored.`);
      if (cue.rotationMode !== undefined && cue.rotationMode !== "pivot" && cue.rotationMode !== "preserve") throw new TypeError(`${cue.id} rotationMode is unsupported. Project pointer: ${pointer}/rotationMode. Choose pivot or preserve.`);
      if (cue.anchorMode === "contact") {
        if (!cue.afterContact) throw new Error(`${cue.id} contact bind needs an exact launch contact. Project pointer: ${pointer}/afterContact. Choose a targeted launch cue or use authored anchors.`);
        if (cue.afterContact.offsetFrames !== 0) throw new RangeError(`${cue.id} contact bind must start on the exact solver contact. Project pointer: ${pointer}/afterContact/offsetFrames. Use zero or choose authored anchors for a later bind.`);
        if (cue.localAnchorA || cue.localAnchorB) throw new Error(`${cue.id} contact bind derives both local anchors from collision. Project pointer: ${pointer}/localAnchorA. Remove authored anchors or choose authored mode.`);
        const launch = launches.get(cue.afterContact.cueId)!; if (!launch.target) throw new Error(`${cue.id} contact source ${launch.id} has no explicit target. Project pointer: ${pointer}/afterContact/cueId. Choose a targeted launch so the bound pair is deterministic.`);
        const attacker = resolveHandle(launch.attacker, world, ragdolls), target = resolveHandle(launch.target, world, ragdolls); if (!(a === attacker && b === target || a === target && b === attacker)) throw new Error(`${cue.id} endpoints do not match contact source ${launch.id}. Project pointer: ${pointer}/afterContact/cueId. Select that launch's attacker and target bodies.`);
      } else if (cue.afterContact) throw new Error(`${cue.id} authored bind cannot also use afterContact. Project pointer: ${pointer}/afterContact. Remove the contact source or choose contact anchors.`);
      if (cue.localAnchorA) vector3(cue.localAnchorA, `${cue.id} localAnchorA`); if (cue.localAnchorB) vector3(cue.localAnchorB, `${cue.id} localAnchorB`);
      validateBindTuning(cue, pointer);
    }
    else if (cue.kind === "recovery") {
      if (cue.target.positionMode !== undefined && cue.target.positionMode !== "authored" && cue.target.positionMode !== "settled") throw new TypeError(`${cue.id} recovery positionMode is unsupported; choose authored or settled.`);
      if (cue.getUp) {
        ragdolls.posture(cue.ragdollId, text(cue.getUp.postureBoneId, `${cue.id} getUp postureBoneId`));
        for (const posture of RAGDOLL_POSTURES_3D) text(cue.getUp.clips[posture], `${cue.id} getUp ${posture} clip`);
        if (cue.getUp.environment) {
          const environmentClips = Object.entries(cue.getUp.environment.clips);
          if (environmentClips.length === 0) throw new Error(`${cue.id} getUp environment needs at least one crouched, wall-supported, or ledge-supported clip.`);
          for (const [environment, clipId] of environmentClips) { if (!RAGDOLL_RECOVERY_ENVIRONMENTS_3D.some((known) => known === environment)) throw new TypeError(`${cue.id} getUp environment ${environment} is unsupported.`); text(clipId, `${cue.id} getUp ${environment} clip`); }
          if (cue.getUp.environment.proximityMeters !== undefined) nonnegative(cue.getUp.environment.proximityMeters, `${cue.id} getUp environment proximityMeters`);
          if (cue.getUp.environment.standingHeadroomMeters !== undefined) nonnegative(cue.getUp.environment.standingHeadroomMeters, `${cue.id} getUp environment standingHeadroomMeters`);
          if (cue.getUp.environment.ledgeProbeDistance !== undefined) positive(cue.getUp.environment.ledgeProbeDistance, `${cue.id} getUp environment ledgeProbeDistance`);
          if (cue.getUp.environment.ledgeHeightTolerance !== undefined) nonnegative(cue.getUp.environment.ledgeHeightTolerance, `${cue.id} getUp environment ledgeHeightTolerance`);
        }
        if (cue.getUp.sourceStartSeconds !== undefined) nonnegative(cue.getUp.sourceStartSeconds, `${cue.id} getUp sourceStartSeconds`);
        if (cue.getUp.speed !== undefined) positive(cue.getUp.speed, `${cue.id} getUp speed`);
        if (cue.getUp.loop !== undefined && typeof cue.getUp.loop !== "boolean") throw new TypeError(`${cue.id} getUp loop must be boolean.`);
      }
      const resolution = resolveRecoveryTarget(cue, definitions, ragdolls, poses, false); if (!resolution.target) throw new Error(resolution.message);
      ragdolls.validateRecovery(cue.ragdollId, resolution.target);
      if (cue.startCondition !== undefined && cue.startCondition !== "at-frame" && cue.startCondition !== "after-settled") throw new TypeError(`${cue.id} recovery startCondition is unsupported; choose at-frame or after-settled.`);
      if (cue.maximumWaitFrames !== undefined) positiveInteger(cue.maximumWaitFrames, `${cue.id} maximumWaitFrames`);
      if (cue.startCondition === "after-settled" && activationFrame + (cue.maximumWaitFrames ?? durationFrames - 1 - activationFrame) >= durationFrames) throw new RangeError(`${cue.id} settled recovery wait must end before the physical performance duration.`);
    }
    else if (cue.kind === "support" || cue.kind === "step") {
      const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}`;
      try { if (cue.kind === "step") ragdolls.validateStep(cue.ragdollId, { ...cue, durationSeconds: positiveInteger(cue.durationFrames, `${cue.id} durationFrames`) / performanceFrameRate }); else ragdolls.validateSupport(cue.ragdollId, cue); }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: ${pointer}. Choose a supported rig bone and reachable collidable ground, or adjust the bounded controller fields.`); }
      positiveInteger(cue.durationFrames, `${cue.id} durationFrames`);
      if (cue.kind === "step") nonnegativeInteger(cue.holdFrames, `${cue.id} holdFrames`);
      const end = cue.frame + cue.durationFrames + (cue.kind === "step" ? cue.holdFrames : 0); if (end > durationFrames) throw new RangeError(`${cue.id} ${cue.kind} ends after physical performance duration.`);
      const key = `${cue.ragdollId}/${cue.boneId}`, windows = supports.get(key) ?? []; if (windows.some((window) => cue.frame < window.end && end > window.start)) throw new Error(`Physical support ${cue.id} overlaps ${windows.find((window) => cue.frame < window.end && end > window.start)!.id} on ${key}.`); windows.push({ start: cue.frame, end, id: cue.id }); supports.set(key, windows);
    }
    else {
      ragdolls.status(cue.ragdollId);
      if (cue.mode !== "animated" && cue.mode !== "active" && cue.mode !== "passive") throw new TypeError(`${cue.id} mode is unsupported.`);
      if (cue.durationSeconds !== undefined) nonnegative(cue.durationSeconds, `${cue.id} durationSeconds`);
      if (cue.discontinuous !== undefined && typeof cue.discontinuous !== "boolean") throw new TypeError(`${cue.id} discontinuous must be boolean.`);
    }
  }
}

export function cueRagdollIds(cue: PhysicalPerformanceCue3D): Set<string> {
  const ids = new Set<string>();
  if (cue.kind === "launch") { ids.add(cue.attacker.ragdollId); if (cue.target && "ragdollId" in cue.target) ids.add(cue.target.ragdollId); }
  else if (cue.kind === "bind") { if ("ragdollId" in cue.a) ids.add(cue.a.ragdollId); if ("ragdollId" in cue.b) ids.add(cue.b.ragdollId); }
  else ids.add(cue.ragdollId);
  if (cue.kind === "effector-drive") {
    if (cue.orientation?.mode === "aim-at-body" && "ragdollId" in cue.orientation.target) ids.add(cue.orientation.target.ragdollId);
    if (cue.translationTarget && "ragdollId" in cue.translationTarget) ids.add(cue.translationTarget.ragdollId);
  }
  return ids;
}

export function validateAuthorityOverride(cue: Extract<PhysicalPerformanceCue3D, { kind: "joint-drive" | "effector-drive" | "launch" }>, cueIndex: number) { if (cue.allowAuthorityOverride !== undefined && typeof cue.allowAuthorityOverride !== "boolean") throw new TypeError(`${cue.id} allowAuthorityOverride must be boolean. Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}/allowAuthorityOverride.`); }

export function validateContactAnchor(cue: PhysicalPerformanceCue3D, cueIndex: number, launches: ReadonlyMap<string, Extract<PhysicalPerformanceCue3D, { kind: "launch" }>>, durationFrames: number): number {
  if ((cue.kind !== "mode" && cue.kind !== "recovery" && cue.kind !== "effector-drive" && cue.kind !== "bind") || cue.afterContact === undefined) return cue.frame;
  const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndex}/afterContact`, cueId = text(cue.afterContact.cueId, `${cue.id} contact anchor cueId`), offsetFrames = nonnegativeInteger(cue.afterContact.offsetFrames, `${cue.id} contact anchor offsetFrames`), launch = launches.get(cueId);
  if (!launch) throw new Error(`${cue.id} afterContact references missing launch ${cueId}. Project pointer: ${pointer}/cueId. Choose an existing launch cue or remove the contact anchor.`);
  const earliestFrame = launch.frame + offsetFrames;
  if (earliestFrame >= durationFrames) throw new RangeError(`${cue.id} contact anchor cannot resolve inside the performance even at the earliest possible contact. Project pointer: ${pointer}/offsetFrames. Shorten the offset or extend the performance.`);
  if ((cue.kind === "effector-drive" || cue.kind === "bind") && earliestFrame + cue.durationFrames > durationFrames) throw new RangeError(`${cue.id} contact-anchored ${cue.kind} cannot finish inside the performance even at the earliest possible contact. Project pointer: ${pointer}/offsetFrames. Shorten the offset or duration, or extend the performance.`);
  return earliestFrame;
}

export function validateEffectorContactSource(cue: Extract<PhysicalPerformanceCue3D, { kind: "effector-drive" }>, sourceCueId: string, launches: ReadonlyMap<string, Extract<PhysicalPerformanceCue3D, { kind: "launch" }>>, pointer: string) {
  const launch = launches.get(sourceCueId);
  if (!launch) throw new Error(`${cue.id} references missing launch ${sourceCueId}. Project pointer: ${pointer}. Choose an existing launch cue with this effector as its attacker.`);
  if (launch.attacker.ragdollId !== cue.ragdollId || launch.attacker.boneId !== cue.effectorBoneId) throw new Error(`${cue.id} contact source ${sourceCueId} is driven by ${launch.attacker.ragdollId}/${launch.attacker.boneId}, not ${cue.ragdollId}/${cue.effectorBoneId}. Project pointer: ${pointer}. Choose the launch emitted by this effector.`);
  if (!launch.target) throw new Error(`${cue.id} contact source ${sourceCueId} has no explicit target. Project pointer: ${pointer}. Choose a targeted launch so the phase transition has one unambiguous collision.`);
}

export function resolveRecoveryTarget(cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>, definitions: readonly RagdollDefinition3D[], ragdolls: ReturnType<typeof createRagdollSystem3D>, poses: ReadonlyMap<string, RagdollPose3D>, sampleTerrain = true): { target?: RagdollRecoveryTarget3D; message: string } {
  const { positionMode = "authored", rootPosition: authoredPosition, pose: authoredPose, ...target } = cue.target;
  const definition = definitions.find((item) => item.id === cue.ragdollId); if (!definition) throw new Error(`Ragdoll ${cue.ragdollId} does not exist.`);
  const rootDefinition = definition.bodies.find((item) => item.boneId === definition.rootBoneId); if (!rootDefinition) throw new Error(`Ragdoll ${cue.ragdollId} root body ${definition.rootBoneId} does not exist.`);
  const root = requireBodyState(ragdolls.body(cue.ragdollId, definition.rootBoneId), `${cue.ragdollId}/${definition.rootBoneId}`);
  const terrain = sampleTerrain && positionMode === "settled" && target.requireStableSupport === true && target.supportBoneIds?.length ? resolveSettledTerrainHeight(cue, definition, rootDefinition, root, ragdolls) : undefined;
  if (terrain?.message) return { message: terrain.message };
  const rootPosition = positionMode === "settled" ? [root.x, terrain?.height ?? rootDefinition.body.y ?? 0, root.z] as const : authoredPosition;
  if (!rootPosition) throw new Error(`${cue.id} authored recovery needs rootPosition; choose positionMode settled to recover where physics ends.`);
  return { target: { ...target, rootPosition, pose: authoredPose ?? requirePose(poses, cue.ragdollId) }, message: "" };
}

export function resolveSettledTerrainHeight(cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>, definition: RagdollDefinition3D, rootDefinition: RagdollDefinition3D["bodies"][number], root: RigidBodyState3D, ragdolls: ReturnType<typeof createRagdollSystem3D>): { height?: number; message?: string } {
  const canonicalRoot = [rootDefinition.body.x ?? 0, rootDefinition.body.y ?? 0, rootDefinition.body.z ?? 0] as const, selfHandles = new Set<number>();
  for (const item of definition.bodies) selfHandles.add(requireBodyState(ragdolls.body(definition.id, item.boneId), `${definition.id}/${item.boneId}`).handle);
  const probeDistance = cue.target.supportProbeDistance ?? .3, padding = cue.target.clearancePadding ?? .02, minimumNormalY = cue.target.minimumSupportNormalY ?? .6, groundLayerMask = cue.target.groundLayerMask ?? 1, hit = emptyRaycast();
  let rootY = Number.NEGATIVE_INFINITY;
  for (const boneId of cue.target.supportBoneIds ?? []) {
    const supportDefinition = definition.bodies.find((item) => item.boneId === boneId); if (!supportDefinition) throw new Error(`Ragdoll ${definition.id} recovery support body ${boneId} does not exist.`);
    const support = requireBodyState(ragdolls.body(definition.id, boneId), `${definition.id}/${boneId}`), canonicalSupport = [supportDefinition.body.x ?? 0, supportDefinition.body.y ?? 0, supportDefinition.body.z ?? 0] as const;
    const supportExtent = verticalExtent(supportDefinition.body.shape, supportDefinition.body.rotation), rootAboveGround = canonicalRoot[1] - (canonicalSupport[1] - supportExtent);
    if (rootAboveGround <= 0) throw new Error(`${cue.id} support ${boneId} has an invalid canonical root-to-ground offset.`);
    const x = root.x + canonicalSupport[0] - canonicalRoot[0], z = root.z + canonicalSupport[2] - canonicalRoot[2], rootExtent = verticalExtent(rootDefinition.body.shape, rootDefinition.body.rotation);
    const originY = root.y + Math.max(rootAboveGround, rootExtent) + probeDistance + padding + .05, maximumDistance = Math.max(.1, rootAboveGround * 2 + probeDistance + padding + .1);
    if (!raycastRecoveryGround(ragdolls.world, support, selfHandles, x, originY, z, maximumDistance, groundLayerMask, hit) || hit.normalY < minimumNormalY) return { message: `${cue.id} cannot resolve stable terrain below projected support ${boneId}. Restore collidable upward-facing ground on layer ${groundLayerMask}, increase the support probe, or choose an authored recovery destination.` };
    rootY = Math.max(rootY, hit.y + rootAboveGround);
  }
  return Number.isFinite(rootY) ? { height: rootY } : { message: `${cue.id} settled recovery needs at least one stable support bone or an authored destination.` };
}

export function raycastRecoveryGround(world: ReturnType<typeof createRigidWorld3D>, support: RigidBodyState3D, selfHandles: ReadonlySet<number>, x: number, originY: number, z: number, maximumDistance: number, layerMask: number, hit: RigidRaycastHit3D): boolean {
  let y = originY, remaining = maximumDistance;
  for (let attempt = 0; attempt <= selfHandles.size + 4 && remaining > 1e-6; attempt += 1) {
    if (!world.raycast(x, y, z, 0, -1, 0, remaining, layerMask, hit)) return false;
    const body = world.body(hit.handle), collidable = body && !body.trigger && (support.collisionLayer & body.collisionMask) !== 0 && (body.collisionLayer & support.collisionMask) !== 0;
    if (!selfHandles.has(hit.handle) && collidable) return true;
    if (!body) return false;
    const nextY = Math.min(hit.y - 1e-6, body.y - verticalExtent(body.shape, [body.rotationX, body.rotationY, body.rotationZ, body.rotationW]) - 1e-6), advance = y - nextY;
    if (advance <= 1e-8) return false;
    y = nextY; remaining -= advance;
  }
  return false;
}

export function verticalExtent(shape: RigidBodyState3D["shape"], rotation: ArrayLike<number> | undefined): number {
  if (shape.kind === "sphere") return shape.radius;
  let x = rotation?.[0] ?? 0, y = rotation?.[1] ?? 0, z = rotation?.[2] ?? 0, w = rotation?.[3] ?? 1; const length = Math.hypot(x, y, z, w); x /= length; y /= length; z /= length; w /= length;
  return Math.abs(2 * (x * y + w * z)) * shape.halfX + Math.abs(1 - 2 * (x * x + z * z)) * shape.halfY + Math.abs(2 * (y * z - w * x)) * shape.halfZ;
}

export function emptyRaycast(): RigidRaycastHit3D { return { handle: 0, id: "", distance: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 }; }

export function requirePose(poses: ReadonlyMap<string, RagdollPose3D>, ragdollId: string): RagdollPose3D { const pose = poses.get(ragdollId); if (!pose) throw new Error(`Ragdoll ${ragdollId} does not exist.`); return pose; }

export function validateBindTuning(cue: Extract<PhysicalPerformanceCue3D, { kind: "bind" }>, pointer: string): void {
  for (const [field, value] of [["stiffness", cue.stiffness], ["damping", cue.damping], ["rotationStiffness", cue.rotationStiffness], ["rotationDamping", cue.rotationDamping]] as const) if (value !== undefined) { const normalizedValue = finite(value, `${cue.id} ${field}`); if (normalizedValue < 0 || normalizedValue > 1) throw new RangeError(`${cue.id} ${field} must be from 0 through 1. Project pointer: ${pointer}/${field}.`); }
  for (const [field, value] of [["maxImpulse", cue.maxImpulse], ["breakImpulse", cue.breakImpulse], ["maxTorqueImpulse", cue.maxTorqueImpulse]] as const) if (value !== undefined) positive(value, `${cue.id} ${field}`);
}

export function text(value: unknown, label: string) { return requireText(value, { min: 1, max: 256, message: `${label} must be non-empty bounded text.` }); }

export function positive(value: number, label: string) { value = finite(value, label); if (value <= 0) throw new RangeError(`${label} must be positive.`); return value; }

export function nonnegative(value: number, label: string) { value = finite(value, label); if (value < 0) throw new RangeError(`${label} must be non-negative.`); return value; }

export function nonnegativeInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`); return value; }

export function positiveInteger(value: number, label: string) { if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`); return value; }

export function frameIndex(value: number, duration: number) { positiveInteger(duration, "durationFrames"); if (!Number.isSafeInteger(value) || value < 0 || value >= duration) throw new RangeError(`frame must be from 0 through ${duration - 1}.`); return value; }
