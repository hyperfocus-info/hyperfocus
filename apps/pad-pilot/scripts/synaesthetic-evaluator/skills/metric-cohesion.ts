import { MIDIAnalyzer, metric, type EvaluationState } from "../base-analyzer";
import { getMidiSummary } from "../midi-utils";
import { clamp01, fitToTarget } from "../skill-math";

export class MetricCohesion extends MIDIAnalyzer {
  name = "MetricCohesion";
  weight = 1;

  async evaluate(midi: Uint8Array, state: EvaluationState) {
    const summary = getMidiSummary(midi, state);
    const bpm = state.bpm ?? 120;
    const ticksPerBeat = 480;
    const grid = ticksPerBeat / 4;
    let aligned = 0;
    let syncopated = 0;

    for (const onset of summary.onsetTicks) {
      const distance = Math.min(onset % grid, grid - (onset % grid));
      if (distance <= grid * 0.08) {
        aligned += 1;
      } else if (distance >= grid * 0.28) {
        syncopated += 1;
      }
    }

    const total = Math.max(1, summary.onsetTicks.length);
    const alignment = aligned / total;
    const syncopation = syncopated / total;
    const alignmentFit = fitToTarget(alignment, 0.72, 0.42);
    const syncopationFit = fitToTarget(syncopation, 0.18, 0.28);
    const tempoFit = fitToTarget(bpm, 104, 84);
    const score = clamp01(alignmentFit * 0.52 + syncopationFit * 0.28 + tempoFit * 0.2);

    return metric({
      score,
      biologicalImpact: "arousal",
      justification: `Groove alignment ${Math.round(alignment * 100)}%, syncopation ${Math.round(syncopation * 100)}%, bpm ${bpm}.`,
    });
  }
}

export default new MetricCohesion();
