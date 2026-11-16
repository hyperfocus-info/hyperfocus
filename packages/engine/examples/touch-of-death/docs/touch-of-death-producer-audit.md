# Producer audit — October 11

**Presentation and scene application dominate this producer, not physics alone.**
An implemented axis-aligned ray strategy removes all target quaternion transforms
in these workloads. Rooftop changed-pose rate improves 8.34% in one ABBA block;
depot's 1.81% difference is drift-inconclusive. Neither arena establishes a total
producer CPU improvement. Keep the strategy experimental; no configuration is
promoted across both arenas.

Evidence root: `.local/engine-perf/touch-of-death-lab/producer-work/`.
[Analysis](../../../../../.local/engine-perf/touch-of-death-lab/producer-work/analysis.json),
[source audit](../../../../../.local/engine-perf/touch-of-death-lab/producer-work/source-audit.json),
[configuration and URL](../../../../../.local/engine-perf/touch-of-death-lab/producer-work/delivery.json).

## Completed scope

- 24 serial screen trials: simulation frozen, VFX off, obstruction-query cache;
  ABBA in rooftop and depot. One rooftop VFX trial lost focus, invalidating that
  comparison. No retry or discarded outlier.
- One separate 10-second depot CPU sampling diagnostic, using the existing
  profiler. Its samples are attribution, not throughput measurements.
- One implemented candidate, then eight serial ABBA trials. All eight pass
  focus/configuration/viewport/runtime checks. All 9,102 GPU queries are valid;
  zero invalid/disjoint queries. Screen queries: 27,121 valid, including its
  focus-invalid trial. Wake guards did not expire or detect sleep and were released.
- Final-artifact untimed verification: eight seeded executions, 22 paired
  control/candidate checkpoints, equal gameplay snapshots, evaluated frames,
  interpolation repeats, compiled packets and query/resource work. These are
  correctness observations, separate from timing and image repeatability.

Both timing phases use 5 seconds warmup, a fresh seeded world/history reset, then
10 seconds measurement. One visible focused owned Chrome runs at a time. Camera,
1366×768 viewport, DPR approximately 1, scale 1, 4×MSAA, original renderer, 60 Hz
producer selection, two buffers, interpolation delay and input scheduling stay
fixed. Environment receipts record actual browser flags, RTX 4070 Laptop/ANGLE
D3D11, AC and power policy. Thermal clocks and other user workload are not controlled.
No tracing, images, builds or tests run inside throughput measurements. All owned
browsers are cleaned up; the shared managed server remains running without errors.

Screen artifact: `e228914b3751f5184c60f88111d3932d196aae2bd857d1a1acebb9ede8baa720`.
Final artifact: `863dbb35cc8e3807f5e210331c6d569d621e29b3422aeea52b8c29bbefd0a0c5`.
Each contains both compared configurations. Both are archived under
`.local/engine-perf/touch-of-death-lab/artifacts/`. Final source changes are the
ray owner, new engine primitive, registry and rebuilt runtime embedding; renderer
sources are unchanged. Do not pool timings across artifact identities.

## What the switches established

Values are means of two trial statistics, not pooled percentiles.

| Contrast | Rooftop producer p50 | Depot producer p50 | Actual work and interpretation |
| --- | ---: | ---: | --- |
| Simulation frozen | 10.05 → 8.50 ms | 12.30 → 8.75 ms | Fixed steps become zero; AI, combat and physics stop. Presentation, application, transport and drawing continue. Zero fresh poses: diagnostic bound only. |
| VFX off | 9.85 → 9.40 ms | 11.20 → 11.20 ms | Five instrumented VFX writers/publication become zero; particle sampling and authored effect geometry are gated. Fighting animation, simulation and obstructions remain. Rooftop comparison invalid from focus loss; depot provides no CPU gain. Changes the image. |
| Query cache | 10.25 → 10.05 ms | 11.70 → 12.05 ms | Underlying queries/publication 45.1 → 37.2 and 228.6 → 155.4; about 18%/32% cache hits. Target signatures, broadphase, fading and material application remain. Both CPU and fresh-motion effects are drift-inconclusive. |

