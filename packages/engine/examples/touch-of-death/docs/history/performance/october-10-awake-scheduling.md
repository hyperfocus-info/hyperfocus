# October 10: awake scheduling re-screen

**Changing the schedule does not establish a capacity gain or 165 Hz gameplay.**
The pipeline schedule shortens submission tails but adds input polls. Preparation
remains about 5.5–5.6 ms, before compilation. The opt-in fresh worker already
defaults to this schedule; this comparison cannot claim a newly shipped gain.

## Experiment and controls

Hypothesis: requesting the next input before drawing and waking the host on a
packet can reduce serialized waiting. Expected signature: greater producer/main
overlap, shorter waits/tails and higher capacity with unchanged work.

Eight serial ABBA/BAAB trials compare `timer` with `paced-pipeline`. The latter
enables frame wakeups, late input, input-before-draw and paced idle polling as one
existing scheduling design. This screen does not isolate the four flags.

Every trial uses the identical frozen `control` artifact from the
[material-table experiment](october-10-material-table.md), rooftop seed 714,
level-9 AIs, full services, two buffers, normal AA, 1366×768 at DPR 1, visible
focused Chrome and the RTX 4070. Six-second initial warmup is followed by a
661-sample contiguous warmup, checkpoint restore and 661 measured samples at
165 logical samples/s. No trace, allocation sampler, GPU query observer, builds,
tests or second audit browser runs during timing. AC, unchanged high-performance
power plan, bounded wake requests and owned-browser cleanup are checked.

All 5,288 measured samples pass the fixed-work gate: exact final state,
tick/step/pose-change sequence, no superseded packets and drained queues. All
per-sample draw, shadow, outline, material-binding and upload counts match.
This gate does not prove every intermediate packet or image identical. No
within-version image comparison was run in this cohort; existing AA-repeatability
failures remain unresolved.

## Results

These are median statistics across four trials per schedule. Capacity is the
processing rate of a fixed logical replay, **not live FPS**.

| Metric | Timer | Paced pipeline |
| --- | ---: | ---: |
| Fixed-work samples/s | 98.87 | 100.06 |
| Capacity range / median | 16.65% | 8.31% |
| Worker compute p50 | 7.35 ms | 7.45 ms |
| Preparation p50 | 5.60 ms | 5.50 ms |
| Main update p50 | 4.30 ms | 4.30 ms |
| WebGL CPU span p50 | 2.45 ms | 2.40 ms |
| CPU submission interval p50 | 10.75 ms | 10.90 ms |
| CPU submission interval p95 | 17.65 ms | 13.25 ms |
| CPU submission interval p99 | 18.95 ms | 17.90 ms |
| CPU submission interval p99.9 | 29.05 ms | 21.45 ms |
| Submission deadlines missed (>6.06 ms) | 81.52% | 86.36% |
| Input polls per 661 samples | 976 | 1,563.5 |
| Worker input wait p50 / p95 | 0.60 / 3.40 ms | 1.70 / 4.35 ms |
| Worker buffer wait p50 / p95 | 0.10 / 2.35 ms | 0.10 / 2.50 ms |
| Received-packet-to-acquisition wait p50 / p95 | 1.60 / 5.65 ms | 1.55 / 5.50 ms |

Paired capacity effect: **+2.94%, exploratory 95% interval −4.59% to +11.06%**.
Both schedules fail the 5% variation gate. The timer control slowed from 6.30 to
7.48 seconds for identical work. Tail shortening is observed in all four pairs,
but it does not overcome capacity uncertainty or the higher missed-deadline rate.
The earlier input request also changes the interval counted as input waiting;
its longer wait must not be interpreted as additional serialized critical work.

Each sample borrows a 723,524-byte packet; two buffers retain 1,447,048 bytes in
both schedules. Poll counts rise about 60%, with 661 retained acknowledgements in
each timer trial versus 661–664 in pipeline trials. Acknowledgements and polls
are not additional simulation ticks. The same 184 pose changes occur across 660
comparable transitions: 72.12% repeats, with a longest run of 41 repeated poses.
There is no interpolation in this test.

