# Readiness Roadmap

The product goal is a verified score of at least 8/10 in every engine assessment category: 2D, 3D, beginner experience, intermediate experience, professional production, content-heavy games, physics-heavy games, multiplayer/MMO, runtime correctness, and editor-to-shippable-game workflow.

A score is earned by an end-to-end supported path and evidence, not by the presence of an isolated helper or technical demo. This roadmap deliberately distinguishes shipped foundations from target work.

## Priority order

### P0: executable, portable project path

1. The two-file [portable project contract](./project-portability.md) is implemented: deterministic JSON/ZIP primitives, editor save/open, legacy read, hash validation, deduplication, cache restoration, crash-safe pair swaps, and shared CLI/Editor neutral export.
2. Extend the implemented structural `@hyperfocus/engine/project/runtime-2d` loader beyond its current scenes, input bindings, snapshots, built-in patrols, statically registered custom behaviors, solid tiles, and swept AABB collision to the remaining typed component semantics.
3. Editor Play and browser Build now execute the same portable simulation for built-in/data-driven projects, acceptance proves movement and authored-state restoration, `build:game` bundles ordinary TypeScript behaviors in memory, and `dev:game` watches authored bundle inputs with last-good live reload. Add live custom-source execution inside the editor before claiming complete development parity.
4. Legacy `.engine-project.json` and IndexedDB assets migrate into the canonical pair; `@hyperfocus/engine/project/filesystem` supplies staged commit, fsync, atomic directory swap, and explicit interrupted-write recovery.
5. The project CLI creates two-file top-down, grid, platformer, narrative-RPG, authoritative-room, and 3D-action starters without source wrappers.
6. The offline CLI and Editor neutral exports emit the same deterministic manifest, independently readable named assets, and exact unsupported-component diagnostics. The Editor prefers a no-overwrite directory and has a deterministic ZIP fallback; both paths are browser-verified.
7. Update every project-format and editor-workflow document in the same change that promotes the new path.

### P1: common game systems

Build and integrate first-party, content-neutral primitives for:

- audio unlock, buses, voice pooling, streaming/buffering policy, fades, spatial math, and deterministic scheduling boundaries; the standalone `@hyperfocus/engine/audio` foundation is implemented and both portable 2D and 3D browser builds exercise gesture-unlocked playback;
- scene transitions, prefabs, component schemas, and custom inspectors; bounded prefab inheritance/variants and transactional `createSceneLifecycle` are implemented on `@hyperfocus/engine/content`, while editor inspectors remain;
- versioned save profiles and migration hooks; deterministic checksummed profiles, atomic IndexedDB storage, named slots, sequential migrations, portable project declarations, standalone restore/export/delete, and isolated Editor Play reset/restore are implemented;
- robust 2D character motion, continuous collision, navigation, steering, and pathfinding; swept portable AABB motion and allocation-stable typed-grid A* are implemented, while steering and broader continuous shapes remain;
- animation state machines, timelines, tweens, particles, dialogue state, localization, and quest graphs; bounded localization/dialogue/quest declarations, deterministic action execution, save inclusion, and a narrative starter are now integrated in the portable runtime;
- rebindable input UI, accessible gamepad navigation, and touch controls.

Each primitive needs a compact example, bounded-memory tests where relevant, public format documentation where it persists data, and an ordinary-game integration test.

### P2: first-party 3D and physics

The target is an engine-owned high-performance runtime rather than a permanent dependency on another game engine or physics solver:

- renderer-owned scene, camera, material, light, mesh, skinning, instancing, visibility, and post-processing primitives;
- broadphase, narrowphase, contact solving, continuous collision, constraints, triggers, character motion, and deterministic query APIs;
- terrain, navigation, particles, animation graphs, asset cooking, texture compression, mesh optimization, and LOD pipelines;
- editor authoring and shared debug visualization for the same runtime data.

