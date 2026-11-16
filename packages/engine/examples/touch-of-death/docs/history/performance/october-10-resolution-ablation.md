# October 10: rendering resolution with fixed fresh work

**Halving rendering dimensions has no established throughput benefit in this
cohort.** Its paired capacity effect is -1.23%, exploratory 95% interval
[-7.52%, +5.48%]. Candidate variation exceeds the 5% gate. This is inconclusive,
not evidence that resolution never matters. No image-quality change is promoted.

## Controlled experiment

Rooftop seed 714, visible focused Chrome 154.0.8037.58, RTX 4070 through ANGLE/D3D11,
AC power, normal AA, CSS viewport 1366 by 768 and DPR 1. Four adjacent pairs use
ABBA/BAAB ordering and a fresh browser per trial. A is 1366 by 768 rendering;
B is 683 by 384. Each uses twelve seconds of warmup, another contiguous 661-sample
warmup, checkpoint restore and 661 measured samples at 165 logical samples/s.
The two-buffer FIFO retains all samples. This is fixed-work capacity, not a live
input, physical-presentation or fresh-motion acceptance run.

The control rebuild matches the retained executable exactly. One pixel-ratio
expression differs in the candidate source graph; the worker binary is identical.
Full services, simulation, preparation, camera, geometry and render passes remain.
The shadow map stays 2048 square. Main-color and Canvas2D backing sizes change
together. GPU queries are asynchronous; CPU profiles, browser traces, allocations
and system polling are off. No readback or forced completion occurs during timing.

| Hypothesis | Controlled variable | Expected signature | Result / decision |
| --- | --- | --- | --- |
| Main-target pixel work materially limits throughput | Half the width and height; one quarter of main-target pixels | Lower GPU range time and better frame capacity, with matching producer work | Neither benefit established; paired intervals include loss and gain. No promotion. |

All 5,288 measured samples pass exact final-state, tick/step and observed
pose-transition checks against the matching-service reference. Median draw counts
remain 2,299, including 1,111 shadow draws and 78 outline draws; material bindings
remain 1,145. All sixteen cohort cleanup receipts pass; runtime error lists are
empty. A preceding 661-sample candidate smoke independently passed the same gates.
Images intentionally differ in resolution: production-AA equivalence is not claimed.

## Results and limits

Values are medians of four trial statistics, not pooled frames. Intervals below
use adjacent recorded CPU submission endpoints, separate from packet acquisition.

| Metric | Full resolution | Half dimensions |
| --- | ---: | ---: |
| Capacity, samples/s | 99.42 | 99.32 |
| Within-mode capacity spread | 3.66% | 6.23% |
| CPU submission interval p50 / p95, ms | 10.95 / 13.35 | 10.95 / 13.55 |
| CPU submission interval p99 / p99.9, ms | 16.65 / 19.70 | 16.70 / 21.15 |
| CPU submission deadline misses at 6.06 ms | 85.68% | 85.68% |
| GPU range p50, ms | 5.53 | 5.68 |
| Worker compute / preparation p50, ms | 7.45 / 5.50 | 7.40 / 5.50 |
| Main-thread / draw p50, ms | 4.30 / 2.40 | 4.40 / 2.40 |

The paired p95 submission-interval effect is -2.19%, exploratory 95% interval
[-5.76%, +1.51%]; GPU-p50 effect is -2.23%, interval [-6.11%, +1.82%]. Positive
effects mean improvement. Four adjacent log-ratio pairs in one session do not
establish independent-session repeatability or prove equivalence.

Empty-page callback rates are 163.37–165.07 Hz, with 1.03% spread. Warmup-submit
to measurement gaps are 27.4–35.4 ms. GPU coverage is 658–659 valid queries per
661-sample trial, with the remaining two or three pending; no disjoint/invalid
results are reported. Query ranges exclude post/compositor work and may include
device idle time. GPU/CPU clocks and CPU thermals are not continuously observed.

All trials repeat the scene-wide pose on 72.27% of comparable transitions, with
a longest run of forty repeats. Those submissions are neither extra simulation
ticks nor proof of useful 165 Hz motion. This short replay cannot establish
retained-memory or thermal stability. CPU, driver and GPU stages overlap.

The result weakens the case for lowering this viewport's main-target resolution
as the next performance change. It does not isolate shadow cost, draw/driver cost
or power-state effects. Continue individual pass and draw/material-count experiments;
preserve the unresolved drift and normal-AA gates before promotion.

## Reproduction and evidence

Use `spikes/persistent-world-worker/compare.ts` with the saved per-trial plans under
`.local/engine-perf/fixed-render-fifo-20261009/roof/`. Set `PERF_ROOT` to that directory,
`PERF_WORKLOAD` to the rooftop seed-714 checkpoint, `PERF_SEQUENCE=worker-2-fresh`,
`PERF_FIXED_REPLAY_FRAMES=661`, `PERF_FIXED_REPLAY_HZ=165`, `PERF_FIXED_REPLAY_FIFO=1`,
`PERF_CONTIGUOUS_WARMUP=1`, `PERF_RESET_AFTER_WARMUP=1`, `PERF_PROVENANCE=1`,
`PERF_DIAGNOSTIC=1`, `PERF_SERVICES=full`, `PERF_SCHEDULING=paced-pipeline`,
`PERF_WARMUP_SECONDS=12` and `PERF_MEASURE_SECONDS=30`. Set visible/VSync/AC/RTX-4070
requirements as recorded in each plan. Run the ordered `PERF_ARTIFACTS` values from
`fifo-resolution-cohort-plan.json`, one invocation per trial with a new
`PERF_PREFIX` and the matching `PERF_EXPECT_DRAWING_BUFFER`.

`fifo-resolution-build-check.json` binds source/worker identities; each trial keeps
raw rows, graphics, environment, source/workload hashes and cleanup receipts.
`fifo-resolution-results.json` retains per-trial distributions, correctness checks,
query coverage and all four paired effects. The existing campaign, fixed-work,
provenance and paired-effect helpers own those calculations. Retain this local
evidence until the rendering experiments and dependent architecture decisions close.
