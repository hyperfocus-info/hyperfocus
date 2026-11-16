# Motion System

The motion system is a TypeScript-first procedural animation runtime for canonical humanoid motion. Its beginner path accepts a zero-clip GLB, auto-maps the skeleton, creates locomotion from engine-owned gait profiles, plants the feet, and applies the result to a Three.js skeleton. Its lower layers remain public so an advanced project can replace mapping, graph nodes, constraints, the motor, or memory ownership independently.

Milestone 1 covers semantic rigging, deterministic graph compilation, procedural locomotion, inertialization, aiming, recoil, two-bone IK, slope and stair planting, joint limits, Three.js pose upload, the isolated browser laboratory, and the migrated Three Arena player proof. Active ragdolls, cloth, facial mocap, cutscene sequencing, moving platforms, and discontinuous ledges are later work.

## Beginner path

`player.move(v)` takes desired world-space velocity in meters per second. The `humanoid-normal` motor preset clamps speed, accelerates and decelerates, resolves displacement, and feeds the accepted root delta back into the motion signals.

```ts
import { createThreeHumanoidMotionController } from "@hyperfocus/engine/motion/three";

const player = createThreeHumanoidMotionController({
  root: gltf.scene,
});

player.move([0, 0, 3]);

function update(deltaSeconds: number) {
  player.update(deltaSeconds);
}
```

For authored pace rather than a raw velocity, use the same controller with one
semantic intent. The motor remains authoritative for accepted displacement; the
pace selects cadence, stride, knee lift, pelvis motion, torso commitment, and the
all-limb gait envelope.

```ts
player.setLocomotionIntent({
  direction: [0, 0, 1],
  pace: "sprint",
  speedMetersPerSecond: 6,
});
```

Walk, jog, run, and sprint share one distance-driven cycle, so changing speed does
not reset the feet or snap the body to another clip. Their default profiles are
calibrated against the shipped human `Walk_Loop`, `Jog_Fwd_Loop`, and
`Sprint_Loop`: eight-phase foot travel, cadence, stride envelope, stance share,
pelvis travel, torso pitch, shoulder-relative hand travel, and elbow arcs remain
portable normalized values rather than copied poses.
Two-bone IK keeps stance feet
at their sampled world contacts while swing feet clear the queried surface. Faster
paces progressively lengthen stride, narrow pelvis sway, lean the torso into
travel, and keep the arms in opposition to the legs. Walking preserves a relaxed,
gravity-led arm pendulum instead of damping the hands beside the hips. Faster gaits
replace that long sway with compact bent-elbow drive. The arm solver constrains
both the hand target and the elbow plane against the shipped animation catalog;
matching only the hand target can otherwise produce a mechanically valid but
visually inhuman elbow path. Hand targets and action intents override the gait
through the constraint layer, then smoothly reveal the still-running gait phase on
release. These are presentation constraints over the same collision-resolved root,
not transform-key locomotion.

The motor's instantaneous speed remains authoritative for travel, while an exact
critically damped `poseSpeed` channel selects and blends the visible gait. This
prevents a one-tick collision or impulse spike from snapping the silhouette without
integrating a second movement path. Gait phase still advances only from accepted
root distance. Foot contact positions remain authoritative; terrain-normal and
swing-foot orientation use their own critically damped response. Collider-backed
runtime terrain queries return the contacted face normal directly instead of
estimating a slope from nearby heights. A contact-safe C1 swing envelope has zero
vertical velocity at toe-off and touchdown, so neither a new slope nor a phase
boundary can rotate or drop a foot to its target in one frame. Common `ball_l` and
`ball_r` joints resolve as toe semantics, so imported heel-to-toe axes determine
forward rather than a guessed local basis. Swing lift is bounded relative to leg
length to keep catalog heel recovery from folding the calf through the thigh on a
raised tread. Advanced callers may tune `poseSpeedResponse`,
`footOrientationResponse`, `maximumSwingFootLiftRatio`, and
`minimumLegReachRatio`; ordinary callers inherit smooth anatomical defaults. The
minimum reach guard preserves an editable high-knee style without allowing a
two-bone chain to choose a sub-anatomical hairpin near the hip.

