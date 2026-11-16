# In-window CPU and GPU diagnostics — October 10, 2026

**Control drift remains unexplained; 165 Hz fresh-motion gameplay is unproven.**
This follows the [GPU-only diagnostics](october-9-fresh-render-ablations.md#gpu-readings-inside-the-replay)
with Windows CPU counters and concurrent-process evidence. No settings or user
processes were changed, and no runtime optimization was promoted.

## Scope and validity

Evidence root: `.local/engine-perf/fixed-render-fifo-20261009/roof`, prefix
`fifo-active-system-v2`. Three visible, focused, fresh-browser rooftop controls
retain the frozen full renderer, normal AA, full services, 1366×768/DPR 1 and
661 logical samples each. All 1,983 samples pass exact final-state, ordered
tick/step and observed pose-transition checks. Raw sampler streams, failed attempts,
campaign receipts and offline CPU/GPU analyses are retained. These are diagnostic
timings: combined sampler overhead is uncalibrated and throughput reporting rejects
them. They do not prove physical presentation or real-time latency.

The sampler batches Processor Information and Process counters at requested 1 Hz.
It preserves duplicate process instances using full paths and joins CPU totals by
PID plus creation counter. Only adjacent observations wholly inside the replay
contribute CPU deltas. Invalid/partial process instances and provider warnings are
retained; new/exited processes and boundary slivers remain incomplete.

Windows' installed counter help warns that `Processor Frequency` may not reflect
hardware-controlled frequency. `% Processor Performance` reports performance while
executing relative to nominal performance; it is not instantaneous MHz or a thermal
sensor. CPU temperature and per-thread scheduling remain unavailable here.

## Results

| Metric | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Replay time, seconds | 6.270 | 6.553 | 6.180 |
| Covered CPU interval, seconds | 4.256 | 5.356 | 4.256 |
| Retained CPU observations | 5 | 6 | 5 |
| Processor Performance p50, % nominal | 163.70 | 160.89 | 163.57 |
| Processor Utility p50, % | 30.76 | 38.79 | 29.83 |
| Outside-owned-browser CPU seconds / covered second | 0.316 | 0.458 | 0.272 |
| CPU sampler's own CPU seconds / covered second | 0.022 | 0.015 | 0.015 |
| GPU graphics clock p50, MHz | 1140 | 1080 | 1140 |
| GPU temperature p50, C | 70 | 70 | 70 |
| WebGL GPU range p50, ms | 5.17 | 5.58 | 5.24 |

The slower second run coincides with more outside CPU activity, slightly lower
Processor Performance and GPU clocks, and longer GPU range time. `code`, NVIDIA's
display container and `system` contribute to the observed outside activity; that
category also includes the GPU sampler. These totals do not prove contention on
the game's threads. Sampler CPU time excludes indirect provider/driver overhead.
Different covered intervals and the third run's later retry further limit causal
comparison. No independent uncertainty or observer-overhead bound is established.

CPU receipt-lag p95 is 66–69 ms. Runs 1/2/3 exclude 12/18/0 invalid process
observations; the retained joins contain no unmatched process identities. The
third run recovered near the first run's duration at the same sampled GPU
temperature. Neither GPU temperature nor competing activity alone explains the
drift. Next evidence must separate observer cost and thread scheduling from actual
execution cost before promoting small timing gains.

## Collector failures retained

The first per-process API prototype needed about four seconds for one enumeration
and was rejected before benchmarking. The initial batch prototype collapsed
same-name processes because Windows' short instance name omits numeric suffixes;
full-path grouping fixed it. A combined trial then stopped on a transient invalid
counter. Recording statuses fixed that; the third v2 startup exposed partial
counter instances and was retried after counting them explicitly. The first two
completed v2 trials were preserved. These are collector fixes, not gameplay changes.

The [runner README](../../../../../../../spikes/persistent-world-worker/README.md)
owns flags and reproduction. Tests cover window clipping, duplicate names, PID
reuse and diagnostic configuration separation; focused TypeScript and process
policy checks pass. Browser and sampler ownership/cleanup receipts are retained.

## Warmup discontinuity found before observer calibration

Saved restore/measurement timestamps expose an idle-period confound. The four full
controls in `guard-hoist-abba` wait 2.94–3.11 seconds after restore before measurement.
`fifo-active-gpu` waits 3.85–9.87 seconds; the combined diagnostics above wait
6.56–6.87 seconds. The bounded producer is suspended during these intervals.
Native probes and observer setup occur after the original warmup, so those cohorts
cannot isolate polling cost from different idle histories. This does not establish
that idle duration caused the observed drift.

The opt-in `PERF_CONTIGUOUS_WARMUP=1` protocol repeats the same 661 samples after
setup, then restores and measures inside one browser call. It records exact count,
restore state and endpoints; it is a separate configuration, not an engine change.
Three unprofiled, observer-off `fifo-contiguous-warmup` controls pass all 1,983 measured
state/work/pose-transition checks. Last warmup submission to measurement is
27.50/26.90/27.40 ms; restore completion to measurement is 0.10/0/0 ms. These are
CPU endpoints, not GPU completion or proof of steady clocks/temperature.

Replay times are 6.106/6.190/5.993 seconds. Rate spread is 3.24%; median trial CPU
submission p50/p95/p99/p99.9 is 8.10/15.20/16.00/23.00 ms, and 99.70% miss the
6.06 ms interval. This one cohort neither proves a gain over the legacy protocol
nor explains earlier drift. No runtime candidate is promoted. Observer on/off
calibration and independent sessions remain next, using the shorter measured gap.
CDP/OS totals now include the additional warmup and must not be attributed solely
to the measured replay. Raw gaps, control receipts and the unchanged worker hash
are retained; six browser cleanup receipts pass.

## GPU observer calibration

`fifo-gpu-calibration` uses eight fresh-browser controls in predeclared off/on/on/off,
on/off/off/on order. Both modes use contiguous warmup, full rendering/services and
the identical frozen worker; CPU polling, traces and heap/CPU profiling remain off.
All 5,288 measured samples pass exact final-state, tick/step and observed pose-change
sequence checks. Individual trial plans, samples and calibration results are saved.

Median trial capacity is 106.15 samples/s with GPU polling off and 103.77 with it on.
The paired observer-on effect is **-2.51%**, exploratory 95% interval
**[-7.16%, +2.38%]**. The paired p95 interval effect is -1.47%, interval
[-3.22%, +0.33%], where positive would mean improvement. Rate spreads are about
7.04% off and 7.97% on. **Negligible overhead is not established.** Keep these device
snapshots diagnostic-only; they cannot explain or correct away small timing gains.

Last warmup submission to measurement ranges 26.0–30.2 ms off and 27.4–45.8 ms on.
The comparison includes the observer's effects on warmup and restoration as well
as measured polling, so it is not a pure polling-call cost. Packet-acquisition deadline
misses remain roughly 99% in both modes. This larger cohort also shows the shorter
warmup gap did not remove control variation. CPU-observer calibration, independent
sessions and thread-scheduling attribution remain open; no production promotion.

## CPU observer calibration and pacing recovery

`fifo-cpu-calibration` repeats the eight-trial design with only CPU polling varied;
GPU polling remains off. All 5,288 samples pass state/work/pose-transition checks.
Median capacity is 103.40 samples/s off and 104.11 on, but the paired effect is
**-0.37%**, exploratory 95% interval **[-6.44%, +6.10%]**. Control rate spread is
2.58%, observer-on spread 6.56%; paired p95 effect is -0.70%, interval
[-8.12%, +7.32%]. This does not establish negligible CPU-observer overhead.
Last warmup submission gaps are 26.5–29.7 ms off and 26.2–31.4 ms on.

A separate pacing change limits interpretation: trial 1's empty-page preflight is
130.92 callbacks/s; trials 2–8 are 165.02–165.07. These observations precede CPU
sampler startup, so they are not evidence that CPU polling restored 165 Hz pacing.
The previous GPU-calibration cohort's preflights were 130.06–132.77. Browser version,
renderer and pinned graphics settings remain identical. The transition's cause
is unobserved, and callback rates still do not prove physical scanout. Calibration
reports now expose this pacing spread independently of build/configuration parity.
Do not pool these sessions or treat the earlier 130 Hz ceiling as persistent.

During CPU-calibration gameplay, rAF averages 134.46–142.66 callbacks/s, while
fixed-work capacity remains 98.41–105.24 samples/s. Roughly 86–91% of packet-acquisition
intervals miss 6.06 ms. Trial 6 (observer off) retains a 153.80 ms acquisition gap
at logical sample 545: host wait is 142.5 ms, worker compute 8.2 ms, simulation
1.5 ms, draw 4.9 ms and GPU range 3.97 ms. The next packet waits 143.5 ms as well.
These overlapping durations must not be summed. Packet receipt precedes the long
host wait, narrowing the spike beyond simulation cost; without a trace it does
not distinguish scheduling, GC, another main-thread task or browser presentation
behavior. The spike remains in the results. Both observers stay diagnostic-only.

## Traced controls: execution and waiting

`fifo-host-wait-trace` captures three fresh-browser rooftop controls with contiguous
warmup, full rendering/services, two-buffer FIFO and 661 fixed-work samples each.
CPU profiling and browser tracing are enabled; per-frame trace marks, allocation
profiling and CPU/GPU polling are disabled. All 1,983 samples pass exact final-state,
tick/step and pose-transition checks. This is diagnostic evidence, not a new
throughput comparison or image-parity run. All traces are complete and bounded by
explicit measurement marks; six browser cleanup receipts pass.

| Measured quantity, ms | Control 1 | Control 2 | Control 3 |
| --- | ---: | ---: | ---: |
| Replay window | 6631.34 | 7267.03 | 6728.54 |
| Acquisition interval p50 / p95 | 11.30 / 13.70 | 11.80 / 15.20 | 11.10 / 14.10 |
| Acquisition interval p99 / p99.9 | 17.00 / 18.40 | 19.00 / 44.10 | 18.20 / 22.10 |
| CPU submission interval p50 / p95 | 11.20 / 13.20 | 11.70 / 14.10 | 11.10 / 13.50 |
| CPU submission interval p99 / p99.9 | 16.90 / 18.40 | 18.90 / 38.80 | 17.90 / 22.10 |
| Main-thread task CPU time | 3874.61 | 4506.62 | 4072.15 |
| Worker task CPU time | 5661.70 | 6103.19 | 5573.53 |
| GPU-process task CPU time | 5695.48 | 6303.95 | 5871.22 |
| Main-thread GC wall time | 71.06 | 97.10 | 78.46 |
| Worker GC wall time | 280.86 | 284.08 | 263.14 |

CPU totals union recorded task CPU-clock spans wholly inside the measurement
window. These threads overlap: do not sum their totals into a frame budget.
GPU-process CPU time is not GPU-device execution time. Occasional individual task
CPU durations slightly exceed wall duration, so their differences are not exact
wait accounting. GC is already included in the thread's work. Across only three
profiled controls, no paired uncertainty interval or observer-overhead correction
is justified. About 87.1%, 93.9% and 87.1% of CPU submission intervals exceed
6.06 ms; packet-acquisition misses are 90.6%, 96.7% and 91.2%.

Control 2's 44.10 ms acquisition gap (host frame 1948, simulation tick 173) includes 32.80 ms
of packet host wait. Main-thread and worker GC overlap are both zero. The main
thread has 12.14 ms of recorded task coverage in that interval; the worker has
17.98 ms. Concurrently, a GPU-process task spans 26.51 ms with only 0.38 ms of
recorded CPU execution. Its nested WebGL command-buffer processing spans 26.47 ms
with 0.35 ms CPU. This narrows a coincident stall to command processing but does
not identify a blocking API, OS scheduling gap or causal dependency on submission.
The earlier unprofiled 153.80 ms event was not reproduced and remains unexplained.

An offline reporting defect initially anchored acquisition intervals at the later
render-submission timestamp. The corrected analyzer uses `packetTakenAtMs`, rejects
missing endpoints and clips overlaps to trace coverage. The table now distinguishes
acquisition from CPU submission. Control 2's acquisition endpoint shifts 3.50 ms
earlier; the coincident GPU span and absence of main/worker GC remain, while worker
task overlap changes from 14.51 to 17.98 ms. Original reports are retained with
`-before-endpoint-fix` suffixes. Five focused tests (20 assertions) and spike
typechecking pass; all three traces have acquisition timestamps for every interval.

The slower second replay also accumulates more task CPU time on all three threads;
its additional GC is small relative to the 635.69 ms replay increase. Neither GC
alone nor the single observed command-buffer wait explains overall control drift.
Next attribution needs OS scheduling/driver-wait evidence or a controlled repeated
reproduction. No candidate is promoted on these traces. Physical presentation,
visible-response latency, six-arena/stress acceptance and fresh-motion scheduling
comparisons remain open.

Local evidence shares `.local/engine-perf/fixed-render-fifo-20261009/roof/`:
`fifo-host-wait-trace-plan.json` pins configuration; per-trial JSON, traces and CPU
profiles retain raw observations; `-fixed-work.json`, `-findings.json`,
`-gpu-stall.json` and `-trace-analysis.json` retain checks and attribution.
Reanalyze with the existing `trace-analysis.ts` using `PERF_ROOT` set to that
directory and `PERF_PREFIX=fifo-host-wait-trace`. Retain local evidence until the
drift investigation and dependent promotion decisions are resolved.

The October 10 OS-capture capability probe found WPR, WPA and xperf installed,
but an owned, uniquely named `CPU.light` recording failed with `0xc5585011`:
"Failed to enable the policy to profile system performance." The process token
is not elevated. Final status confirms no recording remains; no policy or graphics
setting was changed. `wpr-capability-20261010.json` retains the attempt. OS scheduler
attribution is unavailable through this session's tested capture path; independent
engine/rendering experiments can continue without treating the drift as resolved.
