import { describe, expect, test } from "bun:test";

import { evaluateMidiV2 } from "./midi-evaluator-v2";
import { summarizeMidi } from "./midi-utils";
import { SkillManager } from "./skill-manager";

describe("MIDI evaluator v2", () => {
  test("returns source-specific evidence-bearing metrics through dimension scores", () => {
    const report = evaluateMidiV2(simplePhraseSmf());

    expect(report.schemaVersion).toBe(2);
    expect(report.mediaKind).toBe("midi");
    expect(report.overall).toBeGreaterThan(0);
    expect(report.overall).toBeLessThanOrEqual(1);
    expect(report.metrics.length).toBeGreaterThan(5);
    expect(report.metrics.every((metric) => metric.id.startsWith("midi."))).toBe(true);
    expect(report.metrics.every((metric) => Number.isFinite(metric.confidence))).toBe(true);
    expect(report.metrics.filter((metric) => metric.valid).every((metric) => metric.evidence.length > 0)).toBe(true);
    expect(report.dimensions.some((dimension) => dimension.id === "musicality" && dimension.score !== null)).toBe(true);
  });

  test("keeps groove evidence invariant across MIDI PPQ resolutions", () => {
    const at480 = evaluateMidiV2(sixteenthPhraseSmf(480));
    const at960 = evaluateMidiV2(sixteenthPhraseSmf(960));

    expect(at480.diagnostics.rhythm.ticksPerBeat).toBe(480);
    expect(at960.diagnostics.rhythm.ticksPerBeat).toBe(960);
    expect(at480.diagnostics.rhythm.gridAlignment).toBeCloseTo(at960.diagnostics.rhythm.gridAlignment, 8);
    expect(metricScore(at480, "midi.rhythm.pulse-coherence")).toBeCloseTo(metricScore(at960, "midi.rhythm.pulse-coherence"), 8);
  });

  test("marks an ambiguous chromatic center unreliable without treating ambiguity as zero quality", () => {
    const report = evaluateMidiV2(chromaticPhraseSmf());
    const tonalCenter = report.metrics.find((metric) => metric.id === "midi.harmony.tonal-center");

    expect(tonalCenter?.status).toBe("unreliable");
    expect(tonalCenter?.score).toBeNull();
    expect(report.overall).toBeGreaterThan(0.2);
    expect(report.dimensions.find((dimension) => dimension.id === "musicality")?.coverage).toBeGreaterThan(0);
  });

  test("rejects empty MIDI without turning unavailable musical metrics into zeroes", () => {
    const report = evaluateMidiV2(new Uint8Array());

    expect(report.overall).toBe(0);
    expect(report.confidence).toBe(1);
    expect(report.metrics.every((metric) => !metric.valid && metric.score === null)).toBe(true);
    expect(report.metrics.every((metric) => metric.status === "not-applicable" || metric.status === "unreliable")).toBe(true);
  });

  test("does not reward one sustained note as a complete composition", () => {
    const report = evaluateMidiV2(smf([
      ...note(0, 0x90, 60, 96),
      ...note(1_920, 0x80, 60, 0),
    ], 480));

    expect(report.overall).toBeLessThan(0.25);
    expect(report.metrics.find((metric) => metric.id === "midi.structure.section-development")?.score).toBeNull();
    expect(report.metrics.find((metric) => metric.id === "midi.melody.phrase-shape")?.score).toBeNull();
  });

  test("distinguishes structured A-B-A development from a perfectly quantized static loop", () => {
    const a = [60, 64, 67, 72, 67, 64, 62, 60];
    const b = [66, 70, 73, 78, 73, 70, 68, 66];
    const structured = evaluateMidiV2(sectionedMelodySmf([a, b, a]));
    const staticLoop = evaluateMidiV2(sectionedMelodySmf([a, a, a]));

    expect(dimensionScore(structured, "structure")).toBeGreaterThan(dimensionScore(staticLoop, "structure"));
    expect(structured.diagnostics.structure.repetition).toBeGreaterThan(0.9);
    expect(structured.diagnostics.structure.contrast).toBeGreaterThan(staticLoop.diagnostics.structure.contrast);
    expect(dimensionScore(staticLoop, "groove")).toBeGreaterThan(0.5);
    expect(staticLoop.overall).toBeLessThan(0.9);
  });

  test("ranks incoherent random notes below coherent and intentionally dissonant phrases", () => {
    const a = [60, 64, 67, 72, 67, 64, 62, 60];
    const b = [66, 70, 73, 78, 73, 70, 68, 66];
    const coherent = evaluateMidiV2(sectionedMelodySmf([a, b, a]));
    const dissonant = evaluateMidiV2(chromaticPhraseSmf());
    const random = evaluateMidiV2(randomPhraseSmf());

    expect(coherent.overall).toBeGreaterThan(random.overall);
    expect(dissonant.overall).toBeGreaterThan(random.overall);
    expect(dissonant.metrics.find((metric) => metric.id === "midi.harmony.tonal-center")?.score).toBeNull();
  });

  test("uses declared tempo and time signature for beat and bar diagnostics", () => {
    const midi = meteredPhraseSmf();
    const summary = summarizeMidi(midi);
    const report = evaluateMidiV2(midi);

    expect(summary.tempoBpm).toBeCloseTo(120);
    expect(summary.hasExplicitTempo).toBe(true);
    expect(summary.timeSignatureNumerator).toBe(4);
    expect(summary.timeSignatureDenominator).toBe(4);
    expect(summary.hasExplicitTimeSignature).toBe(true);
    expect(report.diagnostics.rhythm.barTicks).toBe(1_920);
    expect(report.diagnostics.rhythm.downbeatConsistency).toBeGreaterThan(0.5);
  });

  test("exposes v2 MIDI scoring while retaining the legacy skill score adapter", async () => {
    const manager = new SkillManager();
    await manager.loadAll();
    const report = await manager.evaluate(simplePhraseSmf());

    expect(report.kind).toBe("midi");
    expect(report.schemaVersion).toBe(2);
    expect(report.overall).toBeGreaterThanOrEqual(0);
    expect(report.midiMetrics.every((metric) => metric.id.startsWith("midi."))).toBe(true);
    expect(Number.isFinite(report.successScore)).toBe(true);
    expect(report.metrics.length).toBeGreaterThan(0);
  });
});

