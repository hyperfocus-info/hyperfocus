import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { Hyperfocus3DTimeline, Hyperfocus3DRootMotionPolicy } from '../3d.ts';

let rootFields: ObjectReaders<Hyperfocus3DRootMotionPolicy>;
let performanceFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['performanceTracks']>[number]>;
let entityFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['entityTracks']>[number]>;
let motionFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['motionTracks']>[number]>;
let poseFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['poseCorrections']>[number]>;
let ikFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['ikCorrections']>[number]>;
export function readPerformanceTrack3D(value: unknown) { return readObject(value, (performanceFields ??= {
  entityId: requireText, rigId: requireText,
  segments: value => readList(value, value => readObject(value, { id: requireText, startFrame: requireNumber, durationFrames: requireNumber, clipId: requireText, sourceStartSeconds: requireNumber, speed: requireNumber, loop: requireBoolean, blendFrames: requireNumber, transition: optional(value => requireOneOf(value, ['blend', 'cut'])), rootMotion: optional(value => readObject(value, (rootFields ??= { mode: value => requireOneOf(value, ['off', 'extract-xz', 'extract-xyz']), authority: optional(value => requireOneOf(value, ['transform', 'physical'])), loopBoundary: value => requireOneOf(value, ['reset', 'accumulate']), segmentBoundary: optional(value => requireOneOf(value, ['reset', 'accumulate'])), rootBoneId: requireText }))) })),
})); }
export function readEntityTrack3D(value: unknown) { return readObject(value, (entityFields ??= {
  entityId: requireText,
  keyframes: value => readList(value, value => readObject(value, { id: requireText, frame: requireNumber, position: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationEuler: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), scale: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), visible: requireBoolean, variantId: optional(requireText), interpolation: value => requireOneOf(value, ['hold', 'linear', 'smooth']) })),
})); }
export function readMotionTrack3D(value: unknown) { return readObject(value, (motionFields ??= {
  entityId: requireText,
  segments: value => readList(value, value => readObject(value, { id: requireText, startFrame: requireNumber, durationFrames: requireNumber, origin: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), velocity: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), acceleration: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationEuler: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), angularVelocity: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), state: value => requireOneOf(value, ['grounded', 'airborne']), cause: optional(value => requireOneOf(value, ['jump', 'impact', 'fall'])), groundY: requireNumber })),
})); }
export function readPoseCorrection3D(value: unknown) { return readObject(value, (poseFields ??= {
  id: requireText, entityId: requireText, boneId: requireText, startFrame: requireNumber, durationFrames: requireNumber, stage: value => requireOneOf(value, ['pre-animation', 'post-animation', 'weighted-layer']), weight: requireNumber,
  translation: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationEuler: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationSpace: optional(value => requireOneOf(value, ['local', 'model'])), transition: optional(value => requireOneOf(value, ['blend', 'cut'])), blendInFrames: optional(requireNumber), blendOutFrames: optional(requireNumber), interpolation: optional(value => requireOneOf(value, ['linear', 'smooth'])),
})); }
export function readIkCorrection3D(value: unknown) { return readObject(value, (ikFields ??= {
  id: requireText, entityId: requireText, startFrame: requireNumber, durationFrames: requireNumber, rootBoneId: requireText, middleBoneId: requireText, endBoneId: requireText,
  targetFrom: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), target: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), targetTo: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), strikeStartFrame: optional(requireNumber), contactFrame: optional(requireNumber), followThroughFrame: optional(requireNumber), contactVelocity: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])),
  bendMode: optional(value => requireOneOf(value, ["authored", "animated"])), targetMode: optional(value => requireOneOf(value, ["absolute", "animated-offset"])), endOrientation: optional(value => requireOneOf(value, ["follow-chain", "preserve-animation"])),
  poleFrom: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), pole: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), poleTo: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), weight: requireNumber, maxStretch: requireNumber, transition: optional(value => requireOneOf(value, ['blend', 'cut'])), blendInFrames: optional(requireNumber), blendOutFrames: optional(requireNumber), interpolation: optional(value => requireOneOf(value, ['linear', 'smooth', 'momentum'])),
})); }
