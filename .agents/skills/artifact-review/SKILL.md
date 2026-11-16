---
name: artifact-review
description: Present generated media or text for versioned human grading and revise it from saved feedback. Use for an artifact review queue or taste calibration, not ordinary product verification.
---

# Artifact review

Use [the review-store contract](../../../packages/review-store/README.md) for
immutable assets and append-only feedback. Read
[hosting and revision](references/review-workflow.md) when creating a queue,
serving it, or applying saved feedback.

Each reviewed item keeps a stable identity, explicit asset version and SHA-256.
Changed bytes create a new version with empty feedback; earlier reviews stay
attached to their exact bytes. SQLite is authoritative. Missing ratings remain
unscored, and an open review server does not mean the owner approved an artifact.

Before revising, inspect saved notes and approved examples. Preserve positive
decisions as well as requested changes. Promote reusable feedback through
[the owning decision rule](../../../docs/documentation-governance.md#subjective-decisions)
with its source version and scope, not a new preference database. An older scoped
approval outranks an unapproved new candidate; automated QA is not owner taste.

Generation stays in the owning tool. Human review is necessary only when the task
depends on unknown taste or explicitly requests grading; it is not a new gate for
every local implementation. Positive grades do not authorize publication.