The frozen scene still costs 8.5–8.75 ms to produce. This rules out simulation
alone as the explanation. The separate profile attributes 0.501 seconds of
sampled self time to the ray kernel in a 10.34-second sampled window, 1.259 seconds
inclusive to frame application, and 2.540 seconds inclusive to gameplay
presentation. Inclusive rows overlap. This justified removing repeated identity
transforms; it did not establish that rays explain the entire producer cost.

## Implemented optimization and current timings

Lab control: baseline plus `publication: "compact", workingFrame: "reuse"`.
Candidate: the same configuration plus `rays: "axis-aligned"`. The original
full-object lab baseline remains available. This comparison does not remeasure
the earlier compact-publication or reuse gains.

| Arena/config | Steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | Repeats | Pose age p50 |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Rooftop control | 59.82 | 44.28 | 110.37 | 8.75 / 11.80 / 15.30 | 59.67% | 30.65 ms |
| Rooftop candidate | 59.86 | 47.97 | 115.47 | 8.45 / 11.25 / 13.80 | 58.28% | 30.40 ms |
| Depot control | 59.86 | 45.87 | 115.48 | 8.50 / 11.30 / 13.60 | 60.07% | 29.35 ms |
| Depot candidate | 59.84 | 46.70 | 114.69 | 8.55 / 11.20 / 14.35 | 59.10% | 29.45 ms |

Every final trial has a **100% missed-6.06-ms submission interval rate**. Rooftop
fresh-motion effect +8.34% exceeds control spread 0.008% and candidate spread
1.20%. Depot +1.81% is below control spread 3.96%; candidate spread is 11.35%.
Depot's p99 submission interval worsens. These short blocks do not establish a
stable, general fresh-motion improvement or a physical display refresh rate.

| Median stage, ms | Rooftop control → candidate | Depot control → candidate |
| --- | ---: | ---: |
| Producer compute | 10.85 → 10.95 | 11.10 → 11.00 |
| Simulation | 1.90 → 1.95 | 2.10 → 2.10 |
| Presentation, including sampling and snapshots | 6.05 → 6.10 | 6.45 → 6.30 |
| Obstructions, nested in presentation | 1.50 → 1.60 | 2.20 → 2.10 |
| Apply frame | 2.45 → 2.45 | 2.35 → 2.35 |
| Compile commands | 0.35 → 0.30 | 0.30 → 0.30 |
| Endpoint packing | 0.60 → 0.60 | 0.50 → 0.55 |
| Worker posting | 0.65 → 0.60 | 0.60 → 0.60 |
| Main publication (publication rows only) | 0.70 → 0.70 | 0.80 → 0.70 |
| Endpoint decoding, nested in publication | 0.50 → 0.50 | 0.60 → 0.55 |
| Display preparation | 2.75 → 2.60 | 2.70 → 2.70 |
| GL submission | 2.35 → 2.20 | 2.00 → 2.00 |
| Input wait | 5.85 → 5.15 | 4.85 → 4.90 |
| GPU p50 / p95 / p99 | 5.04 / 6.86 / 7.74 → 4.80 / 6.20 / 6.86 | 3.86 / 5.46 / 6.28 → 3.95 / 5.82 / 6.80 |

Input-age proxy medians: 31.95 → 31.60 ms rooftop, 31.30 → 31.45 ms depot.
The existing `computeMs` ends after command/packet preparation. Its subsequent
metadata duration is 0.95 → 1.00 ms rooftop and 0.90 → 0.85 ms depot and **includes**
endpoint packing and diagnostic work; do not add that packing time again.
Input waiting, message delivery and GPU execution are separate from producer CPU
execution; never add overlapping durations. Submission rates are not physical
presents. A cached or frozen scene does not demonstrate 165 Hz gameplay.

