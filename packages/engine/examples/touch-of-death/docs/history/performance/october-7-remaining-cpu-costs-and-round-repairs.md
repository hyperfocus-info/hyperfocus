# October 7: remaining CPU costs and round repairs

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## October 7: remaining CPU costs and round repairs

Evidence: `.local/engine-perf/round-repair-20261007/`. Private builds preserve
their source graphs and hashes; `spikes/scene-ceiling` owns the repeatable probes.
No performance ablation below is enabled in the playable. Engine code remains
independent of browser APIs and host preferences; diagnostic clocks are injected
only into the private experiment.

### What the new ceiling probes establish

Four trials per operation, 30 warmup and 120 measured operations, mirrored order,
on the same 3,420-entity city checkpoint. Visible Chrome retains verified native
foreground ownership. Hardware remains RTX 4070 Laptop / i9-13900HX, 32 logical
CPUs, 1366×768 DPR 1. Background workloads remain running; thermal/power state is
unrecorded. Builds and tests run outside timing. Preparation evaluates and applies
a frozen frame; it excludes render submission, HUD, compositor and simulation.
Simulation repeats the same 30-tick fighting segment and checks replay equality.
This short segment does not represent every route search, destruction burst or KO.

| Visible CPU ceiling (`ceiling/critical-path`) | Median | p95 | p99 |
| --- | ---: | ---: | ---: |
| Full preparation | 9.73 ms | 11.51 ms | 12.03 ms |
| Exclude sampling cost | 9.93 ms | 12.42 ms | 15.65 ms |
| Reuse frozen gameplay snapshot | 9.38 ms | 11.01 ms | 12.09 ms |
| Exclude both input-construction costs | 9.23 ms | 11.96 ms | 13.93 ms |
| Remove native presentation | 3.00 ms | 3.91 ms | 4.29 ms |
| One simulation step | 0.90 ms | 1.20 ms | 1.37 ms |

Input-reuse modes retain exact evaluated-frame equality and unchanged simulation.
The sampler exclusion uses fresh clones outside the timer, so GC may still affect
the measured interval. It is not a reusable-frame implementation. Avoiding snapshot
construction alone helps modestly; avoiding both does not improve tails. Removing
native presentation deliberately removes poses, effects and visibility behavior:
its saving is an upper bound, not a shippable optimization.

A second instrumented campaign (`attribution/visible`) measures full preparation
at 10.03 / 12.15 / 14.94 ms. Removing obstruction handling lowers it to
6.83 / 8.70 / 10.98 ms: even this destructive ceiling misses 6.06 ms before drawing.
Fine clocks put native presentation at 6.35 ms median / 8.30 ms p95, comprising:

| Native/presentation work | Median | p95 |
| --- | ---: | ---: |
| Obstructions, fades and batching | 2.85 ms | 3.76 ms |
| Primitive fighter poses and effects | 1.40 ms | 2.80 ms |
| Camera clearance | 0.75 ms | 1.12 ms |
| Environment presentation | 0.30 ms | 0.50 ms |
| Weapon presentation | 0.20 ms | 0.35 ms |
| Hazard presentation | 0.20 ms | 0.25 ms |
| Scene application, outside native presentation | 1.65 ms | 2.06 ms |
| Directed fighter presentation, outside native presentation | 0.70 ms | 0.90 ms |

Within obstruction time, prop culling accounts for 0.20 / 0.30 ms and material
batching 0.60 / 0.80 ms. Maps, follower traversal, opacity updates and query setup
remain alongside actual ray tests. The earlier independent-query spike measured
only 0.30 ms of math; moving that kernel to many workers leaves most of this stage
untouched. Nested durations and independently calculated p95s are not additive.
Fine clocks add overhead; use them for attribution, not performance acceptance.

The final mode comparison uses visible/headless/headless/visible, with two trials
per block, the same artifact and no overlapping audit jobs (`attribution/abba-*`).
All sixteen operations pass; visible blocks retain native foreground ownership.

| Mode comparison, four trials each | Median | p95 | p99 |
| --- | ---: | ---: | ---: |
| Visible preparation | 10.00 ms | 12.00 ms | 12.86 ms |
| Headless preparation | 16.15 ms | 21.81 ms | 25.40 ms |
| Visible simulation, diagnostic clocks | 1.00 ms | 1.30 ms | 1.49 ms |
| Headless simulation, diagnostic clocks | 1.55 ms | 2.05 ms | 2.86 ms |

