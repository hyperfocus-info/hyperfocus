# Ordinary playable HUD layout audit — October 13, 2026

This follows the [user Chrome profile](touch-of-death-chrome-profile-audit.md).
The subsequent [post-processing order audit](touch-of-death-post-order-audit.md)
tests the specific forced-style-flush fix identified here.
It changes the ordinary inline playable's HUD layout path, using the existing
lab's browser, focus, awake and trace owners. It does not alter the simulation,
worker transport, rendering workload or GPU/OS configuration.

**Keep the original default.** The completed candidate removes repeated DOM work
but fails the full-loop performance gate in both arenas. It remains an explicit
diagnostic option. No 165 Hz or fresh-motion improvement is established.

## Change and comparison

The `batched` HUD strategy measures canvas geometry into one borrowed record,
uses the existing changed-write fighter bars and visible-only reticle, and passes
that geometry to the renderer's existing `cssWidth`/`cssHeight` inputs and to
Canvas2D post-processing. Menu transitions remeasure after layout changes;
geometry is not cached across frames. Projections, entity scans, resource checks,
simulation and drawing continue. The original strategy remains selectable.

The first implementation omitted renderer/post-processing consumers. Its eight
ABBA trials showed no promotion-worthy gain: rooftop callback rate +1.03%
(controls varied 2.94%), depot −4.77% (candidate spread 13.45%). Rooftop changed
fighter-position rate fell 0.37%; depot fell 2.39%. Submission-stage medians
increased from 1.40 to 2.25 ms and 1.00 to 1.90 ms respectively. This was not a
successful frame-rate optimization. The downstream readers were subsequently
included in the same strategy; the original results remain saved.

[Initial analysis](../../../../../.local/engine-perf/hud-layout-20261013/analysis.json),
[initial trials](../../../../../.local/engine-perf/hud-layout-20261013/timing/results.json),
[initial diagnostic traces](../../../../../.local/engine-perf/hud-layout-20261013/trace/results.json).
The initial trace captured no JavaScript caller stacks, so source inspection and
stage timings support the relocation explanation; it is not a measured caller
attribution. The initial runner source is retained with that evidence.

## Final results

Arithmetic means of two trial statistics, not pooled percentiles. These eight
trials use the corrected common artifact; they are not pooled with the first
implementation's eight trials or the four short diagnostic traces.

| Arena / HUD | Steps/s | Changed positions/s | Callbacks/s | Interval p50 / p95 / p99, ms | >6.06 ms | Repeated positions |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Rooftop original | 59.92 | 40.31 | 70.70 | 12.20 / 18.30 / 24.25 | 99.22% | 42.90% |
| Rooftop batched | 59.95 | 38.69 | 64.65 | 15.15 / 21.35 / 27.30 | 99.62% | 39.95% |
| Depot original | 59.88 | 48.55 | 65.42 | 13.50 / 18.40 / 24.30 | 99.62% | 25.67% |
| Depot batched | 59.89 | 46.88 | 63.43 | 15.20 / 21.55 / 26.05 | 99.29% | 25.95% |

| Arena / HUD | Full callback CPU p50 / p95 / p99, ms | Simulation p50 / p95, ms | Presentation p50 / p95, ms | Compile + submit p50 / p95, ms |
| --- | --- | --- | --- | --- |
| Rooftop original | 12.00 / 16.70 / 20.45 | 1.45 / 4.95 | 7.95 / 9.80 | 1.40 / 1.85 |
| Rooftop batched | 13.30 / 19.40 / 25.95 | 1.60 / 5.75 | 8.00 / 10.90 | 1.50 / 2.05 |
| Depot original | 13.25 / 16.80 / 21.80 | 1.90 / 4.35 | 9.05 / 11.35 | 1.00 / 1.20 |
| Depot batched | 13.60 / 19.80 / 22.90 | 1.90 / 5.80 | 8.50 / 11.20 | 1.05 / 1.30 |

Rooftop callback change is **−8.56%**, changed-position rate **−4.03%**;
depot is **−3.04% / −3.45%**. Full-callback p95 worsens 16.17% and 17.86%.
Control callback spreads are only 0.30% and 0.36%; candidate spreads are 11.94%
and 11.02%. Candidate variability remains unexplained. Stable bookend controls
do not explain it as simple baseline drift, but two candidate trials cannot
establish its exact cause. Neither arena supports promotion. No repeats were
added to select a more favorable result. Simulation dropped-time counters are
zero. Depot is 69.6% fighting in controls versus 73.0% in candidates; remaining
samples are normal round-result frames, another limit on exact work matching.

## Work removed and the remaining flush

