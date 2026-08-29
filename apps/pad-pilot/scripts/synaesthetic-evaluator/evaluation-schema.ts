export const EVALUATION_DIMENSIONS = [
  "musicality",
  "groove",
  "structure",
  "soundQuality",
  "emotionalImpact",
] as const;

export type EvaluationDimensionId = typeof EVALUATION_DIMENSIONS[number];
export type MediumMetricId = `${"audio" | "midi"}.${string}`;
export type MetricEvidence = Readonly<Record<string, number | string | boolean | readonly number[]>>;
export type MetricStatus = "valid" | "not-applicable" | "unreliable" | "failed";

export type MetricAssessment = {
  readonly id: MediumMetricId;
  readonly facet: string;
  readonly dimension: EvaluationDimensionId;
  readonly score: number | null;
  readonly confidence: number;
  readonly valid: boolean;
  readonly status: MetricStatus;
  readonly summary: string;
  readonly weight: number;
  readonly evidence: MetricEvidence;
};

export type DimensionAssessment = {
  readonly id: EvaluationDimensionId;
  readonly score: number;
  readonly confidence: number;
  readonly validMetricCount: number;
  readonly metricCount: number;
};

export type SafetyAssessment = {
  readonly cap: number;
  readonly valid: boolean;
  readonly reasons: readonly string[];
};

export type DimensionEvaluation = {
  readonly overall: number;
  readonly uncappedOverall: number;
  readonly confidence: number;
  readonly dimensions: Readonly<Record<EvaluationDimensionId, DimensionAssessment>>;
  readonly safety: SafetyAssessment;
};

const DIMENSION_WEIGHTS = {
  musicality: 1,
  groove: 1,
  structure: 1,
  soundQuality: 1,
  emotionalImpact: 1,
} as const satisfies Record<EvaluationDimensionId, number>;

export function metricAssessment(input: Omit<MetricAssessment, "valid" | "facet" | "status" | "summary"> & {
  readonly valid?: boolean;
  readonly facet?: string;
  readonly status?: MetricStatus;
  readonly summary?: string;
}) {
  const confidence = clamp01(input.confidence);
  const score = input.score === null ? null : clamp01(input.score);
  const valid = input.valid ?? (score !== null && confidence > 0);
  return Object.freeze({
    ...input,
    facet: input.facet?.trim() || input.id,
    score,
    confidence,
    valid,
    status: input.status ?? (valid ? "valid" : "unreliable"),
    summary: input.summary?.trim() || input.id,
    weight: finitePositive(input.weight),
  }) satisfies MetricAssessment;
}

export function aggregateMetricAssessments(
  metrics: readonly MetricAssessment[],
  safety: SafetyAssessment = { cap: 1, valid: true, reasons: [] },
) {
  const dimensions = Object.fromEntries(EVALUATION_DIMENSIONS.map((id) => {
    const candidates = metrics.filter((metric) => metric.dimension === id);
    const valid = candidates.filter((metric) => metric.valid && metric.score !== null && metric.confidence > 0 && metric.weight > 0);
    const facets = [...new Set(candidates.map((metric) => metric.facet))];
    const validFacets = facets.flatMap((facet) => {
      const facetMetrics = valid.filter((metric) => metric.facet === facet);
      const denominator = facetMetrics.reduce((sum, metric) => sum + metric.weight * metric.confidence, 0);
      if (denominator <= 0) {
        return [];
      }
      return [{
        score: facetMetrics.reduce((sum, metric) => sum + metric.score! * metric.weight * metric.confidence, 0) / denominator,
        confidence: facetMetrics.reduce((sum, metric) => sum + metric.confidence, 0) / facetMetrics.length,
      }];
    });
    const facetConfidence = validFacets.reduce((sum, facet) => sum + facet.confidence, 0);
    const score = facetConfidence > 0
      ? validFacets.reduce((sum, facet) => sum + facet.score * facet.confidence, 0) / facetConfidence
      : 0.5;
    const reliability = validFacets.length > 0 ? facetConfidence / validFacets.length : 0;
    const coverage = facets.length > 0 ? validFacets.length / facets.length : 0;
    return [id, Object.freeze({
      id,
      score: clamp01(score),
      confidence: clamp01(reliability * coverage),
      validMetricCount: valid.length,
      metricCount: candidates.length,
    })];
  })) as Record<EvaluationDimensionId, DimensionAssessment>;

  const validDimensions = EVALUATION_DIMENSIONS.map((id) => dimensions[id]).filter((dimension) => dimension.confidence > 0);
  const denominator = validDimensions.reduce((sum, dimension) => sum + DIMENSION_WEIGHTS[dimension.id] * dimension.confidence, 0);
  const uncappedOverall = denominator > 0
    ? validDimensions.reduce((sum, dimension) => sum + dimension.score * DIMENSION_WEIGHTS[dimension.id] * dimension.confidence, 0) / denominator
    : 0;
  const totalDimensionWeight = EVALUATION_DIMENSIONS.reduce((sum, id) => sum + DIMENSION_WEIGHTS[id], 0);
  const confidence = EVALUATION_DIMENSIONS.reduce(
    (sum, id) => sum + dimensions[id].confidence * DIMENSION_WEIGHTS[id],
    0,
  ) / totalDimensionWeight;
  const normalizedSafety = Object.freeze({
    cap: clamp01(safety.cap),
    valid: safety.valid,
    reasons: Object.freeze([...safety.reasons]),
  });

  return Object.freeze({
    overall: clamp01(Math.min(uncappedOverall, normalizedSafety.cap)),
    uncappedOverall: clamp01(uncappedOverall),
    confidence: clamp01(confidence),
    dimensions: Object.freeze(dimensions),
    safety: normalizedSafety,
  }) satisfies DimensionEvaluation;
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