Headless is slower here, but visible preparation alone still exceeds the frame
deadline. Optimization remains relevant to actual play. These are CPU operation
times, not gameplay FPS or measured input-to-photon latency. The earlier serial
headless campaign is retained separately and reaches the same conclusion.

### Existing safeguards and remaining gaps

The solver already has sweep-and-prune contact broadphase, collision masks, CCD
and bounded candidate/contact storage. This checkpoint has 460 static bodies and
two dynamic fighters. Only two candidate pairs reach contact detection, with two
contacts and no overflow. CCD still visits 921 candidate tests per tick. That is
a scaling opportunity, but complete world stepping costs only 0.20 ms median /
0.30 ms p95 here. AI controller decisions are below the clock's resolution at the
median and 0.20 ms p95; this does not include every observation or routing helper.
Full simulation remains roughly 0.95 / 1.30 ms in the attribution campaign.

AI already reuses eligible movement decisions for up to six ticks and caches its
navigation graph. Navigation still rebuilds query bounds/indexes, and CCD still
scans distant bodies. Stress those paths with more dynamic bodies and route
invalidation before claiming they are cheap generally. Neither deserves first
priority for this measured two-fighter workload.

Simulation already advances at fixed 60 Hz independently of rendering. Lowering
it further would trade away responsiveness for a small saving in this scene.
Reaching 165 presentation updates also needs interpolation between fixed poses;
redrawing the same simulation pose more often does not create smoother motion.

### Next engine experiments, in order

1. Compile presentation bindings against stable scene topology. Reuse the existing
   frame-record selection primitive for native fighter/effect consumers, and retain
   authored cutaway/follower/material relationships across frames. Preserve fresh
   record references, topology invalidation, remote changes and separate shadow
   visibility. Measure retained bytes and record visits as well as live p95.
2. Apply dirty presentation outputs only. Test revisioned transforms, opacity and
   material aliases against the current complete frame path. Keep full snapshots
   for save/rollback boundaries; do not silently substitute a partial render view.
   Scene application and repeated material processing are material costs here.
3. Integrate worker ownership around the reduced pipeline, then test interpolation
   and latest-frame presentation with two/three bounded buffers. The existing
   worker's gain is real, but its remaining menu/replay/wardrobe ownership gaps
   still prevent default use. More cores cannot remove repeated serial traversal;
   retest coarse independent jobs after their inputs and invalidation are bounded.
4. Broaden the workload matrix: live fighting, post-KO juggling, recovery,
   destruction/traffic bursts, difficult navigation and more dynamic bodies. Judge
   full-loop p95/p99, fresh frames, input age and state/image parity. Revisit GPU,
   shadows and HUD after reducing CPU preparation; do not sum GPU and CPU clocks.

### Gameplay repairs and verification

The title now initializes the queued spawn/layout/motion seed, rather than showing
layout zero until Start resets the world. Round result time increases from 360 to
390 ticks: 210 live post-KO ticks (3.5 simulation seconds) followed by the existing
180 recovery ticks. Hitstop retains its existing effect on wall-clock duration.
Minimum standing clearance from the living opponent doubles, while support and
wall/path checks still constrain the search; impossible clearance does not justify
teleporting through geometry.

Native upper limbs now originate at shoulder/hip anchors. Directed garments
correct the reversed primitive axis and exclude overlap padding from bone length;
the existing neck connects jaw to collar. Getup transitions interpolate shared
joints before reconstructing segments, preserving knee/elbow attachment. Approved
mesh bytes and living combat physics are unchanged. This is an articulation repair,
not a replacement skeleton or a new biomechanical joint-limit solver.

Runtime identity advances to `combat-v39:` for the changed deterministic match
lifecycle. New clients and relay must use the same runtime identity. The canonical
project and shared exported playable were not overwritten by private verification.
Native before/after silent 60 fps recordings and first-frame world comparisons
accompany the source snapshots; they are not sound-on arena acceptance or owner
taste approval. Focused engine/editor checks pass 80 tests / 22,017 assertions,
including all three physical getup styles through every transition frame, rollback,
fallout, wardrobe and model bindings. Engine source/tests and editor source
typechecks, package build, external package consumer and process policy pass.
The broad bundle budget and three existing directory-size violations remain red.
