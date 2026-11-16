import { describe, expect, test } from "bun:test";

import { aggregateMetricAssessments, metricAssessment } from "./evaluation-schema";

describe("aggregateMetricAssessments", () => {
  test("scores dimensions before combining them and excludes invalid evidence", () => {
    const evaluation = aggregateMetricAssessments([
      metricAssessment({ id: "audio.rhythm.pulse", dimension: "groove", score: 0.9, confidence: 1, weight: 1, evidence: { value: 0.8 } }),
      metricAssessment({ id: "audio.rhythm.grid", dimension: "groove", score: 0.1, confidence: 0, weight: 100, evidence: { reason: "beat ambiguous" } }),
      metricAssessment({ id: "audio.structure.contrast", dimension: "structure", score: 0.7, confidence: 1, weight: 1, evidence: { value: 0.6 } }),
    ]);

    expect(evaluation.dimensions.groove.score).toBeCloseTo(0.9);
    expect(evaluation.dimensions.groove.validMetricCount).toBe(1);
    expect(evaluation.dimensions.structure.score).toBeCloseTo(0.7);
    expect(evaluation.overall).toBeCloseTo(0.7666666666666666);
    expect(evaluation.confidence).toBeLessThan(1);
  });

  test("reports an explicit safety cap without rewriting dimension scores", () => {
    const evaluation = aggregateMetricAssessments([
      metricAssessment({ id: "audio.mix.balance", dimension: "soundQuality", score: 0.92, confidence: 1, weight: 1, evidence: { value: 0.92 } }),
    ], { cap: 0.4, valid: false, reasons: ["severe clipping"] });

    expect(evaluation.uncappedOverall).toBeCloseTo(0.92);
    expect(evaluation.overall).toBe(0.4);
    expect(evaluation.dimensions.soundQuality.score).toBeCloseTo(0.92);
    expect(evaluation.safety.reasons).toEqual(["severe clipping"]);
  });

  test("gives a facet one vote even when correlated metrics are duplicated", () => {
    const baseline = [
      metricAssessment({ id: "audio.mix.low_balance", facet: "low-frequency", dimension: "soundQuality", score: 0.9, confidence: 1, weight: 1, evidence: {} }),
      metricAssessment({ id: "audio.mix.harshness", facet: "spectral-comfort", dimension: "soundQuality", score: 0.3, confidence: 1, weight: 1, evidence: {} }),
    ];
    const duplicated = [
      ...baseline,
      metricAssessment({ id: "audio.mix.low_cleanliness", facet: "low-frequency", dimension: "soundQuality", score: 0.9, confidence: 1, weight: 1, evidence: {} }),
      metricAssessment({ id: "audio.mix.low_drive", facet: "low-frequency", dimension: "soundQuality", score: 0.9, confidence: 1, weight: 1, evidence: {} }),
    ];

    expect(aggregateMetricAssessments(duplicated).dimensions.soundQuality.score)
      .toBeCloseTo(aggregateMetricAssessments(baseline).dimensions.soundQuality.score);
  });

  test("keeps unavailable evidence nullable with an explicit status", () => {
    const unavailable = metricAssessment({
      id: "audio.musical.tonal-intent",
      dimension: "musicality",
      score: null,
      confidence: 0.08,
      status: "unreliable",
      summary: "No reliable conventional tonal center.",
      weight: 1,
      evidence: { keyConfidence: 0.08 },
    });
    const evaluation = aggregateMetricAssessments([unavailable]);

    expect(unavailable.score).toBeNull();
    expect(unavailable.valid).toBe(false);
    expect(unavailable.status).toBe("unreliable");
    expect(evaluation.dimensions.musicality.validMetricCount).toBe(0);
  });
});
