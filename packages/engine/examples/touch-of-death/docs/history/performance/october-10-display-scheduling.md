# Display scheduling and delay — October 10, 2026

**Neither change establishes 165 Hz fresh motion.** Requesting input earlier
reduces repeated poses but also reduces submission capacity in this screen.
A longer interpolation delay supplies substantially more distinct poses at a
cost of older state. Keep both experimental; no production default changes.

## Controlled changes

Eight serial live trials in two ABBA cohorts, each with six seconds of warm-up,
restore, then six seconds of measurement. Rooftop checkpoint/seed 714, full
services, compact numeric publication, full entity interpolation loop, nominal
60 Hz producer, two render buffers, rAF display, normal MSAA. Chrome
154.0.8037.58 uses ANGLE/D3D11 on the RTX 4070 Laptop; backing size 1366×768,
DPR approximately 1, i9-13900HX. All trials are visible and focused on the physical
monitor, on AC with battery saver off. No audit builds/tests overlap timing.

`early-abba` changes only `inputBeforeDraw`: timer/early/early/timer in the same
`marked-16` artifact. This requests the next input earlier; `lateInput` remains
false, so it sends the latest rAF-polled input rather than performing another
native input poll. Wake-driven frames and paced polling remain off.

`delay-abba` retains the timer schedule and changes only display delay:
16.67/33.33/33.33/16.67 ms. Complete source comparison finds exactly one differing
module, the controller, which becomes identical after substituting the delay
constant. Producer, gameplay and renderer graphs match. Effective configuration
is saved and asserted, rather than inferred from requested flags.

These are live architecture screens. Restored initial state matches, but later
elapsed-time sampling/work differs. They are not identical-work performance
acceptance trials or independent sustained sessions.

## Motion and cost

| Trial | Submissions/s | Changed poses/s | Repeats | Pose age p50 | Applied-input age proxy p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Early A1: timer | 102.58 | 53.70 | 47.56% | 30.10 ms | 44.00 ms |
| Early B1: early input | 96.01 | 58.63 | 38.82% | 29.50 ms | 44.10 ms |
| Early B2: early input | 98.89 | 59.33 | 39.90% | 28.40 ms | 41.60 ms |
| Early A2: timer | 100.00 | 50.66 | 49.25% | 30.80 ms | 44.40 ms |
| Delay A1: 16.67 ms | 99.28 | 52.96 | 46.57% | 30.20 ms | 44.90 ms |
| Delay B1: 33.33 ms | 98.94 | 81.01 | 17.98% | 40.03 ms | 60.90 ms |
| Delay B2: 33.33 ms | 95.54 | 79.12 | 17.04% | 40.23 ms | 61.00 ms |
| Delay A2: 16.67 ms | 97.60 | 48.05 | 50.68% | 31.50 ms | 44.10 ms |

Pose identity compares submitted geometry/camera, not observed pixels. Intentional
held motion/hitstop also produces repeats. Interpolated poses are not simulation
ticks. The applied-input proxy uses the selected endpoint's applied input sample;
an interior mixes geometry from two endpoints. It is neither a measured response
to an input change nor physical input-to-visible latency. The older latest-polled
input proxy is retained separately.

The 4,749 submissions yield 4,741 intervals: the first submission in each trial
has no preceding in-window interval. **4,741/4,741 measured intervals miss the
6.0606 ms budget**. All 4,749 GPU queries
are valid. Empty-page callback means remain approximately 165 Hz. Longest repeat
runs are 26–29 after the first pose.

| Candidate trial | Interval p50 / p95 / p99 / p99.9 | Main-to-submit p50 | GPU draw p50 / p95 |
| --- | --- | ---: | --- |
| Early B1 | 10.10 / 14.30 / 16.80 / 18.70 ms | 7.5 ms | 6.37 / 9.13 ms |
| Early B2 | 9.80 / 14.00 / 18.20 / 23.70 ms | 7.2 ms | 6.48 / 8.62 ms |
| Delay B1 | 9.90 / 13.80 / 19.10 / 20.50 ms | 7.3 ms | 6.39 / 8.59 ms |
| Delay B2 | 10.20 / 13.40 / 17.40 / 21.00 ms | 7.6 ms | 6.79 / 9.17 ms |

Short-run p99.9 is effectively the observed maximum. GPU queries exclude
post-processing/HUD/compositor; GPU and CPU work overlap. Main completion,
including UI after submission, has a median of 8.3–8.8 ms across these trials.
Producer-through-post median is 10.7–11.6 ms; post alone remains about 0.6 ms.

The early schedule acquires 321/336 publications versus controls 264/265, increasing
packing, cloning and decoding work. Worker input-wait medians remain 5.8–6.1 ms;
that wait can overlap other work and is not an extra serial frame stage. Observed
worker/main wall overlap increases from about 2.41/2.52 seconds to 3.17/3.10 seconds
per six-second trial. Clock uncertainty yields approximately 0.15–0.23 seconds of
overlap range. These are wall spans, not simultaneous CPU execution or GPU usage.

Longer delay increases interior samples from 119/84 to 492/473. The candidate
performs 3,272,315 generic entity blend visits versus 688,373 in its controls.
Every displayed sample still applies 3,391 entity and 1,702 material records with
resource checks. Each publication still packs 81,566 Float64 values and 32,286
Uint32 indices into a 781,672-byte buffer; changing this schedule removes no
scans or copies. These are logical work/storage counts, not CPU-cache misses or
RAM-bus traffic. One reusable producer numeric buffer remains allocated per owner;
that counter excludes message clones and other object allocation.

