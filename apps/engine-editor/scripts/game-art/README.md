# Generate a directed scene from data

From the repository root:

```text
bun run art:create --catalog
bun run art:create apps/engine-editor/scripts/game-art/examples/construction.json --plan
bun run art:create apps/engine-editor/scripts/game-art/examples/construction.json
```

One brief produces an editable canonical editor project, a native WebGL2 preview,
overview and per-asset detail/top images, and immutable candidate records through the
existing artifact-review/review-store implementation. The managed Editor hosts both
previews and the review UI. Repeating an unchanged command verifies immutable hashes
and reuses completed work. `--retry` keeps failed evidence and allocates a new attempt
under the same content identity. `--build-only` creates ROUGH output; a later full run
creates its own rendered submission. The returned `project` is an editable working
directory, separate from `output`, which is immutable evidence.

Programmatic `assemble({ input, file, salt, cacheRoot })` can put model and decoded
image caches in an explicit task directory without changing the process working
directory. Omit `cacheRoot` to retain `.local/game-art/cache` under the working
directory. RGB palette overrides preserve the selected material preset's alpha.
Primitive boxes span -1 through 1 before part scaling: a part scale of 0.5 makes
a unit cube. Placement scale is an additional transform. Check the assembler's
returned `bounds.minimum`/`bounds.maximum` before staging contact or cameras.

Use `--project <directory>` to revise an existing canonical project. Stable generated
ownership is merged by ID and field: unrelated work and manual transforms survive;
overlapping edits fail with a field path. The filesystem command uses the snapshot
hash for stale-write protection. Browser Apply uses the live revision and one Undo.

## Editor AI and packaged use

The Project assistant exposes `art.generate` and `art.revise`. It receives native
selection/material context, portable recipes, bounded conversation and scoped saved
feedback. Missing choices produce a readable clarification. **Prepare rendered
candidate → review → Apply candidate → Revert candidate** uses the same app-owned
[`service.ts`](service.ts) as the CLI. **Generate from art brief** offers a direct UI
entry. Existing images/models must be imported, then referenced as `asset:<id>`;
the browser planner cannot read arbitrary files or execute shell commands.

The loopback API exposes `GET /api/art/v1/catalog`, `POST /api/art/v1/prepare`
(`input` brief or `changes`, `current` snapshot, portable `assets`, optional `retry`),
and `POST /api/art/v1/feedback`. Preparation changes no working project. Its validated
`plan` applies through the existing command session; its links open immutable media
and the existing review UI in the Editor host. Failures return `status`, `error`,
diagnostics where available, retained evidence and a retry action.

An extracted Editor supports `bun cli.js art <brief.json> --project <directory>`
and `art --catalog`. It ships renderer/decoder/review bundles and their identities.
Source models (including external buffers), encoded maps and owned constraints
travel in the canonical asset pack. No checkout generator scripts are required.
Direct CLI capture uses an owned hidden browser; `--url` uses a managed Editor URL.
Review history stays authoritative in its SQLite store: move its descriptor and
database with a project if relocating the review authority to another machine.
Cross-machine relocation is currently an explicit host operation: restore the
database and manifest, then update the descriptor paths through the command API.
There is no automatic review-store relocation command. Missing authority blocks
revision instead of silently dropping feedback or creating an empty store.

This handles static scenes and the bounded playable pipelines below; it is not a prompt-to-complete-game promise.
It requires no consumer build/capture scripts. Agents interpret the user's brief
and own taste choices, then express bounded recipes as data. Unknown generators,
looks, materials, intent slots and fields reject rather than substituting an asset.
The [example](examples/construction.json) combines all three implemented routes;
its composition and colors are structural test data, not approved visual defaults.

## Brief contract

[`schema.ts`](schema.ts) owns validation. A brief declares identity, owning art
document, intent, a selected existing look, bounded recipes, actual asset requests,
semantic materials and placements. Camera is optional: the generator fits the
combined model bounds when it is absent. An explicit camera remains authoritative.
Each recipe retains family, intent, treatment, strength and tradeoff and is bound
by the existing direction compiler before generation.

Recipes implement:

- `primitives`: the existing editable box/sphere/capsule tuple grammar, up to 64
  parts per mesh. Useful for blockouts and forms that suit it.
- `gltf`: a local GLB/glTF, explicit primitive index, license/source declaration,
  and `materialPolicy: "explicit-override"`. Local external buffers are included
  automatically. Optional `rig: {meshIndex,primitiveIndex,skinIndex,meshNode,
  clips:{stableClipId:"Exact source clip name"}}` binds a selected authored skin
  and clips through the existing editor rig path. Bone rest positions use model
  space. Missing source clips reject. It does not import an embedded material bank
  or automatically retarget a human. Unsupported geometry fails native cooking.
