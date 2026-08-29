import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { rm, truncate } from "node:fs/promises";
import { join } from "node:path";

import { BiologicalTension } from "./skills/biological-tension";
import { CymaticStability } from "./skills/cymatic-stability";
import { BehaviorSynthesizer } from "./behavior-synthesizer";
import { evaluateMediaFile, evaluateMidiFile } from "./orchestrator";
import { SkillManager } from "./skill-manager";
import type { AudioSummary } from "./audio-utils";
import { AudioAnalyzer, AudioSkillManager } from "./audio-skill-manager";
import {
  MAX_MIDI_ACTIVE_NOTES,
  MAX_MIDI_EVENTS,
  MAX_MIDI_PITCH_BENDS,
  MAX_SIMULTANEITY_INTERVALS,
  summarizeMidi,
} from "./midi-utils";

const TEST_ROOT = join(process.cwd(), "build", "synaesthetic-evaluator-tests", String(Date.now()));

setDefaultTimeout(15_000);

afterAll(async () => {
  await rm(TEST_ROOT, { force: true, recursive: true });
});

describe("SynaestheticEvaluator", () => {
  test("parses raw MIDI note events into reusable summaries", () => {
    const summary = summarizeMidi(rawPhrase([60, 64, 67, 72], [96, 90, 88, 94]));

    expect(summary.noteCount).toBe(4);
    expect(summary.minNote).toBe(60);
    expect(summary.maxNote).toBe(72);
    expect(summary.velocityStdDev).toBeGreaterThan(2);
    expect(summary.pitchClassHistogram[0]).toBeGreaterThan(0);
  });

  test("uses Standard MIDI file PPQ division for density", () => {
    const summary = summarizeMidi(singleNoteSmf(960));

    expect(summary.ticksPerBeat).toBe(960);
    expect(summary.smpteTiming).toBe(false);
    expect(summary.noteCount).toBe(1);
    expect(summary.densityPerBeat).toBeCloseTo(1);
  });

  test("bounds dense simultaneous MIDI and event floods", () => {
    const startedAt = performance.now();
    const dense = summarizeMidi(denseChordSmf(MAX_MIDI_ACTIVE_NOTES + 1_024));
    expect(dense.noteCount).toBeLessThanOrEqual(MAX_MIDI_ACTIVE_NOTES);
    expect(dense.simultaneityIntervals).toHaveLength(MAX_SIMULTANEITY_INTERVALS);

    const pitchBendFlood = new Uint8Array((MAX_MIDI_EVENTS + 1_000) * 3);
    for (let offset = 0; offset < pitchBendFlood.length; offset += 3) {
      pitchBendFlood[offset] = 0xe0;
      pitchBendFlood[offset + 1] = 0;
      pitchBendFlood[offset + 2] = 64;
    }
    const flooded = summarizeMidi(pitchBendFlood);
    expect(flooded.pitchBends).toHaveLength(MAX_MIDI_PITCH_BENDS);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  test("BiologicalTension rates consonant fifths above tritone stress", async () => {
    const analyzer = new BiologicalTension();
    const consonant = await analyzer.evaluate(rawPhrase([60, 67, 72], [92, 88, 90]), {});
    const tense = await analyzer.evaluate(rawPhrase([60, 66, 72], [122, 120, 118]), {});

    expect(consonant.score).toBeGreaterThan(tense.score);
    expect(tense.justification).toContain("tritone");
  });

  test("CymaticStability prefers symmetric harmonic pitch mass", async () => {
    const analyzer = new CymaticStability();
    const stable = await analyzer.evaluate(rawPhrase([60, 67, 72, 55, 64], [88, 86, 84, 82, 80]), { tonicPitchClass: 0 });
    const noisy = await analyzer.evaluate(rawPhrase([61, 63, 66, 70, 73], [88, 86, 84, 82, 80]), { tonicPitchClass: 0 });

    expect(stable.score).toBeGreaterThan(noisy.score);
  });

  test("SkillManager hot reloads TypeScript skills from hash snapshots", async () => {
    const skillsDir = join(TEST_ROOT, "hot-reload", "skills");
    const cacheDir = join(TEST_ROOT, "hot-reload", "cache");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.25, "v1"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    const first = await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100]));

    await Bun.write(skillPath, tempSkillSource(0.75, "v2"));
    await manager.loadAll();
    const second = await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100]));

    expect(first.metrics).toHaveLength(1);
    expect(second.metrics).toHaveLength(1);
    expect(first.metrics[0]!.hash).not.toBe(second.metrics[0]!.hash);
    expect(first.successScore).toBeCloseTo(0.25);
    expect(second.successScore).toBeCloseTo(0.75);
  });

  test("SkillManager normalizes non-finite weights and times out stalled analyzers", async () => {
    const skillsDir = join(TEST_ROOT, "skill-limits", "skills");
    const cacheDir = join(TEST_ROOT, "skill-limits", "cache");
    await Bun.write(join(skillsDir, "nan-weight.ts"), nonFiniteWeightSkillSource());
    await Bun.write(join(skillsDir, "stalled.ts"), stalledSkillSource());

    const manager = new SkillManager({ skillsDir, cacheDir, skillTimeoutMs: 25 });
    await manager.loadAll();
    const startedAt = performance.now();
    const report = await manager.evaluate(rawPhrase([60], [90]));

    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0]!.weight).toBe(0);
    expect(report.successScore).toBe(0);
    expect(Number.isFinite(report.successScore)).toBe(true);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.error).toContain("timed out");
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  test("AudioSkillManager times out stalled analyzers and keeps finite weights", async () => {
    class FiniteMetric extends AudioAnalyzer {
      name = "FiniteMetric";
      weight = Number.POSITIVE_INFINITY;
      async evaluate() {
        return { score: 0.8, biologicalImpact: "valence" as const, justification: "bounded" };
      }
    }
    class StalledMetric extends AudioAnalyzer {
      name = "StalledMetric";
      weight = 1;
      async evaluate() {
        return await new Promise<never>(() => {});
      }
    }

    const manager = new AudioSkillManager({
      analyzers: [new FiniteMetric(), new StalledMetric()],
      skillTimeoutMs: 25,
    });
    const startedAt = performance.now();
    const report = await manager.evaluate(audioSummaryFixture({}));
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0]!.weight).toBe(0);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.error).toContain("timed out");
    expect(Number.isFinite(report.successScore)).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  test("BehaviorSynthesizer validates rewritten skills before import", async () => {
    const skillsDir = join(TEST_ROOT, "synthesizer", "skills");
    const cacheDir = join(TEST_ROOT, "synthesizer", "cache");
    const candidateDir = join(TEST_ROOT, "synthesizer", "candidates");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.8, "good"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    const synthesizer = new BehaviorSynthesizer({
      manager,
      allowUnsafeGeneratedCode: true,
      candidateDir,
      testTimeoutMs: 5_000,
      rewriteSkill: async () => tempSkillSource(0.9, "rewritten"),
    });

    const high = await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100]));
    await synthesizer.observe(high);
    await Bun.write(skillPath, tempSkillSource(0.2, "bad"));
    await manager.loadAll();
    const low = await manager.evaluate(rawPhrase([60, 66, 72], [120, 120, 120]));
    const update = await synthesizer.observe(low);
    const updated = await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100]));

    expect(update.status).toBe("updated");
    expect(updated.successScore).toBeCloseTo(0.9);
  });

  test("BehaviorSynthesizer rejects rewrites that fail semantic evaluation", async () => {
    const skillsDir = join(TEST_ROOT, "synthesizer-reject", "skills");
    const cacheDir = join(TEST_ROOT, "synthesizer-reject", "cache");
    const candidateDir = join(TEST_ROOT, "synthesizer-reject", "candidates");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.8, "good"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    const synthesizer = new BehaviorSynthesizer({
      manager,
      allowUnsafeGeneratedCode: true,
      candidateDir,
      testTimeoutMs: 5_000,
      rewriteSkill: async () => throwingSkillSource(),
    });

    const high = await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100]));
    await synthesizer.observe(high);
    await Bun.write(skillPath, tempSkillSource(0.2, "bad"));
    await manager.loadAll();
    const low = await manager.evaluate(rawPhrase([60, 66, 72], [120, 120, 120]));
    const update = await synthesizer.observe(low);

    expect(update.status).toBe("rejected");
    expect(await Bun.file(skillPath).text()).toContain("bad");
  });

  test("BehaviorSynthesizer terminates candidate semantics that do not return", async () => {
    const skillsDir = join(TEST_ROOT, "synthesizer-timeout", "skills");
    const cacheDir = join(TEST_ROOT, "synthesizer-timeout", "cache");
    const candidateDir = join(TEST_ROOT, "synthesizer-timeout", "candidates");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.8, "good"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    const synthesizer = new BehaviorSynthesizer({
      manager,
      allowUnsafeGeneratedCode: true,
      candidateDir,
      testTimeoutMs: 200,
      rewriteSkill: async () => hangingSkillSource(),
    });
    await synthesizer.observe(await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100])));
    await Bun.write(skillPath, tempSkillSource(0.2, "bad"));
    await manager.loadAll();

    const startedAt = performance.now();
    const update = await synthesizer.observe(await manager.evaluate(rawPhrase([60, 66, 72], [120, 120, 120])));
    expect(update.status).toBe("rejected");
    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(await Bun.file(skillPath).text()).toContain("bad");
  });

  test("BehaviorSynthesizer never requests or executes generated TypeScript without an unsafe opt-in", async () => {
    const skillsDir = join(TEST_ROOT, "synthesizer-safe-default", "skills");
    const cacheDir = join(TEST_ROOT, "synthesizer-safe-default", "cache");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.8, "good"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    let rewriteRequested = false;
    const synthesizer = new BehaviorSynthesizer({
      manager,
      rewriteSkill: async () => {
        rewriteRequested = true;
        return hangingSkillSource();
      },
    });
    await synthesizer.observe(await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100])));
    await Bun.write(skillPath, tempSkillSource(0.2, "bad"));
    await manager.loadAll();

    const update = await synthesizer.observe(await manager.evaluate(rawPhrase([60, 66, 72], [120, 120, 120])));
    expect(update.status).toBe("rejected");
    expect(update.detail).toContain("allowUnsafeGeneratedCode: true");
    expect(rewriteRequested).toBe(false);
    expect(await Bun.file(skillPath).text()).toContain("bad");
  });

  test("BehaviorSynthesizer rejects a skill source that grows beyond its read limit", async () => {
    const skillsDir = join(TEST_ROOT, "synthesizer-source-limit", "skills");
    const cacheDir = join(TEST_ROOT, "synthesizer-source-limit", "cache");
    const skillPath = join(skillsDir, "temp-skill.ts");
    await Bun.write(skillPath, tempSkillSource(0.8, "good"));

    const manager = new SkillManager({ skillsDir, cacheDir });
    await manager.loadAll();
    let rewriteRequested = false;
    const synthesizer = new BehaviorSynthesizer({
      manager,
      allowUnsafeGeneratedCode: true,
      rewriteSkill: async () => {
        rewriteRequested = true;
        return tempSkillSource(0.9, "rewritten");
      },
    });
    await synthesizer.observe(await manager.evaluate(rawPhrase([60, 64, 67], [80, 90, 100])));
    await Bun.write(skillPath, tempSkillSource(0.2, "bad"));
    await manager.loadAll();
    const low = await manager.evaluate(rawPhrase([60, 66, 72], [120, 120, 120]));
    await truncate(skillPath, 512 * 1024 + 1);

    await expect(synthesizer.observe(low)).rejects.toThrow("Skill source exceeded 524288 bytes");
    expect(rewriteRequested).toBe(false);
  });

  test("media router evaluates audio files through first-class audio path", async () => {
    const audioPath = join(TEST_ROOT, "audio", "harmonic-phrase.wav");
    await Bun.write(audioPath, harmonicPhraseWav());

    await expect(evaluateMidiFile(audioPath)).rejects.toThrow("evaluateAudioFile");
    const result = await evaluateMediaFile(audioPath);
    expect(result.kind).toBe("audio");
    if (result.kind !== "audio") {
      throw new Error("Expected audio result.");
    }

    expect(result.report.metrics).toHaveLength(5);
    expect(result.report.failures).toHaveLength(0);
    expect(result.report.audioSummary.durationSeconds).toBeGreaterThan(1.9);
    expect(result.report.successScore).toBeGreaterThanOrEqual(0);
    expect(result.report.successScore).toBeLessThanOrEqual(1);
    expect(result.report.metrics.map((entry) => entry.name)).toContain("TranslationReadiness");
  });

  test("MIDI file evaluation rejects oversized inputs before parsing", async () => {
    const midiPath = join(TEST_ROOT, "midi", "oversized.mid");
    await Bun.write(midiPath, new Uint8Array());
    await truncate(midiPath, 4 * 1024 * 1024 + 1);

    await expect(evaluateMidiFile(midiPath)).rejects.toThrow("MIDI input exceeded");
  });

  test("audio pulse coherence rewards pulsed energy over sustained tone", async () => {
    const pulsedPath = join(TEST_ROOT, "audio", "pulsed.wav");
    const sustainedPath = join(TEST_ROOT, "audio", "sustained.wav");
    await Bun.write(pulsedPath, harmonicPhraseWav());
    await Bun.write(sustainedPath, sustainedToneWav());

    const pulsed = await evaluateMediaFile(pulsedPath);
    const sustained = await evaluateMediaFile(sustainedPath);
    if (pulsed.kind !== "audio" || sustained.kind !== "audio") {
      throw new Error("Expected audio results.");
    }

    expect(pulsed.report.audioSummary.pulseClarity).toBeGreaterThan(sustained.report.audioSummary.pulseClarity);
    expect(metricScore(pulsed.report.metrics, "PulseCoherence")).toBeGreaterThan(metricScore(sustained.report.metrics, "PulseCoherence"));
  });

});

