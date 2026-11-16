# Engine

`packages/engine` is the shared package for catalog games that already run directly in the browser. The preferred browser path is `createBrowserApp`: an explicit fixed-step lifecycle with scoped input, deterministic cleanup, inspectable resolved configuration, and opt-in bounded metrics. Game entries keep their own input meaning, state, assets, audio, and authored rendering decisions.

Engine priorities are simplicity, performance, then developer experience. It should give users the easiest launchpad into development and let them render powerful configurable games quickly, without limiting how they build or scale later.

## Intent

[Touch of Death](examples/touch-of-death/README.md) is a manifest-backed example
consumer containing its game rules, assets, protocols and host. Editor setup and
exports consume that package; reusable mechanics stay in engine entries.

The engine is a reusable boundary, not a game-content bucket. Put shared mechanics here only when they remove repeated game boilerplate and stay free of item ids, NPC kinds, quest text, art choices, balance constants, and demo-specific UI copy.

Rendering intent is staged data first for reusable paths. Games should describe shared render work as data with layers, camera, culling, y-sort, text, outlines, sprites, HUD, and effects. Engine code owns reusable staging, transforms, batching helpers, primitive execution, and backend migration seams. Game clients map state to calls. Direct JS Canvas remains valid for quarantined game-local overlays, debug views, small demos, and authored map painting.

WASM/SIMD intent is deterministic, CPU-heavy, batchable numeric work. Consider it for collision, movement integration, broadphase filtering, AOI and interest masks, culling, transform prep, y-sort keys, visibility masks, pathfinding, projectile simulation, line-of-sight, status ticking, server tick kernels, DSP, spatial-audio math, and pixel-buffer kernels. Browser orchestration stays JS-owned by default: Canvas submission, Web Audio graph setup, DOM/UI, asset loading, sockets, async resource flow, RAF, timers, authored rules, quest text, NPC identity, item IDs, economy copy, and one-off scripts should not move into WASM.

Pixel buffers are a valid exception to normal Canvas draw submission when the effect is buffer-oriented. WASM or JS may generate color or mask arrays for `ImageData` and `putImageData`, but typical sprite, tile, and HUD drawing should still prefer JS staging, culling, batching, y-sort, and optimized Canvas APIs until a benchmark proves the buffer path wins.

Audio and timing are orchestration surfaces. JS should own Web Audio unlock, graph setup, routing, pause, volume, RAF, timers, and input snapshots. WASM may run deterministic DSP, sample generation, spatial math, or fixed-step numeric kernels after the JS boundary is already narrow.

See [./docs/vision-drift.md](./docs/vision-drift.md) for current feature-boundary drift to watch while pruning or promoting helpers.

`createSimulationBatch` from `@hyperfocus/engine/core` runs independent seeded
fixed-step trials for headless validation and browser worker hosts. Supply a
`createTrial({ seed, index })` factory with `step()` and `dispose()` methods;
`step()` returns `undefined` while running and a result when finished. The runner
owns seed strides, bounded `advance({ ticks })` calls, per-trial tick limits,
completion callbacks and cleanup. `onTrial` receives completed results or a
separate `capped` outcome before trial disposal; it should retain only the evidence
the application needs. Hosts own worker pools, scheduling, pause and CPU effort.
The runner does not select numeric backends or change simulation rules. Browser
bulk fights and the editor's reproducible headless combat tests use this boundary.
Use [the engine documentation map](./docs/README.md) to select other focused guides without loading the entire docs folder.
For calculation-only hosts, `runtime.advance({ actions })` and
`gameplay.advance({ actions, fighterInputs, localDirection })` advance the same
fixed-tick logic without constructing an exported world/save snapshot. Read
`gameplay.combatMatch()` for detached match metadata, or call `snapshot()` when a
full save/rollback view is needed. Existing `step()` still advances and returns a
snapshot. Custom script contexts, physical rules, AI evidence and audio are unchanged.

`@hyperfocus/engine/project/runtime-3d` exposes complete, context-free structural
readers: `readGameplayProject3D` for the narrow gameplay host project,
`readGameplaySnapshot3D` for current saves, `readHyperfocus3DTimeline` for the frame
timeline, and `readCombatAiOutcomeReport3D` for observational reports. They return
detached values, preserve optional absence and extension fields, and apply no
defaults. Physical `ArrayLike` values become ordinary arrays. Project-specific
entity, combat configuration, content and recipe compatibility remain checked by
the existing restore/preflight operations; legacy restore defaults remain there.