- `voxels`: bounded size, cell size and ordered solid/subtractive box edits.
  The shared [voxel volume](../../../../packages/engine/docs/voxel-volumes.md) removes
  hidden faces. Its editable snapshot travels with the portable project.

Materials select real preset IDs from `--catalog`; optional semantic colors,
roughness, metalness and standard PNG/JPEG/WebP maps remain editable. Image decoding
uses the editor's actual texture cooker in an owned hidden browser. Map paths and
glTF buffers resolve relative to the brief inside the workspace. Five slots are
supported: base color, metallic/roughness, normal, occlusion and emissive. They are
not evidence of a full photoreal lighting pipeline; native renderer limits remain.

Placements refer to asset/material IDs. Optional `repeat: {count:[x,y,z],step:[x,y,z]}`
expands to separately editable entities sharing a mesh. One submission supports
10,000 instances, 256 materials, 64 MiB decoded textures, and bounded source files.
Larger work belongs in multiple scenes/chunks rather than unbounded generation.

## Reference-driven reconstruction

The same CLI, **Generate from art brief**, and `art.generate` accept
`{ "reconstruction": ... }`. [`reference/reconstruction.ts`](reference/reconstruction.ts)
owns the typed input and deterministic component compiler. It produces an ordinary
editable brief with a portable reference contract; it is not automatic segmentation
or a finished image-to-3D model. Import images first for browser requests and use
`asset:<id>`; filesystem sources must be inside the workspace.

Declare `id`, `name`, `owner`, `intent`, `look`, `source` (image, SHA-256, width,
height), camera `fovYRadians`, `near`, `far`, and `patches`. Each patch has an ID,
the same `sourceSha256`, and disjoint named components. A component supplies:

- Measured full-image pixel `bounds: [left,top,right,bottom]`, pixel uncertainty
  and tolerance. Visible fragments of occluded objects are not full-object bounds.
- Designed `depth` and positive `thickness`, plus `hiddenGeometry` rationale.
  Depth is not recovered from one image. Fit failures require revised depth or shape.
- A primitive shape, closed `lathe` profile of `[y,radius]` points, or closed `sweep`
  with `{position:[x,y,z],radius}` nodes. These create real volume, not image planes.
- A material preset/color and optional metallic/roughness. Semantic landmarks need
  both an explicit mesh-local point and observed image pixel; never invent hidden points.

Independent workers can author component patches against one frozen source and
camera. Merge rejects duplicate ownership or stale source hashes and is independent
of patch order. Geometry and materials deduplicate; unchanged geometry uses the
existing verified cache. Keep GPU captures bounded rather than launching a browser
per component. This avoids repeated cooking, not the need to author good shapes.

The compiler fits **actual native mesh vertices under perspective**, including
near-face expansion of thick objects. Surface extrema become axis-specific anchors;
custom landmarks retain both axes. Source dimensions are decoded and checked, and
original bytes travel in the asset pack as evidence. A whole-image plane is not a
reconstruction.
Profiles and component transforms remain editable through the saved brief.

Enforcement layers:

| Boundary | Executable behavior |
| --- | --- |
| Typed input and compilation | Strict schema, finite coordinates, camera/depth limits, source identities, disjoint ownership, fitted surface anchors and geometry budgets |
| Editor mutation and save/open | Engine project validation rejects landmark/ratio drift, depth collapse, missing bindings and changed geometry identity before history commits; normal undo remains available |
| Runtime startup | Actual source/mesh bytes must match hashes; cooked mesh depth must match calibration. Unsupported skins, variants, external buffers or nonzero primitives fail explicitly |
| Live frame compilation | Current world transforms are checked against the fixed reference camera before rendering; inspection orbit cameras do not change the target |
| Candidate review | Exact reference image plus front/left/right/back/top/bottom scene and per-mesh captures are required and retained in the existing review store |

