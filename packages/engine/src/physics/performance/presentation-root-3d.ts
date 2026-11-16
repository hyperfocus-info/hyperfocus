import type { RigidBodyDefinition3D } from "../rigid-3d.ts";
import {
  PHYSICAL_BODY_STATE_STRIDE_3D,
  samplePhysicalCharacterState3D,
  type CompiledPhysicalPerformance3D,
} from "../physical-performance-3d.ts";
import { createStaticTerrainHit3D, raycastStaticTerrainDown3D } from "../terrain/static-raycast.ts";

export type PhysicalPresentationRoot3D = [number, number, number];

/**
 * Resolves the visible animation root from an authoritative physical character.
 *
 * Physics continues to own horizontal travel and every airborne displacement.
 * While a ready character is supported, the visible root instead follows the
 * collision surface beneath the physical pelvis. This prevents internal active-
 * ragdoll settling from lowering the entire skinned model through the floor.
 * Airborne height is rebased from the start of each flight, so arbitrary-frame
 * scrubbing and sequential playback return the same result.
 */
export function samplePhysicalPresentationRoot3D(options: {
  bodies: readonly RigidBodyDefinition3D[];
  source: Readonly<Pick<CompiledPhysicalPerformance3D, "frameStride" | "states" | "characterStateEvents"> & Partial<Pick<CompiledPhysicalPerformance3D, "frameRate" | "durationFrames" | "ensureFrame">>>;
  ragdollId: string;
  rootReferenceIndex: number;
  frame: number;
  physicalRootPosition: readonly [number, number, number];
  rawEntityPosition: readonly [number, number, number];
  groundOffsetY?: number;
  /**
   * Treat a ready locomotion solver's brief loss of support as part of its
   * ground traversal rather than as an authored ballistic jump. Contacts and
   * the physical root remain authoritative; this only removes collision-skin
   * bounce from the visible character.
   */
  supportAirborne?: boolean;
}): PhysicalPresentationRoot3D {
  const result: PhysicalPresentationRoot3D = [...options.rawEntityPosition];
  const state = samplePhysicalCharacterState3D(options.source, options.ragdollId, options.frame);
  if (state?.authority !== "ready") return result;

  const currentGround = groundBelowPhysicalRoot(options.bodies, options.physicalRootPosition);
  if (currentGround === undefined) return result;
  const groundOffsetY = options.groundOffsetY ?? 0;
  if (state.locomotion !== "airborne" || options.supportAirborne) {
    result[1] = supportGroundEnvelope(options, currentGround) + groundOffsetY;
    return result;
  }

  const flightStartFrame = airborneRunStartFrame(options.source, options.ragdollId, options.frame);
  const startOffset = flightStartFrame * options.source.frameStride
    + options.rootReferenceIndex * PHYSICAL_BODY_STATE_STRIDE_3D;
  const startPhysicalRoot: [number, number, number] = [
    options.source.states[startOffset]!,
    options.source.states[startOffset + 1]!,
    options.source.states[startOffset + 2]!,
  ];
  const launchGround = groundBelowPhysicalRoot(options.bodies, startPhysicalRoot);
  if (launchGround === undefined) return result;
  const flightHeight = launchGround + groundOffsetY
    + options.physicalRootPosition[1] - startPhysicalRoot[1];
  // A final airborne solver sample may arrive after the collision skin has
  // crossed the receiving surface. Physics still owns the impact frame, but
  // presentation must never draw the skinned character below that surface.
  result[1] = Math.max(currentGround + groundOffsetY, flightHeight);
  return result;
}

function supportGroundEnvelope(
  options: Parameters<typeof samplePhysicalPresentationRoot3D>[0],
  currentGround: number,
) {
  const frameRate = Math.max(1, options.source.frameRate ?? 30);
  const radius = Math.max(1, Math.round(frameRate * .2));
  const maximumVerticalSpeed = 1.5;
  const finalFrame = Math.max(0, (options.source.durationFrames ?? Math.floor(options.source.states.length / options.source.frameStride)) - 1);
  options.source.ensureFrame?.(Math.min(finalFrame, options.frame + radius));
  let envelope = currentGround;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const frame = options.frame + offset;
    if (frame < 0 || frame > finalFrame || frame === options.frame) continue;
    const stateOffset = frame * options.source.frameStride
      + options.rootReferenceIndex * PHYSICAL_BODY_STATE_STRIDE_3D;
    const position: [number, number, number] = [
      options.source.states[stateOffset]!,
      options.source.states[stateOffset + 1]!,
      options.source.states[stateOffset + 2]!,
    ];
    const ground = groundBelowPhysicalRoot(options.bodies, position);
    if (ground === undefined) continue;
    envelope = Math.max(envelope, ground - maximumVerticalSpeed * Math.abs(offset) / frameRate);
  }
  return envelope;
}

function airborneRunStartFrame(
  source: Readonly<Pick<CompiledPhysicalPerformance3D, "characterStateEvents">>,
  ragdollId: string,
  throughFrame: number,
) {
  let priorLocomotion: string | undefined;
  let startFrame = throughFrame;
  let eventFrame = -1;
  let frameLocomotion: string | undefined;
  const flushFrame = () => {
    if (frameLocomotion === undefined) return;
    if (frameLocomotion === "airborne" && priorLocomotion !== "airborne") startFrame = eventFrame;
    priorLocomotion = frameLocomotion;
  };
  for (const event of source.characterStateEvents) {
    if (event.frame > throughFrame) break;
    if (event.ragdollId !== ragdollId) continue;
    // One simulation frame may emit intermediate grounded/airborne states as
    // contacts are solved. Only its final state is a presentation transition;
    // treating each intermediate event as a new launch rebases an existing
    // jump and visibly teleports the character at the apex.
    if (event.frame !== eventFrame) {
      flushFrame();
      eventFrame = event.frame;
    }
    frameLocomotion = event.locomotion;
  }
  flushFrame();
  return startFrame;
}

function groundBelowPhysicalRoot(
  bodies: readonly RigidBodyDefinition3D[],
  position: readonly [number, number, number],
) {
  // Starting immediately above the physical pelvis ignores overhead beams and
  // vertical walls while still seeing the support surface under a settled body.
  const hit = raycastStaticTerrainDown3D(
    bodies,
    position[0],
    position[1] + .35,
    position[2],
    8,
    undefined,
    createStaticTerrainHit3D(),
  );
  return hit?.body ? hit.y : undefined;
}
