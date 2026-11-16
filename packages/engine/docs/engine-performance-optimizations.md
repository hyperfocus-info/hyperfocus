# Engine Performance Optimizations

## 2026-11-07: bounded offline HTML encoding

Owner: `src/project/standalone-playable.ts`. Large offline packs previously
created four one-character string additions for every three bytes, retaining
millions of rope nodes before JSON flattened them. A Chrome profile of an 8 MiB
pack attributed about 425 ms of a 578 ms encoder/Blob operation to garbage
collection. The encoder now uses native typed-array base64 when available and
a portable 16 KiB ASCII-block fallback otherwise. Output format, padding and
byte-view boundaries are unchanged; the public HTML API tests both paths.

The [editor probe](../../../apps/engine-editor/verification/export-performance/README.md)
compared frozen implementations through the real artifact call, including pack,
branding and Blob creation, after project hydration. Two serial A/B/B/A cycles
used one warmup and one measured export per fresh hidden browser. On Windows,
Chrome 156 and an i9-13900HX, the 65,985,118-byte input archive produced identical
90,695,541-byte HTML in all eight samples. Median export time fell from 12.801 s
to 3.880 s (69.7%); ranges were 7.933–13.315 s and 3.365–4.223 s.

Raw profiles, frozen bundles, input hashes and trials are temporary local evidence
under `packages/engine/.local/engine-perf/standalone-export/`; retain until the
associated loaded-editor export investigation is resolved, then prune or archive.
Other task agents held expensive work during acceptance timing; power, thermals
and unrelated system load were unrecorded. Four samples per implementation do
not establish tail percentiles, and endpoint heap readings do not prove peak or
retained memory savings. The isolated control also completed in seconds: this
result alone does not establish the cause or resolution of the original
180-second timeout after editing and Play. That journey needs its own verification.
The subsequent editor investigation found a separate retained copy: readiness
cached the legacy collector's base64 ropes even though artifact creation repacks
original blobs. Editor readiness now requests metadata-only collection, retaining
hash/size descriptors while preserving all byte and runtime validation. Structural
tests prove payload omission and rejection by the embedding helper; the loaded
editor journey remains the acceptance check for the stall.

## 2026-09-30: bounded district geometry rendering

Owner: Touch of Death city authoring and combat visual presentation. The expanded
district pool used a new entity prefix and bypassed the existing conservative
city prop culler. Include that pool in the same render-only rule. Authoring also
shares equal trim materials within one support and source color; separate walls
retain independent fade state. Physics, destruction and saved transforms remain
unchanged. Camera-return, portrait, edge-geometry and owner-fade tests cover parity.

The final exported game was compared serially with its unoptimized structural
build in an A/B/B/A subsequence, with the old delivered arena bracketing that run.
Each trial warmed for 12 seconds and sampled 600 native animation frames at
1440×900. On the local RTX 4070 laptop, median trial p95 fell from 39.1 to 33.35 ms
(14.7%); median draw submissions fell from 3,055 to 2,179 (28.7%). The previous
arena's two p95 trials were 23.2 and 33.8 ms, so the larger city is not a claim of
improved latency over the old content or a guaranteed 60 FPS target. Power and
thermal state were unrecorded; timings are diagnostic, not a portable gate.

Raw samples, browser/CPU details, artifact hashes and the shorter noisy run are
under `.local/touch-of-death/arena-overhaul/`; the final performance report is also
under `.local/engine-perf/tod-structural-city-2026-09-30/performance-culling.json`.
The structural gates are unchanged gameplay state, correct camera return and
independent owner fading, alongside the measured submission count reduction.

## 2026-09-29: detached combat snapshots under parallel training

Owner: portable combat simulation, `src/combat/simulation.ts`. Browser worker
profiles identified structured cloning at 19.6% of sampled self time under
32-worker city training. `capture()` now copies the schema's mutable fighter
containers directly and reuses immutable configuration text. `restore()` keeps
the already-detached, validated result of `readCombatSnapshot` instead of cloning
it a second time. Neither API lends mutable state to callers.

The capture-only single-worker ABBA result was borderline (~5%) and was not used
as the acceptance claim. The combined change passed a serial 32-worker ABBA with
the same 32 seeds, 600 warmup and 600 measured ticks per worker. Mean throughput
rose from 724 to 938 ticks/s (+29.5%); median p95 tick time fell from 107.95 to
84.25 ms (-22%). Complete progress/evidence matched for every worker. Separate
complete-set parity and nested-mutation/JSON-restore tests cover snapshot ownership.

Raw evidence, environment, flags and samples live in
`.local/engine-perf/continuous-training/`. The controlled Chromium run disabled
renderer backgrounding equally for control and candidate. CPU remained around
42%; this is a throughput improvement, not proof of sustained 100% utilization.
Timing remains local calibration, not a portable latency gate. Future mutable
fighter schema fields must retain the detached-capture contract.

Living scan date: 2026-08-28

This is the overview doc for performance work that already exists in the engine, plus current opt-in flags and failed experiment learnings. Open hypotheses, future experiments, and target ideas live in ./docs/engine-performance-hypothesises.md.

## How To Read This

- Default optimization means it is active through normal engine APIs.
- Opt-in means it exists but callers must enable it or choose the optimized API.
- Experimental flag means it is code-backed and tested, but should not be enabled without a local bench.
- Demo-local means it proves a pattern in ./examples/mmo-skill-demo but is not necessarily stable engine API.

## Fast Map

The 2026-09-29 bulk-training profile found full world/save snapshots created for
each tick even though the worker needed only match status. Runtime/gameplay now
offer `advance()` with the same fixed-tick behavior and no exported snapshot;
`step()` composes advance plus snapshot for existing callers. Built-in-only
gameplay also skips the unused custom-script context snapshot. `combatMatch()`
returns detached match metadata. Combat's internal state reads remain unchanged.

Evidence: `.local/engine-perf/training-throughput/comparison.json`, adjacent frozen
control/candidate bundles and `parity.json`. Serial A/B/B/A runs of the same full
city, seed 2203885041, 600 warmup and 1,200 measured ticks averaged 156.9 versus
178.9 ticks/s; median trial p95 fell from 11.03 to 9.79 ms on Windows/Bun 1.4.2.
This is local calibration, not a browser throughput guarantee. A complete city
set at seed 2864158818 preserved its result, ticks and detailed report exactly.
Portable tests cover full physical/checkpoint/audio parity, detached match reads,
zero unused world snapshots and unchanged custom-script contexts. Engine runtime
maintainers own these optional advance APIs; the bulk worker selects them.

