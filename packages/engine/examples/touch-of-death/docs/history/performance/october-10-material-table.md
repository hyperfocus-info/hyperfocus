# October 10: ordered GPU material table

**Experimental; CPU submission improves, full-loop acceptance remains open.**
The private material-table renderer reduces surface draw calls while preserving
the ordered instance stream. The owner's revised contract permits cross-version
image differences. Exact within-version repeatability, independent timing controls
and GPU-device effects remain unresolved. No production promotion.

## Implementation and hypothesis

The [ordered planner](october-10-submission-parity.md#complete-bindings-and-bounded-run-planner)
groups adjacent transparent instances only when mesh, skeleton, command flags,
material flags and all five texture bindings match. A private frozen-source recipe
integrates it into the renderer. Opaque, outline and shadow drawing retain their
existing paths.

The vertex shader obtains a material ID from an integer texture using the run's
first instance plus `gl_InstanceID`; a flat varying identifies the row in an
RGBA32F material table. Numeric material values replace per-draw uniforms only for
transparent drawing. Uniform fallback remains for other passes. Texture units
6/7 hold the tables; no new vertex attribute is needed. The full current table and
ID buffer upload every frame, avoiding invalidation assumptions. Resources are
owned per context/program, deleted on disposal and abandoned on context loss.

Hypothesis: fewer draw/material submissions can outweigh table upload and fetch
cost while producing the same images. A second `table-shader` variant retains
every original draw boundary while using the same table shaders, isolating merging.

## Correctness results

Visible focused RTX 4070 Chrome, 1366 by 768, rooftop seed 714; 241 logical samples
at 60 Hz, checkpoint images 0/60/240. Worker binaries are identical between builds;
full authoritative state, numeric packets and presentation sequences match.

| Checkpoint | Control surface draws | Merged surface draws | Merged normal-AA changed pixels / maximum channel difference | Shader-only normal-AA pixels / maximum |
| --- | ---: | ---: | ---: | ---: |
| 0 | 896 | 220 | 401 / 14 | 20 / 3 |
| 60 | 1,233 | 296 | 454 / 8 | 6 / 2 |
| 240 | 1,567 | 437 | 361 / 10 | 2 / 1 |

All three merged AA-off images are exact. The merged normal-AA comparison fails
both the 100-pixel and maximum-3 limits. Shader-only passes this short tolerance
gate using the archived normal-AA control, not a new paired baseline. This
implicates a merging/multisampling interaction; its exact cause and repeatability
remain open. Earlier AA failures are not rehabilitated.

Shadow draw counts remain 896/1,233/1,567; outline draws remain 79/77/77.
Submitted instances and triangle/line counts match. At checkpoints 60 and 240,
the candidate adds 215,200 uploaded bytes per frame. Startup mesh residency differs
between captures, so checkpoint-0 upload totals do not isolate table cost.
Upload counters include the private table; texture-binding counters currently
omit its binds. No CPU/GPU timing, allocation rate or full-loop benefit is claimed.

Four planner/GPU-lifecycle tests / 32 assertions and focused TypeScript checking
pass. Browser compilation and rendering succeed. All owned browser/pixel cleanup
receipts are empty and the shared server reports no unresolved errors. Skinned
crowds, browser context restoration, six arenas, sustained memory and latency
acceptance remain untested for this renderer.

## Reproduction and next gate

Local root: `.local/engine-perf/material-table-20261010/roof/`. It retains builds,
frozen graphs/manifests, patch recipes, complete capture rows, images and failed
pixel gates. Owner: engine performance audit. Retain until the failure is explained
and replacement evidence preserves its provenance.

Build `control` and `table` with the existing worker builder, explicit
`PERF_REBUILD_RENDERER=1`, and frozen graph/base HTML from
`fixed-render-fifo-20261009/roof/clock-rounding/`. Generate the candidate patch using
`rendering/material-table-recipe.ts` and pass its `material-table-patches.json`
through `PERF_SOURCE_PATCHES`. `PERF_TABLE_MERGE=0` generates the independent
`material-table-shader-patches.json` for `table-shader`.

Run `verify.ts` with `PERF_ARTIFACTS=control,table`, the `roof-compact-714` workload,
`PERF_CHECKPOINTS=0,60,240`, `PERF_CAPTURE_HZ=60`, visible high-performance GPU,
provenance and retained state/presentation sequences. Prefix `aa-off` sets
`PERF_RASTER_MODE=aa-off`; prefix `normal-aa` uses default raster. Run
`image-parity.ts` with `PERF_PIXEL_GATE=1` for each. `shader-normal-aa` uses
`control,table-shader` and `PERF_CAPTURE_CONTROL=normal-aa`; its image sources are
`normal-aa-inline,shader-normal-aa-worker`.

`rendering/material-table-results.ts` validates retained identities, work, images
and cleanup, then writes `material-table-results.json`, including failed gates.
Next: reproduce/localize the multisample difference at unchanged shader code and
draw order. Do not weaken the image gate or interpret draw reduction as frame-rate
improvement. Timing follows visual correctness.

## Same-context ABBA redraw diagnostic

The `redraw` artifact keeps one compiled table shader/context and alternates
A (unmerged), B (merged), B, A synchronously for each of two late-game packets.
There is no intervening simulation step or asynchronous boundary between those
four draws. Both inline and worker owners ran; raw WebGL and postprocessed images
are retained. This is an allocating PNG-readback correctness diagnostic, not timing.

| Comparison | Comparisons across owners, packets and image layers | Fail existing gate | Maximum changed pixels / channel difference |
| --- | ---: | ---: | ---: |
| A to B | 8 | 8 | 555 / 10 |
| B to B | 8 | 0 | 30 / 3 |
| B to A | 8 | 8 | 566 / 10 |
| First A to final A | 8 | 4 | 109 / 4 |

Surface draws follow `[898,223,223,898]` and `[897,222,222,897]` on the two
packets. Shadow draws and geometry counts stay equal. This reproduces the
merging-associated discrepancy without different shader programs, worlds or input
states. However, the separated A-to-A control also fails in four comparisons:
ordinary multisample variation, state carry-over and interval/order effects are
not isolated. Adjacent A repeats before and after B are the next control. No
exact raster mechanism, deterministic AA or promotion is established.

An offline feasibility check also found that requiring identical numeric material
values merges only four boundaries in these saved packets; excluding cutaway
materials changes no planned runs. Neither gives a strong alternative merging
contrast here, so no browser timing was spent on those variants.

`material-table-redraw-recipe.ts` patches the frozen clock-rounding controller's
bounded capture path and the renderer. Build `redraw` with its saved patch and
`PERF_REBUILD_RENDERER=1`. Capture prefix `redraw-normal-aa` uses artifact pair
`redraw,redraw`, `fighter-late-checkpoint.json`, checkpoints `0,1`, 60 Hz, visible
high-performance GPU, provenance, retained state/presentation sequences,
`PERF_IMAGE_LAYERS=1` and `PERF_RENDER_REPEATS=3`; command capture and explicit
MSAA targets are off. The private context toggle is reset in `finally`.

Run `material-table-redraw-results.ts` with `PERF_RENDER_REPORT_MODE=plan`, pass
the resulting `redraw-normal-aa-abba-plan.json` to `image-parity.ts` via
`PERF_IMAGE_BATCH`, then run the results script without plan mode. The report
preserves every failed comparison and validates actual draw counts and all owned
cleanup receipts. The batch deliberately records failures without a fail-fast
pixel gate; each row is still judged against the unchanged 100-pixel/maximum-3
limits. Five planner/GPU tests / 39 assertions and focused TypeScript checking pass.

### Adjacent unmerged controls

The follow-up `redraw-paired` artifact runs A,A,B,B,A,A synchronously, with all
other conditions retained. Each row below represents eight image comparisons
(two owners, two packets, raw/composited layers).

| Comparison | Fail existing gate | Maximum changed pixels / channel difference |
| --- | ---: | ---: |
| Adjacent A before B | 4 | 85 / 4 |
| A to B | 8 | 534 / 10 |
| Adjacent B | 0 | 8 / 1 |
| B to A | 8 | 574 / 10 |
| Adjacent A after B | 0 | 10 / 1 |
| First to final A | 3 | 55 / 4 |

The smaller repeat failure occurs before B, so intervening merged draws are not
necessary for it. Merging-associated changes remain larger and bidirectional.
Draw/warmup order still matters; this does not establish the exact multisample
mechanism or permit a tolerance increase. No candidate is promoted.

Generate the recipe with `PERF_TABLE_REDRAW_REPEATS=5`, producing the separate
`material-table-redraw-paired-patches.json`; build `redraw-paired`. Capture prefix
`paired-redraw-normal-aa` uses the prior workload/settings with
`PERF_RENDER_REPEATS=5`. The existing redraw-results script detects the retained
three- or five-repeat sequence and creates the corresponding comparison plan.
Raw captures, 24 pixel reports, source graph, manifest, cleanup and summary remain
under the same local root. These are diagnostic observations, not independent
throughput samples or statistical uncertainty intervals.

### Revised acceptance and remaining repeatability gap

The owner's later clarification permits different images across renderer versions;
the [current audit contract](../../touch-of-death-performance-audit.md#decisions)
owns acceptance. A-to-B differences above no longer reject merging by themselves.
Same-version repeatability remains unproven. In the same A,A,B,B,A,A sequence,
disabling dithering leaves 6/8 adjacent B comparisons non-exact (maximum four
pixels, channel difference nine). An explicit four-sample RGBA8/depth24 target
also leaves 6/8 adjacent B comparisons non-exact (maximum 31 pixels, channel
difference eight); 8/8 initial adjacent A comparisons differ. Neither diagnostic
fixes repeatability. Each maximum is across comparisons, not necessarily one image.

Raw prefixes are `paired-redraw-dither-off` and `paired-redraw-explicit` in the
existing evidence root. Both retain state/packet identity against
`paired-redraw-normal-aa`. Explicit-target receipts verify four samples, formats
and disabled default-canvas AA; explicit multisampling itself remains enabled.
All capture/pixel cleanup receipts are empty. These readback diagnostics provide
no throughput measurement or hardware-level explanation.

## Warmed repeatability follow-up

Prefixes `warm-redraw-normal-aa` and `warm-redraw-aa-off` repeat the same
A,A,B,B,A,A diagnostic at checkpoints **0, 60 and 240** of rooftop seed 714,
after the preceding logical draws. Earlier adjacent-repeat captures used only
checkpoints 0/1. Both owners use the same `redraw-paired` artifact, 60 Hz capture,
1366 by 768, high-performance RTX 4070 and bounded wake requests. Each raster
mode passes 482 independent state/pose checks; complete state and presentation
sequences also match between raster modes.

| Raster | Same-version comparisons | Non-exact | Adjacent merged repeats |
| --- | ---: | ---: | --- |
| Normal four-sample MSAA | 48 | 16 | 4/12 differ; maximum 100 pixels / channel difference 10 |
| AA off, verified zero sample buffers | 48 | 0 | All 12 exact |

Normal-AA initial adjacent A and first-to-final A each differ in 6/12 comparisons;
all final adjacent A comparisons are exact. Merged differences occur at checkpoint
0 for the worker owner and checkpoint 60 for inline, in both raw and composited
layers. The AA-off cross-version comparisons are also exact, but that is not an
acceptance requirement. These results narrow the observed failure to a
multisampling-dependent rendering path; they do not identify its mechanism or
prove sustained within-version determinism. No throughput was measured here.

Reproduce using the preceding paired-redraw recipe with `PERF_CHECKPOINTS=0,60,240`,
`PERF_KEEP_AWAKE=1` and the `roof-compact-714` workload. Retain full state and
presentation sequences, image layers and five repeats. Generate/execute each
24-plan pixel batch, then report AA-off with
`PERF_REDRAW_CONTROL=warm-redraw-normal-aa`. All qualified cleanup and wake
receipts pass.

The first normal-AA pixel batch exposed a cleanup-observer defect: a later
`conhost.exe` reused the departed browser PID. The shared inspector already
supports creation identities; browser evidence, capture and timing cleanup now
carry those identities, and image comparison takes one cleanup snapshot per
owned browser. Two regression tests preserve detection of an actual surviving
child while excluding recycled PIDs. Original receipts are archived under
`warm-redraw-normal-aa-pixels-first-attempt/`; all 24 pixel reports have identical
hashes after re-decoding the same saved PNGs. No image failure was discarded.

## Awake throughput screen

Eight serial ABBA/BAAB trials (`awake-table`) retain rooftop seed 714, normal AA,
1366 by 768, fresh visible/focused RTX 4070 Chrome, `worker-2-fresh`, two-buffer
fixed FIFO and the explicit `timer` schedule. Each trial warms for six seconds,
restores, and consumes 661 samples at 165 logical Hz. All 5,288 samples pass the
fixed-work, final-state, step/tick/pose-transition and queue checks. Worker binaries
and captured oracle manifests match. Wake, power, focus and browser-cleanup
receipts pass; no sleep is suspected. Empty rAF median is 165.02 Hz with 0.05% spread.

| Median of four trials | Control | Material table |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 93.65 | 104.07 |
| WebGL CPU submission p50, ms | 2.50 | 1.75 |
| Whole main update p50, ms | 4.40 | 3.70 |
| Worker compute / preparation p50, ms | 7.95 / 5.65 | 7.40 / 5.50 |
| Submission interval p50 / p95 / p99 / p99.9, ms | 11.60 / 18.05 / 20.35 / 23.60 | 8.80 / 17.60 / 18.70 / 24.10 |
| Submission deadlines missed | 85.15% | 74.85% |
| Capacity range / median | 9.07% | 6.93% |

Paired capacity effect is **+11.50%**, exploratory 95% interval **[+0.93%, +23.18%]**.
The CPU result agrees with avoided work, but control drift fails the declared
gate. Classify total-capacity benefit as promising/inconclusive pending independent
sessions. No GPU queries were recorded by these frozen artifacts, so no device-time
claim is supported. Separate draw/post fields are also unavailable; WebGL CPU time
comes from retained start/end endpoints in all samples. Missing fields are `null`,
never zero. CPU/worker/GPU durations are not added.

Exact per-sample structural counts repeat across all four trials of each artifact.
Total draws, including shadows, average **2,440.94 → 1,578.01** per sample; material
bindings **1,217.38 → 353.66**. Shadow and outline counts are unchanged at every
sample. The candidate uploads **215,200 extra bytes per sample** and adds two
private texture binds beyond existing renderer counters. GPU table-fetch traffic
and hardware cache behavior remain unmeasured.

Both versions repeat the submitted pose on **72.12%** of comparable samples. This
is a four-logical-second fixed-work workload running slower than real time; its
capacity is not live gameplay FPS, distinct-motion rate or physical presentation.
Within-version AA variation described above still prevents renderer acceptance.

Reproduction uses `compare.ts` with explicit root/workload, `PERF_PREFIX=awake-table`,
eight `worker-2-fresh` entries, artifact order
`control,table,table,control,table,control,control,table`, and:
`PERF_HEADLESS=0`, `PERF_GPU=high-performance`, `PERF_EXPECT_RENDERER=RTX 4070`,
`PERF_PROVENANCE=1`, `PERF_WARMUP_SECONDS=6`, `PERF_MEASURE_SECONDS=10`,
`PERF_RESET_AFTER_WARMUP=1`, `PERF_CONTIGUOUS_WARMUP=1`,
`PERF_FIXED_REPLAY_FRAMES=661`, `PERF_FIXED_REPLAY_HZ=165`,
`PERF_FIXED_REPLAY_FIFO=1`, `PERF_POWER=1`, `PERF_REQUIRE_AC=1`, `PERF_KEEP_AWAKE=1`.
No profile, trace, allocation observer or image readback runs during timing.

Run `rendering/ablation-results.ts` with `PERF_CONTROL_ARTIFACT=control`,
`PERF_CANDIDATE=table` and `PERF_FIXED_REFERENCE` pointing to trial 1. Then run
`rendering/material-table-results.ts` with the same root/prefix to verify the
captured manifests and per-sample work. Raw plans, samples, manifests and reports
remain in the existing material-table evidence root. The reporting-only missing
draw/post-field failure was repaired without rerunning or replacing measurements.
Final verification passes 23 focused tests / 129 assertions, the worker and
rendering tooling TypeScript checks and process policy. The shared managed server
has no unresolved errors. These checks validate the experiment tooling and
resource contracts, not six-arena or sustained gameplay acceptance.
