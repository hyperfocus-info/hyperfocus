# October 9: frame provenance baseline, first cohort

**165 Hz fresh-motion gameplay remains unproven.** This wave changes measurement
in the optional world owner, not the gameplay schedule or default playable.
The [pipeline](../../touch-of-death-frame-pipeline.md) owns the dependency/writer
map and provisional budgets. Its measurement milestone is partially complete.
The [follow-up cohort](october-9-cadence-and-controls.md) adds the independent pose
oracle, end-clock validation and repeated controls, and diagnoses current browser
pacing. Missing capabilities below describe this first cohort's boundary.

## Implemented observations

Schema 2 records owner/discontinuity, producer request, committed-update sequence,
fixed-step spans, runtime tick, combat frame, producer and host pose identities,
preparation/application/compile/packet boundaries, publication/send/receipt/take,
render start, CPU visual submission, packet release and main-update completion.
Input and buffer waits are separate and may overlap. Legacy `computeMs` still
excludes metadata; `totalProducerWallMs` includes it. These are wall durations,
not continuous CPU execution.

Exact pose comparison is bounded and copies retained matrices/joints/morphs.
It covers submitted scene content, including off-camera instances. Audio,
materials, lighting and HUD do not fabricate motion. Host comparison handles
superseded packets independently of the producer. `stateCommit` is an update
transaction sequence, not proof of distinct state contents. Manual verification
uses the existing complete simulation-state oracle.

Nine startup clock exchanges retain asymmetric transport bounds, time origins
and observed timer deltas. This cohort's worker-minus-host offset bounds were
approximately [-0.25, +0.25] ms, using an explicitly assumed 0.25 ms rounding
allowance. Zero measured RTT reflects timer quantization, not instantaneous
transport. Long-term clock drift is not checked yet.

## Controlled evidence

Raw artifacts, build graphs, images, profiles and receipts are under
`.local/engine-perf/provenance-20261009/`. The primary receipts are
`depot-overhead-abba-plan.json`, `depot-overhead-abba-campaign-results.json`,
`overhead-pairs.json`, both `*-provenance-parity.json` files and
`depot-provenance-trace-trace-analysis.json`.

Visible focused Chrome 154.0.8037.58, RTX 4070 Laptop, AC power, battery saver off,
full services, normal AA and identical checkpoint/build within the ABBA cohort.
**Backing size was 1920×998, DPR 1.5, not the previous 2561×1398 native cohort.**
Higher throughput across those cohorts is not an optimization result. The runner
now accepts an explicit expected backing-size gate. GPU boundary temperatures
were 57–61 °C; clocks varied. CPU temperature and continuous residency remain unknown.

| Hypothesis / controlled variable | Expected signature | Measured result / uncertainty | Parity / decision |
| --- | --- | --- | --- |
| Provenance preserves behavior; same replay in inline/worker | Same state, packet and presentation sequence | 661 samples per owner per arena; 2,644 standalone full-state oracle checks | Depot/roof pass existing normal-AA gate: maximum channel delta 2, at most 11/5 changed pixels. Instrumentation remains opt-in; older failed candidates stay failed. |
| Provenance overhead; same executable, off/on/on/off | Small stage cost and throughput change | Four 8 s windows after 6 s warm-up/reset; 3,405 rows. Fighting interval rate: 107.97 off versus 105.03 on. Control spread 0.23%; on spread 2.38%. Two paired effects average -2.72%; exploratory t95 interval [-18.84%, +13.41%], one cohort only. | Cross-session overhead size inconclusive. Never pool on/off or trace runs. |
| Pose comparisons expose repeated work | More submissions than distinct submitted poses | On trials: 62.44% / 63.49% repeated poses; longest runs 36 / 35 repeats. Approximately 59.8 fixed advances/s but 38.7–38.8 changed scene poses/s. | Includes intended gameplay holds; not all repeats are scheduling failures. Separate hold causes next. |
| Trace IDs permit browser-feedback association | Exact animation and compositor frame tokens | Complete 4.005 s trace, 84,056,700 bytes; all required thread classes observed. 306/386 measured submissions associate strictly; 80 have mismatched/missing frame tokens. | Browser association only. Game pixel contents and physical scanout remain unverified. |

