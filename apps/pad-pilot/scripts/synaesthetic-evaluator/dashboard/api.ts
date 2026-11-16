import { asObject } from "@hyperfocus/utilities/records";
import { z } from "zod";
export type DashboardMetric = {
  id: string;
  dimension: string;
  score: number | null;
  confidence: number;
  valid: boolean;
  summary?: string;
  evidence?: unknown;
};

export type DashboardDimension = {
  id: string;
  score: number | null;
  confidence: number;
  coverage?: number;
};

export type DashboardSeries = {
  id: string;
  unit?: string;
  startSeconds?: number;
  stepSeconds?: number;
  timestamps?: number[];
  values: number[];
};

export type DashboardAction = {
  id: string;
  priority: number;
  severity: "critical" | "high" | "medium";
  title: string;
  observation: string;
  impact: string;
  steps: string[];
  verify: string;
  confidence: number;
  focus?: { endSeconds: number; label: string; startSeconds: number };
};

export type DashboardReviewVerdict = "helpful" | "wrong" | "intentional" | "fixed";

export type DashboardReviewInput = {
  actionFeedback: Array<{ actionId: string; verdict: DashboardReviewVerdict }>;
  calibrationEligible: boolean;
  confidence: number;
  dimensionScores: Record<string, number>;
  genreTags: string[];
  intentTags: string[];
  notes?: string;
  overallScore: number;
};

export type DashboardReview = DashboardReviewInput & {
  createdAt?: string;
  datasetSplit: "train" | "validation" | "test";
  evaluatorFingerprint?: string;
  id: string;
  reviewSchemaVersion?: number;
};

export type DashboardSafetyCheck = {
  cap: number | null;
  valid: boolean;
  reasons: string[];
};

export type DashboardRun = {
  id: string;
  mediaId?: string;
  displayName: string;
  sourcePath?: string;
  overall: number | null;
  uncappedOverall?: number | null;
  subjectiveScore?: number;
  confidence: number;
  dimensions: DashboardDimension[];
  metrics: DashboardMetric[];
  actions: DashboardAction[];
  strengths: string[];
  weaknesses: string[];
  safetyChecks: DashboardSafetyCheck[];
  series: DashboardSeries[];
  sections: Array<{ startSeconds: number; endSeconds: number; score: number; label?: string }>;
  selfSimilarity?: number[][];
  erbProfile?: number[];
  evaluatedAt?: string;
  estimatedBitrateKbps?: number;
  originalSampleRate?: number;
  channelCount?: number;
  evaluatorFingerprint?: string;
  hasColocatedFlp: boolean;
  sourceAvailable: boolean;
  review?: DashboardReview;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : String(asObject(item).summary ?? "")).filter(Boolean);
}

function actionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap<DashboardAction>((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = asObject(entry);
    const severity = item.severity === "critical" || item.severity === "high" || item.severity === "medium"
      ? item.severity
      : "medium";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) return [];
    const focusValue = item.focus && typeof item.focus === "object" ? asObject(item.focus) : {};
    const focusStart = numberOrNull(focusValue.startSeconds);
    const focusEnd = numberOrNull(focusValue.endSeconds);
    return [{
      id: typeof item.id === "string" ? item.id : `action-${index + 1}`,
      priority: numberOrNull(item.priority) ?? 0,
      severity,
      title,
      observation: typeof item.observation === "string" ? item.observation : "",
      impact: typeof item.impact === "string" ? item.impact : "",
      steps: stringList(item.steps),
      verify: typeof item.verify === "string" ? item.verify : "",
      confidence: numberOrNull(item.confidence) ?? 0,
      focus: focusStart !== null && focusEnd !== null && focusEnd >= focusStart
        ? { endSeconds: focusEnd, label: typeof focusValue.label === "string" ? focusValue.label : "measured passage", startSeconds: focusStart }
        : undefined,
    }];
  });
}

function safetyList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = asObject(entry);
    return [{
      cap: numberOrNull(item.cap),
      valid: item.valid !== false,
      reasons: stringList(item.reasons),
    }];
  });
}

