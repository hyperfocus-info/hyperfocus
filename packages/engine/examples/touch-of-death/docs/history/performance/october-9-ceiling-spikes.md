# October 9 ceiling spikes

This campaign separates browser cadence, cached rendering, fresh engine updates
and complete combat. The [audit](../../touch-of-death-performance-audit.md) owns
the current conclusion; the [plan](../../touch-of-death-165-plan.md) owns the
remaining experiment sequence. Results below do not establish an absolute ceiling.

## Environment and control

Visible, focused Chrome on the i9-13900HX / RTX 4070 Laptop GPU machine, AC power,
battery saver off. Native backing size was 2561×1398 at DPR 1.5; parity captures
use 1366×768. Request the high-performance adapter and verify the actual renderer:
an automatic-selection parity attempt selected Intel UHD and was rejected.
Existing desktop work stayed running. CPU thermals and core residency are unknown.

Raw evidence: `.local/engine-perf/ceiling-20261009/`. Its `sources.json` freezes the
retained implementation. The control executable hashes match the preceding audit:
main `490cbfcafd8a3dac1e80dffb12d2c0040aaa1c0f1865b6f35442c0b049df0119`, worker
`cbefdd41edc81dd3a78df4a6f3311088e077151bfb7e95c484cb0e4eb2d754ae`.
Private response interception preserves the shared playable.

## Browser and cached-render bounds

Four mirrored repetitions, native viewport, normal AA. Generic floor cases used
3 seconds warmup and 10 seconds measurement; arena ablations used 1.5 and 4 seconds.
These cases redraw prepared commands without advancing gameplay.

| Workload | Median trial FPS | GPU p50 / p95, ms |
| --- | ---: | ---: |
| Minimal engine page, no draw | 165.06 | — |
| One cached cube | 165.01 | 0.11 / 1.66 |
| 3,420 cached cubes, 64 materials | 165.06 | 0.26 / 1.32 |
| Depot, culled camera/light commands | 165.06 | 2.09 / 4.65 |
| Depot, same with real post/HUD | 165.06 | 2.12 / 4.71 |
| Rooftop, culled camera/light commands | 165.06 | 2.86 / 4.80 |
| Rooftop, same with real post/HUD | 161.56 | 3.04 / 5.80 |

The generic fixture includes toon outlines but excludes shadows, post and HUD.
GPU queries exclude Canvas2D and compositing. CPU, GPU and nested stage durations
overlap; do not add them. Capped 165 Hz results establish headroom only for the
measured workload, not a maximum processing rate.

Removing shadows lowered arena GPU medians to 1.01/1.42 ms; half resolution to
1.48/2.18 ms. Removing outlines changed less. None is an accepted quality change.
The current worker submits a full scene; the normal renderer uses separate culled
views. This difference motivates the packet-camera experiment below.

## Live control and stall evidence

`baseline-native` ran depot/roof/roof/depot with 12 seconds warmup, exact reset,
30 seconds measurement and full services. Combat medians were 74.26 and 76.35 FPS.
Depot control spread was 10.44%, so its comparison is unstable; rooftop spread was
1.91%. The identical executable rules out a source change as the explanation for
the slower session, but does not identify the environmental cause.

`phase-trace-native` collected separate main/worker CPU profiles through fighting
and round result. Maximum intervals were 35.0/46.6 ms; it did not reproduce the
earlier 300 ms delivery stall. Expanded trace export timed out, leaving empty trace
files. CPU profiles remain usable with CDP-window clipping, but cannot establish
message-stall causality or precise marked-window GC occupancy.

Diagnostic mean worker computation was about 12.9 ms in both arenas. Native game
presentation accounted for 6.0/5.3 ms, sampling 0.92/0.99, snapshot 0.51/0.56,
directed presentation 1.09/1.21, application 1.64/1.70, and compilation/packet work
2.01/2.11. These instrumented means are attribution evidence, not acceptance FPS.
Sight queries, capture, GC, material batching and follower presentation appear in
worker profiles. GPU draw means were 6.05/7.87 ms before post/compositing.

