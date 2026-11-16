# Retained publication follow-up — October 14, 2026

The revised adapter removes substantial redundant work and improves on the first
retained JS adapter. **It does not establish a fresh-motion win over the original
display, or qualify a backend for promotion.** Keep the revision in the private
spike; retain the original native-lab configuration and production defaults.

This implements the single next task from the
[initial slice audit](touch-of-death-retained-presentation-spike.md). The
[contract and commands](../../../../../spikes/persistent-world-worker/retained-presentation/README.md)
own implementation details. No executor algorithm, gameplay feature, simulation
rule, interpolation delay or production setting changed.

## Delivered change and scope

The adapter caches exact rotation inputs and immutable runtime binding IDs,
writes changed endpoint lanes, validates resources without staging future scene
membership, and commits sampled membership once before recording the compiler's
compatibility snapshot. Workers copy only selected rows with newer input
revisions. Pending updates survive skipped publications; busy shared slots cannot
be overwritten, and reset invalidates their delivered revisions and generation.
Canonical resource validation, bounds repair, compatibility scans and the checked
fallback remain. The ABI, f64 arithmetic and renderer rounding boundaries are
unchanged for JS, scalar Wasm, SIMD and both worker counts.

One new artifact contains all six paths, including original. Its SHA256 is
`21a085d389d37410962e388e16bc83e1f8d157806acee0088ad14eec0b9a78e9`.
The old control is the frozen initial `artifact6`, SHA256
`c525ba24cf4594527120e52a8fdb5f9338e265c04780cce02dfad29525e52a9e`.
The saved source diff contains only the adapter, worker transfer, new transfer
helper and private scene-validation seam. Wasm binaries did not change.

Completed **12 timing trials**: three serial ABBA blocks, 5 s warmup / 10 s
measurement, one restored street checkpoint and seed 1337. Same maximized
1280×665 CSS viewport, DPR 1.5, 1920×998 drawing buffer, production MSAA, RTX 4070
Laptop / ANGLE D3D11, Chrome 154.0.8037.58, AC power and existing High performance
scheme. Actual browser flags are saved; extensions were disabled. No OS/GPU
settings changed. The existing compact producer, three buffers, 60 Hz producer
policy and 16.667 ms interpolation delay remained fixed. This is the native
playable lane, not another rooftop/depot sweep.

## Controlled results

Numbers average the two trial statistics, not pooled percentiles. Changed motion
is the existing **fighter-root position proxy**, not complete-pose freshness or
physical scanout. Variation is each side's two-trial range divided by its mean.

| ABBA contrast, A → B | Submissions/s | Changed roots/s | Main frame wall p95 / p99, ms | Root-rate variation A / B | Finding |
| --- | ---: | ---: | --- | --- | --- |
| Old → revised retained JS | 150.05 → 152.88 | 66.19 → 69.95 | 8.395 / 9.253 → 8.007 / 8.985 | 2.58% / 4.31% | +5.68% changed roots exceeds observed variation narrowly; p95 improves 4.62%. Small gain over the old adapter. |
| Old → revised two-worker | 147.72 → 144.60 | 63.17 → 62.94 | 8.387 / 9.497 → 8.163 / 9.538 | 3.92% / 14.54% | Inconclusive cadence; candidate age tails worsen. No repeat or promotion. |
| Original display → revised JS | 142.32 → 151.84 | 67.46 → 67.83 | 8.120 / 9.125 → 8.033 / 9.212 | 0.83% / 2.88% | +6.69% submissions exceeds variation; +0.54% changed roots does not. Frame tails essentially unchanged. |

The last block answers whether the revised slice beats the original baseline:

| Metric | Original display | Revised JS |
| --- | ---: | ---: |
| Fixed steps/s | 59.92 | 59.84 |
| Submission interval p50 / p95 / p99, ms | 6.073 / 12.140 / 12.250 | 6.065 / 12.092 / 12.205 |
| Intervals strictly above 1000/165 ms | 56.47% | 52.24% |
| Repeated fighter-root positions | 52.56% | 55.30% |
| Main frame wall p50, ms | 4.970 | 4.268 |
| Preparation p50 / p95, ms | 2.352 / 5.380 | 1.527 / 5.243 |
| Publication p50 / p95, ms | 0.658 / 0.893 | 1.275 / 1.750 |
| GPU renderer p50 / p95 / p99, ms | 2.060 / 3.421 / 4.598 | 1.999 / 3.490 / 4.856 |
| Pose age at submission p50 / p95 / p99, ms | 27.14 / 38.34 / 44.80 | 26.48 / 36.92 / 42.39 |
| Input-age proxy p50 / p95 / p99, ms | 31.82 / 42.79 / 46.33 | 30.92 / 42.47 / 45.11 |
| Interior interpolation samples | 17.19% | 15.66% |

