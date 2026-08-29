# @hyperfocus/workspace

Framework-neutral contracts for project identity, safe relative paths, file operations, watching, and task execution. Hosts provide the filesystem and process adapters; UI packages consume only these interfaces.

## Filesystem consistency

`WorkspaceFileSystem.readFile({ path })` returns contents with a monotonic per-path revision. Pass that revision as `expectedRevision` to `writeFile` or `deleteFile` to prevent a stale editor, agent, or watcher from overwriting newer work. Revision zero means “create only if missing”; omitting the field is the explicit unconditional baseline. Every mutation returns a discriminated written, deleted, missing, or conflict result instead of mixing nullable values and flags.

Use `writeFilesAtomic({ writes })` when several files form one logical change. All paths and revision preconditions are checked before any write commits, and a conflict returns the current snapshots for the failed paths. Hosts must provide the same no-partial-write guarantee through a transaction, staging-and-swap, or equivalent primitive.

Watch events contain a global sequence and per-path revision. An `invalidated` event is a required resnapshot signal for overflow or an untracked external change; consumers must not guess that a missing sequence can be repaired from later deltas. `createMemoryWorkspaceFileSystem(options)` is the deterministic reference adapter for tests and local tools.

Related: [architecture](../../docs/architecture.md), [package testing](../../docs/package-testing.md), and [documentation map](../../docs/README.md).
