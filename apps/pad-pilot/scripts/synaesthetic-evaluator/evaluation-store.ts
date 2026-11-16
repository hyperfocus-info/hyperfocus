import { z } from "zod";
import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { decodeTimeSeries, encodeTimeSeries } from "./time-series-codec";

type EvaluationMedia = {
  readonly byteLength: number;
  readonly channelCount?: number;
  readonly codec?: string;
  readonly contentSha256: string;
  readonly displayName: string;
  readonly durationSeconds?: number;
  readonly estimatedBitrateKbps?: number;
  readonly kind: "audio" | "midi";
  readonly originalSampleRate?: number;
  readonly sourcePath: string;
};

type EvaluationDimension = {
  readonly confidence: number;
  readonly contribution?: number;
  readonly id: string;
  readonly score: number | null;
  readonly valid: boolean;
  readonly weight: number;
};

type EvaluationMetric = EvaluationDimension & {
  readonly diagnosis?: string;
  readonly dimensionId?: string;
  readonly evidence?: unknown;
};

type EvaluationSeries = {
  readonly id: string;
  readonly startSeconds: number;
  readonly stepSeconds?: number;
  readonly timestamps?: readonly number[];
  readonly unit: string;
  readonly values: readonly number[];
};

export type PersistedEvaluationInput = {
  readonly dimensions?: readonly EvaluationDimension[];
  readonly media: EvaluationMedia;
  readonly metrics?: readonly EvaluationMetric[];
  readonly run: {
    readonly confidence: number | null;
    readonly error?: unknown;
    readonly evaluatorFingerprint: string;
    readonly finishedAt?: string;
    readonly overallScore: number | null;
    readonly report: unknown;
    readonly startedAt?: string;
    readonly status?: "completed" | "failed";
  };
  readonly series?: readonly EvaluationSeries[];
};

const REVIEW_SCHEMA_VERSION = 1;
const REVIEW_DIMENSIONS = new Set(["musicality", "groove", "structure", "soundQuality", "emotionalImpact"]);
const REVIEW_VERDICTS = new Set(["helpful", "wrong", "intentional", "fixed"]);

export type ReviewDatasetSplit = "train" | "validation" | "test";