The first-party path now includes dependency-free matrix/camera/transform/culling primitives, bounded scene registries and command buffers, a WebGL2 backend, direct-light metallic-roughness/emissive materials, lit RGBA textures, instancing, deterministic distance-band mesh LOD rebinding, one directional shadow map, bounded position morph targets/static glTF morph cooking, integrated terrain chunk streaming, hardware-bounded matrix skinning, quaternion/angular rigid state, bounded distance constraints, vendor-neutral static and skin/animation glTF cookers, and a two-file `3d-action` author-to-build path. Three.js remains an optional compatibility subpath rather than a requirement of the portable runtime. Environment/texture PBR channels, compression, HLOD, exact oriented-box/angular collision response, general rigid joints, morph-weight animation, and WebGPU remain explicit next layers.

### P3: production online operation

The first-party product path around authoritative rooms, protocol, replication, AOI, operations, persistence, and load-test foundations now includes:

- HMAC signed one-use admission, process-local replay bounds or an injected shared atomic replay store, key rotation, and durable ban checks;
- transactional inventories, integer economies, guilds, retained chat, moderation, audit history, and reconnect-safe matchmaking;
- replaceable bounded-memory and Bun SQLite stores with idempotency, validate-before-swap checksummed backups, and AES-256-GCM backup envelopes with key-ring restore;
- health/metrics, graceful drain, authoritative replication/AOI, room/zone routing, and controlled load/soak evidence.

The server package now ships authenticated clients and a matching deployable handler for shared replay, remote persistence, external key rings, regional heartbeats/leases, and capacity actuation, plus bounded autoscaling policy and an active primary/secondary roster guard. OAuth/account recovery, provisioned/operated provider backends, provider-specific fleet automation, multi-region consensus semantics, staffed moderation/on-call response, and project-specific anti-cheat policy remain operator-owned rather than coupled to a vendor. Release certification rejects an MMO production claim unless deployment evidence attests those live boundaries and supplies current canary, soak, incident, restore, and staffing records.

No readiness claim should describe a shard proof as a complete MMO platform or imply that 1,000 users are co-visible in one room.

## Score gates

| Category | Score | Repository evidence and remaining friction |
| --- | ---: | --- |
| 2D top-down and grid | **9/10** | Six exact-pair starters share collision, camera, input, rendering, audio, saves, navigation, story, and one-file builds. Specialized inspectors and touch/rebinding authoring remain. |
| Intermediate TypeScript DX | **9/10** | Typed subpaths, ordinary authored source, source-aware one-file builds, last-good live reload, exact diagnostics, neutral export, and Bundler/NodeNext external-consumer proofs work without editor-only knowledge. Arbitrary source execution inside browser Editor Play remains. |
| Runtime correctness/performance | **9/10** | Deterministic replay/parity, fixed-capacity byte gates, package byte budgets, browser/system acceptance, atomic artifact swaps, WASM parity/benchmark gates, and representative render/server tests pass. Machine-specific timing claims remain scoped to documented runners. |
| Authoritative room/zone | **8/10** | Signed one-use admission, authenticated shared replay/persistence/key/region/capacity control-plane adapters, protocol compatibility, AOI replication, reconnect-safe handoffs, drain/health/metrics, encrypted backup envelopes, workload evidence, and 1,000 players across rooms form a deployable reference. Provider resources and live operations remain deployment choices. |
| General 3D action | **8/10** | The exact-pair `3d-action` project cooks neutral glTF/RGBA assets, runs first-party direct-light PBR WebGL2 with authored mesh LOD, optional directional shadows, bounded morphs/terrain streaming, rigid quaternion/distance-constraint primitives, input/follow camera, WAV audio, deterministic animation, IndexedDB saves, and an offline build in clean Chromium. Fuller PBR, exact oriented collision/general joints, HLOD, and representative game integration remain. |
| Beginner creation | **9/10** | The documented journey creates, plays, edits, live-reloads, survives a broken edit, rebuilds, browser-drives, and removes a temporary project without integration glue or file proliferation. Specialized genre tools remain. |
| Content-heavy RPG/simulation | **8/10** | The narrative starter exercises bounded references, fallback localization, branching dialogue, quests, deterministic snapshots, save restore/delete, prefab variants, and neutral export. Large-team merge/batch-lint tooling remains. |
| Physics-heavy games | **8/10** | First-party oriented 2D and bounded rigid 3D worlds cover contacts, impulses/friction, quaternion/angular integration, distance constraints, triggers/filters, continuous static collision, queries, debug geometry, deterministic replay, storage accounting, and controlled body-count gates. General convex/prismatic/sleep-island 2D plus exact oriented/angular 3D collision and general joints remain. |
| Production MMO platform | **Not certified** | The engine supplies the deployable primitives and a fail-closed evidence gate. A specific deployment is not production ready until `certify:mmo` accepts current canary, six-hour game soak, incident/restore, independent security, distributed infrastructure, and staffed on-call evidence. |
| Public package | **Not certified** | Compatibility contracts, CI, external tarball consumers, trusted publishing configuration, vulnerability policy, and a fail-closed evidence gate now exist. Publishing remains blocked until `certify:package` receives current three-engine/device, independent-security, reporting-channel, and two-maintainer evidence. |
| Editor to shippable game | **9/10** | Editor Play/Build share the portable runtime/assets for data-driven projects; the clean standalone has no editor storage or network dependency, and Editor verification is 12/12 plus 6/6 resilience checks. Browser Editor Play still does not execute arbitrary local TypeScript. |