Touch of Death adapts during ordinary play, with strong seeded personality
preferences and confidence-weighted contextual evidence. Advanced hosts can use
`combatAiTuning` for baseline, frozen and compression comparisons, inject/read
portable `combatAiLearning`, and profile decisions with `combatAiProfile`.
Hosts own durable storage and logical opponent identity. See
[combat AI](src/project/3d/combat-ai/README.md) for persistence and evaluation;
passing deterministic tests does not prove stronger general fighting.
Routing changes are compared exactly with the original implementation in
`src/project/3d/combat-environment/obstacle-parity.test.ts`, covering live geometry,
hazards and moving traffic. [Optimization history](docs/engine-performance-optimizations.md)
records measured route candidates and their acceptance or rejection.
See [./docs/developer-performance.md](./docs/developer-performance.md) for the golden path, portable work budgets, controlled timing policy, and pooling rules.
See [./docs/project-portability.md](./docs/project-portability.md) for the two-file project contract, open archive layout, and engine-independent export guarantee. New users can follow [the verified first-game tutorial](./docs/tutorial-first-game.md).
Installed-package authors can create, build custom TypeScript and preview through the Bun APIs in [project starters](./docs/project-starters.md) and [project development](./docs/project-development.md); those paths include the runtime and need no editor checkout.
See [./docs/readiness-roadmap.md](./docs/readiness-roadmap.md) for the evidence required to raise every assessed engine category to at least 8/10 and [the 25-game genre audit](./docs/genre-readiness-audit.md) for beginner, intermediate, and professional friction across the proposed remix set.

## Catalog Findings

The catalog repeats a few patterns across otherwise independent games:

- `requestAnimationFrame` loops with clamped delta time.
- Canvas creation, context setup, high-DPI sizing, and direct browser startup code.
- Keyboard action mapping with pressed, held, and released transitions.
- Mouse and touch pointer normalization for canvas play surfaces.
- Canvas object event delegation for click and hover affordances.
- Grid coordinate checks and cell identity helpers.
- Simple deterministic collision checks.
- Passive broadphase candidate queries for collision-heavy scenes.
- Camera panning, zooming, and target following.
- HUD minimaps and regional map overlays that keep route, marker, label, legend, and compass rendering content-free.
- Repeated canvas post effects for tone and impact once gameplay readability is already stable.
- Game-local HUD, audio, art, level data, and rendering.

The first proof migrations cover distinct control models:

- `./games/snake-pit-arena`: real-time grid arena movement with held direction and boost input.
- `./games/chips-circuit`: discrete puzzle movement with one-step action input and force-floor timing.

## Layout

```text
packages/engine/
  readme.md
  assembly/
    collision-kernel.ts
    collision-kernel-scalar.ts
  src/
    index.ts
    runtime/loop.ts
    runtime/object-pool.ts
    runtime/stage.ts
    input/keyboard.ts
    input/pointer.ts
    input/delegation.ts
    math/collision.ts
    math/broadphase.ts
    math/grid.ts
    canvas/bootstrap.ts
    canvas/camera.ts
    canvas/drawing.ts
    canvas/text.ts
    canvas/post-processing.ts
    render/
      frame-pool.ts
      index.ts
    map/
      index.ts
    wasm/collision-kernel.ts
  browser/
    engine.js
    chunks/
  wasm/
    collision-kernel.wasm
    collision-kernel.scalar.wasm
    collision-kernel.simd.wasm
```

`./packages/engine/src/index.ts` is the TypeScript source entry. `./packages/engine/browser/engine.js` is the checked-in split browser ESM entry, with reachable shared chunks beside it, so migrated games remain directly playable without a repo-wide build step.

## Engine Editor

`../../apps/engine-editor` is the repo-local browser editor. It adds a versioned project model, local recovery, project undo/redo, an asset catalog, scenes/entities/components, contextual Stage/Tilemap/Atlas/Post FX/Motion/Network tools, and Edit/Play/Profile/Build workspaces. Play and Build share the first-party runtime target for built-in/data-driven projects: 2D uses the fixed-step portable world and 3D uses the canonical scene cook. Browser acceptance proves identical input movement plus authored-state restoration after Play. Custom behavior can also run in editor Play after the user grants session-only live-source permission; Save recompiles the supplied project files on the loopback server, whose resolver cannot escape that source set. Build defaults to a streaming web directory (ZIP in the editor) with indexed assets and Bun ESM chunks. A separate offline HTML retains the full pair and the same gameplay. The browser compiler bundles only explicitly supplied project source; `bun run build:game -- --project <directory>` also resolves ordinary filesystem and package modules. See [web asset delivery](./docs/project-delivery.md) for selection, lazy imports and independent hosting. Both routes reject enabled 2D post effects outside the standalone capability set instead of silently dropping them. `bun run dev:game -- --project <directory>` watches only that pair and its authored source graph, serves the last good snapshot on errors, and live-reloads clean rebuilds.

