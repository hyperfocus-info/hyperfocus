import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class SpectralDensitySim extends MIDIAnalyzer {
  name = "SpectralDensitySim";
  weight = 0.82;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const lowFit = fitToTarget(summary.bassEnergy, 0.22, 0.28);
    const midFit = fitToTarget(summary.midEnergy, 0.58, 0.42);
    const trebleFit = fitToTarget(summary.trebleEnergy, 0.2, 0.3);
    const overcrowdPenalty = clamp01((summary.densityPerBeat - 10) / 10) * 0.25;
    const score = clamp01(lowFit * 0.28 + midFit * 0.42 + trebleFit * 0.3 - overcrowdPenalty);

    return metric({
      score,
      biologicalImpact: "homeostasis",
      justification: `Symbolic spectrum bass/mid/treble ${summary.bassEnergy.toFixed(2)}/${summary.midEnergy.toFixed(2)}/${summary.trebleEnergy.toFixed(2)}.`,
    });
  }
}

export default new SpectralDensitySim();
