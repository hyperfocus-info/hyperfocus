---
name: game-art-direction
description: Create or repair game art, or reconstruct reference images as editable 3D scenes, through measured constraints and rendered comparison. Use for characters, animation, environments, VFX, lighting and gameplay HUD; exclude ordinary gameplay logic and first-party editor chrome.
---

# Game art direction

Start with the game's owning art document, saved owner decisions and rendered
examples. Inspect the real generator, rig, renderer and gameplay camera before
replacing assets. A functioning game is not evidence of visual quality.

When proportions or relative scale are uncertain, use
[image reference sampling](references/proportions.md) before inventing dimensions.
Carry measured ratios into the asset recipe and compare a matched blockout before detail.
For image-to-3D work use the [enforced reconstruction path](../../../apps/engine-editor/scripts/game-art/README.md#reference-driven-reconstruction).
Compile measured components through the existing art service; preserve its portable
reference contract through revisions. A geometry pass cannot satisfy an appearance
target. Inspect source and orbit evidence before advancing beyond a blockout.

For a new genre or visual style, first use [production intake](references/production.md).
Separate mechanics, appearance, asset source and renderer capability. A voxel
sandbox is not a block material preset; photorealism is not extra primitive detail;
a children's game is not a palette swap. Establish the missing runtime/asset path
before promising that the art workflow can deliver it.

Use an existing consumer's `art-workflow.json` through `bun run art:run` when one
exists. The [runner](../../../scripts/game-art/README.md#run-an-established-consumer)
owns sequencing, hashes, managed URLs and failure receipts. New consumers reuse
the [capture host](../../../apps/engine-editor/verification/game-art/README.md)
with their own input, cameras and meaningful phases. Do not hand-copy a previous
experiment's many capture/report scripts. Record a blocker rather than emitting
a generic asset for an unimplemented production requirement.

For new static 3D asset/scene production, start with `bun run art:create --catalog`
and the [brief-driven generator](../../../apps/engine-editor/scripts/game-art/README.md).
Use its existing primitive, authored-model, material-map and voxel routes before
writing a consumer generator. Recipes and repeated placements are data; persistence,
automatic versioning, caching and native evidence are already implemented. A palette
change should not recook geometry. For bounded shooter, live voxel sandbox or
collectathon loops use `art:create --pipeline`; all three child treatments are
explicit options. Authored glTF skins and exact phase clips can be bound; the
pipeline does not create production human animation from a genre name. Read the
[playable contract](../../../apps/engine-editor/scripts/game-art/README.md#playable-pipelines).
Its normal preparation includes consumer-owned gameplay and effects-off motion
replays, contact clips and phase strips. Explicit proxy characters remain ROUGH.
Editor AI uses the same service through `art.generate`/`art.revise`, then rendered
candidate review and atomic Apply. Use `--project` for filesystem revisions and
`--retry` after a preserved failed attempt. Open the returned review descriptor/URL;
never edit a versioned evidence project or create a separate feedback database.

For Touch of Death, read its [Art Constitution](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-constitution.md)
and only the relevant examples in its [corpus](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/README.md).
Its [evaluation commands](../../../apps/engine-editor/verification/art-direction/README.md)
own the actual build/capture loop. These are one game's taste, not universal
Hyperfocus proportions, colors or camera settings.

For generation or a repeated quality failure, use the executable
[direction planning contract](../../../scripts/game-art/README.md#intent-before-generation).
Derive intent from the game's mechanics and owner choices, then select an owned
recipe. Unmapped intent is an unresolved design slot, not permission to invent a
generic fallback. A new game supplies its own grammar; it does not inherit this
game's proportions or balance. Read [generation boundaries](references/generation.md)
when establishing that grammar or changing a generation default.

## Preserve what the owner actually approved

Distinguish selected direction, accepted quality and finished asset. “Forearms fit;
locomotion needs work” locks the forearms and requests a motion repair. It does not
approve the entire character. “Mostly good” with a named defect preserves the liked
direction while the defect remains open. Unselected alternatives are not necessarily
BAD; agent ratings and silence are not owner approval.

Use GOLDEN references first, then explicitly approved qualities, then selected
directions, always within their recorded scope. Inspect BAD examples before repeating
their approach. Do not let a newer candidate override an older accepted quality.
If a material taste choice is genuinely missing, ask a concrete visual comparison
question; continue independent work. Do not reopen covered taste or ask for technical
constants the agent can resolve.

Keep the constitution short: intent, shape/proportions, semantic palette, material
family, lighting, composition, motion, VFX and camera. Record accepted/unresolved
qualities and approval source. Preserve enforceable locks with the
[constraint tooling](../../../scripts/game-art/README.md); run the generator's check
before capture. A byte lock protects only its listed assets, not the whole appearance.

## Compete cheaply, then refine

Bound one visual slice. Diagnose root causes across assets, motion, composition,
materials/lighting, integration and validation. Inspect existing libraries and
approved assets before inventing a procedural replacement.

For a new character direction, compare cheap silhouettes suited to its morphology
before expensive detail. Touch of Death's six fighters are one game's competition,
not a universal count or human-anatomy default. For a new environment, compare three
large-form blockouts before props. Material-led work also needs a cheap in-renderer
material/light comparison. For a new action or feedback grammar, compare a few
purposeful alternatives grounded in what the player must read.
These are initial competitions; a localized repair should preserve the chosen direction.
Judge front, three-quarter, side, gameplay distance and silhouette views. Compose
large masses before medium structure and small detail. Avoid random per-asset colors,
primitive assembly, prop clutter and detail that hides weak hierarchy.

For motion or retargeting, read [motion evaluation](references/motion.md).
Evaluate animation without effects before layering hit stop, camera response,
contact flash, bounded VFX and synchronized audio. Keep gameplay legibility dominant.

## Evaluate and remember

Run deterministic checks first: finite transforms, rig/asset links, joint limits,
foot planting, root motion, continuity, collision/spawn/camera clearance, missing
materials/textures, renderer errors and budgets, as applicable. Then inspect rendered
evidence with narrow silhouette, character-design, animation, composition, material,
lighting and slop critics. Record evidence, observation, cause and repair/reject;
do not invent an automated taste score. Critic roles do not require spawning agents.

For Touch of Death arena recordings use the [native capture acceptance workflow](../../../apps/engine-editor/verification/arena-capture/README.md).
Default to 60 fps. Require per-frame source-clock and decoded packet cadence,
subject framing, native knockout/recovery pose alignment, supported lighting and
synchronized sound-on checks. Container
fps or duplicated frames cannot establish source cadence. Keep explicitly silent
studies separate from sound-on acceptance. Run the owning city generation gate
and renderer/cutaway regressions before presenting regenerated scenery.

Keep matched before/after captures at the same input, pose phase, spacing and camera.
Changed bytes get new versions. When requesting human grading, use
[artifact-review](../artifact-review/SKILL.md) and its immutable review store.
ROUGH explores; CANDIDATE has domain evidence and passing objective checks;
APPROVED has repaired critic findings and owner acceptance of that exact scope/version;
GOLDEN has explicit reference designation and no unresolved qualities in that scope.
Do not promote a whole asset from a selected silhouette or a partial repair response.

Save positive and negative visual evidence with hashes, reasons and approval scope
outside disposable build directories. Turn recurring mechanical failures into tests
or tools. Extract a rig, shader or generator default only after a real consumer
demonstrates its benefit; a pending candidate cannot establish a golden aesthetic.
