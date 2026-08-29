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

## Runtime support

The authoritative server and tooling support the Bun version declared in `package.json`. Browser releases must pass the browser/device evidence matrix documented in `browser-support.md`; an untested browser is not implied to be supported. Optional Three.js integrations use the exact peer range declared by the package.

## Reporting a compatibility defect

A stable API that breaks inside the same patch line is a release-blocking defect. Include the old and new engine versions, entrypoint, compiler/runtime version, and a minimal reproduction. Security-sensitive compatibility reports follow `SECURITY.md` instead of a public issue.
