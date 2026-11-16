# Recovery

Inspect current state, pending questions, and recent failure logs first. Keep the
requested scope: inspecting a failure does not resume work, and resuming one
assistant does not lift global pause.

Use the live pause/resume actions in [operation handoffs](operation-handoffs.md)
for one assistant. For a requested subset or project, inspect the maintenance dry
run before executing:

```text
bun "<skill>/scripts/assistant-maintenance.ts" --action pause-assistants --project "<project>"
```

Use `resume-assistants` for resume. Repeat `--assistant` for named subsets;
`--all` without `--project` requires an explicit workspace-wide request.
Add `--execute` after confirming the dry-run targets against that request.
Verify saved state and outstanding failures/questions.

For bootstrap failure, read its cause before retry. The live
`assistant.bootstrap.retry` action requests immediate retry; maintenance
`--action rebootstrap` resets persisted state to pending and is not proof of a run.
Preserve prompts, todos, learnings, and questions unless their change is requested.

For a tripped breaker, inspect its reason and recent assistant/job logs. The live
`assistant.circuit-breaker.retry` closes the breaker, resumes the assistant, then
retries bootstrap or schedules reprioritization. Retry within authorized recovery
after fixing a local cause; ask when missing credentials or a consequential
configuration choice needs the user. Stop repeated retries when the same cause
persists and report what remains blocked.
