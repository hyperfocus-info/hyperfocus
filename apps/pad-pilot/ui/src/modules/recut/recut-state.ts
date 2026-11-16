import { isMessage } from "@bufbuild/protobuf";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { base64ToBytes, bytesToBase64 } from "../../proto/base64";
import { registerModuleStateCodec } from "../../proto/registry";
import {
  ChokeGroupSchema,
  PadAssignmentSchema,
  RecutAnalysisMode,
  RecutBpmSource,
  RecutFrameSchema,
  RecutModuleStateSchema,
  SliceMarkerSchema,
  type ChokeGroup,
  type PadAssignment,
  type RecutFrame,
  type RecutModuleState,
  type SliceMarker,
} from "../../proto/generated/recut-pb";
import { clamp } from "../../utils/math";

export { RecutAnalysisMode, RecutBpmSource };
export type { ChokeGroup, PadAssignment, RecutFrame, RecutModuleState, SliceMarker };

export const RECUT_SCHEMA_VERSION = 1;
export const RECUT_DEFAULT_GRIT_SIZE_MS = 28;
export const RECUT_DEFAULT_GRAIN_DENSITY = 0.62;
export const RECUT_DEFAULT_PITCH_SEMITONES = 0;
export const RECUT_DEFAULT_GAIN_DB = 0;
export const RECUT_DEFAULT_DENSITY = 0.5;
export const RECUT_MAX_PADS = 16;
export const RECUT_MAX_SLICES = 16;
export const RECUT_FACE_BUTTONS = ["X", "Y", "A", "B"] as const;
export const RECUT_PAD_LABELS = [
  "X",
  "Y",
  "A",
  "B",
  "LB+X",
  "LB+Y",
  "LB+A",
  "LB+B",
  "RB+X",
  "RB+Y",
  "RB+A",
  "RB+B",
  "LB+RB+X",
  "LB+RB+Y",
  "LB+RB+A",
  "LB+RB+B",
] as const;

export function getRecutPadLabel(padIndex: number) {
  return RECUT_PAD_LABELS[clamp(padIndex, 0, RECUT_PAD_LABELS.length - 1)] ?? "X";
}

export function createRecutSliceMarkers(starts: readonly number[], lengthFrames: number) {
  const safeLength = Math.max(1, lengthFrames);
  return starts.slice(0, RECUT_MAX_SLICES).map((startFrame, index) =>
    create(SliceMarkerSchema, {
      chokeGroupId: 0,
      confidence: 1,
      endFrame: Math.max(startFrame + 1, starts[index + 1] ?? safeLength - 1),
      fadeMs: 8,
      padIndex: index,
      snapExact: true,
      startFrame,
      transientFrame: startFrame,
    }),
  );
}

function getPadLayout(index: number) {
  return {
    bank: Math.floor(index / RECUT_FACE_BUTTONS.length),
    faceButton: RECUT_FACE_BUTTONS[index % RECUT_FACE_BUTTONS.length] ?? "X",
  };
}

function createDefaultSliceMarker(index: number) {
  const chokeGroupId = index < 4 ? 0 : 1;
  return create(SliceMarkerSchema, {
    startFrame: index * 48,
    endFrame: index * 48 + 44,
    transientFrame: index * 48 + 8,
    confidence: 0.5,
    padIndex: index % RECUT_MAX_PADS,
    chokeGroupId,
    fadeMs: 4,
    snapExact: false,
  });
}

function createDefaultPadAssignment(index: number) {
  const layout = getPadLayout(index);
  return create(PadAssignmentSchema, {
    bank: layout.bank,
    chokeGroupId: 0,
    faceButton: layout.faceButton,
    isEmpty: false,
    padIndex: index,
    sliceIndex: index % 8,
  });
}

function createDefaultChokeGroup(id: number, name: string, accentHue: number) {
  return create(ChokeGroupSchema, {
    accentHue,
    id,
    name,
  });
}

