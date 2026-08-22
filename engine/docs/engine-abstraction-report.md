# Engine Abstraction Report

Targets: `./engine`, `./examples/mmo-skill-demo`

Boundary: `./engine` owns reusable infrastructure. `./examples/mmo-skill-demo` proves the experimental MMO path. Game content, authored rules, art choices, UI copy, balance, quest text, NPC identity, item IDs, and economy tables stay local.

## Engine promotions and measured tradeoffs

### Render frame pooling

- File path(s): `./src/render/frame-pool.ts`, `./src/render/index.ts`, `./examples/mmo-skill-demo/src/client/render.ts`, `./examples/mmo-skill-demo/src/client/render/*`
- Pattern observed: MMO render modules repeatedly need reusable `Renderable` arrays, records, points, and path commands with per-frame reset.
- Current cost/risk: each game can rebuild its own pooling layer, causing allocation drift and inconsistent reset behavior.
- Recommended destination: `@hyperfocus/engine/render`
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: medium; reuse behavior is correct, but default performance benefit is unproven
- Patch size: small
- Tests/benchmarks needed: engine render pool reuse/reset tests, MMO render tests, quick render-call benchmark.
- Status: implemented in this pass. A small serial microbench did not prove a raw CPU win against naive allocation, so this should be treated as a boilerplate/allocation-control promotion, not a default frame-time claim.

### Controller action-frame mapping

- File path(s): `./examples/mmo-skill-demo/src/client/input.ts`, `./examples/mmo-skill-demo/src/client/client.ts`, `./examples/mmo-skill-demo/src/tests/input.test.ts`
- Pattern observed: radial deadzone, button thresholds, held-action priority, aim offset, and input-mode reflection are content-free; action names and bindings are game-local.
- Current cost/risk: future top-down games may copy the controller shell and diverge on deadzone/priority behavior.
- Recommended destination: `@hyperfocus/engine/mmo` or a focused input subpath after a small API proof.
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: high
- Patch size: small
- Tests/benchmarks needed: deadzone, held priority, button threshold, keyboard/controller merge tests.

### Binary writer consolidation

- File path(s): `./src/protocol/encode.ts`, `./src/protocol/byte-buffer.ts`
- Pattern observed: protocol encoding has more than one writer/reader shape, with different copy and string-cache behavior.
- Current cost/risk: duplicated hot-path buffer logic can regress allocations and protocol throughput independently.
- Recommended destination: `@hyperfocus/engine/protocol`
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: high
- Patch size: medium
- Tests/benchmarks needed: protocol tests and `bun run bench:protocol`.

### Protocol frame decode payload views

- File path(s): `./src/protocol/frames.ts`, `./src/protocol/protocol.test.ts`, `./readme.md`
- Pattern observed: replication frame and multipart envelope decode copied payload slices even when callers only needed read-only views.
- Current cost/risk: segmented replication decode paid avoidable allocation and memory bandwidth for every payload.
- Recommended destination: `@hyperfocus/engine/protocol`
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: high
- Patch size: small
- Tests/benchmarks needed: protocol tests, protocol decode A/B bench under `./.local`, and MMO shared replication tests.
- Status: implemented after A/B. Median decode p95 improved `145.427ms -> 102.179ms`, median decode cost improved `23.95us -> 17.152us`, and heap delta improved `17.075MB -> 0.618MB` for the local multipart decode bench. Decoded payloads are now documented as zero-copy views that callers should treat as read-only.

## Keep experimental subpath

### Render staging and culling shell

- File path(s): `./src/render/stage.ts`, `./src/render/batch.ts`, `./examples/mmo-skill-demo/src/client/render.ts`, `./examples/mmo-skill-demo/src/client/render/camera.ts`
- Pattern observed: layer config, camera viewport, near-view checks, staged push/flush, y-sort, and culling are reusable but still tied to one MMO proof target.
- Current cost/risk: useful boilerplate exists, but extracting too much would hide game visual mapping.
- Recommended destination: `@hyperfocus/engine/render`
- WASM appropriate: maybe later for typed cull/sort-key prep after benchmark proof
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: medium
- Tests/benchmarks needed: y-sort/culling tests, render-stage microbench, quick render-call benchmark.

### Static/volatile cell replication

