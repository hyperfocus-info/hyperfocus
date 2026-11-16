# Full-song production

This is the reusable owner for chapter continuity, musical cue semantics, cutout
mechanics, derived handoffs and final WebM assembly. It uses canonical editor projects
and the existing media renderer/export receipts. It does not generate a professional
film from a brief or certify human taste. Follow the [production handoff](../../../docs/media-production/handoff.md)
for intent clarification and rendered review.

Persistent `findings` carry anatomy, contact, acting and continuity defects through
revisions, including unchanged shots. A revision cannot erase or redefine them.
Delivery rejects open findings and requires resolutions tied to current chapter
video hashes. New production uses the native editor; the planner rejects external
scene rendering even when a capability gap or selection reason is supplied. Historical
route fields remain readable and the derived handoff retains a permitted route. The
[handoff](../../../docs/media-production/handoff.md) owns the Blender prohibition and
the distinction between native rendering and final media encoding.

`trial-receipt.ts --schema` defines comparable production experiments. Record
revision causes, render attempts, elapsed timestamps, native project/video identity,
remaining gaps and observed review scope. Missing provider token counts are null.
`trial-receipt.ts <receipt.json>` reopens the project, checks export identity and
evaluates calibrated actors. These receipts do not manufacture a human quality grade.
An art-blocked trial still verifies any declared project/video/export-receipt set;
`identityVerified` does not establish prop clearance, acting or artistic acceptance.

Native capture receipts retain queue wait for both previews and exports, plus
preview and export-to-download stage timings. The export duration includes rendering,
encoding and browser download readiness; it is not isolated GPU time. Shared GPU
serialization remains in place; these measurements do not imply a FIFO queue or ETA.

Frame-map assembly writes an ordered H.264 stream with a 44.1 kHz delivery clock.
An empty replacement pass copies that compatible stream and remaps its final packet
duration, avoiding a second lossy encode. Other time bases or reordered pictures
retain the verified encoding path.

## Current input and derived output

`manifest.ts` owns `hyperfocus-music-production-v1`. One current manifest references
immutable chapter projects/videos and the exact original soundtrack. All shot and
chapter frame ranges are global, half-open delivery coordinates; native chapter
projects start at zero. `sourceSeconds = globalFrame / fps`; round source cues once
when choosing the delivery frame. The source may finish within the last video frame.
Paths resolve relative to the manifest file. Revisions preserve the prior manifest;
an authoring or verification command never overwrites it.

Retrieve the schema and validate before generating assets:

```powershell
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-schema
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-plan <production.json>
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-handoff <production.json> <fresh-handoff.json>
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-check <production.json>
bun apps/engine-editor/scripts/music-video/production/assembly.ts <production.json> <fresh-output.webm> <ffmpeg-bin>
```

`production-plan` now fails until every shot has a musical cue and `direction`:
`establish` introduces a fact, `action` names setup/action/reaction/result with
anticipation/event/recovery frames and matching state changes, and `hold` develops
an earlier result. Later beats name earlier causes in `dependsOn`. Actions have a
three-second default timing budget; longer actions require a specific reason.
These are planning checks, not proof that the rendered story communicates them.
Legacy manifests remain readable as candidates; a handoff reports `needs-direction`
until this contract is complete.

## Solve contact before detail

Use the shared [actor motion defaults and repair](../actor-motion/README.md) for
native skeletal corrections or calibrated segmented Blender characters. The
production CLI exposes `production-arm-schema` and `production-repair-arms`;
reuse these implementations instead of copying per-film elbow solvers.

`production-stage-schema` exposes the bounded supported-slide input.
`production-stage <source-project> <action.json> <fresh-project>` jointly solves
one actor's stance, one or two arms, top-surface palm contact, approach/release,
prop support and body/obstacle clearance on every delivery frame. Unreachable
targets and colliding paths fail before key generation. A hand centre is offset
from its contact surface; reaching uses a clearance arc rather than passing through
the prop. The source project is preserved and the result is canonical editable
entity animation, saved and reopened through the command API.

