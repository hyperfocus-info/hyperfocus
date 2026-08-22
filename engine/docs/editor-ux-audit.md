# Editor experience audit and shipping path

Date: 2026-08-22

## Product standard

The editor should reveal one useful decision at a time. A new user must be able to create, play, change, and build a small game without understanding the engine's file format. An experienced user must be able to reach the underlying project data, scripts, profiling, and portability tools without fighting a beginner-only workflow.

The concrete acceptance target for this pass is:

- A first-time user can start playable Pong, understand the controls, change its feel, add an image, inspect its behavior, and reach a valid offline web build in five minutes.
- A designer can start either blank 2D or a real 3D scene without first dismantling sample content.
- Intermediate and advanced tools remain available after the core loop works: code, tilemaps, atlases, post effects, sequencing, audio-reactive bindings, logic, rigging, profiling, review, and neutral export.
- Every important action provides a visible result or a visible error. No action should fail only in a hidden console.

“Could go viral” cannot be verified or guaranteed by an editor. The auditable product requirement is that the editor does not block the iteration, polish, performance, and export work needed to pursue that outcome.

## Severity model

- P0: no credible path to start, play, or ship.
- P1: a core creation path exists but is hidden, misleading, or incomplete.
- P2: the path works but has excess friction or weak feedback.
- P3: refinement that does not block completion.

## Flow-by-flow findings

| Flow | Previous failure | Severity | Implemented outcome | Acceptance evidence |
| --- | --- | ---: | --- | --- |
| First launch | Opened directly into a dense production workspace with tiny controls and no explanation of what to do. | P0 | First run opens a focused “What do you want to make?” screen with project naming and four intent-based starters. | Clean-browser screenshot and starter creation system test. |
| New project | Creation was split across small plus controls; there was no distinction between learning, blank, 2D, or 3D starts. | P0 | New exposes playable Pong, 3D action, blank 2D, and the advanced showcase. Every starter is editable and has a declared build path. | Browser test creates Pong and 3D projects from the same first-run surface. |
| Learn / tutorial | No contextual tutorial or discoverable happy path. | P0 | Learn presents five concrete steps: play, tune, import, polish, and build. It also links directly to Code and 3D. | The Learn center is reachable from persistent sidebar navigation and from first-run. |
| Playtest | Play existed as a technical control, but the initial scene did not explain a useful game loop. | P1 | Pong starts with a complete ball/paddle/CPU loop and explicit W/S or arrow controls. 3D Play uses WASD with a follow camera. Escape returns to Edit. | System test proves the ball moves, the paddle responds, and the 3D actor moves. |
| Create an object | The add action was small and context-free. | P1 | Entity creation remains available in the project browser; imported assets can be dragged directly onto the Stage to create a positioned entity. | Browser test imports an SVG, drags it to the Stage, and verifies both project data and rendered pixels. |
| Select and transform | Inspector data was primarily read-only text/JSON. | P0 | Name, X/Y, width, and height are ordinary inputs. 3D position, Y rotation, and XYZ scale edit the portable scene immediately. | System test counts editable Pong properties and verifies a persisted 3D transform edit. |
| Components and behavior | Component values were rendered as diagnostic JSON rather than authoring controls. | P0 | Component fields are editable; components can be enabled, disabled, removed, and routed to their script. Generated mapping remains available as secondary detail. | State is transacted through project history and persisted to local recovery. |
| Import / existing assets | Files could be imported, but “what next?” was unclear, and a dropped image still appeared as a proxy shape inside the editor. | P0 | Assets are visible and draggable. Dropping an image at a Stage point creates a sprite entity at that world position and decodes the actual image for the editor preview. Packed assets remain the source for builds. | End-to-end import/drop/render browser assertion uses a real image Blob and samples the rendered canvas pixel. |
| Scripts | There was no script workspace; script components exposed only module/export strings. | P0 | Code provides a project file list, TypeScript editor, unsaved status, line count, Ctrl/Cmd+S, save-to-project, and source download. Saving a project directory writes embedded files to their real relative paths. | Pong source is edited and recovered by the browser test. Neutral export tests prove nested script output. |
| 3D discoverability | The engine and build pipeline had 3D support, but the editor exposed no 3D workspace. | P0 | 3D is a top-level resource beside Stage. The starter contains a real glTF asset, material/texture data, camera, lighting, physics declarations, five scene objects, transforms, and a WebGL preview. | Unit test cooks the generated glTF through the 3D runtime; browser test requires WebGL, five objects, transform persistence, and Play movement. |
| Polish | Advanced FX, animation, sequencing, audio, and rig tools dominated first launch instead of supporting a working game. | P1 | These capabilities remain intact but are progressive: Learn sends users to Polish only after the playable loop exists; the advanced showcase pre-populates production tools for expert exploration. | Existing post-budget, motion, atlas, production, and workspace verification remains active. |
| Feedback / errors | Several actions reported only through subtle status text or the console. | P1 | Actions announce through an ARIA live region and a high-contrast transient toast. Errors use a distinct error toast and open the detailed console. Drop targets and unsaved code have explicit visual states. | Browser suite rejects console/page errors; feedback DOM is exercised by normal journey actions. |
| Build | “Build” did not establish a beginner-readable contract between editor data, custom code, and the final artifact. | P0 | Build states its target and preflight checks. Built-in starters download as one offline HTML file. Custom TypeScript is saved as source and explicitly routes to the CLI bundler. CI and neutral-engine exports remain available. | Pong reaches an enabled one-click build; asset and runtime preflight tests pass. |
| Portability | Advanced users could not see how authored code traveled with ordinary project data. | P1 | Neutral export includes nested TypeScript source alongside project and asset files. Directory export creates arbitrary nested paths safely. | Neutral export tests validate `scripts/src/gameplay.ts` and deterministic manifest content. |
| Recovery | It was difficult to tell whether work was retained. | P2 | All authoring transactions update bounded local recovery; History exposes undo/redo and recovery state; folder Save writes the portable pair and source files. | Script and transform journey assertions read the recovered project state. |
| Performance | Tool density made performance features visible, but not relevant to the task in progress. | P2 | Profile and diagnostics are separate modes/resources. FX budget feedback is actionable and does not interrupt core authoring until requested. | Existing frame, WASM fallback, post-budget, high-DPI, and blur-reset system checks still run. |

