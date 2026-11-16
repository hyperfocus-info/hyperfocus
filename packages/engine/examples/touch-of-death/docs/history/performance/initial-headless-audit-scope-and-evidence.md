# Initial headless audit: scope and evidence

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Initial headless audit: scope and evidence

## Scope and evidence

The canonical local project contains one active scene, `level-3d`: the city, with
3,420 entities and 462 physical bodies. The original enclosed arena remains in
authoring/test fixtures. The inspected player menus do not offer a choice between
two arenas. Recommendation: keep the city as the player-facing game, and retain
the enclosed arena as a cheap collision regression fixture. This audit does not
remove authored projects or tests.

Evidence is under `.local/engine-perf/combat-audit-20261006/`:

- `inventory.json`: scene/body inventory and exported document hashes.
- `serial-current-{1,2}.json`: two consecutive 12-second samples of the exported
  current source, after six seconds of combat warmup. No audit build, tests or
  compiler ran concurrently with these two samples. Existing user workloads were
  left running and were not controlled.
- `current.cpuprofile`, `current-profile-summary.json`, `current-runtime.js`:
  a separate ten-second sampling profile, with minified functions mapped back to
  their actual executable source. Profiled timing is diagnostic.
- `baseline.*`: a different, older shared local export. Its SHA-256 starts
  `84fb58d1`; its runtime still performs wardrobe lookups and rider scans already
  optimized in newer source. It is not a valid control for attributing a speedup
  to the new telemetry. Both builds contain v38 and v37 identity/migration text;
  finding a protocol version string alone does not identify an artifact.
- `collision-probe.ts` / `.json`: isolated collision failure reproductions.
- `request-*.json`, `result-*.json`, screenshots and downloaded report: browser
  verification through ordinary menus, plus explicit diagnostic reads.

Environment: Windows, Bun 1.4.2, Chrome 154.0.8037.58 headless, 1366×768 at DPR 1,
i9-13900HX with 32 logical CPUs, 64 GiB RAM, and ANGLE/D3D11 on the RTX 4070 Laptop
GPU. Power policy, thermal behavior during each trial, and competing workload
were not controlled. The browser had an owned disposable profile and no visible
window. It did use the NVIDIA GPU; this was not a software-renderer fallback.

The measured source artifact SHA-256 is
`26eeffbf31d6b30e9499a35096fb611be290e8b047fadd19b1fa34cf470f971c`.
The final verification export additionally fingerprints its inline runtime in
downloaded telemetry; it is a later artifact. No comparative speedup claim is
made between these builds. The earlier `current-telemetry.json` capture overlapped
repository checks and is retained as contention evidence, not a controlled trial.

## Initial headless measurements

These are complete game-frame intervals, not reciprocal GPU frame timings.
The first sample was entirely fighting; the second includes fighting and round
result. Per-phase summaries are preserved in the raw reports.

| Metric | Sample 1 | Sample 2 |
| --- | ---: | ---: |
| Average submitted FPS | 18.0 | 15.9 |
| Frame interval median | 54.3 ms | 60.7 ms |
| Frame interval p95 | 72.6 ms | 78.9 ms |
| Frame interval p99 | 121.4 ms | 101.2 ms |
| Main-thread work median | 50.2 ms | 57.9 ms |
| Simulation work per rendered frame median | 7.7 ms | 10.9 ms |
| Simulation work per rendered frame p95 | 28.3 ms | 23.9 ms |
| Presentation preparation median | 31.9 ms | 33.2 ms |
| Render submission median | 6.4 ms | 9.5 ms |
| Total draw submissions median | 2,401 | 3,551 |
| Maximum simulation steps in one frame | 8 | 6 |
| Simulation time discarded at catch-up cap | 0 ms | 0 ms |

The phase timings describe wall time on the main thread and may include OS
descheduling. Render submission is CPU/driver work, not a GPU timer query.
Independent medians do not add to the median total. Draw totals include shadow
passes; outline and shadow counters are subsets, not additional totals.

The separate current-source sampling profile attributes about 20% of its sampled
duration to local gameplay advance, 20% to combat presentation, 15% to the WebGL
renderer, 11% to obstruction/cutaway presentation, 9% to directed fighters, 6% to
runtime frame application, and 7% to garbage collection. These inclusive paths
overlap: obstruction is inside combat presentation, for example. Do not sum them.
They point to main-thread scene preparation and allocation as well as rendering.

