# Shipping

This guide owns the repository's delivery workflow. Product READMEs own setup and
usage; [distribution](distribution.md) owns artifact routes. Use the
[ship-readiness skill](../.agents/skills/ship-readiness/SKILL.md) for release preparation.

## Choose the working phase

**EXPLORE** answers one uncertain question. State the proposition and the smallest
observable result that would support or falsify it. Keep code local, use targeted
checks, and prefer disposable fixtures. Examples and `spikes/` do not need a release
profile merely to exist. Do not add production infrastructure before it has a job.

**SHIP** begins when the central proposition works and the task is delivery. Name
one product/feature, intended user, artifact or deployment target, critical journey,
and evidence that will establish completion. Put this small scope statement in the
existing task or owning TODO, not a new tracking system. Finish one release slice.

New architecture ideas discovered during SHIP become follow-up work unless a
reproduction shows they block that slice. An explicit user change of direction
can change scope. Do not broaden acceptance to every possible future use, or lower
it to whatever happened to pass. Stop when the named outcome is demonstrated and
remaining uncertainty is stated.

## Run the existing gates

```powershell
bun run ship-check --list
bun run ship-check editor --plan
bun run ship-check editor
bun run ship-check marketplace --json
```

Use `bun.cmd` if PowerShell blocks `bun.ps1`. Run `bun install --frozen-lockfile`
when reproducing setup in a fresh checkout. The gate does not install tools,
publish, deploy, copy a plugin into a DAW, or change project scope.

Targets are `packages`, `engine`, `editor`, `harness`, `pad-pilot`, and `marketplace`.
The executable [profiles](../scripts/shipping/profiles.ts) own their ordered command
lists; `--plan` shows those lists without running them. Profiles reuse each
product's build/runtime model: the marketplace builds and smokes its production
Bun artifact, while PadPilot needs native Windows tools and validators.
Shared package changes also need verification in their affected application consumers.

The gate validates command and documentation routes, runs mandatory checks in
order, stops on the first failure, and marks later checks skipped. JSON output
records the result and timing of each step; command logs go to stderr. Unknown
targets and flags fail before execution. There is no skip option that turns an
incomplete run green.

- `planned` means no validation ran.
- `failed` means the automated gate did not complete successfully; the process
  exits nonzero. Correct the failure or report it with evidence.
- `automated-checks-passed` means the listed commands passed for the current tree
  and environment. It does **not** mean published, deployment-ready, or independently
  accepted. Read `remainingAcceptance` and the product release route.

`check:release-readiness` remains the narrower version/layout policy used by these
profiles. Workspace `directory/*` discovery excludes hidden cache directories;
ordinary workspace directories still require valid manifests, and symbolic links
remain rejected, including hidden links. `bun run check` remains the broad repository gate. Run proportionate
targeted checks while editing; use the release target for delivery work and broader
checks when shared boundaries change. Do not restart an expensive unchanged gate
without a new failure, changed input, or unresolved concern.

The [repository CI lane](../.github/workflows/repository-checks.yml) runs these
tools' regression tests and repository policies on pull requests, pushes to main,
and manual runs. Tagged release jobs also enforce source/style policies before
publication, so passing artifact smoke cannot bypass known repository regressions.
Release candidates also check version alignment; editor builds run editor and
engine tests. Host-specific and artifact gates retain their product ownership.

## Close the final delivery gap

After source checks pass, validate the candidate a user will receive:

1. Build/package once using the intended release configuration. Identify the
   candidate by commit plus dirty-tree disclosure, version, platform, and artifact
   hash when there is an artifact. Bind later evidence to that same candidate.
2. Install or extract it outside the checkout so workspace source, sibling assets,
   caches, and local configuration cannot conceal missing dependencies. Follow the
   product's real startup/setup path. An exported package must resolve public
   imports and types from that install.
3. Complete the critical journey, including first use and one relevant failure or
   recovery path. Select adversarial cases from the changed boundary and
   [adversarial testing](adversarial-testing.md); use `user-audit` for simulated user
   journeys and `dev-server` for managed local browser/API verification. Do not
   substitute source-string assertions for runtime or visual evidence.
4. Confirm environment/configuration, compatible runtimes, release command, and
   recovery/rollback route in the nearest README or distribution guide. Missing
   deployment ownership, legal prerequisites, signing, or host evidence remain
   explicit blockers; successful tests cannot supply them.
5. Review the result adversarially: what depended on checkout-only files, skipped
   checks, favorable state, or a different artifact? Use an independent reviewer
   when useful and authorized. Fix release blockers; defer unrelated improvements.
6. Report the candidate, commands/results, demonstrated journey, release action
   taken or still pending, and remaining uncertainty. Preparing a release does not
   itself authorize external publication; preserve authorization already given.

Known gaps and their evidence are recorded in the
[shipping assessment](audits/shipping-system.md), with follow-up work in the
[repository TODO](../TODO.md). That assessment is a dated baseline, not a live
checklist of passing claims.

## Improve the system from actual delivery

When the same failure or manual decision recurs, capture the reproductions and
owning paths. Prefer a deterministic regression or validator before another rule.
Update the nearest skill only when the ordered workflow or decision changes; update
the README when the user contract changes. Keep each fact with one owner.

Extract a primitive only for named real consumers, a recurring bug/manual workflow,
or a measured bottleneck. Similar syntax alone is insufficient. Record the evidence
that would justify deferred extraction, and delete obsolete guidance when the
validator or canonical primitive replaces it. Avoid maintaining parallel status
registries that restate what commands already establish.
