# October 8: preparation baseline and preceding seeded audit

**165 FPS is not yet achieved.** The engine now fixes a demonstrated ragdoll
collision-budget defect. Fresh depot/rooftop comparisons show essentially unchanged
combat throughput, around 82–91 FPS in the fixed viewport. The next performance
work still targets repeated worker preparation and GPU time at playing resolution.

## Latest implementation slice

The [promoted CCD correction](october-8-ccd-budget.md)
records the sufficient-budget reference, all-seed correctness and reproduction.
Distant scenery no longer exhausts the detailed collision-test budget. All 10,800
per-tick physical/combat comparisons and six final snapshots match the reference,
with zero overflows. Detached diagnostics now expose the separate KO world. The
correction is the unconditional engine default for inline and worker consumers.

The shortcut for repeated endpoint normalization was rejected and removed after
passing fixture, six-seed and normal-quality browser parity. Its stable two-arena
A/B/B/A changes combat FPS by −0.87% and +0.73%; modest KO gains do not meet the
general promotion threshold. The latest slice completes sixteen focused trials,
39,970 frames and zero dropped simulation time. Dismissing Windows Search resolved
the earlier foreground blocker; no focus checks were relaxed. The linked slice
owns the new timing tables, tails, input ages and between-block drift. The remaining
measurements below belong to the preceding, pre-correction campaign.

## Decision and scope

Keep normal-game worker ownership opt-in. Neither new optimization is promoted;
the environment/wheel/HUD selection and retained WebGL attribute-state changes
were reversed from production source, with isolated builds and exact patches
retained for later experiments. Keep the profiling tools, seeded workload/report
support and optional engine presentation-stage observer. Previous input-routing,
scheduler and outline decisions are unchanged; see the
[preceding audit](october-8-window-input-outlines.md).

Three parallel investigations covered workload/physics, presentation ownership,
and browser/image repeatability. All timing ran serially in focused visible
Chrome windows, with no concurrent audit builds/tests. The campaign completed
**24 unprofiled 30-second trials, 57,651 frames**, plus separate diagnostics and
correctness probes. All accepted trials pass focus, state-reset, runtime-error,
row-capacity and process-cleanup checks; none drops simulation time. There are
21 intervals ≥33 ms, none ≥100 ms, and a 52.3 ms maximum.

Reference: i9-13900HX, RTX 4070 Laptop via ANGLE/D3D11, Chrome 154.0.8037.58,
AC power, battery saver off, High performance plan, other user workloads active.
Twelve seconds warmup precede exact checkpoint restore; full services, two transfer
buffers, paced fresh-input scheduling and VSync off remain fixed. FPS counts
fresh CPU submissions, not physical scanout. CPU thermals, thread residency and
continuous OEM/VRR policy remain unrecorded.

## Arena coverage and native resolution

The [seeded baseline](october-8-seeded-workloads.md) owns the
six-arena table, recipes, phase coverage and physics findings. The generator has
three structural arrangements: six seeds produce five unique project payloads
and six different starting geometries. Both level-nine AIs attack under ordinary
health and first-to-three rules; deterministic preparation covers eight natural
KOs and six recoveries. Three of six baseline control pairs exceed 5% FPS spread.
Do not compare this workload directly with the prior idle-human/AI 98.5 FPS result.

A separate native-window cohort repeats depot/roof/roof/depot at **2561×1398
backing pixels, DPR 1.5**, on the 2560×1600/165 Hz display. This is a maximized
browser workload, not fullscreen or a pure resolution-only A/B: aspect and culling
also change. Values below are medians of complete per-trial fighting statistics.

| Native workload | Combat FPS | Interval p95 / p99 | Repeat spread |
| --- | ---: | ---: | ---: |
| Depot | 77.90 | 17.30 / 21.40 ms | 7.37% — unstable |
| Compact rooftop | 86.65 | 14.90 / 18.80 ms | 2.92% |

## Small optimization experiments

Each row below is its own serial control/candidate/candidate/control block on
identical depot source, project and checkpoint. Control pairs must remain local
to their block; pooling all four controls conceals drift between experiments.

| Change | Control → candidate combat FPS | Gain | Control spread | Interval p95 / p99, control → candidate |
| --- | ---: | ---: | ---: | --- |
| Bind environment, wheel and HUD dependencies | 83.01 → 86.24 | 3.89% | 5.38% | 16.30 / 19.60 → 15.60 / 18.95 ms |
| Retain immutable matrix attribute state in mesh VAOs | 79.37 → 80.34 | 1.22% | 0.44% | 18.45 / 24.40 → 18.25 / 23.00 ms |

Selection removes proven unrelated lookups, but its control fails stability and
its median gain is below the declared roughly 5% full-loop threshold. VAO reuse
reduces median main draw time from 5.0 to 4.3 ms; throughput barely changes because
the worker remains limiting here. Retest it after worker preparation improves.
Applied-input-age p95 changes 23.75→23.55 ms and 24.20→23.90 ms respectively.
These are software ages in AI fights, not new human key-to-photon measurements.
Neither change meets the complete promotion gate; no default was changed.

