# Evidence reconciliation

Use this route before compiling an ambitious release or publishing campaign
findings. The checker distinguishes a complete, honest failure report from an
acceptable release. It does not judge whether a critic's interpretation is true.

## Freeze observable expectations

Sample the persona first. New mission briefs include these fields in addition to
the ambitious mission fields:

- `persona: { path, sha256 }`: the exact sampled manifest, relative to the brief.
  The freeze helper checks its bytes and preserves its path relative to the output.
- `evidenceKind`: `cdp` for a browser journey, `result` for command-only execution.
- `verificationChecks`: nonempty `{ id, kind, expectation }` entries, with at least
  one `journey` and one `domain` check. A journey expectation names the applicable
  create, central revision, rejection/recovery, reopen and delivery outcomes.
  Domain expectations name invariants such as conflict-free reopening or conserved
  inventory. Do not replace these with generic navigation or file-presence checks.

Generate the contract with `scripts/freeze-ambitious-mission.ts`. The required
fields prevent choosing easier checks or dropping persona traits after execution.
Historical contracts remain historical: preserve them and write an explicitly
dated successor brief if repeating the mission. A migration is not proof of a
pre-authoring freeze. Never silently rewrite old contracts or acceptance results.

## Capture the actual delivered version

For a browser run, pass `--artifact`, `--mission-contract` and `--persona` together
to `scripts/run-cdp-audit.ts`. The artifact must be the file actually exercised;
for multi-file releases, use the delivered archive. The runner preserves original
persona bytes and checks file hashes before and after execution. Its `capture`
contains `artifactSha256`, `missionContractSha256`, `personaSha256` and `stable`.
Changed inputs or uncaught exceptions make execution exit nonzero. An exploratory
run without binding flags remains useful evidence but cannot establish acceptance.

The scenario receives `audit.persona`. Translate each reaction into actions and
observable assertions; merely retaining its seed does not exercise it. Match each
download's expected format to its control, parse its contents and check domain
values. A CSV download must not fail because a generic probe waited for JSON.

Command-only producers use `beginAuditCapture(options)` from
`scripts/quality/capture.ts`, then call `finish()` after the owned commands complete.
Write `schema: "user-audit-command-results-v1"`, the returned `capture`, and
`commands` containing `argv`, integer `exitCode` and `expectedExitCode`, boolean
`passed`, `actual` domain values, and a nonempty `expectation`. A string in stdout
or an expected process exit alone is not a domain assertion. Retain diagnostics
alongside these fields. The checker executes no code from evidence files.

## Reconcile findings and coverage

Write a manifest with `schema: "user-audit-verification-v1"`. All file paths below
are relative to this manifest:

| Field | Contents |
| --- | --- |
| `artifact`, `missionContract`, `persona` | `{ path, sha256 }` references |
| `evidence` | `{ id, kind, path, sha256 }`; kind is `cdp`, typed command `result`, or `support` for screenshots/criticism |
| `checks` | Each frozen check's `{ id, status, detail, evidenceIds }` |
| `personaChecks` | Each sampled modifier's `{ id, status, detail, evidenceIds }` |
| `findings` | Open `{ id, severity, detail }` entries; severity is P0–P3 |
| `dispositions` | `{ observationId, findingId }`, or `{ observationId, reason, evidenceIds }` for an explicitly reviewed non-defect |

Check statuses are `passed`, `failed` or `untested`. Untested entries require the
reason in `detail`; assessed entries require known evidence IDs pointing to
execution evidence of the frozen kind, with supporting files
allowed alongside it. Empty browser journeys cannot establish acceptance.
The checker binds
the persona to the frozen contract and execution captures to all three hashes.
Opaque supporting files cannot replace the frozen execution evidence kind.

Run `bun .agents/skills/user-audit/scripts/quality/reconcile.ts verification.json reconciliation.json`.
Its derived observations include every uncaught exception, failed flow action,
dialog failure, command failure and horizontal document overflow over two pixels.
IDs are stable for the hashed evidence: e.g. `browser:exception:0` and
`browser:overflow:3`. An exception before the first flow still receives an ID.
Every observation requires exactly one disposition. A changed evidence file must
be reviewed anew; do not reuse index-based dispositions across versions.

