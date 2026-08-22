# Explicit handoffs

An editor handoff is the machine-readable boundary between one agent operation and the next.

## Required fields

- `schema`: `hyperfocus-editor-command-handoff-v1` for direct commands; visual compatibility actions use `hyperfocus-editor-agent-handoff-v1`.
- `requestId` and `intent`: correlate the result with the requested operation.
- `ok`: true only when every command completed.
- `startedAt` and `completedAt`: bound the operation.
- `completedCommands` and `results`: provide ordered execution evidence. Visual compatibility handoffs use `completedActions`.
- `error`: first failure, when present.
- `snapshot`: cloned canonical project data, revision, validation state, history availability, and dirty state.
- `projectHash` and `persisted` on file-backed results: identify the resulting canonical state and whether it was atomically written.
- `next.verify`: checks the receiving agent or user should perform.
- `next.unresolved`: blockers that must not be hidden.

## Receiver checklist

1. Confirm the request ID and intent are the expected operation.
2. Require `ok: true` before assuming the mutation completed.
3. Compare the snapshot with the intended state, not merely the action log.
4. For builds, downloads, canvas gestures, or runtime behavior, collect browser evidence in addition to the command handoff.
5. Start the next plan from the returned canonical project and identifiers.

## Human summary

Translate the JSON into a short handoff without dropping failures:

```text
rename-project-001 completed 1/1 commands.
Project: My Game (persisted: true), SHA-256: 4d2c…
Verified: canonical project pair reopened with the updated title.
Unresolved: none.
```

Keep the JSON artifact when another agent will continue the task. It is the authoritative handoff; the prose is only a summary.
