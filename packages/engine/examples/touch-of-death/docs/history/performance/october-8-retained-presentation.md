# Touch of Death: path to 165 FPS ? October 8, 2026

The target is **165 fresh presentations/second: 6.06 ms per refresh**. Aim for
roughly 5 ms each of CPU critical-path work and GPU work, separately. The current
measurements use 1366 ? 768 DPR 1, not the 2560 ? 1600 / 165 Hz display's native
resolution. Neither worker nor WASM default promotion is established.

## Retained presentation batch

The engine now exposes a detached selected-entity presentation read. The opt-in
world adapter reads two fighters instead of making a 3,420-entity save snapshot
on every rendered frame. It skips behavior-state cloning, all-body enumeration
and physics contact capture. Full save, review and rollback paths stay independent;
render-only reads reject restore. Current play/combat capture is still included.
The [engine contract](../../../../../docs/developer-performance.md) owns this API.

Separate focused diagnostic trials measured snapshot work at **0.863 ? 0.403 ms**,
about 0.46 ms saved per presentation. This does not reach the 0.2 ms target yet.
These stage timings explain work saved; they are not a reliable full-game gain.

The packed material-cache variant changed scene application from 2.071 to
2.049 ms, which does not establish a useful improvement. It was removed from
normal source and retained in the experiment artifacts. Existing engine bindings
already skip unchanged writes, while comparing live scene data to notice direct
writes, restore and released resources. Skipping those checks blindly would make
rendered state stale. Applying only changed records needs an explicit producer
change contract and invalidation rules, not another cache that guesses ownership.

The normal host's GPU preference also remains unchanged. A high-performance
context request was present on both timed sides, while Chrome's owned process
was separately forced to the RTX adapter. That does not isolate the benefit of
the context hint itself, so it was retained only in the experimental builds.

Evidence: .local/engine-perf/worker-retained-20261008/. The
[runner](../../../../../../../spikes/persistent-world-worker/README.md) owns reproduction
commands. control-final/projection-final retain the final implementation and
paired source graph; projection-v2/combined-v2 retain the isolated timed variants.
Source patches preserve unrelated work in the dirty tree. The worker remains
opt-in and FPS remains visible.

## Full-game results and reference instability

Reference: i9-13900HX, RTX 4070 Laptop through ANGLE/D3D11, Chrome
154.0.8037.58, AC power, battery saver off, High performance plan. Two transfer
buffers, fresh-input handshake, full services, VSync off, six seconds warmup and
eighteen seconds measurement of the same saved city AI match. User workloads
remained active. Timings ran serially without concurrent audit builds or tests.
Native foreground ownership passed for every visible timing trial.

The headless twelve-trial matrix ran control/projection/combined, then reverse,
reverse and forward. The unchanged control ranged from **38.15 to 83.80 FPS**;
the combined candidate also ranged from 42.87 to 86.28 in adjacent trials.
The headless medians are diagnostic only: its reference fails the predeclared
5% spread limit. This is not evidence of a causal headless penalty or code regression.

Focused A/B/B/A, two trials per path, produced these medians of trial metrics:

| Path | Fresh FPS | Interval p95 | Interval p99 | Input age p95 |
| --- | ---: | ---: | ---: | ---: |
| Control | 72.93 | 23.85 ms | 27.90 ms | 28.45 ms |
| Projection + packed cache | 82.81 | 20.10 ms | 24.95 ms | 26.70 ms |

The apparent FPS gain is 13.6%, but control trials measured **76.93 and 68.93**:
an 11% spread, also failing the reference gate. Candidate trials were 81.99 and
83.64. Do not promote from this small, drifting sample or attribute its result
to the retained projection alone. No cohort achieved sustained 165 FPS; zero
percent of fighting intervals met 6.06 ms at the median trial level.

The reporter now flags insufficient controls, over-5% reference spread, changed
control hashes and changed power plans, without silently dropping slow trials.
Receipts record actual WebGL context/adapter, Chrome backend information and
Windows CPU counters; later trials also retain owned process priority, affinity
and CPU-time readings. These boundary probes do not establish continuous clocks,
thread placement, CPU thermals or the cause of the variation. The priority probe
identified active visible renderers as Normal and GPU processes as AboveNormal;
this alone does not explain the headless fast/slow split.

## Where the remaining time goes

Separate instrumented foreground trials; means over fighting frames:

| Stage | Control | Selected read | Read + packed cache |
| --- | ---: | ---: | ---: |
| Worker total | 10.93 ms | 10.58 ms | 10.47 ms |
| Game presenter | 4.41 ms | 4.57 ms | 4.47 ms |
| Snapshot/read | 0.86 ms | 0.40 ms | 0.41 ms |
| Directed fighter presentation | 1.04 ms | 1.02 ms | 1.02 ms |
| Scene application | 2.07 ms | 2.09 ms | 2.05 ms |
| Main-thread work | 6.39 ms | 6.45 ms | 6.65 ms |
| Completion to host acquisition | 5.28 ms | 5.62 ms | 6.10 ms |
| Renderer GPU query | 6.11 ms | 6.24 ms | 6.41 ms |