function rawPhrase(notes: readonly number[], velocities: readonly number[]) {
  const bytes: number[] = [];
  for (let index = 0; index < notes.length; index += 1) {
    bytes.push(0x90, notes[index] ?? 60, velocities[index] ?? 90);
  }
  for (const note of notes) {
    bytes.push(0x80, note, 0);
  }
  return new Uint8Array(bytes);
}

function singleNoteSmf(ticksPerBeat: number) {
  const track = [
    0x00, 0x90, 60, 100,
    ...vlq(ticksPerBeat), 0x80, 60, 0,
    0x00, 0xff, 0x2f, 0x00,
  ];
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff,
    ...track,
  ]);
}

function denseChordSmf(noteCount: number) {
  const track: number[] = [];
  for (let index = 0; index < noteCount; index += 1) {
    track.push(0x00, 0x90 | (index % 16), 36 + (index % 72), 100);
  }
  for (let index = 0; index < noteCount; index += 1) {
    track.push(0x00, 0x80 | (index % 16), 36 + (index % 72), 0);
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >>> 24) & 0xff,
    (track.length >>> 16) & 0xff,
    (track.length >>> 8) & 0xff,
    track.length & 0xff,
    ...track,
  ]);
}

function vlq(value: number) {
  const bytes = [value & 0x7f];
  let remaining = value >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return bytes;
}

