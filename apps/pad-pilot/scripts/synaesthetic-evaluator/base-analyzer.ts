import type { MidiSummary } from "./midi-utils";

export interface PerformanceMetric {
  score: number;
  biologicalImpact: "arousal" | "valence" | "tension" | "homeostasis";
  justification: string;
}

export type EvaluationState = {
  bpm?: number;
  tonicPitchClass?: number;
  scalePitchClasses?: readonly number[];
  localHour?: number;
  acousticSpace?: "cathedral" | "box";
  goldenEraProfile?: {
    pitchCenter?: number;
    velocityMean?: number;
    pitchEntropy?: number;
    densityPerBeat?: number;
  };
  midiSummary?: MidiSummary;
  previousSummary?: MidiSummary;
  previousScore?: number;
  [key: string]: unknown;
};

export type MIDIAnalyzer = {
  name: string;
  weight: number;
  evaluate: (midi: Uint8Array, state: EvaluationState) => Promise<PerformanceMetric>;
};

export type LoadedSkill = {
  readonly analyzer: MIDIAnalyzer;
  readonly sourcePath: string;
  readonly hash: string;
  readonly loadedAt: number;
};

export function normalizeMetric(metric: PerformanceMetric) {
  return {
    score: Math.max(0, Math.min(1, Number.isFinite(metric.score) ? metric.score : 0)),
    biologicalImpact: metric.biologicalImpact,
    justification: metric.justification,
  };
}

export function metric(value: PerformanceMetric) {
  return value;
}

// Compatibility for dynamically loaded legacy skills which extend the former abstract base.
// Authored skills use plain analyzer objects; this empty function preserves the runtime prototype.
export function MIDIAnalyzer() {}
