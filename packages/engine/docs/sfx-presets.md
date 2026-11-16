# Programmatic SFX presets

`@hyperfocus/engine/audio` includes two complementary SFX paths:

- imported or recorded audio uses `AudioEngine.decode()` and `playBuffer()`;
- dependency-free procedural cues use `renderSfxPreset()` or
  `createSfxPresetBank()`.

The preset bank covers common interaction and gameplay cues: click, confirm,
cancel, coin, pickup, jump, land, footstep, hit, explosion, laser, power-up,
notification, and error. Every cue is available in five deliberately different
families:

- `retro-arcade`: compact oscillator cues and the backward-compatible default;
- `realistic`: restrained UI, physical impacts, filtered foley, and cinematic body;
- `modern-cartoon`: rounded glides, elastic movement, and bright layered chimes;
- `early-3d-2000s`: sample-held and quantized cues with early real-time 3D character;
- `fantasy-90s`: original bell, harp-like, and fanfare-shaped cues for fantasy RPGs.

These are style references, not copies of melodies or samples from existing games.
Rendering is deterministic for a preset, style, sample rate, and seed. The bank
generates short mono PCM16 WAV data, decodes it through the same bounded cache as
imported audio, and plays through the existing buses, priorities, voice limits,
gain, pan, timing, and playback-rate controls.

```ts
import { createAudioEngine, createSfxPresetBank } from "@hyperfocus/engine/audio";

const audio = createAudioEngine();
const sfx = await createSfxPresetBank({ audio, style: "modern-cartoon" });

button.addEventListener("pointerdown", async () => {
  await audio.unlock();
  sfx.play({ preset: "confirm", gain: 0.7 });
});

sfx.play({ preset: "hit", gain: 1.1, pan: -0.2, playbackRate: 0.92, priority: 4 });
```

Create another bank with the same audio engine to mix styles safely. Generated
asset ids include the style, for example `sfx:preset:fantasy-90s:coin`, so banks do
not overwrite one another.

Call `bank.load()` from the engine's `onRecoveryRequired` hook if an application
recreates a closed `AudioContext` and needs the procedural cache rehydrated.

## SoundFonts

SoundFonts are multisampled instrument banks for MIDI-style note playback, not a
substitute for short event SFX. The engine does not parse SF2 or SFZ files. A game
can render music or instrument notes offline, use a dedicated project-local player,
or import the resulting WAV/OGG through the ordinary audio path. This keeps a large
sample parser, bank-specific licensing, and instrument scheduling out of the small
baseline engine. The launcher `asset-catalog` skill lists SoundFont sources and
marks their per-bank license constraints explicitly.

## Related

- [Portable runtime audio](portable-runtime-audio.md)
- [Engine guide](../readme.md)