The on trials' CPU submission intervals had p50 7.90 ms, p95 15.60–15.80,
p99 16.40–16.50 and p99.9 22.60–26.30 ms. More than 99.5% exceeded 6.06 ms.
With only 828/849 intervals, p99.9 is effectively the maximum, not a stable tail
estimate. State-commit age at CPU submission was p50 17.2–17.4 ms and p95 26.3 ms;
this is not pose age at presentation. Poll-to-CPU-submit and applied-input age
are exported separately; input-to-visible response is still unavailable.

Pose checking cost about 0.10 ms mean on each CPU thread, with p95 0.20 ms.
Do not add that to GPU work. The diagnostic trace's asynchronous WebGL queries
were valid for all 386 measured rows: p50 4.886 ms, p95 6.650 ms, excluding
post-processing/compositing. GPU status distinguishes pending, disjoint, context
loss, unsupported, queue-full and invalid-result observations.

The trace recorded about 3.503 s worker task CPU and 2.087 s renderer-main task
CPU over the overlapping 4.005 s window. Worker/main GC occupied 148.4/56.5 ms
of wall time. Nested task CPU spans are now unioned; the prior GPU-process sum
could double-count nested tasks. These observations do not establish allocation
rate, memory bandwidth saturation or driver causality.

## Reproduction and remaining acceptance

Use the managed `/game/` surface and the retained private artifacts; neither
build overwrites the shared playable. The spike [README](../../../../../../../spikes/persistent-world-worker/README.md)
owns all switches. For the overhead cohort:

```powershell
$env:PERF_ROOT='.local/engine-perf/provenance-20261009'
$env:PERF_PREFIX='depot-overhead-repeat'
$env:PERF_SEQUENCE='worker-2-fresh,worker-2-fresh,worker-2-fresh,worker-2-fresh'
$env:PERF_ARTIFACTS='depot-2026,depot-2026,depot-2026,depot-2026'
$env:PERF_SCHEDULING='paced-pipeline,paced-pipeline,paced-pipeline,paced-pipeline'
$env:PERF_PROVENANCE_MODES='0,1,1,0'
$env:PERF_WORKLOAD='.local/engine-perf/worker-arena-campaign-20261008/workloads/depot-2026/workload.json'
$env:PERF_NATIVE_VIEWPORT='1'
$env:PERF_EXPECT_DRAWING_BUFFER='1920,998'
$env:PERF_EXPECT_RENDERER='RTX 4070'
$env:PERF_WARMUP_SECONDS='6'
$env:PERF_MEASURE_SECONDS='8'
$env:PERF_RESET_AFTER_WARMUP='1'
$env:PERF_POWER='1'
$env:PERF_REQUIRE_AC='1'
$env:PERF_HEADLESS='0'
$env:PERF_TRACE='0'
$env:PERF_PROFILE='0'
$env:PERF_DIAGNOSTIC='0'
bun.cmd spikes/persistent-world-worker/compare.ts
bun.cmd spikes/persistent-world-worker/campaign-results.ts
```

Still required before calling the baseline complete: independent canonical pose
oracle over lifecycle/resource/restore cases; explicit host submission/content
versions; input-response oracle and broader browser-frame coverage; end-of-run
clock validation; send/clone boundaries; bounded long-soak export and retained
working-set trend; multi-session paired uncertainty and continuous environment
evidence. Current parity samples are not a complete production-AA history study.
Then proceed through preparation profiling, fresh rendering ablations and motion
architectures in the [ordered plan](../../touch-of-death-165-plan.md). No final
library topology or Wasm migration has been selected.

Verification: 23 focused tests / 149 assertions and focused TypeScript checks
pass, including both shared GPU-timer consumers. Source-structure and process
policy pass. All 16 browser cleanup receipts contain zero owned processes/windows;
the shared server reports no errors. Repository-wide code style still fails on
dirty-tree violations; the follow-up records the current remaining scope. No
baseline was increased. `verification.json` retains the check receipts.