Grounded swing targets probe both the ankle and the imported toe direction; rigs
without a toe mapping inherit a leg-scaled sole length. Horizontal target damping
is resolved before the vertical terrain constraint, and an approaching rise first
consumes existing swing clearance. The pelvis then accepts any remaining upward
clearance immediately and damps only its return. This keeps the whole sole above a
step without lowering a near-hip target through the contacted surface.

The default controller is immediately renderable in a ground-solved ready pose and
`reset()` returns to that same pose. Procedural hand paths and elbow planes are
critically damped in shoulder-relative space, allowing the body to travel without
leaving the arms behind. `armTargetResponse` and `armPoleResponse` expose advanced
art direction while preserving smooth defaults. Explicit grip constraints remain
exact and release back into the continuously advancing gait. Travel direction is
also damped independently from collision rebound, so authored facing stays coherent
through brief contacts while the collision-resolved root remains authoritative.

Sprint pitch is distributed through the pelvis and ribcage rather than accumulated
as an upper-spine curl. The catalog-calibrated distribution projects the chest down
and forward while keeping the resulting head-to-hip lean inside the reference
range; walk and incomplete torso chains retain the established baseline distribution.

The distance scale is measured from the foot's contact-to-toe-off travel, not
guessed from a preferred speed label. This keeps a planted foot beneath the body's
reachable support envelope instead of forcing a long split pose while the root
continues moving. Explicit speed changes cadence through that same measured stride;
they do not stretch the legs or add transform motion.

When `speedMetersPerSecond` is present but `pace` is omitted, the controller infers
the matching walk, jog, run, or sprint profile. Physical video cues use the same
inference, so older speed-and-distance locomotion remains procedurally posed instead
of silently falling back to a source clip. A physical gait macro also keeps its
final planted foot supported through the default motor-blend window. Stopping now
settles into the next pose instead of becoming a gravity-driven fall, while an
adjacent collinear gait reuses that same ordinary editable stance cue.

Running flight is physical rather than a pose-only gap between foot contacts. When
an overlapping capture step intentionally releases the last planted foot, the
ragdoll derives a whole-body ballistic takeoff velocity from the opposite foot's
already-authored landing deadline and the timeline gravity. The impulse is stored
in the deterministic checkpoint, quality monitoring recognizes every actuated
body, and collision can still shorten or redirect the flight. Walk and other
grounded steps never receive this takeoff implicitly. Presentation keeps the
running gait cadence during that explicitly planned flight while disabling planted
foot contacts; unplanned ledge falls and authored jumps continue to use the normal
airborne presentation. Landing therefore does not reset a sprint to a generic
jump/fall pose or apply a second locomotion displacement. Only releasing the final
planted support may create the ballistic impulse; a later midair step can target
its landing but cannot reset whole-body vertical momentum.

Explicit jump intent uses the same rule. At takeoff, the support impulse gives every
linked body the requested linear velocity and removes residual per-limb spin for an
ordinary non-flipping jump. This prevents a descending swing foot from cancelling
the requested trajectory while keeping momentum deterministic. The existing pose
authority is preserved at takeoff; after support is released, physics owns the
airborne path until contact is reacquired.

The semantic presentation recipe supplies distinct takeoff, ascent, apex, descent,
and landing poses without a clip dependency. The takeoff foot and remaining swing
clearance blend from the live gait rather than resetting to the rig rest pose. The
lead leg is latched for the complete flight, ankles plantar-flex in the air, and
landing returns through weighted heel reception. Root translation is never authored
by the recipe. Ready traversal support uses a deterministic 0.2-second terrain
envelope with a 1.5 m/s vertical bound; brief solver support events therefore cannot
turn an obstacle seam into a visible hop, while an authored jump keeps its ballistic
height. Intermediate state events emitted inside one physics frame are collapsed to
their final state before the flight origin is chosen.

No animation clip or mesh-specific motion asset is required. Pass `heightField` for simple terrain, `ground` for a custom scalar/batched raycast provider, `motorOptions` to override the inherited character preset, or a persisted `.t3rig` document to pin an established mapping. The returned `document` is the complete resolved mapping suitable for sidecar persistence.

