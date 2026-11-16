# Bound fighter presentation and independent work ceilings

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Bound fighter presentation and independent work ceilings

Evidence: `.local/engine-perf/bindings-batches-20261006/`. This campaign compares
the previous combined material/sight-volume build with a fixed-ID frame selection
in fighter presentation. The engine primitive checks cached record slots against
current IDs and returns live records in a fresh array. Reordering, replacement and
missing/reappearing IDs fall back to one temporary index. It retains numeric slots,
not old evaluated frames. The host also prebinds authored weapon lookup and skips
wall discovery when there is no wall interaction.

Repeated fighter-presentation searches now visit **412 instead of 3,420 records**.
The selected records still belong to the complete evaluated frame. Physics,
scenery preparation, shadows, material application and remote changes retain
their existing scope. This is not proximity culling of simulation. Other stages
still build and inspect whole frames; this campaign does not eliminate those copies.

### Accepted full-loop comparison

Both normal and worker hosts use A/B/B/A then B/A/A/B: four trials per artifact,
six seconds of warmup, eighteen measured seconds. All sixteen trials completed
with native foreground ownership and no runtime errors. Hardware remains visible
Chrome 154, RTX 4070 Laptop, i9-13900HX, 32 logical CPUs, 1366x768 at DPR 1 and
VSync enabled. Existing workloads remain; power and thermal state are unrecorded.
No audit builds or tests overlap timing. Statistics below are medians of each
trial's fighting-phase statistics, not the whole-window callback rate.

| Normal standalone combat | Control | Bound presentation |
| --- | ---: | ---: |
| FPS | 45.15 | **51.33 (+13.7%)** |
| Interval p50 / p95 / p99 | 23.35 / 30.20 / 31.85 ms | **18.20 / 24.40 / 30.10 ms** |
| Presentation p50 / p95 | 14.80 / 17.75 ms | **12.65 / 14.65 ms** |
| CPU p50 / p95 | 19.60 / 25.85 ms | **17.35 / 22.30 ms** |
| Render submission p50 / p95 | 1.10 / 1.50 ms | 1.10 / 1.50 ms |

| Existing two-buffer worker combat | Control | Bound presentation |
| --- | ---: | ---: |
| Fresh FPS | 58.00 | **67.64 (+16.6%)** |
| Interval p50 / p95 / p99 | 18.10 / 24.35 / 30.20 ms | **12.30 / 23.15 / 24.45 ms** |
| Worker computation p50 / p95 | 15.30 / 19.75 ms | **13.40 / 16.25 ms** |
| Worker presentation p50 / p95 | 11.45 / 13.60 ms | **9.55 / 11.30 ms** |
| Main presentation p50 / p95 | 4.35 / 5.10 ms | 4.40 / 5.20 ms |
| Input age p50 / p95 | 24.20 / 30.25 ms | **18.40 / 24.60 ms** |
| Frame age p50 / p95 | 19.40 / 24.35 ms | **17.05 / 21.45 ms** |
| Independent rAF callbacks/sec | 164.04 | 164.07 |

Packets remain 730,112 bytes, with 1,460,224 retained bytes across two buffers.
Reported dropped simulation time is zero. The candidate supersedes a median two
packets per measured window, versus zero in control; it does not queue extra world
states. Heap snapshots are retained as diagnostics, not an allocation-rate claim.
The source change is retained for clear full-loop gains and improved interval tails.
The worker host remains a private experiment with the integration limits described
in the earlier worker sections; this does not enable a production worker setting.

### Isolated CPU and correctness

Four accepted trials per mode/artifact, 30 warmup operations and 120 measured
operations per trial. The complete browser sequence is control/candidate/candidate/
control; interrupted operations are retried and saved separately. `directed` clones
its input outside the timer, which excludes copy time but can still affect GC.
These probes overlap and cannot be added as independent portions of a live frame.

| CPU operation | Control p50 / p95 / p99 | Candidate p50 / p95 / p99 |
| --- | ---: | ---: |
| Fighter presentation | 2.90 / 4.66 / 5.70 ms | **0.85 / 1.20 / 1.53 ms** |
| Complete frozen preparation | 12.20 / 14.92 / 17.05 ms | **9.93 / 11.81 / 13.30 ms** |

