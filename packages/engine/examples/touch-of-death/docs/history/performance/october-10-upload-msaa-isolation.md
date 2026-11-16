# October 10: upload bytes and minimal MSAA isolation

**The reproduced material-ID upload difference is confined to unused opaque
slots. The full game still varies; a small fixed-resource MSAA scene does not.**
This closes an input-evidence gap from the [shader screen](october-10-shader-repeatability.md),
without identifying the raster failure or promoting a renderer. These are manual
readback diagnostics, not performance trials. 165 Hz fresh motion remains unproven.

## Controlled results

Chrome 154.0.8037.58, RTX 4070 Laptop, visible/focused physical-monitor sessions.
The full game uses rooftop seed 714, 1366 x 768, DPR 1, normal four-sample MSAA,
60 Hz logical publications and checkpoints 0/60/240. The synthetic fixture uses
512 x 288 backing pixels. No driver or power-plan settings changed.

| Hypothesis | Controlled observation / expected signature | Result | Decision and uncertainty |
| --- | --- | --- | --- |
| Cross-context ID-table differences affect sampled materials | Retain exact upload bytes and the planner's used transparent ranges; locate every differing word | 189 differing words at each checkpoint, all opaque slots; zero differences in sampled transparent slots or other copied blobs | Explains the reproduced upload gap. The old capture retained only hashes, so its individual offsets cannot be recovered retroactively. |
| Same-context redraws change their upload inputs | Compare nine synchronous draws per checkpoint, including retained bytes | All 54 draws have stable per-owner state/call/upload hashes; full game still fails 14/48 raw-image transitions | Changing upload arguments do not explain these failures. Complete resident GPU state remains unobserved. |
| Normal MSAA varies even for a small fixed-resource scene | Two fresh browser sessions, two fixture versions, normal/disabled/explicit AA, controlled warmup | 396/396 adjacent raw-frame comparisons exact across 12 contexts; six corresponding cross-session sequences also exact | No unconditional MSAA failure reproduced. This does not exonerate the backend for the full workload or pass game determinism. |

The observations are bounded failure reproductions and fixture checks, not
independent Bernoulli samples or timing estimates. No confidence interval for a
population failure rate or performance improvement is inferred.

## Material-ID evidence

The recorder now optionally exports detached argument bytes, preserving its
32 MiB/render and 100,000-call limits. Hash-only behavior remains the default.
Serialization happens after the synchronous redraw sequence. The private recipe
also snapshots the table planner's transparent ranges. Both features allocate and
must remain outside throughput measurements.

| Checkpoint | Live instances | Transparent slots read | Differing opaque words | Differing inactive words |
| --- | ---: | ---: | ---: | ---: |
| 0 | 1,946 | 1,446 | 189 | 0 |
| 60 | 1,963 | 1,466 | 189 | 0 |
| 240 | 2,097 | 1,606 | 189 | 0 |

The table has 6,144 slots and uploads all 24,576 bytes. Its planner only writes
transparent ranges, retaining prior values elsewhere. The vertex shader fetches
`base + gl_InstanceID` only while the table is enabled; opaque draws disable it.
All differing words are outside those fetched ranges. Clearing them would add
writes without addressing the observed same-context failure. This is a source
and upload-input conclusion, not a readback of GPU-resident table contents.

Every draw copies 469,536 argument bytes into the recorder: 594 saved blobs across
54 draws, totaling 25,354,944 bytes. These include whole typed-array arguments,
including unused capacity. They are neither GPU-transfer totals nor measured
CPU-cache/RAM-bus traffic. No resource checks were removed.

The instrumented table control fails 12/24 raw pairs, at most 34 changed pixels
and channel delta 10. The instrumented unlit version fails 2/24, at most eight
pixels and delta one. After compositing, the same pair counts fail, with a control
maximum of 67 pixels. All 96 raw/composited comparisons have equal observed
state/call/upload hashes within their owner. Different version/context failure
counts are not a robustness ranking.

