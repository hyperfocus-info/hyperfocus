import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { centsBetweenRatios, clamp01, equalTemperamentRatio, intervalRoughness, ratioForSemitone } from "../skill-math";

export class BiologicalTension extends MIDIAnalyzer {
  name = "BiologicalTension";
  weight = 1.18;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const intervals = [...summary.simultaneityIntervals, ...summary.intervalSemitones];
    if (intervals.length === 0) {
      return metric({
        score: summary.noteCount > 0 ? 0.72 : 0,
        biologicalImpact: "tension",
        justification: `Insufficient interval evidence; ${summary.noteCount} notes heard.`,
      });
    }

    let weightedStress = 0;
    let tritones = 0;
    let minorSeconds = 0;
    let majorSevenths = 0;
    const worst: string[] = [];

    for (const interval of intervals) {
      const normalized = ((Math.round(interval) % 12) + 12) % 12;
      const just = ratioForSemitone(normalized);
      const equal = equalTemperamentRatio(normalized);
      const centsDrift = centsBetweenRatios(equal, just.ratio);
      const roughness = intervalRoughness(normalized);
      const stress = clamp01(roughness * 0.82 + Math.min(1, centsDrift / 38) * 0.18);
      weightedStress += stress;

      if (normalized === 6) {
        tritones += 1;
      } else if (normalized === 1) {
        minorSeconds += 1;
      } else if (normalized === 11) {
        majorSevenths += 1;
      }

      if (stress > 0.75 && worst.length < 4) {
        worst.push(`${just.label}:${Math.round(stress * 100)}%`);
      }
    }

    const averageStress = weightedStress / intervals.length;
    const attackPenalty = clamp01((summary.meanVelocity - 92) / 42) * 0.16;
    const lowRegisterPenalty = summary.bassEnergy > 0.55 ? (summary.bassEnergy - 0.55) * 0.28 : 0;
    const stressLoad = clamp01(averageStress + attackPenalty + lowRegisterPenalty);
    const score = clamp01(1 - stressLoad);

    return metric({
      score,
      biologicalImpact: "tension",
      justification: `Stress load ${Math.round(stressLoad * 100)}%; tritone ${tritones}, m2 ${minorSeconds}, M7 ${majorSevenths}; worst ${worst.join(", ") || "none"}.`,
    });
  }
}

export default new BiologicalTension();
