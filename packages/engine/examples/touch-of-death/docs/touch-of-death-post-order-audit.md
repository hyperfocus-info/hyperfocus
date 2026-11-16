# Ordinary playable post-processing order audit — October 13, 2026

This follows the [HUD layout audit](touch-of-death-hud-layout-audit.md), addressing
its measured `context.filter` style flush. The scope is the ordinary inline
playable, using the existing lab runner and process owners. Simulation, visual
workload, GPU settings and worker transport are unchanged.

**The forced-flush fix works, but keep the original default.** Style time roughly
halves. Callback rate improves 4.0% in rooftop and 11.2% in depot; changed fighter
positions improve only 1.2% and 4.0%. Rooftop's gain is modest and depot fails exact
image repeatability in both original and candidate. No configuration is promoted.

## Completed comparison

Eight serial A/B/B/A trials: original/post-first/post-first/original in each
arena, 5 seconds warmup and 10 seconds measurement. Each reload restores the same
seeded checkpoint and presentation history. Restored gameplay hashes match within
each arena. There were no extra timing trials or combinations.

Arithmetic means of two trial statistics, not pooled percentiles:

| Arena / HUD | Steps/s | Changed positions/s | Callbacks/s | Interval p50 / p95 / p99, ms | >6.06 ms | Repeated positions |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Rooftop original | 59.87 | 39.54 | 66.41 | 12.30 / 18.50 / 24.35 | 99.92% | 40.35% |
| Rooftop post-first | 59.94 | 40.01 | 69.08 | 12.20 / 18.30 / 24.35 | 99.06% | 42.00% |
| Depot original | 59.89 | 47.41 | 62.89 | 18.05 / 21.45 / 24.35 | 99.76% | 24.48% |
| Depot post-first | 59.90 | 49.31 | 69.94 | 12.20 / 18.30 / 24.15 | 99.08% | 29.37% |

| Arena / HUD | Full callback CPU p50 / p95 / p99, ms | Simulation p50 / p95 | Preparation p50 / p95 | Compile + submit p50 / p95 | Post p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| Rooftop original | 12.70 / 17.70 / 23.00 | 1.55 / 5.40 | 8.40 / 10.45 | 1.50 / 2.05 | 0.25 / 0.40 |
| Rooftop post-first | 12.20 / 17.40 / 21.70 | 1.65 / 5.20 | 7.15 / 9.75 | 1.50 / 2.15 | 0.20 / 0.30 |
| Depot original | 13.85 / 18.40 / 22.70 | 2.00 / 4.70 | 9.40 / 11.75 | 1.05 / 1.25 | 0.20 / 0.30 |
| Depot post-first | 12.60 / 15.85 / 20.35 | 1.90 / 3.95 | 7.75 / 9.70 | 1.00 / 1.25 | 0.20 / 0.30 |

Preparation is the existing `presentationMs` stage. Its decrease includes HUD
work moved beyond that timing boundary; it is **not** all eliminated work. Post
measures CPU submission and overlay layout, not asynchronous GPU execution.
Stage quantiles and overlapping browser/CPU timings must not be added.

Rooftop callback controls were 67.28 / 65.54 Hz (2.62% spread), candidates
68.79 / 69.37 Hz (0.84%). Depot controls were 64.08 / 61.70 Hz (3.79%), candidates
68.69 / 71.19 Hz (3.57%). Depot's cadence gain exceeds observed control variation;
rooftop is a modest signal below the roughly 5% full-loop promotion target.
CPU p95 improves 1.69% / 13.86%. The small changed-position gains are weaker
evidence than callback gains; repeated positions increase in both arenas.
Fresh-motion improvement remains inconclusive in this small block: control
position-rate spreads are 0.72% / 3.34%, versus gains of 1.17% / 3.99%, and
rooftop candidate position-rate spread is 0.87%.

| Measured work per callback | Rooftop original → post-first | Depot original → post-first |
| --- | ---: | ---: |
| Browser style ms | 1.669 → 0.900 | 1.641 → 0.858 |
| Browser style events | 4.094 → 1.050 | 4.070 → 1.032 |
| Browser layout ms | 0.143 → 0.051 | 0.140 → 0.052 |
| Geometry reads, all five consumers | 16 → 4 | 16 → 4 |
| Fighter-bar text / attribute / style setters | 4 / 35.08 / 24 → 0.016 / 3.13 / 5.13 | 4 / 35 / 24 → 0.019 / 3.32 / 5.75 |
| Hidden-reticle reads / position writes | 4 / 2 → 0 / 0 | 4 / 2 → 0 / 0 |
| Fighter-bar entity visits / projections | 7,838 / 12 unchanged | 7,834 / 12 unchanged |
| Draws, including shadows/outlines | 912.72 → 912.50 | 572.12 → 571.86 |

