---
name: dev-server
description: Start, reuse, inspect, or stop Hyperfocus development servers through the SQLite supervisor. Use for first-party browser/API verification and server, port, HMR, or runtime-log work.
---

# Managed development servers

Use the repository supervisor; do not start app entrypoints or `Bun.serve`
directly. Run `bun run dev:status`, then start the needed surface with
`bun run dev:harness`, `dev:editor`, or `dev:pad-pilot`. Use the returned URL,
not an assumed port. Read [special surfaces](references/surfaces.md) for artifact
review, extracted websites, or Touch of Death.

A healthy normal-worktree server is shared and stays running unless shutdown is
requested. Linked Git worktrees and `--isolated` runs get separate attached
servers: retain their process handle, stop them in cleanup even after failure,
then verify their server ID is absent from `dev:status`.

For authorized loopback-auth audits, use `start <surface> --isolated --local-auth`
instead of recreating environment wrappers. [Local-auth startup](references/surfaces.md#local-auth-startup)
defines supported apps, disposable data and the API option; this mode never reuses
a shared server.

Stop only owned IDs/surfaces with `bun run dev:stop -- <id-or-surface>`; never kill
by process name. All descendants must use the shared hidden process adapter and
owned headless browser helpers. Follow [process lifecycle](../../../docs/development.md#process-and-browser-lifecycle)
and verify actual Windows window visibility; flags or healthy endpoints alone
cannot prove it.

Inspect `dev:logs` and unresolved `dev:errors` after runtime work. Mark an error
investigated after identifying its cause and fixed only after verification;
recurrence reopens it. Do not hide failures by replacing the server.

Use the returned server ID for evidence when multiple worktrees share a surface
name. Prefer the host's collaborative preview when available: inspect status,
then open before declaring it unavailable. An explicit unsupported/unavailable
response permits the existing owned headless browser route. Retain the tool
failure and the actual URL/viewport; a fixture capture is not a real host journey.

Read [registry and direct CLI](references/registry.md) for JSON output, explicit
isolation, log/history details, or manager changes. The supervisor owns metadata
and captured output, never a copy of the full environment.
