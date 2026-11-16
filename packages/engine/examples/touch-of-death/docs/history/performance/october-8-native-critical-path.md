# Native presentation and worker traces - October 8, 2026

Native resolution exposes both a GPU budget problem and distinct CPU spike
classes. Worker allocation is material, but garbage collection does not explain
the largest observed submission stall or the largest simulation-heavy frame.
The [performance audit](../../touch-of-death-performance-audit.md) owns priorities
and promotion; [browser repeatability](october-8-browser-repeatability.md) owns
the separate cadence, focus and MSAA controls.

Two visible, focused Chrome diagnostics restored the exact seeded checkpoint
after warmup. Construction included its first KO; compact rooftop stayed in
combat. Native drawing size was 2561 x 1398 at DPR 1.5, with two worker buffers,
full services, fine stage clocks, asynchronous GPU queries, main/worker CPU
profiles and browser tracing. Explicit marks bound 10.026 and 10.023 seconds.
These instrumented runs attribute cost; they are not accepted FPS comparisons.

## Renderer GPU budget

GPU queries stay attached to their originating row when results arrive. Every
measured row had a result. These durations cover the WebGL renderer, excluding
the separate post-process context and display compositor.

| Scene / phase | Samples | GPU p50 / p95 / p99 | Samples over 6.06 ms |
| --- | ---: | ---: | ---: |
| Construction / fighting | 624 | 5.54 / 8.02 / 13.20 ms | 217 (34.8%) |
| Construction / round result | 234 | 4.93 / 6.68 / 6.93 ms | 41 (17.5%) |
| Compact rooftop / fighting | 817 | 7.29 / 9.95 / 11.00 ms | 561 (68.7%) |

The rooftop median renderer GPU duration alone exceeds the 165 Hz deadline.
Reducing worker CPU cost cannot remove that separate limit. A next graphics
experiment should isolate native render scale, shadows and camera cutaways,
preserve a full-quality control, and include total presentation cost and images.
Do not add GPU duration to CPU duration as though both execute serially.

## Different spike causes need different experiments

The construction maximum interval was 35.5 ms at frame 1445, tick 191. The prior
frame's CPU draw lasted 33.3 ms; the current worker calculation lasted 9.1 ms,
with 24.7 ms message delivery and 0.1 ms host wait. An overlapping main-thread
message-handler task lasted 35.407 ms wall time but only 5.889 ms thread CPU,
with no main-thread GC. A GPU-process task overlapped for 33.895 ms wall time
while consuming 0.367 ms thread CPU. The current renderer GPU query was 4.73 ms;
the prior query was 5.27 ms, so neither equals the CPU draw stall.

This is evidence of a non-running interval during presentation, not 33 ms of
JavaScript calculation. Driver/GPU waiting, queue synchronization and operating
system descheduling remain to distinguish. The trace lacks the scheduler/wait
events needed to assign one cause. It does not retroactively explain the old
roughly 500 ms delivery gaps. Host wait was already negligible in this event.

The rooftop maximum interval was 26.7 ms at frame 1771, tick 438. Its worker
calculation took 25.6 ms, including 17.6 ms simulation across two fixed steps;
message delivery was 0.5 ms and the previous draw only 4.4 ms. The corresponding
worker task took 26.112 ms wall and 25.058 ms thread CPU, with no GC inside that
task. This spike is predominantly running worker computation. A different
rooftop 25.1 ms interval at frame 1514 included a 21.2 ms worker calculation,
14.2 ms presentation and about 6.0 ms unioned GC overlap across the interval.
Some collection straddled jobs; overlap is not a per-stage causal allocation.

Construction's 26.1 ms round-result interval similarly mixed two jobs: current
worker calculation 20.4 ms, simulation 9.4 ms across two steps, presentation
8.9 ms, and 3.5 ms GC overlap across the presentation interval. Keep round-result
and fighting distributions separate instead of attributing every tail to combat.

## Allocation and thread CPU evidence

| Measured window | Construction | Compact rooftop |
| --- | ---: | ---: |
| Worker unioned GC wall time | 439.7 ms (4.39%) | 445.4 ms (4.44%) |
| Worker minor collections | 224 | 208 |
| Minor GC p95 / maximum | 2.46 / 3.97 ms | 2.71 / 3.04 ms |
| Largest major GC | 4.04 ms | 4.96 ms |
| Summed minor-GC heap reduction per second | 572 MiB/s | 522 MiB/s |
| Worker task wall / recorded thread CPU | 9.568 / 9.063 s | 9.303 / 8.823 s |
| Main task wall / recorded thread CPU | 6.327 / 5.814 s | 7.768 / 6.178 s |

Nested GC spans are unioned; adding them would double-count pauses. Heap reduction
is an allocation-pressure proxy, not a complete allocation profile or retained
memory measurement. Construction totals include both phases. Main-thread GC
was 98.7/82.0 ms; it is smaller than worker GC in these windows.
Recorded thread CPU covers tasks entirely inside the marks, whereas task wall
time clips boundary tasks. Treat their aggregate difference as approximate;
individual complete tasks have matching wall/CPU boundaries. GPU-process thread
CPU is CPU service work, not hardware GPU time. Profiling overhead remains in
all of these numbers, so use them to choose isolated experiments, not project an
uninstrumented speedup. Reducing allocation should help recurring tails, while
the larger worker computation and native graphics costs still need direct work.

## Reproduction

The [worker tools](../../../../../../../spikes/persistent-world-worker/README.md)
own `trace-analysis.ts` and `attribution.ts`. The former clips to explicit marks,
unions GC, retains thread CPU and previous/current/next frame context; the latter
reports GPU and stage distributions by phase. Missing thread CPU stays unknown.

Temporary evidence lives in
`.local/engine-perf/worker-arena-campaign-20261008/marked-native-*`: two complete
traces, four CPU profiles, raw frame rows, `marked-native-trace-analysis.json`
and `marked-native-attribution.json`. These reproducible outputs may be pruned
after the owning campaign records its decisions; this note retains the findings.
