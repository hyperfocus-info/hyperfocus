import { createHash } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";

import { evaluateMediaFile as defaultEvaluateMediaFile } from "./orchestrator";
import { openEvaluationStore } from "./evaluation-store";
import { isRecord } from '@hyperfocus/utilities/records';

const DEFAULT_EVALUATOR_FINGERPRINT = "synaesthetic-evaluator-v3.1";
const DEFAULT_DASHBOARD_ORIGIN = "http://127.0.0.1:3217";
const MAX_MEDIA_BYTES = 67108864;

export function defaultEvaluationDatabasePath() {
  const localData = process.env.LOCALAPPDATA?.trim();
  if (process.platform === "win32" && localData) {
    return join(localData, "PadPilot", "synaesthetic-evaluator", "evaluations.sqlite");
  }
  const xdgData = process.env.XDG_DATA_HOME?.trim();
  if (xdgData) {
    return join(xdgData, "padpilot", "synaesthetic-evaluator", "evaluations.sqlite");
  }
  return join(process.cwd(), "build", "synaesthetic-evaluator", "evaluations.sqlite");
}



function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function score(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function metricId(kind: "audio" | "midi", value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return `${kind}.legacy.${fallback
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .toLowerCase()}`;
}

function unwrapEvaluation(value: unknown, path: string) {
  const wrapped = isRecord(value) ? value : {};
  const kind = wrapped.kind === "midi" || wrapped.kind === "audio" ? wrapped.kind : kindForPath(path);
  return {
    kind,
    report: isRecord(wrapped.report) ? wrapped.report : wrapped,
  } as const;
}

function kindForPath(path: string) {
  return new Set([".mid", ".midi"]).has(extname(path).toLowerCase()) ? "midi" as const : "audio" as const;
}

function normalizeDimensions(report: Record<string, unknown>) {
  const source = report.dimensions;
  const entries = Array.isArray(source)
    ? source.map((value, index) => [String(index), value] as const)
    : isRecord(source) ? Object.entries(source) : [];
  return entries.flatMap(([fallbackId, value]) => {
    if (!isRecord(value)) return [];
    const id = typeof value.id === "string"
      ? value.id
      : typeof value.name === "string" ? value.name : fallbackId;
    const dimensionScore = score(value.score);
    const valid = boolean(value.valid, dimensionScore !== null);
    return [{
      confidence: score(value.confidence) ?? (valid ? 1 : 0),
      contribution: finiteNumber(value.contribution) ?? undefined,
      id,
      score: dimensionScore,
      valid,
      weight: finiteNumber(value.weight) ?? 1,
    }];
  });
}

function normalizeMetrics(report: Record<string, unknown>, kind: "audio" | "midi") {
  const source = kind === "midi" && Array.isArray(report.midiMetrics)
    ? report.midiMetrics
    : Array.isArray(report.metrics) ? report.metrics : [];
  return source.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const nested = isRecord(value.metric) ? value.metric : value;
    const assessment = isRecord(value.assessment) ? value.assessment : {};
    const fallbackName = typeof value.name === "string" ? value.name : `metric-${index + 1}`;
    const metricScore = score(value.score) ?? score(assessment.score) ?? score(nested.score);
    const valid = boolean(value.valid, boolean(assessment.valid, boolean(nested.valid, metricScore !== null)));
    const evidence = value.evidence ?? assessment.evidence ?? nested.evidence ?? {
      biologicalImpact: nested.biologicalImpact,
      justification: nested.justification,
    };
    return [{
      confidence: score(value.confidence) ?? score(assessment.confidence) ?? score(nested.confidence) ?? (valid ? 1 : 0),
      contribution: finiteNumber(value.contribution) ?? undefined,
      diagnosis: typeof value.diagnosis === "string"
        ? value.diagnosis
        : typeof value.summary === "string"
          ? value.summary
        : typeof nested.justification === "string" ? nested.justification : undefined,
      dimensionId: typeof value.dimensionId === "string"
        ? value.dimensionId
        : typeof value.dimension === "string"
          ? value.dimension
        : typeof assessment.dimension === "string"
          ? assessment.dimension
          : typeof nested.dimensionId === "string" ? nested.dimensionId : undefined,
      evidence,
      id: metricId(kind, value.id ?? nested.id, fallbackName),
      score: metricScore,
      valid,
      weight: finiteNumber(value.weight) ?? finiteNumber(assessment.weight) ?? finiteNumber(nested.weight) ?? 1,
    }];
  });
}