At 60 FPS the whole frame has 16.67 ms. In this headless environment, presentation
alone exceeds that budget. Turning off VSync, reducing pixels, or adding physics
substeps cannot by themselves remove that work.

## Collision findings

### Existing enclosed-arena failures have regression coverage

`bun test packages/engine/src/physics/rigid-ccd-resting.test.ts` passes all ten
tests, including 15,034 assertions. Cases cover thin floors over their visible
footprint, sphere/box floor contacts, 16/100/500 m/s enclosed-arena launches,
rounded corners, falling fighters landing on grounded fighters, and a near-touching
sphere crossing a thin wall into a far-side overlapping endpoint. This is evidence
that those particular historical failures are handled, not a universal no-clipping
guarantee or proof that an older export contains the fixes.

The normal standalone loop and physics runtime advance in fixed 1/60-second
ticks. Low render FPS causes multiple ticks per frame, not one large collision
step. Diagnose contact logic and explicit position changes separately from FPS.

### Confirmed failure: compression through a floor

An isolated world with a radius-one fighter, a 0.2-metre floor and a descending
solid squeezes the fighter below the floor. At a 1 m/s descent it crosses at tick
188, ending at y≈−0.982 while the descending solid is centered at y≈0.867. It also
reproduces at 3 and 10 m/s. There are no CCD, candidate or contact overflows.

`rigid-3d-api.ts` integrates, runs continuous detection, collects contacts, then
solves positions. Two opposing solids can make the available space impossible;
the discrete corrections can eject the body through the thin floor. More CCD
budget does not repair this. A robust fix needs an explicit crush/blocked-motion
policy and collision-safe moving geometry. That policy changes game behavior and
needs a reachable city reproduction before selecting its response.

The current city's authored freight lift deliberately retains two metres beneath
its low stop. The adversarial fixture violates that clearance. It establishes an
engine limitation, not that this exact trap is reachable in the shipped city.

### Confirmed bypass: platform carry is unswept

`motion/platform-motion.ts` calls `setPosition` for riders and moving static
surfaces before `physics.step` captures previous positions. A fixture carrying a
rider from x=−1.2 to x=+1.2 across a thin wall crosses completely, with zero CCD
tests. That 2.4-metre one-tick displacement is deliberately larger than normal
city traffic. The bypass is real; normal-speed city reachability remains unproven.

Sweeping the intended rider/platform displacement, preserving its original
position through collision detection, and validating the final position against
other solids are stronger fixes than extra solver iterations. Save/restore,
traffic impacts, rotating vehicles, boarding, jumping and crush behavior need
parity tests before changing this path.

No physics behavior was changed by this audit. The new reports retain recent
fighter positions, simulation/combat frame IDs, hitstop, and physics overflows.
They can locate an incident but are not deterministic replay checkpoints and do
not capture every intermediate tick in a catch-up frame.

## Tradeoffs, in recommended order

| Candidate | Expected benefit / evidence | Cost or risk | Next acceptance |
| --- | --- | --- | --- |
| Extend visible-play coverage | The follow-up above confirms a desktop-window slowdown in one repeatable match | More spawn/input coverage; no uploads | Same artifact, viewport and situation; active combat and representative contention |
| Reuse static scene and presentation data | Targets the largest measured cost; frame evaluation, cutaway maps, wardrobe maps and transform application revisit thousands of records | Invalidation must handle destruction, fades, equipment, rewind and scene changes | Full-loop serial ABBA, equal images/state, allocation/scan counts |
| Preserve batching through cutaway changes; separate static shadow work | Thousands of submissions and material bindings remain; default 2048 shadow pass covers the city | Incorrect aliasing can fade unrelated walls; cached shadows can become stale | Main/shadow/outline counters, demolition and camera-return comparisons |
| Reduce repeated snapshots and transient arrays | GC sampled around 7%; host and presentation repeatedly build detached world/combat views | Borrowed views can corrupt replay/save ownership | Detached-snapshot tests, retained memory and allocation rate; preserve all consumers |
| Bound navigation rebuild work spatially | Corner graph is O(corners² × blockers); cache identity includes live blockers, so moving traffic can invalidate it | Stale routes or changed tie ordering can change deterministic combat | Exact route/state/audio parity and dense/moving city cases |
| Optional lower shadow resolution/render scale | Can reduce GPU/fill cost after telemetry confirms that limit | Softer shadows and lower clarity; does not remove scene-preparation CPU | Rendered comparison and GPU timing, not CPU submission time alone |
| Limit background training effort | Leaves scheduling headroom when other work is active | Fewer training fights per second | Real contended play samples; user-controlled budget |
| Bound render-frame catch-up or move simulation to a worker | Limits long main-thread bursts; current accumulator permits up to 15 ticks | Offline slowdown or online determinism/latency/rollback changes; worker transfer overhead | Fixed-tick parity, input latency and online recovery under stalls |
| More physics substeps/iterations | May reduce some contact errors | More CPU and different simulation outcomes; does not sweep a teleport or resolve impossible clearance | First reproduce a reachable failure; compare targeted fixes before global cost |
| Uncapped submission / VSync off | May reduce waiting where refresh pacing is the limit | More CPU/GPU power and contention; browser still owns display presentation | Compare actual play reports; not a remedy for work exceeding the frame budget |

