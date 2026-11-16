# October 10: awake camera culling and shadow batching

**Both remain experimental.** Work counts and CPU submission improve, but neither
cohort demonstrates a stable full-pipeline gain or passes same-version MSAA
repeatability. No 165 Hz or production-promotion claim.

Private archive rescreens, not production changes. The owner's revised contract
permits cross-version image differences but requires each renderer version to
reproduce its own output. Camera culling and shadow batching are tested separately
with fresh simulation/preparation, full services and normal MSAA for timing.

## Controlled builds and correctness

`rendering/archive-renderer-recipe.ts` applies only the declared archived engine
modules to the current frozen graph and rejects changed prerequisites. Camera
culling also extracted shared frustum math; both sides receive that refactor so
their worker binaries are identical. The initial unshared control failed this
build-identity check before any capture/timing; its manifest is retained.
Shadow batching changes only the shadow-pass module. No archived file is restored
into the dirty engine worktree.

Depot seed 2026, visible/focused RTX 4070 Chrome, 1366 by 768, checkpoints 0/60/240
after 241 logical samples at 60 Hz per owner. Each version/raster pair passes 482
independent gameplay and pose checks, with exact complete state, numeric packet
and presentation sequences. Raster experiments retain those same sequences.

| MSAA diagnostic | Cross-version changed pixels at 0/60/240 | Same-version non-exact comparisons |
| --- | --- | --- |
| Camera culling | 0 / 18 / 32; maximum channel difference 2 | 4/12: candidate checkpoints 60 and 240, raw and composited |
| Shadow batching | 0 / 20 / 6; maximum channel difference 2 | 8/12: both versions at 60 and 240, raw and composited |
| Matching AA-off replays, each candidate | All three exact | 0/12 for each candidate/control pair |

The normal-AA repeat failures remain failures; exact AA-off diagnostics do not
pass normal-AA repeatability. These short captures do not establish sustained
determinism, six-arena coverage, changing resource correctness or skinned crowds.
No skinned instances are submitted at these checkpoints.

## Work avoided and retained

| Checkpoint | Control surface / shadow draws | Camera-cull surface / shadow draws | Shadow-batch surface / shadow draws |
| --- | ---: | ---: | ---: |
| 0 | 850 / 850 | 189 / 850 | 850 / 260 |
| 60 | 1,066 / 1,066 | 224 / 1,066 | 1,066 / 312 |
| 240 | 889 / 889 | 210 / 889 | 889 / 311 |

Surface counts exclude outlines. Culling preserves the sorted full shadow stream,
filters main instances without changing their order, and leaves deforming meshes
visible. It still sorts the full stream, scans public material flags for outline
padding, tests packet matrices and copies retained commands/matrices into bounded
renderer storage. At the checkpoints it adds 21,824 / 23,936 / 24,960 GPU upload
bytes because separate shadow/main views require separate matrix uploads.
Main/outline triangle counts fall from 101,108 / 115,688 / 112,496 to
42,548 / 57,164 / 55,448. These exclude shadow geometry.

The culling helper's per-mesh bounds use a WeakMap and allocate a four-float
sphere on first use. In-place mesh geometry/bounds mutation is not covered by
this cache's invalidation contract. Temporary light subviews and retained scratch
remain costs; bounds and record access counts are not hardware cache/RAM metrics.
Complete retained heap and working set need measurement.

Shadow batching merges adjacent contiguous ranges with equal mesh, flags,
skeleton and effective opacity, preserving primitive order. It reduces dispatch
and uniform calls while keeping geometry and upload bytes unchanged. It still
visits command boundaries; fewer draws do not imply fewer submitted primitives
or a measured GPU-device gain.

## Paired timing results

Each completed eight-trial cohort retains 5,288 samples, exact final state and
tick/step/pose transitions, empty FIFO queues, wake/focus checks and empty
creation-qualified cleanup. Per-sample renderer counts repeat exactly across
each artifact's four trials. Packet storage is unchanged: 725,316 bytes per
packet and two retained transfer buffers totaling 1,450,632 bytes.
Pose-transition checks describe the input packet before renderer-local culling;
an offscreen changing instance can advance that identity. They validate the held
workload, not distinct visible poses or physical presentation.

| Median of four trials | Culling control / candidate | Shadow control / candidate |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 96.91 / 100.29 | 99.75 / 100.50 |
| Capacity range / median | 8.40% / 9.13% | 11.88% / 7.56% |
| WebGL CPU submission p50, ms | 2.10 / 1.50 | 2.10 / 1.80 |
| Whole main update p50, ms | 3.95 / 3.30 | 3.95 / 3.60 |
| Worker preparation p50, ms | 6.15 / 6.05 | 6.20 / 6.15 |
| Submission interval p95 / p99 / p99.9, ms, control | 17.80 / 18.65 / 22.25 | 17.75 / 19.10 / 24.25 |
| Submission interval p95 / p99 / p99.9, ms, candidate | 17.80 / 18.50 / 24.95 | 17.85 / 18.60 / 24.30 |
| Missed 6.06 ms submission deadlines | 81.21% / 82.95% | 78.71% / 79.17% |

