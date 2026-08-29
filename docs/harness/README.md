# Harness documentation

Load the smallest document that owns the question. The [harness README](../../apps/harness/README.md)
describes shipped behavior and local commands; this folder holds planning, coverage,
audit, and historical evidence. If both files appear to answer the same question,
the app README owns what is shipped and this folder owns product evidence.

## Product truth

- [Roadmap TODOs](todo.md) tracks current bets, sequencing, and deferred work.
- [User stories](user-stories.md) is the canonical shipped and roadmap capability inventory.
- [Coverage matrix](coverage-matrix.md) maps shipped stories to tests and flags gaps.
- [Correctness review](correctness-review.md) records unresolved cross-cutting product risks.

## Research and historical evidence

- [TODO comparison](todo-comparison.md) records roadmap comparison work.
- [UI/UX deep scan](ui-ux-deep-scan-analysis.md) contains a dated interface audit.
- [Virtual-list implementation notes](virtual-list-implementation-notes.md) preserves focused implementation context.
- [TODO research notes](research/todo-research-notes.md) holds external research evidence behind roadmap decisions.

## Maintenance
- Current roadmap emphasis, in priority order: stronger activation repair loops, stronger trust and review controls, tighter daily coding flow, governed project-note and playbook portability, resilient provider portability, budget-aware long runs with visible progress, deeper remote-target and away-from-desk review follow-through beyond shipped local background jobs, disposable experiment branches for risky work, and cleaner thread retrieval and cleanup for long-lived projects.
- Root [documentation map](../README.md) covers repository-wide routes.
- Root [documentation governance](../documentation-governance.md) covers duplicate-doc cleanup and drift checks.
- Current shipped runtime shape now includes SDK and CLI-backed agent paths, with harness-owned session continuity and health-aware live terminal support.
- Activation now ships as bootstrap, doctor, portable launcher packaging, an in-chat checklist, and guided help tutorials. `todo.md` focuses on narrower repair and packaging follow-up instead of first-pass onboarding delivery.
- Dense surfaces stay tight by default. Extra cockpit chrome should only ship when it unlocks otherwise hidden workflow value.
- Current chat composer state is browser-global for normal project chat. Future roadmap work should only add narrower thread- or project-scoped presets when that scoping is explicit and inspectable.

Keep docs in this folder conceptual. Prefer linking to deeper references instead of embedding implementation detail.
