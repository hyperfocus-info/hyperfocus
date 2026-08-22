# Portable 3D projects

The `3d-action` starter is the shortest complete 3D author-to-build path:

```sh
bun run create:project -- 3d-action ./my-3d-game
bun run dev:game -- --project ./my-3d-game
bun run build:game -- --project ./my-3d-game
```

Creation writes exactly `.hyperfocus/project.json` and `.hyperfocus/assets.hfp`. Dev output is disposable and the release is one offline HTML file. The runtime makes no CDN or network request.

## Portable declaration

`project.json` declares `extensions.hyperfocus3D` version 1. It contains explicit budgets, named mesh and texture sources, materials, scenes, cameras, lights, entities, input controllers, rigid bodies, transform animations, and audio/save policy. Assets are referenced by the existing project asset IDs:

```json
{
  "version": 1,
  "activeSceneId": "level-3d",
  "meshes": [{ "id": "cube", "assetId": "level-gltf", "primitive": 0, "buffers": [] }],
  "textures": [{ "id": "checker", "assetId": "checker-rgba", "width": 2, "height": 2, "filter": "nearest", "wrap": "repeat", "flipY": false }]
}
```

The omitted required sections are `budgets`, `materials`, `scenes`, `audio`, and `save`; use the starter as the canonical complete example. Unknown or missing fields are rejected so typos cannot silently change a build.

Mesh assets are glTF 2.0 JSON (`model/gltf+json` or `application/json`). Base64 `data:` buffers stay inside the glTF asset. External glTF buffer URIs require an explicit `{ uri, assetId }` mapping to another archive asset. HTTP, file URLs, absolute paths, backslashes, and parent traversal are rejected. No resolver performs network or filesystem I/O.

Textures are uncompressed RGBA8 byte assets with MIME type `application/octet-stream`; declared width and height must match `width * height * 4` exactly. This intentionally simple boundary is easy to decode or translate in another engine. Image cooking can happen before packing without changing the runtime contract.

## Validation and budgets

CLI check/build validates the editor project, archive hashes, 3D shape, unique IDs, asset references, scene/camera/light/material/mesh references, RGBA byte lengths, glTF accessors and buffer bounds, and declared capacity budgets before creating GPU resources. Diagnostics point to the offending JSON pointer, for example:

```text
/extensions/hyperfocus3D/scenes/0/entities/2/meshId: Unknown mesh missing-mesh.
```

The glTF cooker supports static triangle meshes with tightly packed positions, optional normals/UVs, and 16- or 32-bit indices. Morph targets, compression extensions, animation clips, and material import are not silently approximated. The v1 project adapter uses authored materials and deterministic entity transform animation. A separate vendor-neutral skin/animation cooker hands glTF skeletons and LINEAR/STEP TRS palettes to the same scene/WebGL2 contracts, but `hyperfocus3D` v1 does not declare skeletons yet.

## Runtime behavior

The browser host uses fixed 60 Hz project steps. A controller consumes the portable `move-left`, `move-right`, `move-up`, and `move-down` actions; physical keys remain in `settings.input`. Optional `physics` declarations create bounded first-party static/dynamic box or sphere bodies, with gravity, contact solving, filtering defaults, and caller-visible diagnostics. The starter drives its dynamic actor through that world against a static floor and pillars. A following camera derives its eye from the actor plus the declared offset. `rotate-y` animation derives rotation from the integer tick, so replay and save restoration are deterministic.

The save declaration provides one bounded named slot and a restore-on-boot choice. Saves use the first-party checksummed profile store over IndexedDB and do not add files to the project. The starter packs a small ordinary WAV cue into `assets.hfp`; first input unlocks the bounded first-party Web Audio controller and plays it under browser gesture policy.

Automated clean-Chromium acceptance creates the starter in a temporary directory, builds and serves its one HTML artifact, verifies WebGL draw/instance/triangle output and visible pixels, drives the rigid-body actor, unlocks audio without diagnostics, saves, reloads into the saved position, and rejects any request outside the local document/data payload.
