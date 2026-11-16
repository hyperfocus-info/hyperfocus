# October 8, 2026: powered reference and WASM retest (historical)

The target is **165 fresh presentations/second: 6.06 ms per refresh**, at the
user's intended resolution and visual settings. Aim for about 5 ms of CPU
critical-path work and 5 ms of GPU work, separately, leaving spike headroom.
These are engineering targets, not a promise based on the laptop's specifications.

**Resident WASM now has promising full-game gains, but a reliable default win
is not established.** The powered retest measured +6.2% headlessly and +5.4%
in focused Chrome. The visible sample is small, and a later unchanged headless
control became much faster. Stabilizing the reference conditions comes first.
The opt-in worker and this numeric experiment remain separate promotion decisions.

## Powered retest and a correction

Evidence: .local/engine-perf/worker-power-20261008/. Four October 7 HTML builds
were copied byte-for-byte, with hashes checked against their original artifacts.
The [runner](../../../../../../../spikes/persistent-world-worker/README.md) owns commands,
power/GPU guards and cleanup. Reproduction inputs are rtx-run.ps1,
visible-run.ps1 and the diagnostic run files in that evidence directory.

The previous report incorrectly described all sixteen trials as RTX results.
Its original receipts show **RTX 4070 in trials 1-8 and Intel UHD in trials 9-16**.
The corrected previous-results-by-gpu.json separates eight groups, two trials
per implementation/GPU. The [archived report](october-7-worker-recovery-resident-wasm.md)
records the correction. The GPU switch is verified; the prior renderer hang's
cause and the power mode's contribution remain unknown.

The first two new trials also selected Intel UHD; control measured 29.14 FPS.
That campaign was intentionally stopped before completing its matrix. Its raw
samples and owned-process cleanup remain separate from the RTX comparison.
The runner now requests Chrome's high-performance GPU for the owned process,
asserts the actual WebGL adapter before sampling, and groups reports by renderer.
It changes no Windows or user-browser preferences. The game host currently leaves
its existing engine contextAttributes.powerPreference option unset; the final
probe confirms default. Adapter selection is therefore also a product experiment.

Reference: i9-13900HX, 32 logical CPUs, RTX 4070 Laptop through ANGLE/D3D11,
Chrome 154.0.8037.58, 1366 x 768 DPR 1. AC power, battery saver off and the Windows
High performance plan were verified before startup and after each trial. GPU
clock/temperature/utilization samples are boundary observations, not continuous
throttle evidence. CPU effective clocks, thermals and OEM policy are unrecorded.
Other user workloads stayed untouched. No audit builds, tests or profiling ran
alongside accepted timing. FPS remained visible.

All paths use full services, two transfer buffers, fresh-input scheduling, VSync
off, six seconds warmup and eighteen seconds measurement of the same saved city
AI match with an idle human. Only fighting rows contribute to the table. Values
are medians of trial metrics; input age is software poll-to-acquisition age,
not physical input-to-photon latency.

| Browser | Path | Trials | Fresh FPS | Interval p95 | Interval p99 | Input age p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Headless | Existing JS | 4 | 38.33 | 43.00 ms | 54.50 ms | 48.00 ms |
| Headless | Resident memory / JS math | 4 | 38.41 | 43.30 ms | 54.40 ms | 48.30 ms |
| Headless | Packed WASM | 4 | 39.93 | 42.30 ms | 49.85 ms | 45.50 ms |
| Headless | Resident WASM | 4 | 40.72 | 40.55 ms | 49.20 ms | 43.80 ms |
| Focused visible | Existing JS | 2 | 74.86 | 23.35 ms | 29.35 ms | 29.05 ms |
| Focused visible | Resident WASM | 2 | 78.87 | 20.85 ms | 26.20 ms | 28.05 ms |

Headless order is forward/reverse/reverse/forward across four implementations;
visible order is JS/WASM/WASM/JS. Visible WASM trials individually measured
83.06 and 74.68 FPS, versus JS at 73.94 and 75.78. This spread matters: two visible
trials per path are insufficient to establish a reliable five-percent gain.

