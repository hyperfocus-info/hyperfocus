# @hyperfocus/workspace

Framework-neutral contracts for project identity, safe relative paths, file operations, watching, and task execution. Hosts provide the filesystem and process adapters; UI packages consume only these interfaces.

## Filesystem consistency

`WorkspaceFileSystem.readFile({ path })` returns contents with a monotonic per-path revision. Pass that revision as `expectedRevision` to `writeFile` or `deleteFile` to prevent a stale editor, agent, or watcher from overwriting newer work. Revision zero means “create only if missing”; omitting the field is the explicit unconditional baseline. Every mutation returns a discriminated written, deleted, missing, or conflict result instead of mixing nullable values and flags.

Use `writeFilesAtomic({ writes })` when several files form one logical change. All paths and revision preconditions are checked before any write commits, and a conflict returns the current snapshots for the failed paths. Hosts must provide the same no-partial-write guarantee through a transaction, staging-and-swap, or equivalent primitive.

Watch events are immutable and contain a global sequence and per-path revision. A failing watcher cannot interrupt committed writes or delivery to other watchers. An `invalidated` event is a required resnapshot signal for overflow or an untracked external change; consumers must not guess that a missing sequence can be repaired from later deltas. `createMemoryWorkspaceFileSystem(options)` is the deterministic reference adapter for tests and local tools. It rejects file/directory prefix collisions in initial files and during atomic-write preflight, before any mutation or watch event.

Events from an atomic batch are sequenced before any callback runs. Writes made by
a watcher queue behind that entire batch, so every subscriber receives commit
order without recursive notification interleaving.

## Verify a host adapter

Import `verifyWorkspaceFileSystem` from `@hyperfocus/workspace/testing` and provide
a factory that returns a fresh, empty, disposable workspace for each scenario:

```ts
import { verifyWorkspaceFileSystem } from "@hyperfocus/workspace/testing";

const report = await verifyWorkspaceFileSystem({
  create: async () => {
    const host = await openTestWorkspace(); // Your adapter and isolated storage.
    return { filesystem: host.filesystem, close: () => host.dispose() };
  },
});
```

The runner rejects stale atomic batches that partly commit, revision reuse after
delete/recreate, and failing or nested watchers that corrupt committed data or
notification order. It returns passed scenario names or throws a named failure;
it always closes fixtures and removes its subscriptions. The factory owns storage
isolation and deletion. Local notifications must be delivered by the time the
corresponding mutation resolves. The testing subpath imports no Bun, DOM, browser
driver, or test framework and is separate from the ordinary package entry.

Run `bun test packages/workspace/src` for memory and rejection regressions. The
public testing adapter runner is available to consumer-owned adapters; browser
storage verification belongs to each consumer. Cross-connection invalidation,
process crashes, durability, restart, backup and browser lifecycle need
adapter-specific acceptance; the narrow runner does not certify those properties.

Related: [architecture](../../docs/architecture.md), [package testing](../../docs/package-testing.md), and [documentation map](../../docs/README.md).
