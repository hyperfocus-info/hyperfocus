import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readPhysicalPerformance3D } from '../../physics/performance/declaration-reader-3d.ts';
import { readPhysicalBodyReference3D } from '../../physics/performance/cue-reader-3d.ts';
import { HYPERFOCUS_3D_FORMATIONS, type Hyperfocus3DTimeline, type Hyperfocus3DShot, type Hyperfocus3DPhysicalInspectionSettings } from '../3d.ts';
import { readPerformanceTrack3D, readEntityTrack3D, readMotionTrack3D, readPoseCorrection3D, readIkCorrection3D } from './tracks.ts';
import { readContactCue3D, readContactResponse3D, readSocketAttachment3D, readBreakResponse3D, readEffectCue3D, readImpactFrameCue3D } from './cues.ts';

let shotFields: ObjectReaders<Hyperfocus3DShot>;
let inspectionFields: ObjectReaders<Hyperfocus3DPhysicalInspectionSettings>;
let fields: ObjectReaders<Hyperfocus3DTimeline>;

/** Exact frame timeline contract, independent of editor document timelines.
 * Detached, no defaults, no execution; ArrayLike physical vectors become arrays.
 * Runtime/preflight retain authored-reference and mechanics validation. */
export function readHyperfocus3DTimeline(value: unknown): Hyperfocus3DTimeline { return structuredClone(readObject(value, (fields ??= {
  version: value => requireOneOf(value, [2]), sceneId: requireText, durationFrames: requireNumber, fps: requireNumber, background: requireText,
  groups: value => readList(value, value => readObject(value, { id: requireText, entityIds: value => readList(value, requireText) })),
  materialTracks: value => readList(value, value => readObject(value, { materialId: requireText, transitions: value => readList(value, value => readObject(value, { startFrame: requireNumber, durationFrames: requireNumber, toPreset: requireText })) })),
  performanceTracks: optional(value => readList(value, readPerformanceTrack3D)), entityTracks: optional(value => readList(value, readEntityTrack3D)), motionTracks: optional(value => readList(value, readMotionTrack3D)),
  physicalPerformance: optional(value => readObject(value, {
    simulation: readPhysicalPerformance3D,
    bindings: value => readList(value, value => readObject(value, { reference: readPhysicalBodyReference3D, entityId: requireText, startFrame: optional(requireNumber), boneId: optional(requireText), positionOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber, requireNumber]) })),
    fragments: optional(value => readList(value, value => readObject(value, { id: requireText, reference: readPhysicalBodyReference3D, breakGroupId: requireText, meshId: requireText, materialId: requireText, scale: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), positionOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber, requireNumber]) }))),
  })),
  physicalInspection: optional(value => readObject(value, (inspectionFields ??= { enabled: requireBoolean, ragdollId: optional(requireText), centerOfMass: requireBoolean, supports: requireBoolean, intentVectors: requireBoolean, contacts: requireBoolean, velocities: requireBoolean, qualityFindings: optional(requireBoolean), breakEnergy: optional(requireBoolean), motionQuality: optional(requireBoolean), maximumTranslationResidualMeters: optional(requireNumber), maximumRotationResidualDegrees: optional(requireNumber), contactHistoryFrames: requireNumber }))), contacts: optional(value => readList(value, readContactCue3D)), contactResponses: optional(value => readList(value, readContactResponse3D)), poseCorrections: optional(value => readList(value, readPoseCorrection3D)), ikCorrections: optional(value => readList(value, readIkCorrection3D)), socketAttachments: optional(value => readList(value, readSocketAttachment3D)), breakResponses: optional(value => readList(value, readBreakResponse3D)), effectCues: optional(value => readList(value, readEffectCue3D)), impactFrames: optional(value => readList(value, readImpactFrameCue3D)), shots: value => readList(value, value => readObject(value, (shotFields ??= {
  id: requireText, startFrame: requireNumber, durationFrames: requireNumber,
  camera: value => readObject(value, { positionFrom: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), positionTo: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), targetFrom: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), targetTo: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), fovFrom: requireNumber, fovTo: requireNumber, rollFrom: optional(requireNumber), rollTo: optional(requireNumber), shake: optional(requireNumber) }),
  formations: value => readList(value, value => readObject(value, { groupId: requireText, preset: value => requireOneOf(value, HYPERFOCUS_3D_FORMATIONS), radius: requireNumber, depth: requireNumber, spread: requireNumber, height: requireNumber, scale: requireNumber, spinTurns: requireNumber, travel: requireNumber, phase: optional(requireNumber) })),
  lighting: value => readObject(value, { ambientLightId: requireText, ambientColor: requireText, ambientIntensity: requireNumber, keyLightId: requireText, keyColor: requireText, keyIntensity: requireNumber, keyPosition: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rimLightId: optional(requireText), rimColor: requireText, rimIntensity: requireNumber, rimPosition: value => readTuple(value, [requireNumber, requireNumber, requireNumber]) }),
  post: value => readObject(value, { exposure: requireNumber, bloomStrength: requireNumber, bloomRadius: requireNumber, bloomThreshold: requireNumber, fogDensity: requireNumber, vignette: requireNumber, grain: requireNumber }),
  transition: optional(value => readObject(value, { kind: value => requireOneOf(value, ['cut', 'flash', 'fade-black', 'whip']), frames: requireNumber, color: optional(requireText) })),
  overlay: optional(value => readObject(value, { eyebrow: optional(requireText), title: optional(requireText), align: optional(value => requireOneOf(value, ['left', 'center', 'right'])) })),
}))),
}))); }