function tempSkillSource(score: number, label: string) {
  return `
import { MIDIAnalyzer, metric } from "../base-analyzer";

export default new class TempSkill extends MIDIAnalyzer {
  name = "TempSkill";
  weight = 1;

  async evaluate() {
    return metric({
      score: ${score},
      biologicalImpact: "valence",
      justification: "${label}",
    });
  }
}();
`;
}

function nonFiniteWeightSkillSource() {
  return `
import { MIDIAnalyzer, metric } from "../base-analyzer";

export default new class NonFiniteWeightSkill extends MIDIAnalyzer {
  name = "NonFiniteWeightSkill";
  weight = Number.NaN;

  async evaluate() {
    return metric({ score: 1, biologicalImpact: "valence", justification: "finite" });
  }
}();
`;
}

function stalledSkillSource() {
  return `
import { MIDIAnalyzer } from "../base-analyzer";

export default new class StalledSkill extends MIDIAnalyzer {
  name = "StalledSkill";
  weight = 1;

  async evaluate() {
    return await new Promise(() => {});
  }
}();
`;
}

function throwingSkillSource() {
  return `
import { MIDIAnalyzer } from "../base-analyzer";

export default new class ThrowingSkill extends MIDIAnalyzer {
  name = "ThrowingSkill";
  weight = 1;

  async evaluate() {
    throw new Error("semantic failure");
  }
}();
`;
}

