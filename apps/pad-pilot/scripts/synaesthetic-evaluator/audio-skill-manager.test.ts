import { describe, expect, test } from "bun:test";

import { AudioSkillManager } from "./audio-skill-manager";
import { analyzeAudioChannels } from "./audio-utils";

describe("AudioSkillManager", () => {
  test("returns medium-specific evidence grouped into confidence-aware dimensions", async () => {
    const sampleRate = 44_100;
    const signal = Float32Array.from({ length: sampleRate * 2 }, (_, index) => {
      const time = index / sampleRate;
      const pulse = index % Math.round(sampleRate * 0.5) < 1_800 ? 1 : 0.18;
      return Math.sin(Math.PI * 2 * 55 * time) * 0.55 * pulse
        + Math.sin(Math.PI * 2 * 880 * time) * 0.12;
    });
    const report = await new AudioSkillManager().evaluate(analyzeAudioChannels([signal, signal], sampleRate));

    expect(report.metrics.every((metric) => metric.id.startsWith("audio."))).toBe(true);
    expect(report.metrics.every((metric) => metric.assessment.evidence)).toBe(true);
    expect(Object.keys(report.dimensions)).toEqual([
      "musicality",
      "groove",
      "structure",
      "soundQuality",
      "emotionalImpact",
    ]);
    expect(report.successScore).toBe(report.overall);
    expect(report.uncappedOverall).toBeGreaterThanOrEqual(report.overall);
    expect(report.strengths.length + report.weaknesses.length).toBeGreaterThan(0);
    expect(new Set([...report.strengths, ...report.weaknesses].map((entry) => entry.id)).size)
      .toBe(report.strengths.length + report.weaknesses.length);
  });

  test("puts hard safety faults first and emits no more than three producer actions", async () => {
    const sampleRate = 44_100;
    const signal = Float32Array.from({ length: sampleRate * 2 }, (_, index) => (
      Math.sin(Math.PI * 2 * 110 * index / sampleRate) * 0.7
    ));
    const summary = analyzeAudioChannels([signal, signal], sampleRate);
    const report = await new AudioSkillManager().evaluate({
      ...summary,
      clippingRate: 0.08,
      flatTopRate: 0.002,
    });

    expect(report.overall).toBe(0.4);
    expect(report.actions.length).toBeGreaterThan(0);
    expect(report.actions.length).toBeLessThanOrEqual(3);
    expect(report.actions[0]).toEqual(expect.objectContaining({
      id: "safety.severe-clipping",
      severity: "critical",
      title: "Restore transient headroom",
    }));
    expect(report.actions[0]?.steps.length).toBeGreaterThan(0);
    expect(report.actions[0]?.verify).toContain("Reanalyze");
    expect(report.actions[0]?.focus).toEqual(expect.objectContaining({
      label: "strongest measured risk passage",
    }));
    expect(report.actions[0]?.focus?.endSeconds).toBeGreaterThan(report.actions[0]?.focus?.startSeconds ?? 0);
  });
});
