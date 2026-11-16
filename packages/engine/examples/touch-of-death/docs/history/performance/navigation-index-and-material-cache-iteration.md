# Navigation index and material-cache iteration

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Navigation index and material-cache iteration

Retained an engine-local obstacle index in `combat-environment/obstacle-route.ts`
and `obstacle-index.ts`. Each live planner query builds a bounded binary AABB
tree, rejects distant obstacle groups, then runs the existing exact rounded-box
sweep. The original corner order, graph cache key, costs, tie-breaking and
collision rules remain unchanged. Bounds rebuild from current bodies, including
moving, removed, restored and destructible obstacles; this is not a visibility
filter and cannot discard an offscreen wall that blocks a route.

Evidence is under `.local/engine-perf/scene-navigation-20261006/`. Fourteen serial,
unprofiled, focused visible-Chrome trials used the same environment, saved city
AI match, viewport, VSync and 6-second/18-second windows described below. The
eight-trial screen compared control, material cache, navigation and both changes,
then reversed that order. Six confirmation trials compared combined, navigation,
control, control, navigation, combined. Existing background work remained active;
no audit builds/tests ran during timing. High performance power mode was observed;
thermal state is unrecorded. These remain local observations, not reference gates.

| Normal standalone, median per-trial fighting metrics (four trials each) | Control | Retained navigation |
| --- | ---: | ---: |
| FPS | 17.61 | 18.63 |
| p50 / p95 / p99 frame interval | 51.50 / 90.00 / 103.35 ms | 49.15 / 76.60 / 88.50 ms |
| Median / p95 full-frame CPU work | 47.25 / 84.80 ms | 46.75 / 72.65 ms |
| Median / p95 simulation | 6.60 / 41.80 ms | 7.15 / 29.55 ms |
| Median presentation | 29.65 ms | 29.40 ms |

Navigation improved FPS **5.8%**, p95 frame interval **14.9%**, and p99 **14.4%**.
Its main benefit is reducing simulation spikes; median simulation did not improve.
The normal loop still saturates its main thread and misses the **6.06 ms / 165 FPS**
target by a wide margin. Presentation remains the dominant median cost.

Four further visible trials compared the same navigation change in the existing
single-worker, two-buffer, fresh-input prototype, in control/candidate/candidate/
control order. Median fighting-phase **fresh FPS was 23.25 -> 26.46** (+13.8%),
p95 **81.85 -> 55.70 ms**, and p99 **96.95 -> 63.65 ms**. Worker compute p95 fell
**78.35 -> 49.50 ms**; median compute remained **33.35 -> 32.40 ms**. Median input
age was effectively unchanged (**42.60 -> 42.50 ms**), with p95 **88.05 -> 60.90 ms**.
No simulation time was dropped. Each side had only two trials, so this is supporting
evidence for the engine change, not a production-worker promotion.

Main-thread activity was 22.1% -> 26.1% as more fresh frames were submitted; median
main work was 7.20 -> 7.35 ms and p95 9.90 -> 11.05 ms. Even with instantaneous
worker computation, that measured main work exceeds the 6.06 ms budget. The worker
still performs about 32 ms of computation per frame. Additional buffering cannot
remove that work. Two packet buffers remain bounded at 1,460,224 bytes, excluding
the separate worlds and other state. All earlier prototype integration limits apply.

### Rejected material cache

The candidate compared detached look values and current public scene buffers before
skipping unchanged material packing. Comparing renderer buffers was necessary:
direct scene edits and packet writes must remain authoritative. Tests covered reused
mutable frames, external buffer edits, texture errors, signed zero and partial
static/skinned update failure recovery. This preserved behavior but added comparison
work, owned look copies and 1,724 cache records (227,568 bytes of packed arrays,
excluding objects). The candidate is preserved in frozen local artifacts/source
snapshots and is removed from the default runtime.

Across four trials each, adding it to navigation changed FPS **18.63 -> 18.74**
(+0.6%), p95 **76.60 -> 73.00 ms**, p99 **88.50 -> 90.85 ms**, and median CPU
**46.75 -> 47.60 ms**. Its two standalone screen trials also failed to establish a
clear win. Reduced write counts alone do not justify the extra state and complexity.

### Work and correctness

A separate instrumented fixed-clock replay covered 901 frames / 15 seconds, with
exact full combat-state hashes at frames 0, 300, 600 and 900. Both the combined and
final navigation-only candidates reproduced control state and made identical 521
planner queries, 350 graph rebuilds and 1,960,724
segment queries. Obstacle leaf checks fell **188,313,949 -> 16,398,722** (-91.3%),
with **45,476,305** additional cheap tree-node checks. Exact sweep calls changed
**1,720,467 -> 1,683,733** because a different blocker can satisfy the same boolean
query first. The index built 506 times, allocating 64,262 nodes in total; maximum
observed query size was 200 bodies / 127 nodes / 508 bytes of traversal stack.
Each index is query-local and does not retain stale bodies across ticks.

