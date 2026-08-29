import { create } from "@bufbuild/protobuf";
import { RECUT_FACE_BUTTONS, RECUT_MAX_PADS, RecutAnalysisMode, RecutBpmSource, createRecutSliceMarkers, type RecutModuleState } from "./recut-state";
import { PadAssignmentSchema, SliceMarkerSchema } from "../../proto/generated/recut-pb";
import { clamp } from "../../utils/math";

export const GAMEPAD_FACE_TO_PAD_INDEX = [2, 3, 0, 1] as const;
export type PadTriggerOwner = "gamepad" | "preview" | "ui";
export const DENSITY_ANALYSIS_DEBOUNCE_MS = 90;

export function faceButtonForPad(index: number) {
  return RECUT_FACE_BUTTONS[index % RECUT_FACE_BUTTONS.length] ?? "X";
}

export function bankForPad(index: number) {
  return Math.floor(index / RECUT_FACE_BUTTONS.length);
}

export function sliceMarkersToSerializable(state: RecutModuleState) {
  return state.sliceMarkers.map((marker) => ({
    chokeGroupId: marker.chokeGroupId,
    confidence: marker.confidence,
    endFrame: marker.endFrame,
    fadeMs: marker.fadeMs,
    padIndex: marker.padIndex,
    snapExact: marker.snapExact,
    startFrame: marker.startFrame,
    transientFrame: marker.transientFrame,
  }));
}

export function buildPlaybackStateSignature(state: RecutModuleState, sampleHandle: string, projectBpm: number) {
  return JSON.stringify({
    analysisMode: state.analysisMode,
    bpmConfidence: state.bpmConfidence,
    bpmSource: state.bpmSource,
    bpmSuggestedConfidence: state.bpmSuggestedConfidence,
    bpmSuggestedValue: state.bpmSuggestedValue,
    bpmValue: state.bpmValue,
    density: state.density,
    gainDb: state.gainDb,
    grainDensity: state.grainDensity,
    grainSizeMs: state.grainSizeMs,
    granularEnabled: state.granularEnabled,
    manualEditRevision: state.manualEditRevision.toString(),
    padAssignments: state.padAssignments.map((assignment) => [
      assignment.bank,
      assignment.chokeGroupId,
      assignment.faceButton,
      assignment.isEmpty,
      assignment.padIndex,
      assignment.sliceIndex,
    ]),
    pitchSemitones: state.pitchSemitones,
    projectBpm,
    sampleHandle,
    sliceMarkers: sliceMarkersToSerializable(state),
    stretchEnabled: state.stretchEnabled,
  });
}

export function mapSampleAnalysisMode(mode: RecutAnalysisMode) {
  switch (mode) {
    case RecutAnalysisMode.BPM:
      return 1;
    case RecutAnalysisMode.CUSTOM:
      return 2;
    default:
      return 0;
  }
}

export function mapSampleBpmSource(source: RecutBpmSource) {
  switch (source) {
    case RecutBpmSource.METADATA:
      return 1;
    case RecutBpmSource.ANALYZED:
      return 2;
    case RecutBpmSource.PROJECT:
      return 3;
    case RecutBpmSource.USER:
      return 4;
    default:
      return 0;
  }
}

export function markerFromFrame(marker: {
  chokeGroupId: number;
  confidence: number;
  endFrame: number;
  fadeMs: number;
  padIndex: number;
  snapExact: boolean;
  startFrame: number;
  transientFrame: number;
}) {
  return create(SliceMarkerSchema, {
    chokeGroupId: marker.chokeGroupId,
    confidence: marker.confidence,
    endFrame: marker.endFrame,
    fadeMs: marker.fadeMs,
    padIndex: marker.padIndex,
    snapExact: marker.snapExact,
    startFrame: marker.startFrame,
    transientFrame: marker.transientFrame,
  });
}