**A later uninstrumented headless JS recheck reached 82.49 FPS**, p95 21.50 ms,
p99 24.50 ms and input-age p95 26.70 ms, with the same artifact, RTX adapter and
recorded Windows power state. It is a separate cohort, not another sample pooled
into the earlier A/B. Thus 38 versus 75 FPS cannot be attributed to browser mode
alone. Effective clocks, scheduling, warm state and competing work need attribution.
One GPU boundary reading changed from 495 MHz after the initial RTX control to
900 MHz after the recheck; those endpoints alone do not prove the cause.

The focused control's empty-page cadence was approximately 165 Hz. Windows reports
a 2560 x 1600 display at 165 Hz and a separate 2560 x 1440 display at 59 Hz. This
campaign's game viewport is smaller than either native resolution. It proves
neither native-resolution performance nor sustained 165 FPS; the median proportion
of fighting intervals within 6.06 ms was zero for every timed implementation.

## What would make WASM a clear performance win?

For a defined workload/hardware envelope, require all of the following:

1. **Isolate execution from layout.** Compare optimized JS, JS on the same resident
   buffers, packed WASM and resident WASM. Include producing inputs, packing,
   crossings, output reads, startup and disposal. Sample real batch sizes after
   broadphase filtering; a large synthetic batch is not a game workload.
2. **Repeat the complete game result.** Predeclare a longer serial A/B/B/A campaign
   with enough independent trial pairs to resolve a roughly 5% improvement.
   Check trial-level uncertainty and repeat in another stable session. Do not
   treat thousands of correlated frames as independent benchmark repeats.
3. **Preserve tails and latency.** Require a clear full-loop improvement without
   material p95/p99, input-age, startup, allocation or retained-memory regression.
   Include ordinary fights, knockouts/resets and representative background load.
4. **Keep behavior and lifecycle equal.** Require deterministic state/packet parity,
   accepted rendered images, bounded memory, correct restores and worker recovery.
   Preserve a JS fallback and use measured batch thresholds where small jobs lose.

The new synthetic retest measured 28,018 batches/s for JS, 23,279 for resident JS,
36,420 for packed WASM and 34,895 for resident WASM: approximately **+30.0% and
+24.5%** for the WASM paths. The fixture and source functions are saved with the
receipt. This confirms numeric throughput, not a universal game speedup. For
example, accelerating a kernel that occupies 10% of a serial path by 25% improves
that path by only about 2%, even with no new overhead.

JS already writes directly into the candidate's fixed 64 KiB WASM memory. That
removes a packing pass; it does not add execution cores. Cross-worker shared memory
is a different experiment. The current render packets already transfer ownership
without copying their bytes, and the measured page is not cross-origin isolated.
The [WASM spike](../../../../../../../spikes/persistent-world-worker/wasm-cutaways/README.md)
owns the implementation and existing correctness evidence.

## Where the visible browser spends time

Separate instrumented visible trials retain the same builds and settings. These
are diagnostic means, not the timed comparison or additive CPU/GPU budgets.
The resident-WASM result is the planning reference below:

| Work | Mean | Implication |
| --- | ---: | --- |
| Complete worker job | 10.52 ms | Must roughly halve for a 5 ms production target |
| Game presentation inside that job | 4.10 ms | Larger target than the small ray kernel alone |
| Apply frame to scene | 2.12 ms | Retain bindings and apply changed records |
| Full presentation snapshot | 0.86 ms | Borrow a bounded read view; keep independent save snapshots |
| Sample frame / directed fighter presentation | 0.59 / 1.01 ms | Measure and remove repeated work after the larger stages |
| Main-thread work | 6.36 ms | Above budget even at this smaller viewport |
| Draw submission / post / fighter HUD | 3.13 / 0.27 / 0.24 ms | Attribute the roughly 2.7 ms outside these and audio |
| Measured GPU draw pass | 6.31 ms | Already over one refresh; excludes post/compositor |
| Completed-frame acquisition delay | 5.56 ms | Split transport, message arrival and polling wait |
| Packet read / write | 0.036 / 0.064 ms | Buffer codec work is not the first target |