After moving export before slow host probes and suspending the producer outside
the measurement window, `narrow-trace-native` exported data but exceeded the
128 MiB bound. Its partial trace lacks the end mark; it cannot establish complete
coverage or row attribution. The analyzer now tests for both marks and complete
data before aligning frame rows, with a regression test for a missing end mark.

`ko-trace-native` then captured a complete 49 MB, 8.002-second marked window after
12 seconds warmup, without reset: 128 fighting and 476 round-result submissions.
This is diagnostic phase coverage, not an acceptance FPS comparison. Worker GC
occupied 288.77 ms (3.61% of the window), main-thread GC 69.68 ms (0.87%). Reported
minor-GC heap reductions total about 438 MiB/s on the worker and 31 MiB/s on the
main thread; these are allocation-pressure proxies, not measured allocation rates.

One interior 25.90 ms frame interval follows a main draw of 23.20 ms. Its associated
main task spans 25.36 ms but records only 5.83 ms thread CPU and no overlapping GC;
the next packet's delivery delay is 18.40 ms. This identifies elapsed time outside
recorded execution, but not whether the cause is GPU/driver waiting or OS scheduling.
Another 35.70 ms interval includes 30.60 ms worker computation and GC in the wider
interval. A 197.20 ms first interval crosses the measurement boundary and contains
15-step catch-up and 66.97 ms dropped simulation time; profiling startup can perturb
it. This diagnostic is not an acceptance run or proof that the
earlier 300 ms uninstrumented stall recurred. That long-stall cause remains open.

## Current game stage removals

`scene-depot/cpu-current` and `scene-roof/cpu-current` use current frozen sources,
the matching initial checkpoint and no extra preparation ticks. Four mirrored
repetitions, 30 warmup / 120 measured operations; packet calls batch 32 operations
per sample. Preparation excludes simulation, command compilation and drawing.
These frozen-state removals are optimistic bounds, not gameplay improvements.

Median trial p50 / p95 in milliseconds:

| Operation | Depot | Rooftop |
| --- | ---: | ---: |
| Complete preparation | 6.20 / 8.91 | 5.70 / 8.00 |
| Without obstructions | 4.65 / 7.31 | 4.35 / 6.60 |
| Without directed fighter presentation | 5.70 / 8.36 | 5.15 / 7.60 |
| Without scene application | 4.73 / 6.75 | 4.35 / 6.20 |
| Apply unchanged frame | 0.80 / 0.90 | 0.80 / 0.90 |
| Apply all-changing opacity, including input construction | 3.45 / 4.21 | 3.30 / 3.95 |
| Compile static independent views | 0.30 / 0.40 | 0.40 / 0.50 |
| Packet write | 0.0125 / 0.0141 | 0.0109 / 0.0125 |
| Packet read | 0.0063 / 0.0078 | 0.0047 / 0.0063 |

Separate stage clocks put sampling near 0.5 ms, directed presentation near 0.5,
application at 1.4/1.3 and obstruction work at 1.7/1.2. Native presentation includes
obstructions and other children. Removal deltas and nested timings are not additive.
The simulation lane replays only 30 initial ticks, including authored hit stop;
its median does not represent sustained combat/KO physics. Stage quantiles cover
only rows where their clocks ran; reports retain coverage counts. Physics diagnostic
counters are last-step snapshots, not work deltas across skipped calls.

Structural checks confirm zero matrix recomputations for an unchanged frame, yet
application still makes 3,389/3,391 instance-presentation calls and 572 repeated
visibility writes. Obstructions test 61,023/33,461 rays in that frozen state.
Over 30 advancing depot frames, 101,670 presentation calls accompany only 5,337
matrix updates and one material update. Transform dirty tracking already exists;
the opportunity is avoiding repeated full preparation/application and query work.

