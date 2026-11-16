# Assistant jobs

Use the state helper for a named assistant's jobs, or the jobs helper for recent
runs across a project. `<skill>` is this skill's installed directory.

```text
bun "<skill>/scripts/assistant-state.ts" --assistant "<assistant>" --project "<project>" --limit 10
bun "<skill>/scripts/assistant-jobs.ts" --project "<project>" --limit 10
```

Distinguish job definitions (enabled/paused) from run state (queued, awaiting
approval, running, failed) and next run time. Omit project scope only for a requested
workspace-wide inspection.

Creation needs assistant, project, purpose, and schedule or explicit one-shot
intent. Use [operation handoffs](operation-handoffs.md); do not invent a recurrence.
For an existing job, resolve one id/name and verify a new queued/running row.

For explicit bulk launch, inspect a dry run before adding `--execute`:

```text
bun "<skill>/scripts/assistant-maintenance.ts" --action start-jobs --assistant "<assistant>" --project "<project>"
```

Execution also accepts `--url <harness-url>` (or `HARNESS_URL`); use the actual live
server. It must go through live `bulk-operation.apply` with `run-now` so pause,
deletion, breaker, ownership, notification, and controller gates remain active.
Never insert job runs directly into SQLite. Already active jobs are skipped.
Verify new runs with the state helper.

For requested removal, use the maintenance helper with `--action remove-jobs`
and the same scoped dry-run/execute flow; verify that the intended definitions
were removed. Removal can cancel active runs for those jobs. Recovery of repeated
failures routes to [recovery](recovery.md).
