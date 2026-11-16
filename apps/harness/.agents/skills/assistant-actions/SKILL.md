---
name: assistant-actions
description: Inspect or manage Harness assistants and their jobs, todos, questions, and recovery state. Use for Harness assistant operations; thread-history forensics uses db-data-harnessing and ordinary project work does not use this skill.
---

# Assistant actions

Use the bundled helpers or live Harness actions for assistant state. Do not create
ad hoc database clients or write assistant-management code into the user's project.
If an operation is unsupported, report the missing capability; change the installed
helpers only when skill maintenance is part of the task.

Resolve helper paths from this file's directory, shown as `<skill>` below. The
database defaults to `~/.ai-harness-template/harness.db`; `HARNESS_DB_PATH` or
`--db` can select another file.

```text
bun "<skill>/scripts/assistant-state.ts" --assistant "<name-or-id>" --project "<name-id-or-root>" --limit 10
```

Use `--json` for structured output and `--help` for supported options. Resolve the
target from the request and current project; read [selection](references/assistant-selection.md)
when scope or matching is unclear. State questions require current saved evidence.

For a mutation, use the exact live action or helper in
[operation handoffs](references/operation-handoffs.md). Run maintenance without
`--execute` first, inspect its targets and effects, then execute within existing
authorization. A matching dry run does not require another user confirmation.
Verify the affected state afterward; an accepted request is not proof of completion.

Load only the action-specific detail needed:

- [Create/configure](references/create-configure.md): creation, field edits, cloning, removal.
- [Chat/todos/questions](references/chat-todos-questions.md): messages and linked work.
- [Jobs](references/jobs.md): schedules, bulk starts, removal, and live launch gates.
- [State reporting](references/state-reporting.md): interpreting saved state.
- [Recovery](references/recovery.md): pause, bootstrap, and circuit breakers.

Keep unrelated jobs running. Bulk project operations exclude global assistants
unless explicitly named; workspace-wide mutations need explicit workspace scope.
