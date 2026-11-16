# Arena capture acceptance

Use the current standalone export on a managed local game URL. The native encoder
defaults to 60 fps, advances simulation and camera once per sample, and awaits
encoding. It preserves Theater fighters and suppresses local screen effects.
Do not use a real-time MediaRecorder or pad a slow recording with repeated frames
as arena evidence. Regenerate stale exports through the editor's export owner.

From repository root, with the repository FFmpeg installation or an equivalent
directory containing `ffmpeg.exe` and `ffprobe.exe`:

```powershell
bun apps/engine-editor/verification/arena-capture/capture.ts <managed-game-url> <fresh-output> --project <canonical-project.json> --ffmpeg-bin <ffmpeg-bin-directory> --album
bun test apps/engine-editor/verification/arena-capture apps/engine-editor/src/standalone/capture
bun test packages/engine/src/render/3d-webgl2.test.ts packages/engine/src/project/3d/combat-visuals
bun test packages/engine/examples/touch-of-death/src/presentation/city/generation
```

`--album` produces five 30-second continuous pans and five 12-second montages
with 24 state cuts each. Without it, capture one 30-second pan. `--seconds 3`
shortens a smoke check. A supplied project chooses its five authored spawn areas.
`--seed <uint32>` selects a replayable arena sequence. `--weapon player`,
`--weapon opponent` or `--weapon none` stages ownership through the native restore
boundary; `--weapon natural` preserves normal state. Evidence retains the seed,
requested mode and staged weapon ID. Staging verifies presentation, not pickup
gameplay. Use the existing image-album skill to assemble captures and
`scripts/artifact-review/verify-browser.ts --album-url <managed-url> --out <local-dir>`
to check the gallery; do not retime recordings or create another album renderer.
Outputs retain source/encoder hashes, per-frame simulation/camera samples, subject
bounds, cue counts, renderer stats, decoded cadence, motion hashes and audio levels.
They are versioned evidence; use a new directory for every attempt.

The workflow fails on missing renders, lost/clipped/tiny fighters, unsupported
lights, missing audio assets, silent soundtracks, decoded packet gaps, missing
frames, frozen motion, detached knockout/recovery poses, browser errors and visible
browser windows. Decode checks
inspect original WebM packet times, never just container fps. Intentional hit-stop
holds may repeat; every encoded sample must still advance the source clock.

Offline audio schedules captured cues on the same clock and checks a known cue
at frame 60 before and after Opus encoding. This is a capture mix: music starts at
the authored track offset, and device-local playback, reactive bus effects and
existing live playlist transition phase are not reproduced. A prepared AudioBuffer
can override it; `audio: false` explicitly requests a video-only study. Such studies
do not satisfy this sound-on album gate. Offline 60 fps does not prove live 60 fps.

Every normal city generation calls `generation/presentation.ts` before committing
state. It rejects unsupported lighting, missing materials, unprotected foreground
geometry, broken/cyclic fade ownership and detached dressing in arena layouts.
Renderer regressions cover first-use/replaced texture samplers and opacity-aware
shadows; obstruction regressions cover fade continuity, nested trims and pickup
supports. These mechanical gates do not establish art approval. Inspect the pans
and montages for composition and transitions before presenting them for review.