See the [engine editor README](../../apps/engine-editor/README.md) for the workflow, shortcuts, storage boundaries, accessibility behavior, and verification commands.

## Project Portability

The canonical target is deliberately small:

```text
.hyperfocus/
  project.json
  assets.hfp
```

`project.json` is deterministic, diffable UTF-8 JSON. `assets.hfp` is a deterministic content-addressed ZIP archive whose objects are named by SHA-256 digest. The extension associates the archive with Hyperfocus but does not make it proprietary. Human-authored TypeScript is exported as ordinary files beside `.hyperfocus`; tests, shaders, and server code stay outside `.hyperfocus`. The editor must not generate one wrapper file per entity, component, scene, or resource.

The deterministic two-file reader/writer and editor save/open integration are implemented. The editor migrates legacy `.engine-project.json`, packs imported cache blobs with SHA-256 references, rejects missing or stale blobs, validates the JSON/ZIP pair before replacing project state, and restores validated assets into its disposable cache. `@hyperfocus/engine/project` exposes programmatic exchange packing; `@hyperfocus/engine/project/neutral-export`, `bun run export:project`, and the editor Project/Build actions share the same canonical JSON, verified named assets, deterministic manifest, and exact portability diagnostics without runtime code. The editor prefers a transactional no-overwrite directory export and falls back to one deterministic standard ZIP. `@hyperfocus/engine/project/runtime-2d` publishes the DOM-free deterministic simulation used by editor Play, browser Build, and the source-aware CLIs without bloating the archive API. Machine-readable schema, staged filesystem recovery, an independent-reader fixture, and explicitly permitted custom-source execution in editor Play are present. See the [portable project contract](./docs/project-portability.md), [minimal starters](./docs/project-starters.md), [development loop](./docs/project-development.md), and [neutral export](./docs/neutral-export.md) for exact behavior.

Portability also governs runtime design. Persistent formats and component contracts should be public and independently implementable. A project may consume the JSON and ZIP directly, and generic export must report engine-specific data it cannot translate rather than silently dropping it. Caches, builds, profiles, and recovery journals are disposable outputs outside the two canonical files.

The long-term runtime policy is first-party high-performance primitives rather than treating another engine, physics solver, audio engine, or hosted platform as the completed solution. Current external peers and incomplete systems remain documented as such until engine-owned replacements pass behavioral, migration, and performance gates. This does not prohibit standards-based files, browser APIs, or import/export tooling; those are part of the escape path.

## Local Commands

Run engine commands from `./packages/engine`:

