# Bounded third-person play pipelines

`hyperfocusPlay` version 1 is the portable project extension for three bounded
single-player loops. Editor Play, standalone Build, replay, checkpoint and save
restore use `createGameplay3D`; the editor owns authoring and persistence.

| Pipeline | Implemented loop | Boundary |
| --- | --- | --- |
| `shooter` | Camera-relative movement/jump, shoulder camera with obstruction sweep, aim/aim-move, camera targeting plus physical muzzle occlusion, target health, magazine/reload, completion | Target range; no enemy AI, cover system, networking, weapon inventory or photoreal asset pack |
| `sandbox` | Reach-limited remove/place, self-overlap rejection, shared voxel occupancy/render/collision updates, exact state restore | One explicit grid, at most 4,096 cells; no infinite terrain, chunk streaming, crafting or multiplayer |
| `collectathon` | Collectibles, checkpoint, destination, reset and completion feedback | Small single-player activity; no campaign/content library |

The motor runs at 60 Hz with acceleration, deceleration, turning, buffered/coyote
jump, anticipation, variable jump height and landing phases. Collision is a
conservative upright box against authored axis-aligned boxes. This path does not
promise slopes, stairs, ledge climbing or a replacement for Pale Reach's traversal.
Mapped keyboard actions drive movement and camera; mouse-look and right-stick
camera adaptation are not supplied by these fixtures.

## Author and revise

Use the [directed generator](../../../apps/engine-editor/scripts/game-art/README.md#playable-pipelines)
through Editor buttons, `art.generate`, or CLI. Shorthand expands to ordinary
recipes, materials, placements, gameplay, input and replay data. Proxies remain
ROUGH. All three child treatments—soft toy, paper cutout and storybook—are available;
none is a universal engine aesthetic or an owner-approved finished game.

[`contracts.ts`](../src/project/3d/play/contracts.ts) owns the exact fields and
bounds. `readPlayDefinition3D` rejects unknown fields; `validatePlayBindings3D`
checks the active scene, unique roles, materials, effects, rigs and required
clips. Combat and this play extension cannot own the same project. The generator
also compares cooked geometry with support, target, voxel and actor dimensions.
Units are metres and seconds; player origin is at the feet. Body height includes
the full mesh. Capsule primitive height is two units before recipe scaling.

## Authored animation

`animation.mode: "proxy"` explicitly uses a capsule response for blockout work.
It does not synthesize a skeleton or establish foot/hand contact quality.
`mode: "clips"` requires exact clip IDs, stride distance and transition duration.
Shared phases are idle, start, move, stop, turn, anticipate, rise, fall, land and
celebrate. Shooter adds aim, aimMove, fire and reload; sandbox adds edit.

The generator accepts an explicit glTF skin and named source clips and persists
the ordinary engine rig. Locomotion time follows distance/stride; transitions
crossfade through the existing pose evaluator. The motor owns world travel and
the evaluator removes source root translation, preventing double movement.
The two-joint fixture tests transport and finite evaluation, not human anatomy.
Production full-body clips, foot planting, aim/recoil layering, reload hand
contacts and surface adaptation still require asset-specific integration and
rendered approval. This is not automatic mocap retargeting or procedural IK.

## Effects, replay and validation

Gameplay events bind explicit [particle recipes](particles-3d.md). There are no
style defaults in the engine. Effects-off and reduced-density presentation leave
simulation and saves unchanged. The extension permits 32 emitters and 8,192
aggregate particle slots; each effect names its material and optional mesh.

Snapshots retain phase transitions, movement, camera, interactions, voxel edits
and particle RNG/storage state. Canonical recipe signatures tolerate JSON key
reordering. Invalid restores validate before mutation. Definition changes require
a deliberate saved-state migration, not silent reinterpretation.

Focused checks live in `src/project/3d/play/*.test.ts` and the editor's
`scripts/game-art/playable.test.ts`. Rendered studies and the actual editor/offline
export journey are replayed with the commands in the generator README. Passing
these checks does not approve proportions, motion weight, camera comfort or taste.