In the slowest 5% of worker jobs, simulation rises to 5.76 ms and total compute
to 16.56 ms. Whole-window core simulation averages 2.66 ms per fixed tick; full
session hooks average 0.10 ms. Count ticks and expensive navigation/collision
operations before reducing service fidelity. The simulation already runs at 60 Hz.

## Ordered plan to 165 FPS

1. **Establish the reference and GPU selection.** Use the actual 165 Hz display,
   2560 x 1600 and a retained 1366 x 768 diagnostic tier. Request high performance
   through the existing host context attributes and verify the actual adapter.
   Record effective CPU/GPU clocks, thermals and process scheduling in a separate
   diagnostic pass; establish the telemetry overhead before including it in timed
   runs. Use a fixed warmup and longer samples, interleave unchanged JS anchors,
   and flag more than 5% anchor drift rather than pooling different conditions.
   Run both idle and a recorded representative AI/background-load tier. Only a
   stable reference can rank small optimization gains or support default promotion.

2. **Reduce serial presentation in the engine.** Keep the accepted 353-record
   fighter selection. Extend retained bindings and dirty updates through frame
   sampling, cutaway/material work and scene application. Avoid a complete game
   snapshot merely to render fighters/HUD; expose a bounded borrowed projection
   with an explicit lifetime. Saves, review and rollback retain independent full
   snapshots. First experiments target apply at or below 0.5 ms and presentation
   snapshot work at or below 0.2 ms on the reference, then reduce the 4.1 ms game
   presenter. Require work/allocation counts, state/image parity and a full-loop
   win. These local targets contribute to, but cannot alone guarantee, 165 FPS.

3. **Remove measured pipeline waits and main-thread overhead.** Timestamp worker
   completion, postMessage arrival, host acquisition and submit independently.
   A/B the existing polling/fresh-input handshake against a frame-ready wakeup
   with late input sampling; compare two and three bounded buffers. Aim to reduce
   acquisition waiting below 1 ms without older input or extra stale frames.
   Attribute the roughly 2.7 ms of remaining host work before changing HUD/input
   abstractions. Budget the complete main critical path below 5 ms; preserve
   pause, focus, restore ordering, audio events and FPS counting of fresh output.

4. **Bring GPU work below budget at native resolution.** Measure the complete
   GPU path, including postprocessing and presentation, and use per-pass draw,
   instance and shadow counts. A/B retained/static batches and tighter camera/
   shadow work against the previously rejected batching approaches; do not assume
   another packet format helps. Target GPU p95 around 5 ms with no pass exceeding
   the 6.06 ms budget regularly. Evaluate shadow resolution, MSAA and render scale
   separately as explicit visual-quality tradeoffs with captured comparisons.

5. **Address simulation tails and larger numeric batches.** Instrument the slow
   ticks, including navigation rebuilds, broadphase candidates and catch-up steps.
   Retain fixed 60 Hz authority and verify interpolation at the render cadence.
   Use the existing engine numeric/arena contracts for the next measured hot kernel.
   Compare resident JS, scalar/SIMD WASM, then bounded 2/4-worker jobs if that work
   has independent batches. Include publication/merge/barrier costs and deterministic
   reduction order. Compare transfer and shared-buffer transport only after step 3
   identifies a cost they can remove; keep ownership epochs, atomic publication and
   fallback paths. Extra workers/buffers must improve the critical path and input
   age, not just aggregate throughput. Do not automatically occupy all 32 logical CPUs.

6. **Close acceptance and promote bounded wins.** Repeat full-combat A/B evidence
   at both resolutions and load tiers, then a ten-minute native-resolution soak
   through fights, knockouts, resets, saves and focus/recovery. Require sustained
   fresh output near the measured 165 Hz refresh, CPU/GPU p95 near 5 ms and p99
   below 6.06 ms, and inspect presentation p95/p99 against empty-page cadence so
   timer noise is not mistaken for whole missed refreshes. Report missed deadlines
   and input age explicitly; no simulation drops, correctness regressions, hangs
   or unbounded queues. Physical input-to-photon/controller coverage is separate
   from software input age. Promote a proven numeric path independently of the
   worker host's remaining feature-ownership and default-renderer image gates.