`reportComplete` means findings and coverage have explicit dispositions. It can be
true for a failed product. `acceptanceEligible` additionally requires passing
frozen checks, passing persona reactions and no open findings. Missing check
results, unknown references, changed hashes and undisposed anomalies fail closed.
Derive summaries and severities from this one result rather than maintaining
independent hand-written counts. An explained non-defect remains review evidence,
not a license to dismiss an actual failed workflow.

A campaign inventory proves receipt/identity coverage only. Aggregate completion
requires each explicitly selected attempt's frozen assertions and observed domain
values; a present `outcome.json`, exit zero, caption or free-text `passed` label
cannot substitute. Preserve unsupported historical claims with a correction
ledger instead of rewriting raw results or retroactively freezing new checks.

Compile a campaign with
`bun .agents/skills/user-audit/scripts/quality/campaign.ts campaign.json result.json`.
Each `cohort` entry has `runId`, `personaPath`, and an optional `verification`
path. File paths resolve relative to the campaign. The verification must bind the exact
entry persona file; optional entry `personaId` and `seed` metadata must match it.
Duplicate run, persona or seed identities are rejected. Loose outcome files are
not read. Missing verification stays `unassessed`; explicit verification is
recomputed through the reconciler above.

The mutually exclusive run statuses/counts are `acceptanceEligible`,
`reportComplete` (an honest report with acceptance blockers), `unassessed`, and
`invalid`. The campaign's `reportComplete` boolean requires every run to have a
complete report; its `acceptanceEligible` boolean requires every run eligible.
Invalid evidence exits nonzero. Add `--require-acceptance` to also fail for any
unassessed or blocked run. Historical runs without frozen verification remain
unassessed; do not create retrospective checks to turn their labels green.

Add `verification: "verification.json"` to the independent release review.
`check-ambitious-release.ts` recomputes reconciliation; it does not trust a saved
green result. Scores, medium gates and independent criticism still apply. Use
`score: null` for an unassessed criterion; the aggregate remains null and acceptance
fails, rather than claiming zero artistic quality. These structural checks cannot
detect fabricated observations or replace full playback/listening and domain review.

## Scale and repair

Execution and acceptance are separate. A requested observational audit continues
through its full cohort when a pilot fails or remains unassessed: retain the
failed attempts, record unavailable checks and report actual execution separately
from accepted outcomes. Pilot readiness is not permission to collect observations.
The authoring/release gates below govern repeating an authoring approach or
claiming acceptance; do not use them to stop an authorized diagnostic campaign.

Before repeating an authoring approach, complete and independently inspect its
first full mission in that medium. If it fails, repair or explicitly change the
approach before scaling. Replays preserve the original mission/persona; fresh
discovery uses a new sampled persona. Keep incomplete runs in the denominator.
Measure accepted outcomes and covered domain/journey/persona checks rather than
treating seeds, screenshots or dispatch counts as quality.

Check mechanical readiness with
`bun .agents/skills/user-audit/scripts/quality/preflight.ts campaign.json preflight.json`
before a planned family loop. Use the same campaign representation as above:
each cohort entry adds `missionFamily`, and `missionFamilies` declares
`{ id, pilotRunId, artifact: { path, sha256 } }` per family. The pilot is an
explicitly selected cohort member with a `verification` path. Paths resolve
relative to the campaign. Every member must retain the pilot's exact frozen
surface and goal; split different goals into different families.

The preflight recomputes pilot reconciliation, target artifact bytes and scope.
Missing, blocked, stale or differently scoped pilot evidence prevents strict
fan-out. Changing the target artifact requires a new applicable pilot and
preflight. `fanoutEligible` means the mechanical checks passed; it does not prove
independent semantic/human inspection, every planned persona reaction, or
whole-cohort acceptance. The actual first-mission inspection above still applies.

`--exploratory` produces an explicit gap report without granting family fan-out
or acceptance. It permits inspection when a pilot or target is not ready; invalid
supplied evidence still exits nonzero. Use strict mode before a repeated loop.
Historical campaigns stay historical; do not retrofit a family/pilot selection
to turn their existing labels into accepted runs.

Verification: `bun test ./.agents/skills/user-audit/scripts`; additionally run a
real bound browser or command smoke when changing capture or reconciliation.
