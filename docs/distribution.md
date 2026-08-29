# Distribution

## Engine editor

`apps/engine-editor` is named `hyperfocus-editor` and exposes the `hyperfocus-editor` binary. Publishing that package enables:

```text
bunx hyperfocus-editor
```

Its prepublish build bundles the browser application, StyleX CSS, engine runtime, and WASM asset. Static responses read only files inside the package directory. The opt-in loopback agent API may read and atomically update only the explicit project roots supplied by local callers; it is disabled for non-loopback server bindings.

Tagged GitHub releases build the same application and attach a portable archive. The archive does not contain the harness and the editor remains useful without it.

## Harness

The harness retains its standalone launcher packaging flow. GitHub releases attach a
versioned `hyperfocus-harness-v<version>-windows-x64.zip` containing the complete
Windows launcher directory. The tagged workflow runs the full Harness test gate,
extracts the archive, verifies its file set, and smokes the extracted executable
before upload. Source users can run the launcher directly from the monorepo. The
launcher can register as the current user's `ide://` handler, reuse an existing
loopback backend, or start a desktop-owned backend whose lifetime follows connected
IDE tabs.

Standalone update discovery is opt-in. The framework-neutral desktop runtime package supplies the version-source contract and comparison policy, while each consumer owns its release source, user prompt, download, signature verification, and installation behavior.

## Libraries

Each package has its own manifest and exports. Future remote splitting should preserve package directories and use subtree or filtered-history publication rather than introducing cross-repository relative imports. `@hyperfocus/engine` is stored at `packages/engine` as a normal workspace package.

## Versioning

The monorepo keeps one app/package version line. Branch pushes bump the checked-in
patch version by default, while tagged releases publish the version already present
on the tag. See [Versioning](versioning.md) for the release workflow and local
commands.

Related: [documentation map](README.md), [architecture](architecture.md),
[package testing](package-testing.md), [versioning](versioning.md), and [licensing](licensing.md).
