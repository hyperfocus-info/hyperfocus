# October 9: preparation after frozen and changing inputs

**Repeated preparation remains expensive even when almost nothing changes.**
This diagnostic extends the existing scene-ceiling probe; it does not change the
game or establish an end-to-end speedup. Raw rows, eight CPU profiles, source
graphs, structural counts and receipts live in
`.local/engine-perf/preparation-20261009/{depot,roof}/`.

## Experiment and results

Each arena ran frozen/changing/changing/frozen preparation, 30 warm-up and 120
measured iterations per operation. The changing case repeats the same 30-tick
combat segment; simulation, checkpoint reset and full-state validation occur
outside the preparation timer. All 480 measured changing preparations preserve
authoritative state, and repeated segment endpoints match. Frozen endpoints also
preserve state. Chrome was visible and focused, RTX 4070, normal AA, 1920 by 998
backing at DPR 1.5.

This is the **standalone presentation adapter**, including its full snapshot,
with named identifiers, wrapper clocks and CPU sampling enabled. The worker uses
a narrower presentation snapshot. These durations therefore do not replace the
worker baseline or quantify instrumentation overhead. Snapshot validation creates
allocations outside the timer that can still affect GC inside it.

| Diagnostic operation | Depot trial means (ms) | Rooftop trial means (ms) |
| --- | ---: | ---: |
| Complete frozen preparation | 8.02–8.21 | 7.45–8.31 |
| Complete changing preparation | 7.66–8.03 | 7.19–7.39 |
| Native presentation, including obstructions and child presenters | 4.02–4.28 | 3.43–3.99 |
| Obstructions, included above | 1.99–2.19 | 1.41–1.70 |
| Entity application | 0.92–0.98 | 0.65–0.74 |
| Material application | 0.57–0.63 | 0.90–1.06 |
| Directed fighter presentation | 0.76–0.92 | 0.81–0.88 |
| Sampling / full snapshot | 0.61–0.70 / 0.64–0.71 | 0.64–0.75 / 0.59–0.78 |

Ranges describe two trials per input mode in one browser per arena, not confidence
intervals. Parent and child durations overlap. Wrapped self time excludes only
other explicitly wrapped operations; it includes unwrapped callees and wrapper
overhead. CPU profile weights identify `anyTargetIntersects`, entity equality
checks (`sameVector2`, `sameRotation`), material checks (`sameLook`, `matchesScene`),
capture and directed followers. Profiles also include warm-up, simulation and
validation; GC sample weights are not allocation rates or pure preparation cost.

Separate structural runs find:

| Per frozen preparation | Depot | Rooftop |
| --- | ---: | ---: |
| Sampled entities / materials | 3,389 / 1,717 | 3,391 / 1,702 |
| `setInstancePresentation` calls | 3,389 | 3,391 |
| Repeated visibility setters | 572 | 572 |
| World-matrix updates | 0 | 0 |
| Obstruction candidates / target-ray tests | 1,972 / 61,023 | 1,951 / 33,461 |

Over 30 advancing frames, there are 101,670 / 101,730 instance-presentation calls
but only 1 / 48 material-update calls. The material applicator still visits every
input and checks live packed storage. This supports a **medium-confidence** target:
reduce traversal, equality checks and repeated queries through valid invalidation.
It does not prove all these calls are unnecessary when animation, resources or
external writes change. No incremental candidate or library boundary is selected
from these timings alone.

The runner's retained `opaque-solid` image ablation differs substantially from
the normal image (maximum channel delta 121 / 180). It is a separate visual
removal diagnostic, not a passing image-parity result for an optimization. All
previously failed visual candidates remain failed.

## Invalidation requirements for the next prototype

The [pipeline writer map](../../touch-of-death-frame-pipeline.md) remains the
owner for restore/load and cross-thread ownership. The narrow prototype must
separate these dependencies:

| Work | Inputs that must invalidate it |
| --- | --- |
| Entity application | Membership, transform/visibility/appearance values, mesh/material binding, animation/rig data, and live scene writes from simulation or restore. |
| Material application | Complete look and alpha mode, texture identity/load/replacement, binding changes, and direct packed material/texture/flag writes. |
| Obstructions and cutaway fades | Final camera/aspect, fighter roots and articulated limbs, occluder transform/membership, weapons/supports, material groups, fade history/time, and restore/reset. |
| Sampling and presentation | Authoritative state, timeline/frame time, viewport/camera, appearance settings, effects and resource readiness. Equal simulation tick alone is insufficient. |

Existing entity/material caches deliberately compare against live scene arrays.
A version-only skip cannot preserve that contract unless every writer participates
or an explicitly unversioned path retains validation. First test the protocol with
the real standalone and worker consumers, lifecycle/resource/teleport cases and
exact state/packet checks. Then require the existing production-AA gate and stable
paired end-to-end improvement. The [control study](october-9-cadence-and-controls.md)
has not yet established stable controls.

## Reproduction

Build `spikes/scene-ceiling/build.ts` with `PERF_PROFILE=1`, a separate `PERF_ROOT`,
the matching provenance-v2 `PERF_FROZEN_SOURCES` and `PERF_BASE_HTML`. Run
`spikes/scene-ceiling/run.ts` with `PERF_LANE=cpu`,
`PERF_MODES=prepare-stages,prepare-changing-stages`, `PERF_REPEATS=2`,
`PERF_ITERATIONS=120`, `PERF_PREPARE_TICKS=0`, `PERF_NATIVE_VIEWPORT=1`,
`PERF_EXPECT_RENDERER=RTX 4070`, `PERF_POWER=1`, `PERF_REQUIRE_AC=1`,
`PERF_HEADLESS=0` and the matching arena `PERF_WORKLOAD`. The saved plans pin the
source hash and all inputs. Run the separate `structure` lane with profiling off,
then `report.ts` and `verify.ts` with `PERF_REPORTS=stage-profile,structure`.

Verification: ten complete diagnostic cases, 960 preparation samples, four clean
browser shutdowns and no runtime/focus errors. These short segments do not cover
skinned crowds, dense collision, sufficient-budget KO, resource loading, long-term
memory/thermal drift or all six arenas.
