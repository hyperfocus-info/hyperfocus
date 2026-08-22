# Engine Abstraction Report

Target: `./examples/three-arena`
Engine source: `./`

## Scan Scope

- Source files scanned: 10
- Skipped folders: `.agents`, `.git`, `.local`, `assets`, `coverage`, `dist`, `node_modules`
- Public/experimental subpaths observed: `@hyperfocus/engine/assets/loader`, `@hyperfocus/engine/assets/templates`, `@hyperfocus/engine/browser`, `@hyperfocus/engine/core`, `@hyperfocus/engine/mmo`, `@hyperfocus/engine/net`, `@hyperfocus/engine/post-processing/prototype`, `@hyperfocus/engine/protocol`, `@hyperfocus/engine/render`, `@hyperfocus/engine/render/3d`, `@hyperfocus/engine/server`, `@hyperfocus/engine/ui`
- Largest scanned files: `./src/client.ts (412 KB)`, `./client.html (72 KB)`, `./src/arena-data.ts (57 KB)`, `./bench.ts (25 KB)`, `./server.ts (21 KB)`, `./network-bench.ts (11 KB)`

Boundary: keep item IDs, NPC kinds, quest text, world layout, balance constants, art choices, economy tuning, narrative copy, and demo-specific UI copy local to the game.
Consumer API goal: keep promoted helpers opt-in, configurable, small, performant, and easy to ignore when a game wants its own stack.

## High-confidence engine promotions

No current findings.

## Keep experimental subpath

No current findings.

## Keep game-local

### Leave authored weapons, enemies, waves, props, economy, and copy local
- File path(s): `./src/arena-data.ts`, `./src/client.ts`, `./client.html`, `./binary-state.test.ts`, `./network-bench.ts`, `./server.ts`
- Pattern observed: Large target files contain game-specific ids, weapon/enemy definitions, wave or hazard tuning, prop layout, lore/economy fields, UI labels, or balance constants. Evidence: ./src/arena-data.ts (55), ./src/client.ts (32), ./client.html (9), ./binary-state.test.ts (2), ./network-bench.ts (1), ./server.ts (1).
- Why reusable or not reusable: These values define the demo. Moving them to engine would hide game rules and make future games inherit wrong content.
- Recommended destination: `game-local`
- Confidence: high
- Suggested patch size: large
- Suggested tests or smoke checks: No engine tests. Use game tests only when local tuning changes.

## Performance hot paths

### Radius candidate helpers are adopted where behavior matches
- File path(s): `./src/client.ts`
- Pattern observed: Three arena now uses engine radius-candidate targeting where it keeps call sites lean, while hotter toroidal bullet/hazard loops still use local raw scans. Evidence: ./src/client.ts (31).
- Why reusable or not reusable: Distance/range candidate selection is reusable when caller-owned filters, distance hooks, and priority tie-breaks stay configurable. Raw hot loops should remain local until a helper wins benchmarks.
- Recommended destination: `@hyperfocus/engine/core`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep radius candidate parity tests, three-arena build, and before/after hot-loop benchmark evidence.

## Boilerplate cleanup

### Treat Three frame/update shell as candidate, not root API
- File path(s): `./src/client.ts`
- Pattern observed: Three client frame owns animation-loop registration, clock delta, controller polling, simulation update, camera follow, HUD sync, and render submission. Evidence: ./src/client.ts (14).
- Why reusable or not reusable: The update ordering may repeat in future 3D demos, but it still mixes local game rules, network send cadence, camera behavior, and HUD work.
- Recommended destination: `@hyperfocus/engine/render/3d`
- Confidence: low
- Suggested patch size: medium
- Suggested tests or smoke checks: Only extract after a second client; test ordering with fake clock, fake transport, and render callback.

## Drift/regression warnings