The early A1 host supersedes one publication and lacks one interior step ID in
its acquired provenance. This is an observation gap, not evidence of a skipped
simulation step. Other trials have no missing IDs within their observed span;
358–359 distinct fixed steps are observed per trial.

| Hypothesis | Expected signature | Evidence / uncertainty | Decision |
| --- | --- | --- | --- |
| Earlier requests provide fresher motion | More useful publications, fewer repeats, reduced age | Paired changed-pose rates +9.18% / +17.11%; submission rates −6.41% / −1.11%. Control/candidate spreads 2.55% / 2.96% | Motion/work trade-off; no throughput promotion |
| More history enables interpolation | More interiors and distinct poses | Paired changed-pose rates +52.97% / +64.66%; submission rates −0.34% / −2.11%. Spreads 1.71% / 3.50%; pose/input age increases | Useful diagnostic, no accepted latency trade-off |
| Scheduling alone reaches 165 Hz | Fresh submissions with headroom | Every measured interval misses; CPU submission and GPU draw remain limiting | Rejected as a sufficient solution |
| Trace marks prove browser presentation | Exact frame-token association | All 765 display marks rejected by strict token matching | Presentation remains unknown |

Only two pairs per cohort: these are observed paired effects, not a reliable
acceptance confidence interval. Gameplay paths, GPU-time changes and unrecorded
in-window clocks/contention prevent causal attribution of the small capacity
differences. Boundary GPU/power inventory is retained; CPU temperature/clocks,
resource residency, working set and sustained retained memory are unmeasured.
Heap-used endpoints alone do not establish a leak or allocation rate.

## Separate traces and repeatability

Two four-second diagnostic traces cover renderer main, dedicated worker,
compositor, Viz compositor and GPU-process threads. Both are complete and aligned
with explicit measurement marks. Tracing/CPU profiling is excluded from timing
comparisons. Main CPU task unions are 3.72/3.75 seconds and GPU-process CPU unions
3.50/3.29 seconds; these run concurrently and the latter is not GPU device time.
Worker CPU unions are 2.04/2.16 seconds. Significant `performance.mark` sampling
(main 309/285 ms, worker 135/138 ms) demonstrates observer cost.

Main GC wall unions are 47/48 ms; worker GC unions 97/94 ms. Reported minor-GC heap
reductions total 706–723 MiB on main and 741–756 MiB on the worker per trace. These
are diagnostic reclamation counts, not unprofiled allocation rate or bus traffic.
They justify allocation attribution with tracing marks disabled, not a production
memory conclusion.

New `hf:display-frame` marks include display ID, endpoint request IDs, alpha,
pose version and changed-pose status after main completion. Existing acquisition
marks remain separate. All 399/366 display associations fail exact begin-frame
token matching: one retained example starts on sequence 4686 but feedback names
4690 under the same animation ID/source. Do not weaken the gate or report zero
latency from missing joins. Physical scanout and game-pixel visibility remain
unobserved.

The pre-timing `baseline-short` manual capture passes 244 exact endpoint and 122
numeric-repeat checks across both owners, matching the compact-publication
reference. It samples endpoints/midpoints explicitly, so it does not prove the
live delay/request schedule correct. Normal-AA same-version images remain
non-exact in 5/6 repeats, at most 11 pixels/channel delta 2. The old tolerance
check passes, but exact repeatability does not. Cross-version equality is not
required by the current owner contract.

## Reproduction and next boundary

Raw root: `.local/engine-perf/display-scheduling-20261010/roof/`.
`screen-summary.json`, both `*-plan.json` files and `*-display-results.json` retain
effective configurations, samples, paired observations, source comparison and
cleanup counts. Per-artifact source graphs/patches preserve both delay builds.

Use the [integrated-display workflow](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment)
with packed transport, full entity loop, profile off and producer 60 Hz. Build
separate artifacts with `PERF_DISPLAY_DELAY_MS=16.666666666666668` and
`33.333333333333336`. The scheduling cohort uses four copies of the first artifact
and `PERF_SCHEDULING=timer,early-input,early-input,timer`. The delay cohort uses
short,long,long,short artifacts with four timer settings. Both use six-second
warm-up/measurement, reset, provenance, diagnostics, AC checks and bounded wake.

Run `presentation/display-live-results.ts` with each `PERF_ROOT`/`PERF_PREFIX`.
Trace separately with `PERF_TRACE=1`, `PERF_PROFILE=1`, four-second measurement,
`PERF_TRACE_MAX_MIB=256` and categories
`toplevel,devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,viz,gpu,benchmark,latencyInfo,v8`.
Then run `trace-analysis.ts`. `image-plan.json` lists the untimed same-version
comparisons; its initial duplicate-label input is retained separately.

All 24 cleanup receipts are empty; all 12 bounded wake requests release without
expiry or suspected sleep. Some cleanup receipts describe the same browser.
This does not explain the earlier 130 Hz episode. No driver/power settings change.
All 40 focused tests / 523 assertions, focused TypeScript and process policy pass;
the shared managed server has no unresolved errors. Validation receipts and the
765-token mismatch diagnostic are retained beside the raw runs.

Next implementation boundary: reduce complete runtime application/transport work
on the compact full-loop baseline while retaining resource checks. Require an
explicit resource/scene/restore invalidation contract, counted scans/copies and
correctness before another timing screen. Allocation attribution must separate
observer allocations from gameplay. These schedules still need six-arena/stress,
resource/teleport/KO coverage, independent sessions, sustained memory/thermal
evidence, exact within-version AA and measured visible-response latency.
