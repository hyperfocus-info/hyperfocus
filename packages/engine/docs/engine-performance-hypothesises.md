# Engine Performance Hypothesises

Living scan date: 2026-08-28

This file tracks open performance hypotheses, current bench coverage, and future target ideas. Move accepted optimizations and failed learnings to ./docs/engine-performance-optimizations.md after a decision.

## Update Contract

- Keep a fresh control run next to every candidate run.
- Use serial A/B runs for decisions; concurrent quick gates are only health checks.
- Judge median p95 first, then p99, average, memory, payload bytes, and correctness parity.
- Treat a candidate as a clean win only when it improves the target metric by about 5 percent or more without material regression elsewhere.
- Keep raw artifacts under ./.local/engine-perf/ with date, experiment id, control, candidate, and summary.
- Pair wall time with machine-independent dominant-work counters and an expected complexity model. A single local timing run calibrates that host; it does not prove global efficiency or justify a universal threshold.
- Record power/thermal state and competing load when available, and add idle plus contended/concurrency tiers for runtime, server, and agent-orchestration paths.
- Treat crossovers as ranges. Preserve forced modes and configurable host/profile overrides when hardware, browser, power state, or contention can move the boundary.

## Current Builds And Benches

| Area | Command | Current Use |
| --- | --- | --- |
| Candidate microbench | `bun.cmd run bench:candidates` | Proves isolated MMO read-view, occupancy cache, and draw-data cache shapes. |
| Render cache bench | `bun.cmd run bench:render-draw-cache` | Compares draw-data cache modes and MMO render workloads. |
| Protocol bench | `bun.cmd run bench:protocol` | Tracks decode, delta, and binary input costs. |
| Server bench | `bun.cmd run bench:server` | Tracks replication, interest, scheduling, and MMO load benches. |
| MMO load bench | `bun.cmd run bench:mmo` | Fast server MMO readiness signal. |
| Rollback bench | `bun.cmd run bench:rollback` | Tracks runtime rollback cost. |
| WASM bench | `bun.cmd run bench` | Tracks collision kernel and bridge cost. |
| Low-level spike matrix | `bun.cmd run bench:low-level-spikes` | Measures collision crossover, typed layouts, spatial rejection, and allocation strategies with serial parity-checked A/B/B/A samples. |
| Spatial index bench | `bun.cmd run bench:spatial-index` | Compares packed static queries, allocation-free dynamic pairs, fixed grids, and point indexes with checksum parity. |
| CPU profile | `bun.cmd run bench:cpu-profile` | Writes CPU profile, Markdown hot-function report, and spatial benchmark JSON. |
| Bundle budgets | `bun.cmd run check:bundle-size` | Enforces minified per-entry and aggregate JavaScript byte ceilings. |
| MMO demo dungeon bench | `bun.cmd run ./examples/mmo-skill-demo/scripts/dungeon-20-player-bench.ts` | End-to-end demo proof for server and replication changes. |
| MMO render call bench | `bun.cmd run ./examples/mmo-skill-demo/scripts/render-call-bench.ts` | End-to-end demo proof for render changes. |
| Three Arena stress bench | `bun.cmd run bench:example:three-arena:stress500` | Browser 3D proof for instance batching, visible props, shader programs, resource churn, and future LOD work. |

## Open Hypotheses

### Protocol Binary Input View

Hypothesis: borrowed binary input payload views reduce parse allocation enough to help high-input-rate rooms.

Decision: accepted as an explicit advanced ownership option, not a default. The
normalized parser removes per-message option/environment reads. Across 800,000
4,096-byte parses, copy performed 800,000 backing-buffer allocations and copied
3.277 GB; borrow performed neither, while both created the required lightweight
payload view and produced identical decoded values. The borrowed view is valid
only during synchronous decode and must not be retained.

### Dirty Delta Field Hints

Hypothesis: root dirty-field hints can avoid recursive diff work for large state records.

Current build: API exists and protocol tests cover root fields.

Needed bench: large map/object state with sparse changes, plus payload byte parity against full diff.

### Server Room And Scheduler Flags

Hypothesis: stable room order, direct scheduled cursor iteration, and async tick backpressure can reduce server p95 under high room/player counts.

Current build: flags exist and tests cover basic behavior.

Needed bench: high-room-count and slow-async-tick matrices that include fairness, drift, and tail latency.

### Numeric Spatial Hash Keys

Hypothesis: packed numeric cell keys reduce string allocation in spatial hash updates and queries.

Current build: packed keys exist in the interest grid.

Needed bench: update/query churn matrix with coordinate range and collision parity checks.

### Targeting Partial Selection

Hypothesis: first-hit and capped-hit targeting should avoid sorting all candidates.

Current build: first-hit path exists.

Needed bench: broad targeting matrix for first hit, capped hits, dense mobs, sparse mobs, and deterministic tie behavior.

### WASM Bridge Manual Batch Path

Hypothesis: manual bridge setup and typed inputs improve large batch collision calls.

Current build: manual bridge loop changes exist. EXP-020 found copied-bridge WASM
slower through batch 16, 25.7% faster at batch 64, and 74.9% to 83.9% faster from
batch 256 through 16,384 on repository-pinned Bun 1.4.0. The kernel now ships
configurable `auto`, forced TypeScript, and forced WASM policies with a conservative
batch-256 default. Same-module resident-input scalar/SIMD exports attribute a 37.4%
to 73.6% SIMD p95 win from batch four upward; batch one is 4.4% slower.