function normalizeSeries(report: Record<string, unknown>) {
  const audioSummary = isRecord(report.audioSummary) ? report.audioSummary : {};
  const source = [report.timeline, report.timeSeries, report.analysisTimeline, audioSummary.timeline]
    .find(isRecord);
  if (!source) return [];
  const series: Array<{
    id: string;
    startSeconds: number;
    stepSeconds?: number;
    timestamps?: number[];
    unit: string;
    values: number[];
  }> = [];
  for (const [id, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const points = value.flatMap((point) => {
        if (!isRecord(point)) return [];
        const timeSeconds = finiteNumber(point.timeSeconds);
        const pointValue = finiteNumber(point.value);
        return timeSeconds === null || pointValue === null ? [] : [{ timeSeconds, value: pointValue }];
      });
      if (points.length !== value.length) continue;
      series.push({
        id,
        startSeconds: points[0]?.timeSeconds ?? 0,
        timestamps: points.map((point) => point.timeSeconds),
        unit: id === "loudness"
          ? "dBFS"
          : id === "centroid"
            ? "Hz"
            : id === "dynamics"
              ? "crest ratio"
              : ["tension", "groovePulse", "sectionScore"].includes(id) ? "score" : "",
        values: points.map((point) => point.value),
      });
      continue;
    }
    if (!isRecord(value) || !Array.isArray(value.values)) continue;
    const values = value.values.map(finiteNumber);
    if (values.some((item) => item === null)) continue;
    const timestamps = Array.isArray(value.timestamps)
      ? value.timestamps.map(finiteNumber)
      : undefined;
    if (timestamps?.some((item) => item === null)) continue;
    series.push({
      id,
      startSeconds: finiteNumber(value.startSeconds) ?? 0,
      stepSeconds: finiteNumber(value.stepSeconds) ?? undefined,
      timestamps: timestamps?.filter((value): value is number => value !== null),
      unit: typeof value.unit === "string" ? value.unit : "",
      values: values.filter((value): value is number => value !== null),
    });
  }
  return series;
}

function mediaMetadata(path: string, bytes: Uint8Array, kind: "audio" | "midi", report: Record<string, unknown>) {
  const summary = isRecord(report.audioSummary) ? report.audioSummary : {};
  const durationSeconds = finiteNumber(summary.durationSeconds) ?? undefined;
  return {
    byteLength: bytes.byteLength,
    channelCount: finiteNumber(summary.channelCount) ?? finiteNumber(summary.sourceChannelCount) ?? undefined,
    codec: extname(path).replace(/^\./, "").toLowerCase() || undefined,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    displayName: basename(path),
    durationSeconds,
    estimatedBitrateKbps: durationSeconds && durationSeconds > 0
      ? (bytes.byteLength * 8) / durationSeconds / 1_000
      : undefined,
    kind,
    originalSampleRate: finiteNumber(summary.originalSampleRate)
      ?? finiteNumber(summary.sourceSampleRate)
      ?? undefined,
    sourcePath: path,
  } as const;
}

