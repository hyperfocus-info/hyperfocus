# Migration status

## Completed

- Initialized the Hyperfocus monorepo and configured the GitHub remote.
- Imported the current dirty harness working tree without its Git metadata, secrets, dependencies, build output, or temporary state.
- Imported the engine without build output or multi-gigabyte licensed source-asset archives.
- Moved the editor into `apps/engine-editor` and updated engine/editor boundaries.
- Made the harness protocol canonical in `@hyperfocus/ai-core`.
- Added framework-neutral workspace contracts with path-safety tests.
- Added Solid/StyleX primitives, composer, transcript, xterm surface, workbench, and CodeMirror source editor packages.
- Added optional editor-to-harness AI chat.
- Removed the Tailwind compiler and packages from the harness build.
- Added a combined Solid/StyleX compiler pass so browser bundles contain Solid DOM output and extracted atomic CSS, with no React or StyleX runtime transform fallbacks.
- Migrated the harness shell and every feature surface off Tailwind utility strings, deleted the 155 KB compatibility stylesheet, and retained only document-level base CSS plus Xterm's official vendor stylesheet.
- Moved editor shell, navigation, sidebar/layout state, console, optional AI panel, and visible CodeMirror source editing under Solid/StyleX ownership while keeping the canvas render loops framework-neutral.

## Remaining migration debt

- Port the editor's remaining imperative workspace/tool controllers and generated inspector/tree surfaces into smaller Solid-owned feature islands without rewriting performance-sensitive render loops.
- Move harness-specific workbench and terminal session composition onto the shared presentation surfaces while keeping transport and process ownership in the harness.
- Publish package/release signing identities and settle license owner/reporting details.
- Bring `C:\Users\MindOverMelee\pad-pilot` into the ecosystem after its architecture and licensing are inventoried.

New UI must use colocated StyleX. Global CSS is limited to document defaults and third-party vendor boundaries that cannot be expressed as component styles.
