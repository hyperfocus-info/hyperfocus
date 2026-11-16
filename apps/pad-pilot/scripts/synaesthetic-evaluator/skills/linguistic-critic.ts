import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01 } from "../skill-math";
export function createLinguisticCritic() {
    return {
        name: "LinguisticCritic",
        weight: 0.55,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            const contour = summary.intervalSemitones.map((interval) => (interval === 0 ? "hold" : interval <= 2 ? "step" : interval <= 5 ? "skip" : "leap"));
            const motifs = new Map<string, number>();
            for (let index = 0; index + 2 < contour.length; index += 1) {
                const token = contour.slice(index, index + 3).join("-");
                motifs.set(token, (motifs.get(token) ?? 0) + 1);
            }
            const repeatedMotifs = [...motifs.values()].filter((count) => count > 1).length;
            const phraseCount = Math.max(1, Math.round(Math.sqrt(summary.noteCount) / 2));
            const repetitionScore = clamp01(repeatedMotifs / Math.max(1, motifs.size * 0.28));
            const phraseScore = clamp01(summary.noteCount / Math.max(8, phraseCount * 8));
            const score = clamp01(repetitionScore * 0.62 + phraseScore * 0.38);
            const structuralText = `${summary.noteCount} notes; ${phraseCount} phrase candidates; contour ${contour.slice(0, 12).join(" ")}.`;
            return metric({
                score,
                biologicalImpact: "valence",
                justification: `${structuralText} Motif reuse ${repeatedMotifs}/${Math.max(1, motifs.size)}.`,
            });
        }
    };
}
export default createLinguisticCritic();
