# First-party 3D core

`src/render/3d-core.ts` is the dependency-free foundation for an engine-owned 3D stack. It does not import Three.js and it is usable without a DOM, canvas, GPU, or asset loader.

This is intentionally not a complete renderer. It currently owns:

- fixed-capacity, typed-array transform hierarchies;
- column-major matrix composition and multiplication;
- perspective, orthographic, and look-at camera math;
- normalized frustum extraction plus sphere and AABB tests; and
- deterministic, fixed-capacity sphere visibility collection for instances.

It does not itself provide GPU device setup, mesh or texture upload, materials, shaders, draw submission, animation evaluation, lighting, shadows, post-processing, or model import. Those concerns build on this DOM-free foundation. The existing Three-backed integration remains the production 3D renderer until the first-party layers have sufficient parity evidence.

## Coordinate contract

The core uses right-handed coordinates. Cameras look down local negative Z. Matrices are column-major and multiply column vectors. Projection depth follows WebGL/OpenGL normalized device coordinates, from `-1` at the near plane to `1` at the far plane. `extractFrustumPlanes3D` returns normalized planes in left, right, bottom, top, near, far order.

The convention is part of the public contract. Backend adapters must convert explicitly if an API uses a `0..1` depth range.

## Bounded hot-path use

Create capacities during loading, then reuse the storage:

```ts
import {
  collectVisibleInstanceSpheres3D,
  createFrustumPlanes3D,
  createInstanceVisibilityBuffer3D,
  createTransformHierarchy3D,
  extractFrustumPlanes3D
} from "../src/render/3d-core.ts";

const transforms = createTransformHierarchy3D(10_000);
const visible = createInstanceVisibilityBuffer3D(2_000);
const frustum = createFrustumPlanes3D();

// After writing viewProjection and packed world-space sphere bounds:
extractFrustumPlanes3D(frustum, viewProjection);
collectVisibleInstanceSpheres3D(frustum, bounds, visible);

for (let index = 0; index < visible.count; index += 1) {
  submitInstance(visible.indices[index]);
}
```

Visibility is stable in input order. `visible` is the exact number that passed the frustum, `count` is the number written, and `truncated` reports how many did not fit. A renderer can therefore increase a deliberate budget instead of silently growing an array during a frame.

`TransformHierarchy3D.updateWorldMatrices()` uses preallocated traversal storage and only recalculates dirty branches. Handles are stable integer slots. Destroying a transform is restricted to leaves, making ownership mistakes explicit; the freed slot is reused.

## Replacement progress

The GPU-neutral scene/command layer and a first-party WebGL2 backend now build on this module. They provide bounded mesh, RGBA8 texture, and skeleton handles; instanced submission; deterministic distance-band mesh LOD rebinding; direct terrain-chunk streaming into bounded scene resources; unlit compatibility; direct-light metallic-roughness and emissive materials; one directional shadow map; up to four position morph targets; and hardware-bounded four-weight matrix skinning with caller-evaluated palettes. Vendor-neutral static and skin/animation glTF cookers provide model buffers, static position morph deltas/default weights, bounded node/skin hierarchies, inverse-bind matrices, and LINEAR/STEP TRS pose evaluation. The next layers are environment/texture PBR channels, texture compression, HLOD, morph-weight animation, and a WebGPU backend. Each layer should keep the typed-buffer and caller-owned-output approach and ship with resource-count, visibility-count, context-restoration, and compatibility evidence before replacing the current Three path.

`createTerrainStreamer3D` maps camera X/Z to a bounded square chunk set, limits concurrent async loads, passes an `AbortSignal` to the caller's asset provider, and directly creates/destroys scene mesh, transform, and instance handles as the camera crosses chunk boundaries. The caller still owns terrain generation, durable/cache storage, material policy, seam strategy, and height/collision data. `maxLoadedChunks` must cover the configured radius, so an undersized scene fails at resource registration instead of growing hidden storage.