export type EvaluationReviewInput = {
  readonly actionFeedback?: readonly {
    readonly actionId: string;
    readonly verdict: "helpful" | "wrong" | "intentional" | "fixed";
  }[];
  readonly calibrationEligible: boolean;
  readonly confidence: number;
  readonly dimensionScores?: Readonly<Record<string, number>>;
  readonly genreTags?: readonly string[];
  readonly intentTags?: readonly string[];
  readonly notes?: string;
  readonly overallScore: number;
};

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");
const MAX_MIGRATION_BYTES = 2097152;
const MAX_SERIES_POINTS = 1_000_000;
const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL
);`;

function nowIso() {
  return new Date().toISOString();
}

function normalizeSourcePath(sourcePath: string) {
  const absolutePath = resolve(sourcePath);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

function parseJson(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function validateScore(value: number | null, label: string) {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error(`${label} must be null or a finite number from zero to one.`);
  }
}

function validateConfidence(value: number | null, label: string) {
  validateScore(value, label);
}

function seriesRange(values: readonly number[]) {
  if (values.length === 0) return { maximum: null, minimum: null };
  let maximum = values[0]!;
  let minimum = values[0]!;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]!;
    if (value > maximum) maximum = value;
    if (value < minimum) minimum = value;
  }
  return { maximum, minimum };
}

function applyMigrations(db: Database, migrationsDir: string) {
  db.exec(MIGRATION_TABLE_SQL);
  if (!existsSync(migrationsDir) || !lstatSync(migrationsDir).isDirectory() || lstatSync(migrationsDir).isSymbolicLink()) {
    throw new Error(`Evaluation migrations path must be a real directory: ${migrationsDir}`);
  }
  const files = readdirSync(migrationsDir)
    .filter((fileName) => extname(fileName) === ".sql")
    .sort((left, right) => left.localeCompare(right));
  for (const [index, fileName] of files.entries()) {
    const match = /^(\d{3})-[a-z0-9][a-z0-9-]*\.sql$/.exec(fileName);
    if (!match || Number(match[1]) !== index + 1) {
      throw new Error(`Evaluation migrations must form a contiguous numbered sequence: ${fileName}`);
    }
  }

  const appliedRows = z.array(z.object({ checksum_sha256: z.string(), id: z.string() })).parse(db.query("SELECT id, checksum_sha256 FROM _migrations ORDER BY id").all());
  const fileNames = new Set(files);
  const missing = appliedRows.filter((row) => !fileNames.has(row.id));
  if (missing.length > 0) {
    throw new Error(`Applied evaluation migration files are missing: ${missing.map((row) => row.id).join(", ")}`);
  }

  for (const fileName of files) {
    const migrationPath = join(migrationsDir, fileName);
    const stat = lstatSync(migrationPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MIGRATION_BYTES) {
      throw new Error(`Evaluation migration must be a bounded regular file: ${fileName}`);
    }
    const sql = readFileSync(migrationPath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = appliedRows.find((row) => row.id === fileName);
    if (applied && applied.checksum_sha256 !== checksum) {
      throw new Error(`Applied evaluation migration changed: ${fileName}`);
    }
    if (applied) {
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.query("INSERT INTO _migrations (id, applied_at, checksum_sha256) VALUES (?, ?, ?)")
        .run(fileName, nowIso(), checksum);
    }).immediate();
  }
}

function validateSchema(db: Database) {
  const required = {
    _migrations: ["id", "applied_at", "checksum_sha256"],
    dimension_results: ["run_id", "dimension_id", "score", "confidence", "valid"],
    evaluation_runs: ["id", "media_id", "source_location_id", "display_name", "status", "evaluator_fingerprint", "result_json"],
    evaluation_reviews: ["id", "run_id", "media_id", "evaluator_fingerprint", "review_schema_version", "overall_score", "confidence", "dimension_scores_json", "action_feedback_json", "genre_tags_json", "intent_tags_json", "calibration_eligible", "dataset_split", "created_at"],
    media_assets: ["id", "content_sha256", "kind", "byte_length"],
    metric_results: ["run_id", "metric_id", "dimension_id", "score", "confidence", "valid", "evidence_json"],
    source_locations: ["id", "media_id", "normalized_path", "source_path"],
    subjective_annotations: ["id", "media_id", "score", "label", "notes", "created_at"],
    time_series: ["run_id", "series_id", "point_count", "values_blob"],
  } as const;
  const missing: string[] = [];
  const statement = db.prepare("SELECT name FROM pragma_table_info(?)");
  try {
    for (const [table, columns] of Object.entries(required)) {
      const actual = new Set(
        (z.array(z.object({ name: z.string() })).parse(statement.all(table))).map((row) => row.name),
      );
      if (actual.size === 0) {
        missing.push(table);
        continue;
      }
      for (const column of columns) {
        if (!actual.has(column)) missing.push(`${table}.${column}`);
      }
    }
  } finally {
    statement.finalize();
  }
  if (missing.length > 0) {
    throw new Error(`Evaluation database schema is incomplete: ${missing.join(", ")}`);
  }
}

function datasetSplit(contentSha256: string): ReviewDatasetSplit {
  const bucket = Number.parseInt(contentSha256.slice(0, 8), 16) % 100;
  if (bucket < 70) return "train";
  if (bucket < 85) return "validation";
  return "test";
}

function normalizeReviewTags(values: readonly string[] | undefined, label: string) {
  if ((values?.length ?? 0) > 12) throw new Error(`${label} must not contain more than 12 tags.`);
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    if (typeof raw !== "string") throw new Error(`${label} tags must be strings.`);
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > 60) throw new Error(`${label} tags must not exceed 60 characters.`);
    const key = tag.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return Object.freeze(tags);
}

function normalizeReviewInput(input: EvaluationReviewInput) {
  validateScore(input.overallScore, "Review overall score");
  validateConfidence(input.confidence, "Review confidence");
  if (typeof input.calibrationEligible !== "boolean") throw new Error("Review calibration eligibility must be boolean.");
  if ((input.notes?.length ?? 0) > 4_000) throw new Error("Review notes must not exceed 4000 characters.");
  if ((input.actionFeedback?.length ?? 0) > 20) throw new Error("Review action feedback must not exceed 20 items.");
  const actionFeedback = (input.actionFeedback ?? []).map((item) => {
    if (typeof item.actionId !== "string" || !item.actionId.trim() || item.actionId.length > 160) {
      throw new Error("Review action IDs must contain 1 to 160 characters.");
    }
    if (!REVIEW_VERDICTS.has(item.verdict)) throw new Error("Review action verdict is invalid.");
    return Object.freeze({ actionId: item.actionId, verdict: item.verdict });
  });
  const dimensionScores: Record<string, number> = {};
  for (const [dimension, score] of Object.entries(input.dimensionScores ?? {})) {
    if (!REVIEW_DIMENSIONS.has(dimension)) throw new Error(`Unknown review dimension: ${dimension}.`);
    validateScore(score, `Review ${dimension} score`);
    dimensionScores[dimension] = score;
  }
  return Object.freeze({
    actionFeedback: Object.freeze(actionFeedback),
    calibrationEligible: input.calibrationEligible,
    confidence: input.confidence,
    dimensionScores: Object.freeze(dimensionScores),
    genreTags: normalizeReviewTags(input.genreTags, "Review genre"),
    intentTags: normalizeReviewTags(input.intentTags, "Review intent"),
    notes: input.notes?.trim() || null,
    overallScore: input.overallScore,
  });
}

function mapReviewRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    actionFeedback: z.array(z.object({ actionId: z.string(), verdict: z.enum(["helpful", "wrong", "intentional", "fixed"]) })).optional().parse(parseJson(z.string().parse(row.action_feedback_json))),
    calibrationEligible: row.calibration_eligible === 1,
    confidence: z.number().parse(row.confidence),
    createdAt: z.string().parse(row.created_at),
    datasetSplit: z.enum(["train", "validation", "test"]).parse(row.dataset_split),
    dimensionScores: z.record(z.number()).optional().parse(parseJson(z.string().parse(row.dimension_scores_json))),
    evaluatorFingerprint: z.string().parse(row.evaluator_fingerprint),
    genreTags: z.array(z.string()).parse(parseJson(z.string().parse(row.genre_tags_json))),
    id: z.string().parse(row.id),
    intentTags: z.array(z.string()).parse(parseJson(z.string().parse(row.intent_tags_json))),
    mediaId: z.string().parse(row.media_id),
    notes: z.union([z.string(), z.null()]).parse(row.notes),
    overallScore: z.number().parse(row.overall_score),
    reviewSchemaVersion: z.number().parse(row.review_schema_version),
    runId: z.string().parse(row.run_id),
  };
}

const REVIEW_SELECT = `
  SELECT id, run_id, media_id, evaluator_fingerprint, review_schema_version,
    overall_score, confidence, dimension_scores_json, action_feedback_json,
    genre_tags_json, intent_tags_json, notes, calibration_eligible,
    dataset_split, created_at
  FROM evaluation_reviews
