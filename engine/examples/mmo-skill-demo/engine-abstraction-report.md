# Engine Abstraction Report

Target: `./examples/mmo-skill-demo`
Engine source: `./`

## Scan Scope

- Source files scanned: 82
- Skipped folders: `.agents`, `.git`, `.local`, `assets`, `coverage`, `dist`, `node_modules`
- Public/experimental subpaths observed: `@hyperfocus/engine/assets/loader`, `@hyperfocus/engine/assets/templates`, `@hyperfocus/engine/browser`, `@hyperfocus/engine/core`, `@hyperfocus/engine/mmo`, `@hyperfocus/engine/net`, `@hyperfocus/engine/post-processing/prototype`, `@hyperfocus/engine/protocol`, `@hyperfocus/engine/render`, `@hyperfocus/engine/render/3d`, `@hyperfocus/engine/server`, `@hyperfocus/engine/ui`
- Largest scanned files: `./src/shared.ts (515 KB)`, `./src/tests/shared.test.ts (172 KB)`, `./src/client/client.ts (106 KB)`, `./src/client/map-overlay.ts (73 KB)`, `./src/tests/render.test.ts (54 KB)`, `./src/client/render/hazards.ts (53 KB)`

Boundary: keep item IDs, NPC kinds, quest text, world layout, balance constants, art choices, economy tuning, narrative copy, and demo-specific UI copy local to the game.
Consumer API goal: keep promoted helpers opt-in, configurable, small, performant, and easy to ignore when a game wants its own stack.

## High-confidence engine promotions

No current findings.

## Keep experimental subpath

### Keep static/volatile cell replication as focused server/protocol experiment
- File path(s): `./src/shared.ts`, `./src/tests/shared.test.ts`, `./scripts/dungeon-20-player-bench.ts`
- Pattern observed: AOI, shared-cell slabs, static discovery queues, ack cursors, per-cell volatile buffers, and multipart envelope glue live in the target proof. Evidence: ./src/shared.ts (23), ./src/tests/shared.test.ts (4), ./scripts/dungeon-20-player-bench.ts (2).
- Why reusable or not reusable: The transport mechanics are reusable for MMO-ish authoritative rooms, but the schema fields and content-specific public/private shape still come from one proof target.
- Recommended destination: `@hyperfocus/engine/server`
- Confidence: medium
- Suggested patch size: large
- Suggested tests or smoke checks: Keep shared.test replication coverage and dungeon bench; add engine-level tests only for generic queue, ack, and cell envelope helpers.

### Continue normalized entity model migration without deleting compatibility views yet
- File path(s): `./src/tests/shared.test.ts`, `./src/shared.ts`, `./src/client/interpolation.ts`, `./src/segmented-replication.ts`, `./src/client/client.ts`, `./src/client/map-overlay.ts`, `./src/client/render.ts`, `./src/client/render/signals.ts`
- Pattern observed: State still carries normalized entities plus player/NPC/resource/loot/hazard views and many call sites read type-specific maps. Evidence: ./src/tests/shared.test.ts (243), ./src/shared.ts (44), ./src/client/interpolation.ts (17), ./src/segmented-replication.ts (13), ./src/client/client.ts (12), ./src/client/map-overlay.ts (10), ./src/client/render.ts (10), ./src/client/render/signals.ts (10).
- Why reusable or not reusable: Normalized registries and view bridges are reusable MMO shape, but immediate full removal would touch gameplay, tests, interpolation, UI, and replication at once.
- Recommended destination: `@hyperfocus/engine/mmo`
- Confidence: medium
- Suggested patch size: large
- Suggested tests or smoke checks: Add registry/view-bridge tests before deleting map views; keep replication visibility and gameplay tests green.

## Keep game-local

### Keep authored regional map art local; extract only marker/drawing primitives if reused
- File path(s): `./src/client/map-overlay.ts`
- Pattern observed: Regional map drawing uses direct Canvas callbacks and route/landmark drawing with authored palette, labels, anchors, and map behavior. Evidence: ./src/client/map-overlay.ts (27).
- Why reusable or not reusable: The map's place labels, route choices, colors, and painterly terrain are demo content. Only generic marker, badge, route stroke, legend, and input primitives would be engine candidates.
- Recommended destination: `game-local`
- Confidence: high
- Suggested patch size: medium
- Suggested tests or smoke checks: If extracting primitives, keep screenshot/world-map smoke and map overlay pointer tests; avoid moving authored terrain callbacks.

### Leave authored weapons, enemies, waves, props, economy, and copy local
- File path(s): `./src/shared.ts`, `./src/tests/shared.test.ts`, `./src/data/world-materials.ts`, `./src/data/world-recipes.ts`, `./src/data/world-quests.ts`, `./src/client/client.ts`, `./src/data/world-reputation.ts`, `./src/shared/recipes.ts`
- Pattern observed: Large target files contain game-specific ids, weapon/enemy definitions, wave or hazard tuning, prop layout, lore/economy fields, UI labels, or balance constants. Evidence: ./src/shared.ts (1537), ./src/tests/shared.test.ts (321), ./src/data/world-materials.ts (157), ./src/data/world-recipes.ts (130), ./src/data/world-quests.ts (125), ./src/client/client.ts (105), ./src/data/world-reputation.ts (99), ./src/shared/recipes.ts (99).
- Why reusable or not reusable: These values define the demo. Moving them to engine would hide game rules and make future games inherit wrong content.
- Recommended destination: `game-local`
- Confidence: high
- Suggested patch size: large
- Suggested tests or smoke checks: No engine tests. Use game tests only when local tuning changes.