- File path(s): `./examples/mmo-skill-demo/src/shared.ts`, `./examples/mmo-skill-demo/src/segmented-replication.ts`, `./examples/mmo-skill-demo/src/shared-hot.ts`
- Pattern observed: normalized entities, hot slabs, dirty masks, shared-cell AOI, static discovery queues, acks, and packed volatile/static segments.
- Current cost/risk: large perf surface, but current schema and static content shape are one-demo proof.
- Recommended destination: small helpers under `@hyperfocus/engine/server` and `@hyperfocus/engine/protocol`
- WASM appropriate: maybe for typed batch grouping, range masks, and sort/filter kernels after TS arrays are isolated
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: large overall, small per helper
- Tests/benchmarks needed: shared/segmented replication tests, input-codec tests, `bun run bench:server`, `bun run bench:mmo`, MMO `bench:dungeon:quick`.

### Client RAF/input-send shell

- File path(s): `./examples/mmo-skill-demo/src/client/client.ts`, `./examples/mmo-skill-demo/src/client/interpolation.ts`, `./examples/mmo-skill-demo/src/client/local-prediction.ts`
- Pattern observed: RAF tick, gamepad polling, interpolation sample, throttled input send, local prediction, UI sync, and render dispatch are a reusable-looking client loop.
- Current cost/risk: ordering is fragile and still demo-specific around transport, prediction, UI, and telemetry.
- Recommended destination: keep experimental, possibly `@hyperfocus/engine/mmo` after a second authoritative client.
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: low
- Patch size: medium to large
- Tests/benchmarks needed: fake-clock ordering tests, interpolation/prediction tests, direct browser playability smoke.

## Keep game-local

### Authored MMO content and rules

- File path(s): `./examples/mmo-skill-demo/src/data/*`, `./examples/mmo-skill-demo/src/shared.ts`, `./examples/mmo-skill-demo/src/game.ts`, `./examples/mmo-skill-demo/src/server/*`, `./examples/mmo-skill-demo/src/client/ability-tooltips.ts`
- Pattern observed: recipes, materials, skills, quest text, world layout, NPC roles, item IDs, gathering/crafting rules, hazard semantics, tone choices, and tuning.
- Current cost/risk: promoting this would make the engine own one game fiction and balance model.
- Recommended destination: game-local
- WASM appropriate: no, except future isolated numeric kernels
- Pixel buffers appropriate: no
- Confidence: high
- Patch size: none
- Tests/benchmarks needed: existing game/server tests only when local behavior changes.

### Regional map and minimap art

- File path(s): `./examples/mmo-skill-demo/src/client/map-overlay.ts`
- Pattern observed: direct Canvas route painting, regional terrain, palette, labels, anchors, chrome, and pointer behavior.
- Current cost/risk: direct Canvas is acceptable here because the surface is quarantined and authored; promotion risk is moving map content into engine.
- Recommended destination: game-local, with optional generic marker/legend/pointer helpers later
- WASM appropriate: no
- Pixel buffers appropriate: maybe only if cached terrain/fog/minimap masks become measured hot paths
- Confidence: high
- Patch size: small for helpers, medium for a split
- Tests/benchmarks needed: minimap/world-map screenshot smoke, pointer math tests, render-call benchmark if cached raster path is added.

## WASM/SIMD candidates

### Numeric movement, collision, and target filtering

- File path(s): `./src/wasm/collision-kernel.ts`, `./assembly/collision-kernel.ts`, `./examples/mmo-skill-demo/src/shared.ts`, `./examples/mmo-skill-demo/src/client/local-prediction.ts`
- Pattern observed: existing kernel covers movement, rotation, range filtering, and overlap batches; demo has repeated distance, swept movement, collision, and nearest-target loops mixed with rules.
- Current cost/risk: scalar loops are rule-coupled; small JS/WASM batches may lose due to copy overhead.
- Recommended destination: `@hyperfocus/engine/mmo` for TS batch APIs first, then WASM only for typed buffers with benchmark proof
- WASM appropriate: yes, for large deterministic typed batches
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: medium
- Tests/benchmarks needed: JS/WASM parity tests, batch-size matrix benchmark, local-prediction tests, dungeon quick bench.

### AOI and visibility masks

- File path(s): `./src/mmo/interest.ts`, `./src/server/interest-grid.ts`, `./src/server/visibility-snapshot.ts`, `./examples/mmo-skill-demo/src/shared.ts`
- Pattern observed: interest snapshotting scans/sorts entities; server interest grid and demo static discovery already express visibility as repeatable numeric filtering.
- Current cost/risk: AOI can dominate large rooms, but current APIs still expose object maps and schema-specific projections.
- Recommended destination: `@hyperfocus/engine/server` and `@hyperfocus/engine/mmo`
- WASM appropriate: maybe after object data becomes typed position/radius/priority arrays
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: medium
- Tests/benchmarks needed: 100-viewer AOI bench, moving/upsert/remove churn bench, server scale benches.