Every timed candidate callback recorded one deferred HUD frame and zero menu
fallbacks. Rendering and simulation remain enabled; no cached/frozen-scene or
visual-workload ablation is used. The candidate retains one geometry record and
the prior bounded changed-style caches. Endpoint copies, uploads and storage are
not changed or newly measured. No allocation reduction is claimed.

## Implementation

`post-first` extends the existing shared-geometry/changed-write HUD option. In a
stable fight layout it renders WebGL and Canvas2D before updating menus, reports,
appearance controls, rewards and the remaining HUD. The post-processing overlay
also applies its CSS after its pixel passes. Intrinsic backing storage is resized
before drawing. Menu transitions retain the original layout-first ordering and
remeasure the canvas; no geometry survives across display frames.

Input polling and training-dialog availability still run before simulation.
Projection, fighter-bar entity scans, simulation, resource validation and all
pixel passes remain. `original`, `batched` and `post-first` are reversible choices
in the same artifact. The original remains the recommended default.
The control is suspended in the existing authoritative/guided/worker modes.

Telemetry adds deferred-frame and layout-fallback counts and a post-processing
duration. Moving HUD work changes the presentation-stage boundary: use full
callback CPU time for the overall comparison. Post-processing and stage durations
are subsets of callback CPU time, not additive independent measurements.

## Caller evidence

Two separate three-second rooftop traces include JavaScript caller stacks. They
are diagnostic evidence, not throughput measurements.

| Style attribution | Original count / ms | Post-first count / ms |
| --- | ---: | ---: |
| Viewport dimensions in frame | 192 / 146.008 | 0 / 0 |
| Hidden reticle positioning | 192 / 23.441 | 0 / 0 |
| Post-processing geometry | 192 / 21.030 | 0 / 0 |
| Canvas2D filter assignment | 0 / 0 | 0 / 0 |
| Changed gameplay presentation layout | 5 / 3.899 | 5 / 5.073 |
| No JavaScript caller stack | 192 / 166.565 | 200 / 173.198 |
| Total style ms per callback | 1.880 | 0.891 |

The earlier `batched` trace attributed 200 flushes / 178.072 ms to filter assignment.
That caller disappears in this implementation; no replacement per-frame forced
caller appears. Normal browser style work remains. Occasional gameplay layout
changes still flush, and the result does not imply zero style work or zero GC.
Trace GC wall time was 72.112 / 103.254 ms with different callback counts; this is
not allocation-rate or throughput A/B evidence.

## Correctness and limits

- Seven focused compositor/control tests, 72 assertions, pass. Editor typecheck
  and process policy pass. Previously passing unrelated suites were not rerun.
- Eight live strategy selections across two arenas, four desktop/narrow
  pause/resume-and-resize checks, and the actual canonical-game control/reset/
  menu-to-match flow completed. Screenshots were inspected outside timing.
- Eight manual-sequence captures form four within-strategy repeat pairs. Both
  rooftop pairs pass and all four rooftop images are identical across strategies.
  Both depot pairs fail despite identical gameplay snapshot hashes. Original
  differs at 9,052 pixels (0.863%, maximum channel delta 247); post-first differs
  at eight pixels (maximum delta 2). Depot original capture 2 exactly matches
  post-first capture 1. These facts do not establish depot repeatability or
  identify the cause. No retries replaced these failures.
- The initial verifier persisted failed parity but returned zero. Its reporting
  was corrected so future image failures exit nonzero, preserving their evidence.
  The earlier runner source and each phase's hash are saved; runtime code did not
  change between trace, verification and timing.
- All eight timing trials have valid focus, matching restored gameplay hashes,
  and zero dropped simulation time. The awake guard did not expire or suspect
  sleep and released after 351.95 seconds. All owned browsers were cleaned up.
  Optional local AI/demo endpoints returned recorded 404s; no page exceptions or
  unresolved managed-server errors were observed.

The common workload uses the existing frozen rooftop/depot project payloads,
1366×768, DPR approximately 1, resolution 100%, unchanged AA, all render/simulation
features on and rAF/VSync scheduling enabled. Chrome 154.0.8037.58 was visible,
focused and used NVIDIA RTX 4070 Laptop / ANGLE D3D11. Actual launch commands
include both extension-disable flags and an isolated profile. AC power, battery
saver off and the existing High performance scheme were observed; no GPU/OS
setting was changed. All conditions and power snapshots are saved per phase.

