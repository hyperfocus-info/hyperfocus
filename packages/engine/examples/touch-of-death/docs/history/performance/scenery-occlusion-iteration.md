# Scenery occlusion iteration

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Scenery occlusion iteration

Retained a narrow engine improvement in `combat-visuals/obstructions.ts`:
cached oriented box bounds reject distant scenery more tightly than a sphere,
and the remaining sightline checks reuse two call-local coordinate vectors.
Bounds refresh when scale or rotation changes; translation is read each time.
Non-unit rotations and negative extents retain the old conservative path.
The three-unit margin preserves close-lens cutaways and padded limb rays.
Scratch vectors never escape into a frame, and cached entries remain bounded by
the immutable authored material map. Collision, simulation and render quality
are unchanged by this optimization.

This is a modest improvement, not a solution to the 165 Hz budget. All 3,420
entities still pass through scene sampling/application and several presentation
scans. The new bounds skip expensive ray work; they do not yet provide a static
scene pipeline or an interest-based simulation scheduler. In particular,
offscreen collision and shadow dependencies cannot simply be discarded.

### Evidence and decision

Evidence is under `.local/engine-perf/presentation-20261006/`. An initial visible
inline CPU profile attributed about 2.54 seconds across 271 frames to scenery
occlusion, approximately 9.4 ms/frame. This diagnostic included profiling
overhead and multiple combat phases; it is not an A/B latency result.

Sixteen subsequent timing trials were serial, unprofiled and focused in visible
Chrome 154.0.8037.58 on the same i9-13900HX/32-thread, 64 GiB, RTX 4070 Laptop
ANGLE/D3D11 setup. Each used the saved city AI match, idle human, 1366x768/DPR 1,
VSync, six seconds warmup and eighteen seconds measurement. Existing background
work stayed running, with no audit builds/tests in measurement windows. Windows
High performance was observed between trials; thermal state was unrecorded.
The following are medians of per-trial fighting-phase summaries.

| Final normal standalone, ABBA then BAAB (four trials each) | Control | Candidate |
| --- | ---: | ---: |
| FPS | 17.51 | 18.20 |
| p50 / p95 / p99 frame interval | 52.65 / 85.95 / 99.90 ms | 48.60 / 84.80 / 97.70 ms |
| Median full-frame CPU work | 47.90 ms | 45.40 ms |
| Median presentation | 31.45 ms | 29.00 ms |

The normal loop gained **3.9% FPS**, with **5.2% less median full-frame CPU work**
and 7.8% less median presentation work. Every candidate trial's FPS exceeded
every control trial, but p95 improved only 1.3%. Retain this as a small CPU/work
reduction with no observed standalone tail regression; do not describe it as a
large FPS improvement or extrapolate it to other machines/workloads.

The first worker ABBA screen gave 21.85 -> 25.78 FPS and p95 74.90 -> 59.35 ms.
After conservative roundoff/noncanonical-scale guards, a reverse-order BAAB
confirmation of the final source gave **23.61 -> 24.07 FPS**, p95
66.85 -> 63.80 ms and p99 **81.80 -> 84.75 ms**. Median input age also varied
from 43.0 to 45.5 ms. Thus the initial 18% uplift did not reproduce at that size;
the final confirmation shows only 1.9% higher FPS, 4.6% better p95 and 3.6% worse
p99. Both sides used one persistent worker, two buffers and fresh-input requests.
This does not justify promoting the worker host or adding more workers/buffers.
The prototype remains opt-in, with its existing host-integration limits.

### Work, ownership and correctness

A separate instrumented, fixed-clock 301-frame comparison counted identical
595,378 obstruction visits, but **32,628,978 -> 25,466,264 ray checks** (-22%).
The control's coordinate-conversion path constructed 65,604,516 temporary vectors
including inverse quaternions; the candidate uses 602 scratch vectors across
those calls, plus vectors for 1,867 cached-bound updates. These are source-level
construction counts, not a claim about physical allocations after JIT escape
analysis. Other frame/material/target allocations remain.

At the end, the existing radius cache held 2,015 entries, of which 395 also held
oriented bounds. Matched inline-world post-GC heap samples were 35,316,620 and
35,376,660 bytes (+60,040 bytes); backing storage was 49,824,581 and 49,828,392
bytes. These are single retained-heap observations, not allocation rate, RSS,
GPU memory, high-water marks or a long-duration leak test. The authored identity
bound and weak-map lifetime provide the structural storage limit.

The final browser oracle passed 602 complete simulation-state comparisons and
six complete numeric render-packet/presentation comparisons. Four matched PNGs
were pixel-identical; two differed by 12 and 3 pixels respectively, with maximum
channel delta 1 out of 255. Inspected combat captures preserve fighter posing,
cutaways and shadows; do not claim exact pixel identity for all captures.
All 23 owned browser sessions (timing, profiling, parity and work-count diagnostics)
recorded empty process/window cleanup. Timing runs had no page/worker errors,
dropped catch-up time or superseded packets. The shared server remained healthy.

Validation: 35 camera/occlusion/cutaway tests, 1,282 assertions, engine and
prototype/test typechecks, engine build, installed-package consumer smoke, focused
engine lint and process policy pass. The spike files are outside ESLint's configured
scope and were typechecked/executed instead. Full bundle checking still has the
same 168 failing categories as before; the two changed outputs grew by 636 raw /
252 gzip bytes (`project-runtime-3d.js`) and 631 raw / 212 gzip bytes (standalone
tooling). No limits were raised. Source-structure checking still reports the four
existing violations in the renderer, art-script directory, city directory and
PadPilot evaluator, with none in this change.

Frozen control/candidate graphs differ only in the occlusion source and the
rebuilt installed runtime. The builder now supports isolated evidence roots,
explicit source overrides and rebuilding both installed runtime variants, so
an engine-source experiment cannot silently time an unchanged package import.
See the [reproduction options](../../../../../../../spikes/persistent-world-worker/README.md#comparing-engine-source-changes).
Final standalone runtime SHA-256:
`184eb77cb26482b5ed94af4592c6e76d288db4a4ff69ba7eacdb4bcb0ff776b4`;
control: `bc012d7bf0348bce1fd3d7cf6cdbb4ba92a4c09840f21189f519ea2606a314fa`.
Final worker-host runtime:
`36f7b08131da34e8ea83b15b638f25ae667528c1bfe28a092e76b23769a9dcd1`;
worker: `9df25df68f9d46e79b74d41a72b370c006b0f34a3ecad2212ae1e937551dc0a7`.
The initial screen's distinct bytes are archived as `candidate-screen` and its
trial manifests retain their hashes. The shared playable HTML was not overwritten.

Next priorities remain reducing unchanged entity/material processing and
profiling AI obstacle-route rebuilds. Occlusion still performs roughly 84,600
ray checks per sampled diagnostic frame: a tighter sightline-volume query is a
specific follow-up candidate, subject to the same geometry and full-loop gates.
More worker fan-out should follow independent bounded workloads and measured
handoff costs, not simply the machine's logical-core count.
