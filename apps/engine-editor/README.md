# Engine Editor

`apps/engine-editor` is the browser project editor for `@hyperfocus/engine`. It owns the repo-local project model, recovery data, asset catalog, contextual authoring tools, profiling, and browser preview workflow.

## UI composition boundary

The application shell has one Solid owner. Framework-neutral project commands and session state feed typed feature components; existing canvas and WebGL workspaces remain an imperative runtime host inside the workbench.

```text
EditorSessionController (DOM-free)
└─ EditorShellView (Solid owner)
   ├─ ModeNavigation
   ├─ ProjectSidebar
   │  ├─ ProjectSceneTree
   │  ├─ ProjectEntityTree
   │  ├─ ProjectAssetList
   │  └─ EditorScriptFileList
   ├─ WorkbenchShell
   │  ├─ runtime workspace host (imperative canvas/WebGL controllers)
   │  ├─ SelectionInspector
   │  └─ ConsolePanel
   ├─ Editor3DHierarchy / Editor3DInspector
   ├─ EditorCenterContent
   │  └─ EditorPreferencesView
   ├─ EditorCommandPalette
   └─ EditorAiPanel
```

Reusable interaction and accessibility mechanics belong in `@hyperfocus/ui`. Editor command adapters and project-specific fields belong in `apps/engine-editor/src/components`. High-frequency rendering and framework-neutral engine state do not belong in either presentation layer.

The optional AI panel uses the shared measured transcript window. Long histories do not eagerly mount or parse every Markdown row, pending responses reconcile in place, and the panel follows new output only while the reader remains near the end.

Run from the monorepo root:

```powershell
bun run dev:editor
```

Open `http://127.0.0.1:8796`.

## Agentic operation

Project automation is DOM-free. `createEditorCommandSession` owns the same validated project state and history used by the browser shell, while the direct CLI and loopback API host it against the canonical filesystem pair. Agents can inspect, patch, replace, create starters, import/remove binary assets, hydrate existing catalog assets, and persist projects without starting Chromium.

Omit `--plan` for a read-only canonical snapshot, or run a command plan and persist it through the engine's crash-safe canonical pair replacement:

```powershell
bun apps/engine-editor/cli.ts agent --project C:\path\to\game --out before.json
bun apps/engine-editor/cli.ts agent --project C:\path\to\game --plan commands.json --out handoff.json
```

The local server exposes the same host through `GET /api/agent/v1/project` and `POST /api/agent/v1/commands`. The API is loopback-only, rejects cross-origin browser requests, serializes writes per project root, and uses the engine's crash-safe canonical pair replacement. Attached browser sessions that need Play or asset previews can request `GET /api/agent/v1/project?root=...&includeAssets=base64` and hydrate the returned bounded asset transfers with `asset.hydrate`; the project catalog remains unchanged:

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

1. Create a project from the scalable starter selector (Pong, platformer, 3D action, blank 2D, or showcase), open its `.hyperfocus` directory, select its `project.json` and `assets.hfp` pair, or open one legacy `.engine-project.json` file.
2. Import images, audio, data, fonts, or GLTF/GLB/FBX source assets. Asset metadata and SHA-256 references are saved in `project.json`; original bytes are deduplicated in `assets.hfp`.
3. Organize scenes and entities, then add behavior, collider, and audio-source components from the inspector.
4. Open a resource editor only when its data is relevant: Stage, Tilemap, Atlas, Post FX, Motion, or Network. Atlas supports any number of named clips with independent frame order, FPS, and loop behavior. In Motion, Sprite clip cue switches one selected Atlas sprite among those clips at the playhead; the stepped state holds until the next cue and is also available to agents through `timeline.set-clip-key`. Micro-motion expands Anticipate, Lunge, Hit reaction, Bite exchange, and Transform into ordinary editable keys plus deterministic shake, flash, and particle cues through the UI or `timeline.apply-recipe`.
5. For relative custom behaviors, open Code and choose **Enable live preview**. This grants permission for the current tab to send its embedded project source to the loopback compiler; Save recompiles and Play runs the latest successful result. Built-in behaviors need no source permission.
6. Switch to Play for editor interaction, Profile for captured timing evidence, or Build for one offline runtime-backed HTML artifact and a CI report. Send that single HTML file: its runtime and verified asset pack are embedded, so the recipient does not need Hyperfocus, an account, a server, or an install. Profile's collision comparison uses parity-checked typed batches, warmup, A/B/B/A ordering, and p95 reporting so it measures the SIMD batch path rather than scalar JS/WASM call overhead.
7. Save with `Ctrl/Cmd+S`. The directory-picker path writes `.hyperfocus/project.json` and `.hyperfocus/assets.hfp`; the fallback downloads exactly those two files. Local recovery and bounded project-level undo/redo protect unsaved work.

