# October 10: material batching in the complete display pipeline

**Promising throughput result; no promotion.** The existing GPU material-table
prototype now runs on the compact publication/per-material revision pipeline.
The short live ABBA screen improves submissions by 27.22% / 31.59% in its two
pairs. A separate trace nearly eliminates the previously observed command-buffer
space waits. Fresh motion still reaches only about 55 changed poses/s, and exact
within-version normal-AA repeats fail. 165 Hz gameplay remains unproven.

## Controlled change and structural evidence

Both frozen builds retain the same producer binary, full services, 60 Hz fixed
simulation/producer request rate, 16.67 ms interpolation delay, packed publication,
material revisions, complete entity application and timer scheduling. Only the
renderer changes, plus a variant label. Shared observation adds draw, shadow,
outline, material-binding, upload-byte and resource-upload counters to display
rows. The [earlier table report](october-10-material-table.md) owns the algorithm.

The table groups compatible adjacent transparent instances in their existing
order. All five texture slots, flags, mesh and skeleton participate in eligibility.
Current resource checks remain. Numeric values and instance IDs upload every draw;
this version does not assume unchanged materials or skip preparation. Shadow and
outline paths retain their original draws.

| Same-state rooftop checkpoint | Control | Table |
| --- | ---: | ---: |
| Surface draws, sample 0 | 896 | 220 |
| Surface draws, sample 1 | 899 | 222 |
| Surface draws, sample 60 | 1,233 | 296 |
| Material bindings, sample 60 | 1,262 | 325 |
| Shadow / outline draws, sample 60 | 1,233 / 77 | 1,233 / 77 |
| Extra logical upload bytes per draw | 0 | 215,200 |

Fourteen captured checkpoints across both owners and the restore replay preserve
geometry, shadows, outlines, dimensions and mesh/texture-upload counts. The upload
delta is exactly 215,200 bytes at every checkpoint. Private table texture updates
are included in bytes but not the renderer's texture-upload/binding counters;
there are two extra table uploads and binds per warmed draw.

The planner adds a command scan, transparent-instance ID fills and a capacity-sized
ID-buffer copy. Four reusable Uint32 planner arrays and a padded ID array are
owned per context, with two GPU textures; the per-call return wrapper still
allocates. Resource disposal/context abandonment is tested. These source-level
storage facts and logical counters are not measured cache misses, RAM traffic,
GPU fetch bandwidth or retained working set.

## Live ABBA screen

i9-13900HX, RTX 4070 Laptop, Chrome 154.0.8037.58, visible/focused window,
1366 x 768, DPR 1, normal AA, rooftop seed 714. Each fresh browser warms for six
seconds, restores the checkpoint, then measures six seconds. No trace, CPU sample
profile, readback, build, test or second audit browser runs during timing.

| Metric | A1 control | B1 table | B2 table | A2 control |
| --- | ---: | ---: | ---: | ---: |
| Submissions/s | 102.95 | 130.97 | 130.77 | 99.38 |
| Changed poses/s | 51.06 | 55.28 | 54.83 | 49.19 |
| Repeated poses | 50.32% | 57.74% | 58.02% | 50.42% |
| Longest consecutive repeats after first | 28 | 34 | 36 | 27 |
| Main-to-submit p50 / p95, ms | 6.9 / 9.4 | 4.7 / 7.1 | 4.7 / 7.1 | 7.2 / 9.6 |
| WebGL wall p50 / p95, ms | 3.0 / 6.2 | 1.8 / 3.3 | 1.8 / 3.1 | 3.2 / 6.5 |
| GPU draw p50 / p95, ms | 5.929 / 8.068 | 4.422 / 6.205 | 4.385 / 6.098 | 6.185 / 9.022 |
| Submit interval p50 / p95, ms | 9.70 / 13.30 | 7.10 / 11.20 | 7.10 / 10.40 | 9.90 / 13.70 |
| Submit interval p99 / p99.9, ms | 17.90 / 28.10 | 15.50 / 19.20 | 16.90 / 19.40 | 17.20 / 18.90 |
| Intervals exceeding 6.06 ms | 96.29% | 72.84% | 78.12% | 98.83% |
| Pose age at submit p50, ms | 29.8 | 28.0 | 28.0 | 30.2 |
| Applied-input-to-submit proxy p50, ms | 42.6 | 39.3 | 39.2 | 43.1 |

