import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openEvaluationLibrary } from "./evaluation-library";
import { openEvaluationStore } from "./evaluation-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("evaluation library", () => {
  it("evaluates new content once, persists it, and reuses matching completed work", async () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-library-"));
    temporaryDirectories.push(directory);
    const audioPath = join(directory, "Full Song Name.mp3");
    writeFileSync(audioPath, new Uint8Array([1, 2, 3, 4]));
    let evaluations = 0;
    const library = openEvaluationLibrary({
      dashboardOrigin: "http://127.0.0.1:4567",
      dbPath: join(directory, "evaluations.sqlite"),
      evaluateMediaFile: async () => {
        evaluations += 1;
        return {
          kind: "audio",
          report: {
            audioSummary: { durationSeconds: 120 },
            confidence: 0.93,
            dimensions: {
              groove: { confidence: 0.9, score: 0.96, valid: true },
            },
            metrics: [{
              dimensionId: "groove",
              evidence: { pulse: 0.9 },
              id: "audio.rhythm.pulse_clarity",
              score: 0.95,
              confidence: 0.91,
              valid: true,
            }],
            overall: 0.94,
            timeline: {
              loudness: { startSeconds: 0, stepSeconds: 0.1, unit: "dBFS", values: [-10, -9] },
            },
          },
        };
      },
      evaluatorFingerprint: "audio-v2:test",
    });

    const [first] = await library.evaluateFiles([audioPath]);
    const [second] = await library.evaluateFiles([audioPath]);

    expect(evaluations).toBe(1);
    expect(first).toEqual(expect.objectContaining({
      overallScore: 0.94,
      reused: false,
      title: "Full Song Name.mp3",
    }));
    expect(first?.url).toBe(`http://127.0.0.1:4567/runs/${first?.runId}`);
    expect(second).toEqual(expect.objectContaining({
      reused: true,
      runId: first?.runId,
    }));
    library.close();
  });

  it("records failed attempts without caching them as successful evaluations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-library-failure-"));
    temporaryDirectories.push(directory);
    const audioPath = join(directory, "broken.mp3");
    writeFileSync(audioPath, new Uint8Array([9, 8, 7]));
    let evaluations = 0;
    const library = openEvaluationLibrary({
      dbPath: join(directory, "evaluations.sqlite"),
      evaluateMediaFile: async () => {
        evaluations += 1;
        throw new Error("decoder rejected input");
      },
      evaluatorFingerprint: "audio-v2:test-failure",
    });

    const [first] = await library.evaluateFiles([audioPath]);
    const [second] = await library.evaluateFiles([audioPath]);

    expect(evaluations).toBe(2);
    expect(first).toEqual(expect.objectContaining({ overallScore: null, status: "failed" }));
    expect(second?.runId).not.toBe(first?.runId);
    library.close();
  });

  it("attaches a listener score to newly evaluated and reused media", async () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-library-subjective-"));
    temporaryDirectories.push(directory);
    const audioPath = join(directory, "listener-reference.mp3");
    writeFileSync(audioPath, new Uint8Array([4, 3, 2, 1]));
    const library = openEvaluationLibrary({
      dbPath: join(directory, "evaluations.sqlite"),
      evaluateMediaFile: async () => ({ overall: 0.71 }),
      evaluatorFingerprint: "audio-v2:subjective-test",
    });

    const [first] = await library.evaluateFiles([audioPath], { subjectiveScore: 0.99 });
    const [second] = await library.evaluateFiles([audioPath], { subjectiveScore: 1 });

    expect(first).toEqual(expect.objectContaining({ reused: false, subjectiveScore: 0.99 }));
    expect(second).toEqual(expect.objectContaining({ reused: true, subjectiveScore: 1 }));
    library.close();
  });

  it("rejects an invalid listener score before touching media", async () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-library-invalid-score-"));
    temporaryDirectories.push(directory);
    const library = openEvaluationLibrary({ dbPath: join(directory, "evaluations.sqlite") });

    expect(library.evaluateFiles([join(directory, "missing.mp3")], { subjectiveScore: -0.1 }))
      .rejects.toThrow("Listener score must be a finite number from zero to one.");
    library.close();
  });

  it("persists v2 MIDI metrics instead of legacy skill metrics", async () => {
    const directory = mkdtempSync(join(tmpdir(), "padpilot-evaluation-library-midi-v2-"));
    temporaryDirectories.push(directory);
    const midiPath = join(directory, "phrase.mid");
    const dbPath = join(directory, "evaluations.sqlite");
    writeFileSync(midiPath, new Uint8Array([1, 2, 3]));
    const library = openEvaluationLibrary({
      dbPath,
      evaluatorFingerprint: "midi-v3:test",
      evaluateMediaFile: async () => ({
        kind: "midi" as const,
        report: {
          overall: 0.8,
          confidence: 0.9,
          dimensions: [{ id: "groove", score: 0.8, confidence: 0.9, coverage: 1 }],
          metrics: [{ name: "MetricCohesion", metric: { score: 0.1, justification: "legacy" } }],
          midiMetrics: [{
            id: "midi.rhythm.pulse-coherence",
            dimension: "groove",
            facet: "pulse",
            score: 0.8,
            confidence: 0.9,
            valid: true,
            status: "valid",
            evidence: [{ id: "grid-alignment", value: 0.84 }],
            summary: "PPQ-aware pulse evidence.",
          }],
        },
      }),
    });

    const [saved] = await library.evaluateFiles([midiPath]);
    library.close();
    const store = openEvaluationStore({ dbPath });
    const run = store.getRun(saved!.runId);
    store.close();

    expect(run?.metrics.map((metric) => metric.id)).toEqual(["midi.rhythm.pulse-coherence"]);
    expect(run?.metrics[0]?.diagnosis).toBe("PPQ-aware pulse evidence.");
  });
});
