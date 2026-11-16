# October 10: isolated light-volume culling

**Reject this variant for the tested depot workload.** It removes no shadow draws
or upload bytes across the complete replay, adds CPU work/storage and fails
same-version normal-MSAA repeatability. This does not reject light culling for
other scene shapes. No production default changed; 165 Hz gameplay remains unproven.

## Controlled comparison

Camera culling is enabled on both sides. The candidate additionally culls the
sorted shadow stream against the light volume. Both preserve original command
order, resource checks, simulation, preparation and all gameplay services.
Their worker binaries are identical. The archive recipe rejects unrelated engine
changes and changed prerequisites; it never restores archived files into the
dirty engine worktree.

Depot seed 2026, visible/focused RTX 4070 Chrome, 1366 by 768, DPR 1, normal MSAA,
AC and the unchanged high-performance power scheme. Eight serial ABBA/BAAB trials
use six-second initial warmup, restore, a complete contiguous warmup, then 661
fixed FIFO samples at 165 logical Hz with two buffers and a 15-second bound.
The runner uses `park-restore-clear-v2`. Every trial passes fixed state/tick/pose,
FIFO, wake/focus and qualified cleanup checks. No concurrent audit build, test,
profile, readback or second browser ran during timing.

| Experiment | Expected signature | Measured result | Uncertainty / images | Decision |
| --- | --- | --- | --- | --- |
| Light culling added to camera culling | Fewer shadow draws/instances/uploads offset added traversal/copying | All five tracked render counters identical at every one of 661 samples; CPU submission rises | Capacity +0.18%, exploratory 95% interval −3.14% to +3.62%; 6/12 same-version MSAA comparisons non-exact | Reject for this workload |
| Separate work-count diagnostic | Confirm active culling, fallback and storage costs | Active, no fallback, zero rejected instances at 0/60/240 | State/packet/render counters match original candidate; not timed | Confirms avoidable work |
| Matching AA-off diagnostic | Separate raster variation from state changes | Exact state/packet sequence; 0/12 same-version and 0/3 cross-version image differences | Three checkpoints only; does not establish normal-AA determinism | Retain diagnostic only |

## Work and storage

All 5,288 timing samples are retained. The four runs of each artifact repeat their
per-sample counts exactly. Cross-artifact draws, shadows, outlines, material
bindings and upload bytes are also identical at every sample. Mean counts are
1,258.02 total draws, including 982.74 shadows and 62.09 outlines, 230.21 material
bindings and 140,618.36 upload bytes. Packet storage is unchanged: 725,316 bytes
per packet and two transfer buffers totaling 1,450,632 bytes.

An independent instrumented capture confirms the shadow output is separate storage,
with no capacity fallback and no alias to the input matrices:

| Checkpoint | Source / retained instances | Source / retained shadow commands | Extra sphere tests | Extra matrix values copied |
| --- | ---: | ---: | ---: | ---: |
| 0 | 1,793 / 1,793 | 850 / 850 | 1,793 | 28,688 |
| 60 | 1,823 / 1,823 | 1,066 / 1,066 | 1,823 | 29,168 |
| 240 | 1,846 / 1,846 | 889 / 889 | 1,846 | 29,536 |

These counts follow the observed inputs and the archived helper's loops. No
deforming instances occur here. The extra light pass visits the command list
twice, performs one mesh and bounds-cache lookup per positive command, copies
every retained matrix and scene handle, six values per retained command and 144
light values, and creates three temporary light subviews. Matrix copies alone
represent 114,752 / 116,672 / 118,144 logical bytes. They are not measured RAM-bus
traffic; neither cache misses nor physical bandwidth was observed.

The additional shadow view exposes **11 typed arrays with 11 backing buffers,
503,640 bytes total**, at capacities 3,961 commands, 6,000 instances and eight
lights. This excludes hidden compiler scratch, frustum arrays and the mesh-bounds
cache; it is not a complete retained-heap or working-set measurement. Bounds
mutation/resource invalidation and skinned-scene coverage remain incomplete.
The diagnostic adds scans/objects of its own and is excluded from throughput.

The authored sunlight volume is fitted once around the city, tall objects and
launched fighters. That design is consistent with the observed absence of
rejections. Restricting the volume would change shadow coverage and needs a
separate visual/gameplay experiment; it is not part of this comparison.

## Timing and remaining evidence

| Median of four trials | Camera-only control | Camera plus light culling |
| --- | ---: | ---: |
| Fixed-work capacity, samples/s | 104.23 | 103.86 |
| Capacity range / median | 3.09% | 4.70% |
| WebGL CPU submission p50, ms | 1.50 | 1.60 |
| Whole main update p50, ms | 3.20 | 3.40 |
| Worker preparation / compute p50, ms | 5.90 / 7.60 | 5.95 / 7.60 |
| Submission interval p95 / p99 / p99.9, ms | 17.45 / 18.30 / 24.75 | 17.60 / 18.50 / 24.85 |
| Missed 6.06 ms submission deadlines | 78.64% | 78.94% |

