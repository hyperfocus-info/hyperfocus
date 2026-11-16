# October 10: primitive processing with draw dispatch retained

**Removing primitive processing did not approach 165 samples/s in the current
fresh-work schedule.** Median GPU range time fell from 5.59 to 0.10 ms, but fixed-work
capacity measured 98.11 versus 109.20 samples/s. The paired capacity estimate is
+10.94%, exploratory 95% interval [+6.15%, +15.94%]; control variation is 6.03%,
above the declared 5% gate. Treat the throughput benefit as inconclusive. The
candidate deliberately renders no geometry and cannot qualify for promotion.

## Experiment and verification

Rooftop seed 714; visible focused Chrome 154.0.8037.58, RTX 4070/ANGLE D3D11,
1366 by 768/DPR 1, normal AA and VSync, AC power, full services. Eight fresh-browser
trials use ABBA/BAAB ordering. Each runs twelve seconds of warmup, another
contiguous 661-sample warmup, restore, then 661 measured samples at 165 logical
samples/s through the two-buffer FIFO. CPU profiles, traces, allocation observers
and system polling are off; asynchronous GPU queries remain matched between modes.

| Hypothesis | Controlled variable | Expected signature | Observation / decision |
| --- | --- | --- | --- |
| Primitive processing explains most of the fresh-work deficit | Set the instance argument to zero at all six surface/shadow/outline draw sites | GPU range time collapses; if this is the sole limiting path, CPU throughput approaches the target | GPU time collapses, but capacity remains about 109 samples/s and misses 79% of CPU submission deadlines. GPU-only changes are insufficient in these runs; exact throughput effect fails the drift gate. |

The control rebuild exactly matches the retained executable. Only the two renderer
source files differ in the candidate graph; the worker binary is identical.
Command traversal, material/mesh binding, resource checks, uploads, native draw
dispatch, post-processing and HUD remain. Primitive counters become zero while
API draw counts remain real. No production renderer source was changed.

A separate wrapped-call diagnostic verifies every native draw's instance argument
and matches dispatch counts to renderer counters on every measured frame. Both
one- and two-buffer 661-sample replays issue 1,612,544 calls: 1,606,506 indexed and
6,038 non-indexed, all with zero instances. Both final gameplay states match the
full-render reference. Readbacks and wrappers occur only in these diagnostics.
Captured images show the intended empty geometry layer; this is not image parity.

All 5,288 timing samples pass final-state, tick/step and pose-transition gates.
Median per-frame API counts remain 2,299 draws, including 1,111 shadow and 78
outline draws; material bindings remain 1,145 and submitted upload bytes 125,632.
These are API/accounting counts, not proof of actual driver copies or RAM traffic.
All eighteen browser cleanup receipts and runtime-error checks pass.

## Measured paths

Medians of four trial statistics; CPU and GPU paths overlap and must not be added.

| Metric | Full rendering | Zero instances |
| --- | ---: | ---: |
| Capacity, samples/s | 98.11 | 109.20 |
| Within-mode capacity spread | 6.03% | 2.09% |
| CPU submission interval p50 / p95, ms | 11.00 / 13.40 | 8.30 / 12.75 |
| CPU submission interval p99 / p99.9, ms | 17.85 / 19.70 | 17.15 / 21.45 |
| CPU submission deadline misses at 6.06 ms | 85.00% | 79.32% |
| GPU range p50, ms | 5.59 | 0.10 |
| Worker compute / preparation p50, ms | 7.45 / 5.70 | 7.00 / 5.30 |
| Main-thread / draw p50, ms | 4.30 / 2.40 | 4.00 / 2.20 |

The paired p95 submission-interval ratio improves 5.07%, exploratory interval
[+2.20%, +8.03%]; GPU-range time ratio is 55.6 times, interval [51.8, 59.8]. These
four-pair intervals do not establish independent-session repeatability. Control
drift remains unresolved. The identical worker also runs faster in the candidate
cohort; that is an observed end-to-end interaction, not a worker algorithm change.

Empty-page pacing remains 164.93–165.04 callbacks/s (0.066% spread). Valid GPU query
coverage is 99.55–99.85%, with one to three pending queries and no disjoint/invalid
results reported. Warmup gaps are 25.9–31.0 ms. Boundary power/GPU snapshots are
retained; clocks and CPU thermals are not continuously observed. Zero-count draws
may change driver validation, shader execution, residency and deferred work, so
this does not independently measure the driver cost of ordinary draw calls.

Scene-wide poses repeat on 72.27% of comparable transitions in every trial.
Fixed-work samples are not new simulation ticks, distinct displayed poses or proof
of physical scanout. Input-to-visible latency and sustained memory/thermal drift
are outside this short diagnostic. Production-AA failures remain failed.

The [native dispatch follow-up](october-10-empty-draw-dispatch.md) keeps the same
zero-primitive state/binding workload and finds no established capacity benefit.
Representative draw/material-count sweeps and fresh-motion producer schedules
still need their own experiments before choosing a library design.

## Reproduction and retained evidence

The [persistent-worker runner](../../../../../../../spikes/persistent-world-worker/README.md)
owns generation, browser capture, comparison and analysis. Local inputs/results are
under `.local/engine-perf/fixed-render-fifo-20261009/roof/`:
`zero-instances-plan.json`, source patches and immutable builds;
`zero-instances-dispatch-check.json`; `fifo-zero-instances-abba-plan.json`, raw
trials and `-ablation-results.json`; and `fifo-zero-instances-validation.json`.
Retain these artifacts until rendering attribution and dependent architecture
decisions close.

Reanalyze with `bun spikes/persistent-world-worker/rendering/ablation-results.ts`,
setting `PERF_ROOT` to that directory, `PERF_PREFIX=fifo-zero-instances-abba`,
`PERF_CANDIDATE=zero-instances` and `PERF_FIXED_REFERENCE` to its
`fifo-full-smoke-1-worker-2-fresh.json`. The same analyzer exactly reproduces the
earlier resolution cohort's group statistics and paired effects. Six focused
tests (26 assertions) and spike typechecking pass. The initial typecheck caught
an unsupported `toSorted` library declaration; the implementation now copies
before sorting without changing results.
