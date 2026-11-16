# October 10: awake obstruction-cache re-screen

**Depot supports a small positive effect in one cohort; rooftop remains
inconclusive.** Depot preparation p50 falls from 6.0 to 5.5 ms, with +3.56% paired
capacity. Rooftop avoids many queries without an established timing gain. Keep
the prototype for independent-session and broader acceptance, not promotion.

The [original experiment](october-9-incremental-query-cache.md) owns the pure-query
contract, input writers, invalidation rules and storage bounds. This re-screen
applies its archived patches to the newer frozen two-buffer/fixed-clock graph.
All other preparation and resource checks still run. Renderer differences follow
the [current owner contract](../../touch-of-death-performance-audit.md#decisions).

## Hypothesis and correctness

Hypothesis: avoiding unchanged obstruction queries reduces preparation time
without changing simulation, materials or render packets. The controlled variable
is the bounded query cache, including its signatures and counters. Expected
signature: fewer underlying query calls, identical packets and lower preparation
and submission times. A high hit rate with unchanged frame time is insufficient.

Both private artifacts rebuild the runtime from the same captured source graph;
both export the same diagnostic fields. The cache adds 4,628 bytes to the private
HTML/runtime artifact. No production module enables it.

The 241-frame, 60 Hz changing replay passes 482 independent full-state and pose
oracle checks, exact numeric packet/presentation sequences and committed states.
Normal-AA cross-version checkpoints at 0/60/240 differ by 0/0/7 pixels, maximum
channel difference 1/255. This is diagnostic, not within-version repeatability
proof. Six focused invalidation tests pass 684 assertions, including mutation,
teleport/restore, recycled IDs, replacement objects, overflow, nonfinite inputs
and 1,000 bounded resets. Full resource/context recovery and six-arena acceptance
remain separate.

## Rooftop fixed-work screen

Eight serial ABBA/BAAB trials use rooftop seed 714, level-9 AIs, full services,
two buffers, the timer schedule, normal AA, 1366×768 at DPR 1, visible focused
Chrome and RTX 4070. Each uses a six-second initial warmup, 661-sample contiguous
warmup, restore and 661 measured samples at 165 logical samples/s. AC and bounded
wake guards are enabled. No builds, tests, traces or second audit browser run
during timing. All 5,288 samples pass the final-state, tick/step/pose-transition,
queue, focus, wake, manifest and cleanup gates. No sleep is suspected.

Median trial statistics, four trials per artifact:

| Metric | Control | Query cache |
| --- | ---: | ---: |
| Fixed-work capacity | 98.73 samples/s | 98.82 samples/s |
| Capacity range / median | 4.43% | 14.16% |
| Preparation p50 / p95 | 5.50 / 6.70 ms | 5.45 / 6.60 ms |
| Submission interval p95 | 17.70 ms | 17.45 ms |
| Submission interval p99 | 18.90 ms | 19.10 ms |
| Submission interval p99.9 | 22.35 ms | 23.35 ms |
| Submission deadlines missed (>6.06 ms) | 83.48% | 83.03% |

Paired capacity effect: **−2.38%, exploratory 95% interval −10.22% to +6.16%**.
The paired preparation-p50 ratio also crosses zero. One candidate trial takes
7.54 seconds versus 6.51–6.83 for the others. It is retained, not discarded as an
outlier. The control passes the 5% variation gate; the candidate does not.

Empty-page pacing has a 165.02 Hz median and 1.96% range/median spread. This is
callback pacing, not physical presentation. Both artifacts repeat 72.12% of
comparable poses in this logical replay. Capacity is not live fresh-motion FPS.
GPU device times, physical input-to-visible latency and CPU temperature remain
unobserved. Boundary power and wider CDP/OS counter records cannot explain the
candidate's slower trial; offline drift output retains their scope limits.

## Work and storage

All four candidate trials have **identical per-sample counter deltas**. Across
all eight trials, draw, shadow, outline, material-binding and upload counts match.
Exclude frame zero and warmup when reading these cumulative-counter differences:

| Query work | All 660 transitions | 420 zero-step samples | 240 stepped samples |
| --- | ---: | ---: | ---: |
| Eligible calls | 52,265 | 33,288 | 18,977 |
| Calls avoided | 37,306 | 33,288 | 4,018 |
| Cache misses | 14,959 | 0 | 14,959 |
| Hit rate | 71.38% | 100% | 21.17% |
| Target scalar comparisons | 550,440 | 350,280 | 200,160 |

There are no capacity/nonfinite bypasses in these trials. These count query
**batches**, not individual target rays. Control's cache counters are zero because
it has no cache instrumentation; that does not mean the control performs no queries.
The cache still visits every eligible query and validates its signature, compares
all target coordinates, and retains detached snapshots. Camera clearance,
broadphase, traversal, fades, material/resource validation, compilation and full
rendering continue. The original 123 typed bytes per configured box exclude
target tuples, map/object overhead and the rest of the world. Actual working set,
cache misses, RAM traffic, allocation rate and signature self-time remain unmeasured.

## Depot extension

The depot re-screen uses the same frozen runtime and worker hashes as rooftop,
with depot's matching asset document and seed-2026 checkpoint. Both artifacts
pass another 482 independent state/pose checks and exact packet/presentation
sequences. Cross-version normal-AA checkpoints differ by 0/37/5 pixels at
0/60/240, with maximum channel differences 0/3/1. Within-version repeatability is
still a separate gate.

Another eight awake ABBA/BAAB trials use the same 661-sample workload protocol,
with a 15-second failure bound instead of rooftop's 10 seconds. Actual measured
durations are 6.32–6.86 seconds; the timeout does not set the sample count or
logical time. All 5,288 samples pass state/work/pose-transition, manifest, queue,
focus, wake and cleanup checks. Every candidate has identical query-counter
deltas, and rendering counts match at every sample across all eight trials.

| Median trial metric | Depot control | Depot cache |
| --- | ---: | ---: |
| Fixed-work capacity | 98.82 samples/s | 101.57 samples/s |
| Capacity range / median | 4.87% | 3.11% |
| Preparation p50 / p95 | 6.00 / 7.20 ms | 5.50 / 7.15 ms |
| Submission interval p95 | 17.85 ms | 17.60 ms |
| Submission interval p99 | 18.55 ms | 18.80 ms |
| Submission interval p99.9 | 24.60 ms | 24.25 ms |
| Submission deadlines missed (>6.06 ms) | 80.23% | 79.17% |

All four adjacent pairs improve capacity: **+3.56%, exploratory 95% interval
+1.30% to +5.88%**. Both groups pass the declared 5% variation gate. This is a
positive single cohort, not independent-session evidence; the p95 submission
effect remains uncertain. It does not meet the broader promotion gates or prove
165 Hz motion. Empty-page callbacks have a 165.00 Hz median and 1.00% spread.
Both versions repeat 77.27% of comparable poses in this replay.

Across 660 transitions the candidate visits **137,125 eligible query batches**,
avoids **105,614 (77.02%)**, and misses 31,511, with no bypasses. Zero-step samples
avoid all 87,249 eligible queries; stepped samples avoid 18,365/49,876 (36.82%).
Tracking still makes 576,120 target-scalar comparisons. Depot has about 2.62 times
rooftop's eligible query volume in these particular replays while target-tracking
work is similar. That is consistent with the larger preparation saving, but does
not isolate the cache's self-time or measure hardware cache/RAM traffic.

Next: another independent depot session, broader phase/arena coverage, and
within-version image validation. Signature/layout changes remain hypotheses.

## Reproduction and retained evidence

Owner: engine performance audit. Raw artifacts, patches, manifests, images,
correctness receipts and `awake-cache-*` trials live in
`.local/engine-perf/query-cache-rescreen-20261010/roof/`. The owning reports are
`awake-cache-preparation-results.json`, `target-cache-work.json` and
`awake-cache-drift.json`. Prune only after replacement evidence preserves the
decision and provenance. Use a fresh PowerShell environment and output prefix.
The depot sibling directory retains the corresponding artifacts and reports.
To reproduce depot, substitute root suffix `depot`, use
`.local/engine-perf/incremental-20261009/depot-control/index.html` as `PERF_BASE_HTML`,
workload suffix `depot-2026/workload.json`, and `PERF_MEASURE_SECONDS=15`.
Keep the frozen source graph pointing to the same rooftop control graph.

```powershell
$env:PERF_ROOT='.local/engine-perf/query-cache-rescreen-20261010/roof'
$env:PERF_FROZEN_SOURCES='.local/engine-perf/material-table-20261010/roof/control/sources.json'
$env:PERF_BASE_HTML='.local/engine-perf/material-table-20261010/roof/control/index.html'
$env:PERF_REBUILD_RUNTIME='1'
$env:PERF_SOURCE_PATCHES='.local/engine-perf/incremental-20261009/control-patches.json'
bun.cmd spikes/persistent-world-worker/build.ts control
$env:PERF_SOURCE_PATCHES='.local/engine-perf/incremental-20261009/target-cache-patches.json'
bun.cmd spikes/persistent-world-worker/build.ts target-cache
$env:PERF_WORKLOAD='.local/engine-perf/worker-arena-campaign-20261008/workloads/roof-compact-714/workload.json'
$env:PERF_HEADLESS='0'; $env:PERF_GPU='high-performance'
$env:PERF_EXPECT_RENDERER='RTX 4070'; $env:PERF_PROVENANCE='1'
$env:PERF_PREFIX='correctness'; $env:PERF_ARTIFACTS='control,target-cache'
$env:PERF_CAPTURE_HZ='60'; $env:PERF_CHECKPOINTS='0,60,240'
$env:PERF_RETAIN_STATE_SEQUENCE='1'; $env:PERF_COUNT_VISUAL_CHANGES='1'
$env:PERF_CAPTURE_DETAILS='1'; $env:PERF_IMAGE_CHECK='tolerance'
bun.cmd spikes/persistent-world-worker/verify.ts
$env:PERF_PIXEL_GATE='0'
bun.cmd spikes/persistent-world-worker/image-parity.ts
$env:PERF_PREFIX='awake-cache'
$env:PERF_SEQUENCE=(1..8 | ForEach-Object { 'worker-2-fresh' }) -join ','
$env:PERF_ARTIFACTS='control,target-cache,target-cache,control,target-cache,control,control,target-cache'
$env:PERF_WARMUP_SECONDS='6'; $env:PERF_MEASURE_SECONDS='10'
$env:PERF_RESET_AFTER_WARMUP='1'; $env:PERF_CONTIGUOUS_WARMUP='1'
$env:PERF_FIXED_REPLAY_FRAMES='661'; $env:PERF_FIXED_REPLAY_HZ='165'
$env:PERF_FIXED_REPLAY_FIFO='1'; $env:PERF_POWER='1'
$env:PERF_REQUIRE_AC='1'; $env:PERF_KEEP_AWAKE='1'
bun.cmd spikes/persistent-world-worker/compare.ts
$env:PERF_CANDIDATE='target-cache'; $env:PERF_CORRECTNESS_PREFIX='correctness'
$env:PERF_RESULTS="$env:PERF_ROOT/$env:PERF_PREFIX-preparation-results.json"
bun.cmd spikes/persistent-world-worker/incremental/material-words-results.ts
$env:PERF_TIMING_PREFIX='awake-cache'; $env:PERF_REPORT='correctness'
bun.cmd spikes/persistent-world-worker/incremental/report.ts
```

The frozen source graph/HTML and archived patch inputs are local prerequisites.
Confirm the managed game's returned URL matches `http://127.0.0.1:8798/game/`.
