# @hyperfocus/ui

Presentational Solid components styled with StyleX. It contains primitives, chat composition and transcript rendering, an xterm surface, workbench layout mechanics, and a CodeMirror source editor.

It intentionally has no filesystem, process, persistence, credential, agent-runtime, engine-project, or AI execution ownership. Those capabilities are injected by application hosts.

`bun run build` emits Solid DOM modules and extracted StyleX CSS to `dist/`. The build fails if a React JSX fallback or uncompiled `stylex.create` call reaches any JavaScript entrypoint.