export function padAssignmentFromFrame(assignment: {
  bank: number;
  chokeGroupId: number;
  faceButton: string;
  isEmpty: boolean;
  padIndex: number;
  sliceIndex: number;
}) {
  return create(PadAssignmentSchema, {
    bank: assignment.bank,
    chokeGroupId: assignment.chokeGroupId,
    faceButton: assignment.faceButton,
    isEmpty: assignment.isEmpty,
    padIndex: assignment.padIndex,
    sliceIndex: assignment.sliceIndex,
  });
}

export function mapRecutBpmSourceFromFrame(source: number) {
  switch (source) {
    case 1:
      return RecutBpmSource.METADATA;
    case 2:
      return RecutBpmSource.ANALYZED;
    case 3:
      return RecutBpmSource.PROJECT;
    case 4:
      return RecutBpmSource.USER;
    default:
      return RecutBpmSource.NONE;
  }
}

export function mapRecutAnalysisModeFromFrame(source: number) {
  switch (source) {
    case 1:
      return RecutAnalysisMode.BPM;
    case 2:
      return RecutAnalysisMode.CUSTOM;
    default:
      return RecutAnalysisMode.AUTO;
  }
}

export function targetSliceCountForMode(mode: RecutAnalysisMode, density: number) {
  if (mode === RecutAnalysisMode.BPM) {
    if (density >= 0.75) {
      return 16;
    }
    if (density >= 0.25) {
      return 8;
    }
    return 4;
  }

  return 16;
}

export function buildAnalysisRequest(state: RecutModuleState, projectBpm: number, includeTransientSlices = true) {
  return {
    analysisMode: mapSampleAnalysisMode(state.analysisMode),
    density: state.density,
    includeCandidateTransients: true,
    includeTransientSlices,
    manualMarkers: state.analysisMode === RecutAnalysisMode.CUSTOM ? sliceMarkersToSerializable(state) : [],
    maxSliceCount: targetSliceCountForMode(state.analysisMode, state.density),
    projectBpm,
    requestedBpm: state.analysisMode === RecutAnalysisMode.BPM ? state.bpmValue : 0,
    waveformWindowSize: 2048,
  };
}

export function createDefaultPadAssignments(sliceCount: number) {
  return Array.from({ length: RECUT_MAX_PADS }, (_, index) =>
    create(PadAssignmentSchema, {
      bank: bankForPad(index),
      chokeGroupId: 0,
      faceButton: faceButtonForPad(index),
      isEmpty: false,
      padIndex: index,
      sliceIndex: index % Math.max(1, sliceCount),
    }),
  );
}

export function commitMarkers(markers: readonly RecutModuleState["sliceMarkers"][number][], lengthFrames: number) {
  const safeLength = Math.max(1, lengthFrames);
  const starts = [...markers]
    .map((marker) => clamp(Math.round(marker.startFrame), 0, safeLength - 1))
    .sort((left, right) => left - right)
    .filter((frame, index, values) => index === 0 || frame - values[index - 1]! >= 128);
  return createRecutSliceMarkers(starts.length > 0 ? starts : [0], safeLength);
}

export function resolvePadIndexFromButtons(buttons: readonly number[]) {
  const lbPressed = (buttons[4] ?? 0) > 0.75;
  const rbPressed = (buttons[5] ?? 0) > 0.75;
  let faceIndex = -1;
  for (let index = 0; index < GAMEPAD_FACE_TO_PAD_INDEX.length; index += 1) {
    const buttonIndex = GAMEPAD_FACE_TO_PAD_INDEX[index]!;
    if ((buttons[buttonIndex] ?? 0) > 0.75) {
      faceIndex = index;
      break;
    }
  }
  if (faceIndex < 0) {
    return null;
  }
  return (lbPressed ? 4 : 0) + (rbPressed ? 8 : 0) + faceIndex;
}

export function resolvePreviewPadIndex(sliceIndex: number, assignments: readonly RecutModuleState["padAssignments"][number][]) {
  return assignments.find((assignment) => !assignment.isEmpty && assignment.sliceIndex === sliceIndex)?.padIndex ?? clamp(sliceIndex, 0, RECUT_MAX_PADS - 1);
}
