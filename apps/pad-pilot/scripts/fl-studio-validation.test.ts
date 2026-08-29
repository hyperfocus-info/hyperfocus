import { describe, expect, it } from "bun:test";
import path from "node:path";

import {
  buildFlStudioProcessCheckCommand,
  buildFlStudioRenderCommand,
  createFlStudioReferenceWaveBytes,
  decodeAudioData,
  evaluateFlStudioCrossVersion,
  evaluateFlStudioHostRender,
  fixturePaths,
  measureAudio,
  parseFlStudioValidationArguments,
} from "./fl-studio-validation";

function repeatAudio(channelData: readonly Float32Array[], repetitions: number) {
  return channelData.map((channel) => {
    const result = new Float32Array(channel.length * repetitions);
    for (let index = 0; index < repetitions; index += 1) result.set(channel, channel.length * index);
    return result;
  });
}

describe("FL Studio validation contract", () => {
  it("creates one-second stereo 48 kHz float reference audio at -18 dBFS", async () => {
    const bytes = createFlStudioReferenceWaveBytes();
    const decoded = await decodeAudioData(bytes);
    const metrics = measureAudio(decoded);
    expect(bytes.byteLength).toBe(384_044);
    expect(metrics.channelCount).toBe(2);
    expect(metrics.sampleRate).toBe(48_000);
    expect(metrics.durationSeconds).toBe(1);
    expect(metrics.peakDbfs).toBeCloseTo(-18, 4);
    expect(metrics.invalidSampleCount).toBe(0);
  });

  it("builds bounded target, fixture, and render commands", () => {
    expect(parseFlStudioValidationArguments([])).toMatchObject({ action: "validate", only: "all" });
    expect(parseFlStudioValidationArguments(["--prepare", "--only", "fl26"])).toMatchObject({
      action: "prepare",
      only: "fl26",
    });
    expect(() => parseFlStudioValidationArguments(["--probe", "--prepare"])).toThrow();
    expect(() => parseFlStudioValidationArguments(["--only", "unknown"])).toThrow();
    expect(() => parseFlStudioValidationArguments(["--fl26", "a", "--fl26", "b"])).toThrow();
    const fixtures = fixturePaths("fixtures", "fl26");
    expect(fixtures.controls).toBe(path.resolve("fixtures", "padpilot-controls-fl26.flp"));
    expect(buildFlStudioRenderCommand("FL64.exe", fixtures.controls, "result.wav")).toEqual([
      path.resolve("FL64.exe"),
      "/D",
      "/Ewav",
      `/R${path.resolve("result.wav")}`,
      fixtures.controls,
    ]);
    expect(buildFlStudioProcessCheckCommand()).toEqual([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@(Get-Process -Name FL64 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)",
    ]);
  });

  it("rejects dry multiplication and a wet second-dry segment while accepting measurable controls", async () => {
    const reference = await decodeAudioData(createFlStudioReferenceWaveBytes());
    const controls = repeatAudio(reference.channelData, 4);
    for (let channel = 0; channel < controls.length; channel += 1) {
      const samples = controls[channel];
      for (let frame = 48_000; frame < 96_000; frame += 1) samples[frame] *= 1.2;
      for (let frame = 144_000; frame < 192_000; frame += 1) samples[frame] *= 1.2;
    }
    const good = evaluateFlStudioHostRender(reference, {
      controls: { channelData: controls, sampleRate: 48_000 },
      unity: reference,
    });
    expect(good.passed).toBe(true);
    expect(evaluateFlStudioCrossVersion(good, good).passed).toBe(true);

    const loudUnity = reference.channelData.map((channel) => Float32Array.from(channel, (sample) => sample * 2));
    const wetSecondDry = repeatAudio(reference.channelData, 4);
    for (const samples of wetSecondDry) {
      for (let frame = 96_000; frame < 144_000; frame += 1) samples[frame] *= 1.2;
    }
    const bad = evaluateFlStudioHostRender(reference, {
      controls: { channelData: wetSecondDry, sampleRate: 48_000 },
      unity: { channelData: loudUnity, sampleRate: 48_000 },
    });
    expect(bad.passed).toBe(false);
    expect(bad.failures.some((failure) => failure.includes("unity"))).toBe(true);
    expect(bad.failures.some((failure) => failure.includes("second dry"))).toBe(true);
  });

  it("rejects equal-level polarity corruption and non-repeatable restored wet audio", async () => {
    const reference = await decodeAudioData(createFlStudioReferenceWaveBytes());
    const controls = repeatAudio(reference.channelData, 4);
    for (let channel = 0; channel < controls.length; channel += 1) {
      const samples = controls[channel];
      for (let frame = 48_000; frame < 96_000; frame += 1) samples[frame] *= 1.2;
      for (let frame = 144_000; frame < 192_000; frame += 1) samples[frame] *= -1.2;
    }
    const invertedUnity = reference.channelData.map((channel) => Float32Array.from(channel, (sample) => -sample));
    const result = evaluateFlStudioHostRender(reference, {
      controls: { channelData: controls, sampleRate: 48_000 },
      unity: { channelData: invertedUnity, sampleRate: 48_000 },
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("unity waveform"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("restored wet waveform"))).toBe(true);
  });

  it("reports actionable fixture corrections for rate, duration, and missing wet processing", async () => {
    const reference = await decodeAudioData(createFlStudioReferenceWaveBytes());
    const fourSecondUnity = repeatAudio(reference.channelData, 4);
    const dryControls = repeatAudio(reference.channelData, 4);
    const result = evaluateFlStudioHostRender(reference, {
      controls: { channelData: dryControls, sampleRate: 44_100 },
      unity: { channelData: fourSecondUnity, sampleRate: 48_000 },
    });

    expect(result.failures.some((failure) => failure.includes("4 s; expected 1 s"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("44100 Hz; expected 48000 Hz"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("apply the Controls preset"))).toBe(true);
  });
});