## Five-minute Pong happy path

The path is deliberately template-first. A blank-canvas Pong test would measure familiarity with the editor rather than whether a first-time user can finish a game.

### 0:00–0:30 — start with intent

1. Open the editor.
2. Name the project.
3. Choose **Pong in five minutes**.

The resulting scene already contains arena walls, player paddle, CPU paddle, ball, colliders, controls, and fixed-step behaviors. It is not a video or locked demo; every entity and component is ordinary project data.

### 0:30–1:15 — prove the loop

1. Press **Play** or F6.
2. Move with W/S or the arrow keys.
3. Press Escape or choose **Edit**.

The ball, opponent, collision, reset behavior, and input should work before the user is asked to configure anything.

### 1:15–2:15 — tune the feel

1. Select **Player Paddle** or **Ball** in the project browser.
2. Change size/position in the Inspector.
3. Expand the behavior component and adjust speed values.
4. Play again immediately.

Undo/redo and local recovery cover these transactions.

### 2:15–3:15 — bring in identity

1. Drop image or audio files onto Assets, or choose **Import assets**.
2. Drag an image row into the Stage at the desired position.
3. Resize and position the created entity in the Inspector.

The Stage renders the imported image rather than a placeholder; the same packed binary is embedded in the final build.

### 3:15–4:15 — polish or code

Use **Polish** for effects and animation, or **Code** to inspect and edit the starter TypeScript source. Ctrl/Cmd+S saves source to the project. Built-in Pong behaviors remain immediately playable; custom TypeScript is bundled through the documented CLI path.

### 4:15–5:00 — build

1. Choose **Build** or F8.
2. Review preflight: project shape, runtime behaviors, navigation/story/save policies, assets, and target profile.
3. Choose **Build offline HTML**.

The result is one downloadable HTML file that runs without the editor or a server.

## Intermediate and advanced one-week path

This is the intended production sequence, not a promise about market performance:

- Day 1: establish the loop from Pong, blank 2D, 3D action, or the showcase; replace starter values with game-specific mechanics.
- Day 2: import owned art/audio, compose scenes, tune camera and input, and validate the target profile early.
- Day 3: add atlas animation, post effects, audio-reactive work, sequencing, and transitions while watching the FX allocation.
- Day 4: move game-specific behavior into project TypeScript, add navigation/story/save declarations as needed, and exercise recovery plus folder Save.
- Day 5: profile representative hardware, inspect frame percentiles and fallbacks, and reduce expensive passes or oversized assets.
- Day 6: use review/annotation and the production showcase tools to finish feedback, accessibility, and presentation passes.
- Day 7: run preflight, create the offline web artifact, export CI evidence, and create a neutral source bundle for archiving or another engine.

## Known limits and follow-up decisions

These are intentionally visible rather than hidden behind optimistic copy:

1. **Native Steam packaging is not implemented.** The current one-click artifact is an offline browser game. It can be wrapped by an external desktop shell, but store SDK integration, native installers, signing, achievements, cloud saves, and Steam upload are not an end-to-end editor flow yet. If “ship on Steam” means native packaging from this editor, that is the next P0 product track.
2. **Arbitrary TypeScript is not live-compiled by the browser editor.** Source is editable, recovered, saved to its relative project path, and exported. Starter built-ins run immediately. Custom modules use `bun run build:game -- --project <directory>`.
3. **Arbitrary imported glTF is not automatically added to the 3D hierarchy.** The 3D starter proves the actual cooking/runtime path, while transform editing uses viewport proxies. A production asset-to-3D-scene placement flow still needs mesh/material pickers, import diagnostics, and automatic hierarchy creation.
4. **The tutorial is contextual and in-product, not a narrated course.** It provides a short guided path and direct destinations. Interactive coach marks, sample checkpoints, and embedded reference search would be further onboarding work.
5. **Virality is not an engineering acceptance criterion.** Fast iteration, distinctive presentation, stable performance, and a credible shipping artifact are; discovery and market response are outside editor control.

## Automated acceptance gates

The system verification must fail if any of these regress:

- Eight authoring resources exist and keyboard switching preserves selection.
- First-run Pong produces five editable gameplay entities.
- Pong ball and paddle respond in Play.
- Imported image bytes decode, drag to a real Stage coordinate, persist as a sprite component, and render in the editor.
- Project TypeScript changes persist to recovery.
- Pong reaches enabled one-click offline build.
- The 3D starter creates five objects in a live WebGL context.
- 3D transform changes persist and WASD moves the actor in Play.
- WASM failure falls back without stopping the loop.
- Focus loss clears held keys; high-DPI resize bursts are debounced.
- Post-processing budget overruns become actionable UI feedback.

Primary evidence is written to `.local/editor/system-verification.json` with Pong, Code, and 3D screenshots beside it.
