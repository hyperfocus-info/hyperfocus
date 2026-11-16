# Actor motion defaults and repair

The native editor uses the engine's
`createBendReferenceTransport`. It carries an authored elbow plane into a changed
reach instead of choosing an outward pole independently for every frame. A valid
wrist position alone does not establish a plausible elbow or hand.

## Native editor

New sequences prefer a recognized authored idle clip over library ordering, so an
imported attack or death clip does not become the initial performance by accident.
Unrecognized libraries retain their explicit first-clip convention.

**3D sequence → Pose, IK & sockets → Two-bone IK** recognizes an unambiguous humanoid
arm chain and starts with a zero offset from the animated wrist. Adding it leaves
the performance unchanged. Adjust **Target offset** for a local repair; the default
preserves the animated bend and hand orientation without stretching the limb.
Choose **Fixed character-space target** for a stationary target. These coordinates
are character space, not scene-world coordinates.

`scene3d.set-ik-correction` exposes the same `targetMode`, `bendMode`, and
`endOrientation`. Omitting `pole` selects animated bend and preserved orientation;
passing an explicit pole preserves the old authored behavior. Existing saved cues
without these fields keep their previous meaning. Unknown rigs require explicit
joint selection in the command; no arbitrary spine/finger chain is inferred.
Unreachable targets in animated-bend mode report unsatisfied contact instead of
silently clamping. Seeking samples the base animation, independent of frame order.

[Actor autopilot](../../crowd-pilot/README.md) prefills recognized idle/walk clips and
foreground head mapping. Save a useful performance with the existing **actor take**
controls to reuse its clips, pose layers and IK on compatible rigs. Its saved
intent enters AI film context, so a revision need not reconstruct it from the movie.

For a bounded stationary box exchange, the developer authoring helper
`compileActorBoxExchange` in `src/motion/scene3d/actor-motion-defaults.ts` derives
both wrist targets from one measured prop path and clock. Give it complete assembly
members, explicit arm chains, unit-scale root placements, model-space idle wrists,
box half-width and setup/offer/receive/release/settle frames. The receiver reaches
contact at `receiveFrame`; both actors hold through `releaseFrame` before withdrawal.
It returns ordinary editable prop samples and native IK corrections, capped by the
native correction budget. Apply them through the existing canonical command owner.

This experimental helper requires every-frame native reach/contact checks, all-member
pose agreement, preserved-input/reopen checks and a full native motion capture.
The Lantern Debt study and a displaced receiver exercise the same derivation; an
idle receiving arm is the negative control. End orientation remains authored.
Palm/finger grip, body/prop collisions, physical load and choosing acceptance versus
refusal remain unresolved. The helper does not choose the scene's dramatic cause or
establish that a viewer understands trust. Keep the defining-action pilot before
full-film expansion using the existing production handoff.

## Historical segmented Blender characters (disabled)

The following describes preserved historical jobs, not a supported production
route. The [production handoff](../../../docs/media-production/handoff.md) prohibits
new Blender work; both adapter entrypoints now fail before doing work. Use or
improve the native editor. Existing source and evidence remain intact.

Historical CLI identity:

```text
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-arm-schema
bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-repair-arms <job.json>
```

The job names `source`, fresh `output`, `blender`, `ffmpeg`, `actions` (actor ID to
`idle` or `carry`), `firstFrame`, and `count` (2–300 contiguous authored frames).
`bindings` maps each actor to a root and exactly two arms, **left then right**;
each arm names `upper`, `lower`, `hand`, and `elbow` objects. The calibrated contract
is centered unit-Z segments, Z-up/-Y-forward actor roots, and unparented,
unconstrained parts. Do not apply it to arbitrary axes or skinned characters.
Omitted bindings retain the original Space Laser naming adapter for older jobs.

`reference.ts` samples the licensed CC0 Quaternius idle/carry clips through the
engine. `repair.ts` preserves both lengths and wrist targets, transports segment
roll across frames, and rejects changing-length or unreachable source limbs.
Hands and props retain their authored transforms. Python only reads, applies and
renders Blender data; candidates are separate frame-bounded `.blend` files.

Verification renders both takes, reopens and reverse-seeks the candidate, hashes
unaffected native transforms, measures actual wrist/length/joint errors, and saves
`verification.json` plus `comparison.mp4`. `maxElbowSpeed` defaults to 4.5 m/s for
these idle/carry studies and is explicit per job; it is not an anatomical universal.
A discontinuity returns a failing exit code. Optional `renderEngine: BLENDER_EEVEE`
uses matched fast study rendering. Put jobs and evidence in `.local/`.

Neither path synthesizes a grip, solves torso/prop collision, repairs source
teleports, or chooses whether an actor should carry, refuse, comply or flee.
Rendered acting and story comprehension still need review; mechanical acceptance
is not a 9/10 quality rating.

Focused checks:

```text
bun test packages/engine/src/motion/solvers/pose-ik.test.ts apps/engine-editor/scripts/music-video/actor-motion/solve.test.ts
bun test --conditions=browser apps/engine-editor/src/motion/scene3d/actor-motion-defaults.test.ts apps/engine-editor/src/scene3d/crowd/compile.test.ts
```

The native [pilot verifier](../../crowd-pilot/README.md) exercises fresh control
defaults, UI/command parity, undo, save/reopen and exported frames. Use its
`closeup.ts --arm-correction` option for matched offset/release studies.
