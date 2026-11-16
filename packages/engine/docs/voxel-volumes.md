# Bounded editable voxel volumes

`createVoxelVolume3D` from `@hyperfocus/engine/content` owns occupancy, box edits,
local AABB overlap queries, exposed-face meshes and versioned run-length snapshots.
It is framework-free and performs no I/O. The editor's
[directed generation consumer](../../../apps/engine-editor/scripts/game-art/README.md)
cooks its vertex streams into normal portable GLBs and preserves the source snapshot.

```ts
const world = createVoxelVolume3D({ size: [32, 16, 32], cellSize: 0.5 });
world.edit({ min: [0, 0, 0], max: [32, 1, 32], solid: true });
const saved = world.snapshot();
const mesh = world.mesh({ min: [0, 0, 0], max: [16, 16, 16] });
world.intersects({ min: [1, 0, 1], max: [1.4, 0.4, 1.4] });
world.restore(saved);
```

Edit and mesh bounds use half-open integer cell coordinates. Collision queries
use local world coordinates in `cellSize` units; the host owns world transforms.
Meshing a region consults neighbors throughout the volume, so adjacent chunk
regions do not emit shared interior faces. Returned typed arrays belong to the
caller. Snapshots copy their data; restore validates the entire snapshot before
mutation. Invalid bounds, overlarge volumes and exhausted face budgets reject.

The bound is 128 cells per axis and 262,144 cells total. Meshes default to 100,000
faces, with an explicit bounded override. A solid 32-cube volume emits 6,144 surface
faces rather than 196,608 per-cell faces. This is exposed-face meshing, not greedy
merging. Edit regions must be remeshed by the host, including neighboring regions
when their boundary occupancy changes.

This supplies a reusable sandbox primitive. World streaming, interactions, inventory,
network replication, swept movement collision and durable save adapters still belong
to the consumer. It does not establish an infinite world or a completed sandbox game.
