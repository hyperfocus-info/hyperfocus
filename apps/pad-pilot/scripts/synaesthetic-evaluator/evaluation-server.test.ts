import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEvaluationApp, evaluationListenOptions } from "./evaluation-server";
import { openEvaluationStore } from "./evaluation-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-server-"));
  temporaryDirectories.push(directory);
  const store = openEvaluationStore({ dbPath: join(directory, "evaluations.sqlite") });
  const saved = store.saveEvaluation({
    media: {
      byteLength: 10,
      contentSha256: "c".repeat(64),
      displayName: "Complete Full Filename.mp3",
      kind: "audio",
      sourcePath: "C:\\Music\\Complete Full Filename.mp3",
    },
    run: {
      confidence: 0.92,
      evaluatorFingerprint: "audio-v2",
      overallScore: 0.97,
      report: { overall: 0.97 },
    },
    series: [{ id: "loudness", startSeconds: 0, stepSeconds: 0.1, unit: "dBFS", values: [-10, -9] }],
  });
  return { app: createEvaluationApp({ dashboardDir: null, store }), directory, saved, store };
}

function createMediaFixture({ project = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-server-media-"));
  temporaryDirectories.push(directory);
  const sourcePath = join(directory, "Track.mp3");
  const projectPath = join(directory, "Track.flp");
  writeFileSync(sourcePath, "0123456789");
  if (project) writeFileSync(projectPath, "FL Studio project");
  const store = openEvaluationStore({ dbPath: join(directory, "evaluations.sqlite") });
  const saved = store.saveEvaluation({
    media: {
      byteLength: 10,
      contentSha256: "d".repeat(64),
      displayName: "Track.mp3",
      kind: "audio",
      sourcePath,
    },
    run: {
      confidence: 0.9,
      evaluatorFingerprint: "audio-v2",
      overallScore: 0.8,
      report: { overall: 0.8 },
    },
  });
  return { directory, projectPath, saved, sourcePath, store };
}

describe("evaluation server", () => {
  it("serves library, run detail, and browser routes without an evaluation mutation", async () => {
    const { app, saved, store } = createFixture();

    const libraryResponse = await app.handle(new Request("http://localhost/api/v1/library"));
    const library = await libraryResponse.json() as { runs: Array<{ displayName: string }> };
    expect(library.runs[0]?.displayName).toBe("Complete Full Filename.mp3");

    const detailResponse = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}`));
    const detail = await detailResponse.json() as { runId: string; sourcePath: string };
    expect(detail).toEqual(expect.objectContaining({
      runId: saved.runId,
      sourcePath: "C:\\Music\\Complete Full Filename.mp3",
    }));

    const seriesResponse = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/series?names=loudness`));
    const series = await seriesResponse.json() as Array<{ id: string; values: number[] }>;
    expect(series).toEqual([
      expect.objectContaining({ id: "loudness", values: [-10, -9] }),
    ]);

    const browserResponse = await app.handle(new Request(`http://localhost/runs/${saved.runId}`));
    expect(browserResponse.headers.get("content-type")).toContain("text/html");
    expect(await browserResponse.text()).toContain("Complete Full Filename.mp3");

    const mutationResponse = await app.handle(new Request("http://localhost/api/v1/evaluate", { method: "POST" }));
    expect(mutationResponse.status).toBe(404);
    store.close();
  });

  it("serves the built Solid dashboard assets for library and run routes", async () => {
    const { directory, saved, store } = createFixture();
    const dashboardDir = join(directory, "dashboard");
    mkdirSync(dashboardDir);
    writeFileSync(join(dashboardDir, "index.html"), "<!doctype html><title>Solid dashboard</title>");
    writeFileSync(join(dashboardDir, "dashboard.js"), "globalThis.dashboardLoaded = true;");
    const app = createEvaluationApp({ dashboardDir, store });

    const root = await app.handle(new Request("http://localhost/"));
    const run = await app.handle(new Request(`http://localhost/runs/${saved.runId}`));
    const script = await app.handle(new Request("http://localhost/dashboard.js"));

    expect(await root.text()).toContain("Solid dashboard");
    expect(await run.text()).toContain("Solid dashboard");
    expect(await script.text()).toContain("dashboardLoaded");
    store.close();
  });

  it("always binds the dashboard to loopback", () => {
    expect(evaluationListenOptions(4321)).toEqual({ hostname: "127.0.0.1", port: 4321 });
  });

  it("streams source audio, reruns evaluation, and opens a colocated FLP", async () => {
    const { projectPath, saved, sourcePath, store } = createMediaFixture({ project: true });
    const reanalyzed: string[] = [];
    const opened: string[] = [];
    const app = createEvaluationApp({
      dashboardDir: null,
      openProject: async (path) => opened.push(path),
      reanalyze: async (path) => {
        reanalyzed.push(path);
        return { runId: "rerun-id", status: "completed" as const };
      },
      store,
    });

    const detailResponse = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}`));
    const detail = await detailResponse.json() as { hasColocatedFlp: boolean; sourceAvailable: boolean };
    expect(detail).toEqual(expect.objectContaining({ hasColocatedFlp: true, sourceAvailable: true }));

    const audio = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/audio`, {
      headers: { range: "bytes=2-5" },
    }));
    expect(audio.status).toBe(206);
    expect(audio.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await audio.text()).toBe("2345");

    const reanalysis = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/reanalyze`, { method: "POST" }));
    expect(await reanalysis.json()).toEqual({ runId: "rerun-id", status: "completed" });
    expect(reanalyzed).toEqual([sourcePath]);

    const edit = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/edit`, { method: "POST" }));
    expect(await edit.json()).toEqual({ opened: true });
    expect(opened).toEqual([projectPath]);

    const crossOriginEdit = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/edit`, {
      headers: { origin: "https://attacker.example" },
      method: "POST",
    }));
    expect(crossOriginEdit.status).toBe(403);
    expect(opened).toEqual([projectPath]);
    store.close();
  });

  it("disables project editing when the same-stem FLP is absent", async () => {
    const { saved, store } = createMediaFixture();
    const opened: string[] = [];
    const app = createEvaluationApp({
      dashboardDir: null,
      openProject: async (path) => opened.push(path),
      store,
    });

    const libraryResponse = await app.handle(new Request("http://localhost/api/v1/library"));
    const library = await libraryResponse.json() as { runs: Array<{ hasColocatedFlp: boolean }> };
    expect(library.runs[0]?.hasColocatedFlp).toBeFalse();

    const edit = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/edit`, { method: "POST" }));
    expect(edit.status).toBe(409);
    expect(opened).toEqual([]);
    store.close();
  });

  it("accepts bounded same-origin reviews and exposes calibration-safe dataset metadata", async () => {
    const { app, saved, store } = createFixture();
    const reviewResponse = await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}/reviews`, {
      body: JSON.stringify({
        actionFeedback: [],
        calibrationEligible: true,
        confidence: 0.9,
        dimensionScores: { groove: 0.8 },
        genreTags: ["hip-hop"],
        intentTags: ["laid-back"],
        notes: "Intentional pocket.",
        overallScore: 0.96,
      }),
      headers: { "content-type": "application/json", origin: "http://localhost" },
      method: "POST",
    }));
    const review = await reviewResponse.json() as { overallScore: number; datasetSplit: string };
    expect(reviewResponse.status).toBe(201);
    expect(review.overallScore).toBe(0.96);
    expect(["train", "validation", "test"]).toContain(review.datasetSplit);

    const detail = await (await app.handle(new Request(`http://localhost/api/v1/runs/${saved.runId}`))).json() as { review: { notes: string } };
    expect(detail.review.notes).toBe("Intentional pocket.");

    const summary = await (await app.handle(new Request("http://localhost/api/v1/review-dataset/summary"))).json() as { uniqueMedia: number; readyForCalibration: boolean };
    expect(summary).toEqual(expect.objectContaining({ uniqueMedia: 1, readyForCalibration: false }));
    store.close();
  });
});