The 2026-09-28 Touch of Death profile identified AI detour and breach visibility
edges repeatedly running exact sphere/box sweeps against distant city solids.
The obstacle planner now computes conservative world X/Z bounds once per live
box and rejects separated segment/slab pairs before the existing exact sweep.
Tilted boxes include their vertical extent in those world bounds. Graph ordering,
live wall invalidation, collision clearance, attack costs, and AI rules are
unchanged; no persistent cache or simulation state was added.

Evidence: `.local/engine-perf/tod-route-bounds/summary.json` and adjacent frozen
control/candidate bundles and raw samples. Eight serial A/B/B/A/A/B/B/A trials of
the same 116-entity level-nine combat fixture (including a breakable blocking
wall, 25 local and 88 remote obstacles) reduced median trial gameplay p95 from
55.63 to 15.35 ms and p99 from 62.28 to 16.71 ms. All final snapshot hashes match.
This is shared Windows/Bun calibration, not a browser FPS guarantee. Seven
focused tests cover physical breach/rollback, live removal/restoration, 3,000
oriented sweep comparisons, grazing contacts, and remote narrow-phase rejection.
Engine combat/environment maintainers own this default path; the graph remains
O(corners squared times blockers), with cheaper conservative rejection of pairs.

The 2026-09-27 Touch of Death city profile exposed optional physics lookups
throwing for ordinary non-physical scenery. `resolveOptional` now checks missing
IDs and stale generations directly; strict mutation errors remain unchanged.
Runtime frame application indexes declared entities, material skinning checks scan
instances only when the skinning flag changes, and environment/occlusion
presentation indexes frame entities instead of repeatedly searching the city.
These are default paths owned by the engine runtime/render maintainers.

Evidence: `.local/engine-perf/tod-city-lookups/summary.json` and adjacent Chrome
profiles. Serial A/B/B/A trials used the same 1,333-entity city, current minified
runtime, 1-second warmup and 6-second samples at 1280×800. Practice presentation
rose from 4–8 callbacks/second to 54–55; menus rose from 16–17 to about 57.
This shared Windows/headless measurement is calibration, not a device FPS promise.
Rigid-body stale-handle tests, renderer material compatibility tests, runtime
frame tests and repeatable environmental presentation tests preserve behavior.

| Area | Optimization | Status | Main Files |
| --- | --- | --- | --- |
| MMO scale | 10 room x 100 player preset with least-loaded or fill-first admission | Default API | ./src/server/replication/scaling.ts, ./src/server/server.ts |
| Server clock | Fixed tick with catch-up cap | Default | ./src/server/core/clock.ts |
| Presence | O(1) player/user/session lookups | Default | ./src/server/core/presence-index.ts |
| Replication scheduling | Round-robin spread, initial snapshot bypass, phase offsets | Default when configured | ./src/server/server.ts, ./src/server/replication/scaling.ts |
| Replication budget | Per-client byte caps and static deferral | Default | ./src/server/replication/replicator.ts |
| Multipart replication | Volatile/static/private/world/transient segment lanes | Default API | ./src/server/replication/replicator.ts, ./src/protocol/frames.ts |
| Protocol | Typed schemas, compact numeric fields, DataView IO | Default | ./src/protocol/ |
| Protocol deltas | Field/map/array patch encoding | Default | ./src/protocol/delta.ts |
| Protocol dirty hints | Caller-provided dirty root fields | Opt-in API | ./src/protocol/delta.ts |
| Protocol byte views | Zero-copy frame/envelope payload views | Default for frame decode | ./src/protocol/frames.ts, ./src/protocol/encode.ts |
| Binary inputs | Compact binary input frames | Default when codec exists | ./src/protocol/messages.ts |
| Binary input view | Borrowed input payload view | Experimental flag | ./src/protocol/messages.ts |
| Shared memory | Cache-line-separated control regions, optional isolated slots, typed field columns, stable reads | Default API/opt-in slot isolation | ./src/core/schema.ts |
| Shared slabs | Cell slab replication with contiguous copy fast path | Default API | ./src/server/replication/replicator.ts |
| Interest grid | Nearby-cell scan, AOI hysteresis, caps, enter/leave | Default API | ./src/server/interest-grid.ts |
| Interest selection | Priority buckets and bounded heap before full sort | Default | ./src/server/interest-grid.ts |
| Spatial hash | Packed numeric keys, reusable output arrays, dirty cells | Default API | ./src/server/replication/spatial-hash.ts |
| Broadphase | Packed static queries and allocation-free sweep pairs | Default API | ./src/math/broadphase.ts, ./src/server/core/physics.ts |
| Rigid 3D warm start | Previous-slot lookup plus lazy bounded pair index for 128+ contacts | Default | ./src/physics/rigid/contact-pair-index.ts, ./src/physics/rigid-3d-operations.ts |
| Rigid 3D articulation | Shape inertia, off-center angular contact, swept effectors, anchored breakable joints, bounded pose motors and rest-pose angular envelopes | Opt-in API | ./src/physics/rigid-3d.ts, ./src/physics/rigid-3d-constraints.ts |
| Map collision | Merged static rects and broadphase collision index | Default API | ./src/map/collision.ts |
| Object pooling | Reusable object pools for hot transient records | Default API | ./src/runtime/object-pool.ts |
| Retained cursor | Fixed-capacity stable records with explicit overwrite lifetime | Default API | ./src/runtime/retained-cursor.ts |
| MMO registry | Internal read views avoid clone-heavy scans | Default when safe | ./src/mmo/entity-registry.ts, ./src/mmo/interest.ts |
| MMO movement | Cached static solid rect source | Opt-in API | ./src/mmo/movement.ts |
| MMO targeting | First line target fast path avoids sorting all hits | Default API | ./src/mmo/targeting.ts |
| Client interpolation | Short sample buffers with interpolate/hold/snap | Default API | ./src/mmo/interpolation.ts |
| Render stage | Layer order cache and pooled stage entries | Default | ./src/render/stage.ts |
| Render frame pool | Reused arrays, points, commands, and configurable record strategy | Opt-in allocation tradeoff | ./src/render/frame-pool.ts |
| Render draw data | Bounded text, gradient, and dash caches | Opt-in API/flag | ./src/render/draw-data.ts, ./src/render/stage.ts |
| 3D LOD | Distance-band policy, lazy bake cache, instance LOD split helper, and meshoptimizer BufferGeometry simplifier | Opt-in API | ./src/render/3d.ts |
| 3D BSP | Static 3D item sphere/box query tree | Opt-in API | ./src/render/3d.ts |
| Three Arena props | Fixed-grid prop collision broadphase | Demo-local default | ./examples/three-arena/ |
| Three Arena static visibility | BSP-backed static prop visibility flag | Demo-local experimental flag | ./examples/three-arena/ |
| Three Arena generated prop LOD | Meshoptimizer static prop LOD bake and geometry swap | Demo-local opt-in flag | ./examples/three-arena/ |
| WASM collision | Distinct scalar/SIMD artifacts, TS fallback, fixed scratch, and configurable batch dispatch | Default API | ./src/wasm/collision-kernel.ts, ./src/runtime/numeric-batch-policy.ts, ./assembly/collision-kernel.ts, ./assembly/collision-kernel-scalar.ts |
| Post processing | Precomputed retro dither constants | Default prototype helper | ./src/canvas/post-processing.ts |
| Package builds | Split/pruned browser root plus minified focused bundles with entry, reachable-graph, consumer, and aggregate byte budgets | Default | ./scripts/build-package.ts, ./scripts/bundle-size-budget.ts |