function hangingSkillSource() {
  return `
import { MIDIAnalyzer, metric } from "../base-analyzer";

export default new class HangingSkill extends MIDIAnalyzer {
  name = "HangingSkill";
  weight = 1;

  async evaluate() {
    while (true) {}
    return metric({ score: 1, biologicalImpact: "none", justification: "unreachable" });
  }
}();
`;
}

function harmonicPhraseWav() {
  const sampleRate = 16_000;
  const seconds = 2;
  const samples = sampleRate * seconds;
  const pcm = new Int16Array(samples);
  const frequencies = [261.63, 329.63, 392.0, 523.25];

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const step = Math.floor(t * 4) % frequencies.length;
    const gate = Math.sin(Math.PI * Math.min(1, (t * 4) % 1)) ** 0.35;
    const root = Math.sin(Math.PI * 2 * frequencies[step]! * t);
    const fifth = Math.sin(Math.PI * 2 * frequencies[(step + 2) % frequencies.length]! * t) * 0.45;
    const sample = (root * 0.58 + fifth * 0.28) * gate;
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 24_000);
  }

  return encodeWav(pcm, sampleRate);
}

function sustainedToneWav() {
  const sampleRate = 16_000;
  const seconds = 2;
  const samples = sampleRate * seconds;
  const pcm = new Int16Array(samples);

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const sample = Math.sin(Math.PI * 2 * 261.63 * t) * 0.48 + Math.sin(Math.PI * 2 * 392 * t) * 0.22;
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 22_000);
  }

  return encodeWav(pcm, sampleRate);
}

