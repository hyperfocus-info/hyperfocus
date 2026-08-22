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

## Remaining migration debt

- Port the editor's large imperative canvas/tool controllers into smaller Solid-owned feature islands without rewriting performance-sensitive render loops.
- Replace the harness compatibility CSS and legacy utility class strings component-by-component with `@hyperfocus/ui` StyleX components.
- Move harness-specific workbench and terminal session composition onto the shared presentation surfaces while keeping transport and process ownership in the harness.
- Publish package/release signing identities and settle license owner/reporting details.
- Bring `C:\Users\MindOverMelee\pad-pilot` into the ecosystem after its architecture and licensing are inventoried.

The compatibility stylesheet is deliberately frozen. New UI must use StyleX.
