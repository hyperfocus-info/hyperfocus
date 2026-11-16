# Material application and tighter obstruction queries

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Material application and tighter obstruction queries

Evidence: `.local/engine-perf/material-delta-20261006/`. The current source adds
a bounded unchanged-material cache in the engine runtime and a conservative
camera-to-target sight volume before exact obstruction rays. The normal host
keeps its camera/light culling; worker artifacts keep the existing one-packet,
two-buffer `worker-2-fresh` path. No quality setting, collision rule, simulation
rate or shared served artifact changes in this campaign.

The material cache stores detached look values and packed scene values per authored
static/skinned handle. It checks current packed data, flags and live textures, so
in-place input edits and external scene writes still apply. Texture replacement
retains its handle. Unknown materials retain the previous behavior. Retained typed
storage is 132 bytes per cached form (28 floats, five texture handles), plus flags
and fixed-size JS descriptors; cache cardinality cannot grow with frame history.
The changed path adds copying/allocation, which is measured below.

The sight volume contains all sampled articulated fighter and nearby pickup rays.
It uses the engine's AABB/plane primitive, with rotated bounds, conservative fade
padding and coordinate roundoff margins. Close-ceiling handling runs first;
degenerate views and non-unit rotations retain the conservative fallback.
It narrows exact queries without changing which walls fade or what collides.

### Portable results and correctness

| Work counted separately from timing | Control | Combined candidate |
| --- | ---: | ---: |
| Material updates, unchanged full frame | 1,724 | 0 |
| Material updates, 30 advancing frames | 51,720 | 25 |
| Obstruction rays, unchanged full frame | 70,739 | 21,533 |
| Obstruction rays, 30 advancing frames | 2,106,828 | 652,054 |
| World-matrix rebuilds, unchanged frame | 0 | 0 |
| World-matrix rebuilds, 30 advancing frames | 12,676 | 12,676 |

All 3,420 entity records and 1,724 material records are still visited. This removes
material writes and about 69% of exact rays, not the scene-wide discovery/copying
passes. Cache comparison itself remains linear in material count.

The focused production suite passes 74 tests / 17,903 assertions, including nested
material edits, static/skinned forms, all texture slots, pixel replacement, alpha
modes/fades, invalid values, external scene edits, rotated surfaces, extended limbs,
pickups, inside-camera cases and large-coordinate sight-volume checks. Combined
browser verification passes 602 state-oracle checks, six exact render packets and
six exact compact presentations. Corresponding images differ in at most four of
1,049,088 pixels, with maximum channel difference 1/255. This is within the existing
raster-noise gate; no visual quality reduction is accepted.

### Native focus and repeated visible timings

The initial material-only series contains a roughly 1-FPS normal-host trial despite
`document.hasFocus()` and visible page state. Main-thread task occupancy was only
8.29%. That normal series is inconclusive, preserved in `material-*`, and excluded
as a whole from acceptance. Page focus cannot establish native foreground ownership.
The completed worker portion of that earlier series measured 47.30 -> 53.52 fresh
combat FPS and p95 30.60 -> 25.90 ms for material caching alone; it predates native
foreground evidence and the independent rAF observer.

At the user's request, visible browsers now create and focus their native Windows
window on spawn. Timed runs record actual foreground HWND/PID before and after
measurement and fail if ownership is lost. Helpers remain hidden. Full-loop runs
also save an independent bounded rAF series alongside game telemetry. Focus calls
and process inspection run outside measured intervals. The initial anomaly was not
reproduced in the eight completed normal-host trials; its cause remains unproven.

The focused normal-host run uses A/B/B/A then B/A/A/B, four trials per artifact,
six seconds of warmup and eighteen measured seconds. These are medians of each
trial's fighting-phase statistics. Both variants retain full replay, learning and
save services. Hardware remains Chrome 154 / RTX 4070 Laptop / i9-13900HX, 1366x768,
DPR 1, VSync enabled, 165-Hz target. Existing workloads remain; power and thermal
state are unrecorded. No audit builds/tests overlap these serial measurements.

| Normal standalone combat | Control | Combined candidate |
| --- | ---: | ---: |
| FPS | 40.20 | **43.40 (+8.0%)** |
| Interval p50 | 24.25 ms | 24.15 ms |
| Interval p95 | 30.40 ms | 30.30 ms |
| Interval p99 | 36.35 ms | 36.40 ms |
| Presentation p50 | 17.05 ms | **15.40 ms** |
| Render submission p50 | 1.10 ms | 1.10 ms |

Throughput improves, while interval tails are essentially unchanged. This is a
measured normal-host win, not sustained 165 FPS. Every trial's native foreground
checks passed; raw trial variation is retained rather than filtered out.

Eight further focused trials isolate the added sight volume in the existing worker,
comparing material-only `candidate` against `combined` in the same mirrored order.
The combined build also bounds material-cache copies to explicit descriptor fields;
both source graphs are archived.

