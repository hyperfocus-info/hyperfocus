# October 9: fresh-work rendering diagnostics

**Diagnostic evidence only; 165 Hz fresh-motion gameplay remains unproven.**
The rendering variants retain the same fresh worker binary. No visual removal
qualifies as an optimization, and no new runtime architecture is selected.
Raw inputs, artifacts, samples and failures live in
`.local/engine-perf/fresh-render-20261009/roof/`.

## Controlled variants and correctness

`ablation-plan.json` and exact source patches define full rendering, clear-only,
no shadows, no outlines, unlit materials, no Canvas2D post, no fighter bars,
AA off and half backing resolution. Clear-only retains packet decode, post and
HUD but changes GPU mesh residency. Shadow removal also disables receiver
sampling. HUD removal affects fighter bars, not every UI service. Resolution
changes reduce post-processing pixel work too.

Each variant passed a 166-sample rooftop replay at requested 165 Hz against the
same archived inline control: complete state, independent pose identity, numeric
packet and presentation sequences agree. The control was captured once; reused
references are not new trials. Including both versions of the pass observer,
12 unique owners provide **1,992 state checks and 1,992 pose checks**. These short
replays do not cover KO, resource recovery, all arenas or sustained operation.
Checkpoint observations verify intended draw counts, overlay visibility, MSAA
samples and backing dimensions. Deliberately removed graphics do not pass the
unchanged-image gate by construction.

The first clear-only collector rejected a JSON-omitted `undefined` provenance
property, despite matching saved content. The comparator now normalizes persisted
values consistently; the original failure and explicit offline revalidation are
retained. This does not weaken state, packet or image equality.

## Per-pass observer

`per-pass-v2` replaces the total renderer timer with five sequential asynchronous
queries. It retains at most 40 pending queries plus one active query. It performs
no forced completion or pixel readback. Setup, shadow, inter-pass setup, outline
and surface CPU clocks stay separate from GPU ranges.

