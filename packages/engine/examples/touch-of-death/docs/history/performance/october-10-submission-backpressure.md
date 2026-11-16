# Submission backpressure — October 10, 2026

**The trace supports command-buffer backpressure as part of the longer WebGL
submission interval.** With per-material revisions, Chromium's buffer-space wait
occurs 163–166 times versus 68–72 in controls. Its wall time more than doubles,
while recorded main-thread CPU inside those waits stays small. GPU-process CPU
is also heavily occupied. Prioritize fewer draw/state commands, keeping revisions
as a preparation-cost control. Nothing is promoted; 165 Hz remains unproven.

## Diagnostic and evidence

Reuse the exact `revision-control` / `revision-candidate` binaries from the
[preceding experiment](october-10-material-input-revisions.md). Four fresh,
visible focused Chrome 154.0.8037.58 instances run control,candidate,candidate,control,
each with six-second warm-up and a three-second measured window. Rooftop checkpoint
714, full services, 1366×768/DPR approximately 1, normal MSAA, packed transport,
60 Hz producer, 16.67 ms delay, full entity loop and timer scheduling remain fixed.

CPU sampling and detailed per-frame trace marks are disabled. Stored frame/pose
provenance, asynchronous GPU queries and ordinary stage diagnostics remain.
Categories: `toplevel,gpu,devtools.timeline,blink.user_timing`. Two measurement
marks are bracketed by page timestamps. Four complete 45.9–48.9 MB traces cover
main, worker, compositor and GPU-process threads. No builds/tests/other audit
browsers overlapped collection. This is a separate diagnostic lane, not acceptance
timing or a measured low-overhead guarantee.

| Observation | A1 control | B1 revisions | B2 revisions | A2 control |
| --- | ---: | ---: | ---: | ---: |
| Trace window, ms | 3020.50 | 3012.02 | 3031.26 | 3016.53 |
| Display submissions | 339 | 337 | 334 | 317 |
| Buffer-space waits | 72 | 166 | 163 | 68 |
| Wait wall union, ms | 82.864 | 196.978 | 161.807 | 76.087 |
| Recorded CPU inside those waits, ms | 1.617 | 3.307 | 3.586 | 1.515 |
| Mean bracketed WebGL wall, ms | 2.375 | 2.688 | 2.725 | 2.466 |
| Recorded main task CPU, ms | 2745.33 | 2596.92 | 2575.82 | 2699.70 |
| Recorded GPU-process task CPU, ms | 2803.11 | 2856.66 | 2880.66 | 2790.08 |
| Main GC wall union, ms | 32.12 | 39.39 | 41.96 | 35.39 |
| Worker GC wall union, ms | 64.87 | 52.51 | 66.62 | 69.16 |