The rigid-3D focused bundle has a temporary 38 KB raw cap, up from 34 KB, owned by the physics/rigid-3D boundary. The increase covers the first-party articulation primitives rather than unrelated content. Once the complete ragdoll controller shares quaternion and constraint math with the motion package, the removal target is at most 36 KB without removing behavior.

## Rigid 3D Pair Lookup Evidence

September 4, 2026: serial A/B/B/A full-step trials on an i9-13900HX, Windows 11,
Bun 1.4.0 used four rounds, 120 warmup steps, and 100 samples per trial. At 2,048
contacts, median trial p95 improved from 8.24 to 6.30 ms for persistent contacts
and from 22.10 to 20.22 ms for dynamic contacts, with matching checkpoints and
diagnostics. Thread cycles per step fell from 16.51 to 12.91 million and from
46.02 to 42.13 million, respectively. A longer 64-contact dynamic check was
essentially neutral; 512-contact dynamic p95 increased 4.6% while cycles decreased
2.4%. This is a measured large-contact optimization, not a universal timing gate.
Raw trials and replay scripts are under `.local/engine-perf/2026-09-04-audit/`
(`fix-physics-final.json`, `fix-physics-small-final.json`, `prepare-fix-physics.ts`).

## Three Arena Client

### Prop Collision Broadphase

./examples/three-arena now keeps blocking props in a fixed world grid. Actor collision still runs the exact circle or box resolution, but only after nearby-cell filtering.

Default: enabled for Three Arena. Use `?propCollisionGrid=0` only for rollback or A/B checks.

Latest late-game all-props combat bench, 500 enemies / 500 pickups / 1000 particles, repeat 3:

- Control p95 frame/update median: 15.0ms / 13.3ms
- Default p95 frame/update median: 3.7ms / 1.9ms

### Static Visibility BSP

./src/render/3d.ts now exposes a reusable 3D BSP query tree. ./examples/three-arena uses it behind `?staticPropBsp=1` for static prop visibility. It keeps exact toroidal visibility checks, but replaces full prop scans with broad candidate queries and a visible-set swap.

Default: enabled in Three Arena for local proof, with `?staticPropBsp=0` as rollback.

Latest 500 enemy / 500 pickup / 1000 particle / all-props stress lane, repeat 3:

- Pre-change control p95 frame/update/render medians: 4.5ms / 2.2ms / 2.0ms
- BSP-on p95 frame/update/render medians: 5.1ms / 2.8ms / 2.4ms
- Same-build BSP-off p95 frame/update/render medians: 5.4ms / 2.7ms / 2.4ms

Read: browser noise moved upward after the first control, so the clean same-build comparison is more useful than the pre-change number. BSP-on was slightly better than same-build off for frame p95 and update worst, but this scene has only 369 static props, so it is not a strong default-on proof for large scenes.

Engine microbench, 10k static items and 1k sphere queries:

- Full scan: 530.5ms
- BSP query: 14.2ms
- Same hit count, 37.3x faster

Use BSP when the static item set is large or queries repeat across many actors. Keep simple scans for small sets where tree traversal overhead can dominate.

### 3D LOD Helpers

./src/render/3d.ts now has policy-first LOD helpers for simple distance bands, lazy bake caches, splitting one logical instance batch into per-LOD batches, and `simplifyThreeBufferGeometry()` for meshoptimizer-backed lower-index `BufferGeometry` bakes. This fills the engine API gap without hiding authored art choices.

Default: opt-in API. Do not default generated LOD until the scene proves lower triangles without draw-call, shader-program, material, or mesh churn.

### Three Arena Generated Prop LOD

./examples/three-arena can bake static prop mid/low geometry from loaded models with `?staticPropLod=1`. The current implementation bakes once per source geometry, stores high/mid/low geometry sets, then swaps mesh geometry when visible prop distance crosses 15m and 30m.

Default: off. The feature works, but the current stress scene is not static-prop-triangle-bound enough to justify default-on.

Latest 500 enemy / 500 pickup / 1000 particle / all-props stress lane, repeat 3:

- LOD-off p95 frame/update/render medians: 3.7ms / 1.8ms / 1.7ms, triangles 44712
- LOD-on geometry-swap p95 frame/update/render medians: 4.1ms / 2.2ms / 1.8ms, triangles 44542
- Bake: 24 prop model sources, 54 baked geometries, about 147-148ms during optional model load

Read: generated LOD reduced only 170 triangles in this scene and raised CPU-side update cost. This is useful engine capability, but Three Arena needs heavier static meshes, impostor/HLOD proxies, or larger visible prop populations before generated LOD becomes a clean perf win.

## Server And MMO Scale

### MMO 1000 Preset

./src/server/replication/scaling.ts provides `createMmo1000Preset()`, which defaults to 10 public rooms x 100 players. Admission in ./src/server/server.ts pre-creates managed rooms, fills rooms below soft cap first, then falls back to least-loaded open rooms by default. `admissionSelection: "fill-first"` is available for demo or lobby flows that should keep early players together before spilling to the next public shard.

