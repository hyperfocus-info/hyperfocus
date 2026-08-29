# Hyperfocus repository guidance

This file is the root instruction entrypoint. Keep it short: read only this file,
the nearest README, and the task-specific links below before opening broader docs.
Linked documents are routes, not a preload list.

## Decision order

When tradeoffs conflict, prefer:

1. Simplicity: the smallest correct model, API, and dependency graph.
2. Performance: optimize measured bottlenecks without obscuring the baseline.
3. Developer experience: add tooling or convenience after the first two remain clear.

All software must have an easy baseline path and may expose advanced configuration
without making that path harder. Public or user-facing entry functions accept one
plain options object with named fields and defaults. Leaf functions at the bottom of
the call stack do the heavy work with a small positional argument list; do not allocate
options objects in hot inner paths. Keep domain objects intact when splitting them
would make the call less clear.

## Architecture boundary

Keep `packages/engine/` and public engine-facing packages framework-agnostic. They must not
depend on Solid, React, DOM globals, StyleX, or application preferences.

First-party applications live in `apps/*`. Reusable presentation lives in
`packages/ui`; portable AI and workspace contracts live in `packages/ai-core` and
`packages/workspace`. Host apps own privileged runtime adapters and persistence.
See [the architecture map](docs/architecture.md) only when changing a boundary.

## Documentation graph

- Start at [README.md](README.md) for product shape and commands, then use
  [docs/README.md](docs/README.md) to choose one topic.
- Follow [repository code style](docs/code-style.md) for imports, type modeling,
  assertions, composition, classes, and component declaration order.
- Follow [documentation governance](docs/documentation-governance.md) for canonical
  doc ownership, duplicate-doc cleanup, temporary docs, and drift control.
- Use [user story inventories](docs/user-stories.md) for first-party UI surfaces,
  and [package testing](docs/package-testing.md) for shared library verification.
- Read the nearest package or application README before editing that area.
- Keep each fact in one canonical document. Other docs should link to it and add
  only the context needed for their own scope.
- Put concepts, decisions, and navigation in Markdown. Put repeatable procedures in
  scripts, and keep code examples next to the API or workflow that owns them.
- When behavior changes, update its canonical doc and repair inbound or outbound
  links. Do not copy the new explanation into several READMEs.
- New docs need a clear owner, an incoming link from an index or nearby README, and
  a short "Related" route when the next source is not obvious.
- Tracked temporary Markdown files must use the `.tmp.md` suffix.

## Instruction and skill hierarchy

| Scope | Location | Purpose |
| --- | --- | --- |
| Repository | `AGENTS.md`, `.agents/skills/*` | Rules and workflows for changing this monorepo. |
| Engine | `packages/engine/AGENTS.md`, `packages/engine/docs/README.md` | Engine-only performance, portability, and verification guidance. |
| Harness source | `apps/harness/agents.md` | Contributor rules for the harness application. |
| Harness release | `apps/harness/runtime-agents.md`, `apps/harness/.agents/skills/*` | Generic rules and skills copied into the portable launcher. Do not put repository-only policy here. |
| Example project | `packages/engine/examples/*/.agents.md`, `packages/engine/examples/*/.agents/skills/*` | Rules and skills that apply only when that example is the active project. |

Use the narrowest applicable skill. Root skills may route to detailed references;
load only the referenced branch needed for the task. Harness release skills must be
self-contained after packaging. Example skills must not redefine root or engine rules.

Task routes:

- First-party UI: read [DESIGN.md](DESIGN.md), then use `app-ui-standard`.
- First-party goal-driven product audit and fix loops across apps, launchers, and
  public code/API surfaces: use `user-audit`; route resulting implementation through
  the owning product skill and `app-ui-standard` for UI.
- Harness architecture or implementation: use `update-harness`.
- Editor project automation: use `hyperfocus-editor-agent`.
- Branch or commit review: use `analyze-pr`; isolated current-worktree execution:
  use `branchfs`.
- Harness findings and delivery: `correctness-scan` audits,
  `next-gap` closes the top finding, `next-todo` ships the top roadmap item, and
  `market-research` supplies external product evidence.
- Engine work: follow [packages/engine/AGENTS.md](packages/engine/AGENTS.md) and select one topic from
  [packages/engine/docs/README.md](packages/engine/docs/README.md).

The launcher-bundled tree contains user-project workflows, not monorepo policy:
`assistant-actions` and `db-data-harnessing` operate Harness state; `screenshot`,
`ui-audit`, and `improve-ux` cover visual work; progression and asset
utilities support game projects; `caveman*` and `grill-me` are opt-in communication
utilities. Keep overlapping phases explicit in each skill description.

## Working rules

- Explore repository facts before asking the user. Ask only about ambiguity that
  changes the outcome and cannot be resolved locally.
- Prefer targeted `rg` and nearby files. Batch independent reads and do not reread
  material already inspected in the same run.
- Keep source files and declarations within `check:source-structure` limits. Existing
  exceptions may only ratchet downward; do not raise a baseline without documenting
  its owner, boundary, reason, and removal target.
- Preserve unrelated work in a dirty tree. Stop when the requested behavior and
  proportionate verification are complete.
- Repository-owned scripts, including root skill helpers, should be TypeScript and
  run with Bun. Keep launcher-bundled Harness/user-project automation
  self-contained; this repository script policy does not apply to people using the
  packaged Harness.
- Before handoff, check for documentation drift in the touched area and update the
  nearest README, story inventory, coverage matrix, or package testing route when
  behavior or verification changed.
- Use `bun.cmd` when PowerShell blocks `bun.ps1`.
