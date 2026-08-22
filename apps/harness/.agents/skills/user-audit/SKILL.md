---
name: user-audit
description: Run deep screenshot-backed user-flow audits across computer-skill and AI-familiarity levels, using real app interactions or safe isolated APIs. Use when asked to mimic users, execute multi-step UX flows, collect CDP evidence, find product gaps, or validate UX fixes.
---

# User Audit

Audit the real running product, not static components. Produce evidence that another engineer can replay.

## Operating contract

1. Read `references/rubric.md` before planning the audit.
2. Inspect repository scripts, routes, fixtures, persistence, and existing browser tests before inventing setup.
3. Build or start the app with its native commands. Use isolated test state; never point mutation-heavy flows at normal user data.
4. Prefer the product-native collaborative browser. When unavailable, use `scripts/run-cdp-audit.mjs` with a scenario module.
5. Exercise at least the requested number of sequential scenarios. Vary both computer skill and AI familiarity independently.
6. Use real UI interactions and safe application APIs. Avoid external model cost or irreversible operations unless the user explicitly includes them.
7. Capture every important state, console errors, DOM text, accessible names, viewport overflow, and action failures.
8. Inspect screenshots visually. Do not judge visual quality from DOM text alone.
9. Trace severe or trust-breaking findings into source when possible. Mark facts as observed and causes as confirmed or inferred.
10. Write findings first, ordered P0 through P3. Include persona impact, evidence, fix direction, positives, and residual unknowns.

## Self-maintenance

Treat automation as part of the deliverable.

- Before each audit, run the runner with `--help` and inspect whether it supports the required actions and evidence.
- If a reusable action, measurement, browser fallback, or report field is missing, update `scripts/run-cdp-audit.mjs` during the audit and validate it.
- Create or update a scenario module when app navigation changes. Keep app-specific fixtures outside the skill unless this skill lives inside that app repository and the recipe is broadly reusable there.
- After an audit, update `references/rubric.md` only for durable new acceptance criteria. Do not accumulate one-off defects or product-specific conclusions.
- Validate every changed skill with the skill validator and execute changed scripts against `--help` plus one real smoke scenario.

## CDP runner

Scenario modules export an async `run(audit)` function. The `audit` object provides:

- `flow(metadata, action)`: execute one scenario and capture screenshot/state.
- `clickSelector`, `clickAria`, `clickText`, `typeInto`, `press`, `setViewport`.
- `evaluate`, `waitFor`, and `sleep` for app-specific state setup.

The runner exits nonzero when a recorded action returns `ok: false`, so scenario navigation drift cannot silently pass.

Run:

```text
bun .agents/skills/user-audit/scripts/run-cdp-audit.mjs --base-url http://localhost:8791 --scenario .local/user-audit/scenario.mjs
```

Use `.local/screenshots/user-audit-*` for generated evidence unless the user chooses another destination.

## Completion

Return the audit artifact path, screenshot/result paths, coverage summary, highest-severity gaps, validation performed, and residual unknowns. If fixes were requested, rerun affected flows and compare before/after evidence.
