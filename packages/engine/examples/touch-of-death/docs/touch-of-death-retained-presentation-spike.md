# Retained presentation spike — 2026-10-14

**Keep the existing lab presentation path. No executor qualifies for promotion.**
The numeric output contract works and reproduces the original MSAA image, but
this adapter moves work into publication and retains too much surrounding work.
It does not establish a JavaScript or Wasm winner for an end-to-end resident engine.

The [implementation/contract](../../../../../spikes/persistent-world-worker/retained-presentation/README.md)
contains typed-array JS, scalar f64 Wasm, f64x2 SIMD, and persistent one/two-worker
executors in one artifact. No engine public API, production default or deployment
was changed. The representative subset is rigid root scenery/traffic with fixed
rotation across an endpoint pair; fighters, articulated/rotating records and
unsupported variants use the original path.

## Measurement and identity

- Final artifact: `.local/engine-perf/retained-slice-20261014/artifact6/index.html`,
  SHA-256 `c525ba24cf4594527120e52a8fdb5f9338e265c04780cce02dfad29525e52a9e`.
  Frozen sources, worker source and manifest accompany it. All timed variants use
  this artifact. A later numeric TypeScript accumulator annotation produces
  identical transpiled runtime code; its receipt is saved.
- Existing ordinary-playable lab and managed server; maximized street checkpoint,
  seed 1337, 1280×665 CSS pixels, DPR 1.5, 1920×998 drawing buffer, production
  MSAA, RTX 4070 Laptop GPU through ANGLE/D3D11. All rendering/gameplay features
  stay enabled. Existing compact producer transport, three producer buffers,
  owned render sampling, 60 Hz producer and 16.667 ms interpolation delay remain.
- Five serial A/B/B/A comparisons, 5 s warmup and 10 s measurement per trial.
  Each trial reloads and restores the checkpoint/presentation history after
  warmup. 24 trials recorded: one complete block excluded after its opening
  control lost focus to Steam; one replacement gives **20 usable trials**.
  Only that control was flagged invalid; its three companions are also excluded
  to preserve complete A/B/B/A comparisons.
  No further repeats or combination campaign. The replacement SIMD block is
  drift-inconclusive despite passing focus checks.
- All usable trials were visible/focused; awake guards released with no suspected
  sleep. 29,153 asynchronous GPU queries valid, 11 still pending in saved windows,
  zero reported invalid/disjoint results. No readback, images, profiling, builds
  or tests ran inside throughput windows. Fourteen final-run browser cleanup
  receipts show no surviving owned browsers. The shared server remains running;
  its managed error list is empty. Browser logs retain expected offline 404s for
  demo/policy/ingestion endpoints.

GPU queries cover WebGL renderer passes; Canvas2D/compositor GPU work is not
separately timed. The reference display mode is 165 Hz, not proof of scanout cadence.

Numbers below average the two trial statistics, including quantiles. They are
not pooled percentiles. Variation is `(max-min)/mean` of the two motion rates.
The available motion metric is **changed fighter-root positions**, not complete
skeletal-pose freshness. Submissions are not measured physical presents.

## Paired full-frame results

| Control → candidate | Changed roots/s | Submissions/s | Main wall p95, ms | Main wall p99, ms | Motion variation A / B | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Original → retained JS | 67.86 → 61.87 | 140.66 → 144.02 | 8.27 → 8.56 | 9.46 → 10.08 | 3.96% / 8.20% | Motion −8.82%; worse tails. Reject promotion. |
| JS → scalar Wasm | 61.93 → 64.57 | 146.69 → 148.42 | 8.59 → 8.46 | 9.68 → 9.71 | 3.21% / 3.25% | Small +4.26% motion signal; below the roughly 5% promotion bar, little tail change. |
| Scalar → SIMD, replacement | 58.82 → 63.67 | 143.54 → 148.36 | 8.47 → 8.35 | 9.62 → 9.70 | 15.02% / 2.99% | +8.25% can be explained by control drift. Inconclusive. |
| SIMD → one worker | 63.71 → 63.79 | 148.45 → 145.96 | 8.41 → 8.51 | 9.83 → 9.43 | 0.65% / 0.71% | No motion gain; adds subset latency. |
| One → two workers | 59.07 → 61.97 | 143.25 → 147.01 | 8.58 → 8.43 | 9.73 → 9.93 | 8.88% / 1.43% | +4.91% is drift-inconclusive; p99 worsens. |

Each row is its own paired comparison. The rows must not be chained into an
assumed aggregate gain or treated as simultaneous measurements of six versions.

The original-versus-JS block exposes the cost of this retained adapter:

