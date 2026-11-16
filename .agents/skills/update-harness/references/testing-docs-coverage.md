# Harness validation and coverage

Choose checks for the changed contract. Backend websocket integration tests own
command, protocol, and run lifecycle behavior; UI/store tests own local branching.
A cross-layer failure needs a regression through that boundary, not both unit and
integration tests by default. Copy or layout-only changes do not require new unit
tests; visual behavior needs proportionate browser evidence.

Provider structured-output changes need canonical payload, known alias,
unknown invalid value, repair success/failure, and persisted-output cases relevant
to the change. Use file-backed persistence/reopen evidence for durable-state bugs.

Run focused checks first. Use `bun run typecheck:harness` for changed TypeScript
contracts and `bun run test:harness` when shared runtime/protocol impact reaches
beyond a bounded test set. Follow the owning release gate for a release. Build
with `bun run build:harness` when production bundling, deployment, compilation,
or asset delivery changes; it is not a routine prerequisite.

`docs/harness/user-stories.md` owns behavior inventory;
`docs/harness/coverage-matrix.md` owns evidence mapping. Update affected rows when
a capability or its verification materially changes. New stories remain
`GAP-HIGH` until covered. README changes describe shipped behavior, while proposals
stay in the roadmap. Skill-only edits do not change product coverage.