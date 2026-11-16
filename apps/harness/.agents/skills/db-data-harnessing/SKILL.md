---
name: db-data-harnessing
description: Investigate saved Harness thread history, ownership, runs, and related SQLite records for a thread id or missing-history question. Read-only forensics; assistant maintenance uses assistant-actions.
---

# Harness thread lookup

Run the bundled helper before writing SQL. Resolve `<skill>` from this file's
directory; it need not be inside the current project.

```text
bun "<skill>/scripts/lookup-thread.ts" "<thread-id>"
```

The default database is `~/.ai-harness-template/harness.db`; `HARNESS_DB_PATH` or
`--db <path>` overrides it. Use `--json` for machine-readable output. This is a
read-only investigation, and `/lookup-thread` is a conversational workflow rather
than a built-in Harness command.

Read [lookup interpretation](references/lookup-thread.md) when ownership,
missing rows, or environment identity is unclear. Use [the table map](references/table-map.md)
only for adjacent entities or joins. Distinguish no saved data from a wrong database
or unsupported schema. Explain findings in terms of the visible history or failure;
do not repair or mutate records as part of a lookup.