- `bun run build`: stages the browser bundle, every published subpath bundle, declarations, and WASM outputs under `.local/package-build-staging-*`, validates the complete artifact set, then swaps `browser`, `dist`, and `wasm` into place with rollback. Compilation/validation failures never touch live artifacts, and handled swap failures restore the prior set. Rollback backups live under `.local/package-build-backup-*`; retain any surviving backup until recovery is complete.
- `bun run build:types`: atomically refreshes declaration artifacts under `./dist` while preserving its existing runtime bundles.
- `bun run typecheck`: runs the source TypeScript gate.
- `bun run typecheck:tooling`: typechecks the release, package, declaration, and WASM smoke tooling.
- `bun run typecheck:examples`: strictly typechecks every non-generated TypeScript file under `examples`.
- `bun run typecheck:editor`: strictly typechecks the editor shell, project model, live authoring tools, server, and verifiers.
- `bun run editor`: builds and serves the editor at `http://127.0.0.1:8796`.
- `bun run build:editor`: creates the editor browser bundle under `./editor/dist`.
- `bun run build:game -- --project ./my-game`: validates the canonical pair and builds streaming output at `dist/web/`. Pass `--out <directory>` to choose the destination, or `--offline --out <file.html>` for a complete offline download. [Delivery options](./docs/project-delivery.md) cover external asset hosts.
- `bun run verify:beginner`: creates, edits, live-reloads, diagnoses, recovers, builds, and browser-checks the minimal two-file beginner journey.
- `bun run verify:3d-action`: creates and builds the two-file 3D starter, then proves visible WebGL2 rendering, movement, IndexedDB save/reload, and zero external requests in clean Chromium.
- `bun run verify:editor`: runs the editor project and authoring acceptance suite.
- `bun run verify:system:editor`: runs the editor resilience and browser-system suite.
- `bun run bench`: runs the batched collision benchmark gate.
- `bun run bench:low-level-spikes`: writes a serial parity-checked diagnostic matrix for WASM collision crossover, typed layouts, spatial rejection, and render-record allocation strategies under `.local/engine-perf/<date>/`.
- `bun run bench:wasm-browser-variants`: runs resident-input scalar/SIMD parity and instruction-shape measurements in each installed Playwright browser, recording unavailable engines instead of hiding coverage gaps.
- `bun run bench:projectile-spatial`: records rebuild writes, cell visits, bucket candidate checks, retained buckets, and full-scan checks across projectile/target density ranges.
- `bun run bench:protocol`: keeps snapshot/delta payload checks and writes copy-versus-borrow input ownership evidence, including exact backing-buffer allocations and copied bytes.
- `bun run bench:render-2d`: runs the 2D render micro-benchmark gate for culling, sort/cull output reuse, draw-data caches, tile chunk reuse, and frame-pool evidence.
- `bun run bench:example:mmo-render`: reports MMO render preparation timing, deterministic Canvas operation counts, draw counts, and heap diagnostics on any machine.
- `bun run bench:example:mmo-render:reference`: applies the absolute 12 ms p95 gate and is only valid on the documented reference runner or equivalent controlled CPU profile.
- `bun run example:motion-lab`: builds and serves the isolated three-view procedural-motion laboratory.
- `bun run bench:example:motion-lab`: verifies 15 full-fidelity humanoids against the 2 ms p95, 0.02 m foot-slip, planted-height, and finite-pose gates.
- `bun run proof:example:motion-lab`: drives Chrome through all five fixtures and six laboratory scenarios, verifies deterministic replay and the numeric gates, and writes the three-panel acceptance PNG/JSON under `.local/motion-lab`.
- `bun run ./examples/three-arena/bench.ts --probe-request`: verifies the migrated Three Arena player against semantic mapping/capability, planted-contact, briefcase-fold, deterministic extreme-aim, engine-motion land/recoil, and existing gameplay request gates.
- `bun run check`: typechecks source, tests, release tooling, examples, and the editor; atomically rebuilds published artifacts; transactionally builds the examples and editor; runs fast package smoke checks; and runs all repository tests.
- `bun run release:verify`: runs the full release verification lane by composing `check`, the collision benchmark gate, packed package-consumer proof, pinned Vite WASM asset proof, and native WASM hosting proof.
- `bun run release:package-consumer`: runs the slower packed external-consumer proof for release candidates.
- `bun run release:wasm-asset`: runs the pinned Vite proof for the explicit WASM asset URL recipe.
- `bun run release:wasm-hosting`: runs the native static-host proof for serving the checked-in WASM asset with `application/wasm`.
- `bun run smoke:vite-wasm-asset:current`: runs the non-release current Vite compatibility drift check for the explicit WASM asset URL recipe.
- `bun run test`: runs the engine test suite.

The repository build toolchain is pinned to Bun 1.4.0, TypeScript 7.0.2, esbuild 0.28.1, and AssemblyScript 0.28.17 through `package.json` and `bun.lock`. Use `bun install --frozen-lockfile` for a release checkout instead of resolving newer tool versions.

## Package Contract

The canonical package identity is `@hyperfocus/engine` on the patch-stable `0.0.x` line. External consumers can depend on it with the standard declaration `"@hyperfocus/engine": "0.0.x"`. The package is not private, and the package entry exports generated declarations from `./dist` with the checked-in browser ESM build as the runtime import.

Tooling and server-side consumers that only need deterministic primitives can import `@hyperfocus/engine/core`. That subpath exposes math, grid, object-pool, and stage helpers without canvas, input, animation-frame, or WASM loader globals.

Authoritative multiplayer consumers can import `@hyperfocus/engine/server` for Bun-first room and zone servers and `@hyperfocus/engine/protocol` for DOM-free schema, snapshot, delta, and control-message helpers. The server package also exposes provider-neutral signed one-use sessions, bounded health/metrics, graceful drain control, canonical checksummed persistence snapshots, and transactional inventory, economy, guild, moderation, retained-chat, and reconnect-safe matchmaking services over replaceable memory or Bun SQLite stores. This is the MMO-ish path for 20-100 player rooms or zones, not a managed hosting service. The existing P2P and rollback helpers in `@hyperfocus/engine/net` remain useful for small sessions, but they are not the MMO backbone. See [./docs/mmo-readiness.md](./docs/mmo-readiness.md) for limits and claim boundaries, [the operations guide](./docs/authoritative-server-operations.md) for deployment and key rotation, and [the durable services contract](./docs/durable-mmo-services.md) for transactions, persistence, and handoff semantics.

`createMultiplayer(options)` requires an explicit `initialStore`, which owns the inferred live-store type. `SharedStoreSnapshot` is deliberately a schema-agnostic wire object; validate application-specific state before treating snapshot payloads as a domain model.

