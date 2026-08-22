# glTF 2.0 static mesh cooking

`src/assets/gltf-static.ts` is a DOM-free, provider-neutral path from parsed glTF 2.0 data to tightly packed static geometry. It does not import Three.js, the first-party scene registry, WebGL, a filesystem API, or a network client. Its output is ordinary typed arrays that can be registered with `BoundedScene3D`, uploaded directly to WebGL2, written into a build artifact, or consumed by another engine.

The checked-in [triangle fixture](../fixtures/gltf-static/triangle.gltf) is an ordinary standalone glTF 2.0 file with a base64 data buffer. It is intentionally independent of Hyperfocus metadata and can be inspected with other conforming glTF tools.

## Core flow

For already resolved buffers, cooking is synchronous:

```ts
import { cookGltfStaticMeshes } from "../src/assets/gltf-static.ts";

const result = cookGltfStaticMeshes(parsedGltfJson, resolvedBuffers);
if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.pointer, diagnostic.code, diagnostic.message);
  }
  throw new Error("Asset cooking failed");
}

for (const primitive of result.meshes) {
  const meshHandle = scene.registerMesh({
    positions: primitive.positions,
    normals: primitive.normals,
    uvs: primitive.uvs,
    indices: primitive.indices,
    morphPositions: primitive.morphPositions,
    morphWeights: primitive.morphWeights,
    topology: primitive.topology,
    bounds: primitive.bounds,
    label: primitive.label,
  });
}
```

The arrays are tightly packed and owned by the result. Mutating or releasing caller input buffers after cooking does not change them. Primitive order is deterministic: mesh array order, followed by primitive array order. An unindexed triangle primitive receives deterministic sequential indices. The cooker selects `Uint16Array` when every cooked index fits and otherwise uses `Uint32Array`.

Bounds include a local-space AABB plus the `x`, `y`, `z`, and `radius` sphere shape accepted by `BoundedScene3D`. They are calculated from the cooked positions rather than trusting optional accessor metadata.

## Buffer resolution without hidden I/O

`resolveGltfStaticBuffers` handles two self-contained cases directly:

- canonical base64 `data:application/octet-stream` or `data:application/gltf-buffer` URIs;
- URI-less declarations, such as a GLB BIN chunk, supplied through `embeddedBuffers`.

Ordinary URIs cross the `resolveExternal` callback and nothing else:

```ts
const result = await resolveAndCookGltfStaticMeshes(document, {
  embeddedBuffers: new Map([[0, glbBinChunk]]),
  resolveExternal: async ({ uri, declaredByteLength, pointer }) => {
    // Apply project-root, archive-entry, or filesystem policy here.
    // This engine helper never calls fetch and never interprets paths.
    return readVerifiedProjectAsset(uri, declaredByteLength, pointer);
  },
});
```

The callback receives the source buffer index, URI, declared byte length, and JSON pointer. A missing resolver, rejected callback, short buffer, invalid data URI, or aggregate byte-limit breach is an error diagnostic and yields no buffers. This boundary lets an editor resolve content-addressed archive objects while a CLI resolves ordinary project files, without placing either policy in the cooker. If a host chooses to resolve HTTP itself, that network authority is outside this module.

The module accepts parsed glTF JSON. JSON text decoding and GLB container/chunk parsing stay at the host boundary so applications can apply their own input-size limits before parsing. A GLB host passes its parsed JSON chunk as the document and its BIN chunk through `embeddedBuffers`.

## Supported static subset

| glTF feature | Support |
|---|---|
| Asset version | glTF 2.0 |
| Primitive mode | `TRIANGLES` (`4`) only |
| `POSITION` | non-normalized `FLOAT`, `VEC3`, required |
| `NORMAL` | `FLOAT`, or normalized `BYTE`/`SHORT`, `VEC3`, optional |
| `TEXCOORD_0` | `FLOAT`, or normalized `UNSIGNED_BYTE`/`UNSIGNED_SHORT`, `VEC2`, optional |
| Indices | `UNSIGNED_BYTE`, `UNSIGNED_SHORT`, or `UNSIGNED_INT` `SCALAR`; generated when absent |
| Layout | tightly packed or valid interleaved `byteStride` from 4 through 252 bytes |
| Materials | source material index preserved when present; material cooking is separate |
| Morph targets | one through four `POSITION` delta accessors; mesh default weights preserved |
| Buffers | caller-provided bytes, canonical base64 data URIs, or external resolver callback |

The cooker validates component alignment, accessor offsets, element size and stride, bufferView ranges, declared and supplied buffer lengths, attribute counts, triangle index counts, finite vertex values, and every index against the position count.

## Explicit omissions

This slice cooks static geometry, not a complete glTF scene. The following are not silently approximated:

- skins and `JOINTS_*`/`WEIGHTS_*` attributes are errors;
- morph target normals/tangents, more than four targets, and target weight animation are outside this static cooker;
- sparse accessors are errors;
- non-triangle topology is an error;
- required extensions, primitive extensions, and bufferView compression extensions are errors;
- tangents, colors, secondary UVs, and other un-emitted attributes produce JSON-pointer warnings;
- node transforms, cameras, lights, animations, images, textures, and material properties are outside this geometry cooker.

An error anywhere clears all cooked meshes and reports `outputBytes: 0`; callers do not accidentally ship a partial asset. Warnings remain attached to a successful result so build tooling can promote them to errors when a project requires lossless attribute preservation.

Diagnostics contain a stable code, severity, message, and RFC 6901-style JSON pointer such as `/accessors/3/sparse`, `/bufferViews/1/byteStride`, or `/meshes/0/primitives/0/attributes/JOINTS_0`.

## Bounds and budgets

Default budgets cap buffers, aggregate resolved bytes, bufferViews, accessors, meshes, primitives, vertices, indices, and output bytes. Every configurable limit also has a hard ceiling. Output size is conservatively checked before typed-array allocation, while the exact emitted size is returned as `outputBytes`.

Choose smaller project-specific limits when importing untrusted assets. The defaults are intended as an engine safety ceiling, not a recommended per-asset budget. GPU upload, material/texture memory, node count, draw-call count, and WebGL context limits must still be enforced by the consuming renderer.
