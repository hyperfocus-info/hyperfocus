import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, circularDistance, FIFTHS_ORDER } from "../skill-math";
export function createHarmonicStability() {
    return {
        name: "HarmonicStability",
        weight: 1.05,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            const tonic = state.tonicPitchClass ?? findDominantPitchClass(summary.pitchClassHistogram);
            const fifthIndex = FIFTHS_ORDER.indexOf(tonic);
            let fifthWeightedDistance = 0;
            let total = 0;
            for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
                const weight = summary.pitchClassHistogram[pitchClass] ?? 0;
                const index = FIFTHS_ORDER.indexOf(pitchClass);
                const fifthDistance = index >= 0 && fifthIndex >= 0 ? circularDistance(index, fifthIndex, 12) : 6;
                fifthWeightedDistance += weight * fifthDistance;
                total += weight;
            }
            const averageDistance = total > 0 ? fifthWeightedDistance / total : 6;
            const tonicWeight = total > 0 ? (summary.pitchClassHistogram[tonic] ?? 0) / total : 0;
            const dominantWeight = total > 0 ? (summary.pitchClassHistogram[(tonic + 7) % 12] ?? 0) / total : 0;
            const score = clamp01(1 - averageDistance / 6 + tonicWeight * 0.18 + dominantWeight * 0.14);
            return metric({
                score,
                biologicalImpact: "homeostasis",
                justification: `Circle-of-fifths average distance ${averageDistance.toFixed(2)} from tonic pc ${tonic}; tonic/dominant mass ${Math.round((tonicWeight + dominantWeight) * 100)}%.`,
            });
        }
    };
}
function findDominantPitchClass(histogram: readonly number[]) {
    let best = 0;
    for (let index = 1; index < 12; index += 1) {
        if ((histogram[index] ?? 0) > (histogram[best] ?? 0)) {
            best = index;
        }
    }
    return best;
}
export default createHarmonicStability();
