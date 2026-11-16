import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { fitToTarget } from "../skill-math";
export function createShannonComplexity() {
    return {
        name: "ShannonComplexity",
        weight: 0.92,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            const rhythmicFit = fitToTarget(summary.rhythmicEntropy, 0.64, 0.46);
            const pitchFit = fitToTarget(summary.pitchEntropy, 0.68, 0.5);
            const densityFit = fitToTarget(summary.densityPerBeat, 4.8, 7);
            const score = rhythmicFit * 0.46 + pitchFit * 0.3 + densityFit * 0.24;
            return metric({
                score,
                biologicalImpact: "arousal",
                justification: `Rhythmic entropy ${summary.rhythmicEntropy.toFixed(2)}, pitch entropy ${summary.pitchEntropy.toFixed(2)}, density ${summary.densityPerBeat.toFixed(2)}/beat.`,
            });
        }
    };
}
export default createShannonComplexity();