Key knobs:

- `publicRooms`
- `playersPerRoom`
- `admissionSelection`
- `softPlayersPerRoom`
- `tickRate`
- `replication.snapshotRate`
- `replication.deltaRate`
- `replication.maxBytesPerClientPerSecond`
- `replication.maxClientsPerTick`
- `replication.spread`
- `replication.phase`

### Fixed Server Clock

./src/server/core/clock.ts runs a fixed tick step and caps catch-up ticks. If the process stalls, the clock drops accumulated backlog instead of spiraling through an unbounded catch-up loop.

Default: enabled whenever the authoritative server owns its clock.

### Presence Index

./src/server/core/presence-index.ts keeps player, user, session, and room indexes so duplicate login and player lookup do not require full room scans. ./src/server/server.ts uses this during join, leave, duplicate-login replacement, and server stats.

Default: enabled.

### Room Ordering And Scheduling

./src/server/server.ts sorts rooms deterministically for ticks and replication. The server also has experimental flags for caching or reducing scheduling allocation:

| Flag | Default | Purpose | Caveat |
| --- | --- | --- | --- |
| `ENGINE_SERVER_STABLE_ROOM_ORDER=1` | off | Cache sorted room order until room add/remove. | Needs high-room-count bench before enabling. |
| `ENGINE_SERVER_DIRECT_SCHEDULE_CURSOR=1` | off | Iterate scheduled replication buckets by cursor instead of slice/concat rotation. | Preserves tests, but still needs fairness/tail bench. |

Async server ticks are serialized by default. Clock-driven ticks coalesce to one queued fixed step while a prior async tick is active, preventing concurrent room mutation without an environment flag.

### Replication Scheduling

When `replication.spread` is `round-robin` and `maxClientsPerTick` is set, ./src/server/server.ts spreads scheduled replication across rooms and players. Initial snapshots bypass the scheduler cap once so joined clients get a first world view quickly. Optional hash-based phase offsets spread later snapshot/delta bursts across time.

Default: configured by `createMmo1000Preset()`.

## Shared Memory

### Cache-Line-Aware Layout

The shared-memory header occupies one 64-byte control line, occupancy metadata starts on the next line, and entity data begins on a later 64-byte boundary. Compact entity strides remain the default because padding every record can reduce useful cache density.

Use `cacheLineAlignedSlots: true` only when independent workers write neighboring slots. That mode gives every occupancy token and entity slot its own 64-byte stride. Shared cell replication detects padded strides and falls back from contiguous slab copy to per-record copy.

### Typed Field Columns

`occupiedSlots()`, `readFieldColumn()`, and `writeFieldColumn()` let hot systems stage selected fields in caller-reused typed arrays. This bypasses entity proxies and gives the compute phase compact linear inputs while retaining the record-oriented shared wire layout.

## Replication

### Per-Client Byte Budgets

./src/server/replication/replicator.ts caps each client's bytes per second. Normal packets drop when the client is over budget. Multipart static segments defer instead of evicting volatile data.

Default: enabled through `maxBytesPerClientPerSecond`.

### Multipart Segment Lanes

Multipart replication separates:

- `private-volatile`
- `world-cell-volatile`
- `transient`
- `private-static`
- `world-cell-static`

Segment priority keeps private and volatile data ahead of static bulk. Static segments that do not fit stay pending.

Default: available through `multipartSnapshot()` and `multipartDelta()`.

### Static Segment Dedupe

Pending static segments are keyed by `kind:id`. If a newer static segment arrives before the older pending one is sent, the newer segment replaces it. This prevents stale static backlog from growing by duplicate segment identity.

Default: enabled in ./src/server/replication/replicator.ts.

### Shared Segment Stable Reads

Shared replication segments can carry a `sharedSource` with a shared-memory tick reader. Multipart encode retries while the source is mid-write and only emits a frame when all referenced shared sources are stable.

Default: enabled for shared replication helpers in ./src/server/replication/replicator.ts.

### Shared Cell Slabs

`createSharedCellReplicator()` writes compact cell slabs with fixed headers and sorted entity metadata. When slots are contiguous, it copies one contiguous memory block instead of copying each entity separately. Dirty slab mode can emit only configured byte ranges for dirty masks.

Status: default API. Dirty slab emission is available as an API, but workload proof should decide whether to use it.

### Replication Telemetry

Replication telemetry tracks:

- volatile bytes
- static deferred bytes
- static deferred count
- total bytes
- budget utilization
- pending static count and bytes
- sustained static deferral warnings

Enable with server config `replication.telemetry`, `ENGINE_REPLICATION_TELEMETRY=1`, or `MMO_REPLICATION_TELEMETRY=1`.

## Protocol

### Typed Binary Snapshots

./src/protocol/encode.ts and ./src/protocol/schema.ts use typed replication schemas and DataView writes for compact numeric fields. Strings use compact length prefixes, ASCII fast path, and a bounded UTF-8 byte cache for repeated short strings.

Default: enabled through `encodeSnapshot()` and `decodeSnapshot()`.

### Compiled Field Encoders

Field encoders and root schema encoders are cached in WeakMaps. Snapshot writer size hints are remembered per schema so repeat snapshots avoid growing from a tiny buffer each time.

Default: enabled.

### Preencoded Snapshot Bytes

Objects can expose `PREENCODED_SNAPSHOT_BYTES` to bypass snapshot encoding when a producer already has stable encoded bytes.

Status: opt-in producer contract.

### Delta Replication

./src/protocol/delta.ts sends patches for changed root fields, nested object fields, map entries, and array entries when a baseline exists. If no baseline exists, the delta payload carries a full snapshot.

Default: enabled through `encodeDelta()`.

### Dirty Root Field Hints

`encodeDelta(schema, before, after, { dirtyFields })` can scan only trusted root fields. This avoids recursive diff work when the state producer already knows what changed.

Status: opt-in API. The caller must be correct or updates can be missed.

### Zero-Copy Frame Views

./src/protocol/frames.ts decodes replication frames and multipart segment payloads as subarray views. ./src/protocol/encode.ts also exposes `readBytesView()` internally for decode paths that do not need ownership.

Default: enabled. Caveat: do not retain a tiny view if it pins a large backing buffer longer than needed.

### Binary Input Frames

./src/protocol/messages.ts can encode high-rate inputs as compact binary frames when a codec exists. Frame headers are fixed-size and payload codecs own the actual input shape.

