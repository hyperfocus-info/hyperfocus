# October 10: shadow batching in the complete display pipeline

**Fewer calls and a promising throughput signal, without more fresh motion.**
Eight serial ABBA/BAAB trials show a paired submission-rate effect of +15.94%
(exploratory interval +8.24% to +24.19%). Repeated-control variation exceeds the
declared 5% gate, exact normal-AA repeats fail, and changed-pose rate does not
improve. No promotion; 165 Hz fresh-motion gameplay remains unproven.

## Isolated change and work evidence

This uses the [complete display control](october-10-display-material-table.md)
with compact publication, material revisions, full services, 60 Hz fixed
simulation/producer requests and 16.67 ms interpolation delay. Material-table
batching is excluded. The rebuilt control is byte-identical to the previous
control. The candidate changes the archived shadow loop and its diagnostic label.
Both producer binaries have the same hash.

The [existing shadow algorithm](october-10-shadow-gpu-rescreen.md) merges adjacent
contiguous instance ranges only when mesh, skeleton, flags and opacity match.
It keeps primitive order and the same matrices. The source adds scalar lookahead
over existing command arrays, with no new explicit buffers, staging copies or
array allocations. Repeated mesh lookup/setup calls shrink to one per merged
range; live per-range checks and the unchanged main-render validation remain.
It does not retain a cross-frame resource-validity cache.

| Rooftop checkpoint | Shadow draws: control / candidate | Total recorded GL calls: control / candidate | Shadow instances | Shadow primitive elements |
| --- | ---: | ---: | ---: | ---: |
| 0 | 896 / 200 | 24,754 / 17,794 | 1,946 | 229,002 |
| 60 | 1,233 / 277 | 34,025 / 24,465 | 1,963 | 238,578 |
| 240 | 1,567 / 419 | 43,343 / 31,863 | 2,097 | 245,778 |

All other renderer counters match at every captured checkpoint, including surface
and outline draws, instances, triangles, materials, textures, uploads, lights and
dimensions. At checkpoint 0, shadow opacity/morph/skinning-uniform calls and VAO/
buffer binds each fall from 896 to 200; matrix attribute-pointer calls fall from
3,164 to 380. The three checkpoints remove 6,960/9,560/11,480 GL calls per draw.
Renderer upload bytes remain 124,544/125,632/134,208.

The new trace accountant expands each shadow draw's instance count and checks
ordered API/primitive dimensions across variants. All copied argument hashes
match; each owner's repeated work remains identical. This is stronger than draw
counts alone, but does not prove complete vertex/transform bindings or resident
GPU-state equality. No skinned instances occur in these checkpoints. Logical
scans/calls/bytes do not measure hardware cache misses, RAM traffic or allocation
rate; those remain open.

## Eight live trials

Rooftop seed 714, i9-13900HX, RTX 4070 Laptop, Chrome 154.0.8037.58,
visible/focused, 1366 x 768, DPR 1, normal four-sample MSAA, timer scheduling,
two-buffer fresh worker mode. Each fresh browser receives six seconds of warmup,
restore, then six seconds of measurement. Same frozen workload and configuration;
all services stay enabled. Bounded wake protection and AC checks pass. No audit
builds, tests, profiles, image readbacks or second audit browser run during timing.
Both sides retain provenance/work counters and whole-render GPU queries; observer
overhead is uncalibrated. Do not pool these measurements with uninstrumented runs.

| Trial | Variant | Submissions/s | Changed poses/s | Repeated poses | Submit interval p50 / p95, ms | GPU p50 / p95, ms |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | Control | 105.82 | 54.49 | 48.43% | 9.40 / 12.70 | 5.551 / 8.363 |
| 2 | Shadow | 122.62 | 51.34 | 58.07% | 8.10 / 10.50 | 4.588 / 6.418 |
| 3 | Shadow | 112.13 | 48.17 | 56.97% | 8.90 / 12.90 | 4.870 / 7.154 |
| 4 | Control | 100.49 | 48.83 | 51.32% | 9.80 / 13.40 | 6.043 / 8.745 |
| 5 | Shadow | 120.36 | 50.20 | 58.23% | 8.40 / 10.90 | 4.722 / 6.528 |
| 6 | Control | 97.72 | 49.44 | 49.32% | 10.10 / 13.60 | 6.158 / 8.989 |
| 7 | Control | 99.61 | 48.06 | 51.67% | 9.90 / 13.60 | 6.079 / 8.748 |
| 8 | Shadow | 113.00 | 43.81 | 61.18% | 8.70 / 11.60 | 4.945 / 6.690 |