The existing bulk trainer defaults to 40% of reported logical-thread capacity,
with duty pacing; 100% can use every reported logical thread. Its dialog pauses
the game drawing and closing the dialog pauses its pool. Therefore it is not
accurate to assume that this same-page trainer normally runs alongside combat.
Separate tabs, other agents and external AI workloads remain possible contention.
Do not silently change their workloads during an audit.

No visual-quality downgrade, physics substep increase, AI weakening, arena
removal, simulation-rate change, or worker rewrite was selected. The follow-up
selects only the exact square-root acceleration described above. Further
optimizations follow the engine's correctness-first, serial ABBA policy.

## Added player diagnostics

The standalone host now offers **Settings → Game settings → Performance**, also
available through **Pause → Settings → Performance**:

- **VSync**, on by default: display-paced `requestAnimationFrame`; off selects
  timer-paced submission. Simulation remains fixed at 60 Hz. Hidden pages do not
  run an uncapped render loop. This is browser pacing, not a native swap-interval
  override. [The browser API](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
  generally follows display refresh and pauses callbacks in hidden tabs.
- **Show FPS counter**, off by default: a compact FPS/frame-interval overlay,
  updated twice per second. It measures game submissions, not display scanout.
- **Record performance telemetry**, on by default: a ring of at most 1,800 frames,
  64 incidents, and 64 long tasks. Reports include phase summaries, CPU stages,
  catch-up and discarded time, draw counters, fighter positions/hitstop,
  overflow evidence, browser/GPU/DPR, content identity and inline runtime hash.
- **Download performance report** and **Clear telemetry**. Recording is local and
  in memory; preferences persist locally. Disabling recording stops collection.
  Nothing is automatically transmitted. Download before reload to retain evidence.

The owning implementation is the editor host's `scene3d/performance/` directory;
no browser preferences or DOM dependencies were added to the engine. Reports
explicitly identify headless/automation context and unavailable power/thermal
information. GPU durations, OS-wide CPU use and external process load are not
measured by the browser collector. Source changes require a fresh standalone
export; existing immutable release folders and shared exports are not rewritten.

## Verification and limits

The focused settings/menu/pacing/capture tests pass (19 tests, 111 assertions),
along with the ten existing collision regressions. Exported browser checks cover
desktop and 390px layouts, persisted counter preference, VSync switching,
disabled collection, pause behavior, and the downloaded JSON. Screenshots show no
horizontal overflow. Compilation of the standalone artifact succeeds.
Targeted ESLint and the process-policy check pass. The final counter sits at the
upper left on desktop and upper right on narrow screens, clear of the pickup
prompt and score; both landscape and portrait gameplay were inspected.

Broader source and test typechecks encountered unrelated incomplete fixtures:
`scripts/online-composition/fixture.ts` lacks `connectionReady`, and
`scene3d/replay/local-exchange.test.ts` lacks `fromLibrary`. Repository-wide source
structure and code-style gates also report pre-existing work outside this change.
Those files and baselines were not rewritten to make this audit appear green.

The follow-up above closes the initial uncertainty about whether visible Chrome
can reproduce the slowdown. The 165 FPS target remains unmet. The outstanding
collision acceptance is a reachable current-city reproduction. Neither absence
of a reproduced city failure nor the old arena's passing tests proves that every
clipping issue is fixed.