There are 2,795 submissions, 2,791 intervals and 2,795 valid asynchronous GPU
queries. Fixed-step counts are 360/359/359/359 with no gaps; producer acquisitions
are 274/274/274/269. Producer-through-post p50 stays 10.9/11.0/11.1/11.4 ms.
Endpoint preparation p50 stays 1.4-1.6 ms; interpolated preparation 2.5-2.7 ms.
Neither interpolated poses nor submissions are additional simulation ticks.

Control spread is 3.53%; candidate spread 0.16%. The two observed paired gains
exceed that control spread, supporting another experiment. Two live pairs in one
session do not support a reliable acceptance confidence interval. Elapsed-time
gameplay work differs; exact per-sample reductions come from the manual captures,
not averages of these live trials. Independent sessions remain necessary.

Empty-page mean intervals are 6.059-6.062 ms. All focus, AC and bounded wake checks
pass without suspected sleep or expired guards. GPU boundary temperatures are
70-72 C; boundary clocks are 210-1,125 MHz. These samples occur outside timing and
cannot establish in-window frequency, utilization or throttling. CPU temperature,
in-window clocks, complete competing-process activity and retained memory remain
unrecorded. Main sampled heap ranges from 43.6 to 69.7 MB across boundaries;
that is neither allocation rate nor retained memory. Full raw boundary samples
are saved. No driver/power settings changed.

## Separate command-wait traces

Four additional ABBA windows measure three seconds after the same warmup. They
retain renderer main, worker, compositor and GPU-process events, without CPU
sampling or detailed per-frame marks. All four trace files are complete,
46.4-51.0 MB each. These diagnostic trials are not pooled into live timing.

| Trace observation | A1 | B1 | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| Window, ms | 3,022.024 | 3,011.137 | 3,019.690 | 3,013.749 |
| Display submissions | 326 | 389 | 394 | 314 |
| Command-buffer-space wait events | 147 | 1 | 0 | 140 |
| Wait wall union, ms | 174.262 | 1.463 | 0 observed | 166.119 |
| Recorded CPU inside those waits, ms | 3.280 | 0.053 | no events | 8.645 |
| WebGL bracket mean wall, ms | 2.751 | 1.590 | 1.569 | 2.822 |
| GPU-process task CPU, ms | 2,855.754 | 2,580.303 | 2,597.659 | 2,855.642 |
| Main-thread GC wall, ms | 45.664 | 43.399 | 38.162 | 37.274 |
| Worker GC wall, ms | 67.337 | 69.440 | 70.057 | 71.707 |

The event is `CommandBufferHelper::WaitForAvailableEntries1`; its nested proxy
wait must not be added again. The [previous attribution](october-10-submission-backpressure.md)
owns marker interpretation and clock methodology. Clock-bound widths are
2.000-2.076 ms with the explicit 1 ms rounding allowance; guaranteed/possible
wait-overlap rows are 46/101, 0/1, 0/0 and 42/90. Missing events do not prove the
absence of every wait. GPU-process task CPU is not GPU-device execution.

This intervention strongly supports command volume/backpressure as a contributor.
It does not assign every saved millisecond to waiting: shader work, draw dispatch,
driver CPU and device time also change. CPU/GPU durations overlap and are not added.

## Correctness, repeatability and decision

Normal-AA short and restore captures match the archived compact reference's full
state/presentation sequences and every intermediate pose hash: 968 endpoint checks,
484 repeat checks, 484 audio-once checks and 242 inline source-mutation probes.
Both inline and worker owners pass. The restore run uses 181 publications at a
requested 165 Hz; this manual replay is not a throughput measurement.

**Exact same-version normal-AA fails in 7/14 image pairs:** up to 200 changed
pixels and maximum channel difference 11. The maxima occur in different pairs.
Cross-version image differences are allowed by the owner and are not this failure.
The same short diagnostic with AA disabled passes all six exact image pairs and
all numeric comparisons. AA-off equality does not pass the normal-AA gate.
The new variant still needs per-call/resource-history attribution of its AA
failure; numeric packet equality alone does not prove identical low-level GL calls.

Seven focused planner/lifecycle/capture-comparator tests pass (50 assertions),
focused TypeScript checking passes, and process policy reports 4,893 files with
zero violations. Owned browser cleanup and wake receipts are retained. No shared
playable default or engine runtime was promoted.