Default: enabled when caller provides `inputCodec`.

### Binary Input Payload Ownership

`createBinaryProtocolParser({ inputCodec, payloadOwnership: "borrow" })` passes a
borrowed `subarray` to synchronous decode instead of copying its backing bytes.
Authoritative servers expose the same choice as `binaryInputPayloadOwnership`.

Status: supported opt-in. Safe copy remains the default. Borrow only when the codec
decodes immediately and does not retain the backing network buffer.

## Interest, Spatial, And Collision

### Interest Grid

./src/server/interest-grid.ts indexes entities by numeric cell key, scans only cells near the target radius, includes entity radius in broad query bounds, and supports global entities.

Default: enabled through `createInterestGrid()` and `createMmoInterestGrid()`.

### AOI Hysteresis

`computeVisibility()` expands the target radius by `hysteresisCells` for previously visible entities. This keeps near-boundary entities visible briefly and reduces enter/leave churn.

Default: `hysteresisCells` is 1 in the MMO profile.

### Visibility Caps And Priority

Interest selection caps visible entities per client. Common integer priorities in the 0-63 range use priority buckets; large uncapped sets use a bounded heap before final ordering. Per-type caps are available through `maxEntitiesPerClientByType`.

Default: enabled.

### Spatial Hash

./src/server/replication/spatial-hash.ts provides reusable-output nearby queries, dirty-cell mutation reports, swap-pop cell removal, max-radius caching, and packed numeric cell keys with string fallback outside packed coordinate bounds.

Default: enabled through `createSpatialHash()`.

### Physics Broadphase

./src/math/broadphase.ts lazily builds a Flatbush packed typed-array index for rectangle queries and uses a min-X sweep for dynamic pairs. `forEachPair()` avoids transient pair objects; ./src/server/core/physics.ts uses that allocation-free path.

EXP-019 repeated spatial bench, 40k static rectangles / 2k queries and 8k dynamic rectangles / 30 frames, repeat 3. Median-of-run medians:

- Static engine path: 244.496ms before to 37.478ms after, 84.7 percent faster.
- Dynamic engine path: 4440.154ms before to 218.081ms after, 95.1 percent faster.
- Checksums matched every control and candidate.

The generic engine wrapper remains slower than using Flatbush or a workload-specific sweep directly because it validates ids, maintains lookup state, and returns public ids. Prefer the lower-level fixed/static indexes when those features are unnecessary.

Default: enabled in `createServerPhysicsWorld()`.

### Static Map Collision Index

./src/map/collision.ts extracts merged collision rects from tile runs and builds a broadphase index for static rect collision. Circle queries reuse scratch ids internally and can write candidate rects into caller-provided output arrays.

Default: enabled through `createStaticRectCollisionIndex()`.

## MMO Package

### Registry Read Views

./src/mmo/entity-registry.ts exposes internal read-only iteration for trusted engine loops. ./src/mmo/interest.ts uses it when there is no custom filter and `useReadableViews !== false`.

Status: default when safe. Public `get()` and `all()` remain clone-safe.

Latest bench: 3317.104ms to 295.029ms median, 91.106 percent faster in ./scripts/engine-candidate-bench.ts.

### Clone-Safe Snapshotter Caveat

The high-level ./src/mmo/interest.ts snapshotter is intentionally simple: registry scan, visibility filter, sort, cap, snapshot. This is fine for small/medium rooms and general API safety. For scale-critical MMO server paths, prefer ./src/server/interest-grid.ts or custom segmented `getReplication()`.

### Cached Static Occupancy Inputs

./src/mmo/movement.ts can cache a static solid-rect source with `cacheSolidRects: true`.

Status: opt-in API. Use only when solid rects are static for the tester lifetime.

Latest bench: 291.464ms to 4.701ms median, 98.387 percent faster in ./scripts/engine-candidate-bench.ts.

### Targeting Fast Path

./src/mmo/targeting.ts includes `firstMmoLineTargetHit()`, which tracks the best line hit without collecting and sorting every hit.

Default: available API.

### Status And Id Bitmasks

./src/mmo/status.ts and ./src/mmo/inventory.ts include compact token/id helpers that let callers store repeated status/id facts as bitmasks where appropriate.

Default: available API.

### Client Interpolation

./src/mmo/interpolation.ts keeps a bounded timeline per entity, delays sampling slightly, interpolates between nearby samples, holds short gaps, and snaps large jumps. This lets servers send fewer updates without making normal movement visually harsh.

Default: available API.

## Runtime And Rendering

### Generic Object Pool

./src/runtime/object-pool.ts provides bounded reusable object pools with optional preload and serialization. Snapshot restoration requires an explicit item parser. Server transient effects and render stage entries use this pattern to reduce hot allocation.

Default: available API.

### Transient Effect Lanes

./src/server/replication/transient-effects.ts uses pooled compact effect records, in-place lane compaction, priority selection, and AOI-capped viewer selection.

Default: available API.

### Render Stage Pooling

./src/render/stage.ts pools render-stage entries, reuses per-layer sorted-call arrays, and caches ordered layer lists until layers change.

Default: enabled.

### Render Frame Pool

./src/render/frame-pool.ts reuses per-frame render arrays, records, points, and path commands. It is an opt-in allocation-control surface, not a general CPU optimization. The focused microbenchmark currently shows substantial reset overhead, so promotion to a default requires full-loop p95/p99 and GC evidence.

Default: available API. The MMO skill demo consumes it heavily.

### Draw Data Caches

./src/render/draw-data.ts has bounded per-canvas caches for gradients, line dash arrays, wrapped text blocks, and truncated labels. It is controlled by render state, stage/HUD config, or `ENGINE_RENDER_DRAW_DATA_CACHES=1`.

Status: opt-in. Latest isolated draw-data microbench improved 34.476ms to 25.985ms median, 24.629 percent faster. API-mode MMO render benches did not clear the win bar, so keep off by default in the demo.

Use:

- `createRenderStage(ctx, camera, { drawDataCaches: true })`
- `stage.setDrawDataCaches(true)`
- `createHudRenderer({ drawDataCaches: true })`
- `ENGINE_RENDER_DRAW_DATA_CACHES=1`

### Canvas Culling And Stable Dimensions

Render helpers provide bounds extraction and culling helpers in ./src/render/batch.ts, while map rendering has viewport and rotated-terrain culling in ./src/map/render.ts and ./src/map/game-map.ts.