`;

function validateInput(input: PersistedEvaluationInput) {
  if (!/^[a-f0-9]{64}$/i.test(input.media.contentSha256)) {
    throw new Error("Media content SHA-256 must contain 64 hexadecimal characters.");
  }
  if (!Number.isSafeInteger(input.media.byteLength) || input.media.byteLength < 0) {
    throw new Error("Media byte length must be a non-negative safe integer.");
  }
  if (!input.run.evaluatorFingerprint.trim()) {
    throw new Error("Evaluator fingerprint is required.");
  }
  validateScore(input.run.overallScore, "Overall score");
  validateConfidence(input.run.confidence, "Overall confidence");
  for (const dimension of input.dimensions ?? []) {
    validateScore(dimension.score, `Dimension ${dimension.id} score`);
    validateConfidence(dimension.confidence, `Dimension ${dimension.id} confidence`);
  }
  for (const metric of input.metrics ?? []) {
    validateScore(metric.score, `Metric ${metric.id} score`);
    validateConfidence(metric.confidence, `Metric ${metric.id} confidence`);
  }
  for (const series of input.series ?? []) {
    if (series.values.length > MAX_SERIES_POINTS) {
      throw new Error(`Time series ${series.id} exceeds ${MAX_SERIES_POINTS} points.`);
    }
    if (series.timestamps && series.timestamps.length !== series.values.length) {
      throw new Error(`Time series ${series.id} timestamps and values must have equal length.`);
    }
  }
}

function readRun(db: Database, runId: string) {
  const row = z.union([z.record(z.unknown()), z.null()]).parse(db.query(`
    SELECT r.id, r.media_id, r.display_name, r.status, r.evaluator_fingerprint,
      r.overall_score, r.confidence, r.result_json, r.error_json,
      r.started_at, r.finished_at, s.source_path, m.content_sha256, m.kind,
      m.byte_length, m.duration_seconds, m.original_sample_rate, m.channel_count,
      m.codec, m.estimated_bitrate_kbps
    FROM evaluation_runs r
    JOIN media_assets m ON m.id = r.media_id
    JOIN source_locations s ON s.id = r.source_location_id
    WHERE r.id = ?
  `).get(runId));
  if (!row) {
    return null;
  }

  const dimensions = z.array(z.record(z.unknown())).parse(db.query(`
    SELECT dimension_id, score, confidence, valid, weight, contribution
    FROM dimension_results WHERE run_id = ? ORDER BY dimension_id
  `).all(runId));
  const metrics = z.array(z.record(z.unknown())).parse(db.query(`
    SELECT metric_id, dimension_id, score, confidence, valid, weight,
      contribution, evidence_json, diagnosis
    FROM metric_results WHERE run_id = ? ORDER BY metric_id
  `).all(runId));
  const series = z.array(z.record(z.unknown())).parse(db.query(`
    SELECT series_id, unit, start_seconds, step_seconds, point_count,
      timestamps_blob, values_blob, minimum, maximum
    FROM time_series WHERE run_id = ? ORDER BY series_id
  `).all(runId));

  const subjectiveAnnotation = readLatestSubjectiveAnnotation(db, z.string().parse(row.media_id));
  return {
    byteLength: z.number().parse(row.byte_length),
    channelCount: z.union([z.number(), z.null()]).parse(row.channel_count),
    codec: z.union([z.string(), z.null()]).parse(row.codec),
    confidence: z.union([z.number(), z.null()]).parse(row.confidence),
    contentSha256: z.string().parse(row.content_sha256),
    dimensions: dimensions.map((dimension) => ({
      confidence: z.number().parse(dimension.confidence),
      contribution: z.union([z.number(), z.null()]).parse(dimension.contribution),
      id: z.string().parse(dimension.dimension_id),
      score: z.union([z.number(), z.null()]).parse(dimension.score),
      valid: dimension.valid === 1,
      weight: z.number().parse(dimension.weight),
    })),
    durationSeconds: z.union([z.number(), z.null()]).parse(row.duration_seconds),
    error: parseJson(z.union([z.string(), z.null()]).parse(row.error_json)),
    estimatedBitrateKbps: z.union([z.number(), z.null()]).parse(row.estimated_bitrate_kbps),
    evaluatorFingerprint: z.string().parse(row.evaluator_fingerprint),
    finishedAt: z.string().parse(row.finished_at),
    kind: z.string().parse(row.kind),
    mediaId: z.string().parse(row.media_id),
    metrics: metrics.map((metric) => ({
      confidence: z.number().parse(metric.confidence),
      contribution: z.union([z.number(), z.null()]).parse(metric.contribution),
      diagnosis: z.union([z.string(), z.null()]).parse(metric.diagnosis),
      dimensionId: z.union([z.string(), z.null()]).parse(metric.dimension_id),
      evidence: parseJson(z.string().parse(metric.evidence_json)),
      id: z.string().parse(metric.metric_id),
      score: z.union([z.number(), z.null()]).parse(metric.score),
      valid: metric.valid === 1,
      weight: z.number().parse(metric.weight),
    })),
    originalSampleRate: z.union([z.number(), z.null()]).parse(row.original_sample_rate),
    overallScore: z.union([z.number(), z.null()]).parse(row.overall_score),
    report: parseJson(z.string().parse(row.result_json)),
    runId: z.string().parse(row.id),
    series: series.map((item) => ({
      id: z.string().parse(item.series_id),
      maximum: z.union([z.number(), z.null()]).parse(item.maximum),
      minimum: z.union([z.number(), z.null()]).parse(item.minimum),
      startSeconds: z.number().parse(item.start_seconds),
      stepSeconds: z.union([z.number(), z.null()]).parse(item.step_seconds),
      timestamps: item.timestamps_blob
        ? decodeTimeSeries(z.instanceof(Uint8Array).parse(item.timestamps_blob))
        : null,
      unit: z.string().parse(item.unit),
      values: decodeTimeSeries(z.instanceof(Uint8Array).parse(item.values_blob)),
    })),
    sourcePath: z.string().parse(row.source_path),
    startedAt: z.string().parse(row.started_at),
    status: z.string().parse(row.status),
    subjectiveAnnotation,
    subjectiveScore: subjectiveAnnotation?.score ?? null,
    title: z.string().parse(row.display_name),
  };
}

function readLatestSubjectiveAnnotation(db: Database, mediaId: string) {
  const row = z.union([z.record(z.unknown()), z.null()]).parse(db.query(`
    SELECT id, media_id, score, label, notes, created_at
    FROM subjective_annotations
    WHERE media_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get(mediaId));
  return row ? {
    createdAt: z.string().parse(row.created_at),
    id: z.string().parse(row.id),
    label: z.union([z.string(), z.null()]).parse(row.label),
    mediaId: z.string().parse(row.media_id),
    notes: z.union([z.string(), z.null()]).parse(row.notes),
    score: z.number().parse(row.score),
  } : null;
}

