# Package Testing

This guide owns repository-wide library testing expectations for `packages/*`.

## Baseline Commands

From the repository root:

```powershell
bun run typecheck:packages
bun run test:packages
bun run build:packages
```

Use `bun.cmd` instead of `bun` when PowerShell blocks `bun.ps1`.

Package-local commands:

- `bun run --cwd packages/ai-core test`
- `bun run --cwd packages/workspace test`
- `bun run --cwd packages/desktop-runtime test`
- `bun run --cwd packages/ui test`

Engine package commands remain separate because its release gate is broader than
the shared-package baseline:

```powershell
bun run typecheck:engine
bun run test:engine
bun run build:engine
```

Use `bun run --cwd packages/engine check` for release-shape engine changes.

## Coverage Shape

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

## Package Matrix

| Package | Test emphasis |
| --- | --- |
| `@hyperfocus/ai-core` | Zod protocol schemas, command/event unions, capability metadata, client connection lifecycle, reconnect queues, frame bounds, and portable intent contracts. |
| `@hyperfocus/workspace` | Safe relative paths, revision conflicts, atomic multi-file writes, watch sequencing, invalidation, and deterministic memory adapters. |
| `@hyperfocus/desktop-runtime` | Protocol target parsing, browser-backed client leases, shutdown timing, injected update sources, and no implicit install side effects. |
| `@hyperfocus/ui` | Shared primitives, overlay/focus mechanics, workbench panels, preferences, transcript/composer rendering, terminal/source-editor surfaces, StyleX extraction, and accessibility states. |
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
