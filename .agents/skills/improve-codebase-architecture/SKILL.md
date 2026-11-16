---
name: improve-codebase-architecture
description: Investigate or implement a requested refactor of coupled module boundaries. Use for architectural friction and boundary redesign, not automatic cleanup during unrelated feature work.
---

# Improve architecture

Trace actual callers, shared types, ownership, and failure boundaries in the
requested area. Identify the concrete complexity callers must understand and the
cost it creates. File count or similar-looking code alone does not justify
consolidation.

Challenge whether the proposed boundary already exists in the current tree.
Use `bun run inspect:impact --summary --path <owner-file>` for candidate callers, then trace
real execution/public imports. Predeclare the removed caller burden and a
compatibility oracle independent of the replacement implementation. Distinguish
dirty-tree evidence from shipped behavior.

New shared infrastructure needs named real consumers, a recurring defect/manual
workflow, or a measured bottleneck. During SHIP work, refactor only for a
demonstrated release blocker; defer unrelated opportunities to the owning TODO.

Discovery requests end with evidence and ranked candidates. Implementation
requests continue through the selected change and boundary verification without
a separate plan approval. Compare materially different interfaces only when the
tradeoff matters; routine refactors need no design tournament.

For substantial proposals, read [boundary decisions](REFERENCE.md). Prefer the
smallest correct interface and dependency graph, preserve domain objects, and
follow repository public-options conventions. Reuse tests that still protect real
behavior; replacing an owner does not automatically make its coverage obsolete.

Verify affected consumers and the changed failure contract. Report compatibility
limits. Publish an issue only when requested or already authorized.