Default: available API.

## WASM And Numeric Kernels

### Build Compactness And CPU Profiles

Package entries are minified during transactional builds. The browser root is also
code-split against focused browser-safe entries, then build-only unreachable chunks
are removed. `bun run check:bundle-size` gates the 90,929-byte eager root, the full
152,411-byte reachable browser graph, each focused entry, compressed sizes, two
tree-shaken consumers, and a 1,600,000-byte aggregate. The verified 2026-08-29 build
totals 1,582,384 raw JavaScript bytes including reachable chunks. The minimal-canvas
and canonical-browser consumer gzip ceilings remain 8,000 and 18,000 bytes. This
reduces eager root work without pretending shared chunks disappeared from the
published graph; further aggregate reduction should target duplicated project and
server code.

`bun run bench:cpu-profile` records Bun CPU profiles, a grep-friendly Markdown report, and benchmark JSON under `./.local/engine-perf/cpu-profile/`. The first profile showed GC, broadphase pair enumeration, sorting, and rebuild bookkeeping as the main engine-relevant costs. JavaScript JIT profile guidance is owned by the runtime; the project-controlled WASM build continues to use `-O3` and SIMD.

Protocol, MMO load, admission, warm-tick, scheduled-delta, interest, and rollback performance gates now use explicit warmups and p95 samples. They no longer accept the fastest or a single sample from a run as regression evidence.

### Collision Kernel

./src/wasm/collision-kernel.ts wraps equivalent scalar and SIMD AssemblyScript
artifacts. It supports scalar circle-rect overlap, movement integration,
point/vector rotation, range filters, mask filters, rect overlap batches, and
circle-rect batches. `auto` loads SIMD first only when the host validates SIMD;
forced variants remain available. `createNumericBatchSelector()` normalizes
`auto`, `typescript`, or `wasm` once, and keeps copied batches below 256 in
TypeScript by default.

Default: available API with TypeScript fallback.

### Bridge Safeguards

The WASM wrapper validates batch counts, reserves fixed scratch once at startup by
default, supports an explicit growing strategy, copies outputs into caller-owned
buffers, and falls back cleanly on fetch/instantiate/missing-export failures.
Forced artifact/backend modes and `minimumWasmBatchSize` keep calibration and parity
reproducible.

Default: enabled.

### EXP-020 Low-Level Numeric And Allocation Matrix

The pinned Bun 1.4.0 A/B/B/A run found copied-bridge WASM 593.5% to 106.7% slower at batches 1 through 16, 25.7% faster at 64, and 74.9% to 83.9% faster at 256 through 16,384. This accepted the conservative batch-256 `auto` default.

The updated browser spike uses distinct production modules with equivalent resident
arenas. In the local Chromium 151 calibration, SIMD was 3.1% slower at batch one,
23.2% faster at four, and 33.3% to 42.9% faster at batches 16 through 16,384.
Timed kernel loops copied zero host-boundary bytes. Those times are diagnostic;
four packed elements per complete SIMD group and scalar-tail counts are the
portable work evidence. The compatibility artifact is scalar.

### Binary Input Ownership

Reusable binary readers cache their `DataView` for a stable backing buffer. The
advanced borrowed `decodeRange(bytes, offset, length)` path creates zero backing
allocations, copies zero payload bytes, and creates zero payload views per parse.
The ordinary `decode` borrow still creates one short-lived payload view and safe
ownership still copies. Codecs may opt into the range path only when decoding is
synchronous and no borrowed bytes escape.

Typed SoA beat stable objects by 56.2%, and the existing spatial hash beat full AOI scan by 95.0%. Interleaved typed versus SoA moved around the clean-win boundary across runs and remains workload-selected.

The safe clearing render pool lost badly to fresh allocation in isolation. Caller-verified overwrite was only 6.4% better at p95 and worse at p50, so it remains explicit. `createRetainedCursor()` was 78.0% faster at p95 for a stable fully-overwritten record shape and is the preferred allocation-control abstraction when that contract fits.

### WASM Caveat

WASM helps when data is already numeric and batched. It is not a free win for object-heavy paths because JS object to typed-buffer copy can dominate the kernel savings.

## Demo-Local Performance Proofs

./examples/mmo-skill-demo is the current end-to-end proof surface. It adds game-local optimizations that are useful signals for engine work but are not all stable engine APIs.

### Demo Server And Replication

The demo uses:

- packed volatile/static multipart segments in ./examples/mmo-skill-demo/src/segmented-replication.ts
- world-cell, private, static, volatile, and transient segment lanes
- enum/string interning for repeated zone/action/slot/combat/status values
- bit masks for sparse packed fields
- shared-hot slabs from ./examples/mmo-skill-demo/src/shared-hot.ts
- direct shared-slot reads for hot entity fields
- counted typed indexes for entity buckets
- accessor caching around shared-hot views
- lazy static segment encoding
- coarse snapshot AOI for snapshots
- preencoded multipart payloads with `PREENCODED_SNAPSHOT_BYTES`

### Demo Client Render

The demo uses:

- engine render frame pooling
- fresh render records by default, with `clear` and caller-verified `overwrite` available for A/B work
- retained arrays per render category
- viewport culling before creating render calls
- cached hazard/effect timing maps
- map overlay and render-call benches
- opt-in draw-data cache mode exposed as `drawDataCaches: "auto" | "always" | "never"`

### Demo Flags

| Flag | Default | Purpose | Current Guidance |
| --- | --- | --- | --- |
| `MMO_SKILL_DEMO_COUNTED_INDEX` | on | Use counted typed indexes instead of sliced slot arrays. | Keep on. |
| `MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS` | on | Read hot entity data directly from shared slots. | Keep on. |
| `MMO_SKILL_DEMO_ACCESSOR_CACHE` | on | Cache shared-hot accessor views. | Keep on. |
| `MMO_SKILL_DEMO_STATIC_LAZY` | on | Defer static segment encoding until needed. | Keep on. |
| `MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI` | on | Use coarse snapshot AOI in demo replication. | Keep on unless dungeon bench regresses. |
| `MMO_SKILL_DEMO_DIRTY_REPLICATION` | off | Track dirty entity ids for replication. | Failed previous default-shape proof; keep off. |
| `MMO_SKILL_DEMO_SHARED_DIRTY_SLAB` | off | Emit dirty shared-hot slab ranges. | Failed previous default-shape proof; keep off. |

