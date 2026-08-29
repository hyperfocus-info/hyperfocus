# Testing, Docs, And Coverage

Use this when deciding verification scope, updating README/docs, changing user-facing behavior, or touching story/coverage inventory.

## Testing Preferences

- Core functionality updates must be thoroughly covered with both unit tests and integration tests before done.
- LLM/provider structured-output changes must test canonical valid payloads, known alias normalization, unknown invalid values, repair success, repair failure, and persisted canonical output.
- Treat websocket protocol, workspace persistence, planning or run lifecycle, preferences storage, worktree orchestration, and shared UI state or transport logic as core functionality.
- Pure copy, content, or visual-only layout tweaks without behavior change only need unit testing.
- Prefer colocated harness tests next to source files.
- Backend websocket integration tests are authoritative for command, protocol, and run lifecycle behavior.
- Add focused UI or store tests for local branching logic, plus integration tests when behavior crosses component or transport boundaries.

## Verification Commands

- Run focused tests first. For core harness changes, run `bun run test:harness` and
  `bun run typecheck:harness` from the repository root unless blocked.
- If `bun.ps1` is blocked by PowerShell execution policy, use `bun.cmd`.
- Run `bun run build:harness` only when the change meaningfully risks production
  build output or asset delivery behavior.

## Docs

- Keep README updates high-level.
- Prefer linking to durable docs and skill docs over embedding code-heavy explanations.
- Do not turn Markdown files into code mirrors. Keep them focused on concepts, workflows, and links to deeper docs.

## User Stories And Coverage

- Treat `docs/harness/user-stories.md` as the canonical harness behavior inventory.
- A change that adds, removes, or materially alters a capability in
  `apps/harness/README.md` or `docs/harness/todo.md` must update the matching `US-*`
  entry and `docs/harness/coverage-matrix.md` in the same change.
- New `US-*` stories start as `GAP-HIGH` until at least one colocated or integration
  test covers them.