There are 5,250 submissions, 5,242 intervals, 2,175 producer acquisitions and
2,873 observed fixed steps, with no missing step IDs within any observed span.
All 5,250 GPU queries are valid; no disjoint/pending/invalid rows enter the report.
GPU queries are asynchronous and cover the renderer, excluding post-processing,
HUD and browser compositing. CPU and GPU durations overlap and are not summed.

WebGL wall p50 falls from 3.1–3.4 to 2.2–2.4 ms; main-to-submit p95 falls from
9.3–9.8 to 7.8–9.1 ms. Candidate interval p99 is 14.7–18.8 ms and p99.9 is
22.4–26.7 ms, versus control 17.2–17.8 / 20.4–26.2 ms. Tails do not uniformly
improve. Candidate missed-6.06-ms intervals remain 86.16–99.41%, versus control
96.23–99.49%. Longest repeat runs are 32–35 versus 25–29.

Endpoint/interior preparation p50 stays 1.5–1.6 / 2.5–2.7 ms. Producer-through-post
p50 is 11.2–12.0 ms for the candidate versus 10.9–11.3 ms for control. Candidate
pose age p50 is 28.7–30.8 ms; applied-input-to-submit proxy is 40.8–42.2 ms. Neither
is an input-to-photon measurement. More submissions are not additional simulation
ticks or proof of more physical screen updates.

| Hypothesis / expected signature | Measured result | Uncertainty / decision |
| --- | --- | --- |
| Adjacent batching reduces redundant render work | 73–78% fewer shadow draws; unchanged other counters/uploads | Direct structural evidence; skinned/resource mutation coverage remains |
| The reduction improves full-loop throughput | All four pairs positive, +11.58% to +23.17%; geometric effect +15.94% | Exploratory interval +8.24% to +24.19%; control/candidate spreads 8.10% / 8.99% fail 5% stability gate; inconclusive for promotion |
| GPU elapsed work improves | Median of trial medians 6.061 to 4.796 ms; all pairs improve | Control/candidate spreads 10.02% / 7.45%; ratio-effect interval +18.31% to +31.15%, still fails stability gate; no pass-specific attribution |
| Faster drawing supplies more fresh motion | Changed-pose rate effect −3.69% | Interval −10.76% to +3.94%; no established improvement |
| This version reproduces its own images | Normal-AA repeats fail; AA-off repeats exact | Determinism gate failed; no promotion |

Intervals use paired log ratios with four pairs and a Student-t approximation.
One cohort cannot establish pair independence or replace independent sessions.
Elapsed-time gameplay work differs; the exact-work reductions above come from
manual captures. Time-metric ratio effects are control/candidate, not percent time
saved. This screen does not claim a shadow command-buffer-wait cause; that would
need a new trace, distinct from the preceding material-batching intervention.

## Drift, correctness and remaining evidence

Empty-page mean intervals are 6.058–6.062 ms except trial 7 at 6.179 ms; all medians
round to 6.1 ms. This is callback pacing, not scanout. GPU boundary temperatures
are 70–73 C and clocks 210–1,155 MHz, sampled outside measurement. They cannot
explain in-window drift or establish thermal throttling. CPU temperature,
in-window clocks, detailed competing-process activity and allocation/GC traces
are unavailable for this cohort. Sampled main heap boundaries range from
43.9 to 71.4 MB; these are not retained heap or total working set. No power-plan
or NVIDIA setting changed, and every wake receipt reports no suspected sleep.

Three captures cover normal-AA 241-publication replay, requested-165-Hz
181-publication resize/restore/pause/reduced-motion replay, and a 61-publication
AA-off diagnostic, each in both owners. All 966 publications match independent
simulation checks and archived state/presentation sequences; 1,932 endpoint,
966 repeated-pose, 966 audio-once and 483 inline source-mutation checks pass.