## Performance hot paths

### Radius candidate helpers are adopted where behavior matches
- File path(s): `./src/shared.ts`, `./src/tests/shared.test.ts`, `./src/client/render/players.ts`, `./src/client/local-prediction.ts`, `./src/client/map-overlay.ts`, `./src/client/render/interactions.ts`, `./src/client/render/hazards.ts`, `./src/client/render/signals.ts`
- Pattern observed: Target selection now uses engine radius-candidate helpers where simple range picking matches behavior, while movement and authored blockers stay local. Evidence: ./src/shared.ts (126), ./src/tests/shared.test.ts (17), ./src/client/render/players.ts (12), ./src/client/local-prediction.ts (10), ./src/client/map-overlay.ts (6), ./src/client/render/interactions.ts (4), ./src/client/render/hazards.ts (3), ./src/client/render/signals.ts (3).
- Why reusable or not reusable: Distance/range candidate selection is reusable when caller-owned filters, distance hooks, and priority tie-breaks stay configurable. Raw hot loops should remain local until a helper wins benchmarks.
- Recommended destination: `@hyperfocus/engine/mmo`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep radius candidate parity tests, three-arena build, and before/after hot-loop benchmark evidence.

### Measure AOI and replication allocations before new API growth
- File path(s): `./src/shared.ts`, `./src/tests/shared.test.ts`, `./scripts/dungeon-20-player-bench.ts`
- Pattern observed: Per-tick AOI/rebuild paths allocate maps, sets, buffers, queues, and sorted cell records around shared-cell replication.
- Why reusable or not reusable: Reusable server-side performance work should focus on deterministic cell grouping, dirty masks, and byte-budget helpers, not on demo schema content.
- Recommended destination: `@hyperfocus/engine/server`
- Confidence: medium
- Suggested patch size: medium
- Suggested tests or smoke checks: Run `bench:dungeon:quick`; add engine microbench only for extracted cell grouping or shared-slab helper.

## Boilerplate cleanup

### Treat client RAF/input-send/render shell as candidate, not immediate root API
- File path(s): `./src/client/client.ts`
- Pattern observed: Client frame owns RAF scheduling, controller polling, throttled input sends, interpolation sample, local prediction, UI sync, and render dispatch. Evidence: ./src/client/client.ts (18).
- Why reusable or not reusable: The ordering is common to authoritative realtime clients, but current behavior is still tied to this demo's input, UI, prediction, and telemetry.
- Recommended destination: `@hyperfocus/engine/mmo`
- Confidence: low
- Suggested patch size: medium
- Suggested tests or smoke checks: Only extract after a second client; test ordering with fake clock, fake transport, and render callback.

### Replace duplicate pointer normalization with existing engine input helpers where behavior matches
- File path(s): `./src/client/map-overlay.ts`, `./src/client/client.ts`, `./src/client/sfx.ts`
- Pattern observed: Client and map overlay normalize canvas-space pointer positions and pointer capture in local code. Evidence: ./src/client/map-overlay.ts (15), ./src/client/client.ts (2), ./src/client/sfx.ts (1).
- Why reusable or not reusable: Coordinate normalization is content-free and already declared in engine input/canvas helpers; map-specific capture and gameplay blocking can remain local.
- Recommended destination: `@hyperfocus/engine`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Add/extend pointer normalization tests; smoke map overlay pointer capture and mouse aim.

## Drift/regression warnings

### Render frame-pool helper is adopted from engine render
- File path(s): `./src/client/render/players.ts`, `./src/client/render/npcs.ts`, `./src/client/render/terrain.ts`, `./src/client/render/resources.ts`, `./src/client/render/loot.ts`, `./src/client/render/hud.ts`, `./src/client/render.ts`, `./src/client/render/effects.ts`
- Pattern observed: Target render modules now use pooled render records without a game-local render-pool module. Evidence: ./src/client/render/players.ts (18), ./src/client/render/npcs.ts (14), ./src/client/render/terrain.ts (14), ./src/client/render/resources.ts (12), ./src/client/render/loot.ts (8), ./src/client/render/hud.ts (5), ./src/client/render.ts (2), ./src/client/render/effects.ts (2).
- Why reusable or not reusable: The helper is content-free and should remain owned by @hyperfocus/engine/render; target modules should keep only visual mapping and staged data.
- Recommended destination: `@hyperfocus/engine/render`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep engine render-pool tests and target render/build checks green.