function dimensionList(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([id, result]) => ({ id, ...asObject(result) }))
      : [];
  return entries.map((entry) => {
    const item = asObject(entry);
    return {
      id: String(item.id ?? item.dimensionId ?? "unknown"),
      score: numberOrNull(item.score),
      confidence: numberOrNull(item.confidence) ?? 0,
      coverage: numberOrNull(item.coverage) ?? undefined,
    };
  });
}

function metricList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = asObject(entry);
    const score = numberOrNull(item.score);
    return {
      id: String(item.id ?? item.metricId ?? "unknown"),
      dimension: String(item.dimension ?? item.dimensionId ?? "other"),
      score,
      confidence: numberOrNull(item.confidence) ?? 0,
      valid: item.valid === true && score !== null,
      summary: typeof item.summary === "string" ? item.summary : typeof item.diagnosis === "string" ? item.diagnosis : undefined,
      evidence: item.evidence,
    };
  });
}

function seriesList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = asObject(entry);
    if (!Array.isArray(item.values)) return [];
    return [{
      id: String(item.id ?? item.seriesId ?? "series"),
      unit: typeof item.unit === "string" ? item.unit : undefined,
      startSeconds: numberOrNull(item.startSeconds ?? item.start_seconds) ?? undefined,
      stepSeconds: numberOrNull(item.stepSeconds ?? item.step_seconds) ?? undefined,
      timestamps: Array.isArray(item.timestamps) ? item.timestamps.filter((point): point is number => typeof point === "number") : undefined,
      values: item.values.filter((point): point is number => typeof point === "number" && Number.isFinite(point)),
    }];
  });
}

function reviewValue(value: unknown): DashboardReview | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = asObject(value);
  const overallScore = numberOrNull(item.overallScore);
  const confidence = numberOrNull(item.confidence);
  const split = item.datasetSplit;
  if (overallScore === null || confidence === null || (split !== "train" && split !== "validation" && split !== "test")) return undefined;
  const scores = item.dimensionScores && typeof item.dimensionScores === "object" && !Array.isArray(item.dimensionScores)
    ? Object.fromEntries(Object.entries(item.dimensionScores).flatMap(([key, score]) => {
        const normalized = numberOrNull(score);
        return normalized === null ? [] : [[key, normalized]];
      }))
    : {};
  const actionFeedback = Array.isArray(item.actionFeedback)
    ? item.actionFeedback.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const feedback = asObject(entry);
        const verdict = feedback.verdict;
        return typeof feedback.actionId === "string" && (verdict === "helpful" || verdict === "wrong" || verdict === "intentional" || verdict === "fixed")
          ? [{ actionId: feedback.actionId, verdict: reviewVerdictSchema.parse(verdict) }]
          : [];
      })
    : [];
  return {
    actionFeedback,
    calibrationEligible: item.calibrationEligible === true,
    confidence,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    datasetSplit: split,
    dimensionScores: scores,
    evaluatorFingerprint: typeof item.evaluatorFingerprint === "string" ? item.evaluatorFingerprint : undefined,
    genreTags: stringList(item.genreTags),
    id: typeof item.id === "string" ? item.id : "review",
    intentTags: stringList(item.intentTags),
    notes: typeof item.notes === "string" ? item.notes : undefined,
    overallScore,
    reviewSchemaVersion: numberOrNull(item.reviewSchemaVersion) ?? undefined,
  };
}