Portable project consumers can import `@hyperfocus/engine/project`. This stable, DOM-free subpath owns canonical JSON encoding, SHA-256 content addressing, deterministic standard-ZIP packing and validation, two-file create/open helpers, bounded archive limits, and neutral exchange-file export. It does not own the editor's game-specific model or generate runtime source code.

Use `@hyperfocus/engine/project/metadata` for dimension detection and timeline
effect placement validation without loading either runtime. Existing runtime
entries retain these exports for compatibility. CLI builds select the authored
dimension's runtime; custom behavior imports can add explicit dependencies.

Experimental launchpad APIs live in focused subpaths:

- `@hyperfocus/engine/mmo`: normalized entity state, AOI filtering, room glue, client helpers, and configurable gameplay modules.
- `@hyperfocus/engine/server`: authoritative rooms/zones plus content-neutral session signing, injectable atomic replay protection, bounded operational telemetry, drain control, checksummed/AES-256-GCM portable backup/restore, transactional durable gameplay/matchmaking services, and authenticated HTTP control-plane adapters/handler for shared replay, remote persistence, external key rings, regional leases, and capacity actuation. Cloud resources and staffing remain deployment-owned.
- `@hyperfocus/engine/render`: top-down Canvas staging, y-sorted layers, opt-in stage culling, caller-owned sort/cull outputs, sprite frame resolution, actor/tile/HUD helpers, labels, bars, outlines, primitives, and effects.
- `@hyperfocus/engine/render/3d`: focused Three.js-backed scene facade for browser 3D render setup, cameras, lights, registered meshes, instanced batches, and content-free third-person camera rigs. Camera rigs cover orbit/free-look, target following, smoothing, chained transitions, shoulder/framing offsets, distance limits, and obstacle/deocclusion hooks while keeping game rules, input mapping, HUD, tuning, and asset choice in the game.
- `@hyperfocus/engine/render/3d-core`: dependency-free first-party matrix/camera math, fixed-capacity typed transform hierarchies, normalized frustum tests, and bounded stable-order instance visibility.
- `@hyperfocus/engine/render/3d-scene`: bounded first-party mesh/texture/material/light/instance registries and deterministic GPU-ready instanced command buffers, including unlit/PBR materials and distance-band mesh LOD rebinding.
- `@hyperfocus/engine/render/3d-material-presets`: named material looks, preset search/application, and deterministic look transitions; the external package smoke exercises the installed subpath.
- `@hyperfocus/engine/render/3d-webgl2`: engine-owned depth-tested WebGL2 submission with indexed/non-indexed instancing, RGBA8 textures, direct-light metallic-roughness/emissive PBR, alpha masking, optional directional shadow mapping, up to four position morph targets, hardware-bounded four-weight matrix skinning, bounded uploads/caches, shader diagnostics, resize telemetry, and context-loss restoration. Environment/texture PBR channels and blended transparency remain later layers.
- `@hyperfocus/engine/physics/2d`: fixed-capacity struct-of-arrays bodies, deterministic sweep-and-prune, oriented box/circle contacts, angular impulse/friction response, rotated-static CCD, distance/revolute joints, sleep/wake control, layers, triggers, raycasts, caller-owned queries, and renderer-neutral debug segments.
- `@hyperfocus/engine/physics/3d`: generic 3D collider, vertical overlap, submersion, height-field placement, timed interpolation, and opt-in kinematic character helpers. Genre presets and asset-specific collider inference stay game-owned.
- `@hyperfocus/engine/physics/rigid-3d`: bounded first-party sphere/box rigid bodies with quaternion/angular integration, distance/point constraints, angular motors, symmetric and anatomical swing/twist limits, deterministic broadphase, impulse/friction response, triggers/filters, 15-axis oriented box contact, relative linear and bounded rotational CCD against static, dynamic, and kinematic bodies, caller-owned queries/debug output, replay proof, and a 1,000-body performance gate. Iterative time-of-impact islands and general convex collision remain future solver breadth.
- `@hyperfocus/engine/motion`: DOM-free semantic rigs, memory-backed pose buffers, deterministic motion graphs, four-pose procedural locomotion, aiming, recoil, IK, terrain planting, and joint limits.
- `@hyperfocus/engine/motion/three`: the optional Three.js adapter and zero-clip humanoid controller. It auto-maps a GLB skeleton without renaming source bones and uploads the evaluated pose.
- `@hyperfocus/engine/migrations`: shared, in-memory schema migrations for editor and build tooling, beginning with `.t3rig` sidecars.
- `@hyperfocus/engine/ui`: optional UI helpers for dark fantasy MMO shells, one-open panels, roving focus, dialogs/tooltips, and opt-in theme/control tokens. It is quarantined from root so apps can use React, Svelte, or vanilla UI instead.
- `@hyperfocus/engine/assets/loader`: optional browser asset loading progress, RAF smoothing, Canvas loader, and DOM loader helpers. Games still own asset IDs, paths, labels, fallback policy, and bundle timing.
- `@hyperfocus/engine/assets/gltf-static`: vendor-neutral glTF 2.0 static-mesh validation and deterministic cooking into packed position/normal/UV/index buffers with computed bounds and caller-owned buffer resolution.
- `@hyperfocus/engine/assets/gltf-skin-animation`: vendor-neutral glTF 2.0 skeleton, inverse-bind, joint/weight, and LINEAR/STEP TRS animation cooking with caller-owned allocation-free pose/palette evaluation.
- `@hyperfocus/engine/assets/templates`: internal bitmap template manifest, URL resolver, and image loader.
- `@hyperfocus/engine/project`: portable `.hyperfocus` JSON/ZIP encoding, hashing, validation, bounded pack/open helpers, and neutral exchange-file export.
- `@hyperfocus/engine/project/runtime-2d`: structural portable-project simulation with bounded fixed steps, action/binding input, snapshots, scene switching, built-in patrols, parent movement, and swept AABB entity/tile collision.
- `@hyperfocus/engine/project/runtime-navigation-2d`: stateful per-world adapter that compiles validated `builtin:navigate` components onto the bounded first-party grid navigator.
- `@hyperfocus/engine/project/runtime-save-2d`: validated project save policy and transactional world/story state providers over portable checksummed save envelopes; standalone progress stays outside the canonical project pair.
- `@hyperfocus/engine/project/runtime-story-2d`: bounded localized dialogue/choice and quest-event integration with deterministic snapshots, input actions, reference diagnostics, and save participation.
- `@hyperfocus/engine/project/runtime-3d`: bounded portable `hyperfocus3D` validation and glTF/RGBA cooking into the first-party scene/WebGL2 and rigid-3D paths, with deterministic movement, contacts, transform animation, camera following, audio policy, and save snapshots.
- `@hyperfocus/engine/project/filesystem`: Node/Bun crash-safe staged directory-swap writes, validated reads, and explicit interrupted-transaction recovery for the canonical pair.
- `@hyperfocus/engine/project/neutral-export`: browser-safe deterministic ordinary-file export builder and exact portability diagnostics shared by the CLI and editor.
- `@hyperfocus/engine/schema/editor-project-v2.json`: published JSON Schema for the Editor v2 document shape; semantic graph invariants listed in the portability contract remain additional checks.
- `@hyperfocus/engine/audio`: first-party Web Audio orchestration with explicit unlock, named buses, scheduled fades, bounded voice pooling/stealing, decoded-buffer LRU limits, spatial math, buffering/streaming policy, and deterministic dependency-free SFX presets across retro arcade, realistic, modern cartoon, early-3D 2000s, and 90s fantasy families. SoundFont parsing remains project-local; see [programmatic SFX presets](docs/sfx-presets.md).
- `@hyperfocus/engine/effects`: deterministic bounded timeline sampling/events, fixed-capacity seeded 2D particles with caller-owned render buffers, plus named 12-particle and 10-transition authoring vocabularies shared by games and motion projects.
- `@hyperfocus/engine/save`: deterministic checksummed save profiles, named slots, sequential migrations, explicit import/export, bounded JSON, and an atomic storage boundary.
- `@hyperfocus/engine/save/browser`: IndexedDB compare-and-swap storage for standalone browser profiles with bounded bytes and conflict retries.
- `@hyperfocus/engine/content`: bounded scene/prefab data, inheritance and variants, explicit reference validation, deterministic instantiation, rollback-safe async scene transitions, fallback localization, branching dialogue, and versioned event-driven quest state.
- `@hyperfocus/engine/navigation`: reusable typed-array A* workspace with weighted/diagonal grids, corner policy, deterministic ties, visit budgets, and caller-owned path output.

