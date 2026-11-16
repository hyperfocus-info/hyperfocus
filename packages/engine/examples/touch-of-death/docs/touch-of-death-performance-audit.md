# Touch of Death performance — October 10, 2026

**165 Hz fresh-motion gameplay remains unproven.** On this i9-13900HX / RTX 4070
Laptop, awake empty-page controls now pace near 165 callbacks/s. Recent rooftop
full-service combined batching reaches 140–145 submissions/s versus 119–138/s
material-table controls, but only 56–61 changed poses/s. Most intervals miss 6.06 ms,
and same-version MSAA repeatability fails. A separately versioned spatial-AA
candidate now passes short six-arena repeatability; its throughput is unmeasured.
Callbacks and submissions do not prove physical screen presents.

The user views the physical monitor directly. Chrome uses inherited NVIDIA
settings; the [read-only inventory](history/performance/october-10-driver-profile.md)
retains known values and unknowns. No driver or power setting was changed.
Bounded wake requests show no suspected sleep in the latest runs. Sleep remains
an unproven explanation for the [earlier 130 Hz fallback](history/performance/october-10-in-window-system-counters.md).

The [configurable performance lab and bounded first screen](touch-of-death-performance-lab.md)
now provide 51 controls in one diagnostic artifact. Its full-object baseline,
headless measurements and explicit unported inventory are separate from the
historical acceptance cohorts below. The requested first screen is finished;
no further optimization campaign was started.

## Decisions

Owner clarification: different renderer versions may produce different images.
Each version must reproduce its own output from identical instructions, resources
and controlled initial history. Gameplay correctness remains required. Exact
same-version MSAA repeatability is still unresolved; AA-off equality and an
image-tolerance pass do not satisfy it. The [spatial-AA replacement](history/performance/october-10-spatial-aa.md)
passes 144 repeated-image and 36 cross-context comparisons across six arenas,
plus 12 corrected rooftop redraw comparisons. Its thin edges are rougher; sustained
repeatability, cost and visual-quality acceptance remain open. Nothing new is promoted.

A [six-variant shader isolation screen](history/performance/october-10-shader-repeatability.md)
still fails exact normal-AA repeats with equal observed GL state/calls/uploads.
Dot-product bounds, lighting/cutaway switches and shadow-sampling changes are not
sufficient fixes. Complete resident GPU state and the raster mechanism remain open.
The [upload/MSAA follow-up](history/performance/october-10-upload-msaa-isolation.md)
locates cross-context material-ID differences in unused opaque slots. A small
fixed-resource fixture passes 396 exact comparisons; full-game repeats still fail.

Keep the previously accepted bound lookups, shared validation, hoisted rays and
cached VAOs from the [October 8 re-audit](history/performance/october-8-presentation-rays.md).
Worker ownership remains opt-in; the shared playable is unchanged.

## Ranked bottlenecks