### Controller action-frame helper is adopted; bindings stay local
- File path(s): `./src/client.ts`
- Pattern observed: Game-local code still owns button/action tables and newest-held-action priority while engine helper owns deadzone, pressed threshold, stick, and aim-frame math. Evidence: ./src/client.ts (8).
- Why reusable or not reusable: The deterministic controller-frame math is content-free. Button bindings and action names remain demo rules.
- Recommended destination: `@hyperfocus/engine`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep engine mapper tests plus target controller input cases green.

### Three asset helpers are adopted; asset policy stays local
- File path(s): `./src/client.ts`
- Pattern observed: Three client code now delegates first-success asset loading, loader promises, object prep, and prepared clones while still owning asset paths and model-specific setup. Evidence: ./src/client.ts (59).
- Why reusable or not reusable: The content-free loading and prep helpers belong in @hyperfocus/engine/render/3d. Addon choices, paths, animation naming, material choices, and fallback policy stay in the demo.
- Recommended destination: `@hyperfocus/engine/render/3d`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep fake Three loader/helper tests and three-arena build green.

### 3D resource cache is adopted; definitions stay local
- File path(s): `./src/client.ts`
- Pattern observed: Client code now delegates lazy disposable resource storage while local functions still define projectile/effect geometry and material recipes. Evidence: ./src/client.ts (70).
- Why reusable or not reusable: The keyed cache and explicit disposal are content-free. Geometry constructors, colors, blend choices, and effect semantics remain caller-owned.
- Recommended destination: `@hyperfocus/engine/render/3d`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep resource-cache tests and three-arena build green.

### Snapshot frame codec is adopted; schema stays local
- File path(s): `./binary-state.ts`
- Pattern observed: Target binary state code delegates frame encode/decode wrapping while keeping its schema, normalization, and denormalization local. Evidence: ./binary-state.ts (2).
- Why reusable or not reusable: Frame wrapping, sequence/baseline plumbing, kind checks, and schema snapshot round-trip are reusable protocol mechanics. Snapshot fields and compatibility transforms stay target-owned.
- Recommended destination: `@hyperfocus/engine/protocol`
- Confidence: high
- Suggested patch size: small
- Suggested tests or smoke checks: Keep protocol codec tests and target binary-state tests green.

### Timed effect queue helper is adopted; authored effect shapes stay local
- File path(s): `./src/client.ts`
- Pattern observed: Three client effects now delegate age/lifetime traversal while local hooks own mesh fade, sparks, scale, and scene disposal. Evidence: ./src/client.ts (71).
- Why reusable or not reusable: Lifetime ticking and removal are reusable render mechanics. Spark art, mesh composition, colors, audio, and hit semantics stay local.
- Recommended destination: `@hyperfocus/engine/render`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep deterministic queue update/remove tests and three-arena build green.

### UI theme token helper is adopted; markup stays local
- File path(s): `./client.html`
- Pattern observed: Client HTML still owns game-specific HUD, menu, and panel CSS while shared colors/control affordances route through engine-applied CSS variables. Evidence: ./client.html (389).
- Why reusable or not reusable: Theme token application and optional base control style text are content-free. Markup, copy, layout, HUD composition, and palette choices stay caller-owned.
- Recommended destination: `@hyperfocus/engine/ui`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep DOM/style-string tests for custom tokens, no implicit global style injection, and target builds.

### Roving menu focus helper is adopted; menu rules stay local
- File path(s): `./src/client.ts`
- Pattern observed: Client code now delegates wrapping focus movement, availability filtering, focus class cleanup, and activation while callbacks own menu-specific selection. Evidence: ./src/client.ts (30).
- Why reusable or not reusable: Roving focus and activation are content-free UI behavior. Menus, labels, enabled rules, and lobby actions stay local.
- Recommended destination: `@hyperfocus/engine/ui`
- Confidence: medium
- Suggested patch size: small
- Suggested tests or smoke checks: Keep DOM tests for wrapping, disabled/hidden filtering, focus class updates, and activation callback.

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
