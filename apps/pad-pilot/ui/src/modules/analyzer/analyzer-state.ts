import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { bytesToBase64, base64ToBytes } from "../../proto/base64";
import {
  AnalyzerFrameSchema,
  AnalyzerModuleStateSchema,
  AnalyzerNoteEventSchema,
  AnalyzerScaleMatchSchema,
  AnalyzerTakeSummarySchema,
  type AnalyzerFrame,
  type AnalyzerModuleState,
  type AnalyzerNoteEvent,
  type AnalyzerScaleMatch,
  type AnalyzerTakeSummary,
} from "../../proto/generated/analyzer-pb";
import { clamp } from "../../utils/math";

export type {
  AnalyzerFrame,
  AnalyzerModuleState,
  AnalyzerNoteEvent,
  AnalyzerScaleMatch,
  AnalyzerTakeSummary,
};

export const ANALYZER_SCHEMA_VERSION = 3;
export const ANALYZER_MIN_TUNING_HZ = 415;
export const ANALYZER_MAX_TUNING_HZ = 465;
export const ANALYZER_DEFAULT_TUNING_HZ = 440;
export const ANALYZER_MIN_DETECTION_SENSITIVITY = 0;
export const ANALYZER_MAX_DETECTION_SENSITIVITY = 1;
export const ANALYZER_DEFAULT_DETECTION_SENSITIVITY = 0.5;
export const ANALYZER_DEFAULT_SAMPLE_RATE = 48_000;
export const ANALYZER_FRAME_HOP_SIZE = 512;
export const ANALYZER_MIN_LANE = 24;
export const ANALYZER_MAX_LANE = 108;