### Server tick kernels

- File path(s): `./src/server/clock.ts`, `./src/server/server.ts`, `./examples/mmo-skill-demo/src/shared.ts`
- Pattern observed: JS owns scheduling and room orchestration; deterministic per-entity updates and status/cooldown ticks can be numeric kernels when isolated.
- Current cost/risk: moving broad game logic would hide rules; async tick overlap and large per-room loops need measurement.
- Recommended destination: `@hyperfocus/engine/server` for orchestration; `@hyperfocus/engine/mmo` or WASM only for narrow numeric kernels
- WASM appropriate: maybe for status/cooldown/projectile kernels over typed arrays
- Pixel buffers appropriate: no
- Confidence: low to medium
- Patch size: medium
- Tests/benchmarks needed: server clock backpressure tests, MMO load benches, parity tests for any kernel.

## Pixel-buffer candidates

### Post-processing filters and distortion

- File path(s): `./src/canvas/post-processing.ts`, `./src/canvas/post-processing-prototype.ts`
- Pattern observed: pixel and distortion effects use full-frame readback/submission; some helpers allocate tuple-per-pixel or fresh image buffers.
- Current cost/risk: full-frame GC and memory bandwidth can dominate frame time.
- Recommended destination: `@hyperfocus/engine/post-processing/prototype` until stable proof; stable budget helpers stay root
- WASM appropriate: maybe for deterministic typed-array kernels
- Pixel buffers appropriate: yes
- Confidence: high
- Patch size: medium to large
- Tests/benchmarks needed: pixel parity tests, buffer throughput bench, readability/budget checks.

### Minimap, fog, lighting, and masks

- File path(s): `./examples/mmo-skill-demo/src/client/map-overlay.ts`, `./src/canvas/post-processing.ts`
- Pattern observed: regional map/minimap and mask-like effects are natural buffer candidates only if cached raster or fog/visibility layers become hot.
- Current cost/risk: no evidence current map overlay is slower than normal Canvas drawing.
- Recommended destination: game-local prototype first, then `@hyperfocus/engine/post-processing/prototype` for generic mask kernels
- WASM appropriate: maybe
- Pixel buffers appropriate: yes, after benchmark proof
- Confidence: low
- Patch size: medium
- Tests/benchmarks needed: map screenshot smoke, pixel-buffer vs Canvas terrain/minimap benchmark.

## Render staging candidates

### Culling, screen rects, and sort-key preparation

- File path(s): `./src/render/batch.ts`, `./src/render/stage.ts`, `./examples/mmo-skill-demo/src/client/render.ts`, `./examples/mmo-skill-demo/src/client/render/terrain.ts`
- Pattern observed: engine already has render bounds, culling, sort, and stage helpers; demo adds camera near-view checks and terrain tile visibility.
- Current cost/risk: repeated prep code may diverge, but broad extraction could hide visual rules.
- Recommended destination: `@hyperfocus/engine/render`
- WASM appropriate: maybe for typed cull/sort-key generation at high counts
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: small to medium
- Tests/benchmarks needed: render-stage push/sort/flush microbench, mixed-call culling bench, quick render-call bench.

## Server/MMO hot paths

### Replication scheduling and byte budgets

- File path(s): `./src/server/replicator.ts`, `./src/server/server.ts`, `./examples/mmo-skill-demo/scripts/dungeon-20-player-bench.ts`
- Pattern observed: sequence acks, byte budgets, deferred segments, room-bucket scheduling, and replication telemetry are reusable server infrastructure.
- Current cost/risk: over-broad extraction could tie engine API to one segmented replication envelope.
- Recommended destination: `@hyperfocus/engine/server`
- WASM appropriate: no for orchestration; maybe for numeric segment selection masks later
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: medium
- Tests/benchmarks needed: server tests, server benches, dungeon quick bench with telemetry.

### Interest and spatial churn

- File path(s): `./src/server/interest-grid.ts`, `./src/server/spatial-hash.ts`, `./src/mmo/interest.ts`
- Pattern observed: interest grid and spatial hash have correctness and scale coverage, but churn cases and object-map snapshotter performance need more proof.
- Current cost/risk: high player/entity counts can turn scans, sorts, and allocation churn into room tick spikes.
- Recommended destination: `@hyperfocus/engine/server`
- WASM appropriate: maybe after typed arrays exist
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: small to medium
- Tests/benchmarks needed: moving/upsert/remove churn bench, 100-viewer snapshotter bench, server scale bench.
- Status: A/B tried a scratch priority-bucket path in `./src/server/interest-grid.ts`; rejected because median p95 worsened `17.667ms -> 20.328ms` and median heap delta worsened `79.451MB -> 82.415MB` on the local 100-viewer/10k-entity bench.