At paired 1-second checkpoints, target tests remain 17,567 rooftop / 61,392 depot
while quaternion transforms become zero. Timed candidate transform counts are
also zero; target slab tests, query counts, fading and resource validation remain.
Each publication still visits 3,391/3,389 entities and checks 1,702/1,717 materials.
The candidate removes no frame copies, uploads or draws. Logical copied bytes
remain 1,505,196/1,510,816 per publication, including packet and packed endpoint;
these are not measured RAM traffic. Both paths retain two publications and one
interpolation destination, with zero working-frame/publication object clones.
The primitive retains counters only, with no per-query arrays, target copies,
frame references or result cache. No allocation profiler or cache-miss measurement
was taken; heap snapshots alone do not prove allocation rate.

## Engine control, recommendation and limits

```ts
import { createTargetRayQuery3D } from '@hyperfocus/engine/experimental/target-rays';
const query = createTargetRayQuery3D({ strategy: 'axis-aligned', diagnostics: true });
// query.test(localEye, worldTargets, prefixCount, box, padding)
// query.work counts queries, tests, transforms and fallbacks; reset clears them.
```

Selection happens before the target loop. Rotated and exceptional inputs use the
general quaternion path. [The engine contract](../../../docs/developer-performance.md)
owns borrowed-input lifetime and segment semantics. No SIMD, SoA conversion,
additional threads or new Wasm kernel was added. Existing Wasm/SoA experiments
remain unported; this result does not claim they cannot help.

Use [the diagnostic candidate](../../../../../.local/engine-perf/touch-of-death-lab/producer-work/diagnostic-candidate.json)
to inspect the work reduction. Keep
[the prior reuse reference](../../../../../.local/engine-perf/touch-of-death-lab/producer-work/recommended-reference.json)
as the recommendation; neither compact publication nor the new ray option gains
cross-arena promotion here. Final exact image repeats fail in 3/4 pairs: rooftop
control 0 changed pixels, candidate 13; depot control 27, candidate 28; maximum
channel difference 2/255. Structural parity does not waive this existing MSAA
acceptance failure. Preliminary verification belongs to its earlier artifact;
`verification-final/` owns the delivered result.

Focused numerical/registry tests pass (8 tests, 96,485 assertions), scoped
typecheck and public compatibility pass. Package build and installed-consumer
verification exercise the optional engine import. The bundle-size gate remains
failed; exact native, rebundled, compressed and aggregate costs are saved in
`bundle-sizes.json`. The new optional entry has its own 3,200-byte raw budget;
it measures 2,854 raw / 1,098 gzip / 941 Brotli bytes, identically 2,854 bytes in
the native and rebundled graphs. Normal physics and the existing experimental
entry stay within their individual budgets. The complete runtime aggregate is
10,478 raw bytes over its unchanged ceiling; other listed entries also fail.
Existing ceilings were not increased. No release or default-enable claim follows.

## Remaining bottlenecks

| Rank | Evidence | Confidence and next implication |
| --- | --- | --- |
| 1. Presentation/application CPU | About 6.1–6.3 ms presentation plus 2.35–2.45 ms apply in separate producer stages; ray specialization barely changes total compute. | High that this prevents a 6.06-ms producer; the next removable portion is not yet established. |
| 2. Display preparation and scheduling | About 2.6–2.7 ms preparation on every display; roughly 58–59% repeated poses, 4.9–5.2 ms input waits and publication rates below 60/s. | High observed cost; waits are not CPU self time. Extra worker threads do not automatically remove these dependencies. |
| 3. GPU/submission tails | GPU p99 6.80–6.86 ms in candidate; GL submission about 2–2.2 ms. | Real additional constraint. Producer optimization alone cannot establish useful 165 Hz motion. |

The subsequent [entity application audit](touch-of-death-entity-application-audit.md)
implements and measures that next task. Owned input revisions remove 88–90% of
full transform comparisons, but retain input/live-storage scans and fail to
improve fresh motion across both arenas. Keep original application selected;
the follow-up owns current timings and the remaining gap.

Reproduce the candidate comparison using the existing artifact and a fresh output:

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase producer-optimization --output .local/engine-perf/touch-of-death-lab/producer-repro
```

The managed lab is `http://127.0.0.1:8807/lab/`. Its panel, URL and command API use
the same `rays` registry option. `delivery.json` contains the configured URL.
No additional performance phase starts automatically.
