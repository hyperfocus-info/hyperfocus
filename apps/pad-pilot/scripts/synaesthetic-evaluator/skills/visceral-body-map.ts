import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";
export function createVisceralBodyMap() {
    return {
        name: "VisceralBodyMap",
        weight: 0.74,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            const gutEnergy = summary.notes.reduce((sum, note) => {
                const inBodyBand = note.note >= 36 && note.note <= 55 ? 1 : 0;
                return sum + inBodyBand * Math.max(1, note.durationTicks) * note.velocity / 127;
            }, 0);
            const totalEnergy = summary.notes.reduce((sum, note) => sum + Math.max(1, note.durationTicks) * note.velocity / 127, 0);
            const gutRatio = totalEnergy > 0 ? gutEnergy / totalEnergy : 0;
            const bodyFit = fitToTarget(gutRatio, 0.24, 0.26);
            const pulseFit = fitToTarget(summary.densityPerBeat, 3.4, 5.5);
            const score = clamp01(bodyFit * 0.68 + pulseFit * 0.32);
            return metric({
                score,
                biologicalImpact: "arousal",
                justification: `Body-band energy ${Math.round(gutRatio * 100)}%; target favors controlled sub/low-mid physicality.`,
            });
        }
    };
}
export default createVisceralBodyMap();
