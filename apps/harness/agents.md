# Harness contributor guidance

The root [repository guidance](../../AGENTS.md) applies to all harness work. Use the
root `update-harness` skill for task-specific runtime, TypeScript, UI, and coverage
routes; load only the reference branches needed for the edit.

- Keep runtime and persistence in `apps/harness/cli`, portable contracts in
  `packages/ai-core`, and reusable presentation in `packages/ui`.
- Validate external, websocket, persisted, and model-produced data at a typed boundary.
- Preserve local persistence, execution-mode approval gates, recovery, and visible
  capability limits. Plan mode requires approval; do not impose that gate on
  ordinary authorized implement-mode work.
- For UI work, also read [DESIGN.md](../../DESIGN.md) and use `app-ui-standard`.
  AI preference ownership, task-derived design context, and concise handoffs route through the
  [UI workflow](../../docs/design-system/agent-workflow.md).
- For existing settings, job, or assistant surfaces, search the
  [Harness design evidence](../../docs/design-system/harness-debt.md) for the affected
  interaction; batch handoffs are evidence, not mandatory reading for every edit.
- Shipped behavior is documented in [the harness README](README.md). Product stories,
  coverage, audits, and roadmap evidence route through
  [docs/harness/README.md](../../docs/harness/README.md).
- Files under `.agents/skills` are portable launcher assets. Keep them generic and
  self-contained; repository-only contribution workflows belong in root `.agents/skills`.
- `runtime-agents.md` is copied into releases as `agents.md`. It is a product asset,
  not an additional source-contributor instruction file.