export const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_DEFINITIONS = [
  { id: "major", label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "natural-minor", label: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "harmonic-minor", label: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "melodic-minor", label: "Melodic Minor", intervals: [0, 2, 3, 5, 7, 9, 11] },
  { id: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", label: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", label: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", label: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: "aeolian", label: "Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "locrian", label: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: "major-pentatonic", label: "Major Pentatonic", intervals: [0, 2, 4, 7, 9] },
  { id: "minor-pentatonic", label: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
  { id: "blues", label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "whole-tone", label: "Whole Tone", intervals: [0, 2, 4, 6, 8, 10] },
  { id: "diminished", label: "Diminished", intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { id: "chromatic", label: "Chromatic", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: "insen", label: "Insen", intervals: [0, 1, 5, 7, 10] },
  { id: "hirajoshi", label: "Hirajoshi", intervals: [0, 2, 3, 7, 8] },
  { id: "iwato", label: "Iwato", intervals: [0, 1, 5, 6, 10] },
  { id: "yo", label: "Yo", intervals: [0, 2, 5, 7, 9] },
  { id: "egyptian", label: "Egyptian", intervals: [0, 2, 5, 7, 10] },
  { id: "phrygian-dominant", label: "Phrygian Dominant", intervals: [0, 1, 4, 5, 7, 8, 10] },
  { id: "double-harmonic", label: "Double Harmonic", intervals: [0, 1, 4, 5, 7, 8, 11] },
];

const SCALE_CATALOG = SCALE_DEFINITIONS.map((scale) => {
  const mask = Array.from({ length: 12 }, () => false);
  for (const interval of scale.intervals) {
    mask[((interval % 12) + 12) % 12] = true;
  }
  return {
    ...scale,
    mask,
  };
});

export function midiNoteLabel(midiNote: number) {
  const normalized = Math.round(clamp(midiNote, 0, 127));
  const pitchClass = normalized % 12;
  const octave = Math.floor(normalized / 12) - 1;
  return `${PITCH_CLASS_NAMES[pitchClass] ?? "?"}${octave}`;
}

export function frequencyForMidiNote(midiNote: number, tuningHz = ANALYZER_DEFAULT_TUNING_HZ) {
  return tuningHz * 2 ** ((midiNote - 69) / 12);
}

export function tuningLabel(value: number) {
  return `${Math.round(value)} Hz`;
}

export function detectionSensitivityLabel(value: number) {
  return `${Math.round(clampDetectionSensitivity(value) * 100)}%`;
}

export function clampTuningHz(value: number) {
  return clamp(value, ANALYZER_MIN_TUNING_HZ, ANALYZER_MAX_TUNING_HZ);
}

export function clampDetectionSensitivity(value: number) {
  return clamp(value, ANALYZER_MIN_DETECTION_SENSITIVITY, ANALYZER_MAX_DETECTION_SENSITIVITY);
}

export function estimateDurationSeconds(frameCount: number, sampleRate = ANALYZER_DEFAULT_SAMPLE_RATE) {
  return Math.max(0, frameCount) * (ANALYZER_FRAME_HOP_SIZE / sampleRate);
}

export function createDefaultAnalyzerModuleState() {
  return create(AnalyzerModuleStateSchema, {
    schemaVersion: ANALYZER_SCHEMA_VERSION,
    revision: 1n,
    recordEnabled: false,
    tuningHz: ANALYZER_DEFAULT_TUNING_HZ,
    detectionSensitivity: ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
    noteEvents: [],
  });
}

export function createEmptyAnalyzerFrame() {
  return create(AnalyzerFrameSchema, {
    sequence: 0n,
    recording: false,
    tuningHz: ANALYZER_DEFAULT_TUNING_HZ,
    detectionSensitivity: ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
    durationSeconds: 0,
    currentLevel: 0,
    frameCount: 0,
    minMidiNote: 0,
    maxMidiNote: 0,
    laneEnergies: [],
    alternateMatches: [],
  });
}

function createAnalyzerEventId(input: {
  detectedMidiNote: number;
  startFrame: number;
  endFrame: number;
  meanFrequencyHz: number;
}) {
  const fnvPrime = 1_099_511_628_211n;
  const mask = (1n << 64n) - 1n;
  let hash = 1_469_598_103_934_665_603n;
  for (const value of [
    input.detectedMidiNote,
    input.startFrame,
    input.endFrame,
    Math.round(input.meanFrequencyHz * 100),
  ]) {
    hash = ((hash ^ BigInt(Math.max(0, value))) * fnvPrime) & mask;
  }
  return hash === 0n ? 1n : hash;
}

export function createAnalyzerNoteEvent(input: {
  midiNote: number;
  startFrame: number;
  endFrame: number;
  intensity: number;
  velocity: number;
  meanFrequencyHz: number;
  eventId?: bigint;
  confidence?: number;
  detectedMidiNote?: number;
}) {
  const detectedMidiNote = Math.round(clamp(input.detectedMidiNote ?? input.midiNote, 0, 127));
  return create(AnalyzerNoteEventSchema, {
    ...input,
    confidence: clamp(
      Number.isFinite(input.confidence) ? input.confidence! : input.intensity,
      0,
      1,
    ),
    detectedMidiNote,
    eventId: input.eventId && input.eventId > 0n
      ? input.eventId
      : createAnalyzerEventId({ ...input, detectedMidiNote }),
    midiNote: Math.round(clamp(input.midiNote, 0, 127)),
  });
}


export function buildPitchClassWeights(noteEvents: readonly AnalyzerNoteEvent[]) {
  const weights = Array.from({ length: 12 }, () => 0);
  for (const event of noteEvents) {
    const pitchClass = ((event.midiNote % 12) + 12) % 12;
    const durationWeight = Math.max(1, event.endFrame - event.startFrame);
    const intensityWeight = Math.max(0.12, Number.isFinite(event.intensity) ? event.intensity : event.velocity / 127);
    weights[pitchClass] += durationWeight * intensityWeight;
  }
  return weights;
}

export function rankScaleMatches(weights: readonly number[]) {
  const normalizedWeights = Array.from({ length: 12 }, (_, index) => Math.max(0, weights[index] ?? 0));
  const totalWeight = normalizedWeights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) {
    return [];
  }

  const matches = SCALE_CATALOG.flatMap((scale) =>
    Array.from({ length: 12 }, (_, rootPitchClass) => {
      let includedWeight = 0;
      let excludedWeight = 0;
      let coveredNotes = 0;
      let scaleNotes = 0;

      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        const weight = normalizedWeights[pitchClass] ?? 0;
        const inScale = scale.mask[((pitchClass - rootPitchClass) % 12 + 12) % 12];
        if (inScale) {
          scaleNotes += 1;
          includedWeight += weight;
          if (weight > 0.05) {
            coveredNotes += 1;
          }
        } else {
          excludedWeight += weight;
        }
      }

      const tonicWeight = normalizedWeights[rootPitchClass] ?? 0;
      const coverage = includedWeight / totalWeight;
      const penalty = excludedWeight / totalWeight;
      const noteCoverage = scaleNotes > 0 ? coveredNotes / scaleNotes : 0;
      const confidence = clamp(coverage * 0.74 + noteCoverage * 0.16 + tonicWeight / totalWeight * 0.18 - penalty * 0.35, 0, 1);

      return create(AnalyzerScaleMatchSchema, {
        rootPitchClass,
        scaleId: scale.id,
        confidence,
      });
    }),
  );

  return matches
    .sort((left, right) => right.confidence - left.confidence || left.rootPitchClass - right.rootPitchClass || left.scaleId.localeCompare(right.scaleId))
    .slice(0, 3);
}

export function summarizeAnalyzerTake(
  noteEvents: readonly AnalyzerNoteEvent[],
  frameCount: number,
  capturedBpm: number,
  durationSeconds = estimateDurationSeconds(frameCount),
) {
  if (noteEvents.length === 0) {
    return create(AnalyzerTakeSummarySchema, {
      minMidiNote: 0,
      maxMidiNote: 0,
      durationSeconds,
      capturedBpm,
      topMatches: [],
      frameCount,
    });
  }

  const midiNotes = noteEvents.map((event) => event.midiNote);
  return create(AnalyzerTakeSummarySchema, {
    minMidiNote: Math.min(...midiNotes),
    maxMidiNote: Math.max(...midiNotes),
    durationSeconds,
    capturedBpm,
    topMatches: rankScaleMatches(buildPitchClassWeights(noteEvents)),
    frameCount,
  });
}

