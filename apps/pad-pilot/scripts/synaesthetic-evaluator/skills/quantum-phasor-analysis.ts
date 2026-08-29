import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class QuantumPhasorAnalysis extends MIDIAnalyzer {
  name = "QuantumPhasorAnalysis";
  weight = 0.7;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    let real = 0;
    let imaginary = 0;

    for (const interval of [...summary.intervalSemitones, ...summary.simultaneityIntervals]) {
      const phase = (interval / 12) * Math.PI * 2;
      real += Math.cos(phase);
      imaginary += Math.sin(phase);
    }

    const count = Math.max(1, summary.intervalSemitones.length + summary.simultaneityIntervals.length);
    const coherence = Math.hypot(real, imaginary) / count;
    const score = fitToTarget(coherence, 0.54, 0.46);

    return metric({
      score: clamp01(score),
      biologicalImpact: "homeostasis",
      justification: `Interval phasor coherence ${coherence.toFixed(2)}; favors interference patterns that cohere without freezing.`,
    });
  }
}

export default new QuantumPhasorAnalysis();
