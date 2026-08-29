---
name: update-harness
description: Harness-specific engineering routes for runtime, build, TypeScript, UI, and coverage work. Use when changing `apps/harness`, harness behavior in shared packages, or `docs/harness`; do not use for unrelated engine or editor work.
---

# Update Harness

Use this file only to choose references. Root `AGENTS.md` and
`apps/harness/agents.md` own shared contributor policy.

## Scope

- Use for `apps/harness/**`, harness contracts under `packages/ai-core`, reusable
  harness presentation under `packages/ui`, `docs/harness/**`, and harness-facing
  root build configuration.

## Loading Rule

- Load the smallest reference set that can safely guide the edit.
- Do not read every reference by default.
- Put new harness rules in the most specific owning reference file, not here.

## Reference Index

Read only the relevant file(s):

- `references/general-conventions.md`: harness shape, naming, and documentation ownership.
- `references/runtime-architecture.md`: backend runtime, websocket bridge, zod/provider boundaries, run lifecycle, BranchFS/subagents, server completion.
- `references/typescript-build.md`: TypeScript style, Bun runtime/build command preferences, scripts, automation glue.
- `references/ui.md`: harness-specific Solid/StyleX composition, shared UI ownership, hotkeys, and errors. Also use `app-ui-standard`.
- `references/testing-docs-coverage.md`: test expectations, verification commands, README/docs, user stories, coverage matrix.