export function openEvaluationLibrary(options: {
  readonly dashboardOrigin?: string;
  readonly dbPath?: string;
  readonly evaluateMediaFile?: (filePath: string) => Promise<unknown>;
  readonly evaluatorFingerprint?: string;
} = {}) {
  const dashboardOrigin = (options.dashboardOrigin ?? DEFAULT_DASHBOARD_ORIGIN).replace(/\/$/, "");
  const evaluatorFingerprint = options.evaluatorFingerprint ?? DEFAULT_EVALUATOR_FINGERPRINT;
  const evaluateMediaFile = options.evaluateMediaFile ?? defaultEvaluateMediaFile;
  const store = openEvaluationStore({
    dbPath: options.dbPath ?? process.env.PADPILOT_EVALUATOR_DB_PATH ?? defaultEvaluationDatabasePath(),
  });

  const evaluateFiles = async (paths: readonly string[], input: {
    readonly force?: boolean;
    readonly subjectiveScore?: number;
  } = {}) => {
    if (input.subjectiveScore !== undefined && score(input.subjectiveScore) === null) {
      throw new Error("Listener score must be a finite number from zero to one.");
    }
    const results = [];
    for (const unresolvedPath of paths) {
      const path = resolve(unresolvedPath);
      const file = Bun.file(path);
      if (!(await file.exists())) {
        throw new Error(`Evaluation input does not exist: ${path}`);
      }
      if (file.size > MAX_MEDIA_BYTES) {
        throw new Error(`Evaluation input exceeds ${MAX_MEDIA_BYTES} bytes: ${path}`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentSha256 = createHash("sha256").update(bytes).digest("hex");
      const existing = input.force
        ? null
        : store.findCompletedRun(contentSha256, evaluatorFingerprint);
      if (existing) {
        const subjectiveScore = input.subjectiveScore === undefined
          ? existing.subjectiveScore
          : store.saveSubjectiveAnnotation(existing.mediaId, { score: input.subjectiveScore }).score;
        results.push({
          mediaId: existing.mediaId,
          overallScore: existing.overallScore,
          reused: true,
          runId: existing.runId,
          status: "completed" as const,
          subjectiveScore,
          title: basename(path),
          url: `${dashboardOrigin}/runs/${existing.runId}`,
        });
        continue;
      }

      try {
        const evaluated = unwrapEvaluation(await evaluateMediaFile(path), path);
        const report = evaluated.report;
        const overallScore = score(report.overall) ?? score(report.successScore);
        const confidence = score(report.confidence);
        const saved = store.saveEvaluation({
          dimensions: normalizeDimensions(report),
          media: mediaMetadata(path, bytes, evaluated.kind, report),
          metrics: normalizeMetrics(report, evaluated.kind),
          run: {
            confidence,
            evaluatorFingerprint,
            overallScore,
            report,
          },
          series: normalizeSeries(report),
        });
        const subjectiveScore = input.subjectiveScore === undefined
          ? null
          : store.saveSubjectiveAnnotation(saved.mediaId, { score: input.subjectiveScore }).score;
        results.push({
          ...saved,
          overallScore,
          reused: false,
          status: "completed" as const,
          subjectiveScore,
          title: basename(path),
          url: `${dashboardOrigin}/runs/${saved.runId}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = store.saveEvaluation({
          media: mediaMetadata(path, bytes, kindForPath(path), {}),
          run: {
            confidence: null,
            error: { message },
            evaluatorFingerprint,
            overallScore: null,
            report: { error: { message } },
            status: "failed",
          },
        });
        const subjectiveScore = input.subjectiveScore === undefined
          ? null
          : store.saveSubjectiveAnnotation(failed.mediaId, { score: input.subjectiveScore }).score;
        results.push({
          ...failed,
          overallScore: null,
          reused: false,
          status: "failed" as const,
          subjectiveScore,
          title: basename(path),
          url: `${dashboardOrigin}/runs/${failed.runId}`,
        });
      }
    }
    return results;
  };

  return {
    close() {
      store.close();
    },
    evaluateFiles,
  };
}

export type EvaluationLibrary = ReturnType<typeof openEvaluationLibrary>;