| Hypothesis | Variable / expected signature | Result / uncertainty | Decision |
| --- | --- | --- | --- |
| Ordered material batching relieves submission pressure | Renderer only; fewer draws/binds and buffer-space waits | Fixed-state work reduction, +27.22%/+31.59% live submissions, waits nearly vanish; one session | Strong candidate for further testing |
| Faster rendering supplies 165 Hz fresh motion | Same producer/preparation; more distinct poses | Only 54.8-55.3 changed poses/s, repeated poses rise, most intervals miss budget | Not established |
| This renderer reproduces its own images | Same-version repeated prepared poses | 7/14 normal-AA pairs fail; 6/6 AA-off exact | Determinism gate failed |

Next small milestone: test shadow batching separately on the same complete
pipeline, then combine only after its individual effect is measured. Keep the
material-table version private while isolating its AA failure. Promotion requires
independent stable sessions, repeatable production AA, complete invalidation and
resource/context restoration, six arenas/skinned crowds/dense collision/KO,
sustained memory/thermal evidence and accepted input-to-visible latency.
This experiment does not select the final JS/Wasm layout or worker topology.

## Reproduction and local evidence

Local root: `.local/engine-perf/display-material-table-20261010/roof/`.
Owner: engine performance audit. Retain until replacement evidence preserves the
source hashes, raw samples and unresolved AA failure. Frozen worker SHA-256:
`8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.
`source-comparison.json` records both runtime hashes and all five changed modules.

From the repository root, set `PERF_ROOT` above, `PERF_FROZEN_SOURCES` to
`material-revisions-20261010/roof/revision-candidate/sources.json` under
`.local/engine-perf/`, and `PERF_BASE_HTML` to that artifact's `index.html`.
Set `PERF_TABLE_DISPLAY=1`; run `rendering/material-table-recipe.ts`, then
`build.ts display-control` / `build.ts display-table` with
`PERF_REBUILD_RENDERER=1` and the generated control/candidate patch paths in
`PERF_SOURCE_PATCHES`. All script paths start `spikes/persistent-world-worker/`.

Capture with `verify.ts`, `PERF_ARTIFACTS=display-table,display-table`, the retained
`worker-arena-campaign-20261008/workloads/roof-compact-714/workload.json`, and
`PERF_DISPLAY_CAPTURE=1`, `PERF_PROVENANCE=1`, `PERF_RETAIN_STATE_SEQUENCE=1`,
`PERF_COUNT_VISUAL_CHANGES=1`, `PERF_KEEP_AWAKE=1`, `PERF_HEADLESS=0`,
`PERF_GPU=high-performance`, `PERF_EXPECT_RENDERER=RTX 4070`.
`table-short` uses 60 Hz and checkpoints 0/1/60. `table-restore` uses 165 Hz,
0/60/120/180 and `fixed-render-fifo-20261009/roof/fighter-endpoint-schedule.json`.
`table-aa-off` repeats the short capture with `PERF_RASTER_MODE=aa-off`.
Run `presentation/display-results.ts` against matching compact-publication
`packed-short` / `packed-restore` references, then `image-parity.ts` with the saved
`image-plan.json` or `image-aa-off-plan.json` in `PERF_IMAGE_BATCH` and
`PERF_PIXEL_EXACT=1`. The normal-AA command deliberately exits 1 after saving data.

Timing uses `compare.ts`: `PERF_PREFIX=table-abba`, artifacts
`display-control,display-table,display-table,display-control`, four
`worker-2-fresh` sequence entries and four `timer` scheduling entries. Set
`PERF_WARMUP_SECONDS=6`, `PERF_MEASURE_SECONDS=6`, `PERF_RESET_AFTER_WARMUP=1`,
`PERF_DIAGNOSTIC=1`, `PERF_PROVENANCE=1`, `PERF_POWER=1`, `PERF_REQUIRE_AC=1`,
and the same workload/wake/GPU/visible settings. Clear capture-only settings.
Run `presentation/display-live-results.ts` with that root/prefix afterward.

Trace repetition uses prefix `table-trace`, measure seconds 3, `PERF_TRACE=1`,
`PERF_PROFILE=0`, `PERF_TRACE_PROVENANCE=0`, `PERF_TRACE_MAX_MIB=128`, categories
`toplevel,gpu,devtools.timeline,blink.user_timing`. Run `trace-analysis.ts` and
`diagnostics/submission-trace.ts`. Saved plans, trial rows, captures, images,
pixel failures, raw traces, `screen-summary.json`, `structural-summary.json`,
`trace-summary.json` and `validation.json` retain the evidence and controls.
