# Engine Editor

`apps/engine-editor` is the browser project editor for `@hyperfocus/engine`. It owns the repo-local project model, recovery data, asset catalog, contextual authoring tools, profiling, and browser preview workflow.

Run from the monorepo root:

```powershell
bun run dev:editor
```

Open `http://127.0.0.1:8796`.

## Agentic operation

Project automation is DOM-free. `EditorCommandSession` owns the same validated project state and history used by the browser shell, while the direct CLI and loopback API host it against the canonical filesystem pair. Agents can inspect, patch, replace, create starters, import/remove binary assets, and persist projects without starting Chromium.

Omit `--plan` for a read-only canonical snapshot, or run a command plan and persist it through the engine's crash-safe canonical pair replacement:

```powershell
bun apps/engine-editor/cli.ts agent --project C:\path\to\game --out before.json
bun apps/engine-editor/cli.ts agent --project C:\path\to\game --plan commands.json --out handoff.json
```

The local server exposes the same host through `GET /api/agent/v1/project` and `POST /api/agent/v1/commands`. The API is loopback-only, rejects cross-origin browser requests, serializes writes per project root, and uses the engine's crash-safe canonical pair replacement:

```powershell
bun apps/engine-editor/cli.ts agent --api http://127.0.0.1:8796 --project C:\path\to\game --plan commands.json
```

The browser also exposes `globalThis.__hyperfocusEditorCommands` for an attached client. The older `__hyperfocusEditorAgent` UI-action bridge and `--cdp` transport remain only for visual controls, canvas/runtime interaction, screenshots, and end-to-end verification. The bundled `hyperfocus-editor-agent` skill documents both boundaries and the explicit handoff format.

## Custom Bun dependencies

Projects with ordinary TypeScript may install their own libraries through the editor's thin Bun wrapper. The wrapper requires an existing project `package.json`, uses the project as the explicit working directory, passes package specs as argv without a shell, and reports the resulting dependency sections as JSON.

```powershell
bun apps/engine-editor/cli.ts deps list --project C:\path\to\game
bun apps/engine-editor/cli.ts deps add zod@4 --project C:\path\to\game --exact
bun apps/engine-editor/cli.ts deps add typescript --project C:\path\to\game --dev
bun apps/engine-editor/cli.ts deps install --project C:\path\to\game --frozen
bun apps/engine-editor/cli.ts deps remove zod --project C:\path\to\game
```

Optional, peer, and explicitly trusted installs use `--optional`, `--peer`, and `--trust`. Trust is never implied.

## Project workflow

1. Create a project, open its `.hyperfocus` directory, select its `project.json` and `assets.hfp` pair, or open one legacy `.engine-project.json` file.
2. Import images, audio, data, fonts, or GLTF/GLB/FBX source assets. Asset metadata and SHA-256 references are saved in `project.json`; original bytes are deduplicated in `assets.hfp`.
3. Organize scenes and entities, then add behavior, collider, and audio-source components from the inspector.
4. Open a resource editor only when its data is relevant: Stage, Tilemap, Atlas, Post FX, Motion, or Network.
5. Switch to Play for editor interaction, Profile for captured timing evidence, or Build for one offline runtime-backed HTML artifact and a CI report.
6. Save with `Ctrl/Cmd+S`. The directory-picker path writes `.hyperfocus/project.json` and `.hyperfocus/assets.hfp`; the fallback downloads exactly those two files. Local recovery and bounded project-level undo/redo protect unsaved work.

The project format is versioned and validated before it replaces the current project. Serialization is deterministic, so saved files produce reviewable diffs.

The standalone HTML embeds the exact validated project pair and a first-party fixed-step runtime. It executes project input bindings, built-in player/patrol behavior, explicit solid-tile collision, AABB entity collision, scene state, image/atlas resources, camera follow, start-triggered audio, touch/gamepad input, and the supported post stack without a network connection. Missing/stale assets, unsupported media, unknown built-ins, arbitrary source-module paths, unsupported collider shapes, and unimplemented enabled effects block the browser build instead of being discarded. Arbitrary TypeScript remains ordinary source outside `.hyperfocus`; run `bun run build:game -- --project <directory>` for the source-aware, in-memory bundle lane. Editor Play uses the same DOM-free simulation for built-in/data-driven projects and restores authored state on exit; live custom-source Play remains roadmap work.

## Portable two-file format

A saved project has exactly two canonical editor files:

```text
.hyperfocus/
  project.json
  assets.hfp
```

