# October 7: retained serial presentation bindings

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## October 7: retained serial presentation bindings

**Accepted in engine source.** This change clears the full-loop improvement gate
in the normal playable and in the existing worker experiment. It does not enable
the experimental worker host or replace the shared exported game artifact.
Evidence: `.local/engine-perf/serial-presentation-20261007/`, including frozen
control/candidate/final sources, manifests, raw frames, focus receipts and images.

### Full combat results

Four trials per variant in each pipeline, serial A/B/B/A then B/A/A/B, six seconds
warmup and eighteen measured seconds per trial. Results below are medians across
complete trials, restricted to fighting frames. Each run uses a fresh visible,
focused Chrome 154 process, the same saved city match and idle human/local AI,
full services, VSync on, 1366×768 DPR 1, RTX 4070 Laptop / i9-13900HX (32 logical
CPUs). Existing background workloads remain; power/thermal state is unrecorded.
No audit builds, tests or profiling ran during these timings. All sixteen trials
kept native foreground ownership, with no recorded blur/visibility loss or runtime
errors. The runner now rejects mid-trial focus loss, even if focus returns before
the final native check.

| Fighting metric | Normal control | Normal candidate | Worker control | Worker candidate |
| --- | ---: | ---: | ---: | ---: |
| Fresh submitted FPS | 54.25 | **59.90** | 73.77 | **91.36** |
| Frame interval p95 | 24.30 ms | 24.20 ms | 18.35 ms | 17.60 ms |
| Frame interval p99 | 30.20 ms | **25.20 ms** | 24.10 ms | **18.70 ms** |
| Sampled-input age p50 | 14.00 ms | 12.15 ms | 24.40 ms | 19.30 ms |
| Sampled-input age p95 | 19.05 ms | **17.20 ms** | 35.75 ms | **30.10 ms** |

Normal throughput improves **10.4%**; worker throughput improves **23.8%**.
Normal p95 is essentially unchanged, so this does not establish smooth 165 FPS.
Normal p99 varies from 24.3–30.0 ms across candidate trials; retain the individual
results rather than treating the median as a worst-case guarantee. Main-thread
normal CPU time falls from 16.05/21.35 ms p50/p95 to 14.35/19.45 ms. Worker compute
falls from 12.40/15.95 to 9.80/13.20 ms; worker-host main work stays about
4.15/4.85 versus 4.20/4.80 ms. These clocks overlap; do not add them into one budget.

The normal input-age probe measures keyboard/gamepad polling to the start of
render submission. Worker age measures polling to fresh-packet acquisition/decode.
Compare each pipeline with its own control; these endpoints differ and neither
measures physical input-to-photon latency. Independent worker-host rAF remains
about 163.7 Hz, while only **91.4** fresh combat packets are presented. Two packet
buffers still retain 1,460,224 bytes (730,112 each); there is no buffer-count,
simulation-step or quality reduction, and no dropped simulation time in worker
fighting samples.

### Changes and correctness

- Runtime entity application retains authored transform/instance/resource bindings
  and order hints, while reading current records. Unchanged transforms skip setters;
  normalized quaternion values are detached from caller frames. Every skip checks
  live scene storage, so physics, external edits and restore can override it safely.
- The scene primitive `setInstancePresentation` validates live handles and applies
  mesh/material/visibility together. Unchanged static fields avoid writes; registered
  mesh bounds and skinned joint/skeleton checks retain their existing behavior.
- Camera clearance and cutaway presentation share retained topology: entity/material
  slots, follower ownership, body-part/prop/edge selections and batching membership.
  Identity/order or authored-association changes rebuild it. Pose, opacity, textures,
  variants and visibility remain live inputs. Unchanged opacity avoids look cloning.
- Full snapshots/checkpoints and the save/rollback contract remain unchanged.
  This is not yet an O(changes) pipeline: frame construction, identity validation
  and current material comparisons still visit scene records. Caches retain IDs,
  indices, authored declarations and detached numbers, not previous evaluated frames.