## Public-engine CPU scaling

`generic/cpu-scaling`: 144 cases, four mirrored repetitions of three entity
counts × four changed fractions × three public API paths. Each case has 30 warmup
and 120 measured samples, eight operations per sample. Exact moving-command and
material tests cover the fixture; browser receipts also check matching output.
All cases retained focus and passed their checks.

Median trial p50 / p95 in milliseconds, 64 material handles (three repeating colors),
including compilation:

| Entities / changed | Full project | Partial frame | Direct scene |
| --- | ---: | ---: | ---: |
| 855 / 1% | 0.250 / 0.269 | 0.100 / 0.125 | 0.100 / 0.119 |
| 3,420 / 1% | 0.938 / 1.026 | 0.412 / 0.463 | 0.413 / 0.475 |
| 13,680 / 1% | 4.006 / 4.504 | 1.641 / 1.869 | 1.688 / 1.832 |
| 855 / 100% | 0.325 / 0.363 | 0.275 / 0.294 | 0.181 / 0.200 |
| 3,420 / 100% | 1.287 / 1.375 | 1.081 / 1.194 | 0.719 / 0.794 |
| 13,680 / 100% | 5.553 / 6.177 | 4.491 / 4.821 | 2.931 / 3.238 |

At zero changed entities, partial/direct compilation still takes about 0.10,
0.41 and 1.64–1.65 ms across those scene sizes. The compiler scans the instance
capacity and rebuilds its matrix stream. Sparse application avoids evaluation
work but does not make the complete path proportional to changed records.

These are exploratory capacity measurements, not an accepted production speedup.
Some repeated cases drift: 13,680-entity/1%-changed full project p50 ranges from
3.975 to 4.688 ms; the small-case timings also approach clock resolution. The
fixture's explicit changed list excludes the cost of discovering changes in a
game, and both independently constructed scene stores remain resident.

## Fresh generated scenes

`generic-live/fresh-native` prepares and draws a new frame on every callback, with
1% of cube poses changing. Four mirrored repetitions, native viewport, normal AA,
1.5-second warmup / 4-second measurement. It includes toon outlines and excludes
physics, skinning, shadows, post and HUD. Material handles cycle through three
colors, so this is a batching-cost sweep, not texture/shader diversity.

| Entities / material handles / path | FPS | CPU p50 / p95 | GPU p50 / p95 |
| --- | ---: | ---: | ---: |
| 3,420 / 64 / full project | 165.06 | 1.25 / 1.40 ms | 0.27 / 1.29 ms |
| 13,680 / 64 / full project | 164.68 | 5.00 / 5.65 ms | 0.49 / 0.56 ms |
| 20,000 / 64 / full project | 130.51 | 7.25 / 8.50 ms | 0.70 / 1.18 ms |
| 20,000 / 64 / partial frame | 165.06 | 2.95 / 3.15 ms | 0.70 / 0.93 ms |
| 20,000 / 64 / direct scene | 165.06 | 2.95 / 3.15 ms | 0.70 / 0.98 ms |
| 20,000 / 512 / direct scene | 165.06 | 3.80 / 4.15 ms | 2.58 / 4.39 ms |
| 20,000 / 2,048 / direct scene | 99.03 | 9.35 / 10.70 ms | 8.64 / 9.70 ms |
| 20,000 / 4,096 / direct scene | 53.18 | 18.50 / 19.75 ms | 17.42 / 18.53 ms |

One focus loss rejected the penultimate case. Its original receipt is archived;
the two remaining cases resumed in a separately identified owned-browser session
with matching configuration, artifact and graphics. All 48 accepted cases pass
verification. This is diagnostic scaling evidence, not an uninterrupted acceptance
cohort. The 20,000-entity full-project first pass was faster than its final median;
CPU thermals remain unknown. A 165 Hz-capped case is a capacity lower bound.

