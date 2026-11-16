# Touch of Death: path to 165 FPS - October 8, 2026

The target remains **165 fresh game frames/second, 6.06 ms per refresh**.
The counter measures CPU render submissions, not physical display scanout.
**Neither the previous retained-read experiment nor the new latency candidate
should become the normal game's default yet.** Worker and WASM remain opt-in.

## Latest decision

The final latency candidate improves responsiveness and interval tails, but loses
8.9% of combat FPS in the focused browser. It remains an explicit experiment.
The engine's applied-input timestamp and the host's delivery/wait telemetry are
kept. FPS remains visible. Full saves and rollback still use complete snapshots;
the engine remains independent of browser scheduling and UI routing.

| Focused browser, median of two trials | Timer control | Final latency candidate |
| --- | ---: | ---: |
| Fresh combat FPS | 90.81 | 82.76 |
| Frame interval p95 | 16.30 ms | 15.90 ms |
| Frame interval p99 | 22.75 ms | 18.85 ms |
| Applied-input age at draw start, p95 | 33.15 ms | 23.85 ms |
| Keyboard event to draw start, p50 | 29.10 ms | 23.30 ms |
| Keyboard event to draw start, p95 | 40.30 ms | 32.45 ms |
| Message arrival to packet acquisition, p50 | 4.90 ms | 1.30 ms |
| Main-thread activity | 60.29% | 58.42% |
| Input polls/second | 108.12 | 114.01 |

Reference: i9-13900HX, RTX 4070 Laptop through ANGLE/D3D11, Chrome
154.0.8037.58, AC power, battery saver off, High performance plan, 1366 x 768
DPR 1 viewport and drawing buffer. Full services, two transfer buffers, fresh-input
handshake, VSync off, six seconds warmup and eighteen seconds measurement of the
same saved city AI match. Trials ran serially with no audit builds/tests during
timing. Existing user workloads were left active. Native foreground ownership
passed throughout the accepted visible trials.

The final visible A/B/B/A control spread was 2.09%, within the predeclared 5%
limit. Each trial's separate keyboard probe restored the workload, waited for
combat, and issued twelve real browser KeyD presses. Its sequence must reach a
physics step before a frame qualifies. Table quantiles are medians of per-trial
quantiles; the small keyboard sample is diagnostic, not a physical-latency tail
guarantee. The endpoint precedes drawing, GPU completion and display scanout.
No fighting intervals met 6.06 ms in either final visible group.

## What the spikes established

- **Previous retained read:** eight focused trials gave 86.53 versus 89.52 FPS,
  an apparent 3.45% gain. Controls spread 5.04%, narrowly failing the stability
  limit. This does not establish default promotion. The selected-entity read
  stays in the optional worker; the normal standalone loop is unchanged.
- **Immediate frame wakeup:** 90.97 to 62.71 FPS in its repeated comparison.
  Applied-input age fell, but keyboard-event tails barely changed. Simply drawing
  immediately can delay the next input handshake and reduce overlap.
- **Late input plus immediate wakeup:** about 55.68 FPS. Its 18.30 ms applied-input
  p95 concealed the broader event-to-draw p95 of 38.20 ms. Input sampling age alone
  is an inadequate responsiveness metric.
- **Input before draw:** sending the next sample before drawing recovered most
  throughput, but a two-buffer candidate still gave 85.36 versus 88.88 FPS and
  used about 96% of the main thread. Three buffers showed no clear advantage and
  increased retained packet storage from 1.39 to 2.09 MiB. This is packet storage,
  not total world or GPU memory.
- **Idle polling:** the next controlled spike counted about 488 polls/second.
  Pacing fallback polls reduced this to 184 and main-thread activity from 95% to
  65%. The final candidate also avoids a timer hop for an already-due worker job
  and reuses an input poll within the same synchronous draw. Deferred VSync
  callbacks still poll again. These fixes remove measured waste without making
  the complete candidate a throughput win.

Different rows above belong to separate frozen cohorts; compare each candidate
with its own control. The final candidate's sampled main JS heap was 43.24 MiB
versus 31.73 MiB for its control. A single heap reading does not establish retained
memory or a leak; a long-session memory gate remains open.

## Headless is not the performance reference

Reusing one owned Chrome process narrowed visible reference drift, but did not
stabilize headless. In the final headless A/B/B/A, identical controls fell from
77.60 to 38.53 FPS: 67.29% spread. Worker compute also rose from 9.3 to 17.3 ms on
the unchanged control. Those controls dropped 898 ms of simulation time during
fighting; the 34 visible timing trials dropped none. No physics-capacity overflows
were recorded. The headless candidate median was 43.01 FPS, but this cohort
cannot establish a causal code regression or a headless penalty.

Use headless for functional checks. Use focused, repeated visible trials for
promotion and the 165 FPS target. CPU effective clocks/thread placement and
browser scheduling remain possible explanations for the headless variability;
boundary power/priority samples do not establish its cause.

## Next experiments toward 165 FPS

