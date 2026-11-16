---
name: ship-readiness
description: Prepare a named Hyperfocus release candidate and prove its delivery acceptance. Use for release preparation or promotion of a proven experiment to SHIP; ordinary edits use the owning product workflow.
---

# Ship readiness

Read [Shipping](../../../docs/shipping.md) and the owning README/release workflow.
Identify the agreed product, user outcome, candidate, platform, and acceptance
boundary from the request or existing plan. An unproved proposition remains an
experiment; do not invent a release program around it.

Inspect `bun run ship-check --list`, then `bun run ship-check <target> --plan`.
Implement authorized fixes and local packaging, run targeted checks, then the
selected release gate. Unsupported experiments use native checks; a new profile
needs a real supported release target and owner.

Exercise the actual installed, extracted, or deployed candidate outside the
checkout: first use, its critical journey, and relevant failure/recovery.

For Website/Books/Trade delivery, use the owning CLI and
`@hyperfocus/website-host/delivery`. Retain the upload's exact deployment ID;
never substitute the latest deployment. Bind passing reports to `artifactSha256`
and aggregate them with `scripts/shipping/acceptance.ts`. A provider SUCCESS
status is separate from public-byte, user-journey and human-quality acceptance.
Bind evidence to that candidate. Passing automated checks or a development server
does not establish artifact acceptance. Use `user-audit` only when simulated-user
QA is needed or requested.

For JSON gates, assert the reported status as well as exit code: a successful
`--plan` invocation is still only a plan.

Keep work inside the agreed delivery boundary. Defer unrelated architecture to
the owning TODO, and reconcile setup/release docs with observed commands. Preserve
reproductions for recurring failures before adding new rules.

Release preparation authorizes implementation, tests, local packaging, and docs.
Publishing, deployment, and external messages require authorization for those
actions; honor it when already given.

Report candidate identity, checks, artifact/journey evidence, remaining blockers,
and publication state. Stop when the agreed acceptance is demonstrated or an
external blocker prevents further useful progress.