The independent `generic-capacity/capacity-native` sweep then increased direct-scene
load with 64 material handles and 1% changing, under the same short render protocol:

| Entities | FPS | CPU p50 / p95 | GPU p50 / p95 |
| --- | ---: | ---: | ---: |
| 20,000 | 165.06 | 2.20 / 2.45 ms | 0.63 / 1.05 ms |
| 30,000 | 164.94 | 3.60 / 4.05 ms | 0.80 / 1.30 ms |
| 40,000 | 164.56 | 4.85 / 5.20 ms | 0.90 / 1.39 ms |
| 60,000 | 140.01 | 7.05 / 7.55 ms | 1.26 / 2.43 ms |

This brackets the near-refresh capacity between 40,000 and 60,000 entities for
this simple scene and session. It does not establish a game capacity or sustainable
soak result. The 20,000-entity CPU cost differs from the earlier cohort; retain the
separate trials rather than treating that cross-session difference as a speedup.

## Packet camera experiment

The first candidate culls authoritative packet matrices into renderer-owned bounded
storage, preserving off-camera shadow casters without enlarging worker packets.
It also retained the unsorted original stream for shadows. Each owner replayed
1,441 depot frames; full states, numeric packets and presentation metadata matched
at all 11 retained checkpoints. All 2,882 standalone simulation-oracle checks
passed, including round result.

Normal-AA images failed the existing gate at frame 1,440: 17 changed pixels,
maximum channel difference 4 versus the allowed 3. Same-packet repeat captures
also showed smaller MSAA variation, but did not explain that failure. This variant
is not accepted. A narrower candidate retains the control's shadow draw order.
That candidate passed all 11 normal-AA image checkpoints (at most 8 pixels,
channel difference 2), with the same exact state/packet/oracle coverage.

`camera-cull-ordered-native` then screened it in a full-service native A/B/B/A:

| Depot combat metric | Control | Camera culling |
| --- | ---: | ---: |
| FPS | 83.05 | 90.19 (+8.6%) |
| Frame interval p95 / p99 | 17.00 / 20.70 ms | 14.80 / 18.50 ms |
| Main-thread time p50 / p95 | 4.80 / 8.65 ms | 3.65 / 4.50 ms |
| Applied input to submission p50 / p95 | 13.90 / 23.85 ms | 13.05 / 22.85 ms |

There were no simulation drops. Control drift was 4.82%, narrowly inside the 5%
gate; candidate drift was 3.52%. This is a passing depot screen, not six-arena
promotion evidence. Packet size and the worker's preparation algorithm are unchanged.

The subsequent camera-only rooftop replay passed state/packet checkpoints and all
2,882 simulation-oracle checks, but failed normal-AA images at frame 1,080:
39 pixels / maximum channel difference 4. Its timing was skipped. The archived
source graph matches depot's candidate; the rebuilt executable has its own recorded
hash. This candidate remains unpromoted despite the positive depot timing.

The subsequent `view-cull-ordered` candidate also filters the sorted shadow stream
against the light volume. Depot passed, but rooftop's normal-AA comparison failed
at frame 1,080 (53 pixels, channel difference 4), so its planned timing was skipped.
The rooftop raw-layer comparison passed at 54 pixels / difference 3; the control's
same-packet raw repeat differed by 54 pixels / 3 there. Separately, the candidate's
same-packet repeat at frame 60 differed by 25 pixels / 10. Those observations keep
raster/readback variation open; they do not waive the failed image gate.
With AA disabled, `view-cull-roof-aa-off` passed all 11 PNG and state/packet
checkpoint comparisons exactly, plus 2,882 standalone simulation checks.
The observed mismatch is specific to the normal-AA path in this replay; disabling
AA is a diagnostic, not an accepted quality change or permission to waive parity.

## Shadow draw merging