Current browser spike: Chromium 151 validated the shared module and mask parity.
Batch one had no SIMD group; batch four and above packed all elements four at a
time and improved locally. Firefox and WebKit were unavailable and are explicit
coverage gaps. The copied forced/auto browser crossover remains open.

### Typed AOI Buffers Before WASM AOI

Hypothesis: WASM AOI culling becomes viable only after AOI positions already live in typed buffers.

Current build: no typed AOI source of truth yet. EXP-020 found typed SoA 56.2%
faster than stable object AoS for a dense particle transform, but the existing
packed-key spatial hash was 95.0% faster than a full AOI scan.

Needed bench: representative client/server AOI profiling after spatial rejection.
Add a typed-buffer prototype only if data conversion remains a measured hot path;
do not add a WASM cull pass first.

### Render Layer Order Cache

Hypothesis: cached ordered layer lists reduce render-stage overhead when layers are stable.

Current build: render layer order cache exists.

Needed bench: layer-count matrix with add/remove churn, stable frames, and memory checks.

### Draw Data Cache Key Narrowing

Hypothesis: narrower cache keys or per-surface cache policy can make draw-data caches win in MMO world/minimap modes.

Current build: opt-in draw-data caches exist, default off.

Needed bench: separate HUD, minimap, world, and text-heavy scenarios with cache hit rate and memory ceiling.

### Configurable 3D LOD Policy

Hypothesis: a small `@hyperfocus/engine/render/3d` LOD helper can reduce Three Arena far-field triangle cost without increasing draw calls, shader programs, or runtime mesh churn.

Current build: ./src/render/3d.ts has distance-band LOD policy, lazy bake cache, instance-batch LOD splitting, meshoptimizer `BufferGeometry` simplification, and BSP query helpers. Three Arena has static visibility BSP behind a rollback flag, optional generated static prop LOD via `?staticPropLod=1`, triangle telemetry, and triangle budget assertions in the stress lane.

Latest bench: generated static prop LOD baked 54 geometries across 24 model sources, but only reduced visible triangles from 44712 to 44542 in the stress scene while p95 frame/update worsened. It remains opt-in, not default.

Recommended next shape: move beyond per-object simplification for this scene. Try far-field proxy/HLOD clusters, billboard impostors for decorative props, or a heavier static-mesh test scene where static props dominate triangle cost. Do not count visibility-only culling as LOD proof.

### In-Place Post Processing

Hypothesis: scalar in-place pixel effects beat tuple-per-pixel post-processing.

Current build: candidate post-processing improvements exist.

Needed bench: full-frame effect p95, heap delta, and pixel parity tolerance.

### Client Prediction Spatial Index

Hypothesis: local prediction collision and sentinel checks can use a lightweight spatial index instead of full object scans.

Current build: demo-local scan reduction exists.

Needed bench: MMO skill demo client update p95 with prediction parity and rebuild-cost tracking.

### Projectile Spatial Query Crossover

Decision: keep both paths configurable. The matrix records rebuild writes, bucket
array allocations, cell visits, and candidate distance checks. One query per
rebuild does more dominant work than a scan; at 10,000 targets and 256 queries the
retained grid performs 80,000 rebuild writes, 18,432 cell visits, and 33,624
candidate checks instead of 20.48 million distance checks. Finite grids now reuse
cleared bucket arrays, while unbounded indexes release them by default. Three Arena
uses separate bullet/splash scratch buffers and exposes `enemySpatialGrid=0` for
the low-query control.

## Future Target Ideas

- Generalize the spatial and render JSON writers into a date-stamped bench-report helper shared by every suite.
- Add memory and retained-buffer reporting to protocol and render benches.
- Add a static replication backlog stress bench before revisiting static segment ordering.
- Add a typed AOI prototype before any WASM AOI experiment.
- Add an MMO demo client update bench separate from render frame timing.
- Add cache hit/miss counters for draw-data caches before tuning default policies.
- Add fairness and drift reporting to server scheduling benches.
- Add payload byte deltas to dirty-field and replication benches.
- Add HLOD or proxy-cluster proof for distant static props after per-object LOD has a clean triangle win.
- Add LOD hysteresis once the first real lower-mesh scene is wired into the browser bench.

## Decision Queue

| Priority | Hypothesis | Next Decision |
| --- | --- | --- |
| Closed | Protocol binary input view | Keep safe copy by default and explicit synchronous borrow for proven high-rate codecs. |
| High | Dirty delta field hints | Keep API-only or broaden nested dirty masks after sparse-state bench. |
| High | Server scheduler flags | Keep hidden flags or promote documented opt-ins after fairness matrix. |
| High | WASM collision dispatch | Review the required scheduled Chromium/Firefox/WebKit artifact matrix and calibrate copied TypeScript/WASM/auto thresholds per host while retaining forced modes. |
| Medium | Draw data cache key narrowing | Keep off, specialize by surface, or remove if repeated benches fail. |
| Medium | Configurable 3D LOD policy | Wire real lower meshes in Three Arena, then promote only if full-loop p95 and triangle budgets improve without draw-call churn. |
| Medium | Client prediction spatial index | Promote demo pattern or keep local after client update bench. |
| Medium | In-place post-processing | Promote API or keep prototype after full-frame bench. |
| Low | WASM AOI cull | Revisit only after typed AOI buffers exist. |