| Metric | Original | Retained JS |
| --- | ---: | ---: |
| Fixed simulation steps/s | 59.87 | 59.82 |
| Interval p50 / p95 / p99, ms | 6.07 / 12.14 / 12.27 | 6.07 / 12.13 / 12.24 |
| Intervals >1000/165 ms | 55.87% | 54.99% |
| Repeated fighter-root poses | 51.72% | 57.03% |
| Display preparation p50 / p95, ms | 2.38 / 5.47 | 1.67 / 5.72 |
| Publication p50 / p95, ms, when publishing | 0.67 / 0.99 | 1.81 / 2.45 |
| Pose age at submission p50 / p95, ms | 27.25 / 38.22 | 27.27 / 43.31 |
| Input-sample age proxy p50 / p95, ms | 31.84 / 42.80 | 31.63 / 45.72 |
| Asynchronous GPU p50 / p95 / p99, ms | 2.10 / 3.42 / 4.52 | 1.97 / 3.57 / 4.72 |

The strict interval threshold counts ordinary ~6.07 ms callbacks too; it is not
a dropped-refresh estimate. The ~12.13 ms p95 interval is the clearer cadence
failure. Input age is a proxy, not input-to-photon latency. CPU/main-wall, worker
and GPU durations overlap and are not added.

## What work actually changed

| Boundary | Removed / retained work and measured cost |
| --- | --- |
| Numeric application | At the checkpoint, 2,612 of 3,420 records leave the per-entity TRS application path; 808 remain. Runtime ownership varies to accommodate rotating records. Only changed/active rows run: nonempty batches have ~216–217 rows median, ~266 p95. Owned executors construct no entity objects. |
| JS / scalar / SIMD execution | Nonempty batches, including list preparation, take about 0.015 / 0.015 / 0.0125 ms median in their adjacent comparisons. The 0.005 ms all-display median includes zero-work displays and is **not** the active-kernel cost. These durations approach the observed 0.005 ms clock granularity. |
| Publication adapter | Processes all 3,420 input slots per publication, in addition to identity checking and owned-count reduction. It still resolves handles and recomputes the rotation basis on every publication. ~259–278 MB of logical retained-input writes per ten-second trial. This adds ~1.14 ms median publication cost versus the original. |
| Renderer consumption | Direct numeric matrices are copied into a retained renderer command buffer: ~0.17 ms median, ~0.47–0.52 ms p95. No owned object frame is reconstructed. But 3,992 membership slots and ~2,612 resource checks remain each display; the original material path still visits 1,724 materials. |
| Command reconstruction | Serial variants rebuild about 242–258 times per trial, copying ~89–95 MB of command storage. Shared-worker variants rebuild 570–610 times, ~210–224 MB. Publication stages current IDs/visibility into the legacy scene; delayed output then reapplies sampled state. This duplicated ownership is an implementation cost, not a Wasm requirement. |
| Shared CPU transport | One shared input/output slot is shared by both workers. It avoids per-worker input replication, but main→shared copies remain (~365–385 MB per trial), as do completed output-row copies (~9–11 MB). Main dispatch/poll work on nonempty batches rises to ~0.09–0.095 ms median. |
| GPU path | Still two instance-matrix upload calls per display, roughly 151–162 KiB median and 234 KiB p95; measured upload CPU wall time ~0.020 ms median / 0.030 ms p95. Shared CPU memory is not shared GPU storage. Logical upload/copy bytes are not measured RAM traffic or cache misses. |

Cumulative copy counts are approximate first-to-last-sample deltas, excluding
the first measured display. Publication input visits count its processing loop;
the additional identity scan and owned-count reduction are not folded into that counter.

The existing decoded endpoints and working object frame remain outside the
numeric executor. The fallback applicator borrows a reused shell. This is a
resident **slice**, not an end-to-end object-free producer/display pipeline.

Worker completion makes the distinction between compute and latency concrete:

| Actual completed jobs, one → two workers | Median, ms | p95, ms | p99, ms |
| --- | ---: | ---: | ---: |
| Slowest worker's numeric execution | 0.0149 → 0.0100 | 0.0200 → 0.0151 | 0.0325 → 0.0300 |
| Dispatch to last worker finishing | 0.0626 → 0.1024 | 0.1499 → 0.1799 | 0.2001 → 0.2499 |
| Last completion to display consumption | 5.83 → 5.61 | 10.32 → 10.15 | 12.22 → 11.13 |

Two workers reduce numeric execution while making last-worker completion slower.
Consumption currently polls at the next display; that latency is a property of
this implementation, not an unavoidable property of Wasm. Moving retained
geometry lags its requested sample by ~17.6–18.0 ms at p95 and ~19.2–20.8 ms at
p99. The lag statistic is conditioned on active motion: an old timestamp for a
stationary batch is not counted as stale moving geometry. Workers use counted
serial bootstrap/ownership fallbacks (15–34 displays per trial), never block the
main thread, and discard stale generations. No busy-slot backpressure was
observed. The shader/upload work still executes.

## Memory, parity and limits

Seventeen focused numeric/registry tests passed. The Wasm module is 1,534 bytes;
saved WAT/binary identity verifies f64x2 multiply/add/subtract/extract instructions.
No f64→f32 precision relaxation was introduced; rounding matches the existing
renderer boundaries. This is Wasm instruction inspection, not host assembly inspection.

