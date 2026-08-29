import { expect, it } from "bun:test";
import { normalizeRun } from "./api";

it("normalizes persisted library rows without dropping full filenames", () => {
  const run = normalizeRun({
    runId: "run-1",
    title: "Tech N9ne - Sriracha (Feat. Logic & Joyner Lucas) 4.mp3",
    sourcePath: "C:\\Users\\MindOverMelee\\Downloads\\Tech N9ne - Sriracha (Feat. Logic & Joyner Lucas) 4.mp3",
    overallScore: 0.68,
    subjectiveScore: 0.68,
    confidence: 0.91,
  });

  expect(run.id).toBe("run-1");
  expect(run.displayName).toBe("Tech N9ne - Sriracha (Feat. Logic & Joyner Lucas) 4.mp3");
  expect(run.sourcePath).toEndWith("4.mp3");
  expect(run.overall).toBe(0.68);
  expect(run.subjectiveScore).toBe(0.68);
});

it("normalizes nullable metric scores as unavailable rather than zero", () => {
  const run = normalizeRun({
    runId: "run-2",
    title: "mono.mp3",
    metrics: [{
      metricId: "audio.mix.stereo-width",
      dimensionId: "soundQuality",
      score: null,
      confidence: 0,
      valid: false,
    }],
  });

  expect(run.metrics[0]?.score).toBeNull();
  expect(run.metrics[0]?.valid).toBe(false);
});

it("normalizes producer actions and safety reasons", () => {
  const run = normalizeRun({
    runId: "run-3",
    title: "clipped.mp3",
    actions: [{
      id: "safety.severe-clipping",
      priority: 1,
      severity: "critical",
      title: "Restore transient headroom",
      observation: "Sustained flat-top clipping detected.",
      impact: "Transient shape may be flattened.",
      steps: ["Lower limiter input."],
      verify: "Reanalyze and confirm cap clears.",
      confidence: 0.98,
    }],
    safetyChecks: [{ cap: 0.4, reasons: ["severe sustained clipping"] }],
  });

  expect(run.actions[0]?.title).toBe("Restore transient headroom");
  expect(run.actions[0]?.steps).toEqual(["Lower limiter input."]);
  expect(run.safetyChecks[0]?.reasons).toEqual(["severe sustained clipping"]);
});
