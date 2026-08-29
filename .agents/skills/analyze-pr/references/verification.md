# Review verification

Run focused tests before broad suites. Do not execute a target merely to make the
review look comprehensive; verification should answer a material uncertainty.

## Current dirty worktree

Use the `branchfs` skill when a check must see current uncommitted edits and may write
local state, start a dev server, or create artifacts. Inspect and discard the mount;
do not flush review experiments.

Read-only commands and already-isolated unit tests can run directly without BranchFS.

## Target branch or commit

BranchFS is not a checkout and excludes `.git`. Use a disposable detached worktree
when the target itself must execute:

```powershell
$reviewRoot = Join-Path $env:TEMP "hyperfocus-review-target"
git worktree add --detach $reviewRoot <target>
bun.cmd install
bun.cmd test <focused-tests>
bun.cmd run typecheck
```

Stop only processes started in that worktree, then remove it. Do not kill unrelated
development servers. Report timeouts and partial completion exactly; do not convert
an incomplete suite into a pass.

For Hyperfocus UI or build risk, use the owning package commands and the repository's
browser/screenshot path. Read the relevant scoped skill before starting a server.