- `project.json` is deterministic, diffable JSON for scenes, components, settings, resource metadata, behavior references, and asset digest references.
- `assets.hfp` is a deterministic, content-addressed ZIP archive. Its `.hfp` extension is only an association; standard ZIP tools can inspect it.
- Ordinary TypeScript, tests, shaders, and server code stay outside `.hyperfocus` and remain directly usable without the editor.
- Builds, caches, recovery state, profiles, and thumbnails are disposable and do not become extra canonical project files.
- The editor deduplicates assets by SHA-256 and verifies archive structure, CRC-32, hashes, metadata, missing objects, and orphan objects before opening a pack.
- Opening a valid pair restores imported blobs to IndexedDB in one transaction. The saved pair remains authoritative; browser storage is a rebuildable working cache.
- **Export for another engine** emits ordinary JSON, verified named assets, and a deterministic manifest using the same shared semantics as `export:project`. It prefers a fresh no-overwrite directory; browsers without directory access download one deterministic standard ZIP. Exact translation diagnostics and success hashes appear in the console. See `docs/neutral-export.md`.

Legacy `.engine-project.json` remains readable. Saving a legacy project packs its available imported IndexedDB blobs into the new pair and reports any missing or stale blob instead of creating an incomplete archive. The portable persistence migration, built-in/data-driven Play/Build path, and source-aware CLI bundle are shipped; custom-source live Play remains separate roadmap work.

## Modes and shortcuts

- `F1`, `F6`, `F7`, `F8`: Edit, Play, Profile, and Build.
- `Ctrl/Cmd+S`: save the current project. `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`: undo and redo.
- `Ctrl+1` through `Ctrl+6`: Stage, Tilemap, Atlas, Post FX, Motion, and Network resource editors.
- `Ctrl+P` on Windows or `Cmd+K` on macOS: command palette.
- `Space`: pause or resume the fixed-step preview. `Ctrl/Cmd+Right Arrow`: advance one frame.
- Stage: arrow keys nudge the selected entity; `G` toggles the grid; `Alt+Z`, then click, calibrates world zero. Drag entities; `Shift` constrains an axis, `Alt` clones, and `Ctrl/Cmd` disables snapping.
- Tilemap: `B` paint, `E` erase, `G` fill, `M` marquee, `I` eyedrop, and `C` extracts collision rectangles.
- Atlas: Enter commits grid slicing, Shift-click selects a sequence, arrows select frames, F2 renames, and Alt+Left/Right reorders timeline frames.
- Post FX: effect cards expose keyboard reorder buttons; hold backtick for a raw A/B comparison.
- Motion: choose Pose or IK mode before manipulating the rig; `Shift+S` applies symmetric constraints.
- Network: `/` focuses packet filtering, and double-click resets injected latency.

## Storage, recovery, and builds

- Recovery snapshots use local storage key `catalog-engine.editor.recovery.v1`.
- Imported asset blobs use IndexedDB database `catalog-engine-editor-assets` as a working cache. Opening a portable pair restores validated blobs to that cache.
- Standalone player progress uses the separate `hyperfocus-save-profiles` IndexedDB database only when `extensions.hyperfocusSave` declares a policy. Editor Play previews are session-only and cannot modify standalone profiles. Save export, deletion, limits, and privacy are documented in `docs/portable-runtime-saves.md`.
- Project files use the `catalog-engine-editor-project` format discriminator and a numeric schema version.
- Directory-picker Save/Open reads and writes `.hyperfocus/project.json` plus `.hyperfocus/assets.hfp`. Browsers without that API download or select the same two files. Neutral export is separate disposable output and never changes this canonical pair.
- Standalone builds embed the verified portable pair and minified first-party runtime into one disposable HTML artifact outside `.hyperfocus`. CI reports and profile captures are downloadable JSON evidence. Custom TypeScript behavior builds use `bun run build:game -- --project <directory>` and create no intermediate source or wrapper files.

The browser database is not the authoritative copy of imported binaries. Before the first portable save, keep original imports available; after a successful save, the validated `.hyperfocus` pair is sufficient to restore them.

## Verification

```powershell
bun run typecheck:editor
bun test ./src/project/index.test.ts ./editor/src/portable-project.test.ts
bun test ./editor/src/project.test.ts
bun test ./src/project/runtime-2d.test.ts ./editor/src/playable-build-assets.test.ts ./editor/src/playable-build.test.ts
bun run build:editor
bun run verify:editor
bun run verify:system:editor
```

The acceptance suite also captures a generated offline HTML build in a clean iframe, waits for runtime readiness, and proves that authored keyboard input advances the player. The system suite covers state retention, simulated WASM/CSP fallback, keyboard blur recovery, post-process interception, high-DPI resize debouncing, and layout hotkeys.

## Accessibility and layout

The shell uses tab semantics for modes and resource editors, restores focus after dialogs, traps focus inside Project Center, and announces important changes. Canvas tools are focusable and critical ordering or movement operations have keyboard alternatives. UI scale, reduced motion, a resizable/collapsible project sidebar, fullscreen preview, and responsive workspace overflow support different screens and input preferences.
