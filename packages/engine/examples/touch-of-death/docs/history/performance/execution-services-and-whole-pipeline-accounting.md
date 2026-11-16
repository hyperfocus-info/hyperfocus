# Execution services and whole-pipeline accounting

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Execution services and whole-pipeline accounting

The next iteration moves rolling local replay recording and live-learning hooks
into one DOM-free session beside the authoritative world. Inline and worker modes
use the same session. Learning computation runs there; its bounded storage bridge
calls the host's real IndexedDB store. Save/load/reset now address the active world
in the private candidate. Restore/reset clear queued input, rebase the simulation
clock and reject old render packets by revision. Graceful close flushes learning
before disposal. This is a concrete integration step; the shared playable still
uses the normal host.

The browser save test also found a production defect: the standalone save envelope
omitted `motionSeed`, so restoring changed arena motion state. The shared
`standalone/save-3d.ts` serializer now preserves it and optional project-play state.
Legacy seedless saves remain readable. This finding is not proof of the originally
reported clipping; collision rules were not changed in this iteration.

Evidence lives in `.local/engine-perf/execution-20261006/`. Twelve serial visible,
focused Chrome trials used the saved city AI match, an idle human, 1366×768 at DPR 1,
VSync, six seconds of warmup and eighteen seconds of measurement. Existing user
workloads stayed active; no audit builds/tests ran during timing. The host reports
an i9-13900HX, 32 logical CPUs and about 64 GiB RAM; thermal state is unrecorded.
Empty-page cadence was 164–165 Hz. Results below are medians of each trial's
**fighting-phase** statistics, not whole-window FPS or pooled percentiles.

| Execution | Trials | Combat FPS | p95 / p99 interval | Main-thread occupancy |
| --- | ---: | ---: | ---: | ---: |
| Normal standalone (context only) | 2 | 17.97 | 78.85 / 86.70 ms | 99.76% |
| Same candidate inline, replay + learning | 4 | 19.96 | 70.80 / 82.65 ms | 99.78% |
| Same candidate worker, replay + learning | 4 | 26.09 | 57.85 / 68.85 ms | 25.94% |
| Same worker, services disabled (screen) | 2 | 24.68 | 60.65 / 77.35 ms | 25.29% |

The matched inline/worker comparison improves combat FPS **30.7%**, p95 **18.3%**
and p99 **16.7%** with replay and learning enabled. The normal-to-worker difference
still includes additional host/UI differences and must not be called a pure thread
speedup. The two services-off trials were noisier and did not establish a benefit
from removing those services; they do not establish that recording makes it faster.

There is a latency tradeoff: median software input age increases **36.15 → 42.55 ms**;
p95 is **59.35 → 60.90 ms**. These measure sampled input age at packet consumption,
not physical input-to-photon delay. Worker median compute remains **33.25 ms** and
main-thread work for a fresh frame **7.60 ms**. Neither meets the **6.06 ms** display
budget. No trial reported dropped catch-up time, superseded packets or runtime
errors. Two transferable packets retain **1,460,224 bytes**, excluding worlds,
replay history, message metadata and GPU resources. Main-only heap counters cannot
establish a total-memory win because worker heap is not included.

`session-check.ts` passed 30 browser checks: exact full-service state checkpoints
across realms, identical durable learning records, save/load/reset, rejected restore,
stale queued input and disposal. Its short recording retained **3,465,458 bytes**
for 189 inputs; the existing recorder remains capped at 16 MiB and eight chunks.
The unchanged services-off oracle separately passed 602 per-frame state checks
and six matching render-packet/presentation checkpoints. Unit tests cover the
serializer and shared session. Fine stage clocks, per-tick core/service accounting
and asynchronous renderer GPU queries run in a separate diagnostic campaign.

The worker remains an integration candidate because complete menu/pause and focus
behavior, replay UI/rollback, post-training policy activation, appearance/uploads,
training/tutorials and online ownership are not migrated. Its main host also retains
the original world. Reaching 165 FPS is **not** an adoption gate; completing these
ownership contracts for a declared supported local mode is. The saved manifests,
raw samples, service checks and cleanup records make the candidate reviewable.

### New attribution and experiment priorities

Four separate diagnostic trials preserve named CPU profiles (`diagnostic-*`) and
fine stage/GPU clocks without CPU profiling (`stages-*`). They are attribution
samples, not additional A/B acceptance trials. The latter pair confirmed real
hardware rendering on **NVIDIA GeForce RTX 4070 Laptop GPU, ANGLE D3D11**, Chrome
154.0.8037.58, at a 1366×768 drawing buffer. The page is not cross-origin isolated;
the candidate uses transferable buffers, not shared memory.

