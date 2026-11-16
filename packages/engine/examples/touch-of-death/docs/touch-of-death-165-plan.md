# Touch of Death and engine performance ceiling spikes

Current next action (owner direction, October 10): consolidate existing experiments
and subsystem switches into one build before another broad campaign. Use seeded
resets and serial comparisons, distinguish hidden rendering from skipped simulation,
and expose counters proving each switch removes its intended work. The
[spatial-AA screen](history/performance/october-10-spatial-aa.md) passes bounded
six-arena repeatability; its throughput is unmeasured. Existing failed variants stay
diagnostic-only. This direction supersedes the older immediate next steps below.

Status: the first measurement wave is complete. Browser cadence, cached rendering,
public-engine scaling, rendering candidates and zero-step preparation reuse were
measured. No new runtime candidate passed all promotion gates. Stall causality,
changed-work ownership and presentation-rate architecture remain open.
Follow-up [provenance and control trials](history/performance/october-9-cadence-and-controls.md)
validate pose identities and clock bounds but find unstable controls and a
130 Hz browser VSync fallback. Later [controls recovered approximately 165 Hz](history/performance/october-10-in-window-system-counters.md)
before observer startup; the pacing change remains unexplained.
[Preparation attribution](history/performance/october-9-preparation-attribution.md)
now covers frozen/changing inputs in depot and rooftop. A
[pure-query cache](history/performance/october-9-incremental-query-cache.md) avoids
repeated work but fails longer production-AA comparisons; the
[command-capture diagnostic](history/performance/october-9-aa-command-capture.md)
narrows AA variation without resolving it. Broader invalidation, visible-response
latency and the remaining architecture comparisons are still open.
The [fresh-work render variants](history/performance/october-9-fresh-render-ablations.md)
now have matching producer binaries and short correctness replays. Their per-pass
observer has initial diagnostic data. Full/clear paired trials remain below the
target with unstable controls; targeted pass effects remain open.
The [audit](touch-of-death-performance-audit.md) owns current conclusions and the
[October 9 history](history/performance/october-9-ceiling-spikes.md) retains results.
This plan owns the remaining sequence and architecture decision gates.
The [complete-frame reconstruction diagnostic](history/performance/october-10-evaluated-frame-replay.md)
passes 844 bounded rooftop active-packet checks. The
[owned display prototype](history/performance/october-10-display-interpolation.md)
now integrates real scene interpolation, with exact numeric endpoints/repeats.
Full-object publication arrives too late for live interiors. A
[compact publication follow-up](history/performance/october-10-compact-publication.md)
now supplies some distinct interpolated submissions at the same 16.67 ms delay,
but main-thread display work exceeds budget. A
[lazy entity-plan follow-up](history/performance/october-10-interpolation-preparation.md)
reduces blends but increases preparation because live plans never get reused.
Keep the full loop. [Isolated schedule and delay screens](history/performance/october-10-display-scheduling.md)
now show fewer repeats at a cost of extra producer work or older poses; neither
reaches 165 Hz. Target complete scan/copy or application reductions. Resource epochs, skinned presentation,
independent-session controls and visible latency remain open.
[Material-input versions](history/performance/october-10-material-input-versions.md)
now avoid repeated deep input comparisons while preserving live resource checks,
but publication-wide invalidation limits reuse and total capacity is inconclusive.
The [per-material revision follow-up](history/performance/october-10-material-input-revisions.md)
avoids 99.77% of deep comparisons and reduces preparation, but full-loop gains
remain inconclusive. A [separate submission trace](history/performance/october-10-submission-backpressure.md)
supports command-buffer backpressure: wait time more than doubles with little
CPU execution inside those waits, while GPU-process CPU is heavily occupied.
The [complete-pipeline table test](history/performance/october-10-display-material-table.md)
now improves live submissions by 27.22% / 31.59% and nearly eliminates observed
buffer-space waits with an unchanged producer. Changed poses still reach only
about 55/s; same-version normal-AA fails. The
[separate full-loop shadow screen](history/performance/october-10-display-shadow-batching.md)
now removes 73–78% of shadow draws, with a +15.94% exploratory submission effect
but no fresh-pose gain. The [combined test](history/performance/october-10-display-combined-batching.md)
removes further calls and reaches 140–145 submissions/s, but only 56–61 changed
poses/s. Control spread is 15.54%, the paired interval includes no gain, and
normal-AA still fails. Resolve AA and repeat independent controls before promotion.
The [shader isolation screen](history/performance/october-10-shader-repeatability.md)
now rejects six normal-AA variants as sufficient determinism fixes, including
bounded lighting inputs and explicit shadow gradients. The
[upload/MSAA follow-up](history/performance/october-10-upload-msaa-isolation.md)
finds only unused opaque-slot upload differences and passes 396 minimal-scene
redraw comparisons; the full game still fails. Next isolate the failing game
draw/resource interaction or test a separately versioned AA implementation with
its own repeatability, visual and full-loop cost gates. The combined result
supports further work on producer/application cost; it does not select the final
architecture or permit adding separate experimental gains.
The [audit's current visual acceptance](touch-of-death-performance-audit.md#decisions)
supersedes cross-version image equality requirements in this plan and historical
reports. Re-screen existing experiments with short serial controls, recording
same-version repeatability, calls, scans, copies, uploads, allocations and bounded
storage alongside timing. Packed-float comparison retains all resource checks;
compare its unchanged traversal against actual layout/work-reduction candidates.
The [pipeline inspection](touch-of-death-frame-pipeline.md) owns the actual thread,
queue, writer and lifetime map and the first instrumentation milestone. The user's
ordered measurement program supersedes the earlier interpolation-first priority;
the numbered spikes below remain workstreams, not permission to skip that order.

Find the highest sustainable performance on this machine at the current visual
quality, then identify what limits comparable projects as their workloads grow.
165 Hz gives 6.06 ms per visual update; aim for about 5 ms on each limiting path
to leave scheduling headroom. Keep simulation at its authored fixed rate.

There is no single hardware-independent FPS ceiling. Report four separate limits:
browser/display cadence, cached-scene rendering, fresh presentation throughput,
and complete gameplay. Count simulation ticks, interpolated visual updates,
repeated images and submissions separately. Above-refresh throughput is useful
capacity evidence, not proof the display shows more frames.
When cadence is capped, report the observed rate as a lower bound on processing
capacity and increase workload until deadlines fail. Do not label the reciprocal
of a mean stage duration an achieved FPS ceiling.

## Measurement and reuse

Short re-screen sequence after the sleep/repeatability clarification:

| Experiment family | Structural question before timing |
| --- | --- |
| Packed float words; contiguous cached storage | Same comparisons/resource checks? Backing buffers, copied bytes and views per update? |
| Material table / compatible runs | Surface/shadow draw counts, table uploads, texture binds and planner storage? |
| Hoisted validation; bound presentation lookups | Calls and checks removed per unchanged/changing frame? |
| Query cache; zero-step preparation reuse | Eligible work avoided and complete invalidation, including restore/resources? |
| Camera/light culling; retained ordering | Membership, ordered instances, triangles, shadows and traversal cost? |
| Shadow batching | Draw reduction versus uploads/packing; same-version repeatability? |
| Full/clear, no shadows, no post, resolution, zero instances/dispatch | Same producer work; CPU submission versus asynchronous GPU effect? |
| Worker buffers/scheduling; 60/120/165 producer rates and interpolation | Queue waits, copies, fresh ticks, distinct poses and age? |
| Generic object/material/draw sweeps | Scaling, bounded memory and dispatch counts independently? |
| JS/typed-array/scalar/SIMD Wasm kernels | Calls, copies, resident working set, allocations and emitted SIMD? |

Completed awake screens so far: [packed words and contiguous storage](history/performance/october-10-material-words.md),
[material-table batching](history/performance/october-10-material-table.md) and
[timer/pipeline scheduling](history/performance/october-10-awake-scheduling.md),
and [rooftop/depot obstruction caching](history/performance/october-10-query-cache-rescreen.md),
plus [depot zero-step preparation reuse](history/performance/october-10-zero-step-rescreen.md).
The [depot camera-only culling and shadow-batching screens](history/performance/october-10-culling-shadow-rescreen.md)
are also complete, with inconclusive capacity effects.
[Isolated depot light-volume culling](history/performance/october-10-light-culling-rescreen.md)
is rejected for this workload: it adds scanning/copying without removing shadow work.
[Shadow batching's GPU follow-up](history/performance/october-10-shadow-gpu-rescreen.md)
reproduces a lower whole-render GPU duration; stability, cross-pass attribution,
same-version AA and overall gameplay benefit remain unresolved.
This does not complete the remaining families or live interpolation acceptance.

Use short ABBA screens first, then independent sessions for survivors. Record
within-version images separately from throughput; image readback never runs in
timing. Existing artifacts with incompatible replay contracts use their owning
runner and cannot be pooled with newer fixed-work measurements. A failed queue,
focus, wake or correctness receipt invalidates that trial. A structural improvement
can justify another experiment despite inconclusive timing; it does not prove a
full-frame gain. This table is the coverage inventory, not a claim of rerun completion.

Extend the existing owners rather than creating another benchmark framework:

| Owner | Use |
| --- | --- |
| [Scene ceiling probes](../../../../../spikes/scene-ceiling/README.md) | Stage removal, cached rendering, CPU/GPU attribution and structural counts |
| [Persistent worker runner](../../../../../spikes/persistent-world-worker/README.md) | Frozen artifacts, full services, visible focus, input age, parity and serial campaigns |
| [Independent query batches](../../../../../spikes/scene-batches/README.md) | Inline/worker/transport comparisons with complete packing costs |
| [Physics replay](../../../../../spikes/persistent-world-worker/physics/README.md) | Both physics worlds, sufficient-budget oracle, KO/recovery and collision coverage |
| [Low-level benchmarks](../../../benchmarks/low-level-performance-spikes.ts) / [browser WASM variants](../../../benchmarks/wasm-browser-variants.ts) | Layout and JS/scalar-WASM/SIMD crossover measurements |
| [Performance evidence helpers](../../../../performance/README.md) | Environment-qualified reports, work counts and bounded history |

Freeze the current retained source/asset graph as control. Existing ceiling probes
default to older local artifacts: refresh their inputs explicitly. Add reproducible
fixture generation to the owning runners so a fresh checkout can run the generic
lanes; keep game checkpoints and run output under `.local/engine-perf/`.

Use depot and compact rooftop to screen candidates, then all six seeded arenas
and combat/KO/recovery/result phases for finalists. Time visible focused Chrome
serially at 1366×768 and the actual native backing resolution/DPR. Preserve normal
AA, graphics and host services. No builds, tests or second audit browser during timing.

Each spike records its hypothesis, source hashes, fixed inputs, control/candidate,
correctness gate and stop rule before measurement. Reuse the current 12-second
warmup/reset/30-second A/B/B/A protocol for full-loop comparisons. Keep all trials;
reject lost focus, simulation drops, capacity overflow or control spread above 5%.
Investigate drift before repeating a complete block. Diagnostic traces, allocation
profiles and stage observers run separately from uninstrumented acceptance.

Report median trial statistics, p95/p99 intervals, deadline misses, worst stalls,
applied input age, image simulation age, CPU/GPU time, allocations/GC, retained
memory, bytes copied/uploaded and queue depths. Record power, clocks/thermals where
available, browser/driver and competing work; unknowns stay explicit. Scheduling
experiments need quiet and representative contention tiers, without terminating
unrelated user work. The [engine performance contract](../../../docs/developer-performance.md)
owns the general acceptance rules.

## 1. Establish the browser floor and explain long stalls

**Question:** can this session deliver a steady 165 Hz cadence, and where does
time disappear during the observed long KO delivery stalls?

Compare a minimal canvas page, the loaded game with no draw, one cached frame,
and the full game. Measure rAF cadence separately from the existing timer-paced
submission loop. Use asynchronous GPU queries with validity/coverage reporting;
do not force GPU waits or readbacks inside timing. Renderer queries exclude the
separate post/compositor path, which needs its own trace attribution.

Capture a marked trace through fighting, KO and recovery, including main/worker
execution, GC, message enqueue/receive, buffer waits, GPU submission and available
OS scheduling evidence. Distinguish a busy thread from a descheduled or blocked
one. Measure instrumentation overhead. Verify refresh rate, viewport and focus.

**Decision:** produce a timeline explaining covered stalls, plus the session's
cadence floor. Unexplained stalls stay open; a short fighting profile cannot close
them. If the empty case misses deadlines, report that platform limit separately
and continue the engine capacity measurements.

## 2. Bound the opportunity and map workload scaling

**Question:** which work must disappear to reach 6.06 ms, and how does it scale?

Refresh the existing stage-removal experiments: simulation only; presentation
without simulation; cached rendering with real post/HUD; sample/capture/apply;
obstructions; host replay/learning services; packet packing, transfer and decode.
Compare both frozen states and advancing traces. Removed work gives an optimistic
bound and is never an equivalent-game performance result. Build a dependency
timeline; do not sum nested timings, removal deltas or overlapping CPU/GPU costs.

Add deterministic generic 3D workloads through public project and scene APIs:
static scenery, sparse animation, fully changing materials/poses, skinned crowds
and dense collision. Start at 0.25×/1×/4× the recorded game counts, bounded by
declared capacity, then refine around a crossover. Vary one axis at a time:
declared/visible/changed entities, material diversity, draw batches, joints,
collider density and pixel count. Include 0%/1%/10%/100% changed records and
off-camera movers/shadow casters. Equal-work direct-scene and project-evaluation
fixtures reveal costs introduced by the higher-level engine path.

**Decision:** publish a ranked budget and scaling curves. Work whose complete
removal cannot materially close the gap gets lower priority. Keep workload counts
with every result so a tiny scene cannot stand in for the actual game.

## 3. Find the rendering ceiling at unchanged quality

**Question:** are pixels, geometry, draw submission, uploads or post/compositing
the active limit?

Replay identical prepared packets; separate shadow, opaque/transparent geometry,
outline, skinning/morph uploads and post/HUD costs. Sweep resolution and pass
removal only for diagnosis. Test parity-preserving batching, upload ranges,
redundant state elimination and tighter independent camera/light commands where
the measurements point. Include moving cameras, transparency and context recovery.

**Decision:** establish normal-quality renderer capacity at both viewports and
the dominant scaling axis. A renderer still over budget blocks 165 Hz regardless
of worker improvements. Quality-reduction variants get a separate capacity curve
and rendered comparison; they do not change the accepted default. The previously
rejected shader candidate needs a new explanation and corrected parity first.

## 4. Make presentation cost follow changed work

**Question:** can the engine avoid repeated full-scene preparation/application
without weakening its mutable-frame contract?

First compare full combat capture with a named render-only projection for pose,
HUD and effects. Preserve independent saves/checkpoints; do not cast a partial
capture as restorable state. Its measured cost bounds the possible gain.

Then start one explicit changed-channel path for entity or material application.
Compare current full application with revisions/changed-record lists and a debug
full-path oracle. Count scans, comparisons, writes and allocations at fixed changed
count while increasing total scene size. Cover all relevant writers: poses,
joints, traffic/debris, held weapons, appearance, visibility, fades and aliases.
Identity equality alone cannot detect their mutations.

Restore, rollback, topology/resource changes and direct packed-array edits must
invalidate correctly. Preserve ordinary detached frames and public application
repair behavior. If an owned fast path wins, define borrow lifetime, bounded
storage, reentry/disposal rejection and detached retained outputs explicitly.

**Decision:** retain only a measured full-loop win with complete state/packet/image
parity, including wardrobe and context recovery. Generic pooling already lost;
repeat it only for a new, measured ownership hypothesis. Lower GC alone is insufficient.

## 5. Measure the algorithm, memory-layout and language limits

**Question:** is the remaining CPU limit algorithmic, memory traffic or numeric
execution, and would native-style code actually move the full-game ceiling?

Take the dominant batches from spike 2. Compare the current object path, packed
JS typed arrays, resident scalar WASM and resident SIMD, then include packing,
copies, synchronization and result application. Sweep batch size and working set;
record touched bytes, allocation rate, GC and retained memory. Hardware cache-miss
and bandwidth counters are separate evidence when available; timing and heap
deltas alone cannot establish cache or RAM-bus saturation.

For simulation, replay both normal and KO worlds. Compare broad-phase candidate
counts and capacity scans before changing arithmetic. A swept index must preserve
both-body bounds, deterministic pair order and updates after CCD truncation; the
current discrete index is not automatically suitable. Use the sufficient-budget
reference and thin-floor/wall cases, never the old truncated behavior as oracle.

If language cost remains material, run the same dominant numeric kernel natively
with matching algorithm, precision and outputs, recording compiler/flags and
bridge costs separately. That estimates a kernel gap, not a native game's FPS.
Test WASM fallback, tails, memory growth and stale-view ownership as applicable.

**Decision:** publish batch/working-set crossover ranges and an end-to-end gain.
Use the existing numeric dispatch and WASM owners; promote no blanket WASM rewrite
or claim of native equivalence from a single microbenchmark.

## 6. Compare presentation-rate architectures

**Question:** is 165 Hz best reached by incremental presentation at display rate
or by a 60 Hz producer with lightweight interpolated rendering?

Compare both against the current worker, using identical fixed simulation ticks
and input traces. Reuse the bounded mailbox. Endpoints carry epoch, tick/time and
applied input sequence; retain only the latest usable pair. Measure two versus
three owned buffers if waiting is material. Additional buffers must not queue old
images or silently hide age.

Interpolate positions/scales and shortest-path quaternions; blend local joints
before palette generation or primitive-limb reconstruction. Camera, shadows and
HUD share the presentation time. Use conservative swept visibility/cutaways and
snap across teleports, reset, rollback and topology changes. Tick equality alone
does not permit packet reuse when viewport, effects or presentation history change.

**Decision:** compare useful motion, deadline misses and applied input age together.
Previous/current interpolation can add a simulation tick of delay (16.67 ms here);
keep a direct latency control. Prediction is a separate accuracy/latency experiment.
Report smoothness gains with their latency cost rather than silently relaxing it.

## 7. Test larger architectural changes only against the remaining limit

**Question:** does ownership or the graphics backend impose a ceiling the earlier
spikes cannot remove?

If transfer/wait dominates, compare inline versus the current worker, independent
batch partitioning and an explicit shared-memory ownership variant. Include
packing, wakeups, atomics, memory growth and unavailable-feature fallback. Earlier
query workers did not beat normal inline wall time; larger batches need a new
crossover. Never split serially dependent simulation work just to use more cores.
Keep the current transferable-buffer path as the control and capability fallback;
include shared-memory host isolation requirements in the prototype's delivery cost.

If main-thread graphics submission remains limiting, test an owned offscreen
renderer. If backend submission/compute remains limiting after spike 3, build a
bounded alternate-backend replay (for example WebGPU) for the same packet workload.
Include equivalent shadows, outlines, AA, transparency, post and resource lifetime;
an incomplete renderer is only a diagnostic bound. Keep input/lifecycle ownership
and host capability handling explicit in either case.

**Decision:** proceed only when the measured removable cost justifies the larger
prototype. Require full costs, parity, latency, fallback and cleanup evidence
before proposing a production engine API or renderer migration.

## 8. Combine winners, prove reuse and report the achieved ceiling

Integrate compatible winners one at a time; gains are not additive. Re-run the
six-arena campaign at fixed and native viewports, with normal-quality parity and
complete combat/KO/recovery coverage. Follow with a ten-minute native foreground
soak and representative contention, retaining all stalls and resource high-water
marks. Report useful FPS, the fraction of 6.06 ms deadlines missed, p95/p99,
simulation drops, repeated images and input age. Physical input-to-photon or
scanout claims need separate measurement.

Prove reusable changes through named consumers. Use the
[first-party WebGL example](../../first-party-3d-webgl/main.ts) for renderer contracts
and the generated public-project fixture for presentation. Use
[Motion Lab](../../motion-lab/README.md) for shared motion kernels or
[Three Arena](../../three-arena/README.md) for applicable loop/numeric changes.
Three Arena's Three.js renderer is not proof of our WebGL renderer's performance.
Only generalize performance claims across the workload shapes actually measured.

Keep game identities/tuning in Touch of Death; host clocks, browser/platform
adapters and diagnostics remain outside DOM-free engine logic. Extract only the
small primitive demanded by the measurements, with a real consumer using it.
Ordinary tests assert parity, lifetime/invalidation, bounded memory/queues and
work-count scaling; machine-speed assertions belong in calibrated benchmarks.
Public API changes also need type/export checks, package build, bundle budgets
and an extracted consumer using that API under the
[package-testing contract](../../../../../docs/package-testing.md).

**Deliverable:** a reproducible ceiling report with current-quality gameplay,
isolated bounds, optional quality tiers, workload scaling, uncertainty and the
next limiting stage. Reaching 165 Hz does not end the capacity sweep; continue
isolated load/cadence measurements to locate remaining headroom. Failing to reach
it must identify the measured gap, not extrapolate isolated kernel speedups.

## Execution order

The first wave established the following decisions; detailed numbers belong in
the linked history rather than this plan.

| Spike | Current decision |
| --- | --- |
| 1 — Browser and stalls | Callback cadence reaches 165 Hz; physical presentation is unobserved. A complete KO trace distinguishes CPU work, GC and elapsed time outside recorded execution; the long delivery-stall cause remains unresolved. |
| 2 — Scaling and stage removals | Portable project/partial/direct-scene fixtures and current arena ablations are implemented. Simple geometry and material-count limits are sampled; skinned crowds and dense collision remain open. |
| 3 — Rendering | Camera/light culling and shadow merging remain unpromoted. Normal-AA parity failures persist; shadow merging also lacked a credible gain. |
| 4 — Changed work | Zero-step reuse preserves the tested full packet/presentation sequences and invalidation behavior. Unstable controls, worse frame tails and rooftop image failure prevent promotion. Incremental preparation remains open. |
| 5–8 — Remaining program | Language/layout crossovers, interpolation, conditional architecture changes and the six-arena sustained campaign remain unmeasured in this wave. |

Execute the next wave in this order:

1. Reconstruct the actual pipeline and writer map; the linked inspection is the
   first delivery. Record unresolved mutation/history boundaries explicitly.
2. Implement its measurement milestone: frame/state/pose identity, correlated
   timestamps, true render start/end, queue waits, GPU validity and presentation
   observation. Keep callback, submission and physical display claims separate.
3. Establish warmed, paired controls across sessions and explain drift. Retain
   raw samples and traces, environment/working-set evidence and paired uncertainty
   intervals; controls that can explain the alleged gain make it inconclusive.
4. Profile and prototype changed-work preparation, including every writer and
   discontinuity. Compare unchanged and changing scenes with a full-path oracle.
5. Isolate rendering while holding fresh simulation/preparation constant; vary one
   factor at a time and diagnose production-AA history/repeatability. Cached scenes
   remain bounds. Keep the existing normal-AA gate and failed captures.
6. Compare current scheduling, a fixed 60 Hz producer with display-rate interpolation,
   and a third rate/scheduler justified by traces. Measure pose age, repeats, error
   and visible response with a direct latency control; do not count interpolation
   as additional simulation or silently permit an extra tick of latency.
7. Compare representative JS layouts and resident scalar/SIMD WASM kernels with
   complete integration costs. Threads require coarse independent work and a
   deployable isolated host; offscreen/backend changes remain conditional probes.
   Select the library data/ownership/packet contracts only after those comparisons.
8. Run the six arenas, rooftop/depot image gates, skinned crowds, dense collision,
   sufficient-budget KO oracle and sustained thermal/memory runs. Report proven,
   unproven or disproven for the specified workload and observation endpoint.

Every spike
ends in keep, reject or unresolved, with its next discriminating measurement.
Stop unpromising variants early; widen correctness and acceptance coverage only
for credible candidates. Promotion needs a clear full-loop gain (normally about
5%) or a separately demonstrated tail improvement, with no material correctness,
latency or resource regression. Detailed run history belongs beside the existing
performance histories; this document stays the current plan.
