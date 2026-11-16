import { asRecord } from "@hyperfocus/utilities/records";
import { z } from "zod";
import { spawnBackgroundProcess } from '@hyperfocus/desktop-runtime/process';
import { Elysia } from "elysia";
import { existsSync, lstatSync } from "node:fs";
import { extname, join, parse, resolve } from "node:path";

import { openEvaluationLibrary } from "./evaluation-library";
import { readBoundedStream } from "./bounded-fetch";
import { openEvaluationStore, type EvaluationStore } from "./evaluation-store";

const DEFAULT_PORT = 3217;
const MAX_REVIEW_BODY_BYTES = 65536;
const DEFAULT_DASHBOARD_DIR = resolve(import.meta.dir, "..", "..", "build", "synaesthetic-evaluator", "dashboard");
const AUDIO_CONTENT_TYPES = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
]);

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dashboardDocument(store: EvaluationStore, runId?: string) {
  const run = runId ? store.getRun(runId) : null;
  const title = run?.title ?? "Synaesthetic Evaluations";
  const body = run
    ? `<p><a href="/">All evaluations</a></p>
       <h1>${escapeHtml(run.title)}</h1>
       <p>Score: ${run.overallScore === null ? "unavailable" : run.overallScore.toFixed(3)}</p>
       <p>Confidence: ${run.confidence === null ? "unavailable" : run.confidence.toFixed(3)}</p>
       <p><code>${escapeHtml(run.sourcePath)}</code></p>
       <p><a href="/api/v1/runs/${encodeURIComponent(run.runId)}">JSON detail</a></p>`
    : `<h1>Synaesthetic Evaluations</h1>
       <ul>${store.listRuns({ limit: 500 }).map((item) =>
         `<li><a href="/runs/${encodeURIComponent(item.runId)}">${escapeHtml(item.title)}</a> — ${item.overallScore === null ? "unavailable" : item.overallScore.toFixed(3)}</li>`
       ).join("")}</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { margin: 2rem auto; max-width: 70rem; padding: 0 1rem; background: #0d0f12; color: #f2f5f8; }
    a { color: #7cc4ff; } li { margin: .6rem 0; } code { overflow-wrap: anywhere; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function reportObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? asRecord(value)
    : {};
}

function regularFile(path: string) {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() ? stat : null;
  } catch {
    return null;
  }
}

function colocatedProjectPath(sourcePath: string) {
  const source = parse(sourcePath);
  return join(source.dir, `${source.name}.flp`);
}

function runFiles(run: { readonly sourcePath: string }) {
  const source = regularFile(run.sourcePath);
  const projectPath = colocatedProjectPath(run.sourcePath);
  const project = regularFile(projectPath);
  return {
    hasColocatedFlp: project !== null,
    projectPath,
    source,
    sourceAvailable: source !== null,
  };
}

function parseByteRange(header: string, size: number) {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    return { end: size - 1, start: Math.max(0, size - suffixLength) };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null;
  }
  return { end: Math.min(size - 1, requestedEnd), start };
}

function audioResponse(run: { readonly sourcePath: string }, request: Request) {
  const source = regularFile(run.sourcePath);
  const contentType = AUDIO_CONTENT_TYPES.get(extname(run.sourcePath).toLowerCase());
  if (!source || !contentType) {
    return json({ error: { code: "audio_not_found", message: "Playable source audio is unavailable." } }, 404);
  }
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-type": contentType,
  };
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    return new Response(Bun.file(run.sourcePath), {
      headers: { ...headers, "content-length": String(source.size) },
    });
  }
  const range = parseByteRange(rangeHeader, source.size);
  if (!range) {
    return new Response(null, {
      headers: { ...headers, "content-range": `bytes */${source.size}` },
      status: 416,
    });
  }
  return new Response(Bun.file(run.sourcePath).slice(range.start, range.end + 1), {
    headers: {
      ...headers,
      "content-length": String(range.end - range.start + 1),
      "content-range": `bytes ${range.start}-${range.end}/${source.size}`,
    },
    status: 206,
  });
}

function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function boundedJsonObject(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_REVIEW_BODY_BYTES) {
      throw new Error(`Review body must not exceed ${MAX_REVIEW_BODY_BYTES} bytes.`);
    }
  }
  const bytes = await readBoundedStream(request.body, MAX_REVIEW_BODY_BYTES, "Review body");
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Review body must be a JSON object.");
  }
  return asRecord(value);
}

async function openProjectFile(projectPath: string) {
  const command = process.platform === "win32"
    ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $args[0]", projectPath]
    : process.platform === "darwin" ? ["open", projectPath] : ["xdg-open", projectPath];
  const child = spawnBackgroundProcess({ cmd: command, ...({
    stderr: "ignore",
    stdin: "ignore",
    stdout: "ignore",
    windowsHide: process.platform === "win32",
  }) });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`Project launcher exited with code ${exitCode}.`);
}

function dashboardRun(
  run: NonNullable<ReturnType<EvaluationStore["getRun"]>>,
  review: ReturnType<EvaluationStore["getLatestReview"]>,
) {
  const report = reportObject(run.report);
  const audioSummary = reportObject(report.audioSummary);
  const perceptualBands = Array.isArray(audioSummary.perceptualBands) ? audioSummary.perceptualBands : [];
  const observations = {
    ...reportObject(report.observations),
    erbProfile: perceptualBands.flatMap((band) => {
      const value = reportObject(band).share;
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    }),
    selfSimilarity: Array.isArray(audioSummary.selfSimilarity) ? audioSummary.selfSimilarity : undefined,
  };
  const files = runFiles(run);
  return {
    channelCount: run.channelCount,
    confidence: run.confidence,
    dimensions: run.dimensions,
    displayName: run.title,
    estimatedBitrateKbps: run.estimatedBitrateKbps,
    evaluatedAt: run.finishedAt,
    evaluatorFingerprint: run.evaluatorFingerprint,
    hasColocatedFlp: files.hasColocatedFlp,
    id: run.runId,
    mediaId: run.mediaId,
    metrics: run.metrics,
    actions: Array.isArray(report.actions) ? report.actions : [],
    observations,
    originalSampleRate: run.originalSampleRate,
    overall: run.overallScore,
    uncappedOverall: typeof report.uncappedOverall === "number" && Number.isFinite(report.uncappedOverall)
      ? report.uncappedOverall
      : run.overallScore,
    review,
    runId: run.runId,
    safetyChecks: Array.isArray(report.safetyChecks)
      ? report.safetyChecks
      : Array.isArray(report.safetyCaps)
        ? report.safetyCaps
        : Object.keys(reportObject(report.safety)).length > 0 ? [report.safety] : [],
    sections: Array.isArray(report.sections)
      ? report.sections
      : Array.isArray(audioSummary.sections) ? audioSummary.sections : [],
    series: run.series,
    sourcePath: run.sourcePath,
    sourceAvailable: files.sourceAvailable,
    status: run.status,
    subjectiveScore: run.subjectiveScore,
    strengths: Array.isArray(report.strengths) ? report.strengths : [],
    weaknesses: Array.isArray(report.weaknesses) ? report.weaknesses : [],
  };
}

function dashboardSummary(run: ReturnType<EvaluationStore["listRuns"]>[number]) {
  const files = runFiles(run);
  return {
    confidence: run.confidence,
    displayName: run.title,
    evaluatedAt: run.finishedAt,
    evaluatorFingerprint: run.evaluatorFingerprint,
    hasColocatedFlp: files.hasColocatedFlp,
    id: run.runId,
    mediaId: run.mediaId,
    overall: run.overallScore,
    sourcePath: run.sourcePath,
    sourceAvailable: files.sourceAvailable,
    status: run.status,
    subjectiveScore: run.subjectiveScore,
  };
}

function dashboardAsset(dashboardDir: string | null, fileName: string, contentType: string) {
  if (!dashboardDir) return null;
  const filePath = join(dashboardDir, fileName);
  if (!existsSync(filePath)) return null;
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  return new Response(Bun.file(filePath), { headers: { "content-type": contentType } });
}

export function evaluationListenOptions(port = DEFAULT_PORT) {
  return { hostname: "127.0.0.1", port } as const;
}

export function createEvaluationApp(options: {
  readonly dashboardDir?: string | null;
  readonly openProject?: (projectPath: string) => Promise<unknown> | unknown;
  readonly reanalyze?: (sourcePath: string) => Promise<unknown>;
  readonly store: EvaluationStore;
}) {
  const store = options.store;
  const dashboardDir = options.dashboardDir === undefined ? DEFAULT_DASHBOARD_DIR : options.dashboardDir;
  return new Elysia()
    .onError(({ code }) => {
      if (code === "NOT_FOUND") {
        return json({ error: { code: "route_not_found", message: "Evaluation route not found." } }, 404);
      }
      return json({ error: { code: "internal_error", message: "Evaluation request failed." } }, 500);
    })
    .get("/api/v1/library", ({ query }) => {
      const requested = Number(query.limit);
      const limit = Number.isSafeInteger(requested) ? requested : undefined;
      return json({ runs: store.listRuns({ limit }).map(dashboardSummary) });
    })
    .get("/api/v1/runs/:runId/series", ({ params, query }) => {
      const run = store.getRun(params.runId);
      if (!run) {
        return json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
      }
      const names = typeof query.names === "string" && query.names.trim()
        ? query.names.split(",").map((name) => name.trim()).filter(Boolean)
        : [];
      if (names.length > 16 || names.some((name) => name.length > 80)) {
        return json({ error: { code: "invalid_series_query", message: "Too many or invalid series names." } }, 400);
      }
      const selected = names.length === 0
        ? run.series
        : run.series.filter((item) => names.includes(item.id));
      return json(selected);
    })
    .get("/api/v1/runs/:runId", ({ params }) => {
      const run = store.getRun(params.runId);
      return run
        ? json(dashboardRun(run, store.getLatestReview(run.runId)))
        : json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
    })
    .get("/api/v1/runs/:runId/reviews", ({ params, query }) => {
      if (!store.getRun(params.runId)) {
        return json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
      }
      const requested = Number(query.limit);
      const limit = Number.isSafeInteger(requested) ? requested : undefined;
      return json({ reviews: store.listReviews(params.runId, { limit }) });
    })
    .post("/api/v1/runs/:runId/reviews", async ({ params, request }) => {
      if (!sameOriginMutation(request)) {
        return json({ error: { code: "origin_forbidden", message: "Cross-origin evaluation mutations are forbidden." } }, 403);
      }
      if (!store.getRun(params.runId)) {
        return json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
      }
      try {
        const input = await boundedJsonObject(request);
        return json(store.saveReview(params.runId, reviewInputSchema.parse(input)), 201);
      } catch (error) {
        return json({
          error: {
            code: "invalid_review",
            message: error instanceof Error ? error.message : "Review input is invalid.",
          },
        }, 400);
      }
    })
    .get("/api/v1/runs/:runId/audio", ({ params, request }) => {
      const run = store.getRun(params.runId);
      return run
        ? audioResponse(run, request)
        : json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
    })
    .post("/api/v1/runs/:runId/reanalyze", async ({ params, request }) => {
      if (!sameOriginMutation(request)) {
        return json({ error: { code: "origin_forbidden", message: "Cross-origin evaluation mutations are forbidden." } }, 403);
      }
      const run = store.getRun(params.runId);
      if (!run) return json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
      if (!regularFile(run.sourcePath)) {
        return json({ error: { code: "source_not_found", message: "Evaluation source file is unavailable." } }, 409);
      }
      if (!options.reanalyze) {
        return json({ error: { code: "reanalysis_unavailable", message: "Reanalysis service is unavailable." } }, 503);
      }
      try {
        return json(await options.reanalyze(run.sourcePath));
      } catch (error) {
        return json({
          error: {
            code: "reanalysis_failed",
            message: error instanceof Error ? error.message : "Reanalysis failed.",
          },
        }, 500);
      }
    })
    .post("/api/v1/runs/:runId/edit", async ({ params, request }) => {
      if (!sameOriginMutation(request)) {
        return json({ error: { code: "origin_forbidden", message: "Cross-origin evaluation mutations are forbidden." } }, 403);
      }
      const run = store.getRun(params.runId);
      if (!run) return json({ error: { code: "run_not_found", message: "Evaluation run not found." } }, 404);
      const files = runFiles(run);
      if (!files.hasColocatedFlp) {
        return json({ error: { code: "project_not_found", message: "Same-stem FL Studio project is unavailable." } }, 409);
      }
      try {
        await (options.openProject ?? openProjectFile)(files.projectPath);
        return json({ opened: true });
      } catch (error) {
        return json({
          error: {
            code: "project_open_failed",
            message: error instanceof Error ? error.message : "FL Studio project could not be opened.",
          },
        }, 500);
      }
    })
    .get("/api/v1/tracks/:mediaId/history", ({ params, query }) => {
      const requested = Number(query.limit);
      const limit = Number.isSafeInteger(requested) ? requested : undefined;
      return json({ runs: store.listTrackHistory(params.mediaId, { limit }) });
    })
    .get("/api/v1/review-dataset/summary", () => json(store.reviewDatasetSummary()))
    .get("/api/v1/review-dataset", ({ query }) => {
      const split = typeof query.split === "string" && query.split
        ? query.split
        : undefined;
      if (split !== undefined && split !== "train" && split !== "validation" && split !== "test") {
        return json({ error: { code: "invalid_dataset_split", message: "Dataset split must be train, validation, or test." } }, 400);
      }
      const requested = Number(query.limit);
      const limit = Number.isSafeInteger(requested) ? requested : undefined;
      return json({ examples: store.exportReviewDataset({ limit, split }), summary: store.reviewDatasetSummary() });
    })
    .get("/runs/:runId", ({ params }) => {
      const run = store.getRun(params.runId);
      if (!run) {
        return new Response("Evaluation run not found.", { status: 404 });
      }
      return dashboardAsset(dashboardDir, "index.html", "text/html; charset=utf-8")
        ?? new Response(dashboardDocument(store, params.runId), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
    })
    .get("/dashboard.js", () => dashboardAsset(dashboardDir, "dashboard.js", "text/javascript; charset=utf-8")
      ?? new Response("Dashboard asset not found.", { status: 404 }))
    .get("/dashboard.css", () => dashboardAsset(dashboardDir, "dashboard.css", "text/css; charset=utf-8")
      ?? new Response("Dashboard asset not found.", { status: 404 }))
    .get("/dashboard.js.map", () => dashboardAsset(dashboardDir, "dashboard.js.map", "application/json; charset=utf-8")
      ?? new Response("Dashboard asset not found.", { status: 404 }))
    .get("/", () => dashboardAsset(dashboardDir, "index.html", "text/html; charset=utf-8")
      ?? new Response(dashboardDocument(store), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
}

export function serveEvaluationDashboard(options: {
  readonly dbPath: string;
  readonly port?: number;
}) {
  const store = openEvaluationStore({ dbPath: options.dbPath });
  const library = openEvaluationLibrary({ dbPath: options.dbPath });
  let reanalysisQueue = Promise.resolve();
  const reanalyze = (sourcePath: string) => {
    const pending = reanalysisQueue.then(async () => {
      const [result] = await library.evaluateFiles([sourcePath], { force: true });
      if (!result) throw new Error("Reanalysis did not produce a run.");
      return result;
    });
    reanalysisQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const app = createEvaluationApp({ reanalyze, store });
  app.listen(evaluationListenOptions(options.port));
  return {
    app,
    async stop() {
      await app.stop();
      library.close();
      store.close();
    },
  };
}

const reviewInputSchema = z.object({ actionFeedback: z.array(z.object({ actionId: z.string(), verdict: z.enum(["helpful", "wrong", "intentional", "fixed"]) })).optional(), calibrationEligible: z.boolean(), confidence: z.number(), dimensionScores: z.record(z.number()).optional(), genreTags: z.array(z.string()).optional(), intentTags: z.array(z.string()).optional(), notes: z.string().optional(), overallScore: z.number() });
