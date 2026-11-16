# Development server registry

The command writes repository-local state to `.local/dev-servers.sqlite` in the main
Git worktree so linked worktrees coordinate against the same process inventory. The
directory is ignored by Git.

## Tables

`dev_servers` records the canonical surface, worktree, branch, shared or isolated
mode, host, chosen port and URL, supervisor and child PIDs, start/ready/heartbeat/stop
timestamps, lifecycle status, exit code, log path, and non-secret command argv.

`dev_server_ports` atomically reserves each required endpoint, including sidecars,
while its server is starting or running. OS availability probes stay bound until
the reservation transaction commits. Finishing or failing a server releases all
its reservations; a late readiness response cannot revive a finished instance.

`dev_error_logs` deduplicates messages per server and fingerprint. Each row stores a
category (`build`, `network`, `persistence`, `process`, `runtime`, or `unknown`),
source stream, occurrence count, first/last timestamps, and nullable investigated
and fixed timestamps. A recurring fixed fingerprint clears `fixed_at`.

The database uses WAL mode and a five-second busy timeout because the caller,
supervisor, and status commands may read or write concurrently.

## Direct operations

Run these relative-path commands from the repository root:

```text
bun .agents/skills/dev-server/scripts/dev.ts start <surface> [--port N] [--isolated] [--local-auth] [--foreground] [--json]
bun .agents/skills/dev-server/scripts/dev.ts status [--all] [--json]
bun .agents/skills/dev-server/scripts/dev.ts logs [surface|id] [--lines N]
bun .agents/skills/dev-server/scripts/dev.ts errors [surface|id] [--all] [--limit N] [--full] [--json]
bun .agents/skills/dev-server/scripts/dev.ts error <id> <investigated|fixed|open>
bun .agents/skills/dev-server/scripts/dev.ts stop <surface|id|--all> [--json]
```

The ordinary package scripts are the preferred entrypoints. Direct operations are
for lifecycle inspection, machine-readable output, and explicit isolation.
See [failure records](../../../../docs/development.md#failure-record) for summary
limits, retained stack context, and historical records.
