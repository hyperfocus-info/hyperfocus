# Compatibility policy

Hyperfocus separates a patch-stable package contract from explicitly experimental entrypoints. The machine-checked `0.0.x` baseline is [`public-api-v0.0.json`](./public-api-v0.0.json).

## The 0.0 compatibility promise

- Stable entrypoints will not be removed, retargeted, or narrowed incompatibly in a `0.0.x` patch release.
- Existing exported names on stable entrypoints remain available throughout the `0.0.x` line. Compatible additions are allowed.
- Persisted project, save, backup, and protocol data always carry explicit format/schema versions. Readers reject unsupported versions instead of guessing.
- A breaking stable-API change requires `0.1.0` or later, a changelog entry, migration instructions, and at least one prior deprecation release when a safe compatibility shim is possible.
- Experimental entrypoints may change in a minor `0.x` release. They remain patch-stable: an `0.0.x` patch cannot silently remove or retarget them.
- Security fixes may reject previously accepted unsafe input. Tightening validation is not considered a compatibility break when documented in the changelog.

The release lane checks every package export against the baseline, verifies runtime/declaration parity, installs the packed tarball in external Bundler and NodeNext consumers, and exercises representative symbols. Updating the baseline requires an explicit compatibility review; it is not generated automatically during a build.

The October 7 example extraction adds the stable `./assets/model-cooking` entry
for the editor and Touch of Death's shared static/primitive GLB encoding. Existing
reader entries and ceilings remain unchanged. Installed consumers exercise the
new writer and declarations. The engine's two Touch of Death preset exports are
deprecated frozen compatibility fixtures; current authored balance lives in the
[example package](../examples/touch-of-death/README.md). Removing the old names
requires the breaking-release process above.

The September 2026 release review classified the existing scalar/SIMD WASM asset
subpaths alongside the stable compatibility asset and the material preset subpath
alongside experimental 3D rendering. These are additions; no existing subpath was
removed or retargeted. The package build and installed material-consumer proof now
cover the material preset runtime that its manifest previously declared but omitted.

The Touch of Death delivery review adds three existing manifest subpaths to the
experimental classification: `./combat/net` exposes the bounded combat input,
snapshot and recording contracts; `./tooling/build-project` builds installed
projects; `./tooling/dev-project` owns their local preview lifecycle. These are
specialized session and authoring surfaces, alongside the existing experimental
tooling entrypoints. Their explicit runtime/declaration targets are now checked;
the same patch-stability rule applies. This classification does not downgrade
`./combat`, `./net`, `./protocol`, or any other stable entrypoint.

`./tooling/create-project` retains its original `tooling/create-project.ts`
runtime and type target. Its named-export facade resolves a private package import
to bundled tooling and emitted declarations when installed. Repository TypeScript
paths resolve that private import to source for clean declaration builds. The
implementation is not included as checkout-dependent source in the tarball;
installed Bundler and NodeNext consumers exercise the same public facade.

## Runtime support

The authoritative server and tooling support the Bun version declared in `package.json`. Browser releases must pass the browser/device evidence matrix documented in `browser-support.md`; an untested browser is not implied to be supported. Optional Three.js integrations use the exact peer range declared by the package.

## Reporting a compatibility defect

A stable API that breaks inside the same patch line is a release-blocking defect. Include the old and new engine versions, entrypoint, compiler/runtime version, and a minimal reproduction. Security-sensitive compatibility reports follow `SECURITY.md` instead of a public issue.