Post-GC used heap in these separate diagnostic replays was 37,095,096 bytes for
control, 37,167,032 for navigation (+71,936), and 39,729,448 for the combined cache
candidate (+2,562,416 over navigation). These are single retained-heap observations,
not allocation-rate, RSS, peak-memory or leak measurements. Node allocation counts
and the fixed cache/stack capacities provide the portable resource evidence.

The rejected cache reduced material writes **1,553,324 -> 3,491** (99.8%), while
all **3,081,420 entity records** and **1,553,324 material records** still passed
through the frame pipeline. Removing writes did not remove those scans or copies.

The final navigation-only build separately passed 602 browser simulation-oracle
checks and six full numeric-render-packet/presentation checkpoints. Focused runtime,
route, hazard and broadphase tests passed (43 tests / 4,602 assertions), including
2,000 randomized index/exhaustive queries and the immutable original route oracle.
Engine and test typechecking, focused lint, package build and installed-package
consumer validation passed. Existing source-structure failures remain unchanged.
The full bundle gate still reports the same 168 over-budget categories as the saved
control, with no newly failing category or raised limit. Native runtime output grew
909 raw / 384 gzip bytes; standalone tooling output grew 907 raw / 425 gzip bytes.
The four existing source-structure violations remain in unrelated renderer/editor/
PadPilot paths. This is not a clean broad repository gate.

Final numeric packets and presentation metadata matched exactly. Three of six
matched PNGs were pixel-identical; the others differed at 12, 22 and 3 pixels out of
1,049,088, with maximum channel delta 1. All 25 owned browser sessions recorded empty
process/window inventories after cleanup. The shared server had no unresolved
runtime errors. Private artifact interception preserved its existing exported game;
engine source and the installed package build contain the retained change.

Final manifests are `standalone-navigation/manifest.json` (main SHA-256 starts
`155626fe7f7a9ad6`), `navigation/manifest.json` (world host `71bd3143967a7021`,
worker `556f7c5c1b9db5e9`). The final source-graph audit identifies only the route,
new index and rebuilt runtime as changed from control; the rejected material runtime
was restored to its pre-experiment content. `results.json`, `aggregate.json`,
`verification.json`, per-trial raw samples and both parity campaigns preserve the
evidence. Reproduction uses the existing `spikes/persistent-world-worker` scripts
with this evidence root, frozen source maps and manifests.

### Remaining priorities

Treat worker integration, simulation scheduling, frame preparation and renderer
cost as one pipeline. The next iteration should establish a comparable production
worker path and measure critical paths across these stages, rather than select
another leaf optimization solely from the largest named timer.

`holistic-attribution.ts` / `.json` in this iteration's evidence directory reanalyze
the saved navigation-only trials; this is not a new browser benchmark. For each
trial, time shares use summed component durations from the same fighting frames.
The slow group is that trial's slowest 5% by its own CPU/worker-compute duration,
not independently selected component percentiles. Values below are medians of
per-trial summaries, rounded; they need not sum exactly.

| Normal loop CPU work | All fighting frames | Slowest 5% of CPU frames |
| --- | ---: | ---: |
| Simulation | 22% (~11.3 ms mean) | 41% (~32.1 ms mean) |
| Existing broad presentation timer | 60% (~30.0 ms mean) | 47% (~37.5 ms mean) |
| Compilation plus renderer submission | 11% (~5.6 ms mean) | 8% (~6.0 ms mean) |
| Work outside those timers | ~7% (~3.4 ms mean) | ~5% (~4.1 ms mean) |

The target frame budget is 6.06 ms. Dividing a median component by a p95 total is
not a valid workload share. Both preparation and simulation matter, especially
for stalls. Simulation averages 3.22 fixed ticks per normal rendered frame versus
2.27 per worker-produced frame. Amortized simulation duration per tick is similar:
3.48 / 3.50 ms respectively, rising to about 7 ms in each selected slow group.
This is expected catch-up at these frame rates, not proof of duplicated ticks or
an intrinsic improvement in physics speed. Per-tick instrumentation must separate
an expensive tick from several ordinary ticks accumulated behind preparation.

Timer definitions currently differ. Normal `presentationMs` includes menu/UI and
audio work, sampling, decoration, snapshots and `runtime.applyFrame`; its
`renderSubmitMs` includes `runtime.compile()` and the renderer call. Worker
`presentationMs` excludes scene application; `compileMs` combines application,
compilation and packet writing. Worker metadata construction after its final
timestamp, structured-message cloning, scheduling/queue waits, main-thread
post-processing/HUD, GC and actual GPU completion need explicit attribution.
Packet reading alone (~0.1 ms) does not measure that entire handoff.