The packaged template bitmaps are mechanically generated one-pixel color swatches owned by this package; no third-party artwork is embedded in the template manifest.

Published files are allowlisted to the split browser build, focused subpath runtime bundles, generated declarations and declaration maps, the scalar/SIMD/compatibility WASM assets and their type declaration, this README, and the notices required by bundled third-party components. The generated AssemblyScript `.wat`, source tree, examples, scripts, and stale files under artifact directories are excluded from the tarball. Camera fluent methods intentionally return the closed camera instance and avoid implementation `this` coupling, so generated declarations stay tied to the named public `Camera` type.

Camera declaration emit is guarded at build, package-smoke, and checked-in artifact test time against `/*elided*/ any` and lost named fluent returns. Package smoke also checks every published runtime/declaration entry for value-export parity and rejects TypeScript module specifiers in emitted declarations.

`@hyperfocus/engine/render/3d` externalizes Three.js. Runtime consumers of that subpath must install compatible `three` 0.163.x; TypeScript consumers also need `@types/three` 0.163.x. Both are optional peers so root, core, server, and 2D consumers do not acquire a 3D dependency they never import.

`@hyperfocus/engine/motion/three` uses the same optional Three.js peer boundary. See [the motion-system contract](./docs/motion-system.md) for the zero-clip path, semantic rig sidecars, graph rules, evaluation order, and laboratory acceptance gates.