## Cross-cutting release gates

- **Portable:** only `.hyperfocus/project.json` and `.hyperfocus/assets.hfp` are canonical editor files; an offline generic export recovers neutral data and ordinary assets.
- **Compact:** starters do not generate source wrappers per entity/component/resource. Generated output is reproducible, disposable, and outside `.hyperfocus`.
- **First-party:** the completed runtime path supplies its own core game primitives. Any current external runtime peer or incomplete subsystem is disclosed until removed.
- **Documented:** implementation, schema, editor copy, examples, and migration guidance land together.
- **Verified:** a category cannot reach 8/10 from unit tests alone. At least one representative clean-checkout project must exercise its full author-to-build path.
- **Honest:** experimental APIs, reference environments, scale topology, licensing limits, and unsupported conversions are stated next to the corresponding claim.

## Current verified baseline

`bun.cmd run check` typechecks all source/test/tooling/example/editor surfaces, atomically rebuilds every public bundle and declaration, enforces per-subpath and aggregate byte budgets, builds all examples and the editor, checks runtime/declaration parity, and runs the full repository suite. `bun.cmd run verify:beginner`, `verify:3d-action`, `verify:editor`, and `verify:system:editor` cover the clean author-to-browser journeys. `bun.cmd run release:package-consumer`, `bench`, `release:wasm-asset`, and `release:wasm-hosting` cover packed Bundler/NodeNext consumers and the native/asset WASM boundaries.

The 2026-08-28 Bun 1.4.0 repository run passed 1,287 tests across 194 files with 118,139 assertions. All public runtime bundles total 1,570,338 raw bytes under a 1,600,000-byte aggregate budget; focused imports remain independently tree-shakable. Beginner and 3D clean-browser journeys passed, local Chromium/Firefox desktop and touch-mobile profiles passed, the first-party WebGL2 fixture compiled/drew real directional shadows plus morph/skinning and restored its context, Editor acceptance passed 12/12, Editor resilience passed 6/6, and the external packed-package consumer completed for both Bundler and NodeNext resolution. These are repository results, not substitutes for the external evidence required by production certification.

The assessment is intentionally 8-9 rather than 10. The remaining items listed in the table are real breadth, specialized-tooling, and distributed-operations work. They do not compromise the canonical two-file contract or require a proprietary service, project database, renderer, physics solver, or asset format.

## Licensing gate

The [Hyperfocus Source-Available Game License 2.0](../LICENSE) now implements the confirmed commercial policy and covers all first-party material in the Hyperfocus repository. Each game owes nothing on its first USD 50,000 of adjusted revenue per calendar year and 5% only on the portion above that allowance. It permits closed-source commercial games, negotiated alternatives, free reciprocal Software forks, independent commercial plugins, and a royalty-free exit for future receipts from releases fully migrated away from Hyperfocus. Monetized Software forks and disguised paid Software access require a separate written agreement. The [plain-language licensing model](./licensing-model.md) mirrors the operative terms and calculation examples.

Before accepting royalty payments, the repository owner still needs to publish a private reporting contact and payment instructions and should have qualified counsel review the custom source-available license for the owner's jurisdiction and legal entity. That operational review does not reinstate the old blanket prohibition on paid games.