The portable selection test reads exactly two slots to select two current records
from 3,420 after binding. Focused checks pass 23 tests / 4,413 assertions, including
record lifetime, reorder/removal, wardrobe and native pose behavior. Browser parity
passes 602 state checks, six exact numeric packets and six exact compact
presentations. Images differ in at most three of 1,049,088 pixels, with maximum
channel difference 1/255. No visual reduction is accepted.

Initial `cpu-2` and `focused-cpu-3` attempts lost native foreground and were
aborted. The user confirmed switching browser windows. They are excluded from
acceptance, and three further interrupted CPU operations are archived in
`*-rejected.json`. Runners now retain and retry focus interruptions up to three
attempts; reports reject incomplete sequences and failed foreground checks.
Focus changes are not evidence of engine regression. All full-game trials passed
on their first attempt. Native checks bracket each sample; they are not continuous
OS focus traces.

### Independent query workers: no normal-tier wall-time win

The private `spikes/scene-batches` kernel captures **80 admitted queries and 278
targets** from real obstruction preparation. It calls the original engine local
transform and ray/box primitives and validates every answer against the original
obstruction pass. Each worker has one transferable Float64 buffer and one batch
in flight. Query count is partitioned evenly; target data repeats per worker.
Packing, dispatch, waiting and collection count toward wall time. Worker compute
time alone is not the decision metric.

Each tier has four mirrored repetitions per mode, 30 warmup batches and 120
measured batches. The contended tier adds eight workers, each doing at least 4 ms
of real query work followed by a 4-ms timer rest, on top of the existing desktop
load. It is a bounded contention probe, not a model of every AI workload.

| Batch mode | Normal wall p50 / p95 / p99 | Contended wall p50 / p95 / p99 |
| --- | ---: | ---: |
| Original objects, inline | **0.30 / 0.40 / 0.50 ms** | 0.40 / 0.60 / 0.70 ms |
| Packed, inline | 0.40 / 0.60 / 0.73 ms | 0.60 / 0.85 / 1.02 ms |
| One worker | 0.40 / 0.60 / 0.79 ms | 0.50 / 0.65 / 0.75 ms |
| Two workers | 0.30 / 0.50 / 0.69 ms | 0.40 / 0.55 / 0.60 ms |
| Four workers | 0.30 / 0.50 / 0.63 ms | 0.35 / 0.50 / 0.59 ms |
| Eight workers | 0.35 / 0.60 / 0.68 ms | 0.33 / 0.50 / 0.58 ms |
| One worker, transport only | 0.18 / 0.30 / 0.43 ms | 0.18 / 0.30 / 0.30 ms |

Clock resolution is about 0.1 ms; interpolated statistics do not imply extra
measurement precision. Packing p50 rounds to zero, which does not mean it is free.
Normal-tier worker compute drops from 0.30 to 0.10 ms with four/eight workers, but
wall time does not beat the 0.30-ms inline baseline and its p95 is worse. The
contended tier saves only about 0.05–0.10 ms with four/eight workers. This does not
justify a public worker pool or a default gameplay change for these queries.

One/two/four/eight workers retain 16,928 / 23,616 / 36,992 / 63,744 transferable
bytes per batch; round-trip traffic is twice that capacity. Eight contention
workers additionally retain eight complete 16,928-byte input buffers. The inline
modes also allocate one scratch packet for this probe, even when the object path
does not use it. Normal-tier worker startup is 4.85 / 7.40 / 9.70 / 15.00 ms,
excluded from warm batch timings and retained in the report. Contended startup
includes creation/readiness of the competing workers. Worker heaps are not
included in packet-byte counts. All worker resources are disposed after each case.

The exact math is a small part of the multi-millisecond obstruction stage. This
points the next investigation toward traversal, grouping, lookups, fades and
frame application around it. The isolated kernel is an optimistic ceiling;
subtracting it from another probe does not precisely attribute the remainder.
All 56 timed batch cases pass parity and native foreground checks.

### HUD, post-processing and cross-context copy

