# Hyperfocus

Local-first Bun/TypeScript monorepo: `apps/*` owns the editor, Harness, PadPilot
(including C++/CMake), and marketplace; `packages/*` owns reusable contracts and
runtimes. Engine examples and `spikes/` are bounded experiments.

## Global invariants

- Keep the engine and public engine-facing packages framework-agnostic: no Solid,
  React, DOM globals, StyleX, or app preferences. `packages/ui` owns reusable
  presentation; hosts own privileged adapters, credentials, and persistence.
- Prefer simplicity, then measured performance, then tooling convenience. Extract
  shared infrastructure for named real consumers, a recurring failure/manual
  workflow, or a measured bottleneck.
- Select storage and transport codecs using [serialization guidance](docs/serialization.md).
  Prefer measured protobuf benefits; preserve specialized binary paths and require A/B evidence before migrations.
- Keep docs simple and concise. State each rule or decision once in its owning
  document and link to it. Split substantial, distinct topics when needed; keep
  the entrypoint short and move run history out of current instructions.
- Preserve unrelated work in a dirty tree. Local implementation, disposable-fixture
  tests, inspection, and repairs caused by the change are authorized parts of the
  task; continue through relevant verification without requesting each next step.
- Put temporary artifacts (albums, captures, review packets, audit runs and scratch
  files) in the nearest `.local/` directory. Temporary prose ends in `.tmp.md` and
  names its owner and pruning condition; promote durable decisions before pruning.
- Before writing a helper in `.local/`, search existing skills, scripts and package
  utilities. Extend their owning implementation for reusable functionality; keep
  only run inputs, outputs and truly one-off probes local. Do not maintain parallel
  temporary implementations of repository tools.
- Publication, deployment, destructive data changes, credential changes, and
  production operations need authorization covering that action. Existing
  authorization persists; preparing a candidate is not permission to publish it.
- Background processes must create no visible terminal windows. Use
  `@hyperfocus/desktop-runtime/process` and owned headless `/automation` browsers;
  retain cleanup ownership. Process changes use [lifecycle guidance](docs/development.md#process-and-browser-lifecycle)
  and `bun run check:process-policy`.
- User preference (2026-10-17): local development-server restarts are authorized
  without another permission request. Use the managed supervisor and hidden
  processes. Task-specific file-only or workload-protection constraints still
  take precedence; this permission does not authorize interrupting games or
  starting local tests, builds or benchmarks during such a task.

## Find the owner

Load guidance for the actual task, not every linked document. The nearest README
owns local commands and behavior; search its relevant section. Scoped `AGENTS.md`
files add local constraints. [README.md](README.md) maps products;
[docs/README.md](docs/README.md) maps topics.

| Task | Route |
| --- | --- |
| Code conventions | [Code style](docs/code-style.md); existing style/source-structure baselines may only ratchet down |
| Package boundaries or extraction | [Architecture](docs/architecture.md); [package testing](docs/package-testing.md) for affected public contracts |
| Serialization, persistence or transport | [Codec selection, compatibility and A/B evidence](docs/serialization.md) |
| First-party UI | [app-ui-standard](.agents/skills/app-ui-standard/SKILL.md); [DESIGN.md](DESIGN.md) owns contracts and `packages/ui` owns controls |
| Engine | [Engine guidance](packages/engine/AGENTS.md) |
| Game visual assets / reference-driven 3D reconstruction | [game-art-direction](.agents/skills/game-art-direction/SKILL.md); use approved references, measured geometry constraints and scoped locks |
| Editor implementation / project automation | [Editor guidance](apps/engine-editor/AGENTS.md) / [hyperfocus-editor-agent](.agents/skills/hyperfocus-editor-agent/SKILL.md) |
| Harness source | [Contributor guidance](apps/harness/agents.md); [update-harness](.agents/skills/update-harness/SKILL.md) for engineering routes |
| Remote engineering swarms / candidate comparisons | [swarm-engineering](.agents/skills/swarm-engineering/SKILL.md) and [swarm contracts](docs/harness/swarm.md) |
| PadPilot / marketplace | [Plugin guidance](apps/pad-pilot/AGENTS.md) / [service guidance](apps/pad-pilot-marketplace/AGENTS.md) |
| Run an app or inspect runtime errors | [dev-server](.agents/skills/dev-server/SKILL.md); use the managed server's returned URL |
| Release candidate | [ship-readiness](.agents/skills/ship-readiness/SKILL.md) and its selected product gate |
| Docs, rules, or skills | [Documentation governance](docs/documentation-governance.md) |

Other skills are selected by their descriptions: audits, queue delivery, and style
modes are specialized tasks, not prerequisites for ordinary edits. Root skills
govern this repository. `apps/harness/runtime-agents.md` and its `.agents/` tree
ship to user projects and must work without this monorepo. Example skills apply
only to their example.

## Finish at the task's boundary

For substantial work, keep request, intent, outcome, experience, evidence,
constraints and budget distinct in the existing task/plan. Use
[outcome engineering](docs/agent-outcomes.md) for the compact contract, boundary
decisions and required executive summary. Trivial edits need no form. Choose the
smallest effective intervention; a tractable subproblem must not replace the goal.
Start from the strongest relevant prior result and its known failures; use the
owning implementation and evidence rather than restarting from a generic template.
The same execution rules apply in every agent host. Outside Harness, run substantial
bounded work through `bun run inspect:outcome --execute <task.json> '--' <command> [args...]`:
the [shared boundary](docs/agent-outcomes.md#one-execution-path-for-every-agent) runs
prerequisites, work and acceptance together. Do not manually skip steps or substitute
a successful subprocess for acceptance. Trivial edits and read-only discovery need no wrapper.

Scale verification to what changed. A tiny fix needs focused evidence. A changed
user flow needs the running result inspected and exercised, defects repaired, and
affected checks rerun. Architecture work must demonstrate real consumer use.
Release work must verify the delivered artifact and its acceptance conditions;
tests alone are not publication. Keep experiments local until delivery is the task.
Keep technical verification, outcome verification and human/domain acceptance
distinct. Report missing evidence; child completion is evidence, not parent success.

Use `bun run inspect:impact --summary --path <file>` for validation candidates and
`bun run inspect:project --root <directory>` for declared tasks. `bun run check`
is the broad repository gate; `bun run ship-check --list` and
`bun run ship-check <target> --plan` expose release gates. Use `bun.cmd` when
PowerShell blocks `bun.ps1`.

Reuse approved examples before asking for consequential taste decisions; keep
approval and reusable learning with the [owning decision](docs/documentation-governance.md#subjective-decisions).
Promote recurring failures into code or regression checks before adding prose.
At delegation, expensive execution, repeated repair and completion, decide whether
evidence supports continuing, redirecting, stopping or escalating within scope.
