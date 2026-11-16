# Full-product campaign acceptance

Use for a requested ambitious/full-product audit campaign. This strict profile
binds outcomes to a frozen mission and independent artifact review; it is not a
prerequisite for ordinary implementation or exploratory user journeys.

## Freeze before authoring

Derive audience, aesthetic direction, journey and delivery from the brief and
approved examples. Ask about material unresolved subjective choices before
dependent authoring; continue independent technical work. Preserve approved
reusable choices in their owning reference with scope and evidence.

Run:

```text
bun .agents/skills/user-audit/scripts/freeze-ambitious-mission.ts brief.json new-contract.json
```

The brief requires `mission`, canonical `medium`, `minimumPassingScore`,
`criteria`, `hardGates`, `audience`, `aesthetic`, `journey`, `delivery`,
`storyIds`, and the `persona`, `evidenceKind`, `verificationChecks` fields in
[evidence reconciliation](evidence-reconciliation.md). The helper checks story
owners and required gates, hashes the contract, and refuses overwrite. A later
normalization must preserve the original and identify its date; a hash alone
does not prove a pre-authoring freeze.

This profile requires at least 90/100 overall, each criterion at least 80, all
hard gates, and independent criticism. Higher requested thresholds prevail.
If the task uses another acceptance profile, report it under its own criteria;
do not claim this gate passed or silently relax a frozen campaign.

For multi-run campaigns, allocate requested mission families before scaling.
Compare the first completed artifact in each family with its frozen requirements;
do not multiply a weak template to meet a run count. Seeds, titles, palettes,
or numeric tuning alone do not establish distinct authorship.

## Verify the delivered result

Run `scripts/check-ambitious-release.ts` against the review JSON. It verifies
artifact/contract identity, frozen criteria/weights/gates, evidence references,
and reconciled execution. Common gates are `mission-complete`, `distinct-authorship`,
`core-workflow`, `revision-recovery`, `artifact-review`, and `delivery`;
`--help` lists medium gates. Scores not assessed stay null. No script verifies
taste or the truth of critic claims.

Have an independent critic inspect the actual artifact and retain its hash.
For multi-file releases, hash the complete delivered archive, not just entry HTML.
Absent independent review means unverified acceptance, not permission to invent
scores. Apply only the creative criteria selected for the frozen brief.

Use playable/watchable/listenable or runnable outputs appropriate to the requested
medium. A command receipt, graph screenshot, feature count, input recording, or
successful export cannot substitute for the promised authored result. Label
actual native/host evidence and simulated substitutes accurately. Present launch/
play/listen links before source and raw evidence.

## Verdicts and continuation

Report interaction/regression status, original mission status, and release quality
separately. Partial, blocked, and missing-evidence runs fail acceptance and remain
in the campaign denominator. A narrow repair regression cannot replace the full
mission.

Name the earliest unmet requirement, observed failure, responsible boundary,
attempted supported recovery, and next reproducible action. Missing assets, native
access, or time are not automatically product defects. Audit-only work reports
failure; authorized fixes resume the original mission and recheck the delivered
artifact. Preserve publication and external-action authorization boundaries.