The strict deadline statistic includes ordinary ~6.065 ms callbacks; it is not a
physical missed-refresh count. Each 10 s trial contains about 7.33 s of fighting
and subsequent round-result presentation. Restricting the root proxy to
contiguous fighting intervals still gives **74.32 → 73.99 changed roots/s** in
the original-versus-revised block. Resting/unchanged roots are not necessarily
stale animation, but neither view establishes 165 Hz motion.

## Actual work removed

These are average cumulative deltas over each 10 s trial, excluding the first
sampled display. MB means decimal logical bytes, not RAM traffic or cache misses.

| Work | Old → revised | Interpretation |
| --- | --- | --- |
| JS publication p50 / p95 | 1.770 / 2.170 → 1.250 / 1.605 ms | Median falls 29.4%; numeric executor remains ~0.015 ms on nonempty batches. |
| JS endpoint/basis/discrete input stores | 278.30 → 2.31 MB | 99.17% fewer ABI stores. New quaternion-cache stores add 0.19 MB; other bookkeeping stores are outside this counter. |
| JS basis constructions | ~1.480 million → 5,822 | >99.6% removed; two canonical normalizations per construction. Old count is derived from its verified per-owned-row loop, not a newly measured old counter. |
| JS binding-map lookups | ~5.921 million → 1,297 | Old count likewise source-derived; IDs are cached, live resources are still validated. |
| Two-worker main→shared input copies | 375.57 → 20.21 MB | 94.6% fewer bytes; about 94.4% fewer per publication after accounting for different publication counts. |
| Two-worker dispatch p50 / p95 | 0.090 / 0.122 → 0.045 / 0.060 ms | Copy/dispatch overhead halves; does not remove scheduling delay. |
| Two-worker command rebuilds / copies | 601.5 / 221.26 MB → 309 / 113.66 MB | About half removed by committing sampled membership once; real fallback/membership changes still rebuild. |
| JS command rebuilds / copies | 259 / 95.27 MB → 258 / 94.90 MB | Essentially unchanged; the duplicate staging penalty mainly affected asynchronous output. |

Still executing: 3,420 publication visits plus the ordered-identity scan; 3,992
renderer membership visits per display; ~2,600 owned resource checks per display;
1,724 material applications; fallback entity application, producer work, rendering
and post-processing. Two matrix uploads remain per display, ~162 kB median and
240 kB p95 for revised JS. Shared CPU memory did not remove GPU copies.

Worker compute remains ~0.010 ms median for the slowest worker, versus ~0.093 ms
dispatch-to-last-finish and **5.49 / 10.07 ms** median/p95 before display polls the
completed result. Moving retained output has another **18.26 ms p95** of sampled
time lag in the revised pool. These are separate observations, not durations to
add. Worker throughput is still not a deadline/latency win.

## Allocation, correctness and limits

The separate 9 s resumed-play allocation lane reduced sampled allocations under
`writeBasis` from **103.23 → 0.81 MiB** for JS and **103.38 → 0.66 MiB** for the
pool. Whole-main-thread estimates were **2450 → 2405 MiB** and **2420 → 2454 MiB**
respectively: no convincing general allocation win. One sampled profile per side
is diagnostic evidence, not a throughput ranking. Publication still accounts for
~158.5 MiB of self allocation in revised JS, decoding ~132.4 MiB, and the largest
HUD entity-filter site ~953 MiB. This task did not isolate every remaining
allocation cause or change the HUD.

Fixed numeric storage increases by 160 KiB for serial execution and 192 KiB for
workers: 1,664,024 → 1,827,864 bytes and 2,778,136 → 2,974,744 bytes. Three bounded
ID-reference arrays also use ordinary heap storage. JS main post-GC heap grows
45.57 → 50.43 MiB before and 45.94 → 50.84 MiB after over this lane; producer heap
grows ~28.69 → 33.4 MiB in both. Presentation worker heaps remain ~0.272 MiB.
**Whole-engine memory stability is still unproven.**

Validation categories remain separate:

- Nine focused numeric/ownership tests, 314 expectations; both strict TypeScript
  projects pass. Process policy: 4,942 files, zero violations.
- Six paths have two identical seeded production-AA canvas captures each;
  four additional old/new JS captures also match. All 16 images share PNG-data-URL
  SHA256 `e86a4c7609459d768c10927cb786cd3fbccfa6d500874acc4af033834c065e06`, exact
  gameplay state and renderer work. A seventeenth capture tests in-flight reset
  rejection. Untimed worker flushes establish parity, not latency equivalence;
  these canvas images exclude DOM HUD pixels.
- Twelve completed timing trials, none invalid for focus/reset; all three bounded
  awake guards released without suspected sleep. 17,800 valid GPU queries, seven
  pending, zero invalid/disjoint. GPU queries cover WebGL rendering, excluding
  Canvas2D and compositor work.