The renderer adapter is deliberately isolated in `@hyperfocus/engine/motion/three`. The DOM-free runtime, rig compiler, graph compiler, solvers, signals, and pose buffers live in `@hyperfocus/engine/motion` and do not require Three.js.

## Semantic rig contract

The imported skeleton is normalized to right-handed, +Y up, +Z forward, and meters before procedural evaluation; in that basis semantic left is +X and semantic right is -X. Every deforming source joint keeps a flat index. The compiler appends a mandatory virtual `MotionRoot`; `Hips` becomes its first deforming child, separating motor translation from pelvis posture. Optional virtual hubs are appended after deform joints and never enter renderer skin-joint uploads.

Milestone 1 requires `Hips`, `Head`, and the usual upper/middle/end limb semantics for full capability. Missing mappings never block import:

- Unmapped bones remain at their imported reference pose and still pass through the pose buffer.
- Missing intermediate knees or elbows disable the affected IK/reach capability while base rotational motion continues.
- Extra bones remain addressable through tags and are not procedurally warped unless a node explicitly targets them.
- Low-confidence or unresolved assignments produce diagnostics and leave the rig `unvalidated`.

Auto-mapping combines VRM declarations, Mixamo/GLTF naming, hierarchy topology, relative bind transforms, skin-joint ordinals, and structural fingerprints. A persisted sidecar wins over later heuristics and is reconciled against the same evidence after re-export.

## `.t3rig` sidecars

Schema version, mapper version, humanoid preset, complete semantic bindings, fingerprints, normalization, tags, and overrides are persisted in canonical, alphabetically ordered JSON. Current generated files pin:

```json
{
  "humanoidPreset": "humanoid-v1",
  "mapperVersion": "1.0.4",
  "schemaVersion": 1
}
```

Those fields are part of a larger required document; the snippet only shows the version contract. Use `serializeT3Rig` for deterministic output. `@hyperfocus/engine/migrations` migrates old documents in memory; no disk write occurs unless the editor or CLI explicitly saves the result.

## Pose and signals

`PoseBuffer` stores flat quaternion rotations and optional translations/scales over caller-owned `ArrayBuffer`, `SharedArrayBuffer`, or `WebAssembly.Memory.buffer` storage. Semantic maps and masks compile once to raw indices. Custom nodes may read the whole buffer but must declare writes; development execution verifies the mask, while production can use the trusted path without per-write checks.

The standard signal block contains `desiredVelocity`, resolved `velocity`, `acceleration`, `facing`, `turnRate`, `gaitPhase`, `gaitCycle`, `isGrounded`, `groundNormal`, `aimTarget`, `aimWeight`, `actionId`, `actionPhase`, `rootPosition`, and `resolvedRootDelta`. Multiplayer can replicate this compact state and reserve pose snapshots for correction.

The canonical baseline recipe stores Contact, Down, Passing, and Up as normalized semantic pose data. The built-in human pace profiles refine that baseline with eight catalog-calibrated phases so toe-off folds immediately, the swing foot passes beneath the pelvis, and the leg extends into the next contact. Distance traveled advances gait phase; stationary cycles use elapsed time. The recipe supports forward, backward, and strafing movement, with terrain targets and motor-resolved root travel layered over the sampled poses.
`planCanonicalHumanoidGaitWindows` quantizes that same cycle into deterministic
left/right support and swing windows for portable authoring. It samples frame
centers so range starts and exact cycle boundaries cannot produce zero-duration
contacts; editor macros may expand those windows into ordinary physical cues
without adding another locomotion runtime.

`analyzeGltfHumanoidGaitClip` samples stable left/right foot nodes through the
canonical cooked glTF pose evaluator, detects bounded alternating ground-contact
windows, and reduces them to versioned cadence, phase, stance share, confidence,
sample rate, and stable foot identities. Analysis is deterministic and bounded to
1,200 samples per clip. Static, ambiguous, missing-foot, and non-looping motion
returns diagnostics with manual-authoring alternatives instead of fabricated gait
data. Only the compact result is portable; sampled positions are discarded.

