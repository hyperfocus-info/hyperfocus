# Explicit handoffs

An editor handoff is the machine-readable boundary between one agent operation and the next.

## Required fields

- `schema`: `hyperfocus-editor-agent-handoff-v1`
- `requestId` and `intent`: correlate the result with the requested operation.
- `ok`: true only when every action completed.
- `startedAt` and `completedAt`: bound the operation.
- `completedActions` and `results`: provide ordered execution evidence.
- `error`: first failure, when present.
- `snapshot`: cloned project data plus current ready, dirty, mode, workspace, selection, center, focus, visible messages, and visible-control state.
- `next.verify`: checks the receiving agent or user should perform.
- `next.unresolved`: blockers that must not be hidden.

## Receiver checklist

1. Confirm the request ID and intent are the expected operation.
2. Require `ok: true` before assuming the mutation completed.
3. Compare the snapshot with the intended state, not merely the action log.
4. For saves, builds, downloads, canvas gestures, or runtime behavior, collect browser evidence in addition to the JSON handoff.
5. Start the next plan from the returned controls and current project identifiers.

## Human summary

Translate the JSON into a short handoff without dropping failures:

```text
rename-project-001 completed 3/3 actions.
Project: My Game (dirty: true), mode: edit, workspace: stage.
Verified: settings closed and project title updated.
Unresolved: none.
```

Keep the JSON artifact when another agent will continue the task. It is the authoritative handoff; the prose is only a summary.