The project format is versioned and validated before it replaces the current project. Serialization is deterministic, so saved files produce reviewable diffs. Ordinary command patches use reversible field deltas against one owned project object and invalidate only affected top-level serialization sections. Undo remains bounded and records a full checkpoint every 32 delta edits by default; `deltaCheckpointInterval: 0` selects inverse-only history and another non-negative interval trades periodic clone cost for a shorter recovery chain. Complex arbitrary transactions keep the safe full-snapshot path.

The standalone HTML embeds the exact validated project pair and a first-party fixed-step runtime. It executes project input bindings, built-in player/patrol behavior, explicit solid-tile collision, AABB entity collision, scene state, image/atlas resources and named animation clips, camera follow, camera-independent HUD text when a UI component opts into `screenSpace: true`, start-triggered audio, touch/gamepad input, deterministic timeline shake/flash/particle cues, and the supported post stack without a network connection. Missing/stale assets, unsupported media, unknown built-ins, arbitrary source-module paths, unsupported collider shapes, and unimplemented enabled effects block the browser build instead of being discarded. Arbitrary TypeScript remains ordinary source outside `.hyperfocus`; run `bun run build:game -- --project <directory>` for the source-aware, in-memory shipping lane. Editor Play uses the same DOM-free simulation and can execute custom project behavior after explicit, session-only source permission. The live compiler accepts only the source files embedded in the project, resolves only relative imports within that supplied set, never receives a filesystem path, and is disabled when the editor is not bound to loopback. Permitted project code runs with the editor page's browser privileges, so enable it only for trusted projects. Package imports remain a CLI build/dev feature.

The Production Lab renders exact authored timeline frames to H.264/AAC MP4 by default. MP4 audio deterministically mixes every audible timeline track, including separately scheduled score and SFX assets, with solo/mute selection, `startFrame`, `durationFrames`, source trim and loop regions, fades, volume, and stereo pan. A peak-normalization pass prevents multi-track clipping; unavailable track assets are skipped with an explicit export log entry. Delivery presets are 720p, 1080p (default), and 4K at 30 fps (default) or 60 fps; VP8/VP9 WebM remains available as a fallback.

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
- **Export for another engine** emits ordinary JSON, verified named assets, and a deterministic manifest using the same shared semantics as `export:project`. It prefers a fresh no-overwrite directory; browsers without directory access download one deterministic standard ZIP. Exact translation diagnostics and success hashes appear in the console. See [neutral export](../../packages/engine/docs/neutral-export.md).

Legacy `.engine-project.json` remains readable. Saving a legacy project packs its available imported IndexedDB blobs into the new pair and reports any missing or stale blob instead of creating an incomplete archive. The portable persistence migration, built-in/data-driven Play/Build path, source-aware CLI bundle, and explicitly permitted in-editor custom-source Play path are shipped.

## Modes and shortcuts