function simplePhraseSmf() {
  const events = [
    note(0, 0x90, 60, 92),
    note(240, 0x80, 60, 0),
    note(240, 0x90, 64, 86),
    note(240, 0x80, 64, 0),
    note(240, 0x90, 67, 90),
    note(240, 0x80, 67, 0),
    note(240, 0x90, 72, 98),
    note(480, 0x80, 72, 0),
  ].flat();
  return smf(events, 480);
}

function sixteenthPhraseSmf(ticksPerBeat: number) {
  const step = ticksPerBeat / 4;
  const events = Array.from({ length: 12 }, (_, index) => [
    note(index === 0 ? 0 : step / 2, 0x90, 60 + (index % 4) * 2, 80 + (index % 3) * 7),
    note(step / 2, 0x80, 60 + (index % 4) * 2, 0),
  ]).flat(2);
  return smf(events, ticksPerBeat);
}

function chromaticPhraseSmf() {
  const pitches = [60, 66, 61, 70, 64, 71, 63, 69, 62, 68, 65, 67, 72, 66, 73, 70, 76, 71];
  const events = pitches.flatMap((pitch, index) => [
    ...note(index === 0 ? 0 : 120, 0x90, pitch, 72 + (index % 5) * 8),
    ...note(120, 0x80, pitch, 0),
  ]);
  return smf(events, 480);
}

function sectionedMelodySmf(sections: readonly (readonly number[])[]) {
  const events: number[] = [];
  sections.forEach((section, sectionIndex) => {
    section.forEach((pitch, noteIndex) => {
      events.push(...note(sectionIndex === 0 && noteIndex === 0 ? 0 : noteIndex === 0 ? 480 : 0, 0x90, pitch, 78 + noteIndex * 2));
      events.push(...note(240, 0x80, pitch, 0));
    });
  });
  return smf(events, 480);
}

function randomPhraseSmf() {
  const pitches = [84, 37, 73, 42, 91, 54, 78, 33, 69, 88, 46, 75, 39, 82, 51, 95, 44, 71, 35, 86, 58, 92, 41, 76];
  const deltas = [17, 311, 49, 701, 83, 197, 563, 29, 419, 137, 877, 61, 239, 43, 653, 101, 347, 19, 523, 73, 281, 127, 467, 37];
  const events = pitches.flatMap((pitch, index) => [
    ...note(index === 0 ? 0 : deltas[index]!, 0x90, pitch, 35 + ((index * 37) % 92)),
    ...note(31 + ((index * 53) % 337), 0x80, pitch, 0),
  ]);
  return smf(events, 480);
}

function meteredPhraseSmf() {
  const events = [
    0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20,
    0, 0xff, 0x58, 4, 4, 2, 24, 8,
  ];
  for (let beat = 0; beat < 12; beat += 1) {
    events.push(...note(beat === 0 ? 0 : 240, 0x90, 60 + (beat % 4), beat % 4 === 0 ? 112 : 72));
    events.push(...note(240, 0x80, 60 + (beat % 4), 0));
  }
  return smf(events, 480);
}

function metricScore(report: ReturnType<typeof evaluateMidiV2>, id: string) {
  return report.metrics.find((metric) => metric.id === id)?.score ?? -1;
}

function dimensionScore(report: ReturnType<typeof evaluateMidiV2>, id: string) {
  return report.dimensions.find((dimension) => dimension.id === id)?.score ?? -1;
}

function note(delta: number, status: number, pitch: number, velocity: number) {
  return [...vlq(delta), status, pitch, velocity];
}

function smf(events: readonly number[], ticksPerBeat: number) {
  const track = [...events, 0, 0xff, 0x2f, 0];
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1,
    (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff,
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
