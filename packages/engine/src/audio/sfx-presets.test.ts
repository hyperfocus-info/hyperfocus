import { describe, expect, test } from "bun:test";
import type { PlayBufferOptions } from "./index.ts";
import { createSfxPresetBank, renderSfxPreset, SFX_PRESET_NAMES, SFX_PRESET_STYLES } from "./sfx-presets.ts";

describe("procedural SFX presets", () => {
  test("renders every preset as deterministic, finite PCM16 WAV", () => {
    for (const style of SFX_PRESET_STYLES) for (const preset of SFX_PRESET_NAMES) {
      const first = renderSfxPreset({ preset, style, sampleRate: 8_000, seed: 42 });
      const second = renderSfxPreset({ preset, style, sampleRate: 8_000, seed: 42 });
      expect(new TextDecoder().decode(first.wav.slice(0, 4))).toBe("RIFF");
      expect(first.wav).toEqual(second.wav);
      expect(first.samples.every(Number.isFinite)).toBe(true);
      expect(first.samples.some((sample) => sample !== 0)).toBe(true);
      expect(Math.max(...first.samples.map(Math.abs))).toBeLessThanOrEqual(0.921);
      expect(first.durationSeconds).toBeGreaterThan(0.04);
      expect(first.durationSeconds).toBeLessThan(1.1);
    }
  });

  test("keeps style families distinct and softens the revised retro cues", () => {
    const variants = SFX_PRESET_STYLES.map((style) => renderSfxPreset({ preset: "coin", style, sampleRate: 8_000, seed: 7 }).wav);
    expect(new Set(variants.map((wav) => Bun.hash(wav))).size).toBe(SFX_PRESET_STYLES.length);
    const cancel = renderSfxPreset({ preset: "cancel", sampleRate: 8_000 });
    const laser = renderSfxPreset({ preset: "laser", sampleRate: 8_000 });
    expect(Math.max(...cancel.samples.map(Math.abs))).toBeLessThan(0.7);
    const crossings = laser.samples.reduce((count, sample, index) => count + (index > 0 && Math.sign(sample) !== Math.sign(laser.samples[index - 1] ?? sample) ? 1 : 0), 0);
    expect(crossings / laser.samples.length).toBeLessThan(0.18);
    expect(renderSfxPreset({ preset: "coin" }).durationSeconds).toBeGreaterThan(0.35);
  });

  test("validates sample rates and unknown runtime values", () => {
    expect(() => renderSfxPreset({ preset: "click", sampleRate: 4_000 })).toThrow("8000 through 96000");
    expect(() => Reflect.apply(renderSfxPreset, undefined, [{ preset: "missing" }])).toThrow("Unknown SFX preset");
    expect(() => Reflect.apply(renderSfxPreset, undefined, [{ preset: "click", style: "missing" }])).toThrow("Unknown SFX preset style");
  });

  test("loads stable ids and routes named play options through the sfx bus", async () => {
    const decoded: Array<{ id: string; bytes: number }> = [];
    const played: Array<{ id: string; options: PlayBufferOptions }> = [];
    const audio = {
      async decode(id: string, encoded: ArrayBuffer | Uint8Array) { decoded.push({ id, bytes: encoded.byteLength }); return { duration: 1, length: 1, numberOfChannels: 1, sampleRate: 8_000 }; },
      playBuffer(id: string, options: PlayBufferOptions = {}) { played.push({ id, options }); return { ok: false as const, code: "not-unlocked" as const, message: "locked" }; },
    };
    const bank = await createSfxPresetBank({ audio, presets: ["click", "hit"], style: "modern-cartoon", idPrefix: "game:", sampleRate: 8_000, seed: 9 });
    expect(decoded.map((item) => item.id)).toEqual(["game:modern-cartoon:click", "game:modern-cartoon:hit"]);
    expect(decoded.every((item) => item.bytes > 44)).toBe(true);
    expect(bank.style).toBe("modern-cartoon");
    expect(bank.assetId("hit")).toBe("game:modern-cartoon:hit");
    expect(bank.play({ preset: "hit", gain: 0.5, pan: -0.2 })).toEqual(expect.objectContaining({ code: "not-unlocked" }));
    expect(played).toEqual([{ id: "game:modern-cartoon:hit", options: { gain: 0.5, pan: -0.2, bus: "sfx" } }]);
    expect(() => bank.assetId("coin")).toThrow("not loaded");
  });
});