| Stage, mean per fighting frame in the clocks-only diagnostic pair | Inline | Worker |
| --- | ---: | ---: |
| Simulation including service hooks | 9.48 ms / 2.78 ticks | 10.49 ms / 2.67 ticks |
| Initial scene sampling | 1.19 ms | 1.19 ms |
| Gameplay presentation, including camera/obstructions | 12.60 ms | 15.01 ms |
| Full snapshot | 1.44 ms | 1.68 ms |
| Directed fighter presentation | 5.24 ms | 6.29 ms |
| Apply scene state | 5.15 ms | 6.01 ms |
| Compile commands + write packet | 0.50 ms | 0.60 ms |
| Renderer CPU submission | 5.52 ms | 6.27 ms |
| HUD | 2.09 ms | 2.34 ms |
| Renderer GPU elapsed time | 11.38 ms | 13.42 ms |

GPU queries produced 259/269 fighting samples, without blocking completion/readback.
They include the renderer's scene/shadow/outline passes, excluding the separate
post-process context and compositor. GPU and CPU overlap, so do not add their
durations. Even this partial GPU interval exceeds the entire 165 Hz budget in
these conditions; adding CPU workers alone cannot establish the target. Background
GPU contention and thermal state remain unmeasured.

Over the span between first/last fighting samples, core simulation averages
3.96/4.32 ms per tick and replay/learning hooks 0.139/0.148 ms per tick. Those spans
can include round transitions; they are not individual-tick percentile samples.
Within each trial's same slowest 5% of compute frames, simulation rises to
24.23/27.03 ms with 3.62/4.14 ticks. Checkpoint history peaks at about 9 MB in these
short runs. Replay hooks are not the dominant average cost, but their allocation
and long-duration retention still need separate evidence.

The named inline CPU profile identifies `presentCombatObstructions3D` (1.80 s
inclusive of 19.05 s sampled), `applyFrame` (1.47 s), navigation `clearSegment`
(1.28 s), `runCcd` (0.77 s), and GC (0.77 s). These whole-profile samples include
round transitions; overlapping inclusive totals must not be summed. The main-only
worker profile highlights renderer binding calls, shadow submission and transparent
sorting. It does not profile the worker's CPU directly.

The next bounded experiments, in order:

1. **Spatial interest and stable scene bindings across presentation.** Compare
   early camera/occluder candidate selection, prebound fighter/environment groups
   and static/dynamic scene application. Full scene sampling alone is only about
   1.2 ms; the larger target is repeated discovery, obstruction work, decoration
   and application of the whole scene. Count visited entities, rebuilt maps,
   changed transforms/materials and allocations. Preserve cutaway fade transitions,
   camera clearance, shadows, restores and the exact simulation/packet oracle.
2. **Renderer/GPU work, alongside CPU preparation.** Screen scene versus shadow
   passes separately, then A/B stable VAO/instance bindings, compatible mesh/material
   batching, shadow interest/static reuse and unchanged-HUD updates. Pass suppression
   is attribution only, not a retained visual downgrade. Judge GPU elapsed time,
   CPU submission, draw counts, visual parity and fresh-frame latency together.
3. **Simulation deadlines and navigation invalidation.** Separate a costly tick
   from catch-up behind frame preparation; add AI/navigation versus physics clocks
   and correlate graph rebuilds. Test regional graph invalidation with the existing
   exact route oracle. A separate preparation worker needs an explicit read-only
   mirror of live contact/environment data that presentation currently reads from
   physics, rather than a blind full-world copy.
4. **Concurrent preparation and buffering.** After those ownership boundaries,
   measure one/two/four independent preparation jobs and two/three buffers. Keep
   dependent simulation ticks ordered, report total realm memory and input age,
   and count fresh states separately from interpolation or duplicate draws.
   Current compilation/packet writing (~0.5–0.6 ms) and packet reading (~0.05–0.09 ms)
   are lower priorities than the measured presentation and rendering work.

There is a concrete abstraction gap to test first: the bounded scene compiler
already accepts `frustumPlanes` and reports culled instances, but
`Hyperfocus3DRuntime.compile()` calls it without those options. Consequently the
normal and candidate runtime paths do not use that existing camera-frustum test.
The WebGL renderer also feeds the same commands to its shadow pass. Simply adding
camera culling would remove off-camera shadow casters; the experiment must carry
separate camera/light interest or a conservative union with pass-specific masks.
This is an engine contract/wiring problem, not a need to invent another culler.

Continue the supported-local-mode integration in parallel with those experiments;
the repeated worker advantage survives replay/learning integration. The remaining
blockers are product ownership and correctness, not a requirement to reach 165 FPS
first. Session artifact hashes start `820abf717e9acf91` (main) and
`5cd35690aa20a12db` (worker); diagnostics use separately recorded manifests.
Focused validation passed nine tests/37 assertions, editor and experiment
typechecks, changed application lint and the process-policy check. Another 23
visible-browser checks exercised commands against the automatic producer with
three buffers, including paused restore, rejected concurrent mutations, stale
frame rejection, save/load and close. The shared managed server reported no
unresolved errors; recorded owned-browser cleanup left no processes/windows.
