# October 8, 2026: seeded arena baseline and knockout physics

Six seeded arenas with native level-nine AI on both sides measured **81–92
fighting FPS**, below the 165 FPS target. Three controls exceeded the 5% repeat
spread threshold. A separate correctness probe found that every arena's first
natural knockout exhausts a ragdoll CCD budget omitted from current frame
telemetry. This investigation establishes baseline and physics findings only;
it does not establish a candidate improvement or default promotion.

## Workload and controls

The [workload preparer](../../../../../../../spikes/persistent-world-worker/prepare-arena-workloads.ts)
uses the exact frozen artifact runtime, authored city generator, native theater
mode, ordinary health, and first-to-three rules. The six recipes cover five city
districts plus a compact rooftop with density .25 and hazard frequency 2. Seeds
are 0, 713, 930, 2026, 4294967295, and 714; saved match indices are 0–5. The
authored structural generator rotates three arrangements, so different seeds
can produce identical project bytes. These recipes produce five unique projects
and six distinct effective starting geometries, recorded by hashes.

Each checkpoint was replayed twice for 1,800 fixed steps with identical end
snapshots. Both fighters attack; the six trajectories produce 192 damage events,
eight knockouts, and six recoveries. No match finishes within that window.

The baseline runs six arenas forward and then in reverse: twelve serial,
30-second foreground Chrome trials, twelve seconds warmup, followed by exact
checkpoint restore. Conditions are 1366 × 768, DPR 1, RTX 4070 Laptop through
ANGLE/D3D11, AC power, battery saver off, High performance plan, full services,
two transfer buffers, paced-pipeline scheduling, and VSync off. Other user
workloads remain active. No concurrent builds, tests, or profiling run during
accepted timing.

All twelve trials pass source/workload identity, restored-state equality,
foreground ownership, document visibility, runtime-error, retained-row-capacity,
and owned-process cleanup checks. The [campaign reporter](../../../../../../../spikes/persistent-world-worker/campaign-results.ts)
keeps every trial and groups repeats only when artifact, project, checkpoint,
renderer, dimensions/DPR, scheduling, services, VSync, and instrumentation match.
Profiled and native-resolution measurements remain separate.

| Arena | Fighting FPS | Interval p95 | Interval p99 | Paired FPS spread |
| --- | ---: | ---: | ---: | ---: |
| Construction | 91.82 | 14.80 ms | 18.25 ms | 6.82% |
| Market | 81.00 | 16.25 ms | 19.85 ms | 7.79% |
| Residential | 81.96 | 16.90 ms | 22.40 ms | 5.24% |
| Depot | 80.66 | 16.55 ms | 19.60 ms | 2.49% |
| Utility | 85.96 | 14.95 ms | 17.95 ms | 4.69% |
| Compact rooftop | 86.93 | 15.35 ms | 20.00 ms | 0.88% |

Values are medians of per-trial fighting statistics, without pooling frames
across seeds. The first three controls cannot support a small promotion claim.
Across all phases, 29,263 rows contain 2,364 intervals ≥16 ms, eleven ≥33 ms,
none ≥100 ms, and a 49.70 ms maximum. There is no dropped simulation time.
Zero-step worker compute p50 is 7.75–9.40 ms across arena groups: presentation
work alone already exceeds the 6.06 ms deadline, so physics improvements cannot
by themselves reach 165 FPS.

Boundary receipts show unchanged power settings and GPU temperature rising
approximately 62→69 C. Later construction, market, and residential repeats slow
down, but boundary clock/temperature probes cannot prove throttling or identify
the cause. Retain run order and controls when evaluating subsequent changes.

## Repeatability and clock interpretation

Each trial covers 1,798–1,800 fixed service steps. Same-seed phase onsets agree
at service-step positions: construction 420/810, market 221/611/1613,
residential 1155/1553, utility 545/935/1419, and rooftop 1071/1485. Depot
knockout is 831 in both repeats. Recovery is observed at 1221 in one and 1222
in the other, whose two-step job skips the intermediate presentation; both
previous rows show round-result at step 1220/world tick 973. This is consistent
with the same transition, not evidence of trajectory divergence.

The first presented world tick is 2. Producer frame serials include warmup
presentation work and are not simulation clocks. Final presented world-tick
differences within pairs correspond to zero or one fewer covered service steps.
Post-measurement snapshot requests return states another 120–168 world ticks
later; those snapshots cannot establish parity at a common 30-second endpoint.
Use fixed-step captures for image comparisons. The reporter preserves phase
onset brackets and post-window snapshot lag explicitly.