| Worker combat | Material cache only | Cache + sight volume |
| --- | ---: | ---: |
| Fresh FPS | 54.45 | 54.09 |
| Interval p50 / p95 / p99 | 18.20 / 25.05 / 30.90 ms | 18.20 / 24.75 / 30.40 ms |
| Worker computation p50 / p95 | 16.15 / 21.80 ms | 16.25 / 22.00 ms |
| Main presentation p50 / p95 | 4.60 / 5.90 ms | 4.60 / 5.85 ms |
| Input age p50 / p95 | 24.30 / 30.60 ms | 24.25 / 30.45 ms |
| Frame age p50 / p95 | 20.25 / 26.90 ms | 20.25 / 26.40 ms |
| Independent rAF callbacks/sec, whole window | 163.02 | 163.32 |

The incremental worker throughput result is **neutral**, not another accepted FPS
gain. Both retain 730,112-byte packets, 1,460,224 bytes across two buffers and zero
reported dropped simulation time. No heap-delta allocation claim is made. Native
foreground and runtime-error checks pass in all sixteen focused full-loop trials.
The combined engine source is retained for its normal-host gain and reduced exact
query work, with this worker limit explicit.

The independent callback rate is especially useful: main-thread polling can run
near 165 Hz while producing only about 54 fresh frames/sec. The sequential worker
still takes roughly 16 ms to produce a frame. More buffering or counting unchanged
redisplays cannot make that computation fit a 6.06-ms frame budget. Main-thread
presentation fits narrowly at p95 when presenting this lower number of fresh
frames; that does not prove it can sustain 165 fresh submissions/sec under GPU load.

The isolated CPU comparison runs control/candidate/candidate/control, two mirrored
mode repetitions in each browser, giving four trials per mode/artifact. Each warms
for 30 operations and measures 120. These fixed-state probes overlap one another
and are not additive portions of a live frame.

| CPU operation | Control p50 / p95 / p99 | Candidate p50 / p95 / p99 |
| --- | ---: | ---: |
| Apply unchanged frame | 2.95 / 3.50 / 3.80 ms | **1.20 / 1.50 / 1.60 ms** |
| Change every material, then apply | 3.05 / 3.80 / 4.00 ms | **3.95 / 4.85 / 5.20 ms** |
| Full frozen-state preparation | 14.45 / 17.05 / 18.95 ms | **12.30 / 14.25 / 15.80 ms** |
| Obstruction stage inside preparation, p50 | 3.80 ms | 3.20 ms |

The synthetic all-changing case deliberately alternates all 1,724 opacities every
frame and includes identical input-object construction. Caching costs about 0.90 ms
there (+30% p50), so it is not a universal win for material-heavy animation. The
measured city workload is mostly unchanged and benefits substantially. A future
adaptive bypass or reusable cache storage must measure mixed change rates and the
full loop; it cannot be justified from cache-hit timings alone.

Current artifacts: normal runtime
`9dc23df93cb828296b5cc6486d3783461fa9909a9ec5cdf9b7d12b458ebe44e7`,
worker runtime `32adddb5912c489bd00d63fece2a140b60bd9d242c6c70382c1f3115e935d506`.
The per-artifact manifests and frozen source maps own the complete graphs.

Engine build, installed-package consumer smoke, focused source/test/spike
typechecking, changed engine lint and process policy pass. All owned browser
cleanup reports are empty; the shared server has no unresolved errors and remains
running. The full bundle gate still fails the same 168 pre-existing categories.
Against the previous saved package report, native `project-runtime-3d.js` grows
4,254 raw / 1,478 gzip bytes (rebundled: 4,249 / 1,484); standalone grows 4,237 /
1,594 (rebundled: 4,241 / 1,632). The three tooling entry graphs grow 2,842 raw each;
the saved bundle report includes their compressed and rebundled measurements.
Source-structure checking retains three unrelated directory failures in game-art,
city authoring and the PadPilot evaluator. These failures are not reported as green.

### Next experiment boundary

1. Prebind fighter/scenery identities and separate stable scene data from changed
   records. Count scene-wide scans and copies removed, then compare full combat.
   Preserve changes to remote props, shadows, fades and physics independently of
   render visibility. This is also where to test cache bypass/reuse at mixed material
   change rates rather than assuming every game has this city's hit rate.
2. Separate directed pose math from discovery and mutation. Only then split coarse,
   independent numeric jobs across 1/2/4/8 workers, including synchronization,
   transfer, contention, input age and bounded queue/storage costs. Main-thread rAF
   readiness is now observable; worker production rate remains the limiting signal.
3. Separate HUD, post-processing and context-copy costs with the real GPU path.
   The previous cached-scene-plus-HUD probe misses 165 Hz even without preparation,
   so faster workers alone cannot establish the final display target.

The worker is still a local experiment because its full menu/replay/wardrobe and
policy-activation integration is incomplete and it retains a second world. These
source optimizations benefit the existing normal host without waiting for that
integration. The shared playable must be rebuilt later to pick up source changes.
