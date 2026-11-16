# October 10: packed material comparisons

**No demonstrated benefit; do not promote.** This private candidate replaces the
material applicator's per-float `Object.is` loop with integer comparisons over
borrowed `Uint32Array` views. Signed zero remains distinct and all NaN encodings
remain equal. It retains public scene-write checks, material declarations,
texture validation and resource lifetime checks. No production source changed.

The hypothesis was that cheaper comparison would reduce preparation and improve
full-work capacity. Existing material application profiles motivated the test;
this changes neither traversal count nor the number of compared values.

## Evidence

Eight serial trials used ABBA/BAAB ordering, fresh owned visible/focused Chrome,
RTX 4070, normal AA, 1366 by 768, the same frozen graph and rooftop seed 714.
Each trial warmed for six seconds, restored the same checkpoint, then consumed
661 FIFO samples at 165 logical samples per simulated second. This is fixed-work
capacity, not live gameplay FPS or physical presentation. All trials finished
without runtime errors, superseded samples or undrained replay queues. End state
and tick/step/pose-change sequences matched.

| Median of four trial summaries | Control | Candidate |
| --- | ---: | ---: |
| Capacity, samples/s | 109.62 | 103.51 |
| Preparation p50 / p95, ms | 5.10 / 5.90 | 5.35 / 6.55 |
| CPU submission interval p95 / p99 / p99.9, ms | 15.10 / 17.80 / 23.25 | 15.80 / 20.20 / 23.95 |
| Submission intervals exceeding 6.06 ms | 99.55% | 98.86% |
| Capacity range / median | 10.51% | 4.65% |

Four adjacent paired log ratios give capacity change **-4.88%**, exploratory
95% interval **[-12.04%, +2.87%]**. Preparation and submission-tail intervals also
cross zero. Control variation exceeds the 5% gate. This does not establish a
speedup or a causal regression. Empty-page calibration was comparatively stable:
median 130.28 callbacks/s, 0.94% range/median. Stable empty-page pacing does not
explain the gameplay control drift or prove physical scanout.

Separate correctness capture passed 482 full-state and pose-oracle checks;
complete packet/presentation sequences matched. Three normal-AA checkpoints
(0, 60, 240) had zero changed pixels. This short cohort does not resolve earlier
AA failures or cover six arenas. Eight focused tests passed 258 assertions,
including external packed writes, released resources, textures and both static
and skinned material forms. The focused TypeScript check passed.

The candidate adds typed-array view objects without duplicating their backing
storage. Allocation rate, retained view cost, GC attribution, CPU thermals and
sustained behavior were not measured. No CPU/GPU streaming or trace capture ran
inside these timing trials. Power/graphics boundary observations and raw samples
are retained. GPU and CPU durations are not summed.

## Reproduction

### Untimed work and storage re-screen

`incremental/material-structure.ts` instruments the actual applicator in a separate
Bun process (`PERF_MATERIAL_MODE=control` or `words`, explicit `PERF_ROOT`). It runs
128/1,024 materials with static and skinned forms, five live texture slots, 100
unchanged applications and a separate approximately 1% changing workload. Saved
files are `material-structure-control.json` and `material-structure-words.json` in
the same evidence root. This is structural evidence, not browser timing.

At 1,024 unchanged materials, each application performs 57,344 float comparisons,
2,048 material-liveness checks and 10,240 texture-liveness checks in both versions.
The two numeric operands account for 458,752 logical bytes read, not measured RAM
traffic. Cached numeric/texture payload is 270,336 bytes in 4,096 backing buffers.
Words adds 2,049 initial views but no extra numeric backing storage. Across 100
changing applications, both versions copy 290,400 bytes into 4,400 new backing
buffers; words additionally creates 2,200 views. All four final state hashes match.
Object headers, `sameLook` property reads, CPU cache misses and bus traffic are
not measured. Thus this comparison alone improves neither traversal count nor
storage locality. A separate two-store cache candidate now targets allocations;
its performance and full-scene acceptance require new evidence.