This developer production adapter supports measured, unrotated unit-box geometry
and a stationary support. All scene geometry must be declared; native mesh bounds
are measured and fixed bounds must match the scene. Existing motion overrides are
rejected. It does not retarget character rigs, carry props through free space, solve
two-person interaction, certify dynamics, or supply finished acting. Use it for
mechanical blockouts and retain native timeline controls for editing the result.
The paper-rig `reach` helper also rejects an unreachable contact before changing
the pose; only an explicitly requested `allowUnreachable` miss can clamp.

`verify-staging.ts <fresh-evidence> <music-directory> <ffmpeg-bin>` builds two fresh
layouts, checks persisted native joint endpoints and palm contact over every frame,
and prepares `pilots.json` for `media-pilots/capture.ts`. This is a mechanical
regression proof, not a graded music video.

## Repair without rebuilding the film

The editor's Sequence toolbar now has **Transfer**: save a common starting snapshot,
export worker changes, load a worker file, preview the merge and apply once. The
`project.merge-worker` command uses the same three-way merge; independent edits
survive and same-field/order conflicts fail before mutation. Its input is
`{type,base,incoming}` with full canonical projects; include required `asset.hydrate`
commands in an atomic plan. The UI packages asset bytes automatically (64 MiB source
asset limit). Keep a common base; independently created project IDs cannot be merged.

**Preview region copy** copies complete 2D media clips, their used sources/assets,
new entity/component IDs, targeted numeric animation and in-range effects. Enter a
half-open source range, destination start and fresh prefix. The DOM-free equivalent
is `timeline.copy-region` with `{source,startFrame,endFrame,atFrame,prefix}`; source
is a canonical project. The AI action supplies the current project itself. Audio
and camera stay with the destination. Numeric motion is sampled on the integer
delivery grid; subframe equivalence is not promised. Split clips, external parent/
effect dependencies, incompatible FPS and identity collisions are rejected.
This is a bounded media-layer operation, not arbitrary 3D simulation retiming.

The same dialog saves/applies **actor takes** with `scene3d.save-actor-take` and
`scene3d.apply-actor-take`: complete skeletal segments plus local poses and IK,
checked against the exact rig and FPS. Takes persist with the project, remain
editable and support Undo. Existing target actions, incoming blend dependencies,
root-motion accumulation, prop attachments and physical simulation require a
broader scene handoff. World blocking stays in the destination. Saving a take does
not mark its acting approved; there is no automatic aesthetic score or universal
retargeting claim.

For authorized parallel chapter work, pin `sharedProject: { projectRoot, projectHash }`
to the canonical cast/asset project once. Prepare each assigned chapter with:

```powershell
bun apps/engine-editor/scripts/music-video/production/worker.ts <production.json> <chapter-id>
```

The chapter's planned `projectRoot` must be fresh. Initial workers copy the shared
cast project; scoped repairs copy the previously authored chapter so existing work
survives. The tool transfers the canonical project and asset pack through existing
commands, verifies the reopened copy matches its source, and writes
`worker-handoff.json`: fixed intent, source clock, global-to-local frame conversion,
shot entry/exit states and both neighboring selections. It limits the worker asset
catalog to 128 MiB so a worker does not clone a whole rendered-frame archive. Repair
handoffs also identify the affected shots; unchanged chapters must be reused.
Workers author isolated projects and return their canonical pair and native export
receipt. One coordinator chooses chapters and runs `production-check`/assembly.

With `sharedProject` set, `production-check` verifies its pinned project hash and
rejects missing/changed shared asset IDs or bytes, changed native 3D meshes,
materials, textures or rigs, and changed existing entity model/material/rig bindings.
Staging, visibility, poses, timing and added entities remain separate checks.
Put intentional shared appearance variants in the production design; deliberately
revise the shared baseline instead of silently changing it in one worker. Without a
shared project, the check reports cross-chapter appearance consistency as unverified.
This is whole-project copying and chapter assembly, **not editable region merging**.