export function normalizeAnalyzerModuleState(input: AnalyzerModuleState | undefined) {
  const fallback = createDefaultAnalyzerModuleState();
  if (!input) {
    return fallback;
  }

  const noteEvents = input.noteEvents
    .map((event) => createAnalyzerNoteEvent({
      confidence: input.schemaVersion >= 3 ? event.confidence : event.intensity,
      detectedMidiNote: input.schemaVersion >= 3 ? event.detectedMidiNote : event.midiNote,
      endFrame: event.endFrame,
      eventId: input.schemaVersion >= 3 ? event.eventId : undefined,
      intensity: event.intensity,
      meanFrequencyHz: event.meanFrequencyHz,
      midiNote: event.midiNote,
      startFrame: event.startFrame,
      velocity: event.velocity,
    }))
    .sort((left, right) => left.startFrame - right.startFrame || left.midiNote - right.midiNote);
  const frameCount = input.takeSummary?.frameCount ?? noteEvents.reduce((maxFrame, event) => Math.max(maxFrame, event.endFrame), 0);
  const capturedBpm = input.takeSummary?.capturedBpm ?? 120;
  const durationSeconds = input.takeSummary?.durationSeconds ?? estimateDurationSeconds(frameCount);
  const detectionSensitivity =
    input.schemaVersion >= 2
      ? clampDetectionSensitivity(
        Number.isFinite(input.detectionSensitivity)
          ? input.detectionSensitivity
          : ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
      )
      : ANALYZER_DEFAULT_DETECTION_SENSITIVITY;

  return create(AnalyzerModuleStateSchema, {
    schemaVersion: ANALYZER_SCHEMA_VERSION,
    revision: input.revision > 0n ? input.revision : fallback.revision,
    recordEnabled: input.recordEnabled,
    tuningHz: clampTuningHz(input.tuningHz || fallback.tuningHz),
    detectionSensitivity,
    noteEvents,
    takeSummary: summarizeAnalyzerTake(noteEvents, frameCount, capturedBpm, durationSeconds),
  });
}

export function encodeAnalyzerModuleState(state: AnalyzerModuleState) {
  return toBinary(AnalyzerModuleStateSchema, normalizeAnalyzerModuleState(state));
}

export function decodeAnalyzerModuleState(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return createDefaultAnalyzerModuleState();
  }
  return normalizeAnalyzerModuleState(fromBinary(AnalyzerModuleStateSchema, bytes));
}

export function encodeAnalyzerModuleStateBase64(state: AnalyzerModuleState) {
  return bytesToBase64(encodeAnalyzerModuleState(state));
}

export function decodeAnalyzerModuleStateBase64(value: string) {
  return decodeAnalyzerModuleState(base64ToBytes(value));
}

export function encodeAnalyzerFrameBase64(frame: AnalyzerFrame) {
  return bytesToBase64(toBinary(AnalyzerFrameSchema, frame));
}

export function decodeAnalyzerFrameBase64(value: string) {
  const frame = fromBinary(AnalyzerFrameSchema, base64ToBytes(value));
  return create(AnalyzerFrameSchema, {
    ...frame,
    detectionSensitivity:
      Number.isFinite(frame.detectionSensitivity)
        ? clampDetectionSensitivity(frame.detectionSensitivity)
        : ANALYZER_DEFAULT_DETECTION_SENSITIVITY,
  });
}

export function formatScaleLabel(scaleId: string) {
  return SCALE_CATALOG.find((entry) => entry.id === scaleId)?.label ?? scaleId;
}

export function formatScaleMatch(match: AnalyzerScaleMatch | null | undefined) {
  if (!match) {
    return "No key detected";
  }

  return `${PITCH_CLASS_NAMES[match.rootPitchClass] ?? "?"} ${formatScaleLabel(match.scaleId)}`;
}

export function resolveLaneRange(state: AnalyzerModuleState, frame?: AnalyzerFrame) {
  const summaryMin = state.takeSummary?.minMidiNote ?? 0;
  const summaryMax = state.takeSummary?.maxMidiNote ?? 0;
  const frameMin = frame?.minMidiNote ?? 0;
  const frameMax = frame?.maxMidiNote ?? 0;
  const resolvedMin = [summaryMin, frameMin].filter((value) => value > 0);
  const resolvedMax = [summaryMax, frameMax].filter((value) => value > 0);

  return {
    minMidiNote: resolvedMin.length > 0 ? Math.max(0, Math.min(...resolvedMin) - 1) : ANALYZER_MIN_LANE,
    maxMidiNote: resolvedMax.length > 0 ? Math.min(127, Math.max(...resolvedMax) + 1) : ANALYZER_MAX_LANE,
  };
}




