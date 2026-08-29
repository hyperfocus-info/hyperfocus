import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { centsBetweenRatios, clamp01, equalTemperamentRatio, ratioForSemitone } from "../skill-math";

export class CymaticStability extends MIDIAnalyzer {
  name = "CymaticStability";
  weight = 0.78;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    if (summary.noteCount === 0) {
      return metric({
        score: 0,
        biologicalImpact: "homeostasis",
        justification: "No note events available for cymatic projection.",
      });
    }

    const center = state.tonicPitchClass ?? dominantPitchClass(summary.pitchClassHistogram);
    let mirrorError = 0;
    let harmonicPurity = 0;
    let totalWeight = 0;
    let vectorX = 0;
    let vectorY = 0;

    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      const weight = summary.pitchClassHistogram[pitchClass] ?? 0;
      if (weight <= 0) {
        continue;
      }

      const mirrored = ((2 * center - pitchClass) % 12 + 12) % 12;
      mirrorError += Math.abs(weight - (summary.pitchClassHistogram[mirrored] ?? 0));
      const interval = ((pitchClass - center) % 12 + 12) % 12;
      const just = ratioForSemitone(interval);
      const equal = equalTemperamentRatio(interval);
      harmonicPurity += weight * clamp01(1 - centsBetweenRatios(equal, just.ratio) / 44);
      totalWeight += weight;

      const angle = (pitchClass / 12) * Math.PI * 2;
      vectorX += Math.cos(angle) * weight;
      vectorY += Math.sin(angle) * weight;
    }

    const mirrorSymmetry = totalWeight > 0 ? clamp01(1 - mirrorError / (totalWeight * 2)) : 0;
    const radialCoherence = totalWeight > 0 ? clamp01(Math.hypot(vectorX, vectorY) / totalWeight) : 0;
    const purity = totalWeight > 0 ? harmonicPurity / totalWeight : 0;
    const cymaticSymmetry = clamp01(mirrorSymmetry * 0.42 + purity * 0.38 + radialCoherence * 0.2);

    return metric({
      score: cymaticSymmetry,
      biologicalImpact: "homeostasis",
      justification: `Cymatic symmetry ${Math.round(cymaticSymmetry * 100)}%; mirror ${Math.round(mirrorSymmetry * 100)}%, integer-ratio purity ${Math.round(purity * 100)}%.`,
    });
  }
}

function dominantPitchClass(histogram: readonly number[]) {
  let best = 0;
  for (let pitchClass = 1; pitchClass < 12; pitchClass += 1) {
    if ((histogram[pitchClass] ?? 0) > (histogram[best] ?? 0)) {
      best = pitchClass;
    }
  }
  return best;
}

export default new CymaticStability();