The offline overlap report intersects observed producer and main-update wall
spans, using startup/end worker-minus-host clock bounds (about 0.5 ms wide).
Pipeline overlap spans roughly 3.04–3.10 seconds per trial versus 2.46–3.00 for
timer; each result retains conservative lower/upper overlap bounds. These wall
spans include stalls and preemption. They are not simultaneous CPU execution or
GPU utilization, and CPU/GPU stage times must not be added as a serial budget.

Empty-page callbacks are stable at about 165.00 Hz; no wake receipt indicates
sleep. This does not prove that sleep caused the earlier 130 Hz fallback.
Boundary GPU temperatures are 69–73°C, sampled outside the timed replay. They
cannot establish in-run thermal throttling; CPU temperature remains unavailable.
CDP/OS counter windows include 7.38–8.09 seconds beyond the retained replay, so
their deltas cannot attribute the control drift to another process or a specific
CPU frequency. GPU device time and physical presentation are unobserved here.

## Decision and reproduction

Keep scheduling experimental evidence separate from a new engine optimization.
The next useful schedule test isolates redundant input polling and measures live
input latency. The preparation floor remains a higher-priority work-reduction
target. No production source changes or default changes follow from this screen.

Raw data, plans, manifests, wake/cleanup receipts, the overlap report and drift
analysis live in `.local/engine-perf/material-table-20261010/roof/awake-schedule-*`.
Owner: engine performance audit. Prune only when replacement evidence preserves
these conclusions and provenance. Use a fresh PowerShell environment and prefix;
the frozen artifact and workload are local prerequisites. Confirm the managed
game URL remains `http://127.0.0.1:8798/game/` before running.

```powershell
$env:PERF_ROOT='.local/engine-perf/material-table-20261010/roof'
$env:PERF_PREFIX='awake-schedule'
$env:PERF_SEQUENCE=(1..8 | ForEach-Object { 'worker-2-fresh' }) -join ','
$env:PERF_ARTIFACTS=(1..8 | ForEach-Object { 'control' }) -join ','
$env:PERF_SCHEDULING='timer,paced-pipeline,paced-pipeline,timer,paced-pipeline,timer,timer,paced-pipeline'
$env:PERF_WORKLOAD='.local/engine-perf/worker-arena-campaign-20261008/workloads/roof-compact-714/workload.json'
$env:PERF_PROVENANCE='1'; $env:PERF_HEADLESS='0'; $env:PERF_VSYNC='1'
$env:PERF_GPU='high-performance'; $env:PERF_EXPECT_RENDERER='RTX 4070'
$env:PERF_FIXED_REPLAY_FRAMES='661'; $env:PERF_FIXED_REPLAY_HZ='165'
$env:PERF_FIXED_REPLAY_FIFO='1'; $env:PERF_RESET_AFTER_WARMUP='1'
$env:PERF_CONTIGUOUS_WARMUP='1'; $env:PERF_WARMUP_SECONDS='6'
$env:PERF_MEASURE_SECONDS='10'; $env:PERF_POWER='1'
$env:PERF_REQUIRE_AC='1'; $env:PERF_KEEP_AWAKE='1'
bun.cmd spikes/persistent-world-worker/compare.ts
$env:PERF_COMPARISON='scheduling'; $env:PERF_CONTROL_SCHEDULING='timer'
$env:PERF_CANDIDATE='paced-pipeline'
$env:PERF_FIXED_REFERENCE="$env:PERF_ROOT/awake-table-1-worker-2-fresh.json"
bun.cmd spikes/persistent-world-worker/rendering/ablation-results.ts
$env:PERF_REPORT=$env:PERF_PREFIX
$env:PERF_RESULTS="$env:PERF_ROOT/$env:PERF_PREFIX-drift.json"
bun.cmd spikes/persistent-world-worker/control-drift.ts
```
