# Portable 3D projects

The `3d-action` starter is the shortest complete 3D author-to-build path:

```sh
bun run create:project -- 3d-action ./my-3d-game
bun run dev:game -- --project ./my-3d-game
bun run build:game -- --project ./my-3d-game
```

Creation writes exactly `.hyperfocus/project.json` and `.hyperfocus/assets.hfp`. Dev output is disposable and the release is one offline HTML file. The runtime makes no CDN or network request.

`gameplay.presentFrame` owns the default combat presentation pipeline. Hosts that
compose it themselves can import `presentCombatCamera3D` and
`presentCombatObstructions3D` from `@hyperfocus/engine/project/runtime-3d`: fit the
camera first, then apply cutaways after the final camera and articulated pose.
These hooks change the presentation frame without changing combat state.

## Portable declaration

`project.json` declares `extensions.hyperfocus3D` version 1. It contains explicit budgets, named mesh and texture sources, materials, scenes, cameras, lights, entities, input controllers, rigid bodies, transform animations, and audio/save policy. Materials support the glTF-aligned base-color, metallic/roughness, normal, occlusion, and emissive map set, a shared UV transform, and PBR/toon/retro/hologram shader styles. Assets are referenced by the existing project asset IDs:

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

The glTF cooker supports triangle meshes with tightly packed positions, optional
normals/UVs, 16- or 32-bit indices, bounded position morph targets, and
four-weight skeletal skinning. Portable rigs name source animation clips and
entities bind a rig, skin, and mesh node; exact-frame performance tracks add trim,
speed, looping, blending, and root-motion policy without duplicating model data.
Adjacent protected blends use an endpoint-complete smootherstep curve over their
authored frame count. The first frame has weight zero, the final blend frame has
weight one, and both analytic endpoint velocities are zero; there is no residual
linear step when the blend record disappears on the following frame. The curve is
derived only from absolute frame and therefore matches fixed-tick gameplay, scrub,
Play, and delivery sampling.
Extracted root motion is opt-in and has separate loop and adjacent-segment boundary
policies. Ordinary authoring accumulates both: the evaluated frame carries the
bounded list of completed contiguous spans needed to reproduce displacement from an
arbitrary seek. Loop `reset` is an explicit discontinuity. Segment `reset` rebases
through the protected incoming blend and becomes immediate only with a hard cut.
Each span is sampled from its trim point using its own speed and loop policy. The
runtime scales the resulting local displacement by the entity scale, rotates it into
world space, and removes the same X/Z or XYZ channels from the blended skeleton so
the entity and root bone cannot apply travel twice. Ground-plane extraction preserves
animated vertical root movement in the pose. Capability preflight rejects ranges
where transform motion or physical bodies also own the same entity displacement.
Root-motion `authority` defaults to `transform` for compatible direct scene travel.
`physical` authority reuses the same extracted clip and absolute-frame offsets, but
converts each frame-to-frame delta into a bounded target velocity for the entity's
mapped active ragdoll. The shared rigid solver determines accepted travel against
contacts and breakable bodies; the renderer consumes that body result and never adds
the clip offset again. Physical authority requires an entity-level ragdoll binding,
continuous loop and clip boundaries, and one unchanged authority across a protected
blend. It does not steer tracked airborne bodies and yields completely while the
ragdoll is passive, settled, or recovering. Whole-body planted supports distribute
the requested ground reaction across unplanted bodies using center-of-mass velocity,
so the support contact remains fixed instead of dragging with the animation root.
Joint, effector, and launch actions take deterministic priority over simultaneous
clip locomotion; the runtime suppresses the competing drive and reports the source
segment pointer once. The compiler derives every delta from
absolute frame data and checkpoints the ordinary physical world, so direct scrub,
sequential Play, canonical preview, and export reproduce the same state without a
playback-history accumulator.
The vendor-neutral cooker evaluates bounded glTF LINEAR/STEP TRS animation into
the same scene/WebGL2 contracts. Compression extensions, glTF weight animation,
normal/tangent morphs, and automatic material import are rejected rather than
silently approximated; the v1 adapter continues to use authored portable
materials.
Portable pose corrections may declare `rotationSpace: "model"`. Model-space deltas
are applied against the bone's current evaluated model rotation and converted back
to local TRS through the same cooked hierarchy, preserving semantic action mechanics
across different bind-axis conventions. Omitted or `"local"` preserves the legacy
bone-local post-multiply behavior. Both paths are absolute-frame inputs to the same
skinning and active-ragdoll motor pose.

## Runtime behavior

Authored gameplay uses the existing project `behavior` component and project source
files. `createGameplay3D({ project, runtime, behaviors })` executes those bindings
against the same DOM-free world in Editor Play and standalone delivery. Its callback
receives fixed-step actions and press edges, portable per-component state, the scene
snapshot and physical body positions/velocities. It returns state, validated
`teleport`, `velocity`, `impulse`, `rotate` or quaternion `pose` commands, accessible
presentation and asset-referenced audio. The whole returned batch validates before
any command or state commits. Missing compiled source fails explicitly. State is
bounded finite JSON; commands cannot address unknown entities or apply impulses to
static bodies. Rotation commands synchronize authored physical and visual orientation.