- `F1`, `F6`, `F7`, `F8`: Edit, Play, Profile, and Build.
- `Ctrl/Cmd+S`: save the current project. `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`: undo and redo.
- `Ctrl+1` through `Ctrl+6`: Stage, Tilemap, Atlas, Post FX, Motion, and Network resource editors.
- `Ctrl+P` on Windows or `Cmd+K` on macOS: command palette.
- `Space`: pause or resume the fixed-step preview. `Ctrl/Cmd+Right Arrow`: advance one frame.
- Stage: arrow keys nudge the selected entity; `G` toggles the grid; `Alt+Z`, then click, calibrates world zero. Drag entities; `Shift` constrains an axis, `Alt` clones, and `Ctrl/Cmd` disables snapping.
- Tilemap: `B` paint, `E` erase, `G` fill, `M` marquee, `I` eyedrop, and `C` extracts collision rectangles.
- Atlas: Enter commits grid slicing, Shift-click selects a sequence, arrows select frames, F2 renames, and Alt+Left/Right reorders timeline frames. Use the clip selector to create, duplicate, tune, and switch named animation states.
- Motion: select an entity with a sprite using the current Atlas source, place the playhead, choose a named clip, and set a Sprite clip cue. The state holds until the next cue; click a labeled cue to scrub to it or right-click to delete it. Micro-motion recipes remain separate: Bite exchange automatically targets the nearest actor or hostile and exposes wind-up, contact, victim recoil, recovery, camera shake, flash, and particles as editable data.
- Post FX: effect cards expose keyboard reorder buttons; hold backtick for a raw A/B comparison.
- Motion: choose Pose or IK mode before manipulating the rig; `Shift+S` applies symmetric constraints.
- Network: `/` focuses packet filtering, and double-click resets injected latency.

## Storage, recovery, and builds

- Recovery snapshots use local storage key `catalog-engine.editor.recovery.v1`.
- Live source permission is kept only in memory for the current browser tab. Disabling it immediately stops Play, clears the compiled registry, and prevents further source requests.
- Imported asset blobs use IndexedDB database `catalog-engine-editor-assets` as a working cache. Opening a portable pair restores validated blobs to that cache.
- Standalone player progress uses the separate `hyperfocus-save-profiles` IndexedDB database only when `extensions.hyperfocusSave` declares a policy. Editor Play previews are session-only and cannot modify standalone profiles. Save export, deletion, limits, and privacy are documented in [portable runtime saves](../../packages/engine/docs/portable-runtime-saves.md).
- Project files use the `catalog-engine-editor-project` format discriminator and a numeric schema version.
- Directory-picker Save/Open reads and writes `.hyperfocus/project.json` plus `.hyperfocus/assets.hfp`. Browsers without that API download or select the same two files. Neutral export is separate disposable output and never changes this canonical pair.
- Standalone builds embed the verified portable pair and minified first-party runtime into one disposable HTML artifact outside `.hyperfocus`. CI reports and profile captures are downloadable JSON evidence. Custom TypeScript behavior builds use `bun run build:game -- --project <directory>` and create no intermediate source or wrapper files.

The browser database is not the authoritative copy of imported binaries. Before the first portable save, keep original imports available; after a successful save, the validated `.hyperfocus` pair is sufficient to restore them.

## Verification

```powershell
bun run typecheck:editor
bun run test:editor
bun run build:editor
bun run verify:editor
bun run verify:editor:system
bun run --cwd apps/engine-editor bench:history
```

The history benchmark pairs local A/B timing with full-project clone counts,
serialization counts, and the retained history bound. Power, thermal, and
contention labels can be supplied through the shared `HYPERFOCUS_BENCH_*`
environment variables.

Ordinary editor mutations use `transactSections({ label, dirtySections, update })`.
Undo captures only the named top-level sections, stable JSON invalidates only those
sections, and scene/settings/name validation stays scoped where the declared
boundary proves that safe. Coupled or unknown section sets automatically fall back
to full-project validation; full project replacement remains the simple baseline.

The acceptance suite also captures a generated offline HTML build in a clean iframe, waits for runtime readiness, and proves that authored keyboard input advances the player. The system suite covers state retention, simulated WASM/CSP fallback, keyboard blur recovery, post-process interception, high-DPI resize debouncing, and layout hotkeys.

## Accessibility and layout

The shell uses tab semantics for modes and resource editors, restores focus after dialogs, traps focus inside Project Center, and announces important changes. Canvas tools are focusable and critical ordering or movement operations have keyboard alternatives. UI scale, reduced motion, a resizable/collapsible project sidebar, fullscreen preview, and responsive workspace overflow support different screens and input preferences.

## Related

- [Repository documentation map](../../docs/README.md)
- [Architecture](../../docs/architecture.md)
- [Application design standard](../../DESIGN.md)
- [Engine editor user stories](user-stories.md)
- [Engine guide](../../packages/engine/readme.md)
- Root skill: `.agents/skills/hyperfocus-editor-agent/SKILL.md`
