# BranchFS testing and contribution

Read this when adding a BranchFS caller or changing its implementation.

## Tests

For orchestration code, inject the narrowest interface the caller needs, such as
`prepareExperimentLease`, `readInspection`, and `discardExperiment`. Use a fake in
unit tests; do not construct a complete lease when only the mount path matters.

Use the real manager only for behavior that depends on actual materialization,
dirty seeding, diff inspection, deletion propagation, flush, or cleanup. Follow the
scratch-repository pattern in
`apps/harness/cli/src/branchfs-manager.test.ts`.

## Product integration

A new package script or user-visible BranchFS capability is harness product behavior.
Update the matching `US-*` item in `docs/harness/user-stories.md`, its row in
`docs/harness/coverage-matrix.md`, and `apps/harness/README.md` when the visible
capability changes. Skill-only workflow edits do not require those product updates.

Useful source examples:

- `apps/harness/cli/src/server.ts`: websocket-driven experiment lifecycle;
- `apps/harness/scripts/screenshot.ts`: one-shot server, readiness, capture, and cleanup;
- `apps/harness/cli/src/branchfs-manager.test.ts`: real integration fixture.
