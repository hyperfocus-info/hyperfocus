import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class CircadianClockSync extends MIDIAnalyzer {
  name = "CircadianClockSync";
  weight = 0.58;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const hour = state.localHour ?? new Date().getHours();
    const night = hour >= 21 || hour < 6;
    const targetPitch = night ? 55 : 65;
    const targetTreble = night ? 0.12 : 0.24;
    const pitchFit = fitToTarget(summary.meanPitch, targetPitch, 22);
    const trebleFit = fitToTarget(summary.trebleEnergy, targetTreble, 0.28);
    const score = clamp01(pitchFit * 0.58 + trebleFit * 0.42);

    return metric({
      score,
      biologicalImpact: "homeostasis",
      justification: `${night ? "Night" : "Day"} preference at hour ${hour}; mean pitch ${summary.meanPitch.toFixed(1)}, treble mass ${summary.trebleEnergy.toFixed(2)}.`,
    });
  }
}

export default new CircadianClockSync();
