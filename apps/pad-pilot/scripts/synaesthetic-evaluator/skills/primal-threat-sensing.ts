import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01 } from "../skill-math";
export function createPrimalThreatSensing() {
    return {
        name: "PrimalThreatSensing",
        weight: 0.72,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            let threatMass = 0;
            let totalMass = 0;
            for (const note of summary.notes) {
                const transient = clamp01((note.velocity - 92) / 35);
                const lowFrequency = clamp01((52 - note.note) / 24);
                const shortHit = clamp01(1 - note.durationTicks / 120);
                const mass = Math.max(1, note.velocity) / 127;
                threatMass += mass * transient * (lowFrequency * 0.68 + shortHit * 0.32);
                totalMass += mass;
            }
            const alertRate = totalMass > 0 ? threatMass / totalMass : 0;
            const score = clamp01(1 - alertRate * 2.2);
            return metric({
                score,
                biologicalImpact: "arousal",
                justification: `Predator-alert proxy ${Math.round(alertRate * 100)}%; high-transient low-register hits reduce score.`,
            });
        }
    };
}
export default createPrimalThreatSensing();