Twenty frozen-scene cases (five modes, four mirrored repetitions) use 1.5 seconds
of warmup and four measured seconds per case. They retain the real camera/light
commands, shadows and materials. HUD pixels remain visible in every case; the HUD
variant adds its update callback. Post overlays are hidden in modes without post
processing. `copy-only` adds an opaque full-size Canvas2D copy of the WebGL canvas.

| Cached-scene operation | Redraws/sec | CPU p50 / p95 | Renderer GPU p50 / p95 |
| --- | ---: | ---: | ---: |
| Renderer | 164.41 | 0.85 / 1.10 ms | 2.08 / 3.93 ms |
| Renderer + HUD updates | 164.45 | 2.25 / 2.65 ms | 2.12 / 4.11 ms |
| Renderer + Canvas2D copy | 164.79 | 0.90 / 1.15 ms | 1.80 / 2.77 ms |
| Renderer + post | 164.54 | 1.05 / 1.30 ms | 1.62 / 2.09 ms |
| Renderer + post + HUD | 164.79 | 2.45 / 2.90 ms | 1.55 / 1.90 ms |

All modes are effectively refresh-limited here, with interval p95 6.2 ms. These
small rate differences are not optimization wins. HUD callback p50 is 1.40 ms;
post callback p50 is 0.20 ms. The bare-copy callback p50 is below clock resolution,
not zero work. GPU queries cover only the renderer context, excluding Canvas2D
effects and compositor work. CPU/GPU durations overlap and cannot be added.
Lower renderer GPU readings with an overlay do not prove that post-processing
accelerates rendering.

The earlier roughly 125-Hz combined redraw result is **not reproduced** under this
focused campaign. It is not a fixed hardware ceiling. Source, focus handling and
environment differ across campaigns, so this comparison cannot establish why it
changed. The current real render path reaches monitor cadence when given a frozen
frame, including the actual HUD/post callbacks. Moving combat still needs new
poses, commands, uploads and simulation; frozen redraws do not prove 165 fresh
combat frames/sec. All twenty cases pass foreground and runtime-error checks.

### Decision and next experiments

1. **Retain bound fighter presentation.** It improves both complete hosts without
   a quality change. Next extend stable identity binding into scene/material/fade
   bookkeeping and compare an immutable scene base plus changed-frame records.
   Count full scans, copied bytes and changed records; verify remote scenery,
   material mutation, culling, shadows and collision independently of camera view.
   The current worker still spends 9.55 ms in presentation and 13.40 ms producing
   a frame, against the total 6.06-ms target.
2. **Measure HUD updates that skip unchanged work.** The 1.40-ms cached update is
   a meaningful main-thread cost. Preserve changing health, names, emblems and
   projection positions. The current evidence ranks this above a post-processing
   rewrite; retain effects while measuring. Main presentation currently fits
   narrowly at p95, but more frequent fresh frames can change that.
3. **Keep exact query math inline.** Four/eight cores help this tiny batch slightly
   under contention, but the handoff cost consumes the normal-tier gain. Revisit
   a bounded engine scheduler only with larger independent jobs and complete
   conversion/lifecycle costs. Neither more polling nor a third buffer can shorten
   the current serial production path. The existing worker host's shipping work
   remains separate from adding more query workers.

Engine build, installed-package consumer, focused source/test/spike typechecking,
changed-source lint and process policy pass. Worker-source reproduction matches
both archived worker binaries byte-for-byte; source graphs and manifests remain
beside the raw measurements. The full bundle gate retains the same 168 existing
failure categories, with no new category. Native `project-runtime-3d.js` grows
406 raw / 165 gzip bytes (rebundled 406 / 162); standalone grows 686 / 258
(rebundled 707 / 177). Complete graph measurements include shared files and tooling.
Source-structure checking retains the three unrelated directory failures recorded
in the preceding campaign. These broader gates are not reported as green.

All owned-browser cleanup records are empty. The shared managed playable remains
running; this campaign uses private artifacts and does not replace its deployed
document. Current normal source artifact:
`5175a3efefe71fc677cefe1fad606befce4e91a2244a1107adb0b3e62c2c8d4a`;
worker-host runtime artifact:
`9fbf39be981e8d1ea7690c505f02f46a47a4798a96605a5b10c65771df4909e6`.