Use the existing decisions as defaults when the user requests a correction. Begin
a revision from a completed base; the agent supplies the affected shot IDs and the
user's requested correction, without asking the user to restate continuity rules:

```powershell
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-revise <base.json> <next.json> shot-2,shot-3 "Make the handover readable; preserve the outcome."
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-context <next.json> <repair-context.json>
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-plan <next.json>
```

The new manifest copies decisions, source, cast/state declarations and all shots;
it reserves fresh artifact paths only for affected chapters and resets candidate
review. The compact context contains repair shots, global decisions and neighboring
boundary states. It is a view of the complete manifest, not a replacement for it.

`production-plan`, `production-check` and assembly compare revisions against the
saved base. They reject changes to other shots, source audio, delivery grid, intent,
cue map or effect limits, and changes to a repair shot's timing or incoming/outgoing
state. Unaffected chapters retain exact project/video hashes; affected chapters
need changed project and video hashes before assembly. Previous repair contracts
remain binding through the manifest history. Export receipt/byte checks still run.
An intentional structural rewrite starts a new production direction explicitly.
Legacy manifests with `revision > 1` and no base remain unverified until their
history is supplied; do not invent a base or renumber them to claim verification.

The revision report lists merged repair/seam ranges for focused inspection. It does
not certify unchanged pixels inside a rebuilt chapter, semantic adherence to prose,
visual quality, or full-film approval. A changed video hash proves different bytes,
not a better performance. Keep the existing full-speed sound-on review for delivery.

## Native look development and pre-render feedback

For imported-character films, select the art/tone before chapter expansion.
`lookDevelopment` records style, tone, selection authority/evidence, exact reference
and native-comparison files/hashes, and each character's source asset hash,
design intent and selection reason. `production-schema` exposes the fields.
Chapter preparation and production checking reject missing/proposed selections,
changed evidence and unselected cast substitutions. Delegated direction is a
distinct authority from actual user selection; neither creates taste approval.
References and cast decisions survive scoped revisions. Reusing a source model
is allowed when selected for the role; a convenient fixture is not that selection.

Run cheap feedback before a full render:

```text
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-inspect-native <project-root> [production.json]
```

It reopens the canonical project without hydrating assets or encoding video.
The same checks run in `production-check` and therefore delivery. `actorWorld`
declares each assembly's forward axis, speed, turn-rate and facing tolerances;
exceptions require actor/rule, bounded global frame range, reason and explicit
user instruction. Every delivery-frame root is sampled. Without calibrated axes,
diagnostics assume +Z and cannot pass the world contract. Extracted/physical root
motion requires final simulation evidence and is reported unassessed here.
This does not certify limbs, contacts, collisions, perception or emotional acting.

Pacing defaults to a new authored event within each second outside declared
`direction.kind: "hold"` shots. It counts changed camera composition, action
changes, pose/IK cues and changes of travel velocity; effect cues never reset
the clock because they can accent an action without supplying one. Continuous travel,
repeated identical clips, collinear baked keys and slow camera drift do not keep
resetting the clock. Exact gaps and sustained loops are returned for repair.
This is a structural lower bound: it cannot tell whether an event is visible or
meaningful. Do not add filler flashes or cuts to pass; develop the action or
declare the specific emotional hold. Rendered sequence review remains required.

## Validation and delivery

Assembly always returns `candidate`. Review and promotion are separate commands:

```powershell
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-review <production.json> <video.webm> <ffmpeg-bin> <fresh-packet>
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-deliver <production.json> <video.webm> <packet> <feedback.json>
```

