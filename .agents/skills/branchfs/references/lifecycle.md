# BranchFS lifecycle

Read this before running or extending a BranchFS experiment.

## Materialized shape

Each lease contains:

- `mount/`: repository copy excluding `.git` and `.local`;
- `base/`: comparison snapshot;
- `dirty-seed/`: host uncommitted edits captured at lease time;
- `upper/`: reserved for a future copy-on-write implementation; and
- `meta/manifest.json`: run id, base commit and branch, dirty fingerprint, and
  virtual branch name.

Root and workspace-local `node_modules`, `dist`, and `.bun` directories are
junction or symlink passthroughs when they exist on the host. Writes there affect
the host. The mount starts without `.local`, so harness databases and logs created
there are disposable.

## Canonical lifecycle

```ts
import { createBranchfsManager } from "./apps/harness/cli/src/branchfs-manager";

const manager = createBranchfsManager({
  rootPath: process.cwd(),
  runId: `my-tool-${Date.now()}`
});
const lease = await manager.prepareExperimentLease();

try {
  await doWorkInMount(lease.projectMountPath);
  const inspection = await manager.readInspection(lease);
  console.log(`${inspection.filesChanged} files changed`);
} finally {
  await manager.discardExperiment(lease).catch(() => undefined);
}
```

- `readInspection(lease)` is non-mutating and may run more than once.
- `discardExperiment(lease)` removes the experiment and leaves the host worktree alone.
- `flushExperiment(lease)` copies edits and deletions to the host. Call it only after
  the user explicitly chooses to promote the inspected experiment.
- `unmountExperiment(lease)` is lower-level; normal callers use discard or flush.

## Child processes

- Set `cwd` to the project or repository mount path.
- Spread the existing environment and add only experiment-specific overrides, such
  as `HARNESS_PORT=0`.
- Detect readiness from output instead of sleeping blindly.
- Register a stop operation, kill the process, and await exit before cleanup.
- On Windows, process handles and open pipes must close before removing junctions.

Never run a dependency install in a mount. Build output under a passthrough `dist`
also reaches the host, so use it only when that consequence is intended.