## Boilerplate cleanup

### UI shell and one-open-panel state

- File path(s): `./examples/mmo-skill-demo/src/client/ui-shell.ts`, `./examples/mmo-skill-demo/src/client/client.ts`, `./examples/mmo-skill-demo/src/client/render/hud.ts`
- Pattern observed: compact panel state, toolbar actions, focus prompts, and hotbar HUD behavior are reusable in shape.
- Current cost/risk: copy/items/quest UI are local; extracting too much would hard-code demo UX.
- Recommended destination: `@hyperfocus/engine/ui`
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: medium
- Patch size: small to medium
- Tests/benchmarks needed: compact panel tests, HUD render tests, DOM smoke.

### Scheduler and loop contracts

- File path(s): `./src/runtime/loop.ts`, `./src/canvas/bootstrap.ts`, `./src/server/clock.ts`, `./examples/mmo-skill-demo/src/client/client.ts`
- Pattern observed: RAF/init/server clocks are separate; server `onTick` is async fire-and-forget.
- Current cost/risk: duplicated loops and potential async tick overlap under load.
- Recommended destination: root runtime for browser loops; `@hyperfocus/engine/server` for server clock backpressure policy
- WASM appropriate: no, except deterministic numeric kernels called by JS scheduling
- Pixel buffers appropriate: no
- Confidence: high for docs/tests, medium for implementation
- Patch size: medium
- Tests/benchmarks needed: loop tests, server clock serialization/backpressure tests, MMO tick bench.

## Drift/regression warnings

### Prototype post-processing export drift

- File path(s): `./browser/engine.js`, `./src/canvas/post-processing.ts`, `./src/canvas/post-processing-prototype.ts`, `./readme.md`
- Pattern observed: docs say prototype helpers moved off root; checked browser bundle may still carry implementation symbols from the old root surface.
- Current cost/risk: bundle/API drift and accidental root reliance.
- Recommended destination: stable helpers on root, prototype helpers in `@hyperfocus/engine/post-processing/prototype`
- WASM appropriate: maybe for buffer kernels only
- Pixel buffers appropriate: yes for pixel effects
- Confidence: high
- Patch size: medium
- Tests/benchmarks needed: build plus export grep/smoke, post-processing tests.

### WASM overclaim risk

- File path(s): `./readme.md`, `./assembly/collision-kernel.ts`, `./src/wasm/collision-kernel.ts`
- Pattern observed: older docs implied current WASM covered culling/sort-key prep; current kernel covers collision, movement, rotation, range filtering, and overlaps.
- Current cost/risk: readers may promote WASM prematurely or expect missing exports.
- Recommended destination: docs and future benchmark lanes
- WASM appropriate: yes for measured kernels
- Pixel buffers appropriate: no for this kernel
- Confidence: high
- Patch size: small
- Tests/benchmarks needed: docs only now; parity/bench when adding exports.

### Shared memory caveat

- File path(s): `./src/core/schema.ts`, `./src/index.ts`, `./src/core.ts`, `./readme.md`
- Pattern observed: shared memory pool is public, but docs should keep cross-origin isolation and hot-loop byte access caveats visible.
- Current cost/risk: browser runtime surprise and misuse of proxy-style reads in hot paths.
- Recommended destination: `@hyperfocus/engine/core`
- WASM appropriate: no
- Pixel buffers appropriate: no
- Confidence: high
- Patch size: small to medium
- Tests/benchmarks needed: core tests; bench only if adopted by MMO hot paths.

## Suggested benchmarks/tests

- `bun test ./src/render/index.test.ts ./examples/mmo-skill-demo/src/tests/render.test.ts`
- `bun run ./examples/mmo-skill-demo/scripts/render-call-bench.ts --frames=20 --warmup=5 --out=examples/mmo-skill-demo/.local/render-smoke.json`
- `bun test ./src/canvas/post-processing.test.ts`
- `bun test ./src/wasm/collision-kernel.bench.test.ts`
- `bun test ./src/protocol/*.bench.test.ts`
- `bun test ./src/server/*.bench.test.ts`
- `cd ./examples/mmo-skill-demo; bun run test; bun run bench:dungeon:quick`