CPU submission is worse in all four adjacent pairs. Its paired lower-is-better
ratio effect is −7.66% [−12.01%, −3.10%]; this is not a percentage of total frame
time. Capacity and submission-tail effects remain inconclusive. Empty rAF is
165.02 Hz with 0.05% spread, with no sleep indication. This does not explain the
earlier 130 Hz behavior or prove physical scanout.

Input-packet poses repeat 77.27% of transitions, with a longest repeat run of 49.
Those identities precede renderer-local culling; they do not count distinct
visible poses. Four logical seconds take 6.24–6.54 real seconds in this capacity
lane. None of these numbers is live input latency or proven display presentation.

Normal-AA correctness captures compare 241 samples per owner and match complete
state, numeric packet and presentation sequences. Cross-version images differ by
0/16/3 pixels, maximum channel difference 2; those differences are allowed by the
revised owner contract. Same-version repeat failures occur at 60 and 240 for the
control and at 60 for the candidate, in raw and composited captures. They remain
failures even though the matching AA-off capture is exact.
These are packet-redraw checks, not proof that every underlying GL instruction
and GPU state value was identical in this cohort. Complete instruction/state
equivalence and the cause of MSAA variation remain separate evidence gaps.

Asynchronous GPU timing was not enabled in this throughput cohort. Existing GPU
queries also enable preparation diagnostics, so their results would require a
separate cohort. With no draw/upload reduction and confirmed extra CPU work,
further GPU timing is not needed to reject this depot candidate. Device time,
in-window clocks/utilization, CPU temperature and hardware memory counters remain
unobserved here. Saved GPU boundary telemetry cannot establish in-window behavior.
Other arenas, sustained memory/thermal behavior, general mutation and live motion
are still outside this short screen. Keep GPU attribution focused on candidates
that actually remove work, including shadow batching and material-table rendering.

## Reproduction and evidence

Owner: engine performance audit. Root:
`.local/engine-perf/light-culling-rescreen-20261010/depot/`.
Retain recipes, builds, raw rows, images, diagnostics and cleanup receipts until
replacement evidence preserves provenance and the current decision.

Use `rendering/archive-renderer-recipe.ts` with that `PERF_ROOT`,
`PERF_FROZEN_SOURCES=.local/engine-perf/material-table-20261010/roof/control/sources.json`,
`PERF_RENDER_ARCHIVE=.local/engine-perf/ceiling-20261009`,
`PERF_RENDER_VARIANT=view-cull-ordered` and
`PERF_RENDER_CONTROL=camera-cull-ordered`. Build both with the depot HTML from
`incremental-20261009/depot-control/index.html` and `PERF_REBUILD_RENDERER=1`.
Control uses the generated control graph/patches; candidate uses its variant pair.

Capture `correctness` and `aa-off` through `verify.ts` with artifacts
`control,view-cull-ordered`, depot-2026 workload, checkpoints `0,60,240`, capture Hz
60, provenance, retained state, full visual sequence, image layers, visible
high-performance RTX 4070 and `PERF_KEEP_AWAKE=1`. Generate image plans through
`archive-renderer-results.ts`, decode using `image-parity.ts` and report with
`PERF_RASTER_CONTROL=correctness` for AA off.

`awake-light-plan.json` records the exact timing configuration above. Use
`compare.ts`, then `ablation-results.ts` with control artifact `control`, candidate
`view-cull-ordered` and the first matching-service trial as `PERF_FIXED_REFERENCE`.
Set `PERF_TIMING_PREFIX=awake-light` when regenerating the renderer report.
`control-drift.ts` with `PERF_REPORT=awake-light` saves eight rows in
`control-drift.json`; it does not convert broad before/after counters into replay-only
CPU or memory measurements.

For the structural capture, `view-work-recipe.ts` reads the built candidate's
`sources.json`; build `view-cull-counts` with its patch and the same HTML. Run
`verify.ts` with prefix `work-counts`, artifacts `control,view-cull-counts` and
`PERF_CAPTURE_CONTROL=correctness`. `view-work-results.ts` validates the new
candidate capture against the original candidate and writes `work-counts-view-work.json`.
The reused control is explicitly recorded as archived evidence, not another run.

The focused rendering-tooling TypeScript check and process policy pass. All 31
owned-browser cleanup receipts are creation-qualified and empty; the shared
managed server remains healthy with no unresolved errors. Raw evidence includes
all completed trials, both raster captures and the separate structural capture.
