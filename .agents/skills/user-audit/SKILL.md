---
name: user-audit
description: Simulate replayable users pursuing concrete Hyperfocus product goals and report or fix observed failures. Use for requested user journeys across apps, launchers, or public APIs; not static review or ordinary implementation.
---

# User audit

Give each run one outcome-oriented mission and sampled persona. Derive scope and
acceptance from the request, owning README, story inventory, and approved
decisions. Audit-only work reports findings; a requested fix loop continues
through implementation and replay within that scope.

For review of an existing campaign's claims and producing code, use
[audit-evidence-review](../audit-evidence-review/SKILL.md).

Choose the needed routes:

- [Product missions](references/product-missions.md): surface/coverage selection,
  repository-wide campaigns, code-only users, and live inference.
- [Persona schema](references/persona-schema.md): sampling, replay, or catalog
  maintenance. Generate with `scripts/persona-modifiers.ts --surface <product>
  --goal <outcome> --seed <text> --out <path> --json` using Bun.
- [Rubric](references/rubric.md): judging mission/persona impact and reporting findings.
- [CDP runner](references/cdp-runner.md): browser scenarios and capture limitations.
- [Ambitious product gate](references/ambitious-product-gate.md): a requested
  full-product campaign with frozen release acceptance.
- [Creative release audits](references/creative-release-audits.md): judging an
  authored game, film, music video, or similar delivered artifact.
- [Evidence reconciliation](references/evidence-reconciliation.md): mechanical
  pilot readiness before family fan-out and a full-product release/campaign verdict.

Persist the sampled persona and mission before interaction; do not hand-pick an
easy persona after seeing the product. Use isolated state and native product
entrypoints. Browser/API dispatch is evidence of execution, not goal completion;
inspect resulting state and rendered artifacts. Code-only missions need consumer
commands and outputs, not invented screenshots.

Use configured live inference for AI journeys and retain usage evidence. Keep
credentials out of artifacts. Follow `dev-server` for managed hosting and the
[owned hidden process contract](../../../docs/development.md#process-and-browser-lifecycle)
for browsers and descendants.

For requested fixes, maintain a finding ledger, repair coherent causes through
the owning product workflow, and replay with the original seed. A requested
audit-until-clean loop also needs a fresh-seed pass within the original mission;
keep unresolved findings and acceptance gaps explicit. Do not widen the campaign
or replace its mission with a narrower passing regression.

Report outcome, persona/seed, evidence, findings, coverage, verification, and
remaining limits. Improve audit scripts when a demonstrated missing capability
blocks this mission; preserve a regression before adding durable guidance.
