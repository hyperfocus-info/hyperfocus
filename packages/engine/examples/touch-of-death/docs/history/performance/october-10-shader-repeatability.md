# October 10: shader isolation under normal MSAA

**No tested shader change fixes exact repeatability.** Six private variants of the
[complete display/material-table pipeline](october-10-display-material-table.md)
all reproduce changed pixels despite equal observed GL state, calls and upload
argument hashes. This narrows the next investigation; it does not identify a
driver defect or establish complete GPU-state equality. No performance or
production-default change is claimed. 165 Hz fresh motion remains unproven.

## Hypotheses and controlled results

Rooftop seed 714, Chrome 154.0.8037.58, RTX 4070 Laptop, visible/focused,
1366 x 768, DPR 1. Every context reports normal AA, four samples and one sample
buffer. Each owner advances 241 logical publications at 60 Hz. At checkpoints
0/60/240 it renders the identical packet nine times synchronously, retaining both
raw WebGL and composited images plus bounded call-recorder output.

Each variant has 24 adjacent raw-image comparisons, with the same 24 transitions
also observed after compositing. These are failure reproductions, not independent
trials or estimates of population failure rates. No cross-version pixel equality
is required. Every variant starts from the same frozen graph; changes are separate,
not stacked on one another.

| Variant / hypothesis | Controlled variable and expected signature | Non-exact raw pairs / 24 | Maximum changed raw pixels / channel delta | Decision |
| --- | --- | ---: | ---: | --- |
| Existing table renderer | Unchanged control reproduces the failure | 13 | 123 / 10 | Reproduced |
| Bounded lighting dot products | Clamp the two dot products feeding `pow` to their mathematical upper bound; eliminate a possible negative-base domain | 16 | 133 / 10 | Not a sufficient fix; invalid-domain activation was not measured |
| Lighting off | Force only the lighting uniform off, keeping shadow-map rendering and cutaway shading | 2 | 8 / 1 | Failure remains; smaller observed differences do not establish a comparative failure rate |
| Cutaway shader off | Disable edge/fill cutaway shading while keeping evaluated opacity, blend flags and expanded mesh draws | 12 | 100 / 11 | Cutaway shading is not required for a failure |
| Shadow reception off | Disable only receiver shadow sampling; keep shadow-map rendering and other lighting | 11 | 157 / 7 | Shadow reception is not required for a failure |
| Explicit shadow gradients | Replace the four shadow `texture` calls with zero-gradient `textureGrad` calls; retain shadow rendering/reception | 14 | 71 / 10 | Not a sufficient fix |

The dot-product hypothesis follows the
[GLSL ES 3.00 specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf):
negative bases are outside `pow`'s defined domain, even though these shader
exponents are positive integers. Normalized floating-point dot products were
lower-bounded but not upper-bounded. This is a possible source issue, not evidence
that the tested pixels exercised it.

The same specification describes explicit-gradient texture lookup and undefined
implicit derivatives in non-uniform flow. However, this renderer's shadow map is
single-level DEPTH_COMPONENT24 with LINEAR minification/magnification and LEQUAL
comparison. A non-mipmapped lookup need not calculate implicit LOD. The gradient
variant therefore tests a sampling instruction path; it does not demonstrate an
existing undefined-LOD defect. No shadow precision/filter format was changed.

Across all six variants, **68/144 raw transitions are non-exact**. Their composited
counterparts give the same failure counts: **136/288 layer comparisons** overall.
Every one of the 288 comparisons has equal recorded initial-state and command
hashes. The largest raw/composited channel difference is 11; maxima for pixel
counts and channel differences need not occur in the same comparison.

## Work, correctness and observation limits