This project is distributed under the [Hyperfocus Source-Available Game License 2.0](./LICENSE), which covers all first-party material in the Hyperfocus repository, including the engine, editor, harness, and shared packages. Games pay no royalty on the first USD 50,000 of adjusted revenue per game per calendar year, then 5% only on the portion above that threshold. Commercial games may remain closed source, companies may negotiate alternate written terms, and independently authored project content can be exported or moved to another engine at any time. The Software and its Modifications may be shared at no charge under the reciprocal terms, but may not be monetized without a separate agreement. See the [plain-language licensing model](./docs/licensing-model.md) for examples and portability details; `LICENSE` is the operative grant.

## Import Choices

Use the root package for browser-facing games that want the full public surface:

```ts
import {
  createBrowserApp,
} from "@hyperfocus/engine";

const game = createBrowserApp({
  width: 960,
  height: 540,
  input: { KeyA: "left", KeyD: "right" },
  metrics: {},
  update({ input }, dt) {
    // Simulation owns action meaning.
  },
  render({ metrics }, alpha) {
    // Submit structured render data here; record useful work counts in metrics.
  }
});

game.start();
```

Use `@hyperfocus/engine/browser` only when package tooling needs an explicit browser subpath. It shares the root declarations and runtime build; it is not a separate API family.

Use `@hyperfocus/engine/core` for deterministic tooling, tests, and server-side consumers that need no DOM, RAF, canvas, input globals, or WASM asset loading:

```ts
import { clamp, createRetainedCursor, createStage, gridKey } from "@hyperfocus/engine/core";
```

Use `@hyperfocus/engine/server` for authoritative MMO-ish rooms or zones:

```ts
import {
  createAuthoritativeServer,
  createRoomType,
} from "@hyperfocus/engine/server";
import { defineSchema } from "@hyperfocus/engine/protocol";
```

Use experimental MMO launchpad subpaths when a demo wants normalized runtime builders without promoting that shape to root. Keep world content, item IDs, quest copy, NPC kinds, combat formulas, progression tuning, and art in the demo folder.

Repo-local browser games can keep direct imports from the checked-in browser artifact so each game remains playable from its folder without a build step:

```js
import { init } from "@hyperfocus/engine";
```

Bundlers that rewrite static assets should import the explicit WASM URL subpath and pass that URL into the kernel loader:

```ts
import wasmUrl from "@hyperfocus/engine/wasm/collision-kernel.wasm?url";
import { createCollisionKernel } from "@hyperfocus/engine";

const kernel = await createCollisionKernel(wasmUrl);
```

Use `createCollisionKernel()` without arguments only when the emitted package layout is hosted as-is and `../wasm/collision-kernel.wasm` is reachable from the browser build. Serve the asset as `application/wasm` for streaming instantiation. If hosting, MIME, CSP, or runtime constraints block WASM, the TypeScript fallback remains authoritative and quiet by default; pass `onFallback` when setup needs diagnostics.

Authoritative clients request `arraybuffer` delivery from sockets exposing
`binaryType`, keeping ordered replication independent of browser Blob reads.
Custom adapters without that property retain support for byte arrays, ArrayBuffers
and Blobs. The delayed-Blob regression lives in `src/net/authoritative-client.test.ts`.

## Verification Lanes

Run engine tests from this package directory so the application DOM preload is
not installed. DOM-dependent engine tests use `src/test-support/register-dom.ts`,
which preserves the native WebSocket for real socket recovery tests. Direct
global DOM registration replaces that transport and makes deliberate disconnects
fail with unrelated wrapper errors. The registration regression and
`src/net/authoritative-recovery.test.ts` cover this shared-process boundary.

