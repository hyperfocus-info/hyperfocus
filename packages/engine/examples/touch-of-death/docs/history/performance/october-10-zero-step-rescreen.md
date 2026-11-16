# October 10: awake zero-step preparation reuse

**Keep experimental.** Whole preparation passes fall by 63.54%; fixed-work capacity
improves in all four pairs, but controls drift and submission p95 worsens. This
does not establish live 165 Hz motion or qualify for production promotion.

The private owner-local experiment skips preparation only when no simulation
step occurred and viewport, pause and reduced-motion values are unchanged. Every
world command invalidates; disposal releases the retained frame, snapshot and
commands. Each sample still writes a complete packet and drains audio. This is
a fixed-resource workload experiment, not a general engine invalidation contract.

## Correctness and work

The archived prototype was adapted to the current frozen provenance endpoints
by `incremental/zero-step-recipe.ts`. The fresh path retains its existing work;
the skipped path records no application/compilation duration. No gameplay,
collision, renderer or resource policy is changed in production.

Visible RTX 4070 Chrome, depot seed 2026, 1366 by 768, normal MSAA, 165 logical
samples/s: control and candidate each pass 661 independent state/pose checks.
Every numeric packet, complete presentation sequence and committed state matches.
Candidate preparation runs 241 times and is reused 420 times. Audio changes on
22 zero-step samples, confirming that independent audio draining must remain.
Checkpoint images 0/330/660 differ by 0/0/1 pixels, maximum channel difference 1.
Cross-version image equality is diagnostic under the revised owner contract.

A second 661-sample capture per owner tests all 11 retained resize,
reduced-motion, pause/resume and restore events. Every event occurs without a
simulation step and forces preparation. Full state/packet/presentation parity
passes; 249 samples prepare and 412 reuse. These captures do not cover external
asset loading, resource replacement, arbitrary scene mutation or browser context
restoration. Same-version sustained image repeatability remains open.

## Eight-trial awake screen

All 5,288 timed samples pass exact work, final state, tick/step/pose transitions,
drained FIFO, focus, wake and creation-qualified browser-cleanup checks. Both
versions use the same normal-AA renderer and two-buffer storage. Every per-sample
draw, shadow, outline, material-binding and upload count matches across all eight
trials. Each candidate repeats the exact same 420 reuse decisions.

| Median of four trials | Control | Reuse |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 98.79 | 110.85 |
| Capacity range / median | 9.93% | 4.68% |
| Preparation p50 / p95, ms | 6.25 / 7.40 | 0 at timer floor / 6.65 |
| Submission interval p95 / p99 / p99.9, ms | 17.80 / 18.50 / 24.50 | 18.25 / 19.40 / 24.45 |
| Missed 6.06 ms submission deadlines | 80.08% | 63.26% |

Paired capacity effect is **+13.48%**, exploratory 95% interval
**[+7.55%, +19.74%]**. Control variation exceeds the predeclared 5% gate, so the
capacity claim remains inconclusive pending independent sessions. The p95 ratio
effect is **-2.06% [-3.51%, -0.58%]**, favoring control in every pair. Avoiding
work has not demonstrated better tails.

The candidate skips sampling, native/appearance/directed presentation, scene
application, compilation and view-projection preparation on the retained branch.
Both versions still write **725,316-byte packets 661 times**: **479,433,876 logical
payload bytes** and **1,450,632 retained transfer-buffer bytes** per trial. These
are packet accounting quantities, not measured physical RAM traffic or total
working set. The retained frame/snapshot/commands and allocation reduction need
separate measurement. Resource checks in the full path remain unchanged; safely
skipping that path under external resource writes is still an open contract.

Both versions repeat **77.27%** of submitted poses. Four logical seconds take
5.79–7.15 wall seconds; live real-time scheduling changes the available zero-step
fraction. Neither packet capacity nor repeated draws establishes distinct-motion
rate, physical presentation or input-to-visible latency. GPU-device timing was
not captured. Empty rAF median is 165.03 Hz, spread 0.05%; no sleep is suspected.
Saved power and CPU counters include boundary/export time, not just measurement.
GPU boundary observations do not explain the control drift; CPU temperature,
per-core residency and hardware cache/bandwidth counters remain unavailable.

Next: independently confirm controls and live scheduling/tails, cover resource
and scene writers, then integrate a bounded display-rate pose path. Do not enlarge
this owner-local retention into a general scene cache on these results alone.

## Reproduction

Owner: engine performance audit. Local evidence is under
`.local/engine-perf/zero-step-rescreen-20261010/depot/`; retain until replacement
evidence preserves the source identities, failures and raw measurement provenance.

Build `control` and `zero-step` with `spikes/persistent-world-worker/build.ts`:

- `PERF_FROZEN_SOURCES=.local/engine-perf/material-table-20261010/roof/control/sources.json`
- `PERF_BASE_HTML=.local/engine-perf/incremental-20261009/depot-control/index.html`
- `PERF_REBUILD_RUNTIME=1`; generate the candidate patch with
  `incremental/zero-step-recipe.ts`, then pass `PERF_SOURCE_PATCHES=<root>/zero-step-patches.json`.

For `verify.ts`, use artifacts `control,zero-step`, the retained
`worker-arena-campaign-20261008/workloads/depot-2026/workload.json`, checkpoints
`0,330,660`, capture Hz 165, provenance, retained state, complete visual-change
sequence and capture details. Prefix `correctness` has no scheduled changes;
`invalidations` uses `ceiling-20261009/zero-step-input-schedule.json`. Both set
visible/high-performance GPU, expected `RTX 4070` and `PERF_KEEP_AWAKE=1`.
Run `image-parity.ts` on `correctness`; preserve non-exact comparisons.

Timing uses `compare.ts`, prefix `awake-reuse`, eight `worker-2-fresh` entries,
artifact order `control,zero-step,zero-step,control,zero-step,control,control,zero-step`,
full services, timer scheduling, six-second warmup, reset and contiguous warmup,
661 fixed FIFO samples at 165 logical Hz, and a 15-second measurement bound.
Set provenance, visible/high-performance GPU, expected renderer, power inventory,
required AC and bounded wake requests. No image readbacks, profile, builds or tests
run during timing.

Run `incremental/material-words-results.ts` with candidate `zero-step` and output
`awake-reuse-preparation-results.json`, then `incremental/zero-step-results.ts`.
The latter checks unchanged renderer work, packet storage, repeated reuse
decisions and all 11 invalidations. It counts skipped whole passes, not individual
leaf calls, physical cache misses or RAM traffic. Full retained heap and working
set remain unmeasured. Preparation medians at the timer floor stay zero in raw
data; the reporter omits an undefined ratio rather than claiming infinite speedup.
`control-drift.ts` uses `PERF_REPORT=awake-reuse` and retains eight rows in
`awake-reuse-drift.json`. Focused TypeScript checks, 13 relevant tests / 887
assertions and process-policy verification pass; the managed server has no
unresolved errors. No production engine default changes in this experiment.