## What CCD counters actually measure

The audited source files match the frozen control byte-for-byte.
[CCD candidate traversal](../../../../../src/physics/rigid-3d-operations.ts)
scans all capacity slots per moving continuous body. `ccdTests` increments after
collision-mask/trigger eligibility but before the
[conservative swept-bounds test](../../../../../src/physics/rigid/ccd-bounds.ts).
Thus main-world counts 919/917 are eligible pair checks, not that many detailed
casts. Even rejected pairs normalize endpoint rotations and update bounds to
preserve existing numerical behavior.

Discrete contacts already use a sorted-X broadphase. The existing
[`queryAabb` primitive](../../../../../src/physics/rigid-3d-api.ts) still scans
all capacity slots; calling it alone does not remove linear scaling. These
physics costs concern approximately 461 collision bodies, not all 3,389 visual
entities. Tests, angular tests, and contact candidate counts reset per step;
CCD hits and overflow counters accumulate and need deltas for event attribution.

The [knockout owner](../../../../../src/project/3d/combat-knockout/index.ts)
creates a separate world containing every non-fighter scene collider. Ordinary
arenas clone 459 colliders into capacity 479; each corpse adds ten continuous
bodies and eighteen constraints with twelve constraint iterations. Every active
step synchronizes all collider positions, rotations, and masks, then advances
this world. Current frame physics telemetry reads only the main runtime, so its
zero constraint count omits this solver.

Public-checkpoint probes of all six frozen workloads confirm saturation at the
first natural knockout: five worlds report 3,832 CCD tests, rooftop 3,824, all
with eighteen constraints and four accumulated overflow events after two world
steps. A longer construction probe records 782 overflow events by corpse-world
step 391, immediately before recovery.

The [default budget](../../../../../src/physics/rigid-3d.ts) is `capacity * 8`
eligible checks per world step. Ten moving corpse bodies against 459 eligible
scenery bodies require more than that. Eight complete traversals consume 3,672
checks; the ninth runs out partway through and the tenth has no remaining
budget. Each overflow event means one body's candidate loop breaks because the
global budget is exhausted. It is **not a proven missed collision**; discrete
contacts still run. This is a reproducible collision-coverage risk, but the
probe does not establish that it caused the reported player clipping.

## Next bounded physics experiment

1. Add diagnostic attribution for each physics world: eligible checks, bounds
   rejects, narrow entries, overflow deltas, angular work, constraints, and
   collider synchronization. Keep fine timing instrumentation out of baseline
   controls.
2. Establish a knockout reference with enough candidate budget to cover every
   continuous body. Compare a conservative swept-candidate broadphase in the
   engine primitive against that reference. Charging only plausible candidates
   to the expensive-work budget is an explicit semantic change, not a silent
   counter adjustment. An already-truncated reference cannot establish complete
   collision correctness.
3. Test fast corpses against thin floors/walls, rotating boxes, approaching
   traffic, moving platforms, mask changes, two simultaneous corpses, distant
   clutter scaling, and reset/restore. Require coverage for late-insertion body
   handles, no unexplained overflow, and matching collision outcomes against the
   adequate-budget reference. Preserve stable candidate order and account for
   quaternion rounding when judging state parity.
4. Run serial foreground A/B/B/A with stable identical controls. Judge fighting
   and knockout intervals separately, including p95/p99, input age, and fixed-step
   state/image parity. Keep presentation and GPU improvements as independent
   experiments because the zero-step producer already exceeds the frame budget.

Raw evidence uses repository-relative paths under
`.local/engine-perf/worker-arena-campaign-20261008/`:

- `workloads/manifest.json`: recipes, source/project/checkpoint/geometry hashes,
  scene counts, and deterministic replay receipts.
- `seeded-control-plan.json` and `seeded-control-*-worker-2-fresh.json`:
  declared sequence, complete rows, environment, focus, and cleanup receipts.
- `seeded-control-campaign-results.json`: all twelve trial summaries, repeated
  controls, stage/step/phase partitions, and spike neighborhoods.
- `knockout-six-seed-probe.json`: first natural knockout counters for every seed.
- `knockout-physics-probe.json`: construction corpse lifetime counters and
  frozen/current source equality checks.

Preparation/reporting validation: seven focused tests, 45 assertions, and the
campaign TypeScript check pass. No production physics or default changes were
made in this investigation.