function audioSummaryFixture(overrides: Partial<AudioSummary>) {
  return {
    durationSeconds: 180,
    sourceSampleRate: 44_100,
    sourceChannelCount: 2,
    sampleRate: 44_100,
    rmsMean: 0.12,
    rmsStdDev: 0.04,
    crestFactor: 4,
    clippingRate: 0,
    flatTopRate: 0,
    samplePeakDbfs: -1,
    truePeakDbtp: -1,
    integratedLufs: -14,
    loudnessRange: 6,
    dcOffset: 0,
    silenceRatio: 0,
    invalidSampleCount: 0,
    spectralCentroid: 760,
    spectralCentroidStdDev: 420,
    spectralFlatness: 0.05,
    spectralFlux: 0.8,
    spectralEntropy: 0.45,
    rolloffHz: 2_200,
    zcr: 0.08,
    lowEnergy: 0.32,
    bassEnergy: 0.28,
    lowMidEnergy: 0.16,
    midEnergy: 0.16,
    highEnergy: 0.08,
    stereoWidth: 0.25,
    onsetRate: 1.2,
    onsetRegularity: 0.5,
    pulseClarity: 0.55,
    transientSpikeRate: 0.05,
    chroma: [0.2, 0.01, 0.16, 0.02, 0.14, 0.11, 0.01, 0.18, 0.02, 0.11, 0.01, 0.03],
    chromaFlux: 0.07,
    chromaEntropy: 0.65,
    sectionContrast: 0.45,
    selfSimilarity: [],
    sections: [],
    scaleCompliance: 0.74,
    fifthsStability: 0.72,
    cymaticSymmetry: 0.7,
    harmonicity: 0.72,
    perceptualBands: [
      { lowHz: 20, highHz: 80, energyDb: -8, share: 0.32 },
      { lowHz: 80, highHz: 250, energyDb: -9, share: 0.28 },
      { lowHz: 250, highHz: 700, energyDb: -12, share: 0.16 },
      { lowHz: 700, highHz: 3_500, energyDb: -12, share: 0.16 },
      { lowHz: 3_500, highHz: 16_000, energyDb: -15, share: 0.08 },
    ],
    timeline: { loudness: [], centroid: [], flux: [], tension: [], dynamics: [], groovePulse: [], sectionScore: [] },
    ...overrides,
  } satisfies AudioSummary;
}

function metricScore(metrics: readonly { readonly name: string; readonly metric: { readonly score: number } }[], name: string) {
  return metrics.find((entry) => entry.name === name)?.metric.score ?? 0;
}

function encodeWav(pcm: Int16Array, sampleRate: number) {
  const dataBytes = pcm.byteLength;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
