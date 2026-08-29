import { expect, test } from "bun:test";
import { createDeterministicSoundscape } from "./deterministic-soundscape.ts";

test("deterministic soundscape produces byte-identical seeded PCM across block sizes", () => {
  const options = { seed: "world:rain:4", channels: 2, sampleRate: 48_000 };
  const contiguous = new Float32Array(128);
  createDeterministicSoundscape(options).fill(contiguous);
  const partitioned = new Float32Array(128);
  const synth = createDeterministicSoundscape(options);
  synth.fill(partitioned, 20, 0);
  synth.fill(partitioned, 44, 40);
  expect(new Uint8Array(partitioned.buffer)).toEqual(new Uint8Array(contiguous.buffer));
  expect(Math.max(...contiguous)).toBeLessThanOrEqual(1);
  expect(Math.min(...contiguous)).toBeGreaterThanOrEqual(-1);
});

test("deterministic soundscape reset restores the world-seeded sequence", () => {
  const synth = createDeterministicSoundscape({ seed: 42, channels: 1 });
  const first = synth.fill(new Float32Array(16));
  synth.fill(new Float32Array(4));
  synth.reset();
  expect(synth.fill(new Float32Array(16))).toEqual(first);
  expect(() => createDeterministicSoundscape({ seed: 1, rainGain: 2 })).toThrow("rainGain");
});