The immediate next implementation batch is reference/adapter diagnostics followed
by retained scene application and a render-only snapshot projection. Frame-ready
scheduling and GPU attribution should then determine the next branch. Small WASM
kernels remain useful, but the measured gap requires work across these stages.

## Verification and remaining limits

Twenty timed RTX comparisons, three diagnostic trials and one separate control
recheck completed with no runtime/worker errors or dropped fighting simulation
time. All required AC/battery-saver/adapter checks passed. The reporter was verified
against the actual historical failure: it now separates both GPUs into eight groups.
Fifty-six cleanup receipts contain no owned processes or visible windows. Updated
app/spike typechecking and process policy pass; the managed server has no errors.

No game code or default changed in this retest. Byte-identical artifacts retain the
prior 48,000 numeric comparisons and state/packet/knockout parity evidence; those
checks were not rerun or represented as new evidence. Production-MSAA image
sensitivity, the earlier unexplained renderer hang, guarded worker modes and a
longer stable soak remain open. Raw short-run speedups do not close these gates.

## Earlier investigations

These dated measurements are historical and retain their original caveats.

- [October 7: worker recovery and resident WASM, with GPU correction](october-7-worker-recovery-resident-wasm.md)

- [October 7: bounded fighter presentation](october-7-bounded-fighter-presentation.md)

- <a id="october-7-app-owned-worker-host-and-mode-boundaries"></a>[October 7: app-owned worker host and mode boundaries](october-7-app-owned-worker-host-and-mode-boundaries.md)
- <a id="october-7-typed-authority-stream-watchdog-and-persistent-fps"></a>[October 7: typed authority, stream watchdog and persistent FPS](october-7-typed-authority-stream-watchdog-and-persistent-fps.md)
- <a id="october-7-worker-local-play-readiness-candidate"></a>[October 7: worker local-play readiness candidate](october-7-worker-local-play-readiness-candidate.md)
- <a id="october-7-retained-serial-presentation-bindings"></a>[October 7: retained serial presentation bindings](october-7-retained-serial-presentation-bindings.md)
- <a id="october-7-remaining-cpu-costs-and-round-repairs"></a>[October 7: remaining CPU costs and round repairs](october-7-remaining-cpu-costs-and-round-repairs.md)
- <a id="bound-fighter-presentation-and-independent-work-ceilings"></a>[Bound fighter presentation and independent work ceilings](bound-fighter-presentation-and-independent-work-ceilings.md)
- <a id="material-application-and-tighter-obstruction-queries"></a>[Material application and tighter obstruction queries](material-application-and-tighter-obstruction-queries.md)
- <a id="isolated-ceilings-and-avoidable-work"></a>[Isolated ceilings and avoidable work](isolated-ceilings-and-avoidable-work.md)
- <a id="camera-and-shadow-command-experiments"></a>[Camera and shadow command experiments](camera-and-shadow-command-experiments.md)
- <a id="execution-services-and-whole-pipeline-accounting"></a>[Execution services and whole-pipeline accounting](execution-services-and-whole-pipeline-accounting.md)
- <a id="navigation-index-and-material-cache-iteration"></a>[Navigation index and material-cache iteration](navigation-index-and-material-cache-iteration.md)
- <a id="scenery-occlusion-iteration"></a>[Scenery occlusion iteration](scenery-occlusion-iteration.md)
- <a id="persistent-world-worker-iteration"></a>[Persistent world worker iteration](persistent-world-worker-iteration.md)
- <a id="165-hz-iteration-scene-copying-and-workers"></a>[165 Hz iteration: scene copying and workers](165-hz-iteration-scene-copying-and-workers.md)
- <a id="earlier-visible-browser-iteration"></a>[Earlier visible-browser iteration](earlier-visible-browser-iteration.md)
- <a id="initial-headless-audit-scope-and-evidence"></a>[Initial headless audit: scope and evidence](initial-headless-audit-scope-and-evidence.md)