export function createDefaultRecutModuleState() {
  return create(RecutModuleStateSchema, {
    schemaVersion: RECUT_SCHEMA_VERSION,
    revision: 1n,
    sourcePath: "",
    sourceName: "",
    sourceContentId: "",
    sourceSha256: "",
    sampleRate: 0,
    channelCount: 0,
    lengthFrames: 0n,
    pitchSemitones: RECUT_DEFAULT_PITCH_SEMITONES,
    gainDb: RECUT_DEFAULT_GAIN_DB,
    stretchEnabled: false,
    granularEnabled: false,
    grainSizeMs: RECUT_DEFAULT_GRIT_SIZE_MS,
    grainDensity: RECUT_DEFAULT_GRAIN_DENSITY,
    sliceMarkers: Array.from({ length: 8 }, (_, index) => createDefaultSliceMarker(index)),
    padAssignments: Array.from({ length: RECUT_MAX_PADS }, (_, index) => createDefaultPadAssignment(index)),
    chokeGroups: [
      createDefaultChokeGroup(0, "Row A", 190),
      createDefaultChokeGroup(1, "Row B", 280),
    ],
    loaded: false,
    analysisMode: RecutAnalysisMode.AUTO,
    bpmValue: 0,
    bpmSource: RecutBpmSource.NONE,
    bpmConfidence: 0,
    bpmSuggestedValue: 0,
    bpmSuggestedConfidence: 0,
    density: RECUT_DEFAULT_DENSITY,
    manualEditRevision: 0n,
    projectBpmSnapshot: 120,
  });
}

function normalizeSliceMarkers(rawSliceMarkers: readonly SliceMarker[]) {
  return rawSliceMarkers.slice(0, RECUT_MAX_SLICES).map((marker, index, markers) => {
    const nextMarker = markers[index + 1];
    const startFrame = Math.max(0, marker.startFrame);
    const requestedEndFrame = nextMarker ? Math.max(startFrame + 1, nextMarker.startFrame) : Math.max(startFrame + 1, marker.endFrame);
    return create(SliceMarkerSchema, {
      ...marker,
      confidence: clamp(Number.isFinite(marker.confidence) ? marker.confidence : 0, 0, 1),
      endFrame: requestedEndFrame,
      fadeMs: clamp(Number.isFinite(marker.fadeMs) ? marker.fadeMs : 4, 0, 25),
      padIndex: clamp(marker.padIndex, 0, RECUT_MAX_PADS - 1),
      chokeGroupId: Math.max(0, marker.chokeGroupId),
      snapExact: Boolean(marker.snapExact),
      transientFrame: Math.max(0, marker.transientFrame || startFrame),
      startFrame,
    });
  });
}

function expandPadAssignments(rawPadAssignments: readonly PadAssignment[], sliceMarkers: readonly SliceMarker[]) {
  return Array.from({ length: RECUT_MAX_PADS }, (_, index) => {
    const layout = getPadLayout(index);
    const sourceAssignment = rawPadAssignments[index] ?? rawPadAssignments[index % Math.max(1, rawPadAssignments.length)] ?? createDefaultPadAssignment(index);
    const maxSliceIndex = Math.max(0, sliceMarkers.length - 1);
    return create(PadAssignmentSchema, {
      bank: layout.bank,
      chokeGroupId: Math.max(0, sourceAssignment.chokeGroupId),
      faceButton: layout.faceButton,
      isEmpty: Boolean(sourceAssignment.isEmpty),
      padIndex: index,
      sliceIndex: Boolean(sourceAssignment.isEmpty) ? 0 : clamp(sourceAssignment.sliceIndex, 0, maxSliceIndex),
    });
  });
}