export function normalizeRun(value: unknown): DashboardRun {
  const envelope = value && typeof value === "object" ? asObject(value) : {};
  const item = envelope.report && typeof envelope.report === "object"
    ? { ...envelope, ...(asObject(envelope.report)) }
    : envelope;
  const media = item.media && typeof item.media === "object" ? asObject(item.media) : {};
  const observations = item.observations && typeof item.observations === "object" ? asObject(item.observations) : {};
  return {
    id: String(item.id ?? item.runId ?? item.evaluationId ?? "unknown"),
    mediaId: typeof item.mediaId === "string" ? item.mediaId : typeof media.id === "string" ? media.id : undefined,
    displayName: String(item.displayName ?? item.title ?? media.displayName ?? media.name ?? item.sourcePath ?? "Untitled"),
    sourcePath: typeof item.sourcePath === "string" ? item.sourcePath : typeof media.sourcePath === "string" ? media.sourcePath : undefined,
    overall: numberOrNull(item.overall ?? item.overallScore ?? item.successScore),
    uncappedOverall: numberOrNull(item.uncappedOverall ?? item.overall ?? item.overallScore ?? item.successScore),
    subjectiveScore: numberOrNull(item.subjectiveScore) ?? undefined,
    confidence: numberOrNull(item.confidence) ?? 0,
    dimensions: dimensionList(item.dimensions),
    metrics: metricList(item.metrics),
    actions: actionList(item.actions),
    strengths: stringList(item.strengths),
    weaknesses: stringList(item.weaknesses),
    safetyChecks: safetyList(Array.isArray(item.safetyChecks) ? item.safetyChecks : Array.isArray(item.safetyCaps) ? item.safetyCaps : []),
    series: seriesList(item.series ?? item.timeline),
    sections: Array.isArray(item.sections) ? z.array(z.object({ score: z.number(), startSeconds: z.number(), endSeconds: z.number() }).passthrough()).parse(item.sections) : [],
    selfSimilarity: Array.isArray(observations.selfSimilarity) ? z.array(z.array(z.number())).parse(observations.selfSimilarity) : undefined,
    erbProfile: Array.isArray(observations.erbProfile) ? z.array(z.number()).parse(observations.erbProfile) : undefined,
    evaluatedAt: typeof item.evaluatedAt === "string" ? item.evaluatedAt : typeof item.finishedAt === "string" ? item.finishedAt : undefined,
    estimatedBitrateKbps: numberOrNull(item.estimatedBitrateKbps ?? media.estimatedBitrateKbps) ?? undefined,
    originalSampleRate: numberOrNull(item.originalSampleRate ?? media.originalSampleRate) ?? undefined,
    channelCount: numberOrNull(item.channelCount ?? media.channelCount) ?? undefined,
    evaluatorFingerprint: typeof item.evaluatorFingerprint === "string" ? item.evaluatorFingerprint : undefined,
    hasColocatedFlp: item.hasColocatedFlp === true,
    sourceAvailable: item.sourceAvailable === true,
    review: reviewValue(item.review),
  };
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = z.object({ error: z.object({ message: z.unknown() }).optional() }).parse(await response.json());
    return typeof body.error?.message === "string" ? body.error.message : fallback;
  } catch {
    return fallback;
  }
}

export function audioSourceUrl(runId: string) {
  return `/api/v1/runs/${encodeURIComponent(runId)}/audio`;
}

export async function reanalyzeRun(runId: string) {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/reanalyze`, { method: "POST" });
  if (!response.ok) throw new Error(await responseError(response, `Reanalysis failed (${response.status}).`));
  const value = asObject(await response.json());
  if (typeof value.runId !== "string" || !value.runId) throw new Error("Reanalysis response did not include a run ID.");
  return { runId: value.runId };
}

export async function openRunProject(runId: string) {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/edit`, { method: "POST" });
  if (!response.ok) throw new Error(await responseError(response, `Project open failed (${response.status}).`));
}

export async function saveRunReview(runId: string, input: DashboardReviewInput) {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/reviews`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(await responseError(response, `Review save failed (${response.status}).`));
  const review = reviewValue(await response.json());
  if (!review) throw new Error("Review response was invalid.");
  return review;
}

export async function fetchLibrary() {
  const response = await fetch("/api/v1/library?limit=500");
  if (!response.ok) throw new Error(`Library request failed (${response.status}).`);
  const value = await response.json();
  const envelope = value && typeof value === "object" ? asObject(value) : {};
  const rows = Array.isArray(value) ? value : Array.isArray(envelope.items) ? envelope.items : Array.isArray(envelope.runs) ? envelope.runs : [];
  return rows.map(normalizeRun);
}

export async function fetchRun(runId: string) {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) throw new Error(`Report request failed (${response.status}).`);
  const run = normalizeRun(await response.json());
  if (run.series.length > 0) return run;
  const seriesResponse = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/series`);
  if (!seriesResponse.ok) return run;
  const seriesEnvelope = await seriesResponse.json();
  const seriesSource = seriesEnvelope && typeof seriesEnvelope === "object"
    ? (asObject(seriesEnvelope)).series
    : seriesEnvelope;
  return { ...run, series: seriesList(seriesSource) };
}

const reviewVerdictSchema = z.enum(["helpful", "wrong", "intentional", "fixed"]);
