---
name: user-audit
description: Run and iterate on goal-driven, evidence-backed first-party Hyperfocus product audits using randomized, replayable simulated-user traits. Use when asked to mimic users across an app, code/API surface, launcher, or repository-wide product journey; do not use for static review without a simulated user goal.
---

# User Audit

Audit the real product, not isolated components. Produce evidence that another engineer can replay. This is a root repository contribution workflow; it is not a portable launcher skill.

## Operating contract

1. Read `references/rubric.md`, `references/persona-schema.md`, and `references/product-missions.md` before planning the audit.
2. Discover the requested first-party product surface and its owning instructions rather than assuming Harness. For a repository-wide or all-app audit, inventory every current surface from workspace manifests, application directories, release entrypoints, and product documentation so future apps are included.
3. Resolve the documentation-backed coverage route before choosing flows. UI audits start at `docs/user-stories.md`, then read the owning story document and coverage owner. Package, code/API, CLI, and shared UI audits read `docs/package-testing.md` plus the nearest package README.
4. Give each simulated user one concrete product mission with an artifact or observable outcome. Navigation alone is not a mission.
5. Inspect repository scripts, routes, fixtures, persistence, and existing tests before inventing setup.
6. Build or start the product with its native commands. Use isolated test state; never point mutation-heavy flows at normal user data.
7. Prefer the product-native collaborative browser for interactive surfaces. When unavailable, use `scripts/run-cdp-audit.ts`. For code/API-only surfaces, use a disposable consumer project and capture commands, source, diagnostics, tests, and runtime output instead of fabricating browser evidence.
8. Generate each simulated user through `scripts/persona-modifiers.ts`, passing `--surface` and `--goal`. Use the random modifier count unless the user supplies a count, and record the seed. Do not hand-pick an easy persona after seeing the product.
9. Exercise the mission sequentially through its applicable create, revise, recover, and completion states. The sampler always includes randomized computer-skill and AI-familiarity modifiers.
10. Use real interactions and safe application APIs. When the mission queries AI, follow the live-inference policy in `references/product-missions.md`.
11. Capture the important product state, persona, mission, actions, failures, generated artifact, and proof that the goal did or did not succeed. Inspect visual evidence whenever the surface renders visuals.
12. Trace severe or trust-breaking findings into source when possible. Mark facts as observed and causes as confirmed or inferred.
13. Write findings first, ordered P0 through P3. Include mission impact, persona impact, evidence, fix direction, positives, residual unknowns, covered story IDs, and covered package-testing expectations.

## Persona modifiers

The canonical dictionary is `references/persona-modifiers.json`. It contains exactly 1,000 stable entries generated from 100 behavioral traits in 10 situational contexts. Never load the whole JSON into the model context; use the sampler or targeted `rg`.

```text
bun .agents/skills/user-audit/scripts/persona-modifiers.ts --surface <product> --goal <outcome> --seed <text> --out .local/user-audit/persona-run.json --json
```

- The default count is randomly chosen from 3 through 8 for each generated user. Override it with equal `--min-modifiers` and `--max-modifiers` only when the request requires a fixed count.
- Reuse a seed for before/after verification. Use a fresh seed for the next discovery pass.
- Use one persona per audit runner invocation. Run additional seeded invocations when the audit needs multiple simulated users.
- Treat modifiers as reaction lenses, not stereotypes or fictional biography. When modifiers pull in different directions, test the intersection.
- The sampler permits only one entry per exclusive behavioral axis, so a persona cannot be both blind and low-vision or both guidance-seeking and guidance-averse.
- Keep one mission per persona run. A repository-wide audit uses separate evidence bundles for each product surface and mission.

## Self-maintenance

Treat automation as part of the deliverable.

- Before each audit, run the runner with `--help` and inspect whether it supports the required actions and evidence.
- If a reusable action, measurement, browser fallback, or report field is missing, update `scripts/run-cdp-audit.ts` during the audit and validate it.
- Create or update a scenario module when app navigation changes. Keep app-specific fixtures outside the skill unless this skill lives inside that app repository and the recipe is broadly reusable there.
- After an audit, update `references/rubric.md` only for durable new acceptance criteria. Do not accumulate one-off defects or product-specific conclusions.
- When changing the catalog sources, regenerate it with `scripts/generate-persona-modifiers.ts`, rerun that script with `--check`, then run `scripts/validate-persona-modifiers.ts`.
- Validate every changed skill with the skill validator and execute changed scripts against `--help` plus one real smoke scenario.

## CDP runner

Scenario modules export an async `run(audit)` function. The `audit` object provides:

- `flow(metadata, action)`: execute one scenario and capture screenshot/state.
- `clickSelector`, `clickAria`, `clickText`, `typeInto`, `selectOption`, `press`, `setViewport`.
- `evaluate`, `waitFor`, and `sleep` for app-specific state setup.

The runner exits nonzero when a recorded action returns `ok: false`, so scenario navigation drift cannot silently pass.

Run:

```text
bun .agents/skills/user-audit/scripts/run-cdp-audit.ts --base-url http://localhost:8791 --scenario .local/user-audit/scenario.ts --surface <product> --goal <outcome> --seed <text>
```

Use `.local/screenshots/user-audit-*` for generated evidence unless the user chooses another destination.

## Fix loop

When the user requests fixes, maintain a finding ledger and repeat this sequence:

1. Run a fresh-seed discovery audit and record its persona and mission manifest before interaction.
2. Fix every actionable finding in the smallest coherent batches. Route implementation through the owning application or engine skill; use `app-ui-standard` for first-party UI.
3. Replay the affected flow with its original seed and compare evidence.
4. Run the full audit again with a fresh seed. If it finds an actionable issue, add it to the ledger and continue.
5. Stop only after a subsequent fresh-seed audit reports no actionable findings and all earlier ledger entries have passing verification.

One random clean pass is the required stop condition, not proof that all possible modifier combinations are flawless. Report untested risk honestly.

## Completion

Return the audited surface, mission and outcome, artifact path, persona seed and manifest, visual/result paths where applicable, live-inference configuration and usage, covered story IDs, package-testing expectations exercised, untested story or package gaps, closed finding ledger, validation performed, clean follow-up evidence, and residual unknowns.