Camera culling's paired capacity effect is **+2.12%**, exploratory 95% interval
**[-4.86%, +9.61%]**. Shadow batching is **+1.40% [-9.42%, +13.51%]**. Both fail
uncertainty and variation gates. CPU submission improves in every pair, agreeing
with the avoided calls, but this does not prove a critical-path or device-time win.
Submission p95 effects are also inconclusive. CPU and GPU durations are not added.

Across the timed replay, culling reduces total draws (including shadows) from
2,044.61 to 1,258.02 and material bindings from 1,021.52 to 230.21 per sample.
It retains all 982.74 shadow draws and adds 23,784.86 upload bytes on average.
Shadow batching instead reduces total draws to 1,361.78 and shadow draws to
299.90; material bindings, surface/outline work and uploaded bytes are unchanged.

Empty rAF medians are 165.03 / 165.00 Hz, with 0.07% / 1.00% spreads. There is no
sleep indication; this does not prove scanout or explain the CPU capacity drift.
GPU-device timings were not captured, CPU temperature and hardware memory
counters remain unavailable, and boundary telemetry cannot attribute in-window
clock behavior. These are fixed-work capacities, not live gameplay FPS or distinct
visual motion. Independent sessions, resource invalidation, within-version images,
native-viewport/six-arena stress and latency remain open.

## Reproduction and evidence

### Warmup boundary repair

The initial shadow cohort `awake-render` stopped before its second measurement.
The failed attempt retained replay indexes 20–660 (641 rows) after reaching the
final replay index. It had no gameplay error, no sleep indication, visible/focused
state and empty qualified cleanup. Its failure JSON, screenshot and first control
remain archived; they are not combined with the replacement cohort.

The game activity handler can resume a worker parked by the runner when a native
focus probe emits an activity event. Clearing rows afterward can lose a replay
prefix. The original event itself was not traced. A separate browser regression
dispatches the same focus handler while parked, observes 20 produced samples,
then verifies the repair through 661 complete warmup and 661 measurement samples,
exact final gameplay/pose transitions and successful cleanup. Its diagnostic
timings are not performance evidence.

The runner now parks, restores and clears after native/observer setup, and retains
samples that arrive between page calls. Plans record `park-restore-clear-v2`;
resume and aggregation reject mixing boundary protocols. Validator tests reject
missing/mismatched boundary state or timestamps. The replacement shadow prefix
is `awake-render-boundary`; culling's earlier eight valid trials keep their
original protocol and results. `warmup-resume-regression` retains the injected
case (`PERF_WARMUP_RESUME_PROBE=1`, requiring diagnostic mode). This repair explains
how the invalid warmup can occur; it does not explain the remaining control drift.

### Commands

Owner: engine performance audit. Roots:
`.local/engine-perf/culling-rescreen-20261010/depot/` and
`.local/engine-perf/shadow-rescreen-20261010/depot/`. Retain builds, recipes, captures,
failed comparisons and raw rows until replacement evidence preserves provenance.

Generate with `rendering/archive-renderer-recipe.ts`, explicit `PERF_ROOT`,
`PERF_RENDER_ARCHIVE=.local/engine-perf/ceiling-20261009`,
`PERF_FROZEN_SOURCES=.local/engine-perf/material-table-20261010/roof/control/sources.json`,
and variant `camera-cull-ordered` or `shadow-batch`. Build using the existing
worker builder, `PERF_REBUILD_RENDERER=1` and the depot base HTML from
`incremental-20261009/depot-control/index.html`. Control receives the generated
control patches; candidate receives the variant graph and complete patches.
Require identical worker hashes before proceeding.

`verify.ts` uses artifacts `control,<variant>`, the depot-2026 workload,
checkpoints `0,60,240`, capture Hz 60, provenance, retained state, complete visual
sequence, image layers, visible high-performance GPU and `PERF_KEEP_AWAKE=1`.
Prefixes are `correctness` and `aa-off`; the latter sets `PERF_RASTER_MODE=aa-off`.
`archive-renderer-results.ts` plan mode generates five image comparisons for
`image-parity.ts`. Reporting validates manifests, wake/cleanup, state/packet parity
and work; set `PERF_RASTER_CONTROL=correctness` for the AA-off report.

Timing uses the prefixes above, eight `worker-2-fresh` entries in ABBA/BAAB order,
six-second warmup, reset/contiguous warmup, 661 fixed FIFO samples at 165 logical
Hz, 15-second bound, full services and timer scheduling. Require visible focused
RTX 4070 Chrome, provenance, AC/power inventory and bounded wake requests. No
readback, profile, build or test runs during timing. The renderer ablation reporter
uses the first matching-service trial as its fixed-work reference. Rerun the
archive renderer report with `PERF_TIMING_PREFIX=awake-render` to require identical
per-sample work counts across each artifact's trials and the appropriate unchanged
passes between artifacts. Set both `PERF_TIMING_PREFIX` and the drift reporter's
`PERF_REPORT` to the actual completed cohort prefix.

Twenty focused tests / 106 assertions, the rendering-tooling TypeScript check,
process policy and the real browser resume regression pass. Both completed
cohorts have eight qualified empty cleanup receipts and eight retained drift rows;
the shared managed server has no unresolved errors.