On the final artifact, twelve untimed oracle captures cover two repeats of all
six paths. All match one gameplay snapshot and the same production-MSAA canvas
image (PNG-data-URL SHA-256 `e86a4c7609459d768c10927cb786cd3fbccfa6d500874acc4af033834c065e06`), with
identical checkpoint draw work. Two additional probes verify stale in-flight
job rejection and non-isolated serial fallback. Worker image checks flush jobs
outside timing; they do not prove equal real-time latency. These are checkpoint
canvas checks, not exhaustive gameplay-state or DOM-HUD parity coverage.

Three explicit-GC samples after three seconds of resumed gameplay each, plus an
initial post-warmup sample, were collected separately for every variant:

| Mode | Fixed additional numeric storage | Main post-GC heap, first → last | Sampled main allocations over the lane |
| --- | ---: | ---: | ---: |
| Original | — | 45.36 → 48.69 MiB | 2,111 MiB |
| JS | 1,664,024 bytes | 45.79 → 50.66 MiB | 2,430 MiB |
| Scalar Wasm | 1,664,024 bytes | 45.61 → 50.50 MiB | 2,505 MiB |
| SIMD | 1,664,024 bytes | 45.76 → 50.56 MiB | 2,387 MiB |
| One worker | 2,778,136 bytes | 45.67 → 50.71 MiB | 2,402 MiB |
| Two workers | 2,778,136 bytes | 45.94 → 50.75 MiB | 2,141 MiB |

Fixed store sizes did not grow. Each presentation worker's post-GC JS heap stayed
at ~0.272 MiB. The existing producer heap grew from ~28.69 to ~33.37 MiB in every
mode. Main/producer histories and diagnostics remain; this short run does **not**
establish whole-engine memory stability or prove a leak. Allocation samples
include collected objects and paused inspection; they are estimates, not exact
bytes or throughput rankings.

The largest sampled main allocation site is the existing HUD entity-filter path
in `apps/engine-editor/src/scene3d/fight-hud/fighter-bars.ts`, ~859 MiB in the
original profile and ~967 MiB in JS. This slice does not change that path.
The JS adapter also adds ~144 MiB attributed to publication and ~101 MiB under
`writeBasis`/`Math.hypot`. An allocation-free Wasm inner loop therefore does not
make this surrounding pipeline allocation-free. No HUD experiment was added.

Production `https://tod.hyperfocus.info/` returned 200 without COOP/COEP on the
saved check. Shared-worker measurements use isolation headers only in the owned
lab route. Without isolation, requested worker mode explicitly reports serial
SIMD plus the fallback reason. Third-party/embedding isolation compatibility,
general scene topology mutation, arbitrary external transform writers, complete
resource-epoch recovery and long-duration memory stability remain unproven.

An early development artifact lost accumulated dirty rows before its first
sample and failed image parity. That failure remains saved; pending dirty rows
now accumulate until accepted, and final multi-publication/reset probes pass.

## Recommendation and next task

The renderer can consume this numeric output cheaply enough to continue the
design, but the **whole retained owner is not yet cheap enough to promote**.
The strongest supported problem in this slice is duplicated publication and
scene maintenance. This result does not show that a fully resident Wasm producer
would lose to JavaScript: normalization, handle resolution, decoding, materials,
HUD and most producer work are still outside the measured numeric executor.

The broader ceiling remains substantial: the control producer has **11.35 /
17.62 / 19.90 ms** wall p50/p95/p99; its obstruction stage alone is **2.61 /
3.08 / 3.51 ms**. Input waiting (4.24 ms median), message delivery (4.11 ms) and
buffer waiting (0 ms) are separate from execution. Display p95 is still above
the 6.06 ms budget while GPU p95 is ~3.4 ms. This is primarily a CPU preparation,
publication and scheduling problem in this workload, not evidence of a GPU-only
limit. It does not prove useful 165 Hz gameplay.

**One next implementation task:** remove the duplicated publication adapter for
this same rigid subset. Give it one tracked writer/epoch contract: retain
unchanged rotation bases and resource bindings, write only dirty endpoint lanes,
and commit sampled visibility/material membership once when output is adopted.
Keep resource-liveness checks and the checked fallback. This directly targets
the added 1.14 ms publication cost, repeated allocations and worker command
rebuilds. Keep all executors behind the same contract and require the same
full-frame gates before selecting a backend or moving broader authority to Wasm.
The subsequently authorized [publication follow-up](touch-of-death-retained-publication-audit.md)
implements and measures this task. Its results do not retroactively change the
initial artifact or measurements above.

Use [recommended.json](../../../../../.local/engine-perf/retained-slice-20261014/recommended.json)
to retain the original **native-lab** path; this is not a production worker-mode
promotion. Exact configurations are in
[configurations.json](../../../../../.local/engine-perf/retained-slice-20261014/configurations.json).
The [audit data](../../../../../.local/engine-perf/retained-slice-20261014/audit.json)
links the comparisons, images, memory evidence and excluded block. Raw trials
and both analyses remain under that directory's `measured/` and `replacement/`.
The [implementation README](../../../../../spikes/persistent-world-worker/retained-presentation/README.md#reproduce)
contains commands for exact artifact replay and rebuilding. No default change,
deployment, additional architecture experiment or further timing run followed.