Demo bench commands:

```powershell
bun.cmd run ./examples/mmo-skill-demo/scripts/dungeon-20-player-bench.ts
bun.cmd run ./examples/mmo-skill-demo/scripts/render-call-bench.ts
```

## Current Engine Flags And Opt-Ins

| Surface | Flag Or Option | Default | Status |
| --- | --- | --- | --- |
| Server telemetry | `replication.telemetry`, `ENGINE_REPLICATION_TELEMETRY=1`, `MMO_REPLICATION_TELEMETRY=1` | off unless config/env | Supported. |
| Server room order | `ENGINE_SERVER_STABLE_ROOM_ORDER=1` | off | Experimental. |
| Server scheduler cursor | `ENGINE_SERVER_DIRECT_SCHEDULE_CURSOR=1` | off | Experimental. |
| Protocol binary input views | `payloadOwnership`, `binaryInputPayloadOwnership` | `copy` | Supported synchronous opt-in. |
| Render draw caches | `drawDataCaches`, `ENGINE_RENDER_DRAW_DATA_CACHES=1` | off | Opt-in. |
| Render record strategy | `recordStrategy: "clear" | "fresh" | "overwrite"` | `clear` engine, `fresh` MMO demo | Supported; benchmark per consumer. |
| Numeric batch backend | `batchPolicy.backend`, default and per-operation minimums | `auto`, 256 | Supported. |
| Fixed-grid bucket reuse | `retainBuckets` | on for finite worlds, off for unbounded worlds | Supported. |
| MMO interest read views | `useReadableViews` | safe auto-on | Accepted. |
| MMO static occupancy cache | `cacheSolidRects` | off | Opt-in. |
| Delta dirty root fields | `dirtyFields` | absent | Opt-in. |

## Retired Failed Flags

These were removed from engine code after benchmarks failed or were mixed:

| Removed Flag/API | Learning |
| --- | --- |
| `ENGINE_SERVER_REPLICATION_STATE_REFERENCE` / `stateTracking: "reference"` | Reference baseline tracking worsened server benches and had unsafe mutation contracts. |
| `ENGINE_STATIC_SEGMENT_ORDER_CACHE` / `staticSegmentOrderCache` | Static order cache was mixed and worsened main-loop/snapshot p95 in demo dungeon bench. |
| `ENGINE_INTEREST_VISIBILITY_DIFF_SCRATCH` / `allocationLightVisibilityDiff` | Scratch visibility diff regressed MMO dungeon p95 and complicated result lifetime. |
| `ENGINE_RENDER_STABLE_Y_INSERTION_SORT` | Render insertion sort regressed frame p95 and p50. |

## Failed Experiment Learnings

### EXP-004 Reference State Tracking

Hypothesis: avoid cloning last replicated state by storing references.

Result: server MMO load median worsened from 7.63ms to 8.22ms. Warm tick median worsened from 16.81ms to 22.79ms.

Learning: clone bypass needs a stronger immutable-state or caller-owned baseline contract. A broad reference flag is not safe or fast enough.

### EXP-008 Static Segment Order Cache

Hypothesis: maintain per-client pending static segment order incrementally instead of rebuilding and sorting.

Result: MMO dungeon bench was mixed. Main loop p95 worsened from 9.364ms to 9.942ms and snapshot p95 worsened from 5.362ms to 5.934ms, while replication tick and scheduler medians were only slightly better.

Learning: per-client cache memory and bookkeeping erase the current benefit. Revisit only with a static backlog stress bench.

### EXP-009 Allocation-Light Visibility Diff

Hypothesis: reuse client visible sets and scratch buffers to avoid visibility diff allocations.

Result: server samples were mixed, and MMO dungeon bench regressed. Main loop p95 worsened from 9.364ms to 10.556ms, snapshot p95 worsened from 5.362ms to 6.108ms, replication tick p95 worsened from 6.572ms to 6.626ms.

Learning: public result lifetime and scratch management add complexity without a clean server win.

### EXP-015 WASM AOI Cull

Hypothesis: move AOI distance culling into WASM.

Result: rejected before implementation because current AOI sources are JS objects. Copying object data into typed buffers before every query would likely dominate numeric savings.

Learning: WASM AOI should wait until AOI source data already lives in typed buffers.

### EXP-017 Stable Y Insertion Sort

Hypothesis: frame-to-frame render y-order is often nearly sorted, so insertion sort should beat native sort.

Result: render world p95 worsened from 9.737ms to 10.131ms and p50 worsened from 6.791ms to 7.054ms.

Learning: extra inversion scans and JS insertion work lost to native sort for the tested frame shape.

### EXP-018 Default-On Draw Data Caches

Hypothesis: draw-data caches should be enabled automatically in the MMO demo.

Result: latest API-mode MMO render bench did not clear the win bar. `none` p95 moved 5.972ms to 5.837ms, `minimap` moved 6.545ms to 6.542ms, and `world` moved 6.967ms to 6.897ms while heap grew by 3.48MB.

Learning: draw-data caches are real in microbench but workload-sensitive. Ship as explicit opt-in, not a demo default.

## Bench Commands

### Touch of Death identity quaternion normalization (2026-09-29)

`rigid-3d-operations.ts` recognizes exact unit identity rotations, including
negative identity and signed zero, after finite validation. It skips the portable
norm calculation without changing stored components. Touch of Death's city
fixture had 542/542 static identity rotations; a CPU profile attributed roughly
34% of samples to normalization.

A serial ABBA run at seed 17001, 200 warmup and 1,200 measured ticks, increased
aggregate throughput 12.85% (controls 182.19/202.31 ticks/s, candidates
225.10/208.27). Median p95 improved 15.31%. Game checkpoint hashes and raw physics
typed-array hashes match every 120 ticks; final outcome reports and match metadata
match. The rigid suite covers invalid, identity, negative identity and arbitrary
rotations. Evidence: `.local/engine-perf/tod-identity-quaternion/report.json` with
frozen control/candidate bundles and reproducible bench. CPU: i9-13900HX, Bun
1.4.2, Windows; power/thermal state unrecorded, other timing paused. This qualifies
the existing city's fast path, not an across-map throughput guarantee.

### Touch of Death city spatial work (2026-09-29)

