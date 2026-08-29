import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { centsBetweenRatios, clamp01, equalTemperamentRatio, ratioForSemitone } from "../skill-math";

export class MicrotonalPurity extends MIDIAnalyzer {
  name = "MicrotonalPurity";
  weight = 0.66;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const intervals = [...summary.intervalSemitones, ...summary.simultaneityIntervals];
    if (intervals.length === 0) {
      return metric({
        score: summary.pitchBends.length > 0 ? 0.55 : 0.35,
        biologicalImpact: "valence",
        justification: "No interval material for 53-EDO/JI purity; MIDI note grid limits evidence.",
      });
    }

    let purity = 0;
    for (const interval of intervals) {
      const just = ratioForSemitone(interval);
      purity += clamp01(1 - centsBetweenRatios(equalTemperamentRatio(interval), just.ratio) / 52);
    }

    const bendIntent = clamp01(summary.pitchBends.length / Math.max(1, summary.noteCount * 0.2));
    const score = clamp01((purity / intervals.length) * 0.82 + bendIntent * 0.18);

    return metric({
      score,
      biologicalImpact: "valence",
      justification: `Integer-ratio interval purity ${Math.round((purity / intervals.length) * 100)}%; pitch-bend intent ${Math.round(bendIntent * 100)}%.`,
    });
  }
}

export default new MicrotonalPurity();
