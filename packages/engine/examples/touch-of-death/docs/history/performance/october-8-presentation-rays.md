# October 8: presentation work removal and rejected reuse experiments

The retained CPU candidate binds environment, wheel, interaction and worker-HUD
dependencies, validates cutaway topology once during uninterrupted presentation,
hoists box invariants out of sight-ray loops, and retains matrix attribute state
in mesh VAOs. It preserves ordinary detached frames, mutable material handling,
simulation, graphics quality and the existing worker opt-in boundary.

The user explicitly requested restoring the preceding small lookup/VAO changes.
They are included in this combined candidate; the throughput improvement below
must not be attributed to the ray loop alone. The first combined lookup/VAO and
shared-validation experiment improved depot only 2.63% and worsened its tails.

## What changed

- Environment, interaction, wheel and HUD consumers select their authored
  dependencies before building maps or copying presentation bases. Selected
  records stay borrowed from the current detached frame; unrelated scenery is
  neither copied nor retained. Slot identities are checked, including reordering,
  replacement and missing records.
- Camera clearance and obstruction share validated topology within one synchronous
  call. Direct helpers still validate. An external stage observer forces
  revalidation after the callback, because it can mutate or reorder the frame.
- [Sight rays](../../../../../src/project/3d/combat-visuals/cutaways/target-rays.ts)
  load one box's pose, extents and slab numerators once, then test its targets
  without per-ray callbacks or temporary vectors. Quaternion arithmetic, slab
  operation order, near/far tolerances and fading rules match the original oracle.
  Nothing is cached across frames or inferred from an unchanged simulation tick.
- Matrix attribute enablement/divisors belong to VAO creation. Each mesh remembers
  its current instance offset; changed offsets rebind the four pointers. Mesh
  replacement and context restoration create fresh records and bindings.

## Controlled windowed measurements

Each block is serial A/B/B/A, with twelve seconds warmup, exact checkpoint restore
and thirty seconds measurement per trial. Both fighters use level-nine AI under
ordinary match rules. Full services, two transfer buffers, paced fresh-input
scheduling, VSync off, normal AA and quality remain fixed. The initial control is
the complete working source graph frozen before this task, including the CCD fix,
not Git HEAD. Runtime, mailbox and renderer are rebuilt from that graph.

Reference: i9-13900HX, RTX 4070 Laptop via ANGLE/D3D11, Chrome 154.0.8037.58,
AC power and battery saver off. Every measured browser is visible and focused.
Existing user workloads remain active; no audit builds, tests or other audit
browsers run during timing. CPU thermals and thread residency remain unmeasured.
FPS counts fresh CPU submissions, not physical scanout or interpolated 165 Hz motion.

Values are medians of complete per-trial fighting statistics. Controls stay local
to each block; between-block drift makes pooling controls inappropriate.

| Windowed comparison, 1366×768 / DPR 1 | Combat FPS, control → candidate | Change | Interval p95 / p99, control → candidate | Control / candidate spread |
| --- | ---: | ---: | --- | ---: |
| Selection, shared validation and VAOs / depot | 82.10 → 84.26 | +2.63% | 16.10 / 19.60 → 16.30 / 20.90 ms | 1.19% / 2.87% |
| First owned-frame pool / depot | 81.82 → 71.51 | −12.60% | 16.35 / 20.05 → 17.50 / 21.15 ms | 0.66% / 3.70% |
| Retained CPU candidate / depot | 85.09 → 95.12 | +11.78% | 15.45 / 18.90 → 14.30 / 17.05 ms | 0.46% / 3.59% |
| Retained CPU candidate / rooftop | 91.47 → 97.95 | +7.08%, provisional | 14.55 / 17.75 → 13.75 / 16.90 ms | **5.36%**, unstable / 0.37% |

Depot knockout/recovery improves 70.36→78.36 FPS, with p99 21.00→19.80 ms.
Fighting applied-input-age p95 improves 23.65→22.10 ms. These are software ages
in AI fights, not human key-to-photon latency. The rooftop closing control exceeds
the declared five-percent repeat-spread limit; its apparent gain is not a stable
second-arena acceptance result. Retain that failure instead of selecting its
faster control or treating stable candidate repeats as stable controls.

The separate maximized native cohort uses two consecutive A/B/B/A blocks, one
per arena, at 2561×1398 backing pixels / DPR 1.5. Fighting FPS repeat spreads are
below five percent, but detailed inspection rejects the closing depot control:
three 329–350.30 ms delivery/catch-up intervals cause 260.80 ms dropped simulation.
The original two-control depot median below is historical, not accepted evidence.