Numeric verification passes 482 publications against the independent simulation
oracle, 964 endpoint checks, 482 repeated-pose checks, 482 audio-once checks and
241 inline source-mutation probes. State and presentation sequences also match
the archived shader-screen reference. Both producer binaries retain SHA-256
`8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.

## Fixed-resource fixture

The fixture owns one program, VAO, vertex buffer and 4 x 4 RGBA8 texture. It draws
360 vertices in two calls, with depth, overlapping translucent triangles and
interpolated attributes. The lit version adds normalized lighting, bounded rim
math and filtered texture sampling; the flat version keeps geometry/transparency.
Resources are initialized once per context. Shader/resource hashes, setup state,
draw calls, raw RGBA hashes and first/differing raw observations are retained.

Each fresh context receives eight rAF warmup draws, followed by 17 synchronous
draw/readbacks and 17 rAF-separated draw/readbacks. The 33 comparisons include
the schedule boundary. There are 132 exact comparisons per target: default 4x
MSAA, AA off, and explicit RGBA8/DEPTH_COMPONENT24 4x MSAA with color resolve.
All observed state/call hashes repeat within each context. Corresponding images
also match across sessions; default and explicit MSAA images happen to match in
this fixture. No cross-version equality is required by the acceptance contract.

`readPixels`, hashing and command recording deliberately perturb execution and
can force completion. No throughput, GPU budget, presentation latency or physical
screen cadence is derived from them. This small scene lacks the game's skinning,
shadow maps, material tables, pass volume and resource history.

An initial fixture attempt used an alpha-disabled default buffer and failed the
explicit target's resolve with GL error 1282. Its partial outputs and cleanup are
retained under `fixed-msaa`; it is excluded from the completed matrix. The
completed `fixed-msaa-rgba` run uses an alpha-enabled destination matching the
existing RGBA8 helper, with separate setup/draw error checks. This was a fixture
setup repair, not an engine determinism fix.

## Reproduction, validation and next work

Raw root: `.local/engine-perf/upload-msaa-20261010/roof/`. Owner: engine performance
audit. Retain until replacement evidence preserves bytes, hashes, source graphs,
image failures and fixture results. Five focused tests pass with 29 assertions;
the scoped TypeScript check includes the new scripts and repeat reporter. Process
policy reports 4,893 files and zero violations. All 37 cleanup receipts are empty
(32 belong to one shared image decoder); all five wake guards released without
expiry or suspected sleep. The shared managed game server has no unresolved errors.

All script paths below start `spikes/persistent-world-worker/`:

1. For each `pow-control` / `unlit`, set `PERF_FROZEN_SOURCES` and `PERF_BASE_HTML`
   to that artifact under the preceding `shader-domains-20261010/roof/` root.
   Generate `verification/upload-bytes-recipe.ts` into its output artifact folder,
   then build with `PERF_REBUILD_RENDERER=1`, its `upload-bytes-patches.json` as
   `PERF_SOURCE_PATCHES`, and `build.ts <artifact>`.
2. Use the [shader-screen capture configuration](october-10-shader-repeatability.md#reproduction-and-evidence),
   with `PERF_PREFIX=upload-ab`, `PERF_ARTIFACTS=pow-control,unlit` and this root.
   Run `verify.ts`, `verification/upload-bytes-results.ts`, and
   `presentation/display-results.ts` with `PERF_DISPLAY_REFERENCE` pointing to
   the preceding `pow-ab`. Generate/run the exact image batch and repeat report.
   Its pixel gate exits 1 after saving all 96 comparisons, as expected for these
   retained determinism failures.
3. Set `PERF_PREFIX=fixed-msaa-rgba`, `PERF_URL` to the managed server's returned
   `/game/` URL, `PERF_GPU=high-performance`, `PERF_EXPECT_RENDERER=RTX 4070`.
   Run `verification/fixed-msaa.ts` then `verification/fixed-msaa-results.ts`.
   Both use this root; the browser owns a routed diagnostic page and cleanup.

Next isolate the game's failing draw/resource interaction, or test a separately
versioned post-process AA implementation with its own deterministic history and
full-loop cost. Preserve the existing MSAA failure until explained or fixed.
Shadow batching remains a separate performance experiment. Independent timing
sessions, fresh-pose scheduling, resource invalidation, six-arena/stress coverage,
real input-to-visible latency and sustained memory/thermal evidence remain open.