The worker binary remains
`8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.
The rebuilt control's runtime hash exactly matches the preceding display-table
artifact. Each other build changes one engine module: shader source or one
renderer uniform assignment. Full state/presentation sequences and intermediate
pose hashes match the control. All 1,446 publication captures pass, including
2,892 endpoint comparisons, 1,446 repeated-pose checks, 1,446 audio-once checks
and 723 inline source-mutation probes.

All eighteen captured checkpoints preserve draw, shadow, outline, material-bind,
instance, triangle, line, skinned-instance, upload-byte, mesh/texture-upload and
viewport counts. Recorded calls per draw are 13,495 / 18,385 / 24,469 at the three
checkpoints. Each draw's recorder copies 469,536 argument bytes; this includes
entire typed argument views, even when an API uses a subrange. It is diagnostic
copy volume, not actual GPU upload bytes or RAM-bus traffic. Calls and hashes are
identical across all nine redraws within each context/checkpoint.

An offline comparison of lighting-off call descriptors against control changes
only 3/15/6 `uniform1i` values from one to zero. This confirms the ablation is
exercised. However, copied-argument hashes also differ across these contexts: the
24,576-byte instance-ID texture upload differs at all three checkpoints. The
planner fills only transparent ranges and retains unused slots from prior draws,
which is a possible explanation; full upload bytes were hashed but not retained,
so the differing offsets are unverified. `lighting-call-comparison.json` records
this limitation. Within every failing same-context pair, upload hashes are equal.

Resource IDs are local ordinal labels; matching labels across contexts do not
independently prove resource identity. Full resident mesh/texture contents,
backend resource state, shader binaries and native resolve scheduling remain
outside the recorder's coverage. Do not infer complete cross-context GPU-input
equality from matching active poses, call descriptors or work counts.

Readbacks, state queries, argument copies and hashes perturb execution. No timing,
physical presentation, latency, allocation-rate or cache/bandwidth inference is
drawn from this lane. The captures are sequential, with different owner/context
assignments per variant, rather than a randomized independent-session campaign.
They prove counterexamples to determinism, not a robustness ranking. Existing
[AA-off exact results](october-10-display-material-table.md#correctness-repeatability-and-decision)
remain a separate diagnostic and do not satisfy normal-AA acceptance.

All six capture wake guards released without expiry or suspected sleep. All 102
cleanup receipts are empty; these include repeated receipts for three shared
pixel-decoder browsers, not 102 distinct browsers. Six focused analysis/capture
tests pass with 28 assertions; focused TypeScript checking passes. Process policy
reports 4,893 files and zero violations. The shared managed game server remains
running with no unresolved errors.

## Next discriminating test

Stop treating the tested clamps, lighting/cutaway switches or shadow sampling
changes as sufficient repairs. Retain bounded upload bytes/used ranges to resolve
the cross-context ID-table difference. Build a minimal fixed-resource MSAA redraw probe,
retaining raw framebuffer observations, explicit initial state and independent
warmed contexts. A reproduced failure there would narrow the boundary beyond the
game's scene/application machinery. A pass would not exonerate the backend for the
full workload. A separately versioned post-process AA experiment is another
candidate; it must retain AA, pass its own exact repeats and full gameplay gates,
and include its GPU/resource/lifecycle cost. Neither AA-off equality nor removed
lighting/shadows can be promoted as the requested visually correct engine.

Shadow batching in the full live pipeline remains queued separately. Final library
layout/topology, independent-session performance, six-arena/stress acceptance,
sustained memory/thermals and input-to-visible latency remain open.

## Reproduction and evidence

Local root: `.local/engine-perf/shader-domains-20261010/roof/`. Owner: engine
performance audit. Retain until replacement evidence preserves source identities,
the six failures and raw command/image data. `shader-repeatability-summary.json`
retains per-owner/layer results, structural counts and validation. Each artifact
retains its frozen graph, manifest and patch inputs.

All script paths below start `spikes/persistent-world-worker/`. Set `PERF_ROOT`
above, `PERF_FROZEN_SOURCES` to the preceding
`display-material-table-20261010/roof/display-table/sources.json` under
`.local/engine-perf/`, and `PERF_BASE_HTML` to its `index.html`.
`rendering/shader-domain-recipe.ts` creates `shader-domain-patches.json` and
`shadow-gradients-patches.json`, independently. `rendering/prepare.ts` creates
the existing unlit and new `no-cutaway-shader` / `no-shadow-sampling` ablations;
it now accepts an already instrumented controller after checking its exact
observation anchor. Build with `PERF_REBUILD_RENDERER=1`, selected
`PERF_SOURCE_PATCHES` and `build.ts <artifact>`. `pow-control` has no patches.

Use `verify.ts` with the retained `roof-compact-714` workload,
`PERF_CAPTURE_HZ=60`, `PERF_CHECKPOINTS=0,60,240`, `PERF_PROVENANCE=1`,
`PERF_RETAIN_STATE_SEQUENCE=1`, `PERF_COUNT_VISUAL_CHANGES=1`,
`PERF_DISPLAY_CAPTURE=1`, `PERF_IMAGE_LAYERS=1`, `PERF_RENDER_REPEATS=8`,
`PERF_RENDER_COMMANDS=1`, `PERF_KEEP_AWAKE=1`, `PERF_HEADLESS=0`,
`PERF_GPU=high-performance`, `PERF_EXPECT_RENDERER=RTX 4070` and default raster.

| Prefix | Inline artifact | Worker artifact |
| --- | --- | --- |
| `pow-ab` | `pow-control` | `pow-bounded` |
| `shader-stages` | `unlit` | `no-cutaway-shader` |
| `shadow-sampling` | `no-shadow-sampling` | `shadow-gradients` |

Run `presentation/display-results.ts`; later prefixes use
`PERF_DISPLAY_REFERENCE=<root>/pow-ab`. Generate each image plan using
`verification/render-repeat-report.ts` with `PERF_RENDER_REPORT_MODE=plan`.
Run `image-parity.ts` with `PERF_IMAGE_BATCH=<root>/<prefix>-pixel-batch.json` and
`PERF_PIXEL_EXACT=1`, then rerun the report with plan mode unset. Each pixel gate
exits 1 after saving every comparison and cleanup receipt. The report now validates
numeric capture, manifest, focus, cleanup/wake and consistent pixel gates, and
separates variants/owners/layers with the observed MSAA configuration.