The review player asks for blind observations before comparison with the production
brief. Delivery checks the exact candidate, video, proxy and artifact hashes,
technical export receipt, complete direction, pinned shared cast for multiple
chapters, resolved material decisions and musical phase. Feedback must cover the
whole film at normal speed with sound, account for every shot, and explicitly pass
mechanics, musical fit and story agreement. Images-only review, skipped/muted/fast
playback, stale evidence and unresolved findings cannot promote a candidate.
`reviewed-delivery` records those checks; it does not synthesize a 9/10 grade or
owner taste approval. Playback telemetry proves presentation, not attention.

Native chapter assembly and reference-frame assembly share a 64 GiB budget per
output directory, including existing files and active byte reservations. Assembly
caps its video at 2 GiB and verifies complete output; frame-map assembly uses its
explicit video cap. Reservations are released on failure as well as success.
Keep one output directory for a production to share the budget across versions.
Interrupted process reservations remain conservative; inspect the recorded owner
before removing a stale lease. External Blender scripts are not governed by this
export-owner budget.

Prefer the [video-first review packet](../review-bursts/README.md) for routine review.
Explicit production cleanup is available with `storage.ts <production-root>
<fresh-receipt.json> --delete-pngs-and-blender-backups`. Without the flag it inventories
only. It skips links, rechecks containment/size/time before unlink, preserves primary
`.blend` files and hashes retained videos. Deleting PNGs makes PNG-based frame maps
unusable until their sources are regenerated; this is explicit pruning, not a cache.

Existing external-renderer frame maps can be assembled without creating another
`full-frames`/`chapter-frames` copy:

```powershell
bun apps/engine-editor/scripts/music-video/production/frame-map.ts <picture-map.json> <fresh-picture.mp4> <ffmpeg-bin> [global-start-frame] [exclusive-end-frame]
```

The map supplies `fps`, `resolution: [width,height]` and ordered contiguous
`frames: [{globalFrame0,picturePath,pictureSha256,sourcePicturePath?}]`. When present,
`sourcePicturePath` is used directly. Source bytes are checked before and after
encoding; FFmpeg reads a small reference list. No PNGs are copied. Every output
frame timestamp and full decode are checked before publishing a local picture file.
Mixed RGB/RGBA inputs retain one timing-filter counter across format changes;
the regression compares every decoded frame against a uniform-format sequence.
The result is a silent lossy picture encode, not a lossless archive or native
editor project. Keep the source files and mux the original soundtrack through its
own verified path. Never prune a source directory merely because a newer cut exists.

Native PNG replacement assembly (`replacement.ts`) places source pictures on integer
30fps ticks. Fractional-second floating offsets can skip a picture while leaving
valid output timestamps; the regression checks each color in an ordered replacement
at such a boundary, in addition to the output grid and original PCM checks.

Review capture is bounded to 480 images and 256 MiB across one capture job, including
manifest-provided frames. Use review videos and selected action/seam frames. The
shared media process helper caps captured output at 256 MiB per stream by default
(explicit maximum 512 MiB); large decoded media belongs in files, and callers that
need no stdout can set `captureOutput: false`. These are job/output bounds, not a
global production cache policy or a measured whole-process RAM ceiling.

- `production-plan` checks contiguous source coverage, current decisions, cue identity,
  instrument intervals, effect reuse and shot-state changes. It does not read media.
  Planned chapters omit `projectHash`/`videoSha256` until those outputs exist;
  `production-check` requires them. Do not invent hashes to plan a film.
- `production-handoff` derives each chapter's entry/exit state, shots, both neighbors
  and seam review range. Its candidate hash excludes reviews; its manifest hash includes
  them. Record actual review against that candidate and video, never a folder name.
- `production-check` also reopens canonical projects, checks original/video bytes and
  native export receipts, and evaluates the saved performance contracts. Missing
  mechanical evidence fails; a declared still is distinct from actors with frozen faces.
- `assembly.ts` decodes chapter grids, encodes one continuous original soundtrack,
  checks the complete output and seven PCM windows, then publishes a local receipt.
  It uses VP9/Opus and an owned hidden process. Native chapter audio is discarded.
  The API accepts bounded finishing settings; they participate in the reuse identity.
  Failed partial files are preserved; choose a fresh version. Output reuse requires
  matching dependency identities and bytes. Reviews apply only to their named video.

