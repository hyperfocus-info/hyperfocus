import { requireText } from '@hyperfocus/utilities/text';
import { optional, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { IMPACT_FRAME_PRESET_IDS_3D } from '../../effects/impact-frames-3d.ts';
import type { Hyperfocus3DTimeline } from '../3d.ts';

let contactFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['contacts']>[number]>;
let responseFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['contactResponses']>[number]>;
let socketFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['socketAttachments']>[number]>;
let breakFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['breakResponses']>[number]>;
let effectFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['effectCues']>[number]>;
let impactFields: ObjectReaders<NonNullable<Hyperfocus3DTimeline['impactFrames']>[number]>;
export function readContactCue3D(value: unknown) { return readObject(value, (contactFields ??= { id: requireText, attackerEntityId: requireText, targetEntityId: requireText, searchStartFrame: requireNumber, searchDurationFrames: requireNumber, attackerOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), targetOffset: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), attackerRadius: requireNumber, targetRadius: requireNumber, cameraShake: optional(requireNumber), cameraShakeFrames: optional(requireNumber) })); }
export function readContactResponse3D(value: unknown) { return readObject(value, (responseFields ??= { id: requireText, contactId: requireText, offsetFrames: requireNumber, cameraShake: requireNumber, cameraShakeFrames: requireNumber, audioAssetId: optional(requireText), gain: requireNumber, pan: requireNumber })); }
export function readSocketAttachment3D(value: unknown) { return readObject(value, (socketFields ??= { id: requireText, entityId: requireText, parentEntityId: requireText, boneId: requireText, startFrame: requireNumber, durationFrames: requireNumber, position: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), rotationEuler: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), scale: value => readTuple(value, [requireNumber, requireNumber, requireNumber]) })); }
export function readBreakResponse3D(value: unknown) { return readObject(value, (breakFields ??= { id: requireText, breakId: optional(requireText), breakGroupId: optional(requireText), entityId: requireText, variantId: optional(requireText), visibility: value => requireOneOf(value, ['keep', 'show', 'hide']), audioAssetId: optional(requireText), gain: requireNumber, pan: requireNumber })); }
export function readEffectCue3D(value: unknown) { return readObject(value, (effectFields ??= {
  id: requireText, kind: value => requireOneOf(value, ['aura', 'trail', 'sparks', 'smoke', 'debris', 'shockwave']), startFrame: requireNumber, durationFrames: requireNumber, targetEntityId: optional(requireText), targetBoneId: optional(requireText), contactId: optional(requireText), contactOffsetFrames: optional(requireNumber), breakId: optional(requireText), breakGroupId: optional(requireText),
  space: optional(value => requireOneOf(value, ['world', 'local'])), presentation: optional(value => requireOneOf(value, ['billboard', 'model'])), meshId: optional(requireText), materialId: requireText, count: requireNumber, seed: requireNumber, radius: requireNumber, speed: requireNumber, size: requireNumber, emissionMode: optional(value => requireOneOf(value, ['burst', 'continuous'])), emissionDirection: optional(value => readTuple(value, [requireNumber, requireNumber, requireNumber])), emissionSpreadDegrees: optional(requireNumber),
})); }
export function readImpactFrameCue3D(value: unknown) { return readObject(value, (impactFields ??= {
  id: requireText, preset: value => requireOneOf(value, IMPACT_FRAME_PRESET_IDS_3D), startFrame: requireNumber, durationFrames: requireNumber, intensity: requireNumber, seed: requireNumber, center: value => readTuple(value, [requireNumber, requireNumber]), freezeSource: requireBoolean,
  background: optional(requireText), foreground: optional(requireText), accent: optional(requireText), threshold: optional(requireNumber), edgeStrength: optional(requireNumber), lineDensity: optional(requireNumber), textureId: optional(requireText), contactId: optional(requireText), contactOffsetFrames: optional(requireNumber),
})); }