These fixture results cannot establish the full canonical city's performance.
Rooftop samples are all fighting; depot is 69.94% / 70.78% fighting, with normal
round-result frames retained. Changed positions count fighter root XYZ changes,
not all limb animation or physical presents. GPU durations/query validity, full
pose age, input latency and allocation-site attribution are unavailable in this
ordinary-playable lane. Browser style/layout counters include small CDP boundary
overhead. CPU wall durations can include scheduling/stalls; they do not by
themselves prove pure JavaScript execution time.

## Remaining gap

| Rank | Gap | Evidence / confidence |
| --- | --- | --- |
| 1 | Ordinary presentation preparation | Candidate median 7.15–7.75 ms already exceeds the entire 6.06-ms budget. Largest measured stage; high confidence in the stage, internal cost split unresolved. |
| 2 | Frame-tail and freshness limits | Candidate full CPU p95 15.85–17.40 ms; about 99% of intervals miss 6.06 ms, simulation remains about 60 steps/s, and repeated root positions increase. No useful 165 Hz result. |
| 3 | Deterministic presentation evidence | Depot repeatability fails in both strategies, including a large baseline mismatch. Snapshot equality alone does not certify identical presentation/resources/history. |

The redundant synchronous style work is reduced with high confidence. Required
simulation, changed-frame preparation, projections, validation and drawing still
execute. GPU work and transport were not isolated in this comparison. The largest
measured remaining stage is preparation; this is not a GPU-only diagnosis.

**One next implementation task:** split the ordinary playable's preparation
timing among frame sampling, gameplay presentation, and entity application, using
the existing bounded telemetry. That will identify which owner consumes the
remaining 7–8 ms before choosing the next optimization. Repair depot deterministic
presentation evidence before promoting any resulting candidate. This task ends
with this fix and its one bounded comparison.

## Evidence and reproduction

The common debug artifact is
`.local/engine-perf/hud-post-order-20261013/web`:

- HTML SHA256: `4303d78ff79905e0212ea06288942d9b20b69c115eacda3bfd41071d668aaff3`.
- Runtime SHA256: `a45f6e4bc694795ca37124c52b848eb98a135f4f822179c9f8470b84839f6bb8`.
- Readable functions and inline source maps remain enabled.
- [Source identity](../../../../../.local/engine-perf/hud-post-order-20261013/source.json),
  [focused checks](../../../../../.local/engine-perf/hud-post-order-20261013/checks.json),
  [trace results](../../../../../.local/engine-perf/hud-post-order-20261013/trace/results.json).
- [Analysis](../../../../../.local/engine-perf/hud-post-order-20261013/analysis.json),
  [raw trial index](../../../../../.local/engine-perf/hud-post-order-20261013/timing/results.json),
  [recommended configuration](../../../../../.local/engine-perf/hud-post-order-20261013/recommended.json),
  [validation and cleanup](../../../../../.local/engine-perf/hud-post-order-20261013/validation.json),
  [image differences](../../../../../.local/engine-perf/hud-post-order-20261013/image-differences.json).

The managed game URL is `http://127.0.0.1:8797/game/`. Use **Game settings →
Performance → Experimental match controls → HUD layout work → Post-processing
before HUD writes**, or
`__hyperfocusPlayable.performance.setHudLayout('post-first')`.

Reuse the artifact, selecting a new output directory to preserve completed data:

```powershell
$env:PERF_HUD_ROOT = '.local/engine-perf/hud-post-order-20261013'
$env:PERF_HUD_OUTPUT = '.local/engine-perf/hud-post-order-repro'
$env:PERF_HUD_CONTROL = 'original'
$env:PERF_HUD_CANDIDATE = 'post-first'
$env:PERF_URL = 'http://127.0.0.1:8797/game/'
bun.cmd spikes/persistent-world-worker/lab/runner/playable-hud.ts verify
bun.cmd spikes/persistent-world-worker/lab/runner/playable-hud.ts timing
bun.cmd spikes/persistent-world-worker/lab/runner/playable-hud-analysis.ts .local/engine-perf/hud-post-order-repro
```

The saved verification has a known depot failure. A nonzero `verify` exit is a
failed correctness gate; a subsequent timing invocation can only be diagnostic,
not promotion evidence.

`ui` exercises the actual canonical game controls and menu-to-fight transition.
`trace` is a separate untimed lane; caller attribution needs
`PERF_TRACE_CATEGORIES=toplevel,devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.stack`.
Do not run image capture, tracing, builds or tests during throughput measurement.