`shadow-batch` independently merges adjacent contiguous shadow ranges only when
mesh, flags, skeleton and effective opacity match. It retains primitive order;
colors and surface textures are not inputs to the existing shadow shader. Tests
cover incompatible opacity, overlapping ranges and unchanged input packets.

Depot passed the same 1,441-frame replay and 11 state/packet/image checkpoints
(maximum 13 pixels / channel difference 2). Rooftop state and packet parity passed, but
images failed at frame 720 (6 pixels / 7) and 1,080 (20 pixels / 4). The planned
two-arena timing was therefore skipped. Depot-only A/B/B/A measured 87.77 FPS
control versus 85.91 candidate, with control drift 6.17%; this is unstable and
shows no credible full-loop win. Do not promote shadow merging.

Independent rooftop control captures had equal state, packet and presentation
hashes and passed their initial-image comparison (at most 19 pixels / 2). Yet a
control's same-packet redraw at frame 1,440 differed by 48 pixels / 5; the shadow
candidate's repeat at 720 differed by 5 pixels / 6. Normal-AA repeat instability
can exceed the gate, but that does not explain away a candidate's initial-image
failure. All failed images and thresholds remain retained.
The working engine renderer, culling helpers and shadow pass were restored to the
pre-spike source snapshot. Prototype source and tests remain in the local evidence
archive; the private builder can resolve archived modules after their removal.

## Requested cadence versus changed presentation

`presentation-cadence-165` manually advances the unchanged depot control at
165 requested samples per simulated second for four seconds. Inline and worker
agree exactly at all five retained state/packet/presentation checkpoints and on
the change counts; 1,322 standalone simulation-oracle checks pass. This is a deterministic content
diagnostic, not measured real-time 165 FPS delivery.

Of 660 adjacent comparisons, 421 have no simulation step, 511 repeat the numeric
packet, and 399 (60.5%) repeat both packet and presentation metadata. Twenty-two
zero-step comparisons nevertheless change presentation. A separate field-level
replay reproduced those counts: **zero numeric packets changed without a step;
all 22 metadata changes were audio**. Metadata includes HUD,
effects and audio: a metadata change is not proof of visible motion. Conversely,
the complete repeats demonstrate that more submissions alone cannot establish
165 distinct visual updates. Hit stop and other authored stillness also remain
valid repeated images. This supports a narrow owner-local preparation-reuse spike
that drains audio independently and invalidates all relevant changes; it does not
establish a general mutable-frame cache. Interpolation still needs separate motion
and latency evidence.

## Owner-local zero-step reuse

`zero-step-source-patches.json` builds an archived private world-owner variant.
It retains one prepared frame, snapshot and command set only when no simulation
step occurred and viewport, pause and reduced-motion inputs still match. Every
world command invalidates it. Each request still drains audio and writes a fresh
packet with current clock/input metadata. This introduces no public mutable-frame
cache and changes no shared playable source.

`zero-step-<arena>-parity` compares 3,301 samples per owner at 165 requested samples
per simulated second, spanning 20 seconds and fighting/result phases. Full numeric
packet and presentation sequence hashes match control/candidate in both arenas;
13,204 per-frame simulation-oracle checks pass. Depot's 12 normal-AA checkpoints
pass (maximum 60 pixels / channel difference 3). Rooftop fails at frame 2,970 with
channel difference 4. The image gate remains unchanged.

`zero-step-invalidations` passes full sequence/oracle comparison for 661 samples.
All 11 scheduled viewport, reduced-motion, pause/resume and checkpoint-restore
events occur without a simulation step and force fresh preparation. The remaining
412 requests reuse preparation; 249 are fresh. `zero-step-depot-commands-check.json`
passes 40 lifecycle checks, including automatic worker pause, backpressure,
suspend/resume, reset/restore, save/load, late leases and graceful close.