| Priority | Evidence | Confidence and consequence |
| --- | --- | --- |
| Main-thread display preparation/application | Every display still applies 3,391 entities and 1,702 materials. With combined batching, endpoint/interior preparation is 1.4–1.5 / 2.4–2.5 ms; main-to-submit p95 remains 6.6–6.9 ms. [Application profile](history/performance/october-10-material-input-versions.md) identifies material and entity scans. | High that tails miss budget. Remove complete scans/copies/check work with valid invalidation. |
| Rendering and command volume | [Combined batching](history/performance/october-10-display-combined-batching.md) removes another 6,960–11,480 GL calls over material tables alone; GPU trial medians fall from 4.58 to 2.47 ms. [Separate material-table traces](history/performance/october-10-display-material-table.md) nearly eliminate buffer-space waits. | Strong work-reduction evidence; combined timing has 15.54% control drift and normal-AA fails. Candidate GPU p95 3.95–4.45 ms excludes post/HUD/compositor. CPU/GPU durations overlap and must not be summed. |
| Publication and scheduling | [Compact publication](history/performance/october-10-compact-publication.md) reduces post-call wall time 5.8→0.6 ms, plus packing/decoding. Latest producer-through-post remains about 11 ms. Combined batching reaches 56–61 changed poses/s with 58–60% repeats. | High that faster drawing alone does not deliver fresh motion. More publications also mean more packing, cloning and decoding. |
| Allocation and stalls | [Separate display traces](history/performance/october-10-display-scheduling.md#separate-traces-and-repeatability) retain main/worker GC, thread CPU and wall spans. Trace marks themselves consume substantial sampled time. | Allocation attribution is incomplete. Heap deltas and logical bytes are not retained-memory, cache-miss or RAM-bus measurements. |

## Short experiment results

| Experiment | Work/result | Decision |
| --- | --- | --- |
| [Packed float-bit comparison; contiguous cache](history/performance/october-10-material-words.md) | Resource checks and scan counts retained. Layout fixture reduces 4,096 backing buffers to two. Capacity effects −0.24% and −0.35%, both uncertainty intervals span gains/losses. | Inconclusive; locality benefit is not established by fewer buffers alone. |
| [Owned material-input versions](history/performance/october-10-material-input-versions.md) / [per-material revisions](history/performance/october-10-material-input-revisions.md) | Revisions preserve reuse across publications: 99.77% of deep comparisons avoided, resource scans retained, +13,616 bytes/publication. Endpoint prep 2.1–2.3→1.5 ms; paired submissions −1.14% / +2.58%, control spread 4.64%. | Preparation improvement; full-loop gain inconclusive. Larger WebGL wall time needs attribution. |
| [Obstruction query cache](history/performance/october-10-query-cache-rescreen.md) | Depot avoids 77% of eligible queries; prep 6.0→5.5 ms, paired capacity +3.56% (+1.30% to +5.88%). Rooftop inconclusive. | Promising; broader invalidation, sessions and AA repeatability remain open. |
| [Zero-step reuse](history/performance/october-10-zero-step-rescreen.md) | Skips 63.54% of preparation; 11 invalidation checks pass. Capacity +13.48%, but control spread 9.93% and p95 worsens. | Experimental; resource/live-motion acceptance incomplete. |
| [Material table in the complete display loop](history/performance/october-10-display-material-table.md) | Same-state surface draws 1,233→296; +215,200 upload bytes. Live paired submissions +27.22% / +31.59%, control spread 3.53%; traced command waits nearly vanish. | Strong candidate; 7/14 same-version normal-AA pairs fail, 6/6 AA-off pairs exact. No promotion. |
| [Camera culling](history/performance/october-10-culling-shadow-rescreen.md) | CPU submission 2.10→1.50 ms; capacity inconclusive. | Stable controls and AA unresolved. |
| [Shadow batching in the full loop](history/performance/october-10-display-shadow-batching.md) | 73–78% fewer shadow draws; GPU trial medians 6.06→4.80 ms; paired submissions +15.94%. Changed poses do not improve. | 8.10% control spread fails stability; normal-AA fails. No promotion. |
| [Material + shadow batching](history/performance/october-10-display-combined-batching.md) | Same non-shadow work/uploads; GPU trial medians 4.58→2.47 ms. Paired submissions +12.28%, interval −0.38% to +26.54%. | 15.54% control spread; fresh-pose gain inconclusive; both versions fail normal-AA. No promotion. |
| [Spatial AA replacement](history/performance/october-10-spatial-aa.md) | Single-sample target plus one filter draw; exact short six-arena repeats, 28 lifecycle checks. Fixed unarmed weapon-hint interpolation. | Bounded determinism passes; throughput unmeasured. No promotion. |
| [Light-volume culling](history/performance/october-10-light-culling-rescreen.md) | Extra scans/storage remove no shadow draws in the tested depot workload. | Reject this variant for this workload. |
| [Compact display interpolation](history/performance/october-10-compact-publication.md) | Removes redundant publication copies; supplies distinct live interiors. | Useful private baseline; resource epochs, latency and six-arena acceptance open. |
| [Lazy entity blend plan](history/performance/october-10-interpolation-preparation.md) | Avoids about 83% of blends but still populates every transform, adds scans and gets no live plan reuse. Interior preparation 3.2→3.6 ms. | Reject for the tested schedule. |
| [Isolated early input requests](history/performance/october-10-display-scheduling.md) | Repeats fall from 48–49% to 39–40%; submissions fall from 100–103/s to 96–99/s. | Motion/work trade-off, no throughput promotion. |
| [Longer interpolation delay](history/performance/october-10-display-scheduling.md) | Changed poses rise from 48–53/s to 79–81/s; repeats fall to 17–18%. Pose age rises to 40 ms; applied-input age proxy to 61 ms. | More motion, older state; not 165 Hz or an accepted latency trade-off. |

The latest combined-batching ABBA/BAAB contains 6,472 submissions; candidate p95
intervals are 9.5–10.0 ms and 55–63% exceed budget. Focus/wake checks pass, but
control drift and the paired uncertainty interval prevent a throughput decision.
The [report](history/performance/october-10-display-combined-batching.md) retains
raw data, capture-bound input checks, repeatability failures and reproduction.

## Bounds and remaining evidence

Earlier native backing-size controls (2561×1398, DPR 1.5) reach approximately
165 empty callbacks/s, 165 cached-depot / 162 cached-rooftop submissions/s, and
76 full-service rooftop frames/s. Simple 40,000/60,000-entity scenes reach
165/140 callbacks/s under a different workload. These are separate bounds, not
an absolute ceiling or directly comparable to current 1366×768 trials.

[Fresh-work ablations](history/performance/october-9-fresh-render-ablations.md),
[resolution](history/performance/october-10-resolution-ablation.md),
[zero-instance processing](history/performance/october-10-primitive-processing.md)
and [empty dispatch](history/performance/october-10-empty-draw-dispatch.md)
separate rendering costs; no simplified pass proves the gameplay goal.
[Draw/material sweeps](history/performance/october-10-command-sweeps.md) are fixture
scaling evidence. [Producer-rate correctness](history/performance/october-10-producer-rate-correctness.md)
and [complete-frame replay](history/performance/october-10-evaluated-frame-replay.md)
pass bounded rooftop numeric checks, not complete architecture acceptance.

Still required: stable independent sessions; resource/restore/teleport invalidation;
sustained within-version AA; actual input-to-visible response and physical presentation;
representative JS/SoA/scalar/SIMD Wasm comparisons including boundaries/copies;
six arenas, skinned crowds, dense collision/KO; sustained thermal and retained-memory
evidence. CPU-cache misses and RAM-bus traffic remain unmeasured. No final library
architecture is selected before those comparisons.

The [pipeline and critical-path map](touch-of-death-frame-pipeline.md) owns threads,
queues, writers and instrumentation. The [ordered plan](touch-of-death-165-plan.md)
owns remaining experiments and gates. At the user's request, stop expanding separate
builds/campaigns. Next consolidate existing candidates and coarse subsystem ablations
into one configurable build, test configurations serially, and expose actual skipped
work. The compact full-loop prototype is an experimental preset, not a promoted default.