Use `stateFields` for story-relevant facts, not every background detail. Every shot
accounts for those fields in `entry` and `exit`; ordered `changes` name their frame
and cause. A `bridge` explains an off-screen change from the preceding exit and
requires contextual review. This catches missing transfers or inconsistent knowledge;
it cannot prove that a transfer is visibly staged. `effects.maxUses` reserves one-offs.

`cues.ts` integrates a declared tempo curve and its inverse. Authored tempo, phase
and named sound/instrument evidence stay distinct. Analysis-only cues cannot be
marked reviewed. A literal instrument shot needs the matching reviewed interval;
`nonliteralReason` records an intentional editorial exception rather than an accidental
mismatch. Waveform energy is not instrument transcription.

## Authoring and mechanical evidence

New score recipes may declare:

```ts
timing: { durationFrames: 7478, fps: 30, sourceInSeconds: 0 }
```

The narrative contract's optional `durationFrames` and `fps` must agree. Omitted
fields preserve archived 1800-frame/30fps recipes; they do not retime fixed recipes
automatically. `FilmContext.frames`, `fps` and its beat-to-frame function provide the
resolved grid. An optional `cueMap` maps beats through the authored variable tempo.
Body, props, camera and consequences must still share the retimed action clock.

`paper-rig.ts` supplies a parent-first articulated cutout factory using engine pose
and IK solvers. Bind imported art with measured pivots, offsets and order, record
each delivery frame, and call `author(builder, optionalFreezeFrame)`. Save its
`definition` in the recipe's `performance.rigs`. `plantedStride` supplies stance/swing
foot targets; `samplePropTransfer` checks hand contact and chooses one prop owner.
These are mechanical primitives, not an approved library of character art or acting.

Recipe `performance` persists as `extensions.musicPerformance` and is checked after
native compilation and again by delivery verification. Declare `kind`, `reason`,
`rigs`, `faces` and `focalActors`. Each face interval gives actor/entity, local frame
range and maximum held exposure; intentional holds need a reason. The evaluator
samples actual used drawings, including held indices and source-time remaps.
Missing focal actors cannot borrow another actor's animation evidence.
Declared focal face entities need interval coverage across their exposed clips,
including later returns; ten animated opening frames cannot certify the rest.

Attachment checks reconstruct bone origins from actual timeline transforms and
bindings on every frame. Tolerances are explicit stage units. Root-sibling radius
checks do not establish orientation; drawing changes do not prove emotional quality
or visibility. Inspect full strides, contact/release, source swaps and cuts at native
speed without effects. The freeze helper preserves integer-frame values; it bakes
nonlinear subframe interpolation. Do not claim continuous subframe equivalence.

The existing [review extractor](../review-bursts/extract.ts) accepts optional
`clips: [{ name, startFrame, endFrame, reason }]` alongside ten-frame `bursts`.
Use action anticipation-through-recovery and handoff seam ranges; `endFrame` is
exclusive. It emits native-speed H.264/AAC review proxies with available audio,
source/output hashes and pending review status. Clip generation is not audition.

## Regression checks

```powershell
$env:MUSIC_PRODUCTION_FFMPEG_BIN = '<ffmpeg-bin>'
bun test apps/engine-editor/scripts/music-video/production
bun test apps/engine-editor/scripts/music-video/score-film/narrative-contract.test.ts apps/engine-editor/scripts/music-video/score-film/motion-plan.test.ts
bun x tsc --noEmit -p apps/engine-editor/scripts/music-video/tsconfig.json
```

The integration tests create/reopen full-song and short native projects, exercise
the cutout factory/freeze, and encode/decode a synthetic multi-chapter WebM. They
verify cache invalidation and uninterrupted audio. They use disposable `.local/`
fixtures, never an artist's files. No test assigns an aesthetic score.
