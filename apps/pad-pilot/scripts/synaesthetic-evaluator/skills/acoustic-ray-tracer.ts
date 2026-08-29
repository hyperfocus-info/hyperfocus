import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget, mean } from "../skill-math";

export class AcousticRayTracer extends MIDIAnalyzer {
  name = "AcousticRayTracer";
  weight = 0.68;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const space = state.acousticSpace ?? "cathedral";
    const averageDuration = mean(summary.notes.map((note) => note.durationTicks));
    const overlapDensity = summary.simultaneityIntervals.length / Math.max(1, summary.noteCount);
    const durationTarget = space === "cathedral" ? 360 : 90;
    const overlapTarget = space === "cathedral" ? 0.42 : 0.16;
    const durationFit = fitToTarget(averageDuration, durationTarget, durationTarget * 0.9);
    const overlapFit = fitToTarget(overlapDensity, overlapTarget, 0.42);
    const score = clamp01(durationFit * 0.56 + overlapFit * 0.44);

    return metric({
      score,
      biologicalImpact: "homeostasis",
      justification: `Virtual ${space}: duration ${averageDuration.toFixed(1)} ticks, overlap density ${overlapDensity.toFixed(2)}.`,
    });
  }
}

export default new AcousticRayTracer();