The slab candidate now passes nine focused tests / 267 assertions, including
independent bindings, packed external writes, declaration edits and released
resources. The same four structural workloads have matching final state hashes
and identical scan/check/copy counts. At 1,024 materials it replaces 4,096 cached
backing buffers with two and eliminates all 4,400 changing-workload backing
allocations and 2,200 replacement word views. Payload remains 270,336 bytes;
initial form views remain. This proves bounded storage/allocation reduction, not
cache-hit improvement, zero total allocations or a browser speedup. Run with
`PERF_MATERIAL_LAYOUT=slab` in the recipe/preload and `PERF_MATERIAL_MODE=slab`
in the structural probe. Production code is unchanged.

The built `slabs` artifact also passes 482 short full-state/pose oracle checks
against control, with identical full packet/presentation sequences. Cross-version
normal-AA checkpoints 0/60 are exact; checkpoint 240 differs in one pixel by at
most three channel levels. This is permitted by the revised image contract and
does not establish within-version repeatability. `slabs-correctness` retains
images, manifests and empty owned-browser cleanup receipts. Layout-only timing
is reported separately below.

### Layout-only browser comparison

The subsequent `word-slabs-correctness` capture compares `words` directly with
`slabs`, isolating layout from float-comparison semantics. All 482 state/pose
oracles and full packet/presentation sequences match. Cross-version checkpoints
differ by 1/0/4 pixels, maximum channel difference one; within-version
repeatability remains a separate open gate.

Eight `awake-layout` ABBA/BAAB trials then use the same 661-sample workload,
six-second warmup, fresh visible Chrome and bounded wake guard. All measurement,
fixed-work, power, focus, cleanup and wake receipts pass. No sleep is suspected.

| Median of four trials | Packed words | Contiguous cache |
| --- | ---: | ---: |
| Capacity, samples/s | 101.00 | 100.31 |
| Preparation p50 / p95, ms | 5.45 / 6.60 | 5.45 / 6.50 |
| Submission interval p95 / p99 / p99.9, ms | 16.00 / 19.40 / 26.15 | 16.70 / 19.35 / 24.10 |
| Submission deadlines missed | 84.09% | 82.27% |
| Capacity range / median | 3.54% | 6.29% |

Paired capacity effect is **−0.35%**, exploratory 95% interval **[−6.03%, +5.68%]**.
The structural reduction is established in the instrumented fixtures, but this
short game cohort demonstrates no full-loop benefit. Retain the private prototype
for allocation/scale tests; do not promote it as a 165 Hz improvement.

Reproduce with the existing eight-trial command below, changing the prefix to
`awake-layout`, artifact order to `words,slabs,slabs,words,slabs,words,words,slabs`,
and setting `PERF_KEEP_AWAKE=1`. The report accepts `PERF_CONTROL_ARTIFACT=words`,
`PERF_CANDIDATE=slabs`, and `PERF_CORRECTNESS_PREFIX=word-slabs-correctness`; it
requires the matching oracle artifacts/manifests rather than accepting a different
worker's timing as equivalent. Raw output remains in the same evidence root.

### Awake paired rerun

`awake-661` repeats the eight ABBA/BAAB trials with the original 661-sample
workload and `PERF_KEEP_AWAKE=1`. All trial, cleanup and wake receipts pass; none
expired or recorded a suspected sleep interval. Empty-page pacing is now
160.21–165.07 callbacks/s (median 165.02). This is not a controlled wake-guard
on/off experiment and does not identify the previous 130 Hz cause.

| Median of four trials | Control | Packed words |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 96.00 | 96.39 |
| Preparation p50 / p95, ms | 5.45 / 6.70 | 5.60 / 7.00 |
| Submission interval p95 / p99 / p99.9, ms | 17.50 / 20.10 / 22.85 | 17.55 / 21.40 / 27.90 |
| Submission deadlines missed | 85.23% | 85.15% |
| Capacity range / median | 9.22% | 8.06% |

