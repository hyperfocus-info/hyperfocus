# State reporting

Read current saved state before answering what is queued, open, learned, or failed:

```text
bun "<skill>/scripts/assistant-state.ts" --assistant "<assistant>" --project "<project>" --limit 10
```

`<skill>` is the installed skill directory. Use `--json` for structured output.
Answer the requested question with persisted facts; no saved rows does not mean
the assistant has hidden work.

After a mutation, verify its affected records:

| Action | Evidence |
| --- | --- |
| Create, edit, clone, pause, resume, recover | Assistant row and relevant recent logs |
| Chat | Assistant messages and completion event if visible |
| Question answer | Question status and linked todo/log changes |
| Todo update | Todo state and reprioritization result |
| Job create, run, pause, resume | Job definition, run rows, and next run time as applicable |

Distinguish a requested/queued operation from finished work. Include pending
questions, breaker state, or failures when they explain the user's result.