Frozen original controllers in both seats isolate physics from changed AI defaults.
At seed 17001, serial ABBAABBA uses 200 warmup and 1,200 measured ticks per trial.
Each comparison contains four control and four candidate trials; rendering is zero.
Save/physics/audio verification every 120 ticks and restore/replay are outside
tick timing. CPU totals include verification. Same Windows/i9-13900HX/Bun 1.4.2
environment, other timing paused; power and thermal state unrecorded.

| Candidate | Aggregate tick wall reduction | Decision |
| --- | ---: | --- |
| Conservative relative swept CCD pair bounds | 21.50% | Keep |
| Spatial weapon-surface queries, authored tie ordering | 16.92% | Keep |
| Reuse maintained static AABBs alone | 2.20% | Noisy alone |
| All three | 42.81% (1.749× ticks/s) | Keep |
| Static AABB reuse added to CCD + queries | 5.71% | Qualified incremental gain |

All combined trials are faster (3.27–3.70 s versus 5.89–6.51 s). Median trial p95
falls 11.697→7.105 ms (39.26%); median p99 falls 13.240→10.315 ms (22.09%).
The incremental AABB comparison improves median p95 5.21%; its median p99 is
0.77% higher with mixed individual tails, so that small tail change is unresolved.
Typed-array body,
contact and constraint bytes, saves, ordered audio, outcomes and rewinds match.
Only `ccdAngularTests` may differ in the CCD comparison: discarded angular
samples are intentionally fewer, and the source audit found no budget/policy
reader. CCD pair budgets and other counters remain exact. The first rejected
cull changed tiny angular velocities by skipping endpoint normalization; a retained
reproduction led to normalizing the culled endpoints exactly as before.

This skips unreachable pair tests and remote surface materialization, not distant
simulation. Vehicles still move from 120 units away into the fighter lane, cause
damage, and queue behind a real solid wreck. Traffic scenarios and rotated
crossings pass every-frame save/audio/raw-physics/replay gates. Full-capacity query
buffers avoid truncation; moved, removed and restored bodies use live bounds.

Evidence: `.local/engine-perf/tod-city-source/report-{ccd-exact,surface-query,
static-aabb,combined,incremental-static}.json`, frozen manifests and traffic
fixtures. Reproduction is in the [evaluation runner](../examples/touch-of-death/host/tactical-evaluation/README.md).
These are additional savings against the identity-optimized control, not additive
percentage points. They prove this city fixture, not every map or browser render cost.

Diagnostic sampling profiles show remaining obstacle-route `clearSegment` at
21.21% inclusive samples, CCD at 24.01%, and `setQuaternion` at 17.37%; inclusive
costs overlap. The followup below tests conservative route-envelope filtering and
per-call narrowphase scratch reuse with exact geometry and invalidation.

### Touch of Death route candidates rejected (2026-09-29)

Both hypotheses passed correctness but failed repeatable timing acceptance.
The original optimized city route is restored byte-for-byte (SHA-256
`21520e99fdfd262cd72e1f018adea676738884be91451852d155939598bd7a79`).
No runtime optimization from this experiment remains enabled.

Envelope filtering keeps the direct query and complete original cache key, then
rejects blockers separated from the rectangle containing every later endpoint,
including hazard corners and the x+.001 corner probes. Retained bodies stay in
original order. Buffer reuse allocates lazy per-segment origin/delta/hit storage,
preserves quaternion expression order and resets sweep time/normals per box.
The sweep reads initial time; carrying a previous hit time would be incorrect.

Same isolated environment and city workload as above: seed 17001, ABBAABBA,
200 warmup and 1,200 measured ticks per trial, four runs per variant, frozen
original controllers in both seats, zero rendering, verification time excluded.
Control is the already optimized city engine `f0e68cf…`, not the earlier city
physics control. Power/thermal state is unrecorded; other tests/builds paused.
Negative changes below mean lower time.

| Candidate | Aggregate tick wall change | Median trial p95 change | Median trial p99 change |
| --- | ---: | ---: | ---: |
| Buffer reuse, first run | -6.11% | -4.73% | -2.39% |
| Buffer reuse, fresh repeat | +1.12% | +2.17% | +2.39% |
| Envelope filtering | +1.59% | +0.42% | -5.27% |
| Combined | -2.39% | +0.76% | -1.52% |

The initial buffer result did not repeat. Envelope preparation/filtering adds
work, and this fixture did not show a net p95/wall gain. The combined version
also misses acceptance. No speed claim or promotion follows a better p99 alone.
Profiling an inclusive function does not establish which loop inside it dominates.
Planner-owned buffers and direct counts of rejected bounds/sweeps remain untested
refinements; the current data does not justify enabling them.

All variants preserve every-frame traffic saves, ordered audio, all raw physics
bytes and diagnostics, incoming/rotated vehicle hits, wreck queues and trusted
rewind/replay. The city bench also preserves checkpoint/save/audio/outcome hashes
and replay with no counter exception. A self-contained original-source fixture
tests 145 mutation/query cases (435 fresh/cached/direct comparisons), including
oversized remote-centered solids, rotated/thin geometry, inside/outward/grazing
segments, shape/mask/remove/restore changes, actor height/radius, endpoint envelope
growth, moving traffic and hazard changes. Directions/distances use `Object.is`;
the source fixture hash normalizes CRLF/LF for fresh checkouts.

Evidence: `.local/engine-perf/tod-route-source/summary.json`, four
`report-{scratch-only,scratch-repeat,envelope-only,combined}.json` files, immutable
source/manifests and three `traffic-*.json` files. Reproduction and summary commands
are in the [evaluation runner](../examples/touch-of-death/host/tactical-evaluation/README.md).
Engine owners retain `obstacle-parity.test.ts` and the immutable test fixture as
the correctness boundary for future route experiments.
After restoration, 201 environment/motion/rigid/evaluation tests pass across
43 files (53,089 assertions), with engine test typecheck and targeted lint passing.
The repository source guard has no new route/evaluation violations; its existing
PadPilot directory failure remains outside this experiment.

Use `bun.cmd` on Windows when PowerShell blocks `bun.ps1`.

```powershell
bun.cmd run bench:candidates
bun.cmd run bench:render-draw-cache
bun.cmd run bench:protocol
bun.cmd run bench:server
bun.cmd run bench:mmo
bun.cmd run bench:rollback
bun.cmd run bench
```

Store raw control and candidate artifacts under ./.local/engine-perf/ with date, experiment id, command line, and summary.
