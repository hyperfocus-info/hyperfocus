import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget, mean } from "../skill-math";

export class ThermodynamicWork extends MIDIAnalyzer {
  name = "ThermodynamicWork";
  weight = 0.82;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const entropy = (summary.pitchEntropy + summary.rhythmicEntropy) / 2;
    const momentum = mean(summary.intervalSemitones.map((interval) => Math.min(12, interval))) / 12;
    const entropyFit = fitToTarget(entropy, 0.62, 0.44);
    const momentumFit = fitToTarget(momentum, 0.28, 0.32);
    const wastedHeat = clamp01(entropy - momentum - 0.52) * 0.3;
    const score = clamp01(entropyFit * 0.48 + momentumFit * 0.52 - wastedHeat);

    return metric({
      score,
      biologicalImpact: "tension",
      justification: `Musical entropy ${entropy.toFixed(2)}, melodic momentum ${momentum.toFixed(2)}, wasted-heat penalty ${Math.round(wastedHeat * 100)}%.`,
    });
  }
}

export default new ThermodynamicWork();
