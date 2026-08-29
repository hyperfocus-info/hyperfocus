import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class VelocityHumanizer extends MIDIAnalyzer {
  name = "VelocityHumanizer";
  weight = 0.86;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const minimumVarianceScore = clamp01(summary.velocityStdDev / 10);
    const dynamicRangeFit = fitToTarget(summary.velocityStdDev, 18, 22);
    const hardClipPenalty = clamp01((summary.meanVelocity - 112) / 15) * 0.3;
    const score = clamp01(minimumVarianceScore * 0.48 + dynamicRangeFit * 0.52 - hardClipPenalty);

    return metric({
      score,
      biologicalImpact: "valence",
      justification: `Velocity std-dev ${summary.velocityStdDev.toFixed(1)}; values below 10 sound quantized and are penalized.`,
    });
  }
}

export default new VelocityHumanizer();