Normal-AA has 24/112 non-exact raw/composited comparisons across the main and
restore captures, all with equal within-owner state/call/upload hashes. Maximum
channel difference is 11; maximum changed pixels is 25 in a different pair.
All 12 AA-off pairs are exact. The owner permits cross-version image differences;
these are within-version failures. Failure counts from these bounded captures
are not comparative robustness estimates.

Next small experiment: combine the separately tested material and shadow batching
paths and measure their interaction on the full loop, preserving every numeric,
resource and same-version-AA gate. Do not add their individual gains or infer
165 Hz from lower GPU medians. Resolve AA and obtain stable independent controls
before promotion. Fresh-pose scheduling/preparation, six arenas, skinned crowds,
dense collision/KO, resource mutation/context recovery, sustained memory/thermals
and actual input-to-visible response remain unfinished.

## Reproduction and evidence

Root: `.local/engine-perf/display-shadow-20261010/roof/`. Owner: engine performance
audit. Retain until replacement evidence preserves source identities, raw samples,
images, drift and failures. Control runtime SHA-256:
`5bc2ebf6928533fa3aeaa991715a2797ad76ba3bf6010416a7ebc00c54dc962a`;
candidate `0fa73797ab23463e2288d12e3f1ae2cdc6d1dccc29fe40f92309de2bd84d07c4`;
shared worker `8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.

Script paths start `spikes/persistent-world-worker/`. Set `PERF_ROOT` to this root,
and `PERF_FROZEN_SOURCES` / `PERF_BASE_HTML` to the preceding display-material-table
`display-control` graph/HTML. Set `PERF_RENDER_ARCHIVE` to
`.local/engine-perf/ceiling-20261009`, `PERF_RENDER_VARIANT=shadow-batch`,
`PERF_RENDER_DISPLAY=1`; run `rendering/archive-renderer-recipe.ts`. Build
`control` / `shadow-batch` with their generated source patches and
`PERF_REBUILD_RENDERER=1`. The recipe verifies the unchanged prerequisite module
and existing shared display counters before changing the candidate label.

Use `verify.ts` with artifacts `control,shadow-batch`, the retained roof-compact-714
workload, display capture, provenance/state/visual-change retention, image layers,
command recording, visible high-performance RTX 4070 and wake protection:

- `shadow-capture`: 60 Hz, checkpoints 0/60/240, eight redraws;
- `shadow-restore`: 165 requested Hz, 0/60/120/180, one redraw and the retained
  `fixed-render-fifo-20261009/roof/fighter-endpoint-schedule.json`;
- `shadow-aa-off`: 60 Hz, 0/1/60, one redraw, raster mode `aa-off`.

Run `presentation/display-results.ts` against the matching archived reference,
then `rendering/display-shadow-results.ts`. `verification/render-repeat-report.ts`
creates each image plan; the combined exact `image-batch.json` contains 40 plans.
The pixel command exits 1 after saving all results because normal-AA fails.

Timing uses `compare.ts`, prefix `shadow-abba`, eight `worker-2-fresh` / `timer`
entries, artifact order `control,shadow-batch,shadow-batch,control,shadow-batch,control,control,shadow-batch`.
Set warmup/measure seconds to 6, reset-after-warmup, diagnostic/provenance mode,
power/AC checks and the same workload/visible/GPU/wake settings; clear capture-only
settings. Run `presentation/display-live-results.ts`, then the shadow reporter
with `PERF_PREFIX=shadow-capture` and `PERF_TIMING_PREFIX=shadow-abba`.
`control-drift.ts` retains the boundary/scheduler evidence. Raw plans, manifests,
source comparison, command captures, images, per-frame rows, `screen-summary.json`
and derived reports are saved.

Eight focused tests pass with 39 assertions; scoped TypeScript and process-policy
checks pass (4,893 files, zero process violations). All 62 cleanup receipts are
empty, including repeated receipts for the shared pixel decoder; all 14 wake
guards release. The shared managed game server has no unresolved errors and stays
running. No engine/playable default changed.