function listRunSummaries(db: Database, input: { readonly limit?: number; readonly mediaId?: string } = {}) {
  const limit = Math.min(500, Math.max(1, input.limit ?? 100));
  const rows = input.mediaId
    ? z.array(z.record(z.unknown())).parse(db.query(`
        SELECT r.id, r.media_id, r.display_name, r.status, r.evaluator_fingerprint,
          r.overall_score, r.confidence, r.finished_at, s.source_path,
          m.content_sha256, m.kind,
          (SELECT a.score FROM subjective_annotations a
            WHERE a.media_id = r.media_id
            ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS subjective_score
        FROM evaluation_runs r
        JOIN media_assets m ON m.id = r.media_id
        JOIN source_locations s ON s.id = r.source_location_id
        WHERE r.media_id = ?
        ORDER BY r.finished_at DESC, r.id DESC
        LIMIT ?
      `).all(input.mediaId, limit))
    : z.array(z.record(z.unknown())).parse(db.query(`
        SELECT r.id, r.media_id, r.display_name, r.status, r.evaluator_fingerprint,
          r.overall_score, r.confidence, r.finished_at, s.source_path,
          m.content_sha256, m.kind,
          (SELECT a.score FROM subjective_annotations a
            WHERE a.media_id = r.media_id
            ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS subjective_score
        FROM evaluation_runs r
        JOIN media_assets m ON m.id = r.media_id
        JOIN source_locations s ON s.id = r.source_location_id
        ORDER BY r.finished_at DESC, r.id DESC
        LIMIT ?
      `).all(limit));
  return rows.map((row) => ({
    confidence: z.union([z.number(), z.null()]).parse(row.confidence),
    contentSha256: z.string().parse(row.content_sha256),
    evaluatorFingerprint: z.string().parse(row.evaluator_fingerprint),
    finishedAt: z.string().parse(row.finished_at),
    kind: z.string().parse(row.kind),
    mediaId: z.string().parse(row.media_id),
    overallScore: z.union([z.number(), z.null()]).parse(row.overall_score),
    runId: z.string().parse(row.id),
    sourcePath: z.string().parse(row.source_path),
    status: z.string().parse(row.status),
    subjectiveScore: z.union([z.number(), z.null()]).parse(row.subjective_score),
    title: z.string().parse(row.display_name),
  }));
}

