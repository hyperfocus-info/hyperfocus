# October 10: separately versioned spatial AA

**A spatial AA candidate reproduces its own images in all six short arena
captures.** This clears a bounded repeatability gate that the old MSAA renderer
still fails. It does not establish sustained determinism, accepted visual quality
or 165 Hz fresh motion. No playable default changes.

## Controlled implementation

Both versions retain the [combined material/shadow batching](october-10-display-combined-batching.md),
compact publication, per-material revisions, full services, 60 Hz fixed producer
and 16.67 ms interpolation delay. The candidate replaces default four-sample MSAA
with one single-sample RGBA8/depth24 scene target and a spatial edge-filter pass.
Geometry, shadows, materials, resource checks, existing Canvas2D post and HUD stay
in the pipeline. The filter precedes Canvas2D post; bloom/exposure interaction is
therefore a remaining quality consideration.

`spatial-aa-v1` is a custom shader, not an NVIDIA FXAA preset. A 3×3 luminance
neighborhood detects contrast, a Sobel gradient selects two half-pixel samples,
and a fixed blend softens edges. It has no temporal history, jitter or random
seed. It adds one fullscreen triangle and at most eleven texture fetches per
pixel. At 1366×768 the retained color target is 4,196,352 bytes; nominal depth
storage is 3,147,264 bytes. Actual driver allocation and net savings relative to
MSAA are unmeasured. These GPU storage counts do not measure CPU caches or RAM
traffic.

One context owns one target, program and VAO. Resize replaces the target; context
loss abandons it; restoration creates a new lifetime; disposal releases it.
The steady JS path creates no explicit arrays or wrapper objects and makes no
synchronous state queries or image readbacks. All scene resource checks remain.
The private AA texture binds are absent from the existing texture-binding stat;
explicit command capture includes them. Whole-render GPU timing includes AA and
excludes Canvas2D post, HUD and browser compositing.

## Correctness and same-version images

The six-arena expansion exposed a real interpolation error in market: authored
action poses contain weapon hints even when neither endpoint owns a weapon
entity. Interpolation treated those hints as attachment ownership and required
an absent definition. The fix uses endpoint weapon identity to select attachment
interpolation. A real attached weapon still requires its definition; endpoints
remain borrowed exactly and input poses are not mutated. The captured failing
tick-2→3 pair now interpolates. Both comparison builds contain this fix and keep
the identical producer binary.

The corrected candidate passes construction, market, residential, depot, utility
and rooftop: 732 publication checks, 1,464 endpoint checks, 144 exact adjacent
raw/composited image pairs and 36 exact cross-context image pairs. Each arena
uses its original seeded project/assets, 61 publications at 60 Hz and checkpoints
0/30/60 with two redraws. Native foreground, document focus, wake release,
source identity, active upload bytes and browser cleanup are checked. This is a
short fixed-resource screen, not six-arena sustained acceptance.

The final corrected rooftop comparison (`attachment/roof/aa-capture`) adds 482
publication checks and 964 endpoint checks against the archived producer/pose
reference. Candidate repeats are exact in 12/12 image pairs; MSAA control fails
6/12, despite equal observed initial state and commands within each pair. At
checkpoints 0/60/240 the candidate adds exactly 20 recorded GL calls and one
fullscreen draw, preserving all instanced draw dimensions and active upload
bytes. Full upload hashes differ only in proven unused material-ID slots; this
is not complete resident-state proof.

No throughput campaign was run for this AA version. Its performance effect is
unknown. The user requested closure and a consolidated runtime-switch build;
the proposed extra restore capture and ABBA campaign were not started. The
corrected version therefore still needs that restore-schedule acceptance.

A separate real-browser fixture passes 28 lifecycle checks: nine exact filtered
draws, no steady resource creation/uploads/state queries, bounded resize, invalid
dimensions, context loss/restoration, exact flat colors and idempotent disposal.
Initial fixture failures are retained: insecure blank-page hashing, restoration
requested before context-loss event completion, and an undefined initial delete
counter in the probe. The corrected fixture completes with no GL errors.

The earlier full-game version, before the shared attachment fix, passes 64/64
candidate image pairs across ordinary and restore/pause/viewport schedules.
Its MSAA controls fail 32/64. Those earlier results are separate evidence, not
acceptance of the corrected build. A first six-arena attempt lost native focus;
the runner now reacquires and verifies focus immediately before manual capture.
The subsequent market failure led to the attachment fix. All failed attempts
remain saved.

Visual inspection of rooftop and depot shows the expected scene and fighters;
thin and diagonal edges are rougher than MSAA. This is a concrete renderer-version
trade-off, not a claim of visual-quality approval. Cross-version pixel equality
is not required by the owner. Existing MSAA same-version failures remain failures.

## Evidence and reproduction

Raw root: `.local/engine-perf/spatial-aa-20261010/`. Owner: engine performance
audit. Retain until replacement evidence preserves source identities, samples
and failures. `roof/` retains the lifecycle and initial-version evidence;
`arenas/` retains pre-fix failures; `market-weapon-diagnostic/` retains the exact
failing and repaired pair. Authoritative corrected builds are `attachment/roof/`
and `attachment/arenas/`.

Corrected runtime hashes: control
`169bbe6f989c985d0658a3078a51a0ebc7e2a228cd88cfc1d67094b19c4401a2`, candidate
`03b9bc9df837741573c2e2f0342112fcf2f68dbb7a58c2a41742fec404d5be5b`;
shared producer `8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.
`source-comparison.json` limits the rendering delta to renderer/controller plus
the new AA helper, with the attachment fix shared on both sides.

Use `rendering/spatial-aa-recipe.ts` with explicit `PERF_ROOT` and
`PERF_FROZEN_SOURCES` for the verified combined renderer. Build its saved patch
with `PERF_REBUILD_RENDERER=1`. Apply the current fighter-pair/fighter-motion source
overrides to both builds. Each arena's `source-inputs.json` binds the original
seeded HTML/workload, unchanged decoded project/assets, frozen graph and manifest.

Run `verification/spatial-aa-campaign.ts` with `PERF_ROOT` pointing at the prepared
six-arena directory and `PERF_PREFIX=spatial-cross`; then run
`rendering/spatial-aa-campaign-results.ts` with the same environment. The serial
runner records capture, numeric display, upload and exact image checks per arena.
Run `verification/spatial-aa.ts` separately for lifecycle checks with an explicit
output root and the managed game URL. Readbacks and draw-state probes are only
correctness diagnostics; they must not run in throughput trials.

Nine fighter interpolation tests pass with 100 assertions; scoped TypeScript
passes; process policy reports 4,893 files and zero violations. Completed capture
and pixel owners have empty cleanup receipts and released wake guards. The shared
managed game server stays running with no unresolved errors.

## Next boundary

Consolidate existing experiments into one configurable build before more broad
timing. Compare modes serially from the same seeded reset, with separate rendering
and simulation controls and observable work counters. Keep context/worker/browser
restarts explicit. Failed candidates remain diagnostic-only. Prioritize coarse
subsystem removal and producer/display work before another micro-optimization or
an AA investigation. The owning audit records the remaining performance limits.