The browser hosts project the same presentation into readable objectives, metrics,
44-pixel action controls and a focused introduction/end panel. Normal gameplay
information sits below the scene; narrow releases use normal document flow. Editor
Play retains its host size and restores layout on exit. Standalone delivery buffers
short keyboard taps, exposes pause, volume and motion controls, and reuses visible
Save/Restore/Export/Import controls. Saved profiles retain script state, entity poses
and linear body velocities. Hosts drain audio commands every rendered frame; headless
consumers must drain them while advancing long simulations as well.

`game.readPhysicsDiagnostics()` returns detached counters for the runtime physics
world and, when combat is authored, its current knockout world. Read again after
reset or restore: portable KO restoration creates fresh counters, while local
rollback restores checkpointed counters. [Rigid 3D](rigid-3d.md) owns the per-step
and cumulative counter semantics.

The browser host uses fixed 60 Hz project steps. A controller consumes the portable `move-left`, `move-right`, `move-up`, and `move-down` actions; physical keys remain in `settings.input`. Optional `physics` declarations create bounded first-party static/dynamic box or sphere bodies, with gravity, contact solving, filtering defaults, and caller-visible diagnostics. The starter drives its dynamic actor through that world against a static floor and pillars. A following camera derives its eye from the actor plus the declared offset. `rotate-y` animation derives rotation from the integer tick, so replay and save restoration are deterministic.

`sample3DFrame({ declaration, clock, viewport, timeline?, simulation? })` is the canonical evaluation seam. A fixed gameplay tick and a video frame at the same time produce the same ordered entity transforms, material looks, lights, camera, deterministic seed, and explicit render-graph request. Precedence is project declaration, then current simulation state, then timeline overrides. Play, standalone builds, canonical video preview, and video export all consume this evaluator; a video host does not recreate gameplay state through a second scene model.

For a live runtime, `runtime.sampleFrame({ viewport, timeline?, physicalPerformance? })`
uses that same evaluator at the current simulation tick without first constructing
a save snapshot and entity map. The returned frame remains detached and mutable
for presentation. `snapshot()` keeps its save/replay contract; this path does not
skip offscreen entities or change the fixed simulation rate.

`runtime.viewProjectionForFrame` tolerates a transient presentation shot whose eye
coincides with its target by using the authored viewing direction at the same eye.
Parallel up vectors receive an orthogonal basis. This stateless fallback does not
modify the evaluated frame or save state; valid shots retain their exact matrices.
The lower-level `lookAtViewMat4` continues to reject degenerate input.

`extensions.hyperfocus3DVideo` version 2 is a timeline layer. It stores a linked `sceneId`, entity groups made only of scene entity IDs, material-preset transition tracks made only of scene material IDs, and shot overrides for camera, formations, named scene lights, presentation passes, transitions, titles, and exact impact-frame treatments. An impact cue can derive threshold/edge/color graphics from the canonical scene or reference one cooked scene texture for a hand-drawn still; it never embeds a second image or scene format. Meshes, textures, materials, lights, and entity definitions remain owned by `extensions.hyperfocus3D`. The retired version-1 standalone video schema fails with an explicit migration message instead of being silently reinterpreted.

Capability auditing reports the project pointer, feature, failing boundary, message, and supported alternative. Import/edit validation catches dangling scene, entity, material, light, and custom-impact texture references. Renderer/export preflight additionally checks declared pass support and hydration of every canonical mesh, buffer, and texture asset before a long encode begins.

The save declaration provides one bounded named slot and a restore-on-boot choice. Saves use the first-party checksummed profile store over IndexedDB and do not add files to the project. The starter packs a small ordinary WAV cue into `assets.hfp`; first input unlocks the bounded first-party Web Audio controller and plays it under browser gesture policy.

Gameplay saves include optional versioned rigid contact history: body IDs,
ground/wall observations, four-point manifolds and solver warm-start impulses.
Restore validates the entire bounded payload before changing the world and
resolves IDs against its live topology, including temporarily disabled surfaces
that the saved environment re-enables. It does not advance physics or reset
combat movement/learning. Older saves without contact history restore with an
empty contact cache, never contacts left by the pre-load scene; exact first-tick
contact continuation requires a newly captured save. Full local rollback
checkpoints continue to retain the complete solver state separately.
`combat-rollback/gameplay.test.ts` covers naturally grounded and airborne JSON
round trips after different live contacts, and `rigid/portable-contacts.test.ts`
covers manifold preservation, body-ID remapping and atomic rejection.

Automated clean-Chromium acceptance creates the starter in a temporary directory, builds and serves its one HTML artifact, verifies WebGL draw/instance/triangle output and visible pixels, drives the rigid-body actor, unlocks audio without diagnostics, saves, reloads into the saved position, and rejects any request outside the local document/data payload.

Structural parity is the portable guarantee: identical evaluated frame state and render commands for identical inputs. Pinned Chromium/device fixtures may use exact or tightly bounded image comparisons. Cross-device comparisons use tolerances because GPU precision, rasterization, and filtering are not byte-identical contracts.
