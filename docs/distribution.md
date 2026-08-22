# Distribution

## Engine editor

`apps/engine-editor` is named `hyperfocus-editor` and exposes the `hyperfocus-editor` binary. Publishing that package enables:

```text
bunx hyperfocus-editor
```

Its prepublish build bundles the browser application, StyleX CSS, engine runtime, and WASM asset. Static responses read only files inside the package directory. The opt-in loopback agent API may read and atomically update only the explicit project roots supplied by local callers; it is disabled for non-loopback server bindings.

Tagged GitHub releases build the same application and attach a portable archive. The archive does not contain the harness and the editor remains useful without it.

## Harness

The harness retains its standalone launcher packaging flow. GitHub releases attach the Windows launcher; source users can run it directly from the monorepo.

## Libraries

Each package has its own manifest and exports. Future remote splitting should preserve package directories and use subtree or filtered-history publication rather than introducing cross-repository relative imports.