The outer event is `CommandBufferHelper::WaitForAvailableEntries1`. Its nested
`CommandBufferProxyImpl::WaitForGetOffset` has almost the same interval; do not add
them. Chromium emits the outer marker on its buffer-full path and the proxy can
synchronously request consumer progress. See the
[command-buffer helper](https://chromium.googlesource.com/chromium/src/gpu/+/refs/heads/main/command_buffer/client/cmd_buffer_helper.cc)
and [proxy implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/ipc/client/command_buffer_proxy_impl.cc).
The installed-browser source tag was unavailable through the source browser;
these readable sources support marker interpretation, not exact binary equivalence.

CPU inside the waits is about 2% of their wall time. The remainder includes
blocking/descheduling and measurement error; it is not device execution or proof
of a driver defect. GPU-process recorded task CPU occupies about 92–95% of each
window. This is CPU in the graphics process, not GPU utilization. Main, worker,
graphics-process and device durations overlap and must not be summed.

Within this cohort, paired mean WebGL wall rises about 0.31/0.26 ms per submission;
wait wall per submission rises about 0.34/0.24 ms. That agreement supports the
backpressure explanation, without proving exact decomposition or explaining all
untraced control drift. Elapsed-time workloads and observer/scheduling effects
still differ. Do not pool these values with the six-second untraced measurements.

## Alignment and limits

`diagnostics/submission-trace.ts` intersects both mark brackets, allowing **1 ms
rounding** for page timestamps. Offset intervals are 2.00–2.08 ms wide. Each WebGL
row has a guaranteed inner interval and possible outer interval. Named waits
overlap guaranteed interiors in 19/46/36/17 displays and possible intervals in
60/107/113/53. This broad allowance intentionally weakens short-stage attribution.

Enclosing-task CPU yields bounds only, never a proportional allocation to stages.
Bounds exist for 333/153/172/311 rows and remain too broad for a precise per-stage
CPU comparison. Missing clocks/coverage stay unknown. GPU-process task overlap
is wall overlap, not device execution. Nested wall and thread-CPU intervals are
unioned within each thread; missing wait events would not prove absence of waits.

All 1,327 asynchronous GPU samples are valid. Device draw p50/p95 is
4.78/7.50, 4.60/8.22, 4.68/8.20 and 5.29/9.19 ms, excluding post/HUD/compositor.
Submission rates are 112.23/111.88/110.18/105.09 per second; 98.51–100% of intervals
exceed 6.0606 ms. Observed fixed steps have no interior gaps. These diagnostics
prove neither 165 Hz motion nor physical scanout. CPU thermals/clocks, in-window
competing activity, hardware cache misses and RAM-bus traffic remain unmeasured;
no physical input-to-visible latency is added.

| Hypothesis | Expected signature | Evidence / uncertainty | Decision |
| --- | --- | --- | --- |
| Faster preparation encounters command backpressure | More buffer-space wait with little CPU inside it | Counts/wall more than double; CPU near 2% of wait wall; separate observed cohort | Supported contributor, not complete stall attribution |
| GPU-process command handling is a limiting path | High graphics-process CPU occupancy alongside waits | Recorded task CPU is 92–95% of window; device and post costs remain separate | Test fewer commands in the complete loop |
| These traces establish a throughput gain | Stable untraced paired benefit and correct images | Diagnostic ordering/work differs; prior AA repeatability still fails | No promotion |

## Reproduce and proceed

Raw root: `.local/engine-perf/material-revisions-20261010/roof/`.
`submission-trace-plan.json` records configuration; each trial owns raw trace,
numeric rows and profiler receipt. `submission-trace-trace-analysis.json` owns
whole-thread summaries; `submission-trace-submission-trace.json` owns bounded
attribution; `submission-trace-summary.json` is the compact receipt. Prior exact
endpoint/restore checks apply to these unchanged binaries. Same-version normal-AA
repeatability remains failed, as recorded in the preceding report.

Use the [existing runner](../../../../../../../spikes/persistent-world-worker/README.md)
with the recorded plan, `PERF_TRACE=1`, `PERF_PROFILE=0`,
`PERF_TRACE_PROVENANCE=0`, `PERF_TRACE_MAX_MIB=128` and the four categories above.
After collection, retain the same root/prefix and run:

```powershell
bun.cmd spikes/persistent-world-worker/presentation/display-live-results.ts
bun.cmd spikes/persistent-world-worker/trace-analysis.ts
bun.cmd spikes/persistent-world-worker/diagnostics/submission-trace.ts
```

Nine trace tests / 45 assertions, TypeScript and process policy pass. Eight cleanup
receipts are empty; all four wake requests released without expiry or suspected
sleep. The shared managed server has no unresolved errors.

Next apply the already screened material-table batching variant to the revision
pipeline, keeping its producer binary unchanged. Count draws, binds, upload bytes,
resource lifetime and same-version images; compare the full fresh loop before a
separate follow-up trace. Expected signature: fewer commands and buffer-space
waits, with lower GPU-process CPU per display. Extra table uploads/fetches or
worse tails can negate the benefit. Preserve failed AA evidence. Test shadow
batching separately afterward, rather than combining unmeasured changes.
