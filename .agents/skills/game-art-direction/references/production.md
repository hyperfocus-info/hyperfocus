# Choose the production path before generating assets

The common flow is intent → cheap comparisons → selected bounded recipes →
generation/integration → objective checks → rendered review. Its execution can be
shared; the asset source, runtime and taste cannot be inferred from a genre label.
Use repository code and rendered evidence to distinguish implemented, integrated,
and merely possible capabilities. File existence or a PBR field is not proof of a
finished visual result.

Music films and mixed media use the [branching recipe inventory](../../../../apps/engine-editor/docs/media-production/README.md),
which separates subject, action, exposure, camera and editing from post effects.
Narrative films additionally use its [creative contract](../../../../apps/engine-editor/docs/media-production/narrative-quality.md):
visual meaning must develop through preparation, highlight and consequence.
Inspect source resolution, complete action and spatial relationships before effects;
a beautiful still or frequent pixel changes cannot establish a coherent sequence.

Before detail, establish four independent decisions in the consumer's short art
document: player activity and camera; visual language/mood; asset production path;
and runtime/renderer owner. Inspect approved scope first. Ask only missing concrete
visual comparisons. Resolve technical constants through the code and evidence.

| Request | Reusable infrastructure | Game-specific work to establish first |
| --- | --- | --- |
| Photoreal third-person shooter | Character motor/camera; glTF skin/animation and material maps; recipe binding; capture/review. | Licensed authored/scanned meshes and calibrated material sets; human rig/clip adaptation; aim/recoil/reload/cover contacts; production lighting, LOD/texture budgets and actual renderer proof. Do not use a procedural ceramic body as the fallback. |
| Voxel sandbox | Camera/input/collision; bounded terrain streaming; editable voxel occupancy, exposed-face region meshes, AABB queries and snapshot restore; replay/capture/review. | Wire the bounded volume into live edit controls, movement collision, durable saves and streaming/world budgets. A generated voxel mesh is not a completed sandbox. |
| Vibrant children's game | The mechanics appropriate to its activity, renderer styles, recipe binding and common evidence loop. | Owned silhouette/semantic color rules, age-appropriate readability, forgiving feedback, motion/camera comfort and an uncluttered scene. Bright saturation alone does not establish any of these. |

Current renderer facts belong to the engine's
[WebGL2 contract](../../../../packages/engine/docs/first-party-3d-webgl2.md),
[motion contract](../../../../packages/engine/docs/motion-system.md), and
[terrain/3D core](../../../../packages/engine/docs/first-party-3d-core.md).
The first-party renderer supports standard material maps but has explicit limits,
including environment/IBL and several shadow/texture features. Select and prove a
different renderer path deliberately if the brief requires one; label authoring
proxies and final runtime separately. Do not silently call the existing subset a
complete photoreal pipeline. The separate bounded play pipeline now integrates
live voxel editing, collision/render occupancy and state restore; it does not add
infinite-world streaming or inherit Pale Reach or Touch of Death's taste.

The [brief-driven scene generator](../../../../apps/engine-editor/scripts/game-art/README.md)
now handles primitive recipes, licensed static glTF primitives, standard image maps,
voxel meshes and repeated placements through one command. Use its actual catalogue
and source cache. It produces editable projects and native review evidence without
new build/capture scripts. Use its [playable path](../../../../apps/engine-editor/scripts/game-art/README.md#playable-pipelines)
for bounded shooter, sandbox and collectathon loops, all three child styles,
explicit authored skin/clip bindings and event-bound particles. Its normal flow
captures the consumer's gameplay/motion replay and contact/phase evidence. Proxies
remain ROUGH; authored clip transport is not human-motion quality approval.
The [voxel API](../../../../packages/engine/docs/voxel-volumes.md)
supplies edit/query/mesh/snapshot agreement within a bounded volume.

Prefer existing authored assets and clips when their production path fits. Record
source, license, scale, rig and adaptation. Use procedural geometry for forms it
can express well, with constrained recipes. Hybrid work can combine authored
hero assets with procedural layout/variation. Raster generation does not supply
editable topology, rigging or collision merely because its concept looks strong.

A new consumer owns: a short constitution and scoped references; actual required
asset/action requests and recipe implementations; project persistence through the
editor command API; domain objective checks; replay and capture adapter; and its
review manifest. Use `treatment`, strength and tradeoff for every recipe. Declare
evidence by asset family: motion needs contact/phase views, materials need lighting
comparisons, and editable worlds need edit/seam/restore proof. Keep
unimplemented requirements in `art-workflow.json` blockers until the corresponding
runtime/asset integration exists. The runner's `--plan` validates files and exposes
those blockers; it is not an automatic aesthetic or capability oracle.

Use the shared [workflow runner](../../../../scripts/game-art/README.md) and
[capture host](../../../../apps/engine-editor/verification/game-art/README.md).
Freeze replay inputs durably before polishing. Keep serial GPU capture, explicit
phases, source-clock metadata, immutable versions and the existing review store.
An earlier human-preferred result remains the reference even when a newer solver
scores better numerically. Pale Reach's zero planted-foot sliding did not win its
owner's motion comparison; do not advertise that gait as a transferable default.

Do not build three demonstration games to validate a workflow edit. Exercise real
consumer adapters and failure/recovery tests, then state which production paths
remain unimplemented. New genres become effortless only as proven generators and
runtime integrations accumulate; a launcher or skill paragraph cannot supply them.
