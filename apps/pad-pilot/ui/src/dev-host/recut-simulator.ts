import { create } from "@bufbuild/protobuf";
import { PadAssignmentSchema, RecutBpmSource } from "../proto/generated/recut-pb";
import { RECUT_MAX_PADS, createRecutSliceMarkers } from "../modules/recut/recut-state";
import { clamp } from "../utils/math";

export function createRecutWaveformPeaks(samples: Float32Array, bins = 128) {
  if (samples.length === 0 || bins <= 0) return [];
  const peaks: number[] = [];
  const binSize = Math.max(1, Math.floor(samples.length / bins));
  for (let index = 0; index < bins; index += 1) {
    const start = index * binSize;
    const end = Math.min(samples.length, start + binSize);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
    }
    peaks.push(peak);
  }
  return peaks;
}

export function buildPadAssignments(sliceCount: number) {
  return Array.from({ length: RECUT_MAX_PADS }, (_, index) =>
    create(PadAssignmentSchema, {
      bank: Math.floor(index / 4),
      chokeGroupId: 0,
      faceButton: ["X", "Y", "A", "B"][index % 4] ?? "X",
      isEmpty: false,
      padIndex: index,
      sliceIndex: index % Math.max(1, sliceCount),
    }),
  );
}

export function inferBpm(candidateTransients: readonly number[], sampleRate: number, projectBpm: number) {
  if (candidateTransients.length < 2) {
    return { confidence: 0, source: RecutBpmSource.PROJECT, suggestedConfidence: 0, suggestedValue: 0, value: projectBpm };
  }
  const intervals = candidateTransients.slice(1).map((frame, index) => frame - candidateTransients[index]!);
  const bpms = intervals
    .map((interval) => interval > 0 ? (60 * sampleRate) / interval : 0)
    .map((bpm) => bpm < 60 ? bpm * 2 : bpm > 180 ? bpm / 2 : bpm)
    .filter((bpm) => bpm >= 40 && bpm <= 240);
  if (bpms.length === 0) {
    return { confidence: 0, source: RecutBpmSource.PROJECT, suggestedConfidence: 0, suggestedValue: 0, value: projectBpm };
  }
  const suggestedValue = bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length;
  const variance = bpms.reduce((sum, bpm) => sum + Math.abs(bpm - suggestedValue), 0) / bpms.length;
  const confidence = clamp(1 - variance / 24, 0, 1);
  return confidence >= 0.5
    ? { confidence, source: RecutBpmSource.ANALYZED, suggestedConfidence: confidence, suggestedValue, value: suggestedValue }
    : { confidence: 0, source: RecutBpmSource.PROJECT, suggestedConfidence: confidence, suggestedValue, value: projectBpm };
}

export function buildBpmMarkers(
  bpmValue: number,
  density: number,
  lengthFrames: number,
  sampleRate: number,
  candidateTransients: readonly number[],
) {
  const targetCount = density >= 0.75 ? 16 : density >= 0.25 ? 8 : 4;
  const beatFrames = Math.max(1, Math.round((60 / Math.max(20, bpmValue || 120)) * sampleRate));
  const starts: number[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    const gridFrame = Math.min(lengthFrames - 1, index * beatFrames);
    const snappedFrame = candidateTransients.find((frame) => Math.abs(frame - gridFrame) <= beatFrames * 0.2) ?? gridFrame;
    starts.push(snappedFrame);
    if (snappedFrame >= lengthFrames - 1) break;
  }
  return createRecutSliceMarkers(starts.length > 0 ? starts : [0], lengthFrames);
}
