# Source-aware project development

Run the development loop from the engine checkout:

```sh
bun run dev:game -- --project ./my-game
```

The default address is `http://127.0.0.1:8797`. Localhost is intentional: passing another `--host` is an explicit decision to expose an unauthenticated development build.

The command validates and builds the same portable pair used by release builds, bundles ordinary TypeScript behavior modules directly in memory, and serves one standalone HTML snapshot. It does not generate component wrappers, per-entity files, a shadow project, or a dependency forest.

## Watch and rebuild behavior

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
