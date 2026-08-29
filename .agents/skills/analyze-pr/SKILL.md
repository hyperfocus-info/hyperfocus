---
name: analyze-pr
description: Audit a Git branch or commit without changing code. Use when reviewing a local or remote branch, PR branch, or commit for bugs, quality, duplicate work, merge impact, or overlap with the current dirty worktree.
---

# Analyze PR

Review code as it exists, not as the commit message describes it. Keep the current
worktree untouched and lead the result with actionable findings.

## Inspect

Read [the Git inspection reference](references/inspection.md) before reviewing a
target. Resolve the target and base, inspect Git objects directly, read the complete
relevant diff, and compare new concepts with the current branch and uncommitted work.

Classify overlap as:

- `missing`: current work lacks the target behavior;
- `duplicated`: both implement the same user-visible behavior;
- `superseded`: current work implements a broader or cleaner version; or
- `conflicting`: applying the target would regress or fight current behavior.

Judge correctness, boundary validation, persistence and migration, concurrency,
stale state, accessibility, and test coverage before style.

## Verify only when useful

Read [the verification reference](references/verification.md) only when executing
target-side checks, dirty-worktree checks, a server, or a visual smoke. BranchFS is
for the current dirty tree; a detached Git worktree is for executing the target.

## Output

Lead with findings ordered by severity and include file/line references when possible.
Then report:

- concise quality judgment;
- impact on the current branch using the overlap classifications above;
- exact verification commands and pass/fail/blocked status; and
- merge, skip, partial cherry-pick, or prefer-current recommendation.

If no bug is found, say so and name residual risk. Do not implement fixes, stage,
commit, approve, or request changes unless the user separately asks for that action.