The original `per-pass` observer had independent disjoint consumers. A context's
disjoint event can be consumed by one reader, leaving other readers unaware.
Shared context generations now invalidate their pending queries; a regression
test models a flag that clears on read. This follows the
[Khronos timer-query contract](https://registry.khronos.org/OpenGL/extensions/EXT/EXT_disjoint_timer_query.txt).
The first artifact is retained but superseded; its timings are not used.
The corrected source is verified inside the frozen `per-pass-v2` graph, whose
worker hash still matches all rendering variants.

The corrected observer passes the three-checkpoint production-AA comparison
against the archived full control. This short result validates this observer's
images; it does not resolve the previously observed normal-AA redraw variation.

`pass-diagnostic-v2` uses a visible focused native 1920×998 backing at DPR 1.5,
Chrome 154, RTX 4070, full services, a 12-second warmup and an exact checkpoint
restore before six measured seconds. All 551 frame rows pass identity, focus,
capacity, simulation-time and cleanup gates. All 2,755 per-pass queries resolve
validly. No timed mesh or texture uploads occur. The scene contains 3,391 sampled
entities and 1,702 materials; the window stays in fighting without KO activity.

| Measured stage | p50 ms | p95 ms | Interpretation |
| --- | ---: | ---: | --- |
| Worker computation | 8.10 | 10.10 | Includes simulation, presentation and compilation |
| Worker presentation | 5.20 | 6.50 | Nested within computation |
| Worker compilation/packet stage | 1.80 | 2.10 | Nested within computation |
| Main GL submission | 3.20 | 8.80 | Wall time; not GPU execution time |
| GPU shadow range | 2.76 | 4.32 | Asynchronous elapsed query |
| GPU outline range | 0.03 | 1.47 | Asynchronous elapsed query |
| GPU surface range | 3.13 | 4.66 | Asynchronous elapsed query |
| Same-frame sum of five GPU ranges | 6.22 | 8.45 | Excludes query gaps, Canvas2D and compositor |

Shadows and surfaces dominate these GPU ranges. The ranges can include device
idle time and observer-induced stalls; they are not utilization or isolated shader
cost. CPU stages overlap GPU execution. Do not sum medians or CPU and GPU columns.
This single instrumented window has no paired uncertainty estimate.

CPU visual-submission intervals are p50 **11.20**, p95 **14.10**, p99 **21.20**,
p99.9 **144.20 ms**, with **91.64%** over 6.06 ms. At this sample count p99.9 is
the maximum, not a stable tail estimate. There are 293 changed scene-wide poses
across 550 transitions; 46.73% repeat, with a longest run of 27 repeats. Authored
holds are included. State-commit age at CPU submission is p50 18.70 / p95 30.50 ms.
None of these endpoints is a physical presentation or input-to-visible latency.

The verbose GPU trace exceeded the 128 MiB export bound and is retained as partial.
Its missing suffix cannot establish full-window thread or presentation coverage.
Heap boundaries span trace export and quiescence; they cannot measure retained
memory growth or allocation rate. A subsequent four-second `pass-trace-v2` run
uses fewer categories and exports a complete 88.48 MB trace with both measurement
marks. It covers renderer main, dedicated worker, compositor, Viz and GPU process.
All 367 rows and 1,835 pass queries are valid. GPU range-sum p50 is 5.52 ms and
p95 8.48 ms; shadow/surface p50 values are 2.16/2.86 ms. The changed window and
observer categories prevent treating that difference as a speedup.

In the complete marked window, worker GC spans occupy 163.78 ms (4.09%) and main
GC 33.89 ms (0.85%). These are unions of wall spans, not allocation rates or proof
that GC explains every stall. The 146 zero-step jobs still take p50 7.00 / p95
8.20 ms on the worker. Strict token joins associate browser presentation feedback
with only 162 of 367 host marks; 205 remain unknown. These joins do not establish
pixel contents, physical scanout or input-to-visible latency. Observer-off paired
timing, fuller frame association and allocation attribution remain open.

## Throughput comparison and remaining work

`full-clear-12s-plan.json` specified ABBA/BAAB with identical workers, normal AA,
12-second warmups, checkpoint restores and 12-second diagnostic windows. Its first
trial failed with a stopped world host; the failure capture was hidden/unfocused.
The browser cleanup receipt is clean. No throughput result is accepted from it.
Failure capture now retains bounded worker rows/errors, telemetry and native
foreground evidence so another failure can distinguish causes. The full block was
rerun as `full-clear-12s-b`; all eight trials and 10,128 combat rows pass measurement
gates, with clean owned-browser cleanup. The failed block remains separate.

| Median of four trial statistics | Full renderer | Clear-only |
| --- | ---: | ---: |
| Packet-acquisition rate / second | 96.86 | 114.47 |
| CPU visual-submit interval p50 / p95 ms | 10.70 / 15.05 | 6.30 / 12.60 |
| CPU visual-submit interval p99 / p99.9 ms | 19.20 / 25.10 | 18.20 / 22.50 |
| Submit intervals over 6.06 ms | 87.25% | 72.18% |
| Worker compute p50 / p95 ms | 7.75 / 11.35 | 6.90 / 10.65 |
| Main update p50 / p95 ms | 4.45 / 10.50 | 1.70 / 2.10 |
| Total renderer GPU query p50 / p95 ms | 5.83 / 8.15 | 0.005 / 0.030 |
| State-commit age at CPU submit p50 / p95 ms | 18.30 / 29.55 | 14.40 / 22.55 |
| Repeated submitted scene-wide poses | 51.57% | 58.57% |
| Run-to-run fighting-rate spread | 6.12% | 7.41% |

The four adjacent pairs give a geometric-mean throughput ratio improvement of
**18.98%**, exploratory t95 **[10.59%, 28.01%]**. The effect exceeds observed
control spread in this cohort, but both groups fail the 5% stability gate.
One cohort cannot establish the interval's independence assumption or a precise
repeatable gain. Clear-only is also intentionally visually incorrect; its
submitted pose metadata is not visible character motion. This is evidence that
rendering removal helps yet does not reach 165 under the retained producer.

All windows stay in fighting. Full trials prepare 1,115–1,186 packets with
405–474 zero-step calls; clear trials prepare 1,328–1,429 with 619–731 zero-step
calls. Covered fixed steps range 702–712 and 698–712 respectively, with no reported
simulation-time drops. Clear-only executes more repeated preparation and less
graphics work, so CPU contention and work counts change. No fixed-work kernel
speedup can be inferred from its lower worker time. Plans and
`full-clear-12s-b-{campaign-results,paired-results,compact}.json` retain every
trial, phase/step partition, uncertainty calculation and endpoint distribution.

The subsequent `shadow-12s` block uses the same eight-trial protocol and retains
9,344 valid combat submissions. Full/no-shadow median trial rates are 93.04/101.71
per second. Renderer GPU p50 falls from 6.21 to 3.38 ms, and CPU draw p95 from
8.65 to 2.65 ms; removing shadows changes both shadow-map work and receiver sampling.
CPU submit p95 is 16.45/15.80 ms and p99 19.80/18.75 ms. Target misses remain
88.57%/78.58%. The four-pair throughput estimate is +8.57%, exploratory t95
[+0.86%, +16.88%], against full/control spreads of 9.47%/7.05%. **The full-loop
gain is inconclusive:** control drift can explain its magnitude. The large
render-stage reductions support shadow cost attribution but do not establish a
stable gameplay speedup, unchanged-quality improvement or 165 Hz capability.
The first four trials also superseded 8–16 produced packets each; the subsequent
fixed-work lane explicitly checks that every planned sample is acquired.

| Experiment / hypothesis | Controlled variable and expected signature | Result / uncertainty | Parity | Decision |
| --- | --- | --- | --- | --- |
| Rendering alone explains the limit | Remove GL draws; fresh packet rate should approach the target | Paired block improves throughput but stays below target; both control groups drift | Deliberate visual failure; short state/packet replay passes | Keep as a diagnostic bound; preparation/scheduling work remains necessary |
| Shadows or surfaces dominate GPU work | Sequential pass queries; one range should dominate | Both are substantial in two diagnostic windows; observer overhead is not quantified | Corrected observer passes short normal-AA comparison | Prioritize individual pass measurements; no pass removal is promoted |
| A disjoint read invalidates other pass timers | Consume the shared GL flag once with multiple pending timers | Regression reproduces missed invalidation and passes with shared generations | Query correctness test; render output unchanged | Correct the measurement helper |
| Targeted pass removal isolates opportunity | Vary shadows, outlines, lighting, post, fighter bars, AA or resolution separately | Shadow stage costs fall, but its full-loop effect is inconclusive; other effects pending | Intentionally changed graphics | Measure before combining variants or redesigning rendering |

Current bottleneck ranking is provisional: (1) preparation/compilation remains
over the worker budget even without simulation or rendering (high confidence);
(2) full-quality rendering has insufficient GPU and main-thread tail headroom
(high confidence for the observed configuration; medium for the pass split);
(3) the separate browser pacing problem still blocks 165 display callbacks
(high confidence in the earlier empty-scene observations, cause unresolved).
GC is measurable but not the dominant average worker cost in the short complete
trace. Driver scheduling, allocation causes, cache bandwidth and sustained
thermal behavior still need evidence.

Live scheduling can change preparation counts even with identical code and seed.
Report phase, fixed steps, zero-step preparations, copies and draw counts beside
frame distributions. An initial exact-work lane is now verified below; a pipelined
equivalent and repeated ablation comparisons remain open.
Targeted pass ablations need repeated timings after this rendering-removal bound.
Production-quality optimizations still require stable paired controls, normal-AA
parity, six-arena and stress acceptance, sufficient-budget KO checks and sustained
memory/thermal evidence. The [ordered plan](../../touch-of-death-165-plan.md) owns
the remaining architecture and language comparisons.

## Exact-work replay follow-up

`.local/engine-perf/fixed-render-20261009/roof/` freezes a private producer with a
bounded logical clock. It prepares exactly 661 samples at `index * 1000 / 165`,
from zero through 4,000 ms, then stops. Restore/reset restarts the sequence. The
runner rejects missing, reordered or extra indices/times and keeps the ordinary
live loop separate. No per-frame full snapshot or allocating packet capture is
added to this timed path.

The first lane uses one transferable buffer: no packet may be superseded, but
worker preparation and main submission are serialized. GPU execution can still
overlap later CPU work. This is an exact-work capacity probe, not the two-buffer
live architecture, real-time gameplay or a latency experiment. Warmup executes
the same bounded sequence, then can be idle until the configured warmup deadline.

Three automatic checks each deliver all 661 samples, the same 239 fixed advances
as the manual oracle, and zero supersession. The full-services full/no-shadow
cases reach identical complete final states with identical worker binaries.
Their single-run durations are 10.558/9.603 seconds, including approximately
0.30 ms completion-poll lag. These smoke runs have no paired uncertainty estimate
and do not establish a performance effect. GPU queries remain asynchronous.

The first comparison against the services-off manual oracle failed in AI learning
records. All remaining state matched. The owning live-learning service deliberately
finishes pre-restoration pending attempts before starting a fresh journal, so
those attempts cannot earn new credit. That service boundary explains the
difference; it is not a parity waiver between equivalent configurations. A separate
services-off automatic run matches the manual oracle's **entire final state**.
`fixed-work-validation.json` records these distinct comparisons; the initial
failed hash check and field-level differences remain retained.

Three unique manual owners contribute 1,983 full-state and 1,983 independent pose
checks at every logical sample. The verifier now also retains the final full state
and asserts it matches the last independently verified state. Normal-AA acceptance
for the automatic fixed-work lane, repeated timings, intermediate full-service
state comparison and a bounded two-buffer exact-work lane remain open.

The clock/count/report regressions pass within 18 focused tests / 129 assertions;
focused TypeScript checks pass. This follow-up changes benchmark instrumentation,
not engine simulation defaults or the production rendering architecture.

## Bounded two-buffer exact-work prototype

`fixed-render-fifo-20261009/roof` retains the private `fixed-replay-fifo-v1`
artifact, plan, raw trial, screenshot and validation receipt. It uses the same
worker binary as the one-buffer fixed replay and replaces only host packet
supersession with a bounded FIFO. Audio stays on its corresponding packet;
restore retires stale revisions. The live gameplay host remains unchanged.

One visible, focused rooftop smoke with services off consumed all 661 samples
(logical 0–4000 ms at 165 Hz), performed 239 fixed advances, lost no packets and
exactly matched the independent manual oracle's complete final state. The queue
reached depth two, drained completely and retained no audio. Measured wall time
was 6149.7 ms, with 0.5 ms completion-poll lag. This single correctness smoke
provides no paired performance estimate or gameplay latency claim. Warmup was
12 seconds with checkpoint restore; the viewport was 1366×768, DPR 1, RTX 4070,
AC power, normal AA and the paced-pipeline schedule. Owned browser cleanup passed.

Queue ownership, stale arrivals, full-queue restore retirement, audio bounds,
overflow and disposal have unit coverage. A subsequent browser diagnostic
(`queue-lifecycle-v2.json`) fills both buffers and separately checks suspend and
restore retirement. Each retires two packets; restore restarts at logical sample
zero and returns the exact checkpoint. Graceful close and immediate disposal each
clear one queued packet while another is borrowed. Releasing that borrowed packet
twice after shutdown is harmless, and immediate disposal rejects an outstanding
snapshot request. The initial failed test is retained: it incorrectly assumed
suspension preserves old-revision packets, so the following restore had none left
to retire. No implementation failure was concealed by changing an acceptance gate.

`fifo-full-smoke` repeats the 661-sample run with full gameplay services. It performs
the same 239 fixed advances and exactly matches the one-buffer full-service final
state, including learning state, with an identical worker binary. It drains all
packets/audio without supersession in 6001.8 ms (completion-poll lag 0.7 ms).
Neither single smoke estimates a paired gain. Repeated paired measurements and
broader image checks are next gates; all six arenas and stress acceptance remain
open. Six cleanup receipts across four distinct browser owners are clean, including
the failed lifecycle attempt. Current checks pass: 23 focused
tests / 157 assertions, focused TypeScript, source structure and process policy.
Shared server errors remain empty. No runtime optimization is promoted.

## Automatic replay images

`replay-image-validation.json` in the FIFO root records one-versus-two-buffer
automatic consumption with full services, 661 ordered warmup frames, checkpoint
restore and 661 measured-history frames. Both normal-AA runs and the separate
AA-off pair preserve every sample and match the full-service final-state reference.
At samples 0, 165 and 660, raw WebGL and post-process images are pixel-exact in
both pairs (all 12 comparisons have zero changed pixels). The normal-AA pair
therefore passes the unchanged production image tolerance without relying on the
AA-off result. The artifact, browser, dimensions and AA state are recorded; the
normal-AA final image was also visually inspected. Four capture owners and two
pixel-comparison owners have clean process/window receipts.

The capture wrapper calls the real automatic draw and reads canvases synchronously
only at selected samples. These timings must not enter throughput analysis. The
history check proves ordered draw count, not per-frame pixel equality: DOM HUD,
compositor and physical screen pixels are excluded. This is rooftop evidence only;
it does not rehabilitate earlier failed culling/query-cache candidates or explain
general same-packet MSAA variation. Depot and stress-image gates remain open.

## One versus two buffers with identical work

`fifo-buffers-abba-{plan,campaign-results,paired-results,validation}.json` in the
FIFO root retain eight fresh-browser trials ordered 1/2/2/1, then 2/1/1/2 buffers.
All use the same immutable artifact, worker, rooftop checkpoint, full services,
normal AA, 1366×768 DPR 1, 12-second warmup and checkpoint reset. No trace,
CPU profile or image readback ran during the measured window. Provenance and
asynchronous whole-render GPU queries were enabled equally.

The hypothesis was that allowing preparation/main submission to overlap would
raise capacity without reducing work. All 5,288 samples pass: each trial retains
661 ordered logical samples, 239 fixed advances and 422 zero-step preparations,
with no supersession or queued remainder. Full final states and every sampled
tick/step/pose-change sequence match exactly across all eight trials. Every owned
browser cleanup passes. This cohort changes buffer count, not the producer rate.

| Median of four trial statistics | One buffer | Two buffers |
| --- | ---: | ---: |
| Fixed-work samples/s | 64.20 | 103.13 |
| CPU submission interval p50 / p95, ms | 15.40 / 16.60 | 8.60 / 15.30 |
| CPU submission interval p99 / p99.9, ms | 22.75 / 24.35 | 16.30 / 17.90 |
| CPU submission >6.06 ms | 100% | 99.02% |
| Worker compute p50, ms | 6.85 | 7.20 |
| Presentation / compile p50, ms | 5.25 / 1.40 | 5.30 / 1.70 |
| GPU render p50 / p95, ms | 5.60 / 8.00 | 5.48 / 7.55 |
| Within-cohort interval-rate spread | 2.03% | 3.13% |

The four adjacent paired capacity ratios estimate +60.73%, exploratory Student
95% interval [+55.93%, +65.68%]. This exceeds observed control drift and supports
overlap in this exact-work architecture experiment. It is not a newly promoted
live-game improvement: the existing live worker already uses two buffers, and
FIFO scheduling differs from latest-packet replacement. Worker/main/GPU durations
overlap; adding them would misstate the critical path. Worker compute and GPU tails
still exceed the target budget even at this smaller viewport.

Both schedules repeat 72.27% of scene-wide submitted poses, with a longest repeat
run of 40; neither interpolates additional poses. These are CPU submission/content
observations, not physical display repeats or real-time input latency. Each trial
has only 660 intervals, so p99.9 is effectively its maximum. Four pairs within one
cohort do not establish independent thermal-session repeatability. Warmup finishes
bounded work then idles for the rest of its 12-second window, with different idle
durations by mode. GPU clocks/temperature are sampled at boundaries only; CPU
temperature and in-window clocks remain unavailable. Keep two buffers for the
next exact-work pass ablations, retaining live-latency and broader parity gates.

## Fixed-work shadow ablation

`fifo-shadow-abba-{hypothesis,plan,campaign-results,paired-results,validation}.json`
records eight full/no-shadow trials in ABBA/BAAB order under the preceding
two-buffer configuration. The worker binaries match; source comparison verifies
the only changed module is the renderer's single shadow-matrix assignment.
An initial source-count check expected both source and bundled entries to change;
the actual graph contains the direct renderer source only. The corrected check
compares that exact substitution and all other source contents.

The expected signature was lower GPU render/submission cost with unchanged fresh
preparation and simulation. All 5,288 frames meet it: each trial consumes the same
661 samples, 239 fixed advances and 422 zero-step preparations; full final states
and tick/step/pose-change sequences match across variants. There is no supersession
or queued remainder, and shadow draw counters are positive for full and zero for
no-shadow. All eight browser owners clean up successfully.

| Median of four trial statistics | Full | No shadows |
| --- | ---: | ---: |
| Fixed-work samples/s | 101.96 | 113.96 |
| CPU submission p50 / p95, ms | 8.40 / 15.55 | 7.80 / 15.40 |
| CPU submission p99 / p99.9, ms | 16.60 / 19.10 | 16.05 / 18.45 |
| CPU submission >6.06 ms | 99.47% | 99.55% |
| Worker compute p50 / p95, ms | 7.30 / 9.85 | 6.90 / 9.25 |
| Presentation / compile p50, ms | 5.35 / 1.80 | 5.00 / 1.70 |
| CPU draw p50 / p95, ms | 2.25 / 8.20 | 1.70 / 2.45 |
| GPU render p50 / p95, ms | 5.51 / 7.60 | 2.93 / 5.75 |
| Within-cohort interval-rate spread | 3.78% | 2.65% |

Paired fixed-work capacity improves 11.73%, exploratory 95% interval
[+8.66%, +14.89%]. Unlike the earlier drifting live-work block, this effect exceeds
within-cohort control variation while retaining identical work. The roughly 47%
median GPU reduction and much smaller capacity increase support a remaining
preparation/scheduling limit. The unchanged worker's shorter durations are an
end-to-end contention/scheduling observation, not a preparation-code optimization.
CPU and GPU spans overlap and must not be summed.

Decision: shadows are a material GPU and submission cost worth investigating for
quality-preserving changes. Their removal is deliberately image-non-equivalent and
cannot be promoted; no production parity pass is claimed for this variant. Even
this simplified rendering reaches only 114 samples/s and repeats the same 72.27%
of scene-wide poses. Independent thermal sessions, other pass ablations, live
latency, physical presentation and six-arena/stress acceptance remain open. No
trace/profile or synchronous GPU readback ran during throughput; GPU telemetry
remains boundary-only, and CPU temperature/in-window clocks are unavailable.

## Fixed-work post-processing ablation

`fifo-post-abba-{hypothesis,plan,campaign-results,paired-results,compact,fixed-work}.json`
records eight full/no-post trials with the same fixed-work two-buffer configuration.
Only the controller changes: omit gameplay Canvas2D post processing and hide its
canvas. WebGL, shadows, impact overlay, fighter HUD, producer and services remain.
The hypothesis was that removing the WebGL-to-Canvas2D dependency might reduce
whole-loop time; WebGL GPU queries do not include Canvas2D or compositor work.

The new reusable `rendering/verify-fixed-work.ts` checks every trial against the
full-service reference. All 5,288 samples match final state and the entire sampled
tick/step/pose-change sequence, with identical worker binaries, 239 fixed advances,
422 zero-step preparations, no supersession and drained queues. It also revalidates
the preceding shadow cohort. Unit tests reject service/state/work/content drift,
missing/reordered packets, supersession and retained queue ownership.

| Median of four trial statistics | Full | No post |
| --- | ---: | ---: |
| Fixed-work samples/s | 105.49 | 107.66 |
| CPU submission p50 / p95, ms | 8.25 / 15.10 | 8.00 / 15.45 |
| CPU submission p99 / p99.9, ms | 16.40 / 21.15 | 16.25 / 19.95 |
| CPU submission >6.06 ms | 98.94% | 99.62% |
| Post CPU marker p50 / p95, ms | 0.20 / 0.30 | 0 / 0 |
| Worker compute p50, ms | 7.00 | 7.10 |
| WebGL GPU p50 / p95, ms | 5.33 / 7.51 | 5.91 / 8.30 |
| Within-cohort interval-rate spread | 10.05% | 2.42% |

Paired capacity +2.27%, exploratory 95% interval [−3.92%, +8.86%], is inconclusive.
The four pair effects range from −1.35% to +8.01% as controls slow. The reduced
post CPU marker proves omitted work but does not establish an end-to-end gain or
explain the GPU range increase; submission/queue overlap can change query spans.
No claim about isolated Canvas2D GPU time follows from the WebGL timer.

Decision: retain production post processing. This workload does not support its
removal as the next throughput fix, and the variant changes images. Control drift
remains unresolved; the preceding stable cohorts do not establish sustained
environment stability. CPU temperature, in-window clocks, allocation/GC attribution
for this block and independent thermal-session repetition remain open. All eight
browser owners clean up and shared server errors remain empty.

## What the post-control drift does and does not show

`fifo-post-abba-{control-drift,drift-findings}.json` re-examines the four unchanged
full controls. Capacity falls 110.92 → 106.35 → 104.64 → 100.29 samples/s while
worker compute p50 rises 6.7 → 6.9 → 7.1 → 7.4 ms. Compile p50 rises from 1.3
to 1.8 ms; GPU p50 rises modestly from 5.23 to 5.47 ms. Fixed work and final
states remain equal, so different preparation counts cannot explain this drift.

GPU boundary temperatures rise from 67 to 70 °C, but every sampled clock is
210 MHz at 0% utilization. These idle samples cannot prove thermal throttling or
describe the active GPU clocks. CPU temperature remains unavailable. CDP thread
and process time counters also increase across controls, but the counter window
extends 923–1088 ms beyond the retained frame interval because it brackets
snapshot/result export. Reports now expose that scope instead of implying exact
replay CPU consumption. Heap changes cannot establish allocations or retained
growth without the appropriate collection/allocation evidence.

The cause is still unresolved: this block has no worker GC/JIT trace, per-thread
scheduling trace or external-process attribution. A separately labelled diagnostic
control cohort is the next discriminating measurement; its profiler overhead must
not be mixed with throughput results. This evidence does not justify changing
power policy, claiming throttling, or promoting the small post-processing effect.

## Drift diagnostic traces and observer cost

`fifo-drift-profile` retains three identical full-service fixed-work controls with
CPU sampling and browser tracing. All 1,983 samples match the independent
matched-service reference's final state and work/content-transition sequence.
Traces cover renderer main, worker, compositor/Viz and GPU-process threads and
align to explicit replay boundary marks. Their sizes are 135,048,867, 134,416,608
and 135,106,403 bytes: complete under an explicit 256 MiB bound; the old 128 MiB
bound would truncate these. The ordinary default stays 128 MiB.

The three marked windows are 6596.50, 6604.55 and 6569.30 ms. Worker GC wall-span
unions occupy 276.53, 259.65 and 264.41 ms (3.93–4.19%). Main GC unions are
77.70–88.71 ms. Minor-GC reported heap reductions total 2297–2375 MiB on the
worker. These are reclamation totals and allocation-pressure proxies, not complete
allocation rates or retained-memory measurements.

CPU samples attribute 483–517 ms of worker self time and 518–547 ms of main self
time to `performance.mark`. Those functions emit full provenance/row detail in
this trace mode; the capture-free throughput runs do not enable them. Do not add
times across threads or interpret these samples as uninstrumented engine cost.

`fifo-boundary-profile` disables only per-frame trace marks while retaining rows,
clock correlation, boundary marks, CPU sampling and the same browser categories.
Its 661 samples also pass the reference gate. The complete 131,866,143-byte trace
has a 6415.51 ms marked window, no `mark` entry among retained top self-time rows,
and 258.22 ms worker GC (4.02%); minor-GC heap reductions total 2337.60 MiB.
This single follow-up is not a paired performance comparison. It shows allocation
pressure persists without detailed frame marks, but other provenance/diagnostic
overhead remains enabled and must be measured separately.

Observed worker `V8.DeoptimizeCode` spans total only 0.378–0.406 ms per detailed
trace and 0.383 ms in the boundary-only trace. Their short duration does not prove
all JIT work was observed. These diagnostic controls are nearly stable and do not
reproduce or explain the earlier 10% drift. `fifo-profile-findings.json` preserves
the compact interpretation. Next: allocation-stack sampling and provenance on/off
attribution before assigning transient allocation costs to gameplay. All four
owned browsers clean up; no performance or visual default is changed.

## Allocation-stack diagnostic

`fifo-allocation` adds one full-service replay with heap sampling (128 KiB interval,
64-frame stacks, collected minor/major-GC objects included). It uses no CPU sampling
or trace marks. Sampling begins while the worker is suspended and stops before
snapshot/result export. Start/stop round trips are 3.0/88.5 ms; the latter includes
retrieval and writing and is not a precise per-thread stop timestamp. All 661
samples match the reference's final state and tick/step/pose-change sequence, with
no lost packets and clean browser teardown. This is allocation attribution, not
a throughput or leak measurement; provenance and stage diagnostics remain enabled.

The saved profiles estimate 3254.50 MiB allocated on the worker (25,968 samples)
and 330.09 MiB on main (2,636 samples). `fifo-allocation-allocation-analysis.json`
aggregates self sizes by exact source location, preserving distinct same-name
functions and caller stacks. The decoded worker literal is SHA-256 checked against
the artifact manifest before source mapping; sampled line/column positions match
the decoded source, avoiding collisions with minified names in the main bundle.

| Worker allocation site | Estimated self MiB |
| --- | ---: |
| Material-look cloning, `frame/3d.ts` | 448.96 |
| Entity/transform cloning, `frame/3d.ts` | 346.95 |
| Rigid-body snapshot object creation, `physics/rigid-3d-operations.ts` | 322.01 |
| Guard-fracture presentation, `project/3d/combat-visuals/guard-fractures.ts` | 217.52 |

On main, the transparent-sort comparator accounts for 89.75 MiB, typed-array
`subarray` views for 74.27 MiB, and `bindMaterial` for 49.01 MiB. These locations
make repeated presentation construction and render sorting concrete next targets;
they do not by themselves prove a valid cache rule or a full-loop improvement.
Repeated sampling, allocation-counter observer bounds and longer memory retention
checks remain required. No runtime change is promoted.

The `fifo-allocation-no-provenance` follow-up disables provenance while retaining
the identical worker, full services and stage diagnostics. All 661 samples match
the reference's ordered ticks/steps and complete final state; queues drain without
supersession. Pose transitions are explicitly unobserved, not a passing parity
result. Start/stop round trips are 3.0/89.7 ms and owned browser cleanup is clean.
Estimated allocations remain large: worker 3527.60 MiB (28,151 samples), main
343.18 MiB (2,741 samples). The same exact worker locations attribute 433.48 MiB
to material cloning, 404.60 MiB to entity/transform cloning, 315.25 MiB to body
snapshots and 225.14 MiB to guard-fracture presentation. Main sorting, views and
material binding remain prominent. This supports investigating those sites beyond
provenance overhead; one sample per configuration cannot quantify the overhead,
explain the increase, establish uncertainty or prove a throughput improvement.

## Guard ID hoisting candidate

`guard-hoist` moves the shield and influence-trail ID construction outside each
`entities.find` predicate. It retains first-match/missing-entity semantics and
adds no cache or invalidation state. An unpatched rebuild matches the frozen
control's worker and runtime hashes. The candidate's complete source graph differs
only by the two declared hoists; production source remains unchanged.

The 166-sample rooftop manual replay passes full-state, numeric-packet and complete
presentation-sequence checks, including 332 pose-oracle checks across both modes.
Normal-AA images pass the existing tolerance at checkpoints 0, 60 and 165: two are
pixel-exact; the last differs at seven pixels by at most one channel level. This
short check does not replace the longer controlled-history, depot or stress gates.

One provenance-off allocation replay completes 661 samples with exact ordered
simulation work and final state against the matching control. Estimated worker
allocation is 3002.85 MiB versus 3527.60 MiB; main is 336.25 versus 343.18 MiB.
The guard-fracture function's sampled self allocation is 3.25 MiB versus 225.14 MiB.
Both function locations are checked against decoded worker literals matching the
artifact hashes. Other sites vary, so the total difference is not wholly attributed
to this change. There is no paired uncertainty estimate or throughput result yet.
Raw `guard-hoist-parity*`, `guard-hoist-allocation*`, source-location and site-comparison
receipts are retained in the fixed-render FIFO evidence root.

The subsequent `guard-hoist-abba` cohort runs eight unprofiled fresh-browser trials
in ABBA/BAAB order, retaining diagnostic rows and provenance, full services and
normal AA. All 5,288 samples pass exact final-state, ordered tick/step and observed
pose-transition comparisons. All 16 cleanup receipts are clean. Two configuration
failures occurred before browser launch and are retained separately.

| Median trial metric | Control | ID hoisting |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 104.85 | 108.19 |
| CPU submission interval p50 / p95, ms | 8.10 / 15.30 | 8.10 / 15.15 |
| CPU submission interval p99 / p99.9, ms | 16.40 / 22.45 | 16.00 / 19.90 |
| Intervals missing 6.06 ms, % | 99.55 | 99.09 |
| Worker compute / presentation p50, ms | 7.10 / 5.30 | 6.75 / 5.15 |
| WebGL GPU range p50 / p95, ms | 5.49 / 7.59 | 5.31 / 7.55 |

The paired capacity effect is +3.57%, with an exploratory four-pair t interval
of [-4.56%, +12.40%]. Control rate spread is 9.72%, candidate spread 3.71%.
Decision: **inconclusive throughput; no promotion**. This is fixed-work capacity,
not real-time motion, physical presentation or input latency. The cohort does not
replace independent sessions, repeated allocation or longer image gates.

Control capacities run 108.55, 102.21, 98.36, 107.48 samples/s. The slowest control's
worker-compute median is 7.5 ms versus 6.8 ms initially; its GPU median is 5.65 ms
versus 5.27 ms. Boundary GPU temperature rises from 68 to 70 C, but readings show
idle 210 MHz/0% utilization; CPU temperature remains unavailable. The next control
recovers substantially at the same boundary temperature. These observations do
not establish thermal causality. No GC trace was captured during these timings.
CDP/OS windows include 0.91–1.47 seconds outside the replay, preventing precise
replay CPU attribution. Raw paired results and offline drift analysis are saved
under the cohort prefix; the control-drift explanation remains open.

## GPU readings inside the replay

`fifo-active-gpu` adds three identical full-control diagnostics with one prestarted
hidden NVIDIA sampler, requesting 500 ms intervals. Query and receipt timestamps
are retained separately; both must lie inside the measured replay. All 1,983
samples match full state, ticks/steps and observed pose transitions. Sampler and
browser cleanup pass; no settings changed. The timings remain diagnostic because
polling overhead is uncalibrated and the throughput reporter rejects this mode.

| In-window metric | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Replay time, seconds | 6.033 | 6.342 | 6.389 |
| Retained GPU samples | 11 | 12 | 12 |
| Graphics clock p50, MHz | 1020 | 1095 | 1125 |
| GPU utilization p50, % | 31 | 30 | 28 |
| Temperature p50, C | 69 | 70 | 71 |
| Worker compute p50, ms | 6.8 | 7.2 | 7.0 |
| WebGL GPU range p50, ms | 5.25 | 5.32 | 5.63 |

Actual sample gaps average 534–540 ms, with receipt lag p50 26–30 ms and maximum
59 ms. Each run samples P8, P0 and intermediate states. Every retained clock-event
mask is `0x1`, which NVIDIA defines as
[GPU idle](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlClocksEventReasons.html).
That is an instantaneous device-wide reading, not proof the GPU is idle for an
entire frame or utilization window. No thermal/power-cap bit appears in these
sparse samples; transient limits between samples remain unobserved. GPU temperature
and performance correlate across three runs, but clocks do not show a simple
monotonic slowdown and CPU thermals remain unavailable. Thermal causality and
the earlier control drift are still unexplained. Next evidence needs observer
calibration and CPU scheduling/frequency data during the same window, rather
than another conclusion drawn from idle boundary readings.

The [CPU/GPU follow-up](october-10-in-window-system-counters.md) records concurrent
process activity and processor performance during three replays; causality remains
unresolved and the combined observer is uncalibrated.

## Reproduction

The [runner README](../../../../../../../spikes/persistent-world-worker/README.md)
owns command switches. Use the frozen source/HTML in
`provenance-20261009-v2/roof-compact-714`, generate recipes with
`rendering/prepare.ts`, and build named artifacts with renderer rebuilding enabled.
`artifact-equivalence-v2.json` verifies the worker identity and corrected observer
source. `verify.ts` uses checkpoints `0,60,165`, provenance and full presentation
comparison; `PERF_CAPTURE_CONTROL=full-parity` reuses the correctness reference.
Saved timing plans record the complete ordered configuration. Analyze samples
with `campaign-results.ts`; missing or invalid GPU ranges are never filled by zero.

Verification: 18 focused tests / 129 assertions, focused TypeScript checks, source
structure and process policy pass. Shared server runtime errors are empty. All
51 fresh-render cleanup receipts and nine fixed-render receipts, including failed
attempts, are clean across 38 distinct owners. The evidence roots retain check logs,
cleanup verification and file hashes. The broad code-style gate still fails on existing dirty-tree assertion
debt and an unrelated physics-test numeric literal; no baseline was changed.