All 602 per-frame standalone simulation-oracle comparisons pass, together with
six exact complete-state, numeric render-packet and compact-presentation checkpoints.
The first image comparison has four pixel-identical captures; the other two change
one and three pixels respectively, at most 1/255 per channel. Rendered captures
were inspected. The final rebuilt artifact repeats all 602 oracle checks and exact
state/packet/presentation gates; its six captures differ by zero to six pixels,
again at most 1/255. Portable tests cover reordered/partial records, direct scene
writes, variants, changed nested materials, mutable topology, released resources,
invalid numbers, skin validation and rollback with complete detached snapshots.

In a frozen 3,420-entity city frame, transform setter calls fall from **10,260 to
zero**. The three instance setters become 3,420 combined presentation checks;
572 inactive effect visibility calls remain. In thirty advancing frames, position
calls fall from 124,290 to 26,820, scale from 102,600 to 232 and quaternion from
110,464 to 13,596 (counts include simulation writes). Both variants still update
12,676 world matrices, update 25 materials and run 652,054 obstruction rays. The
optimization removes redundant preparation rather than removing visible work.

A separate diagnostic collects main-realm heap twice at setup and after 200 then
700 additional measured frozen preparations (plus warmup). Final retained heap is
24,054,324 control versus 25,301,272 candidate: approximately **1.19 MiB extra**.
The last 700 preparations add 384,052 versus 381,244 bytes, so this sample shows
similar growth rather than accumulating old-frame bindings. This is not an
allocation-rate gate or a measurement of worker/GPU memory. Runtime binding counts
are bounded by authored entities; the topology cache replaces its previous slots.

163 focused tests / 30,811 assertions, engine/test and editor typechecking, package
build, installed-package consumer, spike typechecking and changed-source lint pass
(only existing numeric-literal lint warnings). Process policy passes. Bundle checks
retain the same 168 previously over-budget metrics; source-structure checking still
reports three unrelated directory violations. The new scene method initially pushed
its owner over the file-length limit; moving private type declarations into the
existing scene-support directory fixed that without changing emitted main/worker
bytes. Final artifact hashes equal the timed candidate. The frozen normal bundle
grows by 2,535 bytes. Shared managed-server logs contain no runtime errors.

A subsequent concurrent workspace edit clears material flags on resource destruction.
It is preserved and captured in `integration-final`; it is outside the frozen timing
artifacts. Focused integration checks cover the combined tree. The evidence receipt
distinguishes current-source verification from equality with the timed artifact.

### Remaining gaps and next experiments

A separate four-trial candidate attribution probe measures frozen preparation at
7.40/9.40/10.15 ms p50/p95/p99. It is explanatory evidence, not the acceptance gate:
native presentation is 3.95/5.60 ms, obstruction handling 1.30/1.60, primitive fighter
poses/effects 1.30/2.70, camera clearance 0.20/0.30, and scene application 1.48/1.81.
Sampling and complete presentation snapshot construction remain about 0.50 and
0.60 ms median. Nested clocks are not additive.

1. Bind native fighter/effect consumers to their authored record subsets. Their
   remaining searches and variable pose work now matter more; preserve camera
   context, articulated cutaways, hit effects and independent shadow visibility.
2. Test producer-owned dirty records/revisions for material and transform application
   to remove the remaining full-record comparisons and allocations. Explicitly cover
   external mutations, partial frames and restores; retain complete save/rollback
   snapshots. Do not assume unchanged object identity means unchanged nested values.
3. Correlate actual slow fighting frames with simulation catch-up, presentation,
   material work and GC before selecting the next optimization. Broaden acceptance
   to KO/recovery, destruction/traffic and difficult navigation. At 9.8 ms median
   worker compute, more buffering alone cannot meet a 6.06 ms producer deadline.

Keep judging these through fresh FPS, p95/p99, input age and parity. Complete worker
menu/replay/wardrobe ownership remains a separate integration task; neither this
speedup nor a 165 Hz polling loop establishes finished worker integration.
