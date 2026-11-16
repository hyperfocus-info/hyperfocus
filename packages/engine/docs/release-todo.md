# Release TODO

## Legacy graphics compatibility

- [ ] Add a shared WebGL1/WebGL2 capability path for a representative skinned,
  textured gameplay scene, preserving the existing scene/command and resource
  owners. The user explicitly deferred this to the roadmap on November 1, 2026.
  [CM-02](../../../docs/audits/casey-muratori.md#cm-02-device-capability-and-support-evidence)
  owns the scope, capability risks and first acceptance milestone. Establish a
  tested device/OS and feature floor; do not promise universal hardware support.

## Long-term bundle-size investigation

Owner: engine maintainers, with editor standalone owners for authoring output.
The [temporary budget exception](bundle-size-evidence.md#temporary-budget-exception-2026-10-07)
accepts current delivery size, not an optimization. Review it before the next
engine release and when changing an affected runtime boundary.

- [ ] Reduce the owner-approved 2x standalone/tooling/total ceilings (2026-10-07).
  Include replay protobuf's complete generated/runtime graph in attribution;
  compare against the pre-increase ceilings in the policy's evidence history.

- [ ] Attribute complete native and rebundled 3D graphs to physics, frame/runtime,
  validation and presentation consumers; preserve a reproducible control report.
- [ ] Investigate explicit optional modules for heavy 3D capabilities and separate
  generic standalone needs from game-specific presentation. Compare full consumer
  downloads and API/initialization compatibility before proposing a migration.
- [ ] Investigate combat compatibility data, repeated validation and duplicated
  runtime/authoring output. Measure raw, gzip and Brotli improvements without
  hiding chunks, removing supported behavior or shifting cost to another package.
- [x] Test the shared export intersection of ragdoll execution across the public
  ragdoll, physical-performance and project runtime entries. Repeated factory
  bodies expose roughly 47.4 KB raw in the selected October 27 artifacts; this is
  not a savings forecast. Keep entry-specific helpers out, compare mutable module
  state and complete native/rebundled graphs, and reject the earlier broad-sharing
  retention failure before changing production packaging. The bounded probe was
  rejected: all three affected native/rebundled consumers grew, four raw graph
  checks newly failed, and WASM initialization increased. No production edit.
- [x] Trace the actual delivered narrow project reader's retained bindings and
  initialization owners. Separate required validation and identity-bearing state
  from removable retention; source-only purity annotations or guessed byte savings
  do not establish a candidate after the observed minification boundary. The exact
  saved 41,595-byte artifact has ten required functions and 90 retained
  declarations/effects; no safe deletion was selected.
- [x] Evaluate an explicit delivered runtime facade over private implementation
  and the existing focused reader owner. Preserve the current public path,
  namespace, declarations and native eager initialization; test actual rebundler
  exclusion using existing package metadata. Count every private/shared module
  and native graph cost before selecting any production packaging change. Deferred:
  the isolated reader fixture shrinks but full graphs grow, and the existing
  production worker requires the implementation. No production changes selected.
- [ ] Ratchet affected entry and aggregate ceilings down as verified reductions
  land. Retire each temporary increase against the documented previous targets;
  any retained increase needs a fresh, explicit budget decision. Verify package
  build, the full size gate and installed consumers for each packaging change.

## Historical candidate validation (2026-09-10)

This evidence predates the current size regressions. Use the
[current bundle gate](bundle-size-evidence.md) for release acceptance.

On 2026-09-10, `bun run ship-check engine` passed all five typecheck lanes,
compatibility, package/example/editor builds, package smoke, the delivered-byte
gates, and 1,612 tests (181,119 assertions). The full suite exercises Chromium,
Firefox and WebKit with desktop/touch profiles. One optional source-regeneration
test initially skipped because the original Kenney FBX and license were absent.
Those inputs were then restored from the official CC0 archive, matched to the
pinned hash, and the complete five-test fixture suite passed, including exact
regeneration. No tracked runtime fixture was changed.

Supplemental `release:verify` components also passed on this candidate:
`bench`, `release:package-consumer` (packed npm install, Bundler and NodeNext),
`release:wasm-asset` (Vite 8.0.14) and `release:wasm-hosting` (correct MIME and
byte fallback). This records component execution; it does not claim the composite
`release:verify` command was rerun after the same full check.

[Archived bundle evidence](history/bundle-size-evidence.md) records the actual 33,695-byte
JavaScript reduction, rejected shared-package regressions, and the explicit
migration of obsolete feature limits. The old 1.6 MB ceiling did not pass; the
then-complete output was 2,547,872 bytes against the reviewed 2,560,000-byte
ceiling, with independent compressed and transitive consumer checks.

## Remaining evidence and ownership

- Combat AI: close the ordered [learning and evaluation gaps](combat-ai-evolution.md#remaining-work-in-dependency-order)
  before claiming broad improvement or expert fighting strength. Engine owns
  opportunity/reward and legality evidence; Editor owns durable ingestion and
  report coverage; product QA owns skilled-player acceptance.

- `bun run certify:package` exits 2 without a release-specific evidence document.
  Local tests cannot supply an independent security assessment, an enabled
  private vulnerability-reporting channel, a live HTTPS security policy, two
  distinct maintainers, or owner-reviewed candidate digest and compatibility
  evidence. [Production readiness](production-readiness.md) defines that contract.
- Package publication and trusted-publisher configuration are not established by
  local validation. No package was published during this work.

## Optional source restoration

From the engine package, run:

```sh
bun examples/motion-lab/scripts/restore-fixture-source.ts
bun test examples/motion-lab/scripts/generate-fixtures.test.ts
```

The restorer downloads the [official Kenney CC0 pack](https://kenney.nl/assets/animated-characters-survivors),
requires archive SHA-256
`fdadced07a0454c9b7f0b46507be6144a072b4d03b4ffa37f225893c76c62845`,
and preserves source SHA-256
`18835fef534eede635b081ee7fe647d01a885550a591d2e6bf071010906167d8`.
It restores only the original FBX and license under the ignored Three Arena
`assets/source/kenney/animated-characters-survivors/` tree, plus the generated
source copies and provenance under ignored Motion Lab `assets/source/`.
It refuses mismatched existing files and verifies every checked-in GLB and the
manifest before restoring copies. Source archives remain outside ordinary Git
history; runtime fixtures remain usable without these authoring inputs.

## Trusted npm publishing

Trusted publishing cannot be activated until this project has a public GitHub
repository, the final repository URL is recorded in `package.json`, and the
`@hyperfocus/engine` package exists under an npm account or organization controlled
by the owner.

When those prerequisites exist:

1. Add the exact public repository URL to the `repository`, `homepage`, and
   `bugs` fields in `package.json`.
2. Add `.github/workflows/publish.yml` using a GitHub-hosted runner, Node 24 or
   newer, npm 11.5.1 or newer, and permissions `contents: read` and
   `id-token: write`.
3. Make the workflow run `bun install --frozen-lockfile`,
   `bun run release:verify`, and `npm publish --access public` from a protected
   release tag or environment.
4. Register that exact repository and `publish.yml` as the package's trusted
   GitHub publisher in npm, initially allowing staged publishing if available.
5. Complete one staged or test release, verify the provenance attestation, and
   then disable token-based publishing in the npm package settings.
6. Protect release tags and require review for the publishing environment.

Do not add an npm write token to repository secrets. Trusted publishing uses a
short-lived OIDC credential issued to the approved workflow.