Paired capacity effect is **−0.24%**, exploratory 95% interval **[−7.20%, +7.23%]**:
inconclusive again. These are fixed-work submissions, not proven fresh display
updates. No simulation or pose-sequence discrepancy was detected. The attempted
331-sample `awake-short` run failed its queue-drain gate and is excluded; its
failure, wake and empty browser-cleanup receipts remain saved. The shared managed
server reports no errors. Focused TypeScript and process-policy checks pass.

Local evidence: `.local/engine-perf/material-words-20261010/roof/`, including
frozen sources/manifests, correctness images, cleanup receipts, `paired-plan.json`,
raw trial rows and `paired-material-words-results.json`. Owner: engine performance
audit. Prune only after replacement evidence preserves the decision and provenance.

Use a fresh PowerShell environment from the repository root. The saved graph and
HTML are local prerequisites; use the managed game's returned URL and verify it
matches the benchmark harness before running.

```powershell
$env:PERF_ROOT='.local/engine-perf/material-words-20261010/roof'
$env:PERF_FROZEN_SOURCES='.local/engine-perf/fixed-render-fifo-20261009/roof/clock-rounding/sources.json'
$env:PERF_BASE_HTML='.local/engine-perf/fixed-render-fifo-20261009/roof/clock-rounding/index.html'
$env:PERF_REBUILD_RUNTIME='1'
bun.cmd spikes/persistent-world-worker/build.ts control
bun.cmd spikes/persistent-world-worker/incremental/material-words-recipe.ts
$env:PERF_SOURCE_PATCHES="$env:PERF_ROOT/material-words-patches.json"
bun.cmd spikes/persistent-world-worker/build.ts words
$env:PERF_WORKLOAD='.local/engine-perf/worker-arena-campaign-20261008/workloads/roof-compact-714/workload.json'
$env:PERF_HEADLESS='0'; $env:PERF_GPU='high-performance'; $env:PERF_PROVENANCE='1'
$env:PERF_PREFIX='correctness'; $env:PERF_ARTIFACTS='control,words'
$env:PERF_CAPTURE_HZ='60'; $env:PERF_CHECKPOINTS='0,60,240'
$env:PERF_RETAIN_STATE_SEQUENCE='1'; $env:PERF_COUNT_VISUAL_CHANGES='1'
$env:PERF_IMAGE_CHECK='tolerance'
bun.cmd spikes/persistent-world-worker/verify.ts
$env:PERF_PIXEL_GATE='1'
bun.cmd spikes/persistent-world-worker/image-parity.ts
$env:PERF_PREFIX='paired'
$env:PERF_SEQUENCE=(1..8 | ForEach-Object { 'worker-2-fresh' }) -join ','
$env:PERF_ARTIFACTS='control,words,words,control,words,control,control,words'
$env:PERF_EXPECT_RENDERER='RTX 4070'
$env:PERF_WARMUP_SECONDS='6'; $env:PERF_MEASURE_SECONDS='10'
$env:PERF_RESET_AFTER_WARMUP='1'; $env:PERF_CONTIGUOUS_WARMUP='1'
$env:PERF_FIXED_REPLAY_FRAMES='661'; $env:PERF_FIXED_REPLAY_HZ='165'
$env:PERF_FIXED_REPLAY_FIFO='1'; $env:PERF_POWER='1'; $env:PERF_REQUIRE_AC='1'
bun.cmd spikes/persistent-world-worker/compare.ts
bun.cmd spikes/persistent-world-worker/incremental/material-words-results.ts
```

The report independently requires correctness capture identities and matching
fixed work because this candidate changes worker code. The rendering-ablation
validator's identical-worker requirement remains intact. All owned browser
cleanup receipts were empty; the shared server had no unresolved errors.
