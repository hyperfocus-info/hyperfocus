import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { bestScaleCompliance, clamp01, weightedMaskCompliance } from "../skill-math";

export class ScaleCompliance extends MIDIAnalyzer {
  name = "ScaleCompliance";
  weight = 0.95;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const gatMask = Array.isArray(state.scalePitchClasses)
      ? Array.from({ length: 12 }, (_, pitchClass) => (state.scalePitchClasses?.includes(pitchClass) ? 1 : 0))
      : null;
    const compliance = gatMask ? weightedMaskCompliance(summary.pitchClassHistogram, gatMask) : bestScaleCompliance(summary.pitchClassHistogram).score;
    const chromaticEscape = clamp01((summary.pitchEntropy - 0.86) / 0.14) * 0.12;
    const score = clamp01(compliance - chromaticEscape);

    return metric({
      score,
      biologicalImpact: "homeostasis",
      justification: `${gatMask ? "GAT" : "inferred scale"} compliance ${Math.round(compliance * 100)}%; chromatic escape penalty ${Math.round(chromaticEscape * 100)}%.`,
    });
  }
}

export default new ScaleCompliance();