| Per callback | Original | Batched | What still executes |
| --- | ---: | ---: | --- |
| Geometry reads: viewport, bars, reticle, renderer, post | 16 | 4 | One live measurement; menu/layout changes still remeasure |
| Hidden-reticle reads / position writes | 4 / 2 | 0 / 0 | Visible reticles still position normally |
| Fighter-bar text setters | 4 | 0.017–0.021 | Changed names/values still update |
| Fighter-bar attribute setters | 35.00–35.07 | 3.17–3.32 | Live DOM comparisons and changed setters |
| Fighter-bar style setters | 24 | 5.34–6.04 | Projection and changing bar positions |
| Fighter-bar entity visits, roof / depot | 7,838 / 7,834 | 7,838 / 7,834 | Existing scans unchanged |
| Projection calls | 12 | 12 | Required positioning unchanged |
| Browser style events, roof / depot | 4.09 / 4.07 | 2.07 / 2.04 | Style invalidation/resolution still happens |
| Browser style ms, roof / depot | 1.56 / 1.59 | 1.63 / 1.57 | No meaningful total style-time reduction |
| Browser layout ms, roof / depot | 0.134 / 0.134 | 0.052 / 0.056 | Real layout work decreased |

Sampled draw means remain approximately 914–915 rooftop and 571–573 depot. There
is no drawing ablation, hidden actor optimization, simulation removal or resource
validation bypass. The candidate keeps one geometry record and bounded existing
DOM style caches. It does not remove gameplay frame allocation/copying.

The final three-second traces include caller stacks. The original viewport read
forces style **166 times / 145.983 ms**; hidden-reticle positioning forces it
**166 / 24.200 ms**, and post-process geometry **166 / 21.778 ms**. All three
caller groups disappear in the candidate. However, the candidate's
`drawGameplayPostProcess3D` **`context.filter` assignment forces style 200 times /
178.072 ms (0.890 ms/callback)**. Its compiled line 56284 was checked against the
exact saved artifact. Moving geometry reads did not eliminate the underlying
invalidation: a later Canvas2D operation resolves it. Another 137.409 ms has no
caller stack. These diagnostic runs have different callback counts and profiling
overhead; their cadence is not a performance win.

GC also remains: diagnostic GC wall unions are 72.041 / 115.650 ms over about
three seconds, with 1,047 / 1,227 MiB cumulatively reclaimed by minor GC. These
are different diagnostic runs, not an allocation A/B result or RAM traffic.
Neither the allocating functions nor retained-heap growth is established here.

## Supported gaps and decision

| Rank | Gap | Evidence / confidence |
| --- | --- | --- |
| 1 | Ordinary presentation/preparation | Baseline medians 7.95 / 9.05 ms exceed the entire 6.06-ms budget. High confidence in the expensive stage; its remaining per-function allocation/copy/scan split needs attribution. |
| 2 | DOM invalidation and Canvas2D filter resolution | Fewer setters and reads did not remove total style time; final stack identifies the remaining 0.890-ms forced flush. High confidence in the caller, not in a proposed optimization's gain. |
| 3 | Allocation pressure and tails | Frequent minor GC remains in diagnostic traces. Moderate confidence in pressure; no allocation-site measurement or proven leak. |
| 4 | Renderer/GPU | CPU compile/submission remains around 1.0–1.4 ms median here. NVIDIA RTX 4070 Laptop GPU via ANGLE/D3D11 is observed. Actual GPU execution duration and native waiting remain unmeasured. |

The busy main-thread path is sufficient to prevent useful 165 Hz motion in this
workload. GPU use is confirmed, but this does not distinguish every native wait
from CPU execution or rule out additional GPU limits. Redundant HUD work exists;
removing it alone was not a useful-motion win. Physics, AI, preparation,
resource checks and full rendering remain required and enabled.

**One next implementation task:** remove the ordinary frame's remaining
post-processing-triggered style flush by placing Canvas2D filtering before HUD
DOM mutations, with an explicit fallback when a menu transition changes canvas
geometry. Preserve the pixel passes and validate full-loop timing; merely moving
the flush to another caller is not success. This is the next concrete redundant
work opportunity, not a claim that it fixes the larger presentation cost.

## Saved evidence and verification

- [Analysis and trace caller summaries](../../../../../.local/engine-perf/hud-layout-20261013/final/analysis.json),
  [raw timing index](../../../../../.local/engine-perf/hud-layout-20261013/final/timing/results.json)
  and adjacent per-trial JSON files contain all retained samples/effective settings.