### Worker integration decision

Persistent worker ownership is the leading integration candidate. Reaching 165 FPS
is not a prerequisite to adopting a measured improvement. Its prototype label
describes incomplete product integration, not a rejection of its speedup.

Before the execution-services iteration above, the injected worker branch returned
before the normal host loop. Save/load/reset hooks referenced the original
main-thread `gameplay` object; replay/network
sessions and live-learning services also own that object. The worker creates a
second world, with initially copied appearance/policy data. Simply selecting this
branch by default would leave these consumers reading or modifying stale state.
The worker implements local combat, input, rendering, HUD and audio; that does not
yet prove complete pause/menu, save/replay, training, appearance, learning or online
behavior. Rolling local-review checkpoints (every 120 recorded ticks) and live
learning hooks are concrete omitted workloads to measure, not assume expensive.

The latest full-normal versus worker figures (18.63 / 26.46 FPS) combine threading
and those pipeline/service differences. Earlier matched inline/worker confirmation
did isolate a real ~12.7% FPS benefit on its older artifact. Repeat a three-way
comparison on current source: full normal host, equivalent inline execution adapter,
and the same adapter in a worker, with the same supported features enabled.

### Next experiment sequence

1. **Comparable execution and accounting.** Give inline and worker execution the
   same engine command/state contract and stage boundaries. Time AI/navigation,
   physics and host hooks per tick; sampling/snapshots, camera/occlusion, fighter
   animation, scene application, compilation, packet/metadata and drawing separately.
   Correlate slow frames with ticks, graph rebuilds, checkpoint creation, allocation
   and GC. Add asynchronous GPU duration where supported; keep unsupported GPU time
   explicitly unknown. Run diagnostic profiles separately from uninstrumented A/Bs.
   Migrate the ordinary local-match features onto this contract, with one authoritative
   world and renderer-only state on main. Keep privileged storage/browser adapters in
   the host and portable execution/protocol primitives in the engine. First promote
   the proven local mode, retaining inline execution for modes not yet migrated.
   Promotion requires save/restore, reset/rematch, pause/focus, appearance, learning,
   replay ownership, disposal/recovery and input parity for the supported mode, plus
   repeated throughput/latency and memory evidence; it does not wait for 165 FPS.
2. **Separate simulation deadlines from visual preparation.** Compare the current
   single world worker with a fixed-tick simulation owner and an independent frame
   preparation stage. A versioned read-only handoff must include the live contact,
   environment and fighter data that presentation currently reads from physics.
   Test visual preparation cadence independently of 60 Hz authoritative simulation
   and 165 Hz display/input polling. Interpolation can add latency, so report fresh
   simulated states, interpolated visual frames and duplicate draws separately and
   measure input-to-visible-state delay. Do not trade collision, hitstop, rollback
   correctness or hidden time drops for a higher FPS counter.
3. **Reduce repeated work across stages.** Static/dynamic scene ownership, compact
   dynamic updates, pre-resolved bindings and early camera/shadow interest can remove
   sampling, copying, decoration and compilation together. The transform primitive
   already skips unchanged matrix rebuilds; another setter cache is not the primary
   target. Separately test regional navigation invalidation against the observed
   350 graph rebuilds and retain the exact original route oracle. Authoritative
   collisions and offscreen gameplay keep their own interest rules.
4. **Main-thread and GPU capacity.** The retained worker still costs ~7.35 ms median
   on main, above the entire display budget. Normal-loop samples average about 2,634
   draw calls including 1,277 shadow calls; counts alone do not establish GPU cost.
   Compare batching/instancing and static shadow reuse after splitting compilation,
   driver submission, GPU passes, HUD and post-processing. Temporary pass suppression
   is diagnostic evidence, not an accepted reduction in visual quality.
5. **Parallel batches and buffering.** Once stage ownership is stable, compare one,
   two and four workers on independent animation/culling/query batches, including
   dispatch, conversion, synchronization and memory costs. Keep dependent simulation
   ticks ordered. Revisit two versus three buffers after producer/consumer timing
   changes, judging frame age and input latency as well as throughput. More cores
   and queues are candidates to test, not default wins.

For each candidate, use the same artifact/content and features, serial repeated
ABBA trials, and correctness checks before timing. Expand beyond the idle-human
AI match to scripted two-fighter exchanges, wall/floor contact, moving obstacles,
destruction, effect-heavy combat and actual menu/replay/learning transitions. Include
lower-contention and representative background-load tiers when available, recording
the load rather than stopping unrelated user processes. Judge fresh visual FPS,
frame p95/p99, input age, per-tick deadlines, CPU/GPU work, allocation/GC, total memory
and worker lifecycle together. The current engine change enables neither a new
worker default nor triple buffering; this sequence defines the next experiments.
