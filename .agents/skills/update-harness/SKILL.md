---
name: update-harness
description: Apply Harness runtime, protocol, UI, build, and coverage contracts when changing apps/harness or Harness behavior in shared packages and docs.
---

# Update Harness

Read `apps/harness/README.md` and `apps/harness/agents.md` for the owning product.
Choose only the reference needed by the change:

- [Runtime architecture](references/runtime-architecture.md): provider boundaries,
  typed run budgets, finalization, concurrency, and BranchFS ownership.
- [TypeScript and build](references/typescript-build.md): build/watch integration
  and the production-bundling test boundary.
- [UI](references/ui.md): Harness composition, hotkeys, times and errors; use
  `app-ui-standard` for shared design decisions.
- [Testing and coverage](references/testing-docs-coverage.md): validation selection
  and story/coverage changes.
- [General conventions](references/general-conventions.md): local naming and
  documentation ownership when those are the subject of the edit.

Use judgment within these contracts and complete authorized implementation and
validation. Ordinary changes do not require a separate product audit, research
phase, or approval checkpoint. Keep new constraints with their narrowest owner.