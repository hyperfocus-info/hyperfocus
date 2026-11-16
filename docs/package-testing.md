# Package Testing

This guide owns repository-wide library testing expectations for `packages/*`.

## Baseline Commands

Select checks from the changed contract and affected consumers. A package-local
fix normally needs its focused tests; public exports, types, or packaging also
need consumer/build verification. The commands below are available gates, not a
mandatory sequence for every edit. Expand to shared or release gates when the
boundary changes. Continue repairing failures caused by the change in disposable
fixtures; live services or user stores are not test fixtures.

From the repository root:

```powershell
bun run typecheck:packages
bun run test:packages
bun run build:packages
```

Use `bun.cmd` instead of `bun` when PowerShell blocks `bun.ps1`.

The shared-package runner uses separate processes: backend contracts run without
the DOM preload, and UI tests select Solid's `browser` condition with the UI
preload enabled. The UI package's own test command uses the same browser lane.
It discovers `packages/*/package.json` instead of maintaining a package allowlist.
Packages with a custom `test` command run that command in a separate backend
process, including artifact-review's script-hosted regressions. Packages without
a custom command run through directory discovery, including performance evidence
helpers. Engine remains in `test:engine`. Use
`bun run test:packages --plan` to inspect selection without executing tests.
`bun test ./scripts/testing` protects package discovery and lane separation and
is included in `test:repository`. Adding a package must preserve these process
boundaries; a passing plan is selection evidence, not test execution.

Package-local commands:

- `bun run --cwd packages/artifact-review test`: manifest identity, review sections,
  media allowlists, HTTP ranges, feedback persistence and stale-write rejection.
- `bun run --cwd packages/review-store test`: immutable assets, version isolation,
  append-only feedback, restart durability, transactions, and stale-write rejection.

- `bun run --cwd packages/ai-core test`
- `bun run --cwd packages/ai-runtime test`
- `bun run --cwd packages/workspace test`
- `bun run --cwd packages/utilities test`
- `bun run --cwd packages/desktop-runtime test`
- `bun run --cwd packages/pad-pilot test`
- `bun run --cwd packages/ui test`
- `bun test packages/performance` (repository-only benchmark evidence helpers)
- `bun run test:serialization` (codec bounds, compatibility, atomic upgrades and domain parity)

Engine package commands remain separate because its release gate is broader than
the shared-package baseline:

```powershell
bun run typecheck:engine
bun run test:engine
bun run build:engine
```

Use `bun run --cwd packages/engine check` for release-shape engine changes.

## Coverage Shape

Use [adversarial boundary testing](adversarial-testing.md) when changing lifecycle,
history, capacity, numeric storage, persistence, transport or delivery contracts.
It defines replayable harnesses and separates correctness gates from timing
evidence. Product-specific findings remain in the owning audit.

Library tests should prove contracts at the boundary where consumers rely on them:

- Public exports compile and resolve through manifest-backed subpaths.
- Runtime validation rejects malformed external or persisted data.
- Error cases return explicit discriminated results instead of nullable ambiguity.
- State transitions cover success, conflict, retry/recovery, and cleanup paths.
- UI packages cover keyboard, focus, disabled, loading, empty, error, and recovery
  behavior for reusable components.
- Performance-sensitive packages keep deterministic behavior tests separate from
  benchmark evidence.

Unit tests belong beside the module under test. Cross-package or package-consumer
tests may use public barrels; implementation tests should import the owning module
directly.

Label direct-source smoke runs as implementation evidence. A public-consumer claim
also needs manifest-backed imports and the relevant build/extraction boundary.
Keep mission completion separate from a runner's execution result; campaign
assertion and persona evidence follow the [audit reconciliation owner](../.agents/skills/user-audit/references/evidence-reconciliation.md).

## Package Matrix

| Package | Test emphasis |
| --- | --- |
| `@hyperfocus/ai-core` | Zod protocol schemas, command/event unions, capability metadata, client connection lifecycle, reconnect queues, frame bounds, and portable intent contracts. |
| `@hyperfocus/ai-runtime` | Agent/provider/model catalog composition, adapter compatibility, secure credential boundaries, bounded process output, cancellation/deadline propagation, native cancellation-file acknowledgements, CLI descendant cleanup, and explicit CLI restriction arguments. |
| `@hyperfocus/workspace` | Safe relative paths and the public `/testing` adapter conformance runner for stale atomic batches, delete/recreate revisions, and failing/nested watcher ordering. Memory runs in `bun test packages/workspace/src`; browser storage and connection/restart/backup checks belong to consumer-owned verification. Adapter-specific crash and durability acceptance remain separate. |
| `@hyperfocus/utilities` | Explicit numeric/record/text policies, exact signed safe-integer cents, escaping, timer cancellation/reentry and public subpath browser-build/consumer parity. |
| `@hyperfocus/desktop-runtime` | Protocol target parsing, browser-backed client leases, shutdown timing, dev HMR batching, scoped backend process replacement and generated-path exclusion, hidden command spawning, owned headless-browser startup/failure/owner-death cleanup, actual Windows descendant-window visibility, injected update sources, and no implicit install side effects. |
| `@hyperfocus/pad-pilot` | Public subpath resolution, bounded Module manifest validation, QuickJS script contracts, capability identities, browser/Bun entry separation, signing, semver, and extracted consumer Module verification. Generated starters test authored behavior and bundle integrity and emit source/artifact receipts; native host acceptance remains separate. |
| `@hyperfocus/ui` | Shared primitives, overlay/focus mechanics, workbench panels, preferences, transcript/composer rendering, terminal/source-editor surfaces, StyleX extraction, and accessibility states. |
| `@hyperfocus/performance` (repository-only) | Structural evidence versus environment-qualified timing comparisons, incomplete-machine-context rejection, bounded benchmark history, and report validation. Verify with `bun test packages/performance`; this private helper has no published-package build gate. |
| `@hyperfocus/serialization` | Portable byte/text codecs, malformed frames, bounds, legacy readers, HTTP cancellation on overflow, SQLite upgrade rollback, and real engine/PadPilot/Harness payload parity. Timing evidence uses `bun run bench:serialization`, separately from correctness gates. |
| `@hyperfocus/engine` | DOM-free core subpaths, browser lifecycle, public export/declaration parity, WASM fallback and parity, project JSON/ZIP validation, server/protocol contracts, example builds, package-consumer smoke tests, and measured benchmark gates. |

## UI Stories

Reusable UI components use [packages/ui/user-stories.md](../packages/ui/user-stories.md)
as the consumer-story inventory. First-party applications use their product story
documents instead of duplicating app workflows in the shared package.

## Drift Control

A package change that alters public behavior should update:

- the nearest package README;
- this guide when the verification strategy changes;
- the owning user-story document for reusable or first-party UI behavior;
- `docs/architecture.md` or `docs/distribution.md` when ownership or release shape
  changes.

Related: [Documentation Governance](documentation-governance.md), [Repository Code
Style](code-style.md), and [Architecture](architecture.md).
