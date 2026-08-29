# Migration status

## Completed

- Initialized the Hyperfocus monorepo and configured the GitHub remote.
- Imported the current dirty harness working tree without its Git metadata, secrets, dependencies, build output, or temporary state.
- Imported the engine without build output or multi-gigabyte licensed source-asset archives.
- Moved `@hyperfocus/engine` into `packages/engine` and updated workspace, script, documentation, and package-consumer path references.
- Moved the editor into `apps/engine-editor` and updated packages/engine/editor boundaries.
- Made the harness protocol canonical in `@hyperfocus/ai-core`.
- Added framework-neutral workspace contracts with path-safety tests.
- Added Solid/StyleX primitives, composer, transcript, xterm surface, workbench, and CodeMirror source editor packages.
- Added optional editor-to-harness AI chat.
- Removed the Tailwind compiler and packages from the harness build.
- Added a combined Solid/StyleX compiler pass so browser bundles contain Solid DOM output and extracted atomic CSS, with no React or StyleX runtime transform fallbacks.
- Migrated the harness shell and every feature surface off Tailwind utility strings, deleted the 155 KB compatibility stylesheet, and retained only document-level base CSS plus Xterm's official vendor stylesheet.
- Moved editor shell, navigation, sidebar/layout state, console, Project Center, command palette, optional AI panel, project browser, selection inspector, script browser, 3D declaration panels, preferences, and visible CodeMirror source editing under one Solid/StyleX shell owner while keeping canvas render loops framework-neutral.
- Added reusable tabs, segmented controls, panel surfaces, action menus, accessible trees, and descriptor-driven panel groups to `@hyperfocus/ui`; application adapters retain editor command and project-domain ownership.
- Added a DOM-free editor session controller that separates mode, workspace, selection, overlays, and console state from authored project history.

## Remaining migration debt

- Port the editor's remaining imperative Atlas, Tilemap, Post FX, Sequence, Diagnostics, and Production Lab lists/forms from `client.ts` into Solid feature components without routing canvas, WebGL, SVG-path generation, or frame-loop work through Solid.
- Move harness-specific workbench and terminal session composition onto the shared presentation surfaces while keeping transport and process ownership in the harness.
- Publish package/release signing identities and settle license owner/reporting details.
- Bring `C:\Users\MindOverMelee\pad-pilot` into the ecosystem after its architecture and licensing are inventoried.

New UI must use colocated StyleX. Global CSS is limited to document defaults and third-party vendor boundaries that cannot be expressed as component styles.
