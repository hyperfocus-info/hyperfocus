import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, intervalRoughness } from "../skill-math";

export class DopamineCurvePredictor extends MIDIAnalyzer {
  name = "DopamineCurvePredictor";
  weight = 0.98;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    let resolutions = 0;
    let opportunities = 0;

    for (let index = 1; index < summary.intervalSemitones.length; index += 1) {
      const previous = intervalRoughness(summary.intervalSemitones[index - 1]!);
      const current = intervalRoughness(summary.intervalSemitones[index]!);
      if (previous > 0.58) {
        opportunities += 1;
        if (current < 0.28) {
          resolutions += 1;
        }
      }
    }

    const reward = opportunities > 0 ? resolutions / opportunities : clamp01(summary.noteCount / 12) * 0.45;
    const score = clamp01(reward * 0.82 + clamp01(summary.velocityStdDev / 22) * 0.18);

    return metric({
      score,
      biologicalImpact: "valence",
      justification: `Predicted resolution reward ${Math.round(reward * 100)}%; ${resolutions}/${opportunities} high-tension intervals resolved.`,
    });
  }
}

export default new DopamineCurvePredictor();
