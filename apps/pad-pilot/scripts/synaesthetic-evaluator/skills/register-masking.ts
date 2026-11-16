import { metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01 } from "../skill-math";
export function createRegisterMasking() {
    return {
        name: "RegisterMasking",
        weight: 0.9,
        async evaluate(midi: Uint8Array, state: EvaluationState) {
            const summary = getMidiSummary(midi, state);
            let collisions = 0;
            let pairs = 0;
            for (let leftIndex = 0; leftIndex < summary.notes.length; leftIndex += 1) {
                const left = summary.notes[leftIndex]!;
                for (let rightIndex = leftIndex + 1; rightIndex < summary.notes.length; rightIndex += 1) {
                    const right = summary.notes[rightIndex]!;
                    if (right.startTick > left.endTick) {
                        break;
                    }
                    const overlaps = right.startTick < left.endTick && left.startTick < right.endTick;
                    if (!overlaps) {
                        continue;
                    }
                    pairs += 1;
                    const distance = Math.abs(right.note - left.note);
                    if ((left.note < 60 && distance <= 2) || distance <= 1) {
                        collisions += 1;
                    }
                }
            }
            const collisionRate = pairs > 0 ? collisions / pairs : 0;
            const score = clamp01(1 - collisionRate * 2.8);
            return metric({
                score,
                biologicalImpact: "homeostasis",
                justification: `Virtual register collision rate ${Math.round(collisionRate * 100)}% across ${pairs} overlapping note pairs.`,
            });
        }
    };
}
export default createRegisterMasking();
