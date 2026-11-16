# October 10: shadow batching GPU follow-up

**A promising GPU signal, not a promotion.** The lower GPU duration reproduces
with both segmented and whole-render queries. Whole-render medians fall from
5.16 to 3.75 ms, but repeated-control variation still fails the declared stability
gate, overall capacity is inconclusive and same-version MSAA repeats remain
non-exact. Worker preparation remains about 6.2 ms. Useful 165 Hz gameplay is unproven.

## Controlled experiment

The previous [ordinary-throughput screen](october-10-culling-shadow-rescreen.md)
found lower CPU submission cost but no stable full-pipeline gain. This follow-up
adds GPU observation to those exact frozen renderer versions. Simulation, worker
binary, geometry, material/resource checks, services and input workload remain
unchanged. Shadow batching merges adjacent compatible ranges in their original
order; it changes only the shadow-loop portion of the archived pass module.

Both cohorts use depot seed 2026, visible/focused RTX 4070 Chrome, 1366 by 768,
DPR 1, normal MSAA, timer scheduling, two-buffer FIFO, AC and the unchanged
high-performance scheme. Each has eight ABBA/BAAB trials, six-second initial
warmup, restore/complete contiguous warmup, 661 fixed samples at 165 logical Hz
and a 15-second bound. Warmup uses `park-restore-clear-v2`. Bounded wake requests
are released after each run. No audit builds, tests, profiles, pixel readbacks or
second audit browser ran during timing.

These are diagnostic cohorts: `PERF_DIAGNOSTIC=1` also adds preparation counters,
and `PERF_GPU_STREAM=1` polls device-wide telemetry every 500 ms. Observer overhead
is uncalibrated. Do not pool their timings with the ordinary-throughput screen or
use the comparison between cohorts as an observer-overhead estimate.

| Experiment | Expected signature | Result | Uncertainty / decision |
| --- | --- | --- | --- |
| Five sequential GPU ranges | Less elapsed shadow work with identical non-shadow submission | Shadow median 1.783 to 1.011 ms; same-frame range sum 5.375 to 3.764 ms | Positive paired signal, but 21.30% shadow-control and 13.81% sum-control variation fail stability; unexpected outline shift needs attribution |
| One whole-render query | Reduction persists without the per-pass boundaries | GPU median 5.159 to 3.750 ms; all four pairs improve | Ratio effect +37.47%, exploratory 95% interval +30.40% to +44.93%; 6.41% control variation fails the declared 5% gate |
| Instrumented end-to-end fixed work | Faster exact replay if rendering limits the pipeline | Segmented capacity +3.30%; whole-query +0.95% | Intervals −6.73% to +14.41% / −4.30% to +6.48%: inconclusive |
| Same-version normal-AA redraw | Reproducible pixels from each version | Six of twelve raw/composited comparisons non-exact | Repeatability unresolved; no promotion |

Ratio effects use control/candidate, not percent time saved. The whole-query
paired ratio corresponds to about 27.3% less elapsed GPU time; its magnitude and
critical-path benefit still need stable independent confirmation. The two cohorts
are sequential tests in this session, not independent-session replication.

## Work, validity and GPU attribution

All 10,576 samples pass the fixed final-state, tick/step/input-packet-pose and FIFO
gates against the previous ordinary-throughput reference. Every sample's draw,
shadow, outline, material-binding and upload counts match its original artifact.
Mean shadow draws remain 982.74 versus 299.90; total draws are 2,044.61 versus
1,361.78. Surface/outline geometry and upload bytes are unchanged. Each packet is
725,316 bytes; two transfer buffers retain 1,450,632 bytes. Counts and logical
storage are not hardware cache misses, RAM traffic or total working set.

The sequential observer keeps at most 40 pending queries plus one active query.
The whole-render observer keeps eight pending plus one active. Both read results
only after availability and invalidate pending results on a shared-context disjoint
event. Neither forces GPU completion. Each segmented pass has 660 valid queries
out of 661, with the final query pending; whole-query coverage is 659–660 of 661.
There are no disjoint, invalid-result, queue-full or context-lost rows in these
completed cohorts. Incomplete frames never enter the same-frame range sum.

| Segmented median GPU range, ms | Control | Shadow batching |
| --- | ---: | ---: |
| Before shadow | 0.022 | 0.022 |
| Shadow | 1.783 | 1.011 |
| Before outline | 0.000 | 0.000 |
| Outline | 0.845 | 0.035 |
| Surface | 2.735 | 2.635 |
| Complete same-frame range sum | 5.375 | 3.764 |

The outline submission code/counts and CPU median (0.10 ms) are unchanged, yet
its GPU range moves markedly. This is **not evidence of an outline optimization**.
Deferred work, dependencies across passes, device idling and query boundaries are
possible explanations, not established causes. The whole-query result reduces
concern that the aggregate signal requires those boundaries; it does not identify
where GPU execution was saved or validate every per-pass attribution. Same-frame
sums exclude query gaps; both observers exclude Canvas2D post and browser
compositing. GPU elapsed queries may include idle time. CPU/GPU durations overlap
and must not be added into a serial frame budget.

Whole-query GPU p50 spreads are 6.41% / 2.05% for control/candidate. Its CPU WebGL
submission p50 is 2.05 / 1.80 ms and whole main update p50 is 3.95 / 3.60 ms.
Worker preparation is 6.20 / 6.15 ms, with compute 8.00 / 7.90 ms.

