# Engine public API reference

## Menu navigation input

`createMenuNavigationInput` from `@hyperfocus/engine/ui/core` turns normalized
analog or digital vectors into cardinal movement events without DOM, timers,
gamepad globals or app preferences. The standalone menu navigator and its
controller text keyboard consume it. The host owns focus, layout and activation.

`sample({ nowMs, x, y, digital? })` returns `up`, `down`, `left`, `right`, or
undefined. A supplied digital vector takes priority over analog input. Invalid
axes normalize to neutral; invalid configuration or a nonfinite clock rejects.
Defaults: engage at 0.6, release at 0.35, axis-switch margin 0.15; immediate first
movement, 400 ms initial delay, then 100 ms repeat. The distinct thresholds and
axis margin prevent drift, threshold chatter and diagonal oscillation. Timings
and thresholds are configurable at construction.

Only one event can occur per sample; missed repeats never accumulate. Direction
changes respond immediately. Call `reset({ waitForNeutral: true })` on menu/page
handoff or lost focus so held movement cannot skip the destination's first item.
A backwards clock also waits for neutral. Disconnect supplies neutral input.
Accept/Back edge detection and suppression until release belong to the host.
The [game-menu contract](../../../docs/design-system/game-menus.md#input-ownership-and-navigation)
owns first-party composition and interaction rules.

## Surface selection

The root package is intentionally browser-facing. Its preferred surface is the scoped browser app lifecycle plus common canvas, input, camera, map, animation, collision, and diagnostic primitives. Three-specific indicators and richer staged rendering stay in `@hyperfocus/engine/render`.

`@hyperfocus/engine/core` is the deterministic, DOM-free surface for tooling, tests, and non-browser consumers. Math, grid, object-pool, and stage primitives that do not depend on canvas, input globals, RAF, or WASM asset loading belong there as well as on root when browser games need them.

Do not promote new helpers to root only because a single game needs them. Prefer game-local code until at least two migrated entries prove the same abstraction. Experimental subpaths are allowed for distinct launchpad jobs with package proof; do not expose source-layout folders as API.

- Keep on root: `createBrowserApp`, `createFrameMetrics`, `createFixedStepLoop`, `init`, scoped keyboard/pointer/canvas-object input helpers, hardware gamepad helpers, camera, map/minimap overlays, drawing/text helpers, sprite atlas and frame-animation helpers, deterministic collision/grid helpers, passive collision broadphase helpers, tagged tile-map helpers, WASM collision loading, and stable costed post-processing helpers.
- Keep on `@hyperfocus/engine/core`: object-pool, stage, collision, broadphase, vector, ray, and grid helpers that stay DOM-free.
- Keep on published focused subpaths: portable project JSON/ZIP, audio, effects, saves, content, navigation, first-party rendering and physics, motion, migrations, UI, and asset cooking/loading. Their exact stability and limitation boundaries are documented in the [package contract](../readme.md#package-contract).
- Keep on focused experimental subpaths: MMO launchpad helpers, richer top-down render staging, optional MMO UI shell, asset loader helpers, and internal template assets.
- Build future public contracts for on-screen touch controls and a Node-native WASM loader, plus the remaining breadth tracked in the readiness roadmap. The current `src/onScreenGamepad.ts` helper is a tested repo-local prototype, not a package export. The repo-local editor owns its current project/tooling model under `apps/engine-editor`; portable project schemas and migration contracts stay published independently of the editor shell.
- Keep game-local: game action semantics, HUD, audio choices, asset paths, fallback policy, level data, economy/progression systems, enemy AI, and one-off visual effects.

- `createBrowserApp(options)`: preferred browser lifecycle with explicit start, fixed-step updates, scoped keyboard actions, cleanup, resolved configuration, and optional bounded frame metrics. It never installs legacy global input or exposes timing globals.
- Its canvas host, `game.app`, accepts `resize({ width, height })` when logical project dimensions change; `resize()` keeps the current dimensions. Logical size, fitted CSS dimensions, and DPR backing buffers update together. Invalid dimensions leave the previous size intact.
- `createFixedStepLoop(options)`: low-level RAF timing, delta clamping, pause, resume, running-state readback, update/render ordering, and explicit `beforeUpdate`/`afterUpdate` hooks.
- `createFrameMetrics(options)`: bounded rolling numeric series, p50/p95/p99 summaries, long-frame records, timers, counters, reset, and JSON-friendly snapshots.
- `createBufferedFrames` and `createRenderFramePacket3D` on `@hyperfocus/engine/experimental`: opt-in bounded frame handoff and fixed-scene render packets for injected executors. Hosts own workers; no default game-loop migration or automatic concurrency. See [buffer ownership and limitations](../src/experimental/README.md).
- `createSimulationMailbox` on `@hyperfocus/engine/experimental/simulation-mailbox`: a persistent world's fixed clock, latest continuous input and bounded discrete events. Hosts own transport and scheduling; [the contract](../src/experimental/README.md) distinguishes received and applied input and defines overflow/failure behavior.
- `createTargetRayQuery3D` on `@hyperfocus/engine/experimental/target-rays`: selectable reference/axis-aligned sight queries with optional work counters; see [ownership and numeric semantics](developer-performance.md).
- `createAuthoritativeServer(options)`: Bun WebSocket authoritative server with serialized fixed ticks, rooms, optional managed MMO shard admission, explicit opt-in dev auth (`devMode: true`), pluggable auth and persistence, health/stats endpoints, and connection-bound input handling. Await `server.stop()` when final player and room persistence must complete.
- `createRoomType(options)` and `createZoneType(options)`: room or zone definitions for authoritative state, join policy, player lifecycle, input handling, simulation update, interest target, and per-player snapshots.
- `defineSchema`, `encodeSnapshot`, `decodeSnapshot`, `encodeDelta`, and `decodeDelta`: DOM-free binary replication schema helpers for server/client state transfer.
- `decodeReplicationFrame` and `decodeMultipartReplicationEnvelope`: decode frame and segment payloads as zero-copy `Uint8Array` views. Decoded segment kinds are strings unless `decodeMultipartReplicationEnvelope` receives a caller-owned `parseKind`; treat decoded payloads as read-only unless the caller owns the source buffer.
- `createInterestGrid(options)` and `createMmoInterestGrid(options)`: area-of-interest entity indexing with visibility enter/leave, hysteresis, and visible entity caps.
- `createMmo1000Preset(options)`: opt-in 1000-total-CCU preset for 10 managed public room shards at 100 players each; explicit room IDs still route to their named rooms. Implicit admission defaults to least-loaded balancing; set `admissionSelection: "fill-first"` when a public lobby should keep early players together before spilling to the next shard.
- `createEntityReplicator(options)`: sequence-numbered snapshots and deltas with ack tracking and per-client byte budget enforcement.
- `init(options)`: low-level canvas setup with device-pixel-ratio resolution and `letterbox`, `fit`, or `stretch` sizing. It does not start or publish timing globals unless `autoStart: true` or `globals: true` is explicitly requested.
- `createObjectPool(options)`: fixed-capacity reuse for hot-path POJO entities and effects. Snapshot restoration requires a caller-owned `deserializeItem(snapshot)` parser; the pool never treats unvalidated snapshot data as an item.
- `createRetainedCursor(options)` on `@hyperfocus/engine/core`: fixed-capacity stable-record reuse for callers that fully overwrite every borrowed item. Overflow throws by default; bounded growth is explicit.
- `createRenderFramePool(options)`, `renderArray(pool)`, and `renderRecord(pool, kind)`: opt-in `@hyperfocus/engine/render` allocation-control helpers. `recordStrategy` is `clear` (safe reuse), `fresh`, or `overwrite` (caller must assign every field). Choose from full-loop p95/p99 and memory evidence, not allocation count alone.
- `createStage(options)`: POJO entity spawn, update, removal, and render ordering by numeric `layer`; higher layers draw later. Restoring serialized entities requires an explicit `deserializeEntity(snapshot)` parser.
- `createKeyboardActions(bindings, target?, options?)`: maps keyboard codes to stable action state and explicit pressed, held, and released transitions. Text fields and editable content remain usable by default; opt into `captureEditableTargets` only for an input surface that deliberately owns typing. Held and one-frame state reset on target blur by default; pass `resetOnBlur: false` only when the consumer owns focus recovery.
- `createPointerInput(canvas)`: normalizes mouse and touch input into canvas-space pointer snapshots.
- `createCanvasObjectEvents(canvas, objects)`: delegates pointer clicks and hover events to hit-tested canvas objects.
- `createCamera(options)`: viewport camera state for panning, anchored zooming, following targets with optional deadzones and smoothing, world/screen coordinate conversion, and scoped canvas transforms.
- `createGameMap(options)`: factory-first canvas map/minimap overlay for target-following HUD radar or free-pan regional maps, with world-space markers, edge-clamped indicators, dashed routes, zoom-aware labels, terrain hooks, compass rose, and legend drawing. `new GameMap(options)` remains a compatibility shim over the same factory.
- `registerSprite(id, image)`, `drawSprite(id, x, y, options)`, `drawSpriteSlice(id, x, y, frameIndex, options)`, `createSpriteBatchFrames(options)`, and `drawSpriteBatch(id, entries, options)`: stateless sprite drawing, data-driven sheet slicing, and fast atlas batches for high-count sprites without per-sprite canvas state saves.
- `createTextureAtlas`, `createTexturePackerAtlas`, `parseTexturePackerAtlas`, `createAnimationClip`, `createAnimationPlayer`, `createAtlasClip`, and `createAtlasAnimation`: data-only atlas parsing and frame playback primitives for browser games that own asset loading, sprite drawing, state transitions, and animation meaning.
- `animationApiProfiles` and `atlasApiProfiles`: stability, proof, and exposure classification for root-exposed atlas and frame-animation helpers so those exports stay an intentional browser-game contract instead of source-layout drift.
- `drawRect`, `drawCircle`, `drawLine`, and `drawPolygon`: primitive drawing for prototypes, debug overlays, and minimalist geometry games.
- `pushTransform(options)` and `popTransform(options)`: stack-based canvas transforms for grouped movement, rotation, scale, and alpha.
- `loadFont`, `registerFont`, `textReady`, `measureText`, and `drawText`: custom font registration plus text drawing and measurement.
- `clamp`, `rectsOverlap`, `circleRectOverlap`, `testCircleRectOverlap`: deterministic collision helpers.
- `createCollisionBroadphase(options)`: opt-in R-tree-style AABB index for passive collision candidate management. Consumers own entity state and pass ids plus bounds through `upsert`, `remove`, or `rebuild`; games query candidates or unique pairs before running narrowphase checks.
- `gridKey`, `inBounds`, `sameCell`, `opposite`: deterministic grid helpers.
- `createTileset`, `createTileMap`, `generateTileMap`, `renderTileLayer`, `getTileAt`, `worldToTile`, `tileToWorld`, `extractCollisionRects`, and `seededRandom`: tagged tile-sheet definitions, compact tile layers, deterministic generated maps, visible canvas tile rendering, spawn marker placement, and collision extraction for browser games that keep their art and rules local.
- `resolveCollisionKernelWasmUrl(options)`: resolves the compatibility, scalar, or SIMD packaged collision WASM asset from the current engine module URL or an explicit base URL.
- `createCollisionKernel({ batchPolicy })`: normalizes `auto`, forced TypeScript, or forced WASM dispatch once outside numeric hot loops. `auto` defaults to WASM at batch 256; hosts may set one fallback threshold plus named per-operation thresholds without allocating options in leaf loops.
- `createCollisionKernel(options)`: loads the SIMD production artifact first when `variant: "auto"` detects support, otherwise loads scalar, and falls back to the TypeScript helper. `variant: "scalar"` and `variant: "simd"` are forced evidence/debug paths; a custom `url` is labeled `custom`. Fixed scratch reserves 64 KiB once by default, while `scratchStrategy: "grow"` is the explicit variable-capacity path. `batchPolicy` keeps copied batches below the measured threshold in TypeScript. The kernel exposes batched movement integration, point rotation, range filtering, rect collision, and circle/rect collision helpers.
- `kernel.createResidentCircleRectBatch(batch)`: optional WASM-only fixed-count path that copies input columns once, runs repeatedly with zero timed host-boundary bytes, copies the result mask only when requested, and releases its exclusive module arena explicitly. Keep the copied batch helper as the baseline for changing inputs.
- `createPostProcessStack(effects)`: ordered canvas post-processing pass for pixel effects and overlay effects.
- `canonicalHyperfocusJson`, `encodeHyperfocusProject`, and `decodeHyperfocusProject` on `@hyperfocus/engine/project`: deterministic, finite, cycle-free project JSON encoding and parsing. Decoding without a parser returns `unknown`; pass a caller-owned `(value: unknown) => TProject` parser to receive validated typed data.
- `packHyperfocusAssets` and `unpackHyperfocusAssets` on `@hyperfocus/engine/project`: bounded deterministic ZIP storage for sorted SHA-256 objects, with per-object store/deflate choice, CRC-32 checks, content-hash verification, and unsafe-entry rejection.
- `createHyperfocusProjectFiles` and `openHyperfocusProjectFiles` on `@hyperfocus/engine/project`: create or validate the canonical `project.json` and `assets.hfp` pair while resolving asset catalog records to verified bytes. Typed opens require `options.parseProject`; archive-only opens leave `project` as `unknown`.
- `exportHyperfocusExchange` on `@hyperfocus/engine/project`: returns canonical project JSON and deterministic ordinary asset files programmatically. `@hyperfocus/engine/project/neutral-export`, `bun run export:project`, and the editor action share safe filenames, a deterministic hash manifest, and exact unsupported-component diagnostics; directory exports are transactional/no-overwrite and the browser fallback is one standard ZIP.
- `createPlayableWorld` and `auditPlayableProject` on `@hyperfocus/engine/project/runtime-2d`: deterministic DOM-free 2D project execution and explicit diagnostics for behavior/collider semantics the portable runtime cannot execute. `PORTABLE_BUILTIN_BEHAVIOR_MODULES_2D` and `PLAYABLE_POST_EFFECT_IDS_2D` are the canonical standalone capability lists shared by authoring and release preflight.
- `hitTestPlayableAction2D` and `hitTestPlayableEntity2D` on `@hyperfocus/engine/project/runtime-2d`: shared rotated-rectangle picking for authored sprites and UI. Hosts supply world and screen points; fixed HUD entities rank above world content. Sprite/UI `pointerAction` values name ordinary input actions. The helper returns an action or entity id without dispatching input or depending on a browser. Editor Play and standalone delivery use this geometry for clickable authored controls.
- `createAudioEngine`, `computeSpatialAudio`, `chooseAudioLoadPolicy`, `renderSfxPreset`, and `createSfxPresetBank` on `@hyperfocus/engine/audio`: bounded first-party playback orchestration, pure spatial/policy decisions, and a five-style procedural SFX baseline.
- `SaveProfileStore`, `SaveMigrationRegistry`, `exportSaveProfile`, and `importSaveProfile` on `@hyperfocus/engine/save`: atomic profile operations and portable integrity-checked envelopes.
- `createSignedSessionAuthority`, compatibility constructor `SignedSessionAuthority`, `createServerOperations`, and `createPortableMemoryPersistenceAdapter` on `@hyperfocus/engine/server`: rotating one-use session admission, structured health/metrics, graceful drain, and provider-neutral backup/restore primitives.
- `createScenePrefabCatalog` and `createSceneLifecycle` on `@hyperfocus/engine/content`: deterministic prefab/variant expansion and serialized transactional scene lifecycle.
- `createGridNavigator` on `@hyperfocus/engine/navigation`: allocation-stable A* queries into caller-provided `Int32Array` paths.
- `getPostProcessEffectCost`, `summarizePostProcessCost`, and `checkPostProcessBudget`: explicit post-processing cost readback for overlay, pixel, and distortion tiers before games commit full-canvas work to the render loop.
- `postProcessApiProfiles`: stability, cost-tier, proof, promotion, and exposure classification for post-processing helpers, so games can keep stable root API separate from prototype spectacle helpers and avoid treating one migrated proof as family-wide promotion.
- Root post helpers cover grayscale, invert, brightness, contrast, sepia, threshold, vignette, tint, posterize, gamma, CRT scanlines, screen shake, color grading, film grain, retro dithering, color LUT mapping, and digital noise. Prototype helpers such as bloom, chromatic aberration, glitch, motion blur, pixelate, radial blur, shockwave distortion, scanline flicker, color fringe, neon glow, heat haze, lens flare, star streak, flashbang, and barrel distortion now import from `@hyperfocus/engine/post-processing/prototype`.

Experimental subpaths stay off root:

- `@hyperfocus/engine/mmo` owns normalized entity registry, public/private/owner-only visibility rules, AOI snapshots, room lifecycle glue, profile persistence hooks, content-free state shapes, selectors, validation, cooldown/resource ticking, client input mapping, and interpolation builders. Games still own item IDs, rewards, quest copy, NPC roles, formulas, tuning, economy, and art.
- `@hyperfocus/engine/render` owns Canvas context creation, top-down layer staging, camera transforms, y-axis sorting, culling/sort helpers, render-frame pooling, tile cache rendering, actor sprites, HUD helpers, text wrapping/truncation, bars, labels, outlines, structured primitives, and effect queues. It must stay content-free: no item IDs, NPC kinds, quest copy, art lookup, or demo tuning.
- `@hyperfocus/engine/render/3d` owns reusable Three.js setup, draw-call submission, animation/ragdoll helpers, and opt-in toroidal world math for wrapped coordinates and edge-view duplicate offsets. It should stay a thin renderer contract, not a game framework: no enemy AI, level data, weapon logic, lobby rules, or asset-pack-specific loading policy.
- `@hyperfocus/engine/physics/3d` owns content-free 3D collider shapes, overlap/submersion checks, `heightAt`-style ground placement, timed interpolation helpers, rubber-band callbacks, and an opt-in kinematic character primitive with forces. Games still own genre movement presets, authored terrain generation, traversal rules, combat clearance, and asset-name-to-collider policy.
- `@hyperfocus/engine/ui/core` owns the DOM-free MMO UI controller and generic renderer connection contract. Its stable snapshots and subscriptions plug directly into React `useSyncExternalStore`, Vue refs, Svelte stores, or a custom renderer.
- `@hyperfocus/engine/ui` owns the optional zero-dependency DOM renderer, MMO shell widgets, one-open panels, roving focus, dialogs/tooltips, and small theme/control token helpers. Pass a shared controller into `createMmoUiShell` to use the default renderer. Game screens still own markup, copy, layout, and brand palette. See [framework UI integration](framework-ui.md).
- `@hyperfocus/engine/assets/loader` owns lazy task start, weighted progress snapshots, smoothed visible progress, RAF-driven loader rendering, and optional Canvas or DOM loader shells. Games still own asset IDs, paths, labels, fallbacks, and which bundles load before play versus in the background.
- `@hyperfocus/engine/assets/templates` owns internal template bitmap lookup only. Its embedded images are the package-owned, mechanically generated one-pixel swatches described above; no third-party artwork is present. General licensing and publishing prerequisites are tracked in the licensing model and release TODO.

Post-processing tiers are deliberately blunt. `overlay` effects draw with normal canvas commands or compositing and do not require pixel readback. `pixel` effects share one stack-level `getImageData` and `putImageData` pass but still touch every pixel. `distortion` effects perform dedicated source-to-output canvas passes and should stay rare, opt-in, and guarded by a game-local budget. WASM is valid for post-processing only when the work is a deterministic buffer kernel over typed arrays and JS still owns Canvas readback/submission.

Stable post-processing API is the stack, cost/budget readback, deterministic pixel filters, `screenShake`, and `crtScanlines`. Prototype helpers moved off root into `@hyperfocus/engine/post-processing/prototype`; old root imports for `bloom`, `pixelate`, `glitch`, and related prototype effects should switch to that subpath. `flashbang` has migrated-game proof in `bubble-cluster` and `breakout` but remains prototype; blur, glow, flare, flicker, chromatic, motion, radial, distortion, and haze effects remain candidate-only until migrated-game proof shows smaller call sites with timing, intensity, readability, HUD, audio, art, and rules still owned by the game. A failed fit audit is not promotion evidence: if a candidate only matches a shader/composer pipeline, positional game art, CSS presentation, one-off timing behavior, or local impact-ring presentation, keep that effect prototype or game-local instead of widening the engine surface. `bloom`, `lensFlare`, `starStreak`, `pixelate`, `shockwaveDistortion`, and `glitch` are currently marked as failed fits because the inspected candidates were placeholder Three.js composer/shader passes, game-local positional glows or impact rings, CSS pixel presentation, or absent from real browser-game call sites, not smaller reusable 2D canvas call sites.

## WASM Boundary

WASM is for deterministic, CPU-heavy, batchable hot paths that operate on numeric buffers and minimize JS/WASM boundary crossings. `collision-kernel.scalar.wasm` is generated from the scalar AssemblyScript source without SIMD; `collision-kernel.simd.wasm` is generated from the SIMD source with SIMD enabled. `collision-kernel.wasm` is a scalar compatibility artifact for consumers that pass one explicit legacy URL.

AssemblyScript is the current kernel source. Both shipped production variants own equivalent batched collision, movement integration, rotation, range filtering, and overlap-mask APIs, while TypeScript owns memory views, fallback behavior, support detection, dispatch, and parity checks. The browser spike instantiates the distinct artifacts into equivalent resident arenas so SIMD attribution does not accidentally compare two exports from one binary. Future kernels may cover culling, transform prep, y-sort keys, AOI masks, projectile simulation, status ticking, server tick math, DSP, or pixel buffers when typed inputs are isolated and benchmarks prove the win. The module should write batch masks or transformed values into caller-owned arrays and should not own DOM, Canvas API submission, Web Audio graph orchestration, assets, timers, browser scheduling, sockets, async loading, random game state, authored content, or one-off scripts.

The editor collision diagnostic measures TypeScript, copied WASM, and resident
WASM separately. Its portable evidence is the resident arena size, equal output
mask/hit counts, and zero host bytes inside the resident timed loop; its p95 values
remain machine-specific calibration.

`createWasmMemoryArena(options)` owns one exclusive module-memory lease at a time,
grows geometrically unless fixed, refreshes cached views when `memory.buffer`
changes, and exposes an epoch plus explicit `release()`. It never publishes a raw
view across growth, and reuses one lease handle instead of allocating a handle and
method closures per batch. Set `maximumCapacityBytes` when batches can contain
untrusted or variable counts so oversized leases fail before calling the module
allocator. Use the arena when a host and a numeric module can share resident storage;
ordinary JS-owned batches still pay their explicit copy boundary.

`createBinaryProtocolParser(options)` resolves safe copied or advanced borrowed
input ownership once. Borrowed payload views exist only for the synchronous
`codec.decode` call and must not be retained; codecs with `decodeRange` can consume
the source offset/length without constructing a payload view at all. Reusable
numeric readers keep one `DataView` per backing buffer. Authoritative servers expose
the same choice as `binaryInputPayloadOwnership`; `copy` is the baseline.

Package consumers can use the default `createCollisionKernel()` path when the package layout is hosted as emitted, because the engine resolves the sibling `.simd.wasm` and `.scalar.wasm` artifacts from the browser ESM build. Bundlers that rewrite asset URLs can import both explicit variant URL subpaths and pass `simdUrl` plus `scalarUrl`; passing one `url` intentionally selects that custom artifact. Native static hosts should serve WASM with `application/wasm` for streaming instantiation; when MIME type, CSP, hosting, or non-browser runtime constraints block the assets, the kernel uses the deterministic TypeScript fallback. Fallback remains quiet by default for games; pass `onFallback` when package setup needs fetch, instantiation, variant, or export-shape diagnostics.

## Related

- [Engine guide](../readme.md): setup, imports, package contracts, and verification.
- [Engine documentation map](README.md): focused subsystem guides.