- [Configuration](../../../../../.local/engine-perf/hud-layout-20261013/final/recommended.json),
  [source/artifact plan](../../../../../.local/engine-perf/hud-layout-20261013/final/timing/plan.json),
  [environment](../../../../../.local/engine-perf/hud-layout-20261013/final/timing/environment.json)
  and [awake receipt](../../../../../.local/engine-perf/hud-layout-20261013/final/timing/wake.json).
- [Untimed transition/resize evidence](../../../../../.local/engine-perf/hud-layout-20261013/final/verify/results.json),
  [actual control and canonical-game flow](../../../../../.local/engine-perf/hud-layout-20261013/final/ui-complete/report.json),
  [diagnostic trace receipts](../../../../../.local/engine-perf/hud-layout-20261013/final/trace/results.json)
  and [validation/cleanup](../../../../../.local/engine-perf/hud-layout-20261013/final/validation.json).

27 focused automated tests pass (258 assertions, four files), including exact DOM
parity, geometry movement/resizing, hidden/revealed reticles and live strategy
changes. Editor typecheck and process policy pass. Runtime checks exercise both
arenas, 1366/390 widths, pause/resume, renderer/post/bar alignment, real selector
changes, reset and a canonical-game match. Screenshots were inspected untimed;
these are not exact image-repeat pairs. No renderer version is promoted.

All 16 timing trials completed, with matching restored checkpoint hashes,
passing focus checks, no suspected sleep and released guards. Owned browsers
were cleaned up; the shared managed server stays running. Known optional host
endpoints (`tod-demo.json`, `tod-ai-policy`, `tod-ai-ingestion-receipts`) return
404 in this export and are recorded. Two UI probes initially used an incorrect
exact Back selector; the completed probe uses actual visible controls. An initial
test invocation omitted the root DOM preload; the corrected root invocation
passed. These setup failures are not counted as passing checks or timing trials.

## Method and limits

Each implementation has one common debug artifact containing both strategies;
each comparison is serial A/B/B/A in rooftop and depot, with 5 seconds warmup
and 10 seconds measurement. Every trial reloads the presentation and restores
the same seeded checkpoint. Restored snapshot hashes must match across controls.
The ordinary current runtime uses the existing frozen `roof-compact-714` and
`depot-2026` arena payloads, not the current canonical project's full city. The
plan records each derived HTML and checkpoint hash. These timings cannot be
compared directly to the user's original 30 FPS profile as an optimization gain.

Viewport is 1366×768, DPR approximately 1, resolution 100%, all simulation and
rendering controls enabled, default AA unchanged, VSync scheduling enabled.
Chrome is visible and focused, with a bounded awake guard and both extension
disable flags. Actual command lines, browser version, GPU identity, power state,
effective settings and focus receipts accompany raw samples. No traces, image
capture, build or tests run during throughput measurement.

Callback rate counts CPU submissions, not physical presents. Changed-position
rate compares fighter root XYZ coordinates; it excludes limb animation and is
not a full visual-pose metric. Fixed-step rate is reported separately. Depot's
ten-second window includes normal round-result gameplay, retained in the raw
phase counts. This is a HUD comparison, not 165 Hz gameplay acceptance.

Browser style/layout counters are CDP boundary differences with small boundary
overhead. They are not equivalent to instrumented DOM setter counts. CPU stages
and browser durations overlap; do not add them. GPU execution/query validity,
input latency, full visual pose age and allocation-site attribution are not
measured in this ordinary-playable lane. AC power, battery saver off and the
existing High performance scheme were observed; boundary GPU temperature/clock
snapshots do not establish continuous thermal or throttling behavior.

## Reproduction

The [playable controls](../../../../../apps/engine-editor/docs/playable-performance.md)
own the UI and command API. The original remains the default; `batched` is an
explicit local experiment. The managed game URL after this rebuild is
`http://127.0.0.1:8797/game/`.

From the repository root, reuse the artifact and write a new evidence directory:

```powershell
$env:PERF_HUD_ROOT = '.local/engine-perf/hud-layout-20261013/final'
$env:PERF_HUD_OUTPUT = '.local/engine-perf/hud-layout-repro'
$env:PERF_URL = 'http://127.0.0.1:8797/game/'
bun.cmd spikes/persistent-world-worker/lab/runner/playable-hud.ts timing
bun.cmd spikes/persistent-world-worker/lab/runner/playable-hud-analysis.ts .local/engine-perf/hud-layout-repro
```

`verify` is an untimed live-transition/resize lane. `trace` records two bounded
three-second diagnostics; do not combine their timings with throughput results.
The exporter and [managed restart procedure](../../../../../apps/engine-editor/scripts/touch-of-death-music/README.md)
own rebuilding/serving. No personal browser profile or global setting is changed.
