# Game art workflow

The [game-art-direction workflow](../../.agents/skills/game-art-direction/SKILL.md)
owns candidate comparison and visual evaluation. This tooling makes accepted asset
preservation executable. It does not assign taste grades or promote assets.

## Run an established consumer

For a new static 3D scene, use `bun run art:create <brief.json>` first. The
[scene generator](../../apps/engine-editor/scripts/game-art/README.md) owns existing
primitive recipes, authored glTF imports, image-map cooking, editable voxel volumes,
repeated placements and native evidence. `--catalog` lists actual supported choices;
working/evidence separation, revision merging and retry attempts are automatic.
Editor AI and packaged `hyperfocus-editor art` call the same app-owned service.
Custom gameplay/motion consumers still use the manifest route below.

For bounded shooter, live voxel sandbox or collectathon loops, use
`bun run art:create --pipeline <genre>`. Collectathon accepts `--style soft-toy`,
`paper-cutout` or `storybook`. The [playable production path](../../apps/engine-editor/scripts/game-art/README.md#playable-pipelines)
owns exact limits, authored rigs, event particles and automatic motion evidence.

```text
bun run art:run apps/engine-editor/verification/pale-reach/art-workflow.json next-v1 --plan
bun run art:run apps/engine-editor/verification/pale-reach/art-workflow.json next-v1
bun run art:run apps/engine-editor/verification/pale-reach/art-workflow.json next-v1 --resume
bun run art:run apps/engine-editor/verification/art-direction/art-workflow.json studies-next-v1
```

The first consumer builds and persists the playable course, obtains its managed
server URL, captures all action/contact/phase evidence, checks keyboard input,
and packages the existing review store. The second runs Touch of Death's existing
offline native silhouette/composition studies. It does not migrate game integration
or reopen the owner's taste selections. Both retain their own art and generators.

The runner executes TypeScript entrypoints with argument arrays through the hidden
process adapter. It records source/prerequisite hashes, outputs, durations, step
failures and immutable logs under `.local/game-art/runs/<id>/<version>/`.
It does not create another grading database or count script retries as art repairs.
Model/usage fields remain null: a deterministic build is not a new model run.

`--resume` skips completed, hash-matching evidence. Changed sources or media require
a fresh version. A failed stage without output can retry; partial evidence is
preserved and requires a fresh version. `--stop-after <step>` provides an intentional
checkpoint. GPU stages run sequentially. Shared servers remain running; owned
isolated servers close on exit. Concurrent runs of the same version are rejected.
An empty SQLite transaction provides the process lock and releases automatically
after a crash; run receipts still decide whether resuming the preserved work is safe.

The consumer JSON declares `id`, `owner`, source paths, hashed prerequisites,
versioned artifact roots, explicit blockers, optional managed surface, and ordered
steps (`id`, `kind`, `entry`, `args`, `outputs`, bounded `timeoutSeconds`). Only
`{version}` and `{url}` expand. Output globs are bounded by versioned artifact roots.
The manifest is trusted executable repository configuration, not untrusted user data.
`--plan` inspects real files and exposes blockers before rendering. It does not
infer that a renderer can deliver a style from a genre label.

For a new game, first choose its production path with the
[domain intake](../../.agents/skills/game-art-direction/references/production.md).
Supply its bounded generator/command persistence, objective checks, and a small
[capture adapter](../../apps/engine-editor/verification/game-art/README.md).
Reuse the runner and capture host. Do not copy Pale Reach's reporting experiments
or Touch of Death's anatomy/timing into a new consumer.

Pale Reach's frozen replay and owner receipts are now durable inputs in its corpus;
ordinary capture/packaging no longer requires an ignored historical build or old
review manifest. Original trial evidence and negative human motion feedback remain
unchanged. The historical `report.ts` describes that trial only; it is not a new-game
template or a general grading policy.

## Sample image proportions

After inspecting a reference, save its landmark annotations in the production's
`.local/` evidence directory and run:

```text
bun scripts/game-art/reference-sample.ts <landmarks.json> <new-measurement.json>
```

Example annotation shape (illustrative coordinates, not an anatomy standard):

```json
{
  "image": "reference.png",
  "source": "Source URL or approved asset/version and scope",
  "view": "Front, neutral pose; full uncropped image",
  "width": 800,
  "height": 1000,
  "uncertaintyPixels": 5,
  "points": { "shoulder": [300, 220], "elbow": [290, 390], "wrist": [310, 540] },
  "ratios": [{ "id": "upper-to-lower-arm", "numerator": ["shoulder", "elbow"], "denominator": ["elbow", "wrist"] }]
}
```

The command reads the image relative to the annotation file and binds both files'
SHA-256 hashes to pixel distances, normalized landmarks and dimensionless ratios.
Dimensions and landmarks are supplied by the annotator, not decoded or detected;
verify them against the inspected image, including orientation/crop. The uncertainty
is a radial pixel bound per landmark; returned intervals conservatively propagate
endpoint error, not statistical confidence or perspective uncertainty. Missing,
nonfinite, out-of-bounds or duplicate data and unresolved denominators fail.
The optional output path is written as UTF-8 and must not already exist; omitting
it prints JSON to stdout. Neither input is modified.

Sample the candidate separately at a matched view and compare the same ratios.
This is offline evidence tooling: it neither changes a rig nor enforces generator
parameters. Follow the [sampling workflow](../../.agents/skills/game-art-direction/references/proportions.md)
to map measurements into production and inspect the resulting blockout.

## Intent before generation

For uncertain shape or scale, first use [image reference sampling](../../.agents/skills/game-art-direction/references/proportions.md)
and the measurement command below; recipe selection alone does not establish proportions.

`@hyperfocus/artifact-review/direction` owns the portable planning contract. A
grammar belongs to a named game/art document and contains bounded recipes:
`id`, `family`, `intent`, `treatment`, `strength`, `weakness`. A request names an
actual required asset/action and its `family` and `intent`; it can select a recipe
when the slot has two or three candidates. Unknown slots, duplicate identities,
unbounded alternatives and unresolved selections fail before generation.

```text
bun run art:plan <brief.json> <plan.json>
```

The brief is `{ "grammar": { "id", "owner", "recipes", "requiredEvidence" },
"requests": [{ "id", "family", "intent", "recipe"? }] }`. The emitted plan binds
every request to its selected treatment and tradeoffs. The AI derives intent and
selects bounded recipes; the consumer implements their geometry, motion, palette
and timing. This is a recipe-selection contract, not a universal humanoid style.
The old `motion` field remains a compatible alias. Non-motion recipes can describe
materials, world structure or shape without combat vocabulary. Conflicting aliases
fail. This vocabulary support does not implement a photoreal or voxel generator.

`requiredEvidence` is the grammar default. Optional `evidenceByFamily` overrides
it for named recipe families: a material can require neutral/grazing light, while
a motion requires contact/phase views. The compiled assignment stores its required
views. Unknown families and empty evidence sets fail. Pale Reach uses overview and
gameplay for the course instead of relabeling a character contact shot as world
evidence. An editable world would need edit/seam/restore evidence from its consumer.

Touch of Death's normal full-slice build calls this compiler and emits both files.
Its city weapon authoring and art slice use the same
[intent and balance owner](../../packages/engine/examples/touch-of-death/src/presentation/city/weapons/direction/README.md).
The builder also audits actual motion signatures, heavy/light differentiation and
nunchaku transfer continuity. New recipe names cannot disguise cloned paths. The
first sweep caught five samey pairs, repaired before the final candidate build.

`validateDirectionEvidence` requires each planned action's declared media and
passing objective checks. Review packaging calls it, verifies file hashes and
binds the plan, recordings, checks and feedback together. It can establish only
CANDIDATE completeness. Owner approval and GOLDEN designation remain separate.

This lowers the choices needed to produce a new asset within established grammar.
Touch of Death's [cosmetic consumer](../../packages/engine/examples/touch-of-death/docs/touch-of-death-cosmetics.md)
also compiles its four particle recipes during ordinary fighter setup. Its tests
reject excessive density/lifetime, nonfinite samples, duplicate render emission,
stale teleport anchors and edits to defensive/impact pools. Its capture command
requires neutral, gameplay, contact, phase and reduced-motion evidence. Rarity is
independent of visual acceptance; a legendary label cannot establish a GOLDEN.
It does not demonstrate a weaker model producing a high-quality new genre.
[Pale Reach](../../apps/engine-editor/verification/pale-reach/README.md) is the
bounded third-person traversal consumer: independent ceramic character and
aqueduct direction, matched replay evidence, contact gates and recorded repairs.
Its within-project comparison is not an isolated test of workflow causality or
fewer repairs. The consumer's result record owns those limits.

## Accepted asset preservation

From repository root:

```text
bun run art:check packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/constraints.json
bun run art:check <constraints.json> <asset-inventory.json>
bun run test:game-art
bunx tsc --noEmit -p scripts/game-art/tsconfig.json
```

The first form checks archived evidence and asset bytes, then reports the owning
constitution, corpus and exact lock scope. The second also checks candidate assets;
the inventory is `{ "assets": [{ "id": "asset-id", "path": "relative/file.glb" }] }`,
with paths relative to that inventory. Missing, duplicate or changed locked assets
fail. Extra candidate assets remain editable. Without an inventory, the command
does not claim to have checked a generated project.

Generators call the same manifest-backed API directly:

```ts
import { verifyArtifactConstraints } from '@hyperfocus/artifact-review/constraints';
await verifyArtifactConstraints({ manifestPath, assets }); // [{ id, bytes: Uint8Array }]
```

The [constraint type and validator](../../packages/artifact-review/src/constraints.ts)
own schema version 1. Relative paths locate a constitution and corpus; each named
lock contains its narrow scope, hashed evidence files and hashed asset files.
Malformed/empty locks and duplicate identities fail. A successful report says
`constraints-preserved`; it never means APPROVED or GOLDEN.

Touch of Death is the first consumer. Its [durable constraints](../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/constraints.json)
bind the actual v14 forearm GLBs to the reviewed image and a scoped receipt exported
from the existing review-store. The normal slice builder checks generated bytes,
entity bindings and scale before writing its artifact, and emits `art-constraints.json`.
Locomotion comparison checks against this durable owner, not the previous candidate.
Neither path depends on the ignored `.local` review database or v14 build to preserve
these locks. New human feedback still uses the existing review-store authority.

The manifest is trusted repository policy, not authentication: editing its hashes
cannot manufacture approval. Preserve its evidence and obtain an explicit scoped
reopen before changing an accepted quality. Encoding-only asset changes still fail
the exact-byte gate; demonstrate equivalence and update the binding deliberately,
without reinterpreting the owner's original scope. Shader, pose and camera changes
can alter perceived mass despite equal geometry and still need rendered comparison.

`test:game-art` combines the shared constraint consumer tests with Touch of Death's
real source-transfer/full-cycle knee regression, gait cadence and moving-neutral
checks, attack grammar, quality ladder and exact-byte owner-feedback verification.
For native renderer/contact/transition checks use the game's
[evaluation commands](../../apps/engine-editor/verification/art-direction/README.md).
The [corpus](../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/README.md) has scoped
accepted references and negative examples; no complete asset is GOLDEN.