For ordinary changes, select verification from the affected contract: focused
regressions for local behavior, parity and measured benchmark evidence for a
changed hot kernel, and consumer/build checks for public exports or artifacts.
`bun run check` is the broad integration gate for changes spanning those boundaries;
it typechecks source, tests, and release tooling, rebuilds runtime/WASM/declarations,
builds examples, and runs package smoke and repository tests. It is not a mandatory
precondition for every local edit. The [scoped guidance](AGENTS.md) owns performance
and portability constraints.

Run `bun run release:verify` before a public package release. It keeps repository confidence as one command while still preserving the separate proof lanes for diagnosis. Publishing additionally fails closed unless `RELEASE_EVIDENCE_FILE` points to a release-specific document accepted by `bun run certify:package`; see [production readiness evidence](./docs/production-readiness.md).

`bun run verify:browsers` requires all three installed Playwright engines and writes
the fixture matrix under `.local/engine-release/` at the repository root. See
[browser support](./docs/browser-support.md) for installation, profile coverage,
and the distinction between an emulated fixture and certified device/package evidence.

Run `bun run release:package-consumer` for public package release candidates. It packs the exact allowlisted files into a temporary external consumer and verifies installed root, browser, core, net, protocol, server, MMO, render, 3D physics/render, UI, asset, prototype post-processing, Bundler, NodeNext, peer-externalization, and WASM subpath behavior outside the fast automation lane.

The gate logs a unique `.local/package-consumer/` evidence directory inside this
package. It retains the exact installed narrow reader bundle, bundler metadata
and input/output hash receipt before deleting the temporary consumer. Inspect
that artifact when attributing delivered retention; full-runtime metadata alone
does not prove what the narrow consumer retains.

Run `bun run release:wasm-asset` when validating the Vite 8.0.14 WASM asset URL recipe. Keep it separate from `check` because it creates a temporary Vite consumer and may depend on package-manager cache or network state.

Run `bun run release:wasm-hosting` when validating native static hosting. It proves the checked-in browser build can load the checked-in WASM artifact from both `application/wasm` and non-streaming `application/octet-stream` responses and still exercise scalar plus batched kernel calls on the WASM backend.

Run `bun run smoke:vite-wasm-asset:current` only as an explicit drift check against the latest Vite release. It is not deterministic release proof.

## Public API

The root entry provides browser lifecycle, canvas, input, camera, and common game
primitives. `@hyperfocus/engine/core` provides deterministic DOM-free helpers;
focused subpaths own rendering, projects, audio, motion, physics, and server work.
See the [public API reference](docs/public-api.md) for helper contracts and ownership.

## WASM Boundary

JavaScript owns browser orchestration; WASM handles measured, deterministic numeric
batches with a TypeScript fallback. See [WASM boundary](docs/public-api.md#wasm-boundary)
for memory ownership, asset resolution, dispatch, and diagnostics.

## Migration Pattern

Package consumers import the public entry:

```js
import {
  init,
  createKeyboardActions,
  createStage,
} from "../../packages/engine/browser/engine.js";
```

Keep game-specific logic in the consuming project; repository proof games live under
`packages/engine/examples/`. Direct browser examples resolve the checked-in
`packages/engine/browser/engine.js` relative to their own HTML or module location.
Move only repeated, deterministic, browser-agnostic primitives into the shared engine.

## MMO Skill Demo Migration

`./examples/mmo-skill-demo` is the proof target for the experimental MMO subpaths. Its server registers generated room types, `src/game.ts` composes the world config, `src/client.ts` composes the canvas client, render-data mapper, input mapper, and optional UI shell, and `src/data/` owns world layout, actors, skills, quests, loot, UI copy, and asset choices.

The migrated demo should preserve behavior while using normalized entity state instead of separate `players`, `npcs`, `resources`, `loots`, and `hazards` maps as the replicated contract. Tests should verify gameplay behavior and normalized visibility rules rather than the old schema shape.

The demo render client must stay a producer of engine render calls for its shared render pipeline. `src/client/render.ts` should remain a small orchestrator, with visual mapping split under `src/client/render/`. Barrel-only moves and dynamic gameplay `custom` calls are regressions. Direct JS Canvas is acceptable for quarantined local overlays such as the current map overlay when authored terrain, route labels, and palette stay local.

## Drawing Example

`./examples/drawing-demo.html` is a direct browser-playable demo for stateless sprites, sprite-sheet slicing, primitive shapes, transform stacks, and text rendering.

`./examples/magic-map-shmup/index.html` is a direct browser-playable demo for tagged tilesets, seeded map generation, tile rendering, map queries, collision extraction, and marker-driven spawns.

Drawing APIs accept a `{ ctx }` option or use `setDrawContext(ctx)` during a render pass. Custom fonts load asynchronously with `loadFont(id, url)`, and games can await `textReady(id)` before depending on a font for exact measurement.