| Native comparison | Combat FPS, control → candidate | Change | Interval p95 / p99, control → candidate | Control / candidate spread |
| --- | ---: | ---: | --- | ---: |
| Depot, original block rejected | 80.23 → 88.45 | +10.25%, invalid control | 16.45 / 20.00 → 15.15 / 19.15 ms | 3.49% / 0.33% |
| Rooftop | 83.63 → 88.76 | +6.13% | 15.75 / 19.35 → 15.00 / 18.70 ms | 3.64% / 0.97% |
| Depot, complete confirmation | 77.45 → 86.52 | +11.72%, provisional | 17.10 / 22.25 → 15.90 / 20.20 ms | **7.18%**, unstable / 3.02% |

The measured CPU changes are retained after the stable fixed-viewport depot and
native rooftop wins. Native depot remains provisional: its complete confirmation
above drops no simulation, but fails control stability.
Its control intervals reach 118.20 and 237.80 ms; candidate maxima are 28.60 and
62.30 ms. Do not infer that the change fixes rare stalls or combine controls
across blocks to claim a stable native depot gain. No further repeat is selected.
The fixed-viewport rooftop caveat remains. Native and fixed-viewport blocks are
different workloads: maximizing changes aspect, culling and backing resolution,
so their cross-block FPS difference is not a controlled resolution-only estimate.

The campaign completes 28 unprofiled thirty-second trials and 68,729 acquired
frames, including rejected experiments and the disqualified control. Twenty
retained-candidate/control trials account for 50,334 frames. All focus, source,
checkpoint, runtime-error, row-capacity and cleanup receipts pass; one control
fails the new dropped-time gate. Across all 28 trials there are 43 intervals at
least 33 ms and five at least 100 ms, with a 350.30 ms maximum. All 260.80 ms of
dropped time belongs to that disqualified native control; no candidate trial drops
simulation time. These totals retain bad frames rather than filtering the tails.

## Why frame reuse was rejected

The first session reused entity/tuple/material records and privately immutable
base looks. Its stable full-loop block regressed 12.6%, despite exact state and
packet parity. A second variant interned equal private looks and kept pooled
entity shapes stable instead of deleting optional fields. It also passed state
and packet parity, but did not establish a throughput benefit.

In a separate ten-second named-profile/trace pair, the revised pool reduces
marked worker GC from 330.234 to 131.658 ms, approximately 3.30%→1.31% of elapsed
time. Sampling nevertheless rises 0.581→0.771 ms, obstruction presentation
2.966→3.114 ms, application 1.609→1.671 ms, and total worker compute
10.392→10.834 ms. Instrumentation is attribution, not acceptance FPS; sampled
function totals also include profiling startup outside the marked trace window.
Less GC did not compensate for the changed access/reset costs. These results do
not measure CPU cache misses or memory-bus saturation, and do not establish that
WASM would help after marshaling and lifetime costs.

Both session variants, their public runtime method and their world integration
were removed. Existing detached API semantics remain intact. Frozen executable
artifacts, full source graphs and rejected tests remain in the local campaign.
Reconstruct removed helper files from the artifact's source graph before trying
to rebuild an old session recipe.

## Rendering and correctness evidence

The original single-ray implementation is the oracle for 32,000 randomized batched
checks plus parallel/endpoint cases: unit and non-unit quaternions, thin boxes,
padding, empty sets and prefixes. Bound presentation tests cover dependency
selection, mutable materials, ordered followers, motion/rollback, camera clearance
and external observer mutation. Renderer tests cover unchanged and moved instance
offsets, mesh replacement and context recovery.

Depot CPU parity covers 1,441 frames per realm, combat, natural KO and recovery:
full state, numeric packet and compact presentation match, with 2,882 independent
standalone state-oracle checks. Six default-quality images pass the unchanged
pixel limit (at most 100 changed pixels, maximum channel difference 3/255): observed
maximum 30 pixels and channel 2. The preliminary selection candidate's six images
are byte-identical.

A separate GPU experiment moves the toon branch ahead of unused PBR work and uses
a depth-only shader for opaque shadows, preserving fading coverage in another
pass. Depot has the same full parity coverage and passes the image limit (14 pixels,
channel 1). Combined CPU/GPU rooftop packets and state match through 1,441 frames,
but frame 300 changes 20 pixels with a maximum channel difference of 5, failing
the image gate. A targeted CPU-only rooftop repeat at frames 0 and 300 passes
(three pixels, channel 1), with 602 standalone oracle checks. The GPU experiment
is not retained. The earlier same-packet MSAA finding remains relevant, but does
not by itself explain this failed candidate comparison.

The first pool's images pass (14 pixels, channel 1). The revised pool fails at
frame 1440 (16 pixels, channel 12). Neither AA nor the image threshold was relaxed.
An accidentally overlapping parity/profile attempt was rejected; the profiler
was stopped before measurement and its owned tree was verified absent. All
subsequent browser runs are serial. Failed receipts remain beside successful ones.

