# Engine

`packages/engine` is the shared package for catalog games that already run directly in the browser. The preferred browser path is `createBrowserApp`: an explicit fixed-step lifecycle with scoped input, deterministic cleanup, inspectable resolved configuration, and opt-in bounded metrics. Game entries keep their own input meaning, state, assets, audio, and authored rendering decisions.

Engine priority is simplicity (ie: the inverse of complex) > concise > performance > DX. It should give users the easiest launchpad into development and let them render powerful configurable games quickly, without limiting how they build or scale later.

## Intent

The engine is a reusable boundary, not a game-content bucket. Put shared mechanics here only when they remove repeated game boilerplate and stay free of item ids, NPC kinds, quest text, art choices, balance constants, and demo-specific UI copy.

Rendering intent is staged data first for reusable paths. Games should describe shared render work as data with layers, camera, culling, y-sort, text, outlines, sprites, HUD, and effects. Engine code owns reusable staging, transforms, batching helpers, primitive execution, and backend migration seams. Game clients map state to calls. Direct JS Canvas remains valid for quarantined game-local overlays, debug views, small demos, and authored map painting.

WASM/SIMD intent is deterministic, CPU-heavy, batchable numeric work. Consider it for collision, movement integration, broadphase filtering, AOI and interest masks, culling, transform prep, y-sort keys, visibility masks, pathfinding, projectile simulation, line-of-sight, status ticking, server tick kernels, DSP, spatial-audio math, and pixel-buffer kernels. Browser orchestration stays JS-owned by default: Canvas submission, Web Audio graph setup, DOM/UI, asset loading, sockets, async resource flow, RAF, timers, authored rules, quest text, NPC identity, item IDs, economy copy, and one-off scripts should not move into WASM.

Pixel buffers are a valid exception to normal Canvas draw submission when the effect is buffer-oriented. WASM or JS may generate color or mask arrays for `ImageData` and `putImageData`, but typical sprite, tile, and HUD drawing should still prefer JS staging, culling, batching, y-sort, and optimized Canvas APIs until a benchmark proves the buffer path wins.

Audio and timing are orchestration surfaces. JS should own Web Audio unlock, graph setup, routing, pause, volume, RAF, timers, and input snapshots. WASM may run deterministic DSP, sample generation, spatial math, or fixed-step numeric kernels after the JS boundary is already narrow.

See [./docs/vision-drift.md](./docs/vision-drift.md) for current feature-boundary drift to watch while pruning or promoting helpers.
Use [the engine documentation map](./docs/README.md) to select other focused guides without loading the entire docs folder.
See [./docs/developer-performance.md](./docs/developer-performance.md) for the golden path, portable work budgets, controlled timing policy, and pooling rules.
See [./docs/project-portability.md](./docs/project-portability.md) for the two-file project contract, open archive layout, and engine-independent export guarantee. New users can follow [the verified first-game tutorial](./docs/tutorial-first-game.md).
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

`../../apps/engine-editor` is the repo-local browser editor. It adds a versioned project model, local recovery, project undo/redo, an asset catalog, scenes/entities/components, contextual Stage/Tilemap/Atlas/Post FX/Motion/Network tools, and Edit/Play/Profile/Build workspaces. Play and Build share the first-party fixed-step 2D simulation for built-in/data-driven projects, and browser acceptance proves identical input movement plus authored-state restoration after Play. Custom behavior can also run in editor Play after the user grants session-only live-source permission; Save recompiles the supplied project files on the loopback server, whose resolver cannot escape that source set. Build emits one offline HTML artifact containing the exact verified portable pair. The browser build button still hard-blocks arbitrary TypeScript paths; `bun run build:game -- --project <directory>` resolves ordinary filesystem and package modules and bundles them in memory into the same one-file output. `bun run dev:game -- --project <directory>` watches only that pair and its authored source graph, serves the last good snapshot on errors, and live-reloads clean rebuilds.

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