export function openEvaluationStore(options: {
  readonly dbPath: string;
  readonly migrationsDir?: string;
}) {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const db = new Database(options.dbPath, { create: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    applyMigrations(db, options.migrationsDir ?? MIGRATIONS_DIR);
    validateSchema(db);
  } catch (error) {
    db.close(false);
    throw error;
  }

  const saveEvaluation = (input: PersistedEvaluationInput) => {
    validateInput(input);
    const timestamp = nowIso();
    const runId = randomUUID();
    const normalizedPath = normalizeSourcePath(input.media.sourcePath);
    let mediaId = "";

    db.transaction(() => {
      const existingMedia = z.union([z.object({ id: z.string() }), z.null()]).parse(db.query("SELECT id FROM media_assets WHERE content_sha256 = ?")
        .get(input.media.contentSha256));
      mediaId = existingMedia?.id ?? randomUUID();
      if (!existingMedia) {
        db.query(`
          INSERT INTO media_assets (
            id, content_sha256, kind, byte_length, duration_seconds,
            original_sample_rate, channel_count, codec, estimated_bitrate_kbps,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          mediaId,
          input.media.contentSha256.toLowerCase(),
          input.media.kind,
          input.media.byteLength,
          input.media.durationSeconds ?? null,
          input.media.originalSampleRate ?? null,
          input.media.channelCount ?? null,
          input.media.codec ?? null,
          input.media.estimatedBitrateKbps ?? null,
          timestamp,
        );
      }

      const existingSource = z.union([z.object({ id: z.string() }), z.null()]).parse(db.query("SELECT id FROM source_locations WHERE normalized_path = ?")
        .get(normalizedPath));
      const sourceId = existingSource?.id ?? randomUUID();
      if (existingSource) {
        db.query(`
          UPDATE source_locations SET media_id = ?, source_path = ?, last_seen_at = ?
          WHERE id = ?
        `).run(mediaId, input.media.sourcePath, timestamp, sourceId);
      } else {
        db.query(`
          INSERT INTO source_locations (
            id, media_id, normalized_path, source_path, first_seen_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(sourceId, mediaId, normalizedPath, input.media.sourcePath, timestamp, timestamp);
      }

      db.query(`
        INSERT INTO evaluation_runs (
          id, media_id, source_location_id, display_name, status,
          evaluator_fingerprint, overall_score, confidence, result_json,
          error_json, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        mediaId,
        sourceId,
        input.media.displayName || basename(input.media.sourcePath),
        input.run.status ?? "completed",
        input.run.evaluatorFingerprint,
        input.run.overallScore,
        input.run.confidence,
        stringifyJson(input.run.report),
        input.run.error === undefined ? null : stringifyJson(input.run.error),
        input.run.startedAt ?? timestamp,
        input.run.finishedAt ?? timestamp,
      );

      const insertDimension = db.prepare(`
        INSERT INTO dimension_results (
          run_id, dimension_id, score, confidence, valid, weight, contribution
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        for (const dimension of input.dimensions ?? []) {
          insertDimension.run(
            runId, dimension.id, dimension.score, dimension.confidence,
            dimension.valid ? 1 : 0, dimension.weight, dimension.contribution ?? null,
          );
        }
      } finally {
        insertDimension.finalize();
      }

      const insertMetric = db.prepare(`
        INSERT INTO metric_results (
          run_id, metric_id, dimension_id, score, confidence, valid, weight,
          contribution, evidence_json, diagnosis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        for (const metric of input.metrics ?? []) {
          insertMetric.run(
            runId, metric.id, metric.dimensionId ?? null, metric.score,
            metric.confidence, metric.valid ? 1 : 0, metric.weight,
            metric.contribution ?? null, stringifyJson(metric.evidence),
            metric.diagnosis ?? null,
          );
        }
      } finally {
        insertMetric.finalize();
      }

      const insertSeries = db.prepare(`
        INSERT INTO time_series (
          run_id, series_id, unit, start_seconds, step_seconds, point_count,
          timestamps_blob, values_blob, minimum, maximum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        for (const series of input.series ?? []) {
          const { maximum, minimum } = seriesRange(series.values);
          insertSeries.run(
            runId, series.id, series.unit, series.startSeconds,
            series.stepSeconds ?? null, series.values.length,
            series.timestamps ? encodeTimeSeries(series.timestamps) : null,
            encodeTimeSeries(series.values), minimum, maximum,
          );
        }
      } finally {
        insertSeries.finalize();
      }
    }).immediate();

    return { mediaId, runId };
  };

  return {
    close() {
      db.close(false);
    },
    getRun(runId: string) {
      return readRun(db, runId);
    },
    findCompletedRun(contentSha256: string, evaluatorFingerprint: string) {
      const row = z.union([z.object({ id: z.string() }), z.null()]).parse(db.query(`
        SELECT r.id FROM evaluation_runs r
        JOIN media_assets m ON m.id = r.media_id
        WHERE m.content_sha256 = ? AND r.evaluator_fingerprint = ?
          AND r.status = 'completed'
        ORDER BY r.finished_at DESC, r.id DESC
        LIMIT 1
      `).get(contentSha256.toLowerCase(), evaluatorFingerprint));
      return row ? readRun(db, row.id) : null;
    },
    listRuns(options: { readonly limit?: number } = {}) {
      return listRunSummaries(db, options);
    },
    listTrackHistory(mediaId: string, options: { readonly limit?: number } = {}) {
      return listRunSummaries(db, { ...options, mediaId });
    },
    getLatestSubjectiveAnnotation(mediaId: string) {
      return readLatestSubjectiveAnnotation(db, mediaId);
    },
    getLatestReview(runId: string) {
      return mapReviewRow(z.union([z.record(z.unknown()), z.null()]).parse(db.query(`${REVIEW_SELECT}
        WHERE run_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
      `).get(runId)));
    },
    listReviews(runId: string, options: { readonly limit?: number } = {}) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 25));
      return (z.array(z.record(z.unknown())).parse(db.query(`${REVIEW_SELECT}
        WHERE run_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
      `).all(runId, limit))).map((row) => mapReviewRow(row)!);
    },
    saveReview(runId: string, input: EvaluationReviewInput) {
      const normalized = normalizeReviewInput(input);
      const run = z.union([z.object({ content_sha256: z.string(), evaluator_fingerprint: z.string(), media_id: z.string() }), z.null()]).parse(db.query(`
        SELECT r.media_id, r.evaluator_fingerprint, m.content_sha256
        FROM evaluation_runs r
        JOIN media_assets m ON m.id = r.media_id
        WHERE r.id = ?
      `).get(runId));
      if (!run) throw new Error(`Evaluation run does not exist: ${runId}`);
      const id = randomUUID();
      const createdAt = nowIso();
      const split = datasetSplit(run.content_sha256);
      db.query(`
        INSERT INTO evaluation_reviews (
          id, run_id, media_id, evaluator_fingerprint, review_schema_version,
          overall_score, confidence, dimension_scores_json, action_feedback_json,
          genre_tags_json, intent_tags_json, notes, calibration_eligible,
          dataset_split, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, runId, run.media_id, run.evaluator_fingerprint, REVIEW_SCHEMA_VERSION,
        normalized.overallScore, normalized.confidence,
        stringifyJson(normalized.dimensionScores), stringifyJson(normalized.actionFeedback),
        stringifyJson(normalized.genreTags), stringifyJson(normalized.intentTags),
        normalized.notes, normalized.calibrationEligible ? 1 : 0, split, createdAt,
      );
      return mapReviewRow(z.record(z.unknown()).parse(db.query(`${REVIEW_SELECT} WHERE id = ?`).get(id)))!;
    },
    exportReviewDataset(options: { readonly limit?: number; readonly split?: ReviewDatasetSplit } = {}) {
      if (options.split && !["train", "validation", "test"].includes(options.split)) {
        throw new Error(`Unknown review dataset split: ${options.split}.`);
      }
      const limit = Math.min(5_000, Math.max(1, options.limit ?? 5_000));
      const rows = z.array(z.record(z.unknown())).parse(db.query(`${REVIEW_SELECT}
        WHERE calibration_eligible = 1
        ${options.split ? "AND dataset_split = ?" : ""}
        ORDER BY created_at DESC, rowid DESC
      `).all(...(options.split ? [options.split] : [])));
      const mediaIds = new Set<string>();
      const examples = [];
      for (const row of rows) {
        const review = mapReviewRow(row)!;
        if (mediaIds.has(review.mediaId)) continue;
        mediaIds.add(review.mediaId);
        const run = readRun(db, review.runId);
        if (!run) continue;
        examples.push({
          dimensions: run.dimensions,
          evaluatorFingerprint: run.evaluatorFingerprint,
          media: {
            contentSha256: run.contentSha256,
            durationSeconds: run.durationSeconds,
            kind: run.kind,
          },
          metrics: run.metrics,
          modelOutput: {
            confidence: run.confidence,
            overallScore: run.overallScore,
          },
          review,
        });
        if (examples.length >= limit) break;
      }
      return examples;
    },
    reviewDatasetSummary() {
      const rows = z.array(z.record(z.unknown())).parse(db.query(`${REVIEW_SELECT}
        WHERE calibration_eligible = 1
        ORDER BY created_at DESC, rowid DESC
      `).all());
      const latestByMedia = new Map<string, NonNullable<ReturnType<typeof mapReviewRow>>>();
      for (const row of rows) {
        const review = mapReviewRow(row)!;
        if (!latestByMedia.has(review.mediaId)) latestByMedia.set(review.mediaId, review);
      }
      const reviews = [...latestByMedia.values()];
      const splitCounts = { train: 0, validation: 0, test: 0 };
      for (const review of reviews) splitCounts[review.datasetSplit] += 1;
      const scores = reviews.map((review) => review.overallScore);
      const scoreRange = scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0;
      const uniqueMedia = reviews.length;
      return {
        minimumUniqueMedia: 100,
        readyForCalibration: uniqueMedia >= 100
          && splitCounts.train >= 50
          && splitCounts.validation >= 10
          && splitCounts.test >= 10
          && scoreRange >= 0.4,
        reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
        scoreRange,
        splitCounts,
        uniqueMedia,
      };
    },
    saveSubjectiveAnnotation(mediaId: string, input: {
      readonly label?: string;
      readonly notes?: string;
      readonly score: number;
    }) {
      validateScore(input.score, "Subjective score");
      if (input.label && input.label.length > 80) {
        throw new Error("Subjective label must not exceed 80 characters.");
      }
      if (input.notes && input.notes.length > 4_000) {
        throw new Error("Subjective notes must not exceed 4000 characters.");
      }
      const id = randomUUID();
      db.query(`
        INSERT INTO subjective_annotations (id, media_id, score, label, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, mediaId, input.score, input.label ?? null, input.notes ?? null, nowIso());
      return readLatestSubjectiveAnnotation(db, mediaId)!;
    },
    saveEvaluation,
  };
}

export type EvaluationStore = ReturnType<typeof openEvaluationStore>;