1. **Separate physical-input sampling from UI routing.** The final acquisition
   wait is down to 1.3 ms, including input polling. A fresh sample currently runs
   pause/menu/remapping/UI work on the worker's critical path. Cache validated
   routing state and measure a cheap physical sample (initial target below
   0.2 ms), preserving taps, remapping, pause, review and restore ordering. Require
   the latency improvement without the current FPS regression. Keep two buffers
   unless an isolated comparison establishes a third-buffer benefit.
2. **Cut presentation and scene application at their engine owners.** The final
   timer control's worker median is 8.8 ms: presentation accounts for about
   5.8 ms, and application/compilation/packet writing about 1.85 ms. These already
   exceed the 6.06 ms deadline independently of GPU work. Attribute the presenter,
   introduce explicit changed-record/invalidation contracts where justified,
   and reduce unnecessary combat capture. Initial targets: presentation below
   2.5 ms, scene application below 0.5 ms, whole worker p95 near 5 ms. Preserve
   restore/direct-write correctness, scene bindings, camera/shadow visibility and
   full snapshots. The earlier detailed attribution is linked below.
3. **Measure the complete GPU and host path at native resolution.** Main frame
   work is still about 5.6 ms in the control. Earlier GPU draw queries were around
   6 ms and excluded postprocessing/compositing; they were not rerun in these
   uninstrumented timings. Compare GPU passes, shadows, submission and UI work
   separately, with rendered evidence for any quality tradeoff. CPU and GPU work
   overlap; do not add their budgets as serial stages.
4. **Revisit WASM/parallel batches after those cuts.** Packet decode is at or
   below 0.1 ms at p95 here. Shared memory or another WASM boundary cannot erase
   the presenter, input routing or host waits. Require identical workload/state,
   conversion and lifecycle costs, stable full-loop A/B, interval tails, input
   ages and memory evidence before calling WASM a general performance gain.
5. **Close production gates.** The simulation still runs fixed 60 Hz; increasing
   render FPS does not remove its input quantization. Any simulation-rate change
   needs separate combat/determinism evidence. Before normal-worker promotion,
   complete missing feature ownership, a native-resolution soak, stable repeated
   controls, renderer repeatability and package-size gates. Aim for CPU/GPU p95
   near 5 ms with p99 below 6.06 ms, then verify actual display presentation.

## Verification and remaining limits

- 42 focused tests pass. Engine, engine-test, editor-test and experiment
  typechecks pass, as do package build, installed-consumer smoke, process policy
  and source-structure checks. The final candidate passes 40 command checks,
  the playable readiness journey with VSync off, and three graphics-recovery
  cycles with VSync on. Earlier variants also passed VSync-off graphics recovery.
- Control/selected-read parity passes 721 samples per realm through KO, recovery
  and the next round. Final-build A/A repeats pass the same full-state,
  full-packet and compact-presentation comparisons. Each pair also performs
  1,442 checks against the normal standalone simulation.
- The unchanged final build fails the existing image gate: frame 0 differs in
  19 pixels by at most 5/255, and frame 480 in 12 pixels by at most 4/255. Repeating
  the same inline packet in the same context reproduces both locations and
  maxima. Both realms used the verified RTX adapter. This isolates a render
  repeatability problem rather than proving a selected-read regression; its
  precise cause remains open. The 100-pixel / 3-channel-unit limits were not
  widened. Worker repeat captures pass that gate.
- Package size remains over its existing limits. The mailbox entry itself is
  within budget (1,161 raw / 559 gzip / 493 Brotli bytes). The main runtime is
  still 739 raw / 230 gzip / 231 Brotli bytes over; aggregate runtime distribution
  is 787 / 240 / 240 bytes over. Small tooling overages also remain. No caps were
  raised. The prior batch records the pre-existing overage and retained-read delta.
- The 38 accepted timing trials recorded no runtime/worker errors. All owned
  browser cleanup receipts were empty. The shared managed game server has no
  unresolved errors and remains running. This batch did not change arena,
  collision or animation behavior or establish normal-worker feature completeness.

Evidence: .local/engine-perf/worker-latency-20261008/. The
[experiment README](../../../../../../../spikes/persistent-world-worker/README.md)
owns options and reproduction. Frozen builds, source/runner receipts, plans,
raw timings, keyboard samples, images and cleanup records are retained there;
results.json contains the six complete cohorts. Failed startup-harness runs and
countdown-only keyboard probes are retained separately and excluded from the
accepted results. Full snapshots remain independent of render-only reads.

Previous decisions: [retained presentation and stage attribution](october-8-retained-presentation.md),
[powered WASM retest](october-8-powered-reference.md),
and [October 7 worker recovery](october-7-worker-recovery-resident-wasm.md).

<a id="october-7-app-owned-worker-host-and-mode-boundaries"></a>
[App-owned worker host and mode boundaries](october-7-app-owned-worker-host-and-mode-boundaries.md)

<a id="october-7-typed-authority-stream-watchdog-and-persistent-fps"></a>
[Typed authority, watchdog and persistent FPS](october-7-typed-authority-stream-watchdog-and-persistent-fps.md)
