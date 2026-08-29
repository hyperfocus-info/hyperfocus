# glTF 2.0 skin and animation cooking

`src/assets/gltf-skin-animation.ts` is a DOM-free, vendor-neutral path from parsed glTF 2.0 data and resolved buffers to typed skeleton, skin-stream, and animation buffers. It imports no renderer or Three.js code. The checked-in [`two-joint.gltf`](../fixtures/gltf-skin-animation/two-joint.gltf) fixture is an ordinary standalone data-URI glTF file that independent tools can inspect.

## Cook and evaluate

```ts
const result = await resolveAndCookGltfSkinAnimations(parsedGltf, {
  // External URIs cross an explicit caller-owned resolver boundary.
  resolveExternal: ({ uri }) => readVerifiedProjectAsset(uri),
  cook: { maxNodes: 10_000, maxJointsPerSkin: 128, maxKeyframes: 1_000_000 },
});
if (!result.ok || !result.rig) throw new Error(JSON.stringify(result.diagnostics));

const rig = result.rig;
const pose = createGltfPoseOutput(rig);
const sourceSkin = rig.skeletons[0];
const palette = new Float32Array(sourceSkin.jointNodes.length * 16);

evaluateGltfAnimationPose(
  rig,
  { skeleton: 0, clip: 0, timeSeconds, loop: true, meshNode: rig.skinBindings[0].nodeIndex },
  pose,
  palette,
);
scene.setSkeletonMatrices(sceneSkeleton, palette);
```

`meshNode` makes the palette mesh-local using `inverse(meshWorld) * jointWorld * inverseBindMatrix`. Omit it when a caller deliberately wants world-space joint palettes. Evaluation resets the caller-owned pose to the cooked rest pose, samples every channel, evaluates the node hierarchy in deterministic topological order, and fills the exact caller-owned palette. Reuse `pose` and `palette` every frame; they must not alias.

## Cooked contract

- Nodes contain parent indexes, deterministic topological order, TRS rest values, and exact static matrices.
- Skeletons contain stable glTF joint-node order and copied `MAT4/FLOAT` inverse-bind matrices. Missing inverse-bind accessors become identity matrices.
- Skin bindings preserve each node-to-mesh-to-skin relationship.
- Mesh skin streams contain copied `JOINTS_0` (`Uint8Array` or `Uint16Array`) and normalized `Float32Array` `WEIGHTS_0`, ready to combine with geometry for `BoundedScene3D.registerMesh`.
- Clips contain flat typed channel metadata plus tightly concatenated key times and values. Channel order remains source order.

The cooker validates tree ownership and cycles, node transforms, skin and mesh references, joint ranges, accessor alignment/stride/ranges, finite values, strictly increasing non-negative key times, quaternion validity, component types, and caller-configured count/byte ceilings. Failures return no rig and include a stable code and RFC 6901 JSON pointer.

## Supported subset

| Feature | Support |
|---|---|
| Node transforms | TRS and static `matrix`; matrix nodes cannot receive TRS channels |
| Skin joints | Ordered node indexes, bounded per skin |
| Inverse bind matrices | `FLOAT/MAT4`; identity when omitted |
| `JOINTS_0` | Non-normalized `UNSIGNED_BYTE` or `UNSIGNED_SHORT`, four influences |
| `WEIGHTS_0` | `FLOAT`, or normalized `UNSIGNED_BYTE`/`UNSIGNED_SHORT`; deterministically renormalized |
| Animation paths | `translation`, `rotation`, `scale` |
| Interpolation | `LINEAR` and `STEP`; quaternion linear interpolation uses shortest-path slerp |
| Buffers | Resolved inputs, data URIs, caller-provided GLB chunks, or explicit external resolver |

## Explicit limits

`CUBICSPLINE`, morph targets/weights, `JOINTS_1`/`WEIGHTS_1`, sparse accessors, non-triangle skinned primitives, and extensions affecting nodes, skins, primitives, accessors, buffer views, or animations are rejected at their exact JSON pointers. Required extensions are always rejected because ignoring one would make the decoded result unreliable.

This module does not decode positions, normals, indices, materials, images, or containers. Geometry/material cooking remains a separate concern, and JSON/GLB parsing stays at the host boundary. It also does not blend clips, retarget skeletons, apply root-motion policy, emit events, or provide cubic interpolation. The evaluator performs four-weight linear matrix skinning palettes compatible with the first-party scene/WebGL2 path; GPU joint capacity remains a renderer/hardware decision.