The portable [engine contract](../../../../packages/engine/docs/project-portability.md#reference-geometry)
is the authority across clients. Revisions preserve its baseline and report conflicts
with manual changes. Replacing geometry requires measured recalibration; dropping
the contract or inflating tolerances is not a repair. Re-author camera/measurements
together when intentionally changing the reference. The first implementation guards
static calibrated geometry, not arbitrary skeletal anatomy during animation.

`reference-quality.json` separates geometry checks, orbit coverage, unmeasured
visual fidelity and unapproved hidden geometry. Sparse anchors cannot establish
95% appearance. Before claiming a requested fidelity target, compare complete
source-view silhouettes/occlusion, identity-bearing shapes, typography, materials
and lighting, plus coherent orbit views. Do not average away a failed hero region.
No full-image perceptual gate or automatic high-fidelity reconstruction is implemented.
Ornament, fur, lettering, transparency and atmospheric treatment need suitable
authored geometry/material paths; a passing primitive blockout remains a blockout.

For detailed source-driven modeling, [`reference/surfaces.ts`](reference/surfaces.ts)
builds closed ellipsoids, tubes, lathes and masked curved relief from measured pixel
coordinates. Ellipsoids fit their actual projected vertices while retaining an
affine ellipsoid volume; matching a screen outline must not warp a round body.
[`reference/depth.ts`](reference/depth.ts) refines selected camera-space depths while
preserving source projection, connectivity and UVs, with corrected surface normals.
Depth remains a designed choice that needs profile evidence.
`roundedBack` tapers relief to its contour and supplies a rear dome;
hidden anatomy and architectural backs still need deliberate modeling. Masks can
recover actual letter contours and holes rather than substitute a font or box.
The helper retains source-facing UV samples and explicitly assigned rear samples.
Use separately lit volumes for designed backs; baked source illumination is not a
relightable material. Do not count painted detail as modeled geometry.
[`reference/surface-brief.ts`](reference/surface-brief.ts) writes these groups to
ordinary GLBs and briefs consumed by the existing art service. Optional material
`shading` and `doubleSided` overrides survive the scene look recipe. An enclosing
sky uses its own clean background texture, without duplicate foreground objects.
`unlitSampledGroups` preserves explicit texture UVs without changing measured
landmarks or volumes. Material choice and reference enforcement are separate.
`mergeWith: { componentId: targetId }` composes related components into one editable
mesh after each member's material UVs are mapped. Merges require the same source,
material and calibration status, reject chains/cycles, and retain member IDs in
the receipt. Palette slots remain distinct; bounds and anchors use combined geometry.

[`reference/material.ts`](reference/material.ts) packs source emission separately
from the lit rear palette through existing PBR texture slots. Optional
`bakedSource.rearSamples` selects normalized source rectangles, one per rear color
(`null` retains that color). The shared atlas adds a bounded 128-pixel band with
two-pixel slot padding. These are material swatches, not hidden-geometry evidence.
The surface writer accepts group-ID `rearSamples` and `rearRepeat` (default 1,
or a group-ID map), mapping only identified rear vertices by their dominant normal.
Each rectangle refers to the group's actual source image, including texture overrides.

[`reference/comparison.ts`](reference/comparison.ts) reports camera-registered RGB
residuals for named regions. Keep those residuals separate from fidelity percentages:
texture transfer can reduce pixel error while hidden geometry still fails. Inspect
side/back and isolated geometry as well as the matched source camera.
Whole-scene inspection views fit every calibrated foreground bound; source-camera
captures remain fixed. Background enclosures do not set foreground framing.
Standalone reference projects preserve the source aspect ratio, with the longer
canvas dimension bounded to 1120 pixels; ordinary projects retain their default size.

Focused checks: `bun test apps/engine-editor/scripts/game-art/reference`
and `bun test packages/engine/src/project/3d/reference.test.ts`. The native art run
captures six-view evidence automatically for a reference brief.
For a generated project, run `bun apps/engine-editor/scripts/game-art/verification/verify-reference.ts
--url <managed-editor-url> --project <project-directory> --output <.local/evidence-directory>`.
For a larger trusted local project, explicitly pass `--max-hydration-mib <MiB>`
within the editor API's existing range; the default remains 24 MiB.
It exercises visible rejection/recovery, permitted edits, Undo, Save/Open, Play and
offline export using an owned hidden browser. It proves those journeys, not fidelity
or sustained frame-rate performance.

## Work reuse and evidence

Generated geometry caches by recipe and cooker source. Colors and placements do
not enter the geometry key. Images cache by encoded bytes and decoder source.
Cache hits verify output hashes. A voxel edit changes that mesh; unchanged meshes
and maps remain reusable. Imported mesh bytes are preserved with source/license
provenance. Project writes use one atomic editor command plan; archive files are
never authored directly. `hyperfocusArtSource` retains recipes and voxel snapshots.

The app service records content identity separately from execution attempts, with
input, dependency, output and failure receipts under `.local/game-art/candidates`.
Actual bundle dependencies determine invalidation; unrelated tests and README files
do not. Geometry, image decoding and rendering have distinct identities. Review items use
content-derived versions and the existing review store under
`.local/game-art/review/feedback.sqlite`. No grades are synthesized. These static
views cannot approve motion, gameplay, camera comfort or a whole visual style.
`review-descriptor.json` binds namespace, item versions, manifest and database; the
standard review host recognizes it too. Revisions consume saved history from that
authority. `--constraints <manifest>` imports explicitly owned byte locks through
the existing artifact constraint verifier; subsequent revisions enforce the packed
locks against bound mesh IDs. Feedback alone never creates whole-asset locks.

Projected bounds, required asset participation and framebuffer diversity reject
empty/offscreen evidence even when draw calls are nonzero. These are objective
evidence checks, not silhouette, composition or taste grades.

Focused verification:

```text
bun test apps/engine-editor/scripts/game-art packages/engine/src/content/voxel-volume.test.ts scripts/game-art
bunx tsc --noEmit -p apps/engine-editor/scripts/game-art/tsconfig.json
bun scripts/game-art/verify-generation.ts
```

The last command runs actual native generation, unchanged reuse, palette-only
revision, 1,002-instance batching and a voxel edit. It saves raw logs, candidate
paths, work counts and timings under `.local/game-art/generation-verification`.
Counts establish avoided work; these local runs are not a controlled speed benchmark
or a causal test of rendered taste. Independent agent/model comparisons remain open.

## Playable pipelines

```text
bun run art:create --pipeline shooter --project .local/my-range
bun run art:create --pipeline sandbox --project .local/my-blocks
bun run art:create --pipeline collectathon --style soft-toy --project .local/my-toy-game
bun run art:create --pipeline collectathon --style paper-cutout --project .local/my-paper-game
bun run art:create --pipeline collectathon --style storybook --project .local/my-story-game
```

Pass `--url <managed-editor-url>` to use an existing managed host. The Editor
assistant contains the same five starter buttons; AI `art.generate` accepts
`{pipeline:"collectathon",style:"storybook"}` as its brief. All three child
languages are supported choices, not engine defaults or whole-style approvals.
The [runtime contract](../../../../packages/engine/docs/playable-pipelines.md)
states the actual movement, interaction, animation and save boundaries.

Shorthand expands into editable data in `hyperfocusArtSource`. `art.revise`
accepts nested partial gameplay changes, e.g. `{gameplay:{movement:{speed:3}}}`;
arrays replace explicitly. Manual edits merge by field and conflicts reject.
Generation into an existing project retains its scenes and respects hard budgets.
The new play extension cannot replace an existing combat owner.

Full playable briefs add `gameplay` and `evidence`. Evidence contains a gameplay
`replay:{sequence:[{ticks,actions}]}`, selected `phases`, and a `motion` object
with its own replay/phases. The consumer owns meaningful inputs. Every normal
preparation automatically captures gameplay, effects-off isolated/contact clips
and phase strips at 960×540, 30 encoded fps, 60 Hz simulation, then registers them
in the same immutable review store as stills. The existing Editor WebM encoder
assigns explicit frame timestamps and records every source tick; recorder startup
cannot advance gameplay. Decoded start/middle/end frames and duration are checked.
These silent studies are not 60 fps audiovisual acceptance. Proxies stay ROUGH.

Effects bind gameplay events to bounded [3D particle recipes](../../../../packages/engine/docs/particles-3d.md).
Materials accept `alphaMode` including `additive`; `sprite` accepts soft-disc,
paper-star, brush-dab or smoke masks. An authored base-color map is an alternative,
not an additional ambiguous sprite source. Skinned character generation requires
the exact phase clips for that genre. No missing clip falls back to a generic pose.

```text
bun apps/engine-editor/scripts/game-art/verification/verify-pipelines.ts --url <managed-url> --output <new-evidence-directory>
bun apps/engine-editor/scripts/game-art/verification/verify-playable-editor.ts --url <managed-url>
```

The first freezes and renders all five bounded cases. The second exercises the
five UI entries, Prepare/Apply/exact Undo, keyboard collection in Editor Play and
an offline HTML Build with network blocked. It is a UI/command handoff test;
live LLM planning is separately exercised by `verify-editor.ts` below.

Replay the actual UI/AI journey against a managed Editor (source or extracted)
using the construction fixture's returned working project:

```text
bun apps/engine-editor/scripts/game-art/verification/verify-editor.ts --url <managed-url> --project <fixture-working-directory> --agent <available-agent> --model <available-model> --reasoning low
```

This makes two live model requests, prepares and applies a palette candidate,
checks exact Undo, saves explicitly labeled integration feedback with no grade,
continues the conversation, and opens native Play. Requests, timings, screenshots
and browser cleanup are retained under `.local/game-art/editor-verification`.
Use a disposable construction fixture: its feedback is test data. The model must
already be configured; this is product integration evidence, not a model comparison.

The [2026-10-05 integration audit (temporary; prune after findings are promoted)](../../../../.local/repository-audit/reports/art-factory-integration-2026-10-05.tmp.md)
records the original failures and links their repair evidence. Static production
does not establish gameplay, motion quality or photoreal renderer completeness.
