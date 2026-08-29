import { describe, expect, test } from "bun:test";

import { analyzeAudioChannels, assessAudioSafety, scoreAudioFeatures } from "./audio-utils";

describe("analyzeAudioChannels", () => {
  test("preserves source metadata and keeps enough bandwidth for presence analysis", () => {
    const sampleRate = 44_100;
    const left = sineWave(sampleRate, 2, 55, 0.6);
    const right = sineWave(sampleRate, 2, 55, 0.6);
    const summary = analyzeAudioChannels([left, right], sampleRate);

    expect(summary.sourceSampleRate).toBe(sampleRate);
    expect(summary.sourceChannelCount).toBe(2);
    expect(summary.sampleRate).toBeGreaterThanOrEqual(32_000);
    expect(summary.perceptualBands.at(-1)?.highHz).toBeGreaterThanOrEqual(12_000);
    expect(summary.timeline.centroid.length).toBeGreaterThan(1);
    expect(summary.timeline.tension.length).toBeGreaterThan(1);
    expect(summary.timeline.dynamics.length).toBeGreaterThan(1);
    expect(summary.timeline.groovePulse.length).toBeGreaterThan(1);
    expect(summary.timeline.sectionScore.length).toBeGreaterThan(1);
  });

  test("suppresses out-of-band energy when downsampling high-rate sources", () => {
    const sourceRate = 96_000;
    const outOfBand = sineWave(sourceRate, 1, 30_000, 0.8);
    const summary = analyzeAudioChannels([outOfBand], sourceRate);

    expect(summary.sampleRate).toBe(48_000);
    expect(summary.rmsMean).toBeLessThan(0.03);
  });

  test("rejects digital silence through an explicit safety cap", () => {
    const summary = analyzeAudioChannels([new Float32Array(44_100)], 44_100);
    const safety = assessAudioSafety(summary);

    expect(summary.integratedLufs).toBeLessThan(-70);
    expect(summary.silenceRatio).toBe(1);
    expect(safety.cap).toBe(0);
    expect(safety.reasons).toContain("digital silence");
  });

  test("treats clean, rhythmic sub-bass as physical drive rather than missing presence", () => {
    const sampleRate = 44_100;
    const track = Float32Array.from({ length: sampleRate * 4 }, (_, index) => {
      const time = index / sampleRate;
      const pulse = Math.exp(-((time * 2) % 1) * 5);
      return Math.sin(Math.PI * 2 * 52 * time) * 0.72 * pulse
        + Math.sin(Math.PI * 2 * 1_500 * time) * 0.035;
    });
    const scores = scoreAudioFeatures(analyzeAudioChannels([track], sampleRate));
    const body = scores.find((metric) => metric.id === "audio.emotion.embodied-impact");
    const balance = scores.find((metric) => metric.id === "audio.mix.translation-readiness");

    expect(body?.score).toBeGreaterThan(0.6);
    expect(balance?.score).toBeGreaterThan(0.35);
  });

  test("keeps spectral motion stable across safe gain changes", () => {
    const sampleRate = 44_100;
    const render = (amplitude: number) => Float32Array.from({ length: sampleRate * 2 }, (_, index) => {
      const time = index / sampleRate;
      const envelope = 0.15 + 0.85 * Math.exp(-((time * 3) % 1) * 7);
      return Math.sin(Math.PI * 2 * 220 * time) * amplitude * envelope;
    });
    const quiet = analyzeAudioChannels([render(0.2)], sampleRate);
    const loud = analyzeAudioChannels([render(0.8)], sampleRate);

    expect(loud.spectralFlux).toBeCloseTo(quiet.spectralFlux, 4);
  });

  test("rejects stationary white noise as a pathological input", () => {
    let state = 0x12345678;
    const noise = Float32Array.from({ length: 44_100 * 2 }, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) | 0;
      return (state / 0x80000000) * 0.35;
    });
    const summary = analyzeAudioChannels([noise], 44_100);
    const safety = assessAudioSafety(summary);

    expect(summary.spectralFlatness).toBeGreaterThan(0.5);
    expect(safety.cap).toBeLessThanOrEqual(0.2);
    expect(safety.reasons).toContain("stationary noise");
  });

  test("keeps isolated mastered peaks advisory but caps sustained flat-top clipping", () => {
    const sampleRate = 44_100;
    const hotMaster = sineWave(sampleRate, 1, 997, 0.92);
    for (let index = 1_000; index < 1_010; index += 1) hotMaster[index] = 1.08;
    const hardClipped = Float32Array.from(sineWave(sampleRate, 1, 997, 1), (sample) => Math.max(-0.92, Math.min(0.92, sample * 1.8)));

    const hotSafety = assessAudioSafety(analyzeAudioChannels([hotMaster], sampleRate));
    const clippedSummary = analyzeAudioChannels([hardClipped], sampleRate);
    const clippedSafety = assessAudioSafety(clippedSummary);

    expect(hotSafety.cap).toBe(1);
    expect(hotSafety.reasons).toEqual([]);
    expect(clippedSummary.flatTopRate).toBeGreaterThan(0.01);
    expect(clippedSafety.cap).toBeLessThanOrEqual(0.4);
    expect(clippedSafety.reasons).toContain("severe sustained clipping");
  });

  test("v3 exposes one evidence-bearing vote per dimension", () => {
    const sampleRate = 44_100;
    const track = Float32Array.from({ length: sampleRate * 4 }, (_, index) => {
      const time = index / sampleRate;
      const pulse = Math.exp(-((time * 2) % 1) * 6);
      return Math.sin(Math.PI * 2 * 55 * time) * 0.5 * pulse
        + Math.sin(Math.PI * 2 * 440 * time) * 0.16;
    });

    const scores = scoreAudioFeatures(analyzeAudioChannels([track, track], sampleRate));

    expect(scores.map((metric) => metric.id)).toEqual([
      "audio.musical.tonal-intent",
      "audio.rhythm.pulse-coherence",
      "audio.structure.section-development",
      "audio.mix.translation-readiness",
      "audio.emotion.embodied-impact",
    ]);
    expect(new Set(scores.map((metric) => metric.dimension)).size).toBe(5);
    expect(scores.every((metric) => metric.status && metric.summary && metric.evidence)).toBe(true);
  });

  test("keeps low-frequency drive inside emotional impact instead of recasting it as other votes", () => {
    const sampleRate = 44_100;
    const base = analyzeAudioChannels([sineWave(sampleRate, 2, 220, 0.4)], sampleRate);
    const lean = scoreAudioFeatures({ ...base, lowEnergy: 0.04, bassEnergy: 0.05 });
    const embodied = scoreAudioFeatures({ ...base, lowEnergy: 0.48, bassEnergy: 0.3 });
    const scoreMap = (scores: ReturnType<typeof scoreAudioFeatures>) => new Map(scores.map((metric) => [metric.dimension, metric.score]));
    const leanScores = scoreMap(lean);
    const embodiedScores = scoreMap(embodied);

    expect(embodiedScores.get("emotionalImpact")).toBeGreaterThan(leanScores.get("emotionalImpact") ?? 0);
    for (const dimension of ["musicality", "groove", "structure", "soundQuality"] as const) {
      expect(embodiedScores.get(dimension)).toBe(leanScores.get(dimension));
    }
  });

  test("v3.1 keeps provisional estimator confidence below certainty", () => {
    const sampleRate = 44_100;
    const base = analyzeAudioChannels([sineWave(sampleRate, 2, 220, 0.4)], sampleRate);
    const scores = scoreAudioFeatures({ ...base, durationSeconds: 180, silenceRatio: 0 });

    expect(scores.filter((metric) => metric.valid).every((metric) => metric.confidence < 0.95)).toBeTrue();
  });

  test("v3.1 rewards distant recurrence with contrast without saturating plausible form", () => {
    const sampleRate = 44_100;
    const base = analyzeAudioChannels([sineWave(sampleRate, 2, 220, 0.4)], sampleRate);
    const sections = [
      { startSeconds: 0, endSeconds: 8, label: "A", score: 0.6 },
      { startSeconds: 8, endSeconds: 16, label: "B", score: 0.8 },
      { startSeconds: 16, endSeconds: 24, label: "A", score: 0.65 },
    ];
    const staticScore = scoreAudioFeatures({
      ...base,
      durationSeconds: 24,
      sectionContrast: 0.01,
      sections,
      selfSimilarity: [[1, 0.999, 0.999], [0.999, 1, 0.999], [0.999, 0.999, 1]],
    }).find((metric) => metric.dimension === "structure")?.score;
    const developedScore = scoreAudioFeatures({
      ...base,
      durationSeconds: 24,
      sectionContrast: 0.42,
      sections,
      selfSimilarity: [[1, 0.42, 0.96], [0.42, 1, 0.45], [0.96, 0.45, 1]],
    }).find((metric) => metric.dimension === "structure")?.score;

    expect(developedScore).toBeGreaterThan(staticScore ?? 0);
    expect(developedScore).toBeLessThan(0.98);
  });
});

function sineWave(sampleRate: number, seconds: number, frequency: number, amplitude: number) {
  return Float32Array.from({ length: sampleRate * seconds }, (_, index) => (
    Math.sin(Math.PI * 2 * frequency * index / sampleRate) * amplitude
  ));
}