`createHumanoidActionPoseRecipe` is the portable full-body action counterpart. A
style, left/right effector, and bounded power value expand to deterministic additive
pose lobes for hips, torso, shoulders, and head. Each lobe declares its semantic
bone, peak phase, smooth fade extents, and Euler delta; `sampleHumanoidActionPoseLobeWeight`
is the shared evaluator. `HumanoidMotionController.setActionPose` evaluates those
lobes directly for gameplay while the first-party editor expands the same lobes into
ordinary weighted pose-correction cues. Physics still owns contact, momentum,
airborne state, consequence, and recovery. The recipe owns readable anticipation,
silhouette, counter-rotation, follow-through, and return to ready; IK remains the
final effector constraint. Unsupported rigs report their missing `hips`, `spine`, or
`chest` semantic alternatives instead of fabricating a second pose runtime.

`HumanoidMotionController.punch({ target, ... })` is the beginner action path. It
derives the phase timing from distance and requested speed, turns the parented torso
with normalized chain increments, drives the striking hand through windup, exact
contact, follow-through, and recovery, and keeps the opposite hand guarding the face.
Portable timeline IK exposes the equivalent target and bend-direction trajectories:
`targetFrom`/`target`/`targetTo`, `poleFrom`/`pole`/`poleTo`, and an explicit
`followThroughFrame`. The bend directions remain continuous near full extension, so
the solver cannot silently choose the opposite elbow plane and fold a limb through
itself.

Portable semantic pose cues use model-space rotation deltas. The evaluator
pre-multiplies the current bone model rotation, then resolves the result back through
the current glTF parent hierarchy, so a canonical torso twist or shoulder turn does
not change meaning when a source rig uses different local bind axes. Explicit local
bone-axis deltas remain available for rig-specific cleanup and for legacy timelines.
Portable pose, two-bone IK, and physical-recovery edges inertialize through protected
frame-rate-aware handles by default. An explicitly authored zero handle is retained
only as an edge instruction; preflight accepts it where the cue begins or ends at
the sequence boundary, but still rejects an unprotected internal transition. A
one-frame internal replacement requires an explicit `cut` policy.

## Evaluation contract

Motion graphs use this frozen pass order:

1. inputs
2. reference pose
3. base locomotion
4. state/layer blending
5. full-body actions, including shared procedural action-pose recipes
6. masked/additive actions
7. aim and reach
8. recoil
9. foot/hand constraints
10. secondary motion
11. physical animation
12. final joint limits

The graph is a DAG. Stateful feedback crosses an explicit delay or state-machine boundary. Connections declare `override`, `additive`, or `constraint` composition; additive rotations are deltas from an explicit reference (`target * inverse(reference)`). The compiler rejects cycles, incompatible ports, and overlapping writes without an intervening blend/layer node. Transitions inertialize by default. Notify nodes emit presentation events only; authoritative gameplay timers remain outside the pose graph.

## Threading and physics boundary

Milestone 1 evaluates the graph, physics queries, and preview on the main thread. This keeps terrain queries synchronous and avoids imposing cross-origin isolation on beginner projects. `@hyperfocus/engine/physics/3d` supplies scalar `raycast` and packed `raycastBatch` boundaries plus the character motor. A root-motion action requests displacement; the motor owns collision resolution and returns the accepted delta.

Terrain contacts have priority over presentation posture. On a stair transition, the authoritative `MotionRoot` continues to follow the collision-resolved motor while the controller lowers the pelvis only as far as needed to keep an older planted foot inside the natural, no-stretch leg reach. This preserves a fixed world contact without letting pelvis posture drift gameplay position.