| Whole-query fixed-work metric | Control | Shadow batching |
| --- | ---: | ---: |
| Median capacity, samples/s | 96.85 | 98.51 |
| Capacity spread | 4.40% | 5.55% |
| Submission interval p50 / p95, ms | 11.70 / 17.90 | 11.80 / 17.80 |
| Submission interval p99 / p99.9, ms | 21.15 / 30.55 | 24.10 / 34.25 |
| Missed 6.06 ms submission deadlines | 79.92% | 80.68% |

Input-packet poses repeat 77.27% of transitions, with a longest repeat run of 49.
These identities precede rendering and do not establish distinct visible poses.
Fixed-work capacity is not live FPS or input-to-visible-response latency.

## Environment, images and evidence gaps

The GPU stream retains 100 segmented-cohort and 102 whole-cohort readings whose
query and receipt timestamps are both inside measurement windows. Per-trial GPU
temperature medians are 71–74°C, graphics-clock medians 750–1,080 MHz and device-wide
utilization medians 26–35%. The raw readings show changing clocks and power states
within runs. These coarse, device-wide samples cannot resolve frame-level clocks,
attribute other processes or prove the cause of control drift. The raw clock-reason
bitmasks are retained without inferring a thermal cause. CPU temperature and
hardware memory counters remain unavailable; per-thread execution was not traced
in this diagnostic. Device memory readings are not the renderer's retained heap.

Empty rAF medians hold 165.02 Hz with 0.066% / 0.033% spread, and wake receipts show
no sleep indication. This does not prove scanout or explain the earlier 130 Hz cap.
The slower seventh segmented control is retained; its 13.52% capacity spread is
part of the inconclusive end-to-end result.

New segmented-build captures cover 241 samples per owner at 60 logical Hz, with
independent gameplay/pose checks and complete state/packet/presentation parity.
Their complete state and presentation hashes match the original artifacts.
Cross-version normal-AA pixels differ by 0/14/22 at checkpoints 0/60/240, maximum
channel difference 2; the revised owner contract permits those differences.
Same-version repeats differ at control checkpoint 60 and candidate checkpoints
60/240 in both layers. These are packet-redraw checks, not a complete proof of
identical GL state/instructions. Earlier AA-off evidence remains in the preceding
screen; AA-off was not recaptured here. The whole-query build preserves the
original renderer/controller source and has no new image capture.

Next discriminating work: explain the query/outline shift and control drift,
calibrate observer overhead, confirm ordinary-throughput benefit in independent
sessions, and resolve same-version MSAA behavior. Native viewport, six arenas,
skinned crowds, resource mutations, sustained memory/thermal behavior and live
interpolation/latency still require their own acceptance. No production default
or global driver/power setting changed.

## Reproduction and saved data

Owner: engine performance audit. Roots:
`.local/engine-perf/shadow-gpu-rescreen-20261010/depot/` and sibling `depot-whole/`.
Retain builds, recipes, images, raw rows, device streams and cleanup receipts until
replacement evidence preserves provenance and the unresolved findings.

`rendering/per-pass-recipe.ts` accepts the destination `PERF_ROOT`, each original
artifact's `PERF_FROZEN_SOURCES` under `shadow-rescreen-20261010/depot/`, and
`PERF_RENDER_VARIANT=control` or `shadow-batch`. Default timer mode is `segmented`;
the second root sets `PERF_GPU_TIMER_MODE=whole`. Build using the emitted
`<variant>-pass-patches.json`, `PERF_REBUILD_RENDERER=1`, the same frozen source
graph and `PERF_BASE_HTML=.local/engine-perf/incremental-20261009/depot-control/index.html`.
Require original worker hashes and preserve the saved source graph/patches.

The segmented `correctness` capture uses the previous screen's normal-AA settings
plus `PERF_CAPTURE_DETAILS=1`. The existing image planner/reporter accepts
`PERF_RENDER_RECIPE` pointing to the original `shadow-batch-recipe.json`.

Run `compare.ts` with prefixes `awake-shadow-gpu` and `awake-shadow-whole`, eight
`worker-2-fresh` entries and artifact order
`control,shadow-batch,shadow-batch,control,shadow-batch,control,control,shadow-batch`.
Use the depot-2026 workload, fixed frames 661 / Hz 165 / FIFO, six-second warmup,
15-second measurement bound, reset and contiguous warmup, provenance, visible
high-performance RTX 4070, wake protection, power/AC checks, diagnostic mode and
GPU streaming. Each `<prefix>-plan.json` records the exact configuration.

Run `rendering/ablation-results.ts` with control artifact `control`, candidate
`shadow-batch`, and the original `awake-render-boundary-1-worker-2-fresh.json` as
`PERF_FIXED_REFERENCE`. Then run `rendering/pass-results.ts` with
`PERF_UNINSTRUMENTED_ROOT=.local/engine-perf/shadow-rescreen-20261010/depot` and
`PERF_UNINSTRUMENTED_PREFIX=awake-render-boundary`. `gpu-stream-analysis.ts` uses
the current root/prefix; `control-drift.ts` uses `PERF_REPORT=<prefix>` and retains
eight drift rows per cohort. No raw timing is replaced by the derived report.

Nine focused tests / 62 assertions and the rendering-tooling TypeScript check
pass, including coverage, disjoint, timer-floor and variation gates. Process
policy passes. All 39 browser/stream cleanup receipts are qualified and empty;
the shared managed server has no unresolved errors and remains running.
