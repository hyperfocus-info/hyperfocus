import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget, normalizedEntropy } from "../skill-math";
export function createCosmicMicrowaveDissonance() {
    return {
        name: "CosmicMicrowaveDissonance",
        weight: 0.5,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            const byteBuckets = Array.from({ length: 16 }, () => 0);
            for (const byte of midi) {
                byteBuckets[byte >> 4] += 1;
            }
            const byteNoise = normalizedEntropy(byteBuckets);
            const musicalNoise = (summary.pitchEntropy + summary.rhythmicEntropy) / 2;
            const cosmicBackgroundFit = fitToTarget(byteNoise * 0.45 + musicalNoise * 0.55, 0.63, 0.42);
            const randomWalkPenalty = clamp01(summary.pitchEntropy - 0.91) * 0.7;
            const score = clamp01(cosmicBackgroundFit - randomWalkPenalty);
            return metric({
                score,
                biologicalImpact: "tension",
                justification: `CMB-noise proxy byte entropy ${byteNoise.toFixed(2)}, musical noise ${musicalNoise.toFixed(2)}; random-walk penalty ${Math.round(randomWalkPenalty * 100)}%.`,
            });
        }
    };
}
export default createCosmicMicrowaveDissonance();