Physical video timelines use the same semantic controller for powered locomotion.
The compiled rigid performance owns entity travel and contact; the controller
replays the semantic pace against the scene's canonical static-collider raycast and
supplies the portable all-limb presentation pose. Each physical sample provides the
accepted root delta, velocity, grounded state, and contact normal; no second
presentation simulation is allowed to move the entity. Static presentation
raycasts evaluate the same box and sphere bodies as physics, including rotated box
faces, so feet see authored slopes instead of an axis-aligned approximation. The
project runtime must be configured with
the timeline even when a previously compiled rigid performance is reused. The
first-party editor performs that attachment before its cache branch, so cached
preview and export cannot silently fall back to an idle clip over a moving body.
Adjacent physical locomotion cues use an exact-distance, bounded C1 speed envelope,
so their boundary acceleration is zero and the controller can preserve one gait
phase through walk, jog, run, and sprint changes. Ready locomotion renders the
semantic controller over the physical root; stagger, down, and recovery deliberately
yield to the same active-ragdoll authority rather than exposing a second video-only
pose runtime.

Foot presentation follows the terrain normal while planted. During swing, a bounded
toe-down push-off and toe-up step-in envelope returns to the contact angle with zero
angular velocity, avoiding both a flat-footed stride and a one-frame foot snap.
Posture changes such as upright-to-crouch are damped in the same controller and do
not replace the gait or its ground contacts.

Jumping is one physics-owned vertical impulse followed by gravity. The semantic
controller layers only takeoff compression, a restrained airborne balance pose,
and the inverse landing spring over that trajectory. Gait phase freezes while
airborne; the existing shoulder-relative arm springs retain their incoming
velocity before settling toward a small catalog-measured balance loop, then return
to the outgoing stride as landing weight decays. No jump pose may translate the
root, fake grounded contacts, or reset a limb spring. Explicit locomotion speed
changes cadence rather than stretching a step past the selected gait's anatomical
reach.

WASM is a later fast path, not a second behavior definition. Standard WASM and JS/TS nodes will share the same memory-backed pose buffer. The TypeScript implementation remains the readable oracle.

## Quality laboratory

Run the isolated lab and its numeric gate from `packages/engine/`:

```sh
bun run example:motion-lab
bun run bench:example:motion-lab
bun run proof:example:motion-lab
```

The browser laboratory provides fixed side, front, and aim views over flat ground, a 15-degree slope, and stairs. Its redistributable fixture set includes canonical naming, scrambled names, ape proportions, extra hub children, and incomplete limbs. All bundled GLBs together stay below 1 MiB; Y-Bot is compatibility-test material only and is not distributed.

The benchmark runs 15 full-fidelity characters and fails on pose-stack p95 at or above 2 ms, planted slip at or above 0.02 m, planted-foot vertical error outside the numeric epsilon, crossed semantic foot order, or any NaN/Infinity. The browser proof exercises all five fixtures across forward, backward, strafe, aim, slope, and stair scenarios, checks deterministic replay, and captures the required side-slope, front-strafe, and perspective aim panels. Lower update-frequency, simplified-IK, cached-pose, and instanced-bake LOD tiers remain the scaling contract for larger crowds.

## Three Arena migration proof

Three Arena now uses the semantic controller for the player presentation while retaining its existing gameplay movement, collision, jumping, world wrapping, hitboxes, and authoritative timers. An unscaled virtual MotionRoot wraps the `0.03`-scaled Kenney renderer rig; the adapter submits the game-resolved displacement to the motion motor and reconstructs locomotion, terrain contacts, aim, recoil, airborne release, and landing from signals. Its complete persisted map is `examples/three-arena/assets/usable/characters/kenney/models/character-medium.t3rig`.

The Kenney FBX must stay in its already-imported bind pose. Calling Three.js `Skeleton.pose()` on this asset reconstructs its control root from inverse binds and expands the semantic hierarchy by 100x. The migration regression locks the expected hips scale near 3 at the canonical boundary, and the live proof rejects a non-finite pose, a head below the hips, a torso fold at or above 1.2 radians, pelvis absorption of aim, non-deterministic extreme aim, excess foot slip, or a presentation event sourced outside engine motion.

With Three Arena running, execute the live proof and moving budget lane from the repository root:

```powershell
bun.cmd run ./examples/three-arena/bench.ts --probe-request --out .local/three-arena/engine-motion-probe.json
bun.cmd run ./examples/three-arena/bench.ts --move-ms 10000 --assert-frame-p95-ms 16.7 --assert-update-p95-ms 8 --assert-render-p95-ms 10 --out .local/three-arena/engine-motion-bench.json
```