The combined candidate matches full state, numeric packets and compact presentation
through 1,441 samples per realm, with 2,882 standalone state-oracle checks. All six
AA-off captures are pixel-exact through combat, KO and recovery. Default quality
and the existing pixel threshold remain unchanged; this exact diagnostic does not
close the default-MSAA image gate.

## Where work and spikes originate

The [marked native traces](october-8-native-critical-path.md)
separate elapsed stalls from thread CPU time and clip collection to explicit
measurement marks. These instrumented runs are attribution, not acceptance FPS.

- **Repeated presentation:** earlier named profiles measure zero-step worker
  jobs at 7.65–8.40 ms and one-step jobs at 9.56–10.46 ms. Obstructions cost
  about 1.5 ms, frame application 1.5–1.9 ms, and primitive plus directed fighter
  presentation about 1.6–1.7 ms. Detached sampling copies offscreen records before
  final camera/cutaway decisions. Removing all sampling/application would save
  at most 2.08–2.63 ms in these profiles; dynamic work prevents attaining that bound.
- **Allocation pressure:** marked worker GC spans occupy about 4.4% of each
  ten-second window, with 208–224 minor collections. This supports reducing
  repeated allocation. It does not explain every long presentation interval.
- **Catch-up:** the roof trace's largest interval is 26.7 ms; current worker work
  is 25.6 ms, including 17.6 ms for two simulation steps. Delivery is only 0.5 ms.
- **Submission stalls:** construction's 35.5 ms interval follows a 33.3 ms draw.
  Its main task spends 35.4 ms elapsed but only 5.9 ms thread CPU, with no main GC;
  an overlapping GPU-process task also spends little CPU time. This proves a
  non-running interval, but cannot distinguish graphics waiting from OS descheduling.
- **Hidden KO physics:** the preceding campaign exhausted the separate ragdoll
  world's CCD candidate budget in every seed, while main-world telemetry omitted
  its constraints and approximately 459 scenery colliders. The latest slice above
  repairs that budget accounting and exposes the missing owner; broader historical
  player-clipping attribution remains unproved.
- **GPU:** native rooftop renderer queries measure 7.29 ms median, 9.95 ms p95,
  already beyond 6.06 ms before post-processing/compositing. Construction fighting
  is 5.54 ms median, 8.02 ms p95. Worker and GPU improvements are both required;
  overlapping CPU/GPU durations must not be added as one serial budget.

## Why repeats vary

Same-seed phase transitions agree by fixed service step. Four different presentation
cadences produce identical snapshots across 600 steps, and different warmup lengths
followed by checkpoint restore produce identical continuations. Different seeds
have different hitstop histories; their ending world ticks are not a parity test.
Ending snapshots now precede slow native probes and report their in-flight lag.

Image variation is separately isolated to the **multisampled WebGL path**: the same
packet redrawn in one inline world can differ, dithering off does not fix it, and
all 20 AA-off diagnostic comparisons are exact. This is independent of worker
state; a particular driver defect is not established. The browser can follow
165 Hz in the idle cadence probe. See
[browser repeatability](october-8-browser-repeatability.md).

Residual timing drift remains unresolved. Identical power settings and state do
not imply identical scheduling, JIT/heap state, GPU waiting or background activity.
The former 450–500 ms delivery stalls did not recur in these accepted trials.
Keep unstable controls and trace evidence visible rather than filtering bad frames.

## Implementation sequence and verification

The [165 FPS implementation plan](../../touch-of-death-165-plan.md) defines owners,
compatibility contracts, upper bounds and acceptance gates. The corrected KO path
has completed its windowed comparison. Next remove duplicate cutaway validation
and unnecessary render-state capture, build an owned frame session with explicit changed channels,
and compare incremental presentation with bounded interpolation. Measure main/GPU
passes alongside that work. More workers, shared memory or WASM only follow measured
remaining batches, including their synchronization costs. Extra buffers do not
create useful motion or remove input age.

The latest retained code passes focused tests and engine/spike typechecks; package
build, external-consumer smoke, process policy and source structure pass. The
preceding campaign's frozen diagnostics/refactor comparison passed 2,882 state-oracle
checks, packet/presentation parity and six pixel-exact AA-off captures. The latest
slice above owns verification of the corrected graph. Process cleanup and shared-server logs
are clean. Current bundle limits remain open and were not raised; the
[CCD slice](october-8-ccd-budget.md#windowed-verification-and-remaining-gates)
owns the updated package totals. Worker rollout still needs native
minimize/restore, feature coverage, package budgets and sustained input/graphics
verification described in the preceding audit; this study is not a release.

Raw commands, frozen sources, manifests, rows, profiles, images, failures and cleanup
receipts are retained under `.local/engine-perf/worker-arena-campaign-20261008/`.
The [spike README](../../../../../../../spikes/persistent-world-worker/README.md) owns
reproduction. The shared managed playable was not rebuilt or replaced.