### Controller action-frame helper is adopted; bindings stay local
- File path(s): `./src/client/client.ts`, `./src/tests/input.test.ts`, `./src/client/input.ts`
- Pattern observed: Game-local code still owns button/action tables and newest-held-action priority while engine helper owns deadzone, pressed threshold, stick, and aim-frame math. Evidence: ./src/client/client.ts (41), ./src/tests/input.test.ts (20), ./src/client/input.ts (11).
- Why reusable or not reusable: The deterministic controller-frame math is content-free. Button bindings and action names remain demo rules.
- Recommended destination: `@hyperfocus/engine/mmo`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep engine mapper tests plus target controller input cases green.

### UI theme token helper is adopted; markup stays local
- File path(s): `./client.html`
- Pattern observed: Client HTML still owns game-specific HUD, menu, and panel CSS while shared colors/control affordances route through engine-applied CSS variables. Evidence: ./client.html (49).
- Why reusable or not reusable: Theme token application and optional base control style text are content-free. Markup, copy, layout, HUD composition, and palette choices stay caller-owned.
- Recommended destination: `@hyperfocus/engine/ui`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep DOM/style-string tests for custom tokens, no implicit global style injection, and target builds.

### One-open panel state is adopted; demo UI content stays local
- File path(s): `./src/client/client.ts`, `./src/client/render.ts`, `./client.html`, `./src/client/render/hud.ts`, `./src/client/local-prediction.ts`, `./src/client/render/types.ts`, `./src/client/interpolation.ts`, `./src/client/quest-guide.ts`
- Pattern observed: UI shell now delegates optional-panel exclusivity to engine UI while local code owns panel names, copy, rows, CSS, and game-specific widgets. Evidence: ./src/client/client.ts (132), ./src/client/render.ts (50), ./client.html (37), ./src/client/render/hud.ts (13), ./src/client/local-prediction.ts (5), ./src/client/render/types.ts (5), ./src/client/interpolation.ts (3), ./src/client/quest-guide.ts (3).
- Why reusable or not reusable: Only the one-open behavior is content-free enough for engine UI. Inventory labels, hotbar text, layout choices, and debug/status copy stay local.
- Recommended destination: `@hyperfocus/engine/ui`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep engine one-open-panel tests and target UI shell tests green.

### Local VFX queue uses shared bounded and timed expiry helpers
- File path(s): `./src/shared.ts`, `./src/client/render.ts`, `./src/tests/shared.test.ts`, `./src/tests/render.test.ts`, `./src/segmented-replication.ts`, `./src/client/render/signals.ts`, `./src/client/render/effects.ts`, `./scripts/render-call-bench.ts`
- Pattern observed: Client-local visual effects delegate bounded queue drops and absolute-time expiry while server-authored transient effect schema remains game-local. Evidence: ./src/shared.ts (28), ./src/client/render.ts (19), ./src/tests/shared.test.ts (15), ./src/tests/render.test.ts (13), ./src/segmented-replication.ts (8), ./src/client/render/signals.ts (6), ./src/client/render/effects.ts (3), ./scripts/render-call-bench.ts (2).
- Why reusable or not reusable: The bounded queue and lifetime compaction mechanics are content-free. Effect kinds, art, particles, audio, semantic anchors, and replicated schema stay local.
- Recommended destination: `@hyperfocus/engine/render`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep engine queue tests and target render tests for replicated/local effects.

### Direct Canvas access remains outside split render modules
- File path(s): `./src/client/map-overlay.ts`, `./src/client/terrain-cache.ts`
- Pattern observed: Direct Canvas calls were found in game modules. Evidence: ./src/client/map-overlay.ts (111), ./src/client/terrain-cache.ts (13).
- Why reusable or not reusable: The main `src/client/render/` modules appear data-staged; remaining direct Canvas is map-overlay/custom terrain. Keep it quarantined or convert generic map primitives through engine render.
- Recommended destination: `@hyperfocus/engine/render`
- Confidence: medium
- Suggested patch size: medium
- Suggested tests or smoke checks: Add scanner check for direct Canvas in `src/client/render/`; screenshot map overlay before/after any extraction.

## Suggested tests

### Keep scanner rerunnable and output-stable
- File path(s): `../.agents/skills/engine-scout/scripts/engine-scout.ts`, `../.agents/skills/engine-scout/scripts/engine-scout.test.ts`
- Pattern observed: Scanner writes deterministic report and TODO files from fresh source evidence.
- Why reusable or not reusable: Stable output prevents stale duplicated findings and makes drift checks cheap.
- Recommended destination: `game-local`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: `bun.cmd test <engine-scout script dir>\engine-scout.test.ts`; rerun the scanner for this target with `--check`.

### Verify target only when game or engine code changes
- File path(s): `./package.json`
- Pattern observed: Scanner/report changes do not require full engine package release lanes; game or engine patches do.
- Why reusable or not reusable: Narrow verification keeps abstraction scans cheap while preserving real checks for behavior changes.
- Recommended destination: `game-local`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: For code patches: run the target build/tests; use broader `bun.cmd run check` only for engine contract changes.