export function normalizeRecutModuleState(input: (Omit<RecutModuleState, "chokeGroups" | "padAssignments" | "sliceMarkers"> & Partial<Pick<RecutModuleState, "chokeGroups" | "padAssignments" | "sliceMarkers">>) | undefined) {
  const fallback = createDefaultRecutModuleState();
  if (!input) {
    return fallback;
  }

  const rawSliceMarkers = Array.isArray(input.sliceMarkers) ? input.sliceMarkers : fallback.sliceMarkers;
  const rawPadAssignments = Array.isArray(input.padAssignments) ? input.padAssignments : fallback.padAssignments;
  const rawChokeGroups = Array.isArray(input.chokeGroups) ? input.chokeGroups : fallback.chokeGroups;

  const sliceMarkers = normalizeSliceMarkers(rawSliceMarkers);
  const padAssignments = expandPadAssignments(rawPadAssignments, sliceMarkers);

  const chokeGroups = rawChokeGroups.slice(0, 8).map((group) =>
    create(ChokeGroupSchema, {
      accentHue: clamp(Number.isFinite(group.accentHue) ? group.accentHue : 0, 0, 360),
      id: group.id,
      name: group.name || `Group ${group.id}`,
    }),
  );

  return create(RecutModuleStateSchema, {
    schemaVersion: RECUT_SCHEMA_VERSION,
    revision: input.revision > 0n ? input.revision : fallback.revision,
    sourcePath: input.sourcePath,
    sourceName: input.sourceName,
    sourceContentId: input.sourceContentId,
    sourceSha256: input.sourceSha256,
    sampleRate: input.sampleRate,
    channelCount: input.channelCount,
    lengthFrames: input.lengthFrames,
    pitchSemitones: clamp(Number.isFinite(input.pitchSemitones) ? input.pitchSemitones : 0, -48, 48),
    gainDb: clamp(Number.isFinite(input.gainDb) ? input.gainDb : 0, -96, 24),
    stretchEnabled: Boolean(input.stretchEnabled),
    granularEnabled: Boolean(input.granularEnabled),
    grainSizeMs: clamp(Number.isFinite(input.grainSizeMs) ? input.grainSizeMs : RECUT_DEFAULT_GRIT_SIZE_MS, 1, 1000),
    grainDensity: clamp(Number.isFinite(input.grainDensity) ? input.grainDensity : RECUT_DEFAULT_GRAIN_DENSITY, 0, 1),
    sliceMarkers,
    padAssignments,
    chokeGroups: chokeGroups.length > 0 ? chokeGroups : fallback.chokeGroups,
    loaded: Boolean(input.loaded),
    analysisMode: input.analysisMode ?? fallback.analysisMode,
    bpmValue: clamp(Number.isFinite(input.bpmValue) ? input.bpmValue : fallback.bpmValue, 0, 400),
    bpmSource: input.bpmSource ?? fallback.bpmSource,
    bpmConfidence: clamp(Number.isFinite(input.bpmConfidence) ? input.bpmConfidence : fallback.bpmConfidence, 0, 1),
    bpmSuggestedValue: clamp(Number.isFinite(input.bpmSuggestedValue) ? input.bpmSuggestedValue : fallback.bpmSuggestedValue, 0, 400),
    bpmSuggestedConfidence: clamp(Number.isFinite(input.bpmSuggestedConfidence) ? input.bpmSuggestedConfidence : fallback.bpmSuggestedConfidence, 0, 1),
    density: clamp(Number.isFinite(input.density) ? input.density : fallback.density, 0, 1),
    manualEditRevision: input.manualEditRevision > 0n ? input.manualEditRevision : 0n,
    projectBpmSnapshot: clamp(Number.isFinite(input.projectBpmSnapshot) ? input.projectBpmSnapshot : fallback.projectBpmSnapshot, 20, 400),
  });
}

export function encodeRecutModuleState(state: RecutModuleState) {
  return toBinary(RecutModuleStateSchema, normalizeRecutModuleState(state));
}

export function decodeRecutModuleState(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return createDefaultRecutModuleState();
  }
  try {
    return normalizeRecutModuleState(fromBinary(RecutModuleStateSchema, bytes));
  } catch {
    return createDefaultRecutModuleState();
  }
}

export function encodeRecutModuleStateBase64(state: RecutModuleState) {
  return bytesToBase64(encodeRecutModuleState(state));
}

export function decodeRecutModuleStateBase64(value: string) {
  return decodeRecutModuleState(base64ToBytes(value));
}

export function createDefaultRecutFrame() {
  return create(RecutFrameSchema, {
    activeSliceIndex: 0,
    analysisProgress: 0,
    analysisMode: RecutAnalysisMode.AUTO,
    analysisRevision: 0n,
    armedPadIndex: 0,
    bpmConfidence: 0,
    bpmSource: RecutBpmSource.NONE,
    bpmSuggestedConfidence: 0,
    bpmSuggestedValue: 0,
    bpmValue: 0,
    candidateTransients: [],
    density: RECUT_DEFAULT_DENSITY,
    heldPadIndices: [],
    lastSnapExact: false,
    loaded: false,
    playingPadIndices: [],
    playheadFrame: 0n,
    projectBpm: 120,
    sequence: 0n,
    sliceMarkers: [],
    padAssignments: [],
    waveformPeaks: [],
  });
}

export function encodeRecutFrameBase64(frame: RecutFrame) {
  return bytesToBase64(toBinary(RecutFrameSchema, frame));
}

export function decodeRecutFrameBase64(value: string) {
  return fromBinary(RecutFrameSchema, base64ToBytes(value));
}

registerModuleStateCodec("recut", {
  decode: decodeRecutModuleState,
  encode: encodeRecutModuleState,
}, readrecutState);

export function readrecutState(value: unknown) { if (!isMessage(value, RecutModuleStateSchema)) throw new TypeError("Invalid recut state"); return fromBinary(RecutModuleStateSchema, toBinary(RecutModuleStateSchema, value)); }
