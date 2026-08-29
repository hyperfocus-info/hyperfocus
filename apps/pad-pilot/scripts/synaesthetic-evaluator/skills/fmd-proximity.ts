import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class FmdProximity extends MIDIAnalyzer {
  name = "FMD_Proximity";
  weight = 0.9;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const profile = {
      pitchCenter: state.goldenEraProfile?.pitchCenter ?? 62,
      velocityMean: state.goldenEraProfile?.velocityMean ?? 82,
      pitchEntropy: state.goldenEraProfile?.pitchEntropy ?? 0.68,
      densityPerBeat: state.goldenEraProfile?.densityPerBeat ?? 4.2,
    };

    const pitchFit = fitToTarget(summary.meanPitch, profile.pitchCenter, 18);
    const velocityFit = fitToTarget(summary.meanVelocity, profile.velocityMean, 42);
    const entropyFit = fitToTarget(summary.pitchEntropy, profile.pitchEntropy, 0.55);
    const densityFit = fitToTarget(summary.densityPerBeat, profile.densityPerBeat, 8);
    const score = clamp01(pitchFit * 0.28 + velocityFit * 0.2 + entropyFit * 0.24 + densityFit * 0.28);

    return metric({
      score,
      biologicalImpact: "valence",
      justification: `Golden-era proximity ${Math.round(score * 100)}%; pitch ${summary.meanPitch.toFixed(1)}, velocity ${summary.meanVelocity.toFixed(1)}, density ${summary.densityPerBeat.toFixed(2)}/beat.`,
    });
  }
}

export default new FmdProximity();