GPU queries exclude the separate post-process context and compositor. These
columns are not additive CPU/GPU budgets: producer, consumer and GPU overlap.
Packet decode is only about 0.04 ms. Shared memory cannot remove the measured
5?6 ms acquisition wait simply by making that decode cheaper.

## Next experiments, in order

1. **Stabilize the reference.** Repeat A/A in one owned focused browser session
   before A/B, testing browser/process reuse against fresh-process trials. Keep
   adapter, viewport, workload and power checks; retain CPU/process diagnostics.
   If drift persists, use a separate bounded scheduling/clock trace to identify
   the cause. Do not change user workloads, process affinity or power settings
   silently. Require stable controls in a second session before default promotion.
2. **Measure and remove acquisition waiting.** Split worker completion ? message
   arrival ? host acquisition ? submit timestamps. The current non-VSync host
   polls using a zero-delay timer, and fresh input adds a round trip. Compare a
   frame-ready wakeup with late input sampling and bounded two/three-buffer
   ownership. Preserve pause, focus, restore ordering, audio and fresh-FPS counting.
   Target acquisition waiting below 1 ms with no input-age regression.
3. **Reduce presenter and scene application work.** Attribute the 4.5 ms game
   presenter and 2 ms application separately. Keep the existing 353-record fighter
   selection. Prototype engine-owned change records with explicit restore/direct-
   write invalidation, then reduce unnecessary combat capture for presentation.
   Initial targets: application ?0.5 ms, presentation read ?0.2 ms; judge the whole
   loop, tails, memory and parity. Do not bypass engine ownership abstractions.
4. **Budget the complete GPU and host paths.** GPU draw alone exceeds 6 ms at the
   smaller viewport; main-thread work also exceeds the ~5 ms target. Attribute
   postprocessing, shadows and remaining host UI/input work. Compare native
   resolution separately, with explicit quality tradeoffs and rendered evidence.
5. **Retest numeric/threading choices on the stable pipeline.** Compare optimized
   JS, resident JS and WASM with all packing and crossings included. Use bounded
   worker jobs only for independent measured batches, including synchronization
   costs. Shared buffers require ownership epochs, atomic publication and fallback;
   extra cores or buffers must improve the critical path and input age.
6. **Close promotion gates.** Repeat stable full-game A/B and a ten-minute native-
   resolution soak through matches, resets, saves, focus and recovery. Target CPU
   and GPU p95 near 5 ms and p99 below 6.06 ms, and compare presented intervals to
   measured display cadence. Worker feature ownership, images and package limits
   remain separate requirements; physical input-to-photon latency is not measured.

## Verification and open gates

- 41 focused tests pass, including detached selected reads, no full capture on
  that path, restore rejection, material/direct-write and reference-drift cases.
  Engine, engine-test, editor and spike typechecks, package build, installed-
  consumer smoke, process policy and source-structure checks pass.
- Final projection/control parity passes 721 samples per realm through knockout,
  recovery and the next round: full state, packet and compact metadata are exact.
  The combined candidate additionally passes 38 full-service save/reset/review
  and durable-learning checks. No runtime/worker errors or fighting simulation
  drops occurred in the sixteen timings or three diagnostic runs.
- The default-renderer image gate remains open: final frame 0 differs in 19 pixels
  with a maximum 5/255 channel delta, beyond the existing 3/255 threshold. Frames
  240, 480 and 720 are pixel-identical. The tolerance was not widened.
- The size gate remains open. Before this batch the runtime was already 300 raw
  bytes above its fixed ceiling. The retained API adds 439 raw / 146 gzip bytes
  and reduces Brotli by 4 bytes against that control; final runtime overages are
  739 raw / 230 gzip / 231 Brotli bytes. Tooling graphs also have small
  overages. No budgets were raised. Native and rebundled graphs are in the receipt.
- Fifty browser cleanup receipts are empty. The shared managed game server has
  no unresolved errors and remains running. No worker or WASM default was promoted.

The [powered WASM retest](october-8-powered-reference.md)
retains the earlier four-way results and correction for mixed GPUs. Its promising
WASM gains remain unproven under a stable reference. Earlier worker integration
and image limits are in the [October 7 report](october-7-worker-recovery-resident-wasm.md).

<a id="october-7-app-owned-worker-host-and-mode-boundaries"></a>
[App-owned worker host and mode boundaries](october-7-app-owned-worker-host-and-mode-boundaries.md)

<a id="october-7-typed-authority-stream-watchdog-and-persistent-fps"></a>
[Typed authority, watchdog and persistent FPS](october-7-typed-authority-stream-watchdog-and-persistent-fps.md)