Depot-only native A/B/B/A uses 12-second warmup, reset and 30-second measurement,
full services and the existing paced pipeline. Median combat trial statistics:

| Metric | Control | Reuse candidate |
| --- | ---: | ---: |
| Submission FPS | 88.32 | 99.34 |
| Control/candidate trial spread | 7.41% | 0.88% |
| Interval p95 / p99, ms | 15.60 / 19.40 | 16.15 / 20.65 |
| Mean worker computation, ms | 10.06 | 6.62 |
| Mean preparation / compilation, ms | 6.46 / 2.30 | 4.08 / 1.37 |
| Applied input-to-submit p50 / p95, ms | 13.45 / 23.20 | 14.65 / 20.55 |
| Message delivery p95, ms | 1.00 | 7.10 |

There are no simulation drops, but control drift exceeds 5% and tails worsen.
The observed 12.5% FPS increase is **not an accepted gain**. Fast repeated poses
account for part of the cadence increase; fresh job metadata does not prove a
fresh image. The reduced computation exposes waiting/delivery costs rather than
establishing smooth 165 Hz motion.

The two control combat rates fall from 91.59 to 85.05 FPS. Boundary GPU samples
rise from 61 to 74°C over the block; post-trial clocks span 2415–2460 MHz. Device
memory rises across the reused browser session, including its final control.
These boundary observations cannot attribute the drift or a leak to this cache;
CPU thermals/core residency and per-owner retained-memory behavior remain open.
The first control also contains a 157.60 ms combat interval with 9.70 ms worker
computation and 147.50 ms message delivery delay. No aligned trace covers that
event, so its cause remains unresolved.

Decision: keep this candidate archived and unpromoted. It proves that much
zero-step preparation can be avoided for the tested inputs, while its pacing,
input-age and image results require a different complete-loop experiment. Next
compare an explicit fixed-rate producer and lightweight interpolated renderer
against the direct latency control. Cover retained-frame disposal and all writers
before proposing an engine ownership contract.

## Reproduction owners

- [Scene ceiling probes](../../../../../../../spikes/scene-ceiling/README.md):
  current checkpoint inputs, actual native DPR, stage ablations and generated
  public-package project/partial/direct-scene workloads.
- [Worker runner](../../../../../../../spikes/persistent-world-worker/README.md):
  frozen variants, state/image parity, full services, focus, power and cleanup.

Each run retains its plan, source manifest, raw rows and cleanup receipts. Generic
fixtures require no archived game assets. Partial updates assume explicit knowledge
of changed records; that assumption is not yet a proven Touch of Death ownership
contract. Native language, cache/bandwidth and interpolated-game limits remain
unmeasured.

## Final verification and retained changes

The owning report/verification commands pass 390 campaign case receipts plus six
fresh starter cases, including source hashes, planned coverage, focus and cleanup.
This validates the measurements' records; diagnostic stage removals and resumed
cohorts retain their stated limitations. All 101 browser cleanup receipts contain
zero processes and visible windows. The shared managed server remains healthy,
with no unresolved supervisor errors.

The focused suite passes 46 tests / 319 assertions, covering generated public-API
fixtures, interrupted campaigns, capture invalidations, trace-window alignment,
campaign validation and existing renderer/view contracts. Scene-ceiling and worker
tooling typechecks, engine source/test typechecks, source-structure policy and
process policy pass. Documentation links resolve. No broad repository or release
gate was run for these private experiments.

An archived culling build reproduces all 676 source entries after its experimental
helper was removed from the working tree. Compiled bundle ordering can differ, so
this proves source-graph reconstruction rather than binary identity. The four
modified engine implementation files match the pre-spike snapshot exactly.
Retained changes are the portable benchmark fixtures, stronger evidence tooling,
tests and documentation. Renderer and zero-step reuse prototypes remain archived;
none qualifies for production promotion. No six-arena finalist campaign or
ten-minute gameplay soak was run because no new candidate cleared screening.
