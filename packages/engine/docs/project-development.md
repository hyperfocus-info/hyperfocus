# Source-aware project development

Run the development loop from the engine checkout:

```sh
bun run dev:game -- --project ./my-game
```

The default address is `http://127.0.0.1:8797`. Localhost is intentional: passing another `--host` is an explicit decision to expose an unauthenticated development build.

The command validates and builds the same portable pair used by release builds, bundles ordinary TypeScript behavior modules directly in memory, and serves one standalone HTML snapshot. It does not generate component wrappers, per-entity files, a shadow project, or a dependency forest.

## Watch and rebuild behavior

Outside the checkout, use the installed package's public preview API:

```ts
import { startProjectDevServer } from "@hyperfocus/engine/tooling/dev-project";

const dev = await startProjectDevServer({ projectDirectory: "./my-game", port: 8797 });
console.log(dev.url);
// The owner must await dev.stop() on shutdown to release watchers and output.
```

The packed-consumer gate exercises public creation, custom-source builds and receipts,
preview, transitive edits, broken-source recovery, and cleanup in a temporary directory
outside this repository. Checkout commands run current source; installed commands run
the packaged bundles. Both use the same implementation. Package builds bundle the
editor-owned standalone runtime; no editor source path is required after installation.

The watcher tracks only:

- `.hyperfocus/project.json`;
- `.hyperfocus/assets.hfp`;
- relative authored JavaScript/TypeScript inputs proven by the behavior bundle graph, including transitive imports inside the project root.

Unrelated files do not trigger a build, and `node_modules` is not recursively watched. Changes are debounced between 25 ms and 2 seconds, only one build chain commits at a time, and live-reload connections are bounded.

Each build is written to one temporary HTML file outside the project, read into memory, and deleted. A fully successful build atomically replaces the served snapshot and sends a reload event. A failed build keeps the last good game available, reports the build diagnostic in the terminal and browser overlay, and continues watching so fixing the file recovers without restarting the command.

Press Ctrl+C to close file watchers and live-reload streams, stop the HTTP server, wait for any active build, and delete the disposable directory.

Useful options:

```sh
bun run dev:game -- --project ./my-game --port 9000
bun run dev:game -- --project ./my-game --host 127.0.0.1
```

Use `bun run build:game -- --project ./my-game` for the persistent release artifact. Development output is never canonical project state.

## Build receipt

Source-aware `--offline` builds write `<game>.html.receipt.json` beside the standalone HTML.
Default web builds record their complete output inventory in `build.json`; see
[web delivery](project-delivery.md). The following receipt contract applies to HTML.
The sidecar identifies the artifact, canonical pair, exact source/dependency/runtime
bytes loaded by esbuild, generated entry, tooling sources, discovered ancestor
manifests/configuration and lockfiles, and Bun/esbuild/engine versions. A receipt's
identity changes when an input changes even if minification produces identical HTML.
The canonical `.hyperfocus` pair is unchanged. Development rebuilds discard their
temporary HTML and receipt together.

Verify a retained artifact without rebuilding:

```sh
bun run build:game -- --verify-receipt ./my-game/dist/my-game.html
```

The command checks receipt integrity and the current artifact hash, and exits
nonzero on mismatch. It does not re-run tests or inspect current source files.
Build validation records canonical-pair, runtime-preflight and single-file checks;
browser/gameplay/accessibility and human acceptance remain explicitly unassessed.
Configuration and tooling files are observed after bundling, and the receipt uses
local absolute input paths. This is local build evidence, not a signed provenance
or reproducible-build claim. HTML and receipt are staged then replaced separately;
an interrupted replacement can leave a mismatch, which verification detects.

## Installed-package authoring boundary

The source-aware preview/build commands above currently require the monorepo
checkout. Their standalone runtime entry is owned by
`apps/engine-editor/src/standalone-entry.ts`; the installed engine package does not
provide a self-contained source-aware game CLI.

A 2026-09-11 isolated installed-package experiment packed existing checkout
artifacts with scripts disabled, installed the tarball outside the repository,
and attempted creation plus custom-source preview/build. Installation succeeded.
The exported `tooling/create-project` failed resolving `../src/project/index.ts`;
`build:game` and `dev:game` failed because their referenced `scripts/*.ts` entries
were absent. Supplying a valid pair and ordinary custom TypeScript as a fixture
did not change those missing-entry failures. The same custom-source project built
successfully through the checkout and produced a verified build receipt.

This bounds the observed result to the packed current artifacts; it does not
claim to have rebuilt or certified an npm release. Before promising installed
source-aware authoring, select an owner for the editor runtime plus compiler
distribution and prove create, edit, preview and build from an external install.
Copying the script alone would preserve its dependency on the private app tree.
