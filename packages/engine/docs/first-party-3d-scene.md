# First-party 3D scene and command layer

`src/render/3d-scene.ts` builds a dependency-free scene and render-command layer on `3d-core.ts`. It is DOM-free and GPU-neutral: a server can compile the same visibility and batching result that a browser backend consumes.

The module now owns:

- bounded mesh, texture, material, light, skeleton, and instance registries with stable integer handles;
- borrowed, typed mesh geometry suitable for GPU upload;
- packed material and light data with documented strides;
- instance visibility using world-transformed bounding spheres and the core frustum planes;
- fixed-stride caller-writable joint palettes and validated four-influence vertex skinning;
- deterministic batching by mesh/material/skeleton tuple; and
- caller-owned, fixed-capacity command, matrix, and light buffers.

This remains a GPU-neutral command layer. The separate first-party WebGL2 backend now consumes it, while the current Three-backed renderer remains available during the broader renderer transition.

## Lifecycle and ownership

Scene capacities are explicit and never grow:

```ts
const scene = createBoundedScene3D({
  transforms: 10_000,
  meshes: 256,
  materials: 256,
  lights: 64,
  instances: 10_000,
  textures: 256,
  textureBytes: 256 * 1024 * 1024,
  skeletons: 128,
  jointsPerSkeleton: 64
});

const frame = createRenderCommandBuffer3D({
  commands: 1_024,
  instances: 5_000,
  lights: 32
});
```

Mesh and RGBA8 texture arrays are borrowed, not copied. The caller must keep them alive and unchanged until destruction. Texture count and total source bytes are separately bounded; enabling a texture registry requires an explicit positive `textureBytes` budget. Meshes, materials, and skeletons cannot be destroyed while an instance refers to them, and textures cannot be destroyed while a material refers to them. Registry exhaustion, malformed geometry, stale handles, cyclic transforms, and invalid numeric data throw actionable errors at mutation boundaries.

Use `scene.destroyTransform` when a transform may be referenced by an instance. Directly destroying through `scene.transforms` is permitted for low-level control; compilation detects the dangling instance and reports it in `invalidTransformInstances` instead of reading invalid memory.

`scene.setInstancePresentation(instance, mesh, material, visible)` applies the same
mesh/material/visibility sequence as the individual setters, including restoring
the mesh's registered bounds. It checks live registry storage before skipping
unchanged static fields, so external visibility/bounds edits and invalid handles
remain observable. Skinned meshes retain joint-range and skeleton validation.
This is a positional hot-path operation, not an atomic transaction or a snapshot.
The portable 3D runtime uses it with retained authored bindings; full save and
rollback snapshots remain separate from presentation caches.

Materials choose `shading: "unlit" | "lit"`, may reference one `baseColorTexture`, and accept opaque or alpha-mask state. Blended transparency is deliberately deferred until the command model owns a deterministic depth policy. Light records now include ambient, directional, point, and spot kinds; backend support is reported separately.

## Skeletal skinning contract

A skinned mesh supplies paired `joints` and `weights` streams with four values per vertex. `joints` must be `Uint8Array` or `Uint16Array`; `weights` must be `Float32Array`, finite, non-negative, and normalized to `1 ± 0.001` per vertex. A skinned instance requires a material created with `skinning: true` and a live skeleton whose joint count covers every `JOINTS_0` index. Static meshes, materials, and instances remain unchanged.

```ts
const skeleton = scene.createSkeleton(32); // identity palette by default
scene.setSkeletonMatrices(skeleton, evaluatedSkinMatrices);

// Or update the stable, caller-owned palette in place each frame.
const offset = scene.skeletonMatrixOffset(skeleton);
scene.skeletonMatrices.set(evaluatedSkinMatrices, offset);

scene.createInstance({ mesh: skinnedMesh, material: skinnedMaterial, transform, skeleton });
```

Every skeleton slot reserves `jointsPerSkeleton * 16` floats so handles and offsets stay stable. `createSkeleton(jointCount)` rejects counts above the scene limit; `setSkeletonMatrices` requires exactly `jointCount * 16` finite, column-major values. The scene owns no bone hierarchy, inverse-bind calculation, clip evaluator, or interpolation policy: callers upload final skin matrices. Instances sharing mesh, material, and skeleton can use one instanced draw; different palettes intentionally form different commands.

## Frame compilation

Call `scene.compile(frame, { frustumPlanes, layerMask })` after updating simulation transforms. The compiler updates dirty world matrices, filters layers, transforms local bounding spheres, culls them, creates batches in first-visible order, and writes matrices contiguously per batch.

Backends read:

- `commandMeshHandles`, `commandMaterialHandles`, `commandSkeletonHandles`, `commandFlags`, `commandFirstInstances`, and `commandInstanceCounts` for draw commands;
- `instanceMatrices`, packed as 16 column-major floats per instance;
- `materialData`, packed as 12 floats per registered material, plus `materialFlags` and `materialTextureHandles`; and
- `lightTypes` and `lightData`, packed as 16 floats per visible light.

No arrays are created during compilation. The output owns its scratch space and all upload-facing buffers.

The compiler reports exact pressure rather than silently resizing:

- `visibleInstances`: passed visibility before output limits;
- `truncatedInstances`: visible instances beyond the matrix-buffer limit;
- `commandLimitedInstances`: instances whose new mesh/material batch did not fit;
- `invalidTransformInstances` and `invalidSkeletonInstances`: dangling low-level resource references; and
- `matchingLights` and `truncatedLights`: light-buffer demand and overflow.

These counters should be surfaced in development builds and monitored in stress tests. A shipping backend can then choose deliberate capacities based on real scenes.

## Backend boundary

The first-party WebGL2 backend feature-detects support, caches mesh and texture uploads by handle/source identity, uploads only accepted matrix ranges, and issues one instanced draw per command. It handles resize, shader diagnostics, loss/restoration, and resource re-upload. The command layer stays independent so future WebGPU, server validation, and export tools can consume the same deterministic scene data.
