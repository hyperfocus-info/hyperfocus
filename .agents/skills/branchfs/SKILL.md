---
name: branchfs
description: Operate or extend the harness BranchFS experiment boundary. Use when a command, server, or experiment must see current uncommitted work without mutating normal local state, or when changing `BranchfsManager`; do not use for read-only inspection or ordinary isolated unit tests.
---

# BranchFS

BranchFS materializes a run-scoped copy under `.local/branchfs/<runId>` with the
current dirty worktree seeded into it. It is an isolation API, not a Git checkout or
a true copy-on-write filesystem.

## Decide

Use BranchFS only when the work must:

- execute code that may change project state, `.local`, logs, or caches;
- see the user's current uncommitted edits; and
- clean up the experiment even when execution fails.

Do not use it for read-only inspection, already-isolated fixtures, arbitrary target
branches or commits, or non-Git directories. Use Git object reads or a detached
worktree when the target revision itself must execute.

## Operate

Before running or extending an experiment, read
[the lifecycle reference](references/lifecycle.md). Its invariants are mandatory:

1. Prepare one lease with a unique run id.
2. Run work with `cwd` set to `lease.projectMountPath`.
3. Stop and await every child process in `finally`.
4. Inspect changes before deciding what to do with them.
5. Discard by default. Flush only after an explicit user-initiated promote/flush signal.

Never install dependencies inside a mount: `node_modules`, `dist`, and `.bun` may be
host passthroughs. Treat those paths as read-only during isolated work.

## Extend or test

Read [the testing and contribution reference](references/testing.md) when changing
`apps/harness/cli/src/branchfs-manager.ts`, adding a caller, or testing BranchFS-backed
behavior. Use `update-harness` for the owning source and documentation rules.

The implementation is authoritative. Search
`apps/harness/cli/src/branchfs-manager.ts` and its callers when an assumption is not
covered by the references.
