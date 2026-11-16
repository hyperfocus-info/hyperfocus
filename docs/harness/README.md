# Harness documentation

Load the smallest document that owns the question. The [harness README](../../apps/harness/README.md)
describes shipped behavior and local commands; this folder holds planning, coverage,
audit, and historical evidence. If both files appear to answer the same question,
the app README owns what is shipped and this folder owns product evidence.

## Product truth

- [Remote connections](connections.md) owns provider authorization, durable operations and agent delivery.

- [Roadmap TODOs](todo.md) tracks current bets, sequencing, and deferred work.
- [User stories](user-stories.md) is the canonical shipped and roadmap capability inventory.
- [Coverage matrix](coverage-matrix.md) maps shipped stories to tests and flags gaps.
- [Correctness review](correctness-review.md) records unresolved cross-cutting product risks.
- [Swarm engineering](swarm.md) owns remote coordination, controls, budgets and deployment commands.
- [Swarm campaign repair plan](swarm-campaign-repair-plan.md) owns the October 16 failed-run audit, confirmed requirements and sequenced acceptance gates.

## Research and historical evidence

- [TODO comparison](todo-comparison.md) records roadmap comparison work.
- [First Railway swarm](swarm-live-demonstration.md) records real cloud evidence and incomplete tournament acceptance.
- [Outcome-driven Swarm](swarm-outcome-demonstration.md) records executable investigations, independent gates, native review and bounded live verification.
- [UI/UX deep scan](ui-ux-deep-scan-analysis.md) contains a dated interface audit.
- [Virtual-list implementation notes](virtual-list-implementation-notes.md) preserves focused implementation context.
- [TODO research notes](research/todo-research-notes.md) holds external research evidence behind roadmap decisions.

## Maintenance

- [Documentation governance](../documentation-governance.md) owns duplicate-doc cleanup and drift checks.
- [Repository documentation map](../README.md) routes cross-product questions.

Keep current behavior in the app README and priorities in the roadmap; this index
only routes to their owners.
