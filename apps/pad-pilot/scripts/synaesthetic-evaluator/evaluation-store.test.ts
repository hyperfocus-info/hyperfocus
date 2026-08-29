import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openEvaluationStore } from "./evaluation-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-store-"));
  temporaryDirectories.push(directory);
  return openEvaluationStore({ dbPath: join(directory, "evaluations.sqlite") });
}

describe("evaluation store", () => {
  it("persists one complete evaluation and reads its diagnostic detail", () => {
    const store = createStore();
    const saved = store.saveEvaluation({
      media: {
        byteLength: 12_345,
        contentSha256: "a".repeat(64),
        displayName: "Sriracha 320.mp3",
        durationSeconds: 181.25,
        kind: "audio",
        sourcePath: "C:\\Music\\Sriracha 320.mp3",
      },
      run: {
        confidence: 0.91,
        evaluatorFingerprint: "audio-v2:abcdef",
        overallScore: 0.94,
        report: { schemaVersion: 2, strengths: ["clear pulse"] },
      },
      dimensions: [{ confidence: 0.9, id: "groove", score: 0.96, valid: true, weight: 1 }],
      metrics: [{
        confidence: 0.92,
        dimensionId: "groove",
        evidence: { pulseClarity: 0.88 },
        id: "audio.rhythm.pulse_clarity",
        score: 0.95,
        valid: true,
        weight: 1,
      }],
      series: [{ id: "spectral-centroid", startSeconds: 0, stepSeconds: 0.1, unit: "Hz", values: [100, 200.5, 300] }],
    });

    const detail = store.getRun(saved.runId);

    expect(detail?.title).toBe("Sriracha 320.mp3");
    expect(detail?.sourcePath).toBe("C:\\Music\\Sriracha 320.mp3");
    expect(detail?.overallScore).toBe(0.94);
    expect(detail?.dimensions).toEqual([
      expect.objectContaining({ id: "groove", score: 0.96, valid: true }),
    ]);
    expect(detail?.metrics).toEqual([
      expect.objectContaining({ id: "audio.rhythm.pulse_clarity", evidence: { pulseClarity: 0.88 } }),
    ]);
    expect(detail?.series).toEqual([
      expect.objectContaining({ id: "spectral-centroid", unit: "Hz", values: [100, 200.5, 300] }),
    ]);
    store.close();
  });

  it("deduplicates media bytes while preserving immutable run history and source names", () => {
    const store = createStore();
    const contentSha256 = "b".repeat(64);
    const first = store.saveEvaluation({
      media: {
        byteLength: 100,
        contentSha256,
        displayName: "Sriracha 128.mp3",
        kind: "audio",
        sourcePath: "C:\\Music\\Sriracha 128.mp3",
      },
      run: {
        confidence: 0.8,
        evaluatorFingerprint: "audio-v2",
        finishedAt: "2026-08-27T10:00:00.000Z",
        overallScore: 0.68,
        report: {},
      },
    });
    const second = store.saveEvaluation({
      media: {
        byteLength: 100,
        contentSha256,
        displayName: "renamed-copy.mp3",
        kind: "audio",
        sourcePath: "D:\\Copies\\renamed-copy.mp3",
      },
      run: {
        confidence: 0.9,
        evaluatorFingerprint: "audio-v3",
        finishedAt: "2026-08-27T11:00:00.000Z",
        overallScore: 0.91,
        report: {},
      },
    });

    expect(second.mediaId).toBe(first.mediaId);
    expect(store.findCompletedRun(contentSha256, "audio-v2")?.runId).toBe(first.runId);
    expect(store.listTrackHistory(first.mediaId).map((run) => run.runId)).toEqual([
      second.runId,
      first.runId,
    ]);
    expect(store.listRuns().map((run) => run.title)).toEqual([
      "renamed-copy.mp3",
      "Sriracha 128.mp3",
    ]);
    store.close();
  });

  it("refuses to open a database whose migrations do not establish the storage contract", () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-schema-"));
    temporaryDirectories.push(directory);
    const migrationsDir = join(directory, "migrations");
    mkdirSync(migrationsDir);
    writeFileSync(join(migrationsDir, "001-initial.sql"), "CREATE TABLE unrelated (id TEXT PRIMARY KEY);");
    let opened: ReturnType<typeof openEvaluationStore> | undefined;

    expect(() => {
      opened = openEvaluationStore({
        dbPath: join(directory, "evaluations.sqlite"),
        migrationsDir,
      });
    }).toThrow("schema is incomplete");
    opened?.close();
  });

  it("keeps the latest subjective listener score with the media asset", () => {
    const store = createStore();
    const saved = store.saveEvaluation({
      media: {
        byteLength: 10,
        contentSha256: "d".repeat(64),
        displayName: "listener-reference.mp3",
        kind: "audio",
        sourcePath: "C:\\Music\\listener-reference.mp3",
      },
      run: {
        confidence: 0.8,
        evaluatorFingerprint: "audio-v2",
        overallScore: 0.9,
        report: {},
      },
    });

    store.saveSubjectiveAnnotation(saved.mediaId, { score: 0.98 });

    expect(store.getLatestSubjectiveAnnotation(saved.mediaId)).toEqual(
      expect.objectContaining({ mediaId: saved.mediaId, score: 0.98 }),
    );
    expect(store.listRuns()[0]?.subjectiveScore).toBe(0.98);
    store.close();
  });

  it("persists immutable structured reviews and exports one leakage-safe example per media item", () => {
    const store = createStore();
    const saved = store.saveEvaluation({
      media: {
        byteLength: 10,
        contentSha256: "e".repeat(64),
        displayName: "reviewed-track.mp3",
        kind: "audio",
        sourcePath: "C:\\Music\\reviewed-track.mp3",
      },
      run: {
        confidence: 0.8,
        evaluatorFingerprint: "synaesthetic-evaluator-v3.1",
        overallScore: 0.7,
        report: {},
      },
      dimensions: [{ confidence: 0.7, id: "groove", score: 0.6, valid: true, weight: 1 }],
      metrics: [{ confidence: 0.7, dimensionId: "groove", evidence: { pulse: 0.4 }, id: "audio.rhythm.pulse-coherence", score: 0.6, valid: true, weight: 1 }],
    });
    const input = {
      actionFeedback: [{ actionId: "audio.rhythm.pulse-coherence", verdict: "helpful" as const }],
      calibrationEligible: true,
      confidence: 0.9,
      dimensionScores: { groove: 0.88 },
      genreTags: ["trap"],
      intentTags: ["loose-pocket"],
      notes: "Groove is intentionally behind the grid.",
      overallScore: 0.95,
    };

    const first = store.saveReview(saved.runId, input);
    const second = store.saveReview(saved.runId, { ...input, overallScore: 0.97 });
    const examples = store.exportReviewDataset({ split: first.datasetSplit });

    expect(store.listReviews(saved.runId).map((review) => review.id)).toEqual([second.id, first.id]);
    expect(store.getLatestReview(saved.runId)?.overallScore).toBe(0.97);
    expect(second.datasetSplit).toBe(first.datasetSplit);
    expect(examples).toHaveLength(1);
    expect(examples[0]).toEqual(expect.objectContaining({
      evaluatorFingerprint: "synaesthetic-evaluator-v3.1",
      review: expect.objectContaining({ overallScore: 0.97 }),
    }));
    expect(examples[0]?.metrics).toEqual([expect.objectContaining({ evidence: { pulse: 0.4 } })]);
    store.close();
  });
});