- Ten owned browsers cleaned up with identity-checked receipts and no surviving
  processes/windows. Console failures were the existing offline endpoint 404s.

The pool's first candidate trial had slower producer/age tails and substantial
variation despite valid focus. Its cause remains unresolved; the result is
inconclusive, not discarded. No new backend-ranking, longer stability run, arena
sweep or combination test followed. Rebinding immutable runtime maps, arbitrary
external retained-transform writers and general topology changes remain outside
this private contract. No general engine primitive was promoted.

## Remaining bottleneck and next task

| Rank | Evidence | Gap and confidence |
| --- | --- | --- |
| 1 | Revised JS producer wall 11.30 / 16.45 / 20.74 ms; compute median 10.14 ms; presentation median 6.99 ms | Producer execution and endpoint availability remain the main motion ceiling. Strong measured stage evidence; this run does not isolate every producer cause. |
| 2 | ~84% of revised JS samples clamp to the latest endpoint; requested sample is ~6.4 ms beyond it at the median | The unchanged 16.667 ms delay often lacks a bracketed pair. More submissions alone repeat endpoints. Strong direct evidence; no latency-policy change was tested. |
| 3 | Main frame p95 ~8.03 ms; full membership/material/fallback work and allocation remain | Display tails still exceed 6.06 ms. Strong evidence of remaining work; its individual causal shares were not reprofiled here. |
| 4 | Renderer GPU p95 3.49 ms versus producer/main tails above | GPU work remains required, but this is not a GPU-only limit. Compositor/post costs and physical presentation remain outside the timer. |

Within the producer, obstruction work is **2.60 ms median**, sample preparation
1.11 ms, frame application 1.32 ms, packing 0.77 ms and metadata 1.14 ms. These
are nested stage measurements, not an additive frame budget. Input waiting
3.53 ms, message delivery 3.37 ms and buffer waiting zero are separately reported
wall intervals, not CPU execution.

**One next task:** move this same retained dirty-row contract upstream to the
existing producer, so unchanged owned records do not require full object endpoint
reconstruction, serialization and receiver scanning. Keep both executors on that
contract, preserve the checked fallback and resource validation, and leave
simulation and latency policy fixed for the comparison. This targets the measured
remaining preparation/allocation instead of another tiny numeric-kernel change.
It is a recommendation, not a claim that this alone guarantees 165 Hz.

## Evidence and reproduction

[Audit data](../../../../../.local/engine-perf/retained-publication-20261014/audit.json),
[raw analysis](../../../../../.local/engine-perf/retained-publication-20261014/analysis.json),
[source diff](../../../../../.local/engine-perf/retained-publication-20261014/source-diff.json),
[recommended native-lab configuration](../../../../../.local/engine-perf/retained-publication-20261014/recommended.json)
and [experimental JS configuration](../../../../../.local/engine-perf/retained-publication-20261014/candidate.json)
are saved beside all trial samples, effective settings, profiles, images and
cleanup receipts. Missing old counters are null in the analysis, not zero work.

Use the existing managed URL (this run: `http://127.0.0.1:8797/game/`). The runner
routes it to the frozen artifact; opening the URL alone does not select the spike.
In PowerShell, replay one block without rebuilding:

```powershell
$bun='C:/Users/MindOverMelee/AppData/Local/npm-cache/_npx/22f2fe8d8bc13000/node_modules/bun/bin/bun.exe'
$env:PATH=(Split-Path -Parent $bun)+';'+$env:PATH
$env:PERF_NATIVE_ROOT='.local/engine-perf/retained-publication-repro'
New-Item -ItemType Directory -Force $env:PERF_NATIVE_ROOT | Out-Null
Copy-Item '.local/engine-perf/retained-publication-20261014/checkpoint.json' "$env:PERF_NATIVE_ROOT/checkpoint.json"
$env:PERF_NATIVE_ARTIFACT='.local/engine-perf/retained-publication-20261014/artifact/index.html'
$env:PERF_NATIVE_CONTROL_ARTIFACT='.local/engine-perf/retained-slice-20261014/artifact6/index.html'
$env:PERF_URL='http://127.0.0.1:8797/game/'
$env:PERF_SLICE_ISOLATED='1'
$env:PERF_SLICE_RESET_RACE='0'
& $bun spikes/persistent-world-worker/lab/runner/playable-native.ts timing retainedMaintenanceJs
```

The other declared contrasts are `retainedMaintenancePool` and `retainedJs`.
No builds, tests, capture or profiling ran inside throughput measurements. Local
isolation headers are not a production deployment change. CPU/GPU durations
overlap, submissions are not proven physical presents, and no frozen scene or
numeric microbenchmark is being presented as 165 Hz gameplay.