- `bun run build`: stages the browser bundle, every published subpath bundle, declarations, and WASM outputs, validates the complete artifact set, then swaps `browser`, `dist`, and `wasm` into place with rollback. Compilation/validation failures never touch live artifacts, and handled swap failures restore the prior set.
- `bun run build:types`: atomically refreshes declaration artifacts under `./dist` while preserving its existing runtime bundles.
- `bun run typecheck`: runs the source TypeScript gate.
- `bun run typecheck:tooling`: typechecks the release, package, declaration, and WASM smoke tooling.
- `bun run typecheck:examples`: strictly typechecks every non-generated TypeScript file under `examples`.
- `bun run typecheck:editor`: strictly typechecks the editor shell, project model, live authoring tools, server, and verifiers.
- `bun run editor`: builds and serves the editor at `http://127.0.0.1:8796`.
- `bun run build:editor`: creates the editor browser bundle under `./editor/dist`.
- `bun run build:game -- --project ./my-game`: validates the two portable files, statically bundles referenced ordinary TypeScript behaviors without generated wrappers, and writes one offline HTML artifact under the project's `dist/` directory. Pass `--out <file>` to choose the destination.
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

Experimental launchpad APIs live in focused subpaths:

- `@hyperfocus/engine/mmo`: normalized entity state, AOI filtering, room glue, client helpers, and configurable gameplay modules.
- `@hyperfocus/engine/server`: authoritative rooms/zones plus content-neutral session signing, injectable atomic replay protection, bounded operational telemetry, drain control, checksummed/AES-256-GCM portable backup/restore, transactional durable gameplay/matchmaking services, and authenticated HTTP control-plane adapters/handler for shared replay, remote persistence, external key rings, regional leases, and capacity actuation. Cloud resources and staffing remain deployment-owned.
- `@hyperfocus/engine/render`: top-down Canvas staging, y-sorted layers, opt-in stage culling, caller-owned sort/cull outputs, sprite frame resolution, actor/tile/HUD helpers, labels, bars, outlines, primitives, and effects.
- `@hyperfocus/engine/render/3d`: focused Three.js-backed scene facade for browser 3D render setup, cameras, lights, registered meshes, instanced batches, and content-free third-person camera rigs. Camera rigs cover orbit/free-look, target following, smoothing, chained transitions, shoulder/framing offsets, distance limits, and obstacle/deocclusion hooks while keeping game rules, input mapping, HUD, tuning, and asset choice in the game.
- `@hyperfocus/engine/render/3d-core`: dependency-free first-party matrix/camera math, fixed-capacity typed transform hierarchies, normalized frustum tests, and bounded stable-order instance visibility.
- `@hyperfocus/engine/render/3d-scene`: bounded first-party mesh/texture/material/light/instance registries and deterministic GPU-ready instanced command buffers, including unlit/PBR materials and distance-band mesh LOD rebinding.
- `@hyperfocus/engine/render/3d-webgl2`: engine-owned depth-tested WebGL2 submission with indexed/non-indexed instancing, RGBA8 textures, direct-light metallic-roughness/emissive PBR, alpha masking, optional directional shadow mapping, up to four position morph targets, hardware-bounded four-weight matrix skinning, bounded uploads/caches, shader diagnostics, resize telemetry, and context-loss restoration. Environment/texture PBR channels and blended transparency remain later layers.
- `@hyperfocus/engine/physics/2d`: fixed-capacity struct-of-arrays bodies, deterministic sweep-and-prune, oriented box/circle contacts, angular impulse/friction response, rotated-static CCD, distance/revolute joints, sleep/wake control, layers, triggers, raycasts, caller-owned queries, and renderer-neutral debug segments.
- `@hyperfocus/engine/physics/3d`: generic 3D collider, vertical overlap, submersion, height-field placement, timed interpolation, and opt-in kinematic character helpers. Genre presets and asset-specific collider inference stay game-owned.
- `@hyperfocus/engine/physics/rigid-3d`: bounded first-party sphere/box rigid bodies with quaternion/angular integration, bounded distance constraints, deterministic broadphase, impulse/friction response, triggers/filters, dynamic-vs-static CCD, caller-owned queries/debug output, replay proof, and a 1,000-body performance gate. Rotated boxes currently collide through conservative world AABBs; angular collision impulses and general joints remain future solver breadth.
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
- `@hyperfocus/engine/audio`: first-party Web Audio orchestration with explicit unlock, named buses, scheduled fades, bounded voice pooling/stealing, decoded-buffer LRU limits, spatial math, and buffering/streaming policy.
- `@hyperfocus/engine/effects`: deterministic bounded timeline sampling/events and fixed-capacity seeded 2D particles with caller-owned render buffers.
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
import { init } from "../../packages/engine/browser/engine.js";
```

Bundlers that rewrite static assets should import the explicit WASM URL subpath and pass that URL into the kernel loader:

```ts
import wasmUrl from "@hyperfocus/engine/wasm/collision-kernel.wasm?url";
import { createCollisionKernel } from "@hyperfocus/engine";