## Remaining CPU, GPU and delivery costs

The separate named-profile pair measures the following mean stage times. Both
runs use the depot checkpoint for ten seconds after warmup/reset. These are
instrumented observations, not additional acceptance samples. In particular,
the stage observer invokes the conservative topology revalidation path.

| Stage | Control → retained CPU candidate |
| --- | ---: |
| Worker compute | 10.463 → 9.664 ms |
| Zero-step worker compute | 9.090 → 8.593 ms |
| One-step worker compute | 11.003 → 10.217 ms |
| Game presentation | 5.762 → 4.614 ms |
| Obstructions | 3.111 → 2.503 ms |
| Environment / wheels | 0.402 / 0.170 → 0.110 / 0.021 ms |
| Interaction presentation | 0.388 → 0.245 ms |
| Frame application | 1.410 → 1.808 ms |
| Main draw submission | 3.006 → 2.352 ms |

Sampling remains 0.651 ms, full presentation-state capture 0.397 ms, primitive
fighters 0.821 ms and directed fighter presentation 0.852 ms in the candidate.
Application does not improve in this pair, despite unchanged applicator source.
Marked worker GC occupies 360.560→339.859 ms, or 3.60%→3.39% of the ten-second
windows. The retained win comes primarily from doing less presentation/submission
work; it does not eliminate allocation or establish a cache/memory-bandwidth cause.
Zero-step work alone remains above the entire 6.06 ms target budget.

The native rooftop diagnostic pair measures the retained renderer at 6.086 ms
median GPU time, 8.518 ms p95 and 10.312 ms p99, before post/compositing. Mean main
work is 7.326 ms and worker compute 8.590 ms; they overlap and must not be added.
The excluded GPU shader experiment measures 6.046 / 8.591 / 10.367 ms GPU
p50/p95/p99, with a slightly higher mean (6.018→6.046 ms). This single diagnostic
pair establishes no repeatable GPU win; its image failure independently blocks
promotion. Keep GPU pass attribution and draw/coverage reduction ahead of assuming
that shader rearrangement or a language change solves the remaining budget.

The rejected native depot control's longest interval is 350.30 ms in round-result.
Its neighboring intervals show message delivery of 315.20, 285.10 and 263.90 ms;
the subsequent jobs execute fifteen simulation steps and drop a total 260.80 ms.
No trace was active in that unprofiled trial, so GC, graphics waiting and OS
descheduling cannot be distinguished. The event is not evidence that the CPU
candidate fixes long stalls. The report validator now rejects any measured
simulation drop from performance-repeat qualification while retaining all rows,
tails and counts; its regression test covers this previously missed condition.

## Package and validation status

All 172 focused engine tests pass (57,068 assertions), plus six report tests.
Engine source/test and world/spike typechecks pass. Package build and the extracted
external-consumer create/build/receipt/preview/recovery/cleanup smoke pass.
Source structure passes at its existing limits; process policy and managed-server
error inspection pass. The final one-line renderer formatting repair generates
byte-identical runtime and worker bundles to the timed CPU artifact, recorded in
`retained-equivalence.json`; no unmeasured implementation was substituted.

The broad code-style gate still reports pre-existing dirty-tree violations. New
ray-test type/literal issues were repaired and their focused tests/typecheck rerun.
Bundle budgets remain open and were not raised: WebGL is 52,640 raw / 15,264 gzip /
13,473 Brotli bytes against caps 49,955 / 14,209 / 12,509; project runtime is
1,090,673 / 349,062 / 283,075 against 1,086,376 / 347,897 / 282,333. Other existing
tooling, scene and physics overruns remain in `final-bundle-size.log`. These are
current whole-working-tree outputs, not the size increase attributable to this task.
Against the preceding CCD package receipt, WebGL grows 76 raw / 32 gzip / 66 Brotli
bytes and project runtime grows 1,680 / 634 / 249 bytes; the existing cap deficits
therefore increase. The complete 62-output aggregate grows 3,473 / 1,298 / 1,075
bytes. This comparison uses the same package builder, not the differently minified
private benchmark HTML.

## Reproduction

Raw inputs, commands/plans, frozen graphs, executable hashes, samples, profiles,
traces, images and cleanup receipts live under
`.local/engine-perf/worker-preparation-20261008/`. The existing
[runner](../../../../../../../spikes/persistent-world-worker/README.md) owns commands.
Artifacts are `control`, `preparation`, `pool`, `intern`, `rays` and isolated GPU
variants, each under its arena name. Acceptance prefixes are `preparation-abba`,
`pool-abba`, `rays-abba`, `rays-roof-abba`, `rays-native` and
`rays-native-depot-confirm`; named profile evidence
is separate. The prior six-seed baseline and unresolved rollout gates remain in
the [preceding audit](october-8-preparation-baseline.md).