const kernel = await createCollisionKernel(wasmUrl);
```

Use `createCollisionKernel()` without arguments only when the emitted package layout is hosted as-is and `../wasm/collision-kernel.wasm` is reachable from the browser build. Serve the asset as `application/wasm` for streaming instantiation. If hosting, MIME, CSP, or runtime constraints block WASM, the TypeScript fallback remains authoritative and quiet by default; pass `onFallback` when setup needs diagnostics.

## Verification Lanes

Run `bun run check` before normal engine handoff. It typechecks source, tests, and release tooling; atomically rebuilds the browser, all focused runtime subpaths, WASM, and declarations; builds all examples; runs fast package smoke; and runs all repository tests.

Run `bun run release:verify` before a public package release. It keeps repository confidence as one command while still preserving the separate proof lanes for diagnosis. Publishing additionally fails closed unless `RELEASE_EVIDENCE_FILE` points to a release-specific document accepted by `bun run certify:package`; see [production readiness evidence](./docs/production-readiness.md).

Run `bun run release:package-consumer` for public package release candidates. It packs the exact allowlisted files into a temporary external consumer and verifies installed root, browser, core, net, protocol, server, MMO, render, 3D physics/render, UI, asset, prototype post-processing, Bundler, NodeNext, peer-externalization, and WASM subpath behavior outside the fast automation lane.

Run `bun run release:wasm-asset` when validating the Vite 8.0.14 WASM asset URL recipe. Keep it separate from `check` because it creates a temporary Vite consumer and may depend on package-manager cache or network state.

Run `bun run release:wasm-hosting` when validating native static hosting. It proves the checked-in browser build can load the checked-in WASM artifact from both `application/wasm` and non-streaming `application/octet-stream` responses and still exercise scalar plus batched kernel calls on the WASM backend.

Run `bun run smoke:vite-wasm-asset:current` only as an explicit drift check against the latest Vite release. It is not deterministic release proof.

## Public API

The root package is intentionally browser-facing. Its preferred surface is the scoped browser app lifecycle plus common canvas, input, camera, map, animation, collision, and diagnostic primitives. Three-specific indicators and richer staged rendering stay in `@hyperfocus/engine/render`.

`@hyperfocus/engine/core` is the deterministic, DOM-free surface for tooling, tests, and non-browser consumers. Math, grid, object-pool, and stage primitives that do not depend on canvas, input globals, RAF, or WASM asset loading belong there as well as on root when browser games need them.

Do not promote new helpers to root only because a single game needs them. Prefer game-local code until at least two migrated entries prove the same abstraction. Experimental subpaths are allowed for distinct launchpad jobs with package proof; do not expose source-layout folders as API.

- Keep on root: `createBrowserApp`, `createFrameMetrics`, `createFixedStepLoop`, `init`, scoped keyboard/pointer/canvas-object input helpers, hardware gamepad helpers, camera, map/minimap overlays, drawing/text helpers, sprite atlas and frame-animation helpers, deterministic collision/grid helpers, passive collision broadphase helpers, tagged tile-map helpers, WASM collision loading, and stable costed post-processing helpers.
- Keep on `@hyperfocus/engine/core`: object-pool, stage, collision, broadphase, vector, ray, and grid helpers that stay DOM-free.
- Keep on published focused subpaths: portable project JSON/ZIP, audio, effects, saves, content, navigation, first-party rendering and physics, motion, migrations, UI, and asset cooking/loading. Their exact stability and limitation boundaries are documented beside each subpath above.
- Keep on focused experimental subpaths: MMO launchpad helpers, richer top-down render staging, optional MMO UI shell, asset loader helpers, and internal template assets.
- Build future public contracts for on-screen touch controls and a Node-native WASM loader, plus the remaining breadth tracked in the readiness roadmap. The current `src/onScreenGamepad.ts` helper is a tested repo-local prototype, not a package export. The repo-local editor owns its current project/tooling model under `./editor`; portable project schemas and migration contracts stay published independently of the editor shell.
- Keep game-local: game action semantics, HUD, audio choices, asset paths, fallback policy, level data, economy/progression systems, enemy AI, and one-off visual effects.

- `createBrowserApp(options)`: preferred browser lifecycle with explicit start, fixed-step updates, scoped keyboard actions, cleanup, resolved configuration, and optional bounded frame metrics. It never installs legacy global input or exposes timing globals.
- `createFixedStepLoop(options)`: low-level RAF timing, delta clamping, pause, resume, running-state readback, update/render ordering, and explicit `beforeUpdate`/`afterUpdate` hooks.
- `createFrameMetrics(options)`: bounded rolling numeric series, p50/p95/p99 summaries, long-frame records, timers, counters, reset, and JSON-friendly snapshots.
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
- `createKeyboardActions(bindings, target?, options?)`: maps keyboard codes to stable action state and explicit pressed, held, and released transitions. Held and one-frame state reset on target blur by default; pass `resetOnBlur: false` only when the consumer owns focus recovery.
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
- `createPlayableWorld` and `auditPlayableProject` on `@hyperfocus/engine/project/runtime-2d`: deterministic DOM-free 2D project execution and explicit diagnostics for behavior/collider semantics the portable runtime cannot execute.
- `createAudioEngine`, `computeSpatialAudio`, and `chooseAudioLoadPolicy` on `@hyperfocus/engine/audio`: bounded first-party playback orchestration plus pure spatial/policy decisions.
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
- `@hyperfocus/engine/ui` owns the optional zero-dependency DOM renderer, MMO shell widgets, one-open panels, roving focus, dialogs/tooltips, and small theme/control token helpers. Pass a shared controller into `createMmoUiShell` to use the default renderer. Game screens still own markup, copy, layout, and brand palette. See [framework UI integration](./docs/framework-ui.md).
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

## Migration Pattern

Games import the browser build:

```js
import {
  init,
  createKeyboardActions,
  createStage,
} from "../../packages/engine/browser/engine.js";
```

Keep game-specific logic inside `./games/<slug>/`. Move only repeated, deterministic, browser-agnostic primitives into `packages/engine`.

## MMO Skill Demo Migration

`./examples/mmo-skill-demo` is the proof target for the experimental MMO subpaths. Its server registers generated room types, `src/game.ts` composes the world config, `src/client.ts` composes the canvas client, render-data mapper, input mapper, and optional UI shell, and `src/data/` owns world layout, actors, skills, quests, loot, UI copy, and asset choices.

The migrated demo should preserve behavior while using normalized entity state instead of separate `players`, `npcs`, `resources`, `loots`, and `hazards` maps as the replicated contract. Tests should verify gameplay behavior and normalized visibility rules rather than the old schema shape.

The demo render client must stay a producer of engine render calls for its shared render pipeline. `src/client/render.ts` should remain a small orchestrator, with visual mapping split under `src/client/render/`. Barrel-only moves and dynamic gameplay `custom` calls are regressions. Direct JS Canvas is acceptable for quarantined local overlays such as the current map overlay when authored terrain, route labels, and palette stay local.

## Drawing Example

`./examples/drawing-demo.html` is a direct browser-playable demo for stateless sprites, sprite-sheet slicing, primitive shapes, transform stacks, and text rendering.

`./examples/magic-map-shmup/index.html` is a direct browser-playable demo for tagged tilesets, seeded map generation, tile rendering, map queries, collision extraction, and marker-driven spawns.

Drawing APIs accept a `{ ctx }` option or use `setDrawContext(ctx)` during a render pass. Custom fonts load asynchronously with `loadFont(id, url)`, and games can await `textReady(id)` before depending on a font for exact measurement.
