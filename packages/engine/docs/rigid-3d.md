# Bounded rigid 3D world

`src/physics/rigid-3d.ts` is a first-party, DOM-free rigid-body world for spheres and boxes. It includes quaternion/angular integration, oriented sphere/box contact, exact oriented box SAT with bounded clipped face manifolds, bounded rotational CCD, and bounded distance constraints. It is intentionally a focused physics core rather than a thin wrapper over a hosted or third-party solver. The world owns fixed-capacity typed arrays and deterministic scratch buffers; games retain control of stepping, rendering, authored collision layers, and data persistence.

This module is separate from the existing general 3D geometry/character helpers and does not alter that API. It is published at `@hyperfocus/engine/physics/rigid-3d`, included in declaration/runtime parity and packed-consumer checks, and exercised by the portable `3d-action` starter.

## Create and step a world

For velocity-only consumers, `world.readVelocity(handleOrId, output)` writes
`{ x, y, z }` into caller-owned storage and returns the body's type. Missing ids
and stale/invalid handles return `undefined` without changing the output, matching
`body()` lookup semantics. No body/shape snapshot is allocated or retained. Copy
values before reusing a scratch output; `body()` remains the full detached
inspection API.

```ts
import { createRigidWorld3D } from "@hyperfocus/engine/physics/rigid-3d";

const world = createRigidWorld3D({
  capacity: 2_048,
  maxContacts: 8_192,
  maxCandidatePairs: 32_768,
  maxCcdTests: 16_384,
  gravityY: -9.81,
});

const floor = world.addBody({
  id: "floor",
  type: "static",
  shape: { kind: "box", halfX: 20, halfY: 0.5, halfZ: 20 },
  y: -0.5,
  friction: 0.8,
});

const ball = world.addBody({
  id: "ball",
  type: "dynamic",
  shape: { kind: "sphere", radius: 0.5 },
  y: 4,
  mass: 2,
  restitution: 0.25,
  collisionLayer: 1,
  collisionMask: 0xffff_ffff,
  angularVelocity: [0, 1, 0],
});

world.applyImpulse(ball, 2, 0, 0);
world.applyTorqueImpulse(ball, 0, 0.25, 0);
world.applyImpulseAtPoint(ball, 0, 0, 3, 0.5, 4, 0);
world.addDistanceConstraint({ id: "tether", a: floor, b: ball, distance: 4, stiffness: 0.8 });
world.addPointConstraint({ id: "hinge-like-anchor", a: floor, b: ball, localAnchorA: [0, 4, 0], localAnchorB: [0, 0, 0], breakImpulse: 20 });
world.addAngularMotorConstraint({ id: "pose-motor", a: floor, b: ball, targetRelativeRotation: [0, 0, 0, 1], stiffness: 0.2, damping: 1, maxTorqueImpulse: 4 });
world.step(1 / 60);
```

## Contact material presets

`rigidMaterialPreset3D` expands one semantic choice into the same ordinary
`friction`, `restitution`, `linearDamping`, and `angularDamping` fields accepted by
every rigid body. Damping coefficients are inverse-seconds rates applied by the
same fixed-step world: linear damping reduces world-space velocity without moving
the body to a hidden target, while angular damping reduces spin without rewriting
orientation. An omitted `linearDamping` remains zero for backward compatibility.
The bounded preset ids are `character`, `soil`, `wood`, `stone`, `metal`, `ice`,
and `rubber`. The returned object is an independent copy and can be further edited;
the solver does not retain a hidden preset reference.

Automatic humanoid rigging defaults to `character`, whose translational and angular
drag lets a passive body retain impact consequence and then settle instead of
sliding indefinitely. Breakable assemblies default
to `stone`. Both accept another preset and store only the expanded numeric body
coefficients, so gameplay, canonical preview, scrubbing, Play/build, and export use
the same contact response. `identifyRigidMaterialPreset3D` recognizes an exact
unchanged coefficient set for editor summaries; custom numeric values remain custom.

Use a fixed timestep and replay the same body mutations in the same order for deterministic results. Sweep-and-prune sorting uses minimum X followed by the stable numeric handle, contact iteration is stable, and equal-time CCD hits choose the lowest handle. The tests replay a mixed operation stream for 120 steps and compare the complete resulting state exactly.

Determinism here means the same JavaScript numeric environment, inputs, options, and operation order. The module does not implement fixed-point arithmetic or promise bit-identical state across unrelated CPU/JavaScript implementations.

## Bodies and stable handles

Bodies are `static`, `dynamic`, or `kinematic`:

- Static bodies have infinite mass, reject non-zero linear/angular velocity and any mass declaration, and never move during a step.
- Dynamic bodies integrate gravity and angular velocity, accept linear and torque impulses, and receive velocity/position collision response.
- Kinematic bodies integrate their authored velocity and act as infinite-mass moving colliders. Impulses are rejected.

`addBody` returns a safe-integer generation handle. Removing and reusing a storage slot changes its generation, so an old handle cannot mutate the replacement body. IDs are unique convenience lookups; queries and contacts expose stable handles. A slot is retired instead of wrapping its generation after more than four billion reuses.

Body and constraint creation validate their inputs before consuming a slot or publishing an ID. Lifecycle regressions cover invalid damping, quaternions, endpoints and constraint coefficients followed by valid retries. Constraint handles still have the reuse limitation tracked by [EEA-02](editor-engine-adversarial-audit.md#eea-02--p1-stale-indices-address-replacement-objects). Capacity, contact storage, broadphase candidates, CCD tests, solver iterations, step duration, identifiers, numeric inputs, layers, and masks are bounded. World-space scalars are limited to a magnitude of `1e12`, and positive extents/masses/distances must be at least `1e-12`, preventing overflow-prone near-zero mass or unbounded coordinates from entering the solver. `numericStorageBytes` is the exact sum of all permanently reserved numeric typed-array storage, including sort and contact scratch arrays. String IDs and the ID map are intentionally not counted as numeric storage.

An opt-in body `impactResponse` adds deterministic material failure without a
second destruction solver. Every contact records its pre-solve closing speed at the
actual contact point, normal effective mass, kinetic energy, applied normal impulse,
and any failed body. Energy includes linear and angular contact-point velocity. An
impact below `fractureEnergyJoules` resolves as an ordinary solid collision. A
qualifying impact pays that energy cost and preserves the authored
`retainedEnergyRatio` of the remainder as forward relative motion, so a strong body
can pass through a weak material instead of receiving a bounce response. The
failure decision and telemetry are checkpointed with contact state.

`createBreakableAssembly3D` expands existing canonical chunks into ordinary bodies
and constraints. Its `clustered` topology derives a stable support graph from the
authored transforms: chunks inside `supportBandMeters` of the lowest collider attach
to the world, while chunks whose rotated collider bounds are within
`neighborRadiusMeters` receive body-local neighbor seams. A material breakthrough
removes only constraints connected to the failed chunk; subsequent failures come
from measured solver stress in the remaining graph. This lets one impact release a
local piece, transmit force through a wall, or progressively collapse a structure
without authored frame transforms or mutable playback history. Disconnected
clusters fail authoring with the affected chunk and the supported alternatives.
`anchored` retains the compatibility behavior where every chunk attaches directly
to the world. Both modes use the same fixed-step world, break events, checkpoints,
and contact telemetry as ragdolls in gameplay, preview, scrub, and export.

## Rotation and constraints

Bodies accept a normalized `rotation: [x, y, z, w]`, `angularVelocity: [x, y, z]`, and bounded `angularDamping`. `setRotation`, `setAngularVelocity`, `applyTorqueImpulse`, and `applyImpulseAtPoint` mutate live dynamic state through stable handles. Quaternion integration is performed in the same deterministic body order as translation and renormalizes every step. Sphere and box bodies use shape-derived diagonal local inertia tensors; torque and off-center impulses are transformed through the current world orientation. Collision normal and friction impulses use contact-point velocity and transfer angular momentum.

`addDistanceConstraint` joins two live bodies at a target center-to-center distance. `addPointConstraint` joins two body-local anchor points while allowing free relative rotation, which is the baseline articulation primitive for limbs, props, planted supports, and breakable assemblies. Point constraints can add bounded anchor-relative velocity damping and a maximum per-step grip impulse; this prevents an authored plant from accumulating lateral skate while still allowing physical rotation around the contact. Both constraint kinds accept optional deterministic `breakImpulse`; exceeding it removes the constraint and increments `diagnostics.constraintBreaks`.

`addAngularMotorConstraint` drives one body toward a normalized target orientation relative to another using bounded torque impulses. Stiffness, damping, and maximum torque remain editable through `configureAngularMotorConstraint`, allowing an active ragdoll controller to ramp from pose following to passive simulation without replacing bodies or teleporting rotations. `addAngularLimitConstraint` independently keeps the relative rotation inside a deterministic symmetric cone around a canonical reference quaternion. `addAngularSwingTwistLimitConstraint` is the anatomical alternative: it decomposes relative rotation around an explicit normalized longitudinal axis, then independently bounds swing plus signed minimum/maximum twist. Both limits use the same inertia-aware bounded impulses, so passive limbs remain articulated without a second pose runtime or a corrective teleport. `constraintTelemetry` writes the latest maximum error, accumulated absolute impulse, and impulse-cap saturation into caller storage, making solver failure inspectable without playback-history state or per-step allocation. Constraints have fixed `maxConstraints` capacity, stable handles, lookup/removal/query methods, and `constraintIterations` from 1 through 32. Removing either body removes connected constraints.

Active ragdolls can also consume a per-frame root-motion displacement as a target
velocity through `driveRootMotion`. The controller applies a bounded impulse to the
declared root body when no planted support owns the stance. With an ordinary
whole-body plant, it instead matches center-of-mass velocity by distributing the
bounded impulse across every unplanted body; the planted foot or hand remains the
ground-reaction anchor rather than skating with the root. The same contacts, CCD,
constraints, and breakable materials accept or reject the travel. It never
teleports bodies. Tracked airborne
characters cannot be steered by clip travel; takeoff velocity and explicit forces
remain authoritative until landing. Passive, settled, and recovering ragdolls also
ignore root-motion drive so consequence and get-up physics cannot be canceled by an
underlying looping clip. An active joint, effector, or launch action also owns the
body for its causal window: clip locomotion yields automatically and emits one
stable diagnostic at the source performance segment instead of combining two
unrelated actuators.

## Active and passive ragdolls

`@hyperfocus/engine/physics/ragdoll-3d` builds on the same rigid world; it does not
create a separate animation or export solver. A ragdoll maps stable bone IDs to
dynamic bodies, joins matching local anchors, and drives editable relative
quaternion poses through the bounded angular motors above.

The project runtime evaluates each portable performance pose once in this order:
rest pose, pre-animation corrections, the current clip plus adjacent-clip blend,
post-animation and weighted corrections, then weighted two-bone IK. Skinning and
active-ragdoll motor targets consume that same evaluated pose. A correction therefore
cannot move a visible hand without moving its physical motor target, and recovery
does not need a second pose representation. Each performance segment may store an
explicit incoming `blend` or `cut`. Ordinary authoring uses the exported
frame-rate-aware 180 ms recommendation and clamps protected blends to it; only a
declared `cut` may use zero. Capability preflight reports legacy or raw adjacent
zero/short blends at the exact `blendFrames` pointer before canonical rendering.
Pose corrections carry portable
blend-in/blend-out handles and easing; missing handles receive the same
frame-rate-aware 180 ms ease used by IK. Pose and IK cues store an explicit
`transition: "blend" | "cut"`; a protected blend clamps missing or short handles,
and only a declared `cut` produces a hard edge. Raw one-frame or short-handle data
fails capability preflight as `pose-transition-implicit-snap` at its exact pointer.
Portable IK optionally stores a windup target, strike-start frame, exact contact
frame/target and model-space contact velocity, follow-through target, easing, and
bounded blend envelopes. `momentum` interpolation holds the windup through the
strike start, then uses an absolute-frame cubic Hermite segment whose derivative at
contact exactly matches the declared velocity. The post-contact segment represents
the collision response or redirected follow-through rather than erasing approach
speed with an ease-to-zero curve. Sampling derives both the target trajectory and
correction weight from the absolute frame; arbitrary scrub, sequential playback,
skinning, and motor compilation therefore agree without playback history. Missing envelopes default to a
frame-rate-aware 180 ms ease, while a declared `cut` remains the hard-transition
escape hatch. IK chains use stable rig bone IDs; missing bones, an unordered root/middle/end,
or contact/blend timing outside the cue fails preflight at the exact correction
pointer.

Ragdoll mode cues also blend by default and respect the definition's minimum
transition time. `discontinuous: true` is a portable, explicit expert override that
applies the target authority immediately. It is never inferred from a zero or short
duration, so ordinary timeline edits cannot accidentally create a one-frame
animation-to-ragdoll snap.

Articulated effector drives store only compact hand, foot, or tool intent: an
ordered physical joint chain, direction, distance, speed cap, duration, and bounded
tracking authority. The solver distributes equal-and-opposite torque through the
live chain. Optional orientation intent can align one stable local contact-face axis
with the travel direction. The runtime captures the live activation rotation and
uses the shortest quaternion turn, so an author does not need to guess a world axis
or Euler angle. The legacy signed world-axis turn remains an explicit expert mode.
A drive may stop on an existing targeted launch's exact collision tick;
later drives may start from that post-contact pose at a deterministic fixed-step
offset. Contact, follow-through, and recovery therefore follow the collision that
actually happened rather than a guessed display frame. Active drive start points
and ticks are checkpoint state, so sequential gameplay, arbitrary scrub, preview,
and export reproduce the same phase boundaries. Missing, untargeted, or
wrong-effector launch references fail preflight at the contact pointer.

`createHumanoidRagdoll3D` is the bounded authoring baseline for inspected humanoid
rigs. Given stable bone IDs plus canonical model-space rest positions/rotations, it
selects major bones, preserves the entity transform through an explicit root
binding offset, derives joint anchors and relative motor targets, distributes a
requested total mass, and assigns one collision layer whose mask excludes only
that ragdoll. It derives each longitudinal twist axis from the inspected rest-pose
bone direction and supplies conservative body-role swing and signed-twist ranges.
Every generated axis, limit angle, stiffness, damping, and torque cap remains
ordinary editable joint data. The visible editor defaults new joints to this
anatomical envelope while retaining the symmetric cone as an explicit legacy or
non-anatomical option. The result is an ordinary `RagdollDefinition3D`; gameplay and video
consume the same controller. Missing anatomy, stale rest metadata, unsupported
world scale, or more than 30 self-filtered characters fails before simulation.

The controller exposes five observable modes:

- `animated`: full motor authority follows an authored pose;
- `active`: reduced authority lets impacts physically disturb the pose;
- `passive`: motors ramp to zero and the rigid solver owns the consequence;
- `settled`: entered only after every body stays below authored linear and angular
  thresholds for the authored duration;
- `recovering`: root impulses and a motor ramp physically converge on an authored
  recovery pose, then return to `animated` only inside position and angular-speed
  tolerances.

Mode changes use `minimumTransitionSeconds` by default, so a caller cannot produce a
one-frame idle-to-pose snap accidentally. A discontinuity remains possible only by
explicitly passing `discontinuous: true`. `beginRecovery` never teleports the root or
limbs. It applies bounded impulses toward the requested root transform while the
same editable pose motors regain authority. A recovery may require one through
eight stable support bones. The controller tests those bodies against real scene
  ground and respects the authored layer mask and slope. Before recovery begins and
  before animation regains authority, it forward-projects every ragdoll body into the
  canonical target pose and checks both its target collider and a conservative swept
  path against other collision-enabled bodies. Supporting ground remains valid; a
  blocked hand, foot, torso, or root reports the exact bone, obstacle, and whether the
  failure is on the path or at the destination. It cannot return to `animated` while
  any body is obstructed, support is missing, root position has not converged, or
  angular speed remains above the authored threshold. Off-center
`applyImpulse` calls transfer both linear and angular momentum through the rigid
body's shape inertia.

A ragdoll locomotion policy derives `grounded`, `airborne`, and `landing` from the
same support bodies and fixed-step contacts used by collision response. Landing is
entered only when an airborne support bone actually contacts a compatible upward
surface above `minimumLandingSpeedMetersPerSecond`. Contact speed, energy, impulse,
point, bone, surface, and normalized severity become checkpointed observable state.
For `landingDurationSeconds`, severity scales motor stiffness, damping, and torque
toward `landingMotorYield`, then returns them with a smooth fixed-step ease. The rigid
bodies therefore absorb and compress under collision forces instead of switching to
a baked landing pose. A rebound returns to `airborne`; a softer contact goes directly
to `grounded`. Gameplay, scrub, Play, and export consume the same event and state.

The same portable character policy can opt into proportional impact response.
`minimumStaggerSpeedMetersPerSecond` ignores contact below a useful consequence,
while `knockdownSpeedMetersPerSecond` transfers the character to passive physics.
Contacts between those thresholds enter observable `staggered` authority: support
and current velocity remain physical, balance correction pauses, and motor strength
yields by the measured severity before a smooth timed return. Repeated contacts
restart the strongest active stagger. Contact speed, energy, impulse, severity, and
elapsed response are checkpoint data, so gameplay, sequential playback, arbitrary
scrub, and export cannot choose different reactions. An explicit active or passive
launch response remains available for supernatural or deliberately fixed staging.

Recovery motor targets are inertialized as well as motor authority. At activation,
the controller captures every joint's actual physical relative rotation, then follows
the shortest normalized quaternion path into the live canonical pose. The portable
`poseTransition` setting defaults to `"blend"`, and `poseBlendSeconds` defaults to
the recovery duration while remaining clamped to the ragdoll minimum. Only
`poseTransition: "cut"` is the expert hard-cut escape hatch; zero alone cannot
accidentally snap the body upright. The captured source pose, elapsed blend, and target are
checkpointed, so sequential stepping, arbitrary-frame scrub, and export cannot choose
different stand-up arcs.

Portable physical-performance recovery can additionally map `upright`, `face-up`,
`face-down`, `left-side`, and `right-side` postures to existing canonical rig clip
IDs. The configured stable torso/chest body is classified from its normalized local
forward, right, and up axes against world up only after the physical consequence has
reached recovery. The chosen named clip is evaluated through the same glTF clip,
pose-layer, IK, and ragdoll-motor path used everywhere else; it is not a baked pose
or video-only state machine. Selected posture, clip, activation frame, and clip time
are deterministic checkpoint state. Missing posture bodies or rig clips fail with
portable project pointers and available alternatives before export.

The same get-up mapping can optionally declare existing canonical clips for
`crouched`, `wall-supported`, and `ledge-supported` recovery. The fixed-step world
classifies those environments from collision-enabled static or kinematic geometry:
bounded standing headroom above the root, deterministic horizontal wall proximity,
  and five downward footprint probes with a height tolerance. A true projected-body
  or transition-path obstruction still blocks recovery; crouching never lowers the
  hips, torso, hands, or feet through terrain or bypasses collision. Environment
  selection, the chosen clip, and activation frame
are checkpointed alongside posture selection, so direct scrub cannot choose a
different terrain response from sequential playback or export.

The controller owns stepping of its supplied shared world so multiple ragdolls and
breakable scenery remain in one deterministic contact domain. Calling code must not
also step that world. Given the same definitions, fixed timestep, pose/mode changes,
and impulse order, gameplay, preview, and offline sampling receive identical body
states.

Joint-local actuation is the compressed internal-motion baseline. A drive references
an existing ragdoll joint, supplies a normalized parent-local axis, signed angular
distance, peak-speed cap, bounded per-step torque impulse, and frame duration. The
performance runtime samples a smooth velocity arc with zero endpoint speed from
absolute fixed-step time, then solves the effective inverse inertia of both connected
bodies and applies equal-and-opposite torque impulses. This preserves intrinsic
angular momentum while producing deterministic anticipation, contact,
follow-through, or recovery motion. No mutable playback history or video-only pose
runtime is involved; arbitrary scrub and checkpoint resume recompute the same drive.
Overlapping drives on one joint and timing that would exceed the declared peak speed
fail preflight with the physical cue pointer.

Physical action authority is safe by default. A joint drive, effector drive, or
launch cannot begin while its character is `downed` or `recovering`, and a drive
already in progress is permanently interrupted if a collision changes the character
to either state. The compiler emits `action-authority-conflict` at that cue's
`allowAuthorityOverride` pointer instead of allowing a queued punch to resume after
the character stands up. The blocked cue IDs are checkpointed, so direct scrub,
sequential playback, gameplay, and export make the same cancellation decision.
`allowAuthorityOverride: true` is the explicit expert escape hatch for supernatural
actuation that must continue while the consequence or get-up system owns the body.

Articulated effector actuation is the ordinary multi-joint counterpart. An
`effector-drive` stores one stable effector bone, an ordered connected joint chain,
world direction, distance, peak linear speed, and bounded tracking/velocity/torque
gains. It may also carry target-aware contact-face alignment (`aim-at-body` plus one
effector-local axis and a stable physical body reference), travel alignment
(`align-direction` plus the local axis), or an expert world-space turn (axis plus
signed angular distance). Target-aware alignment captures the vector from the live
effector to the live target when each phase activates, so anticipation can travel
backward while the fist already turns toward the opponent. Every form includes peak
angular speed, bounded tracking gain, and bounded angular torque. At each absolute fixed step the runtime samples a smoothstep position and
zero-endpoint target velocity, then distributes Jacobian-style torque from each live
joint pivot to the effector. Every parent/child pair receives equal-and-opposite
torque, so the hand or foot moves while intrinsic whole-body angular momentum is
preserved. When orientation is enabled, the same drive resolves the shortest turn
from the actual activation rotation, samples a zero-endpoint axis-angle path, tracks
 quaternion error without random reorientation, caps requested angular speed, and applies equal-and-opposite
 shape-aware torque across the same connected chain. The cue captures its physical
 start point, rotation, and resolved orientation goal once; those starts and the active drive are checkpoint data,
 making direct scrub, sequential playback, gameplay, and export identical. Chains are
 limited to eight distinct authored joints. Missing or reversed links, overlapping
 authority on any chain joint, and a duration that cannot honor either speed cap fail
 preflight at the cue pointer.

An optional portable `path` curves that same live physical drive without adding a
pose, emitter, or video-only runtime. `arc` paths choose a horizontal or vertical
plane, positive height, and optional mirror side. Their biomechanical bump and its
velocity are zero at both endpoints, so adjacent anticipation/contact/consequence
cues remain continuous. The compiler includes lateral arc velocity in peak-speed
preflight, captures only the ordinary drive start, and recomputes every target from
absolute fixed-step progress. Hooks and weapon swings therefore differ physically
from straight punches, while checkpoint replay and arbitrary-frame scrub stay exact.

Newly authored drives default `supportMode` to `auto`. When a drive activates, the
ragdoll resolves the shortest deterministic joint path from a live planted support
body to the effector, or falls back to the authored limb chain when no connected
support exists. The internal path may traverse an authored joint in reverse from foot
to hips; anchors and handles are oriented for the solved path without changing the
portable rig. Equal-and-opposite torque still conserves intrinsic angular momentum,
while the existing plant constraint supplies the external ground reaction that makes
a grounded strike read from foot through torso to hand. The chosen support bone and
joint IDs are captured once in the drive checkpoint, so a resumed arbitrary-frame
sample cannot silently switch stance. `supportMode: "free"` is the explicit airborne
or unbraced path. A missing field retains legacy free-body behavior rather than
changing an existing project's motion.

An authored ragdoll support probes downward from a stable bone body against an
explicit ground layer mask. A valid upward-facing hit becomes a point constraint
between the exact world contact and the real hit body, so moving or breakable terrain
remains part of the same simulation. Probe distance, slope threshold, maximum plant
speed, stiffness, damping, grip impulse, and break threshold are bounded portable
inputs. Passive mode releases all plants before consequence simulation; a missing
surface or prematurely broken support produces a deterministic physical diagnostic.
While one or more plants are active, the controller projects the ragdoll's
mass-weighted center of mass and a bounded velocity forecast onto the current support plane. It builds a deterministic
convex footprint from the live body-local contact anchors, expands that footprint by
the authored contact radius, and applies only a bounded horizontal impulse when the
current or forecast projection leaves it. The ordinary correction is mass-distributed
across unplanted bodies instead of kicking only the root; `root` distribution remains
an explicit compatibility setting. One contact therefore behaves as a disc, two as a capsule, and
three or more as a convex support polygon. Balance radius, stiffness, damping, and
maximum impulse plus the zero-through-two-second forecast are portable support-cue fields; a zero maximum impulse deliberately
disables balance assistance. The controller reads moving or breakable support bodies
every step, checkpoints the active balance state, and releases it with the plant on
passive impact. Balance alone never teleports the root or silently invents a
foothold. A separate opt-in capture-step intent supplies that higher-level decision:
stable swing-foot bone, horizontal travel direction, planned body speed, forecast
horizon, maximum reach, swing duration/lift, and bounded ground/controller tuning.
If the forecast remains inside the live support polygon the cue is `contained` and
does nothing. Otherwise the controller requires another planted support, releases
the swing foot, preserves its lateral stance offset, clamps reach, samples canonical
collidable ground, and impulse-drives a zero-end-velocity arc before establishing an
ordinary support constraint. The ground target stays body-local on moving or
breakable terrain. Controller phase, ground-relative target, and all tuning are
checkpointed, so arbitrary scrub, sequential Play, gameplay, and export produce the
same step and landing.

`sample3DPhysicalInspection` is the allocation-tolerant authoring view over that
same compiled performance. At any arbitrary frame it derives mass-weighted center
of mass and velocity, the current and forecast balance distance, the convex hull of
active authored support windows, launch/effector intent, solved body travel, and a
bounded history of exact contacts with closing speed, impact energy, and normal
impulse. It does not step a second world or consume mutable playback history.
Support markers are explicitly authored windows over simulated bodies; aim markers
are requested targets or directions; only contact markers are solver-confirmed
collisions. Hosts decide whether to draw this portable evidence. The first-party
editor enables it only for preview inspection and excludes it from Play, build, and
encoded video frames.

A separate grounded takeoff intent supplies support bones, a horizontal direction
and speed, and a positive vertical speed. At activation the controller requires
those bodies to reach real upward-facing collidable ground and rejects an already
rising or falling character above the bounded vertical-speed threshold. Horizontal
run-up remains valid. A successful takeoff releases all planted supports and capture
steps, then applies the mass-proportional impulse needed to set the ragdoll's
center-of-mass velocity while preserving relative body motion. Gravity, contacts,
joint limits, and external forces own the airborne arc and landing; the cue does not
author airborne transforms or a landing frame. The identical fixed-step state is
restored for direct scrub and checkpoint replay, so an unsupported second jump is a
diagnostic rather than invented air authority.

Each ragdoll may also carry one portable locomotion policy: stable support-bone IDs,
ground collision mask, probe distance, minimum upward normal, and maximum grounded
vertical speed. Auto-rigged humanoids receive a foot-based policy; older/manual rigs
without one report `untracked` instead of guessing. The runtime derives
`grounded`/`airborne` plus `ready`/`acting`/`downed`/`recovering` state from the same
fixed-step bodies and records only deterministic state transitions. By default an
external launch cannot add propulsion to a tracked airborne character; an authored
`allowAirborneExternalActuation` escape hatch is required for an explicit rocket,
telekinetic force, or similar modeled cause. Checkpoints preserve both current state
and transition history, so gameplay, scrub, Play, and export agree.

## Compressed physical performance intent

`@hyperfocus/engine/physics/physical-performance-3d` is the portable sequencing
layer above the rigid world and ragdoll controller. Its document stores world bodies,
ragdoll definitions, ordinary pose/mode/recovery/support/capture-step/jump/joint-drive/
effector-drive cues, and compressed launch intent.
A launch specifies an attacker bone, meters per second, optional world-space degrees
per second, and an optional target. Ordinary `target-at-launch` intent derives the
direction and collider-surface gap from the actual simulated bodies when the cue
begins, including rotated-box support extents. A small editable travel padding only
bounds the missed-contact search. Expert `authored` targeting retains an explicit
direction and travel distance for deliberate misses, fixed vectors, or environmental
launches. A launch may also declare an expected contact frame and integer frame
tolerance. It does not store a curve of generated per-frame transforms.

An `effector-drive` may also carry a portable `translationTarget` body reference.
Each fixed substep recomputes the drive direction from the current effector and live
target positions while retaining the authored distance and speed bounds. This is
the ordinary pursuit/contact path for a moving opponent: it is checkpointed, rejects
missing or self targets at the cue pointer, and never depends on playback history.

`planPhysicalActionIntent3D` is the framework-neutral authoring baseline above that
document. It accepts one plain options object containing `frameRate`,
`distanceMeters`, `speedMetersPerSecond`, optional
`angularVelocityDegreesPerSecond`, and optional `response`. Its result is finished
portable timing and actuator tuning rather than playback state. The planner never
steps the world, guesses contact, or creates a second animation runtime; the existing
macro expands its result into the same physical cues consumed by gameplay, scrub,
preview, Play/build, and export.

Ordinary launches and articulated drives obey the character authority state above:
downed and recovering bodies reject new action intent, and interrupted intent stays
canceled after recovery. This makes physical consequences part of the action graph
rather than a temporary visual overlay. Only an explicitly authored
`allowAuthorityOverride` can bypass that rule.

The first-party physical-action authoring macro ordinarily pairs that launch with
four articulated effector drives: reverse-direction anticipation, contact travel,
follow-through, and reverse-direction recovery. Given an attacker effector, it
follows the physical parent joints to infer one stable ordered chain. The user
ordinarily supplies only speed, travel distance, optional angular-velocity vector,
and a `natural`, `snappy`, or `weighty` response. Automatic planning derives bounded
anticipation, travel, consequence, and recovery frames; feasible zero-endpoint
effector distances and speed; a normalized spin axis with feasible phase turns;
exact-contact tolerance; and capture-step defaults. Identical compact intent
therefore expands identically without per-frame pose queries. `natural` is the
default and keeps a minimum readable wind-up and recovery even for a short action.
Explicit custom planning exposes phase durations, effector distances, peak speed,
and shared world-turn tuning; every generated phase remains an ordinary editable
cue in either mode. The contact drive stops on the targeted launch's exact collision
tick. Follow-through starts from that post-contact pose, and recovery uses an exact
fixed-step offset from the same event; the displayed frames remain editable
planning positions. The macro rejects a speed that cannot cover a phase under the smooth
zero-endpoint profile before it mutates the sequence. It also prevents a single
action from combining effector, single-joint, and pose-trajectory authority on the
same limb.

Portable IK remains an explicit non-physical trajectory alternative consumed by
skinning and active-ragdoll motors. Given an attacker effector, it follows two
physical parent joints to infer the stable
root/middle/end chain and resolves the owning character through the ragdoll root
binding. The ordinary `solve` path converts collider-gap displacement and requested
world speed into model space, then derives a reachable windup, strike window,
velocity-matched contact, bend pole, and bounded follow-through from the canonical
rig rest pose. Requests outside the two-bone chain reach fail before mutation with
the distance the character root must move and authored-root-motion as the supported
alternative. The generated model-space vectors and timing become an ordinary
absolute-frame IK cue; support, launch, passive consequence, and recovery
remain ordinary physical cues. Generated attacker-return and target-recovery cues
carry `afterContact: { cueId, offsetFrames }`, so their editable `frame` is only a
planning position while runtime authority follows the referenced launch's solved
contact. Missing joints or bindings fail during authoring with
a supported force-only alternative. The macro adds no frame-baked transforms and no
video-only solver.

When the attacker has at least two selected foot/ankle supports and enough
anticipation for the minimum physical swing, the macro also expands an ordinary
capture-step cue. It selects the lead foot along the horizontal attack direction,
plants the remaining stance foot, bounds body speed independently from effector
speed, and holds the resulting plant through commitment. Vertical-only attacks,
single-support rigs, and shorter anticipation omit the step rather than inventing an
invalid foothold. The cue is individually editable or removable after the one-undo
macro. It still does not invent hip/shoulder pose or stretch an unreachable limb;
those remain explicit animation, root motion, and editable IK intent.

The runtime converts the requested linear speed into one mass-aware launch impulse.
Ordinary `whole-body` actuation applies the equal-and-opposite reaction across every
remaining ragdoll body in stable mass order, preserving the articulated system's
linear momentum before planted ground reaction. Requested world angular velocity is
converted from the effector's current spin into a shape-, mass-, and
orientation-aware torque impulse. Whole-body actuation distributes the exact
equal-and-opposite intrinsic angular impulse across the remaining bodies by their
effective inertia around that torque axis, so a strike creates deterministic torso
and hip counter-rotation instead of overwriting the hand's rotation alone. Explicit
`external` actuation adds net linear and angular momentum for explosions,
telekinesis, and deliberate whole-character launches. A single-body
ragdoll cannot use whole-body actuation and fails preflight at the cue pointer with
the full-rig and external alternatives. The shared rigid world then determines contact, momentum transfer, rotation,
bounces, and terrain interaction. The authored angular velocity is an absolute
world-space effector target at the launch boundary, not a per-frame orientation;
after that impulse the solver preserves angular continuity. A
body referenced as a launch attacker is automatically given continuous collision
protection in the derived runtime, without adding another authored toggle. The
portable body definition remains unchanged, and the same derivation is used for
sequential play, arbitrary scrub, checkpoints, preview, and export. Continuous
box-shaped effectors sweep both translation and rotation through oriented sphere/box
contact, so a spinning tool can transfer angular point velocity even when its center
barely moves. Each contact
record contains the exact simulation tick, output frame and subframe,
contact point, and normal. Animation response, deformation, sound, particles, and
camera reaction can therefore consume one event rather than separately guessed
frames. Full-action authoring estimates contact from launch frame plus
`ceil(resolvedColliderGap / speed * frameRate)` for target-relative intent, places
the pre-contact IK target on that later frame, but anchors physical consequence and
return/recovery to the exact contact plus their editable offsets. This avoids a
causal loop in which a punch trajectory would depend on the contact it creates while
ensuring that a late or early collision cannot make the body recover on a guessed frame.
Joint-drive, effector-drive, and launch cues may share one stable `actionId`. The
launch is that action's single lifecycle owner and stores non-negative
`consequenceFrames` and `recoveryFrames`. Its exact solved contact tick changes the
portable character state from contact to consequence, then fixed-step time advances
through recovery and releases the character to ready. A miss skips consequence and
enters recovery; a stagger, knockdown, landing, or get-up interruption cancels the
chain so a later authored phase cannot restart after the body recovers. While one
action owns a character, unrelated and legacy action cues are diagnosed instead of
overlapping it. Active, canceled, and completed action identities are checkpointed,
so sequential Play, arbitrary-frame scrub, resume, and export make the same authority
decision. Documents without `actionId` retain the compatible loose-cue behavior.
Authored-vector intent retains `ceil(distance / speed * frameRate)` and may enforce
an explicit contact window. The solver event remains
authoritative for deformation, sound, particles, and camera response. A launch that
reaches its resolved or authored travel/time window without the requested target produces a
`launch-missed` diagnostic instead of an invented impact; a collision outside the
authored window produces `contact-timing-mismatch` with the exact cue pointer rather
than allowing animation and presentation to disagree silently.

`auditPhysicalContactPoseAgreement3D` accepts the render-authoritative entity/bone
evidence sampled at that solved frame. It requires visible participants, stable rig
bones, a rendered contact envelope that reaches the solved point, and any active IK
target to agree with the same point. The editor's mutation-free contact certification
uses this boundary for rigged actions before commit; it samples the ordinary
`sample3DFrame` result whose physical bindings later override the same skeleton in
preview, Play, and export. This is an acceptance check over the shared runtime, not a
second pose or video simulation.

Portable timeline presentation uses that same event through `contactResponses`,
`effectCues[].contactId`, and `impactFrames[].contactId`. Each accepts a
non-negative frame offset; zero preserves the collision subframe for mixed audio,
while a positive offset intentionally starts on that later whole frame. Camera
recoil, declared audio, deterministic world-space particles, and impact cards are
therefore aligned by one solved contact in arbitrary scrub, Play, canonical preview,
full or range export. Unknown contact or audio references fail preflight at their
portable project pointers.

Mode, recovery, and articulated effector drives may use `afterContact`; articulated
effector drives may also use `stopAtContact` to end
commitment on the exact fixed-step collision. Import preflight
requires the reference to name an existing launch and the offset to be a
non-negative integer that can resolve within the performance at the launch's
earliest possible contact. The runtime rechecks the actual solved contact; if the
resolved frame falls outside the performance it emits `contact-anchor-out-of-range`
at the anchor offset pointer. Exact contact events are checkpointed, so sequential
stepping, arbitrary scrub, resumed suffix compilation, Play, and export apply the
anchored cue on the same frame without a mutable playback-history queue.

Recovery is likewise consequence-driven rather than timer-driven. A portable
recovery cue may use `startCondition: "after-settled"` so its frame is only the
earliest eligible time: passive physics continues through falls, bounces, and rolls
until the ragdoll reaches its authored settle thresholds. `maximumWaitFrames` bounds
that wait; expiry records `recovery-not-settled` instead of forcing motors over a
moving body. `target.positionMode: "settled"` resolves the recovery root when the
cue actually begins: X/Z come from the deterministic simulated root. When stable
support is required, each canonical support offset is projected beneath that root
and raycast against the current shared physical world; the highest valid
upward-facing collidable surface plus the canonical root-to-support offset determines
Y. Self bodies, triggers, incompatible collision masks, and stale pre-impact terrain
cannot become support. This prevents both lateral pullback and standing a fallen hips
root inside the floor, including after terrain moves or breaks. Missing ground emits
`recovery-unsupported` at the cue's ground-layer pointer instead of applying recovery
forces in space. Use `positionMode: "authored"` with `rootPosition` for deliberate
restaging. Legacy cues that omit
`positionMode` and include `rootPosition` remain authored. Pending settled recoveries are part of deterministic checkpoints, so
sequential Play, arbitrary scrub, resumed compilation, and export begin recovery on
the same fixed step. The compiler records `recovery-obstructed`,
`recovery-unsupported`, or `recovery-incomplete`
when a character cannot physically reach a safe return-to-animation state. These
diagnostics are identical for sequential Play and arbitrary-frame compilation and
block the canonical video renderer before it can encode a floating or intersecting
stand-up.

The optional portable `quality` gates also reject severe collider penetration,
velocity changes that have no contact, constraint, gravity, or authored actuator,
and joints that remain torque-saturated outside their angular envelope for an
authored number of output frames. Diagnostics point to the offending body or joint
definition and capture exact solver-space evidence when emitted: the penetration
contact, accelerated body center, or saturated joint span. That location remains
available to arbitrary-frame inspection even when a compact output list omits an
unrendered body. The monitor consumes deterministic rigid-world contacts and constraint
telemetry, so sequential Play and compiled arbitrary-frame output fail identically.

Portable point and distance constraints can join ordinary world bodies into
breakable terrain assemblies. A seam fails either when solver stress exceeds
`breakImpulse` or when a connected chunk reports a qualifying material impact. The
performance runtime emits one break record with the cause, measured energy and
impulse when applicable, exact constraint, simulation tick, output frame, subframe,
body references, and optional stable `groupId`. Every seam generated for one
breakable assembly shares that group. Group-linked consumers select the earliest
record, so one structural failure cannot multiply sound, visibility, or effect cues
when several seams fail during the same cascade. Rendering can swap intact and
fractured canonical variants or start debris from that record without guessing when
the physical seam failed. The shared frame sampler applies portable break responses
after ordinary entity tracks, starts world-space deterministic emitters at the
recorded point, and emits audio only on the owned break frame. First-party MP4
mixing converts that event into a transient audio track at `frame + subframe`, so a
partial export preserves the same offset instead of retriggering at its range start.
Portable physical fragment bindings reference an output body, break group, and
existing static mesh/material. They remain hidden before the group's first break;
afterward the shared frame sampler publishes their exact simulated transform as
ordinary model-effect instances for the first-party renderer. Arbitrary-frame scrub
reads the compiled body state directly, so fragments collide, settle, checkpoint,
and render identically to sequential Play instead of following an analytic particle
arc. The editor's fracture-volume macro only expands an intact entity into these
ordinary bodies, constraints, fragment bindings, and one group-linked hide response.
Preview inspection resolves a qualifying impact back to the failed body's portable
`fractureEnergyJoules` and `retainedEnergyRatio`, placing measured energy, threshold,
ratio, speed, and impulse at the exact recorded break point. Stress-only seam failures
remain explicitly labeled as stress because they do not invent an impact-energy value.

A portable `bind` performance cue turns a solved contact into persistent physical
contact without inventing follow-up poses. Contact mode derives both body-local
anchors from the targeted launch's exact fixed-step collision and requires a zero
frame offset; authored mode instead exposes two explicit local anchors at its
timeline frame. The positional bind may preserve the bodies' captured relative
rotation or leave a free pivot, and may release early when its measured impulse
exceeds `breakImpulse`. Duration release, stress breakage, bind events, and active
constraint topology are checkpointed, so sequential gameplay, arbitrary-frame
scrub, Play, and export produce the same grip, carry, or embedded-tool state.
Several bind cues may constrain the same held body at independently solved contacts.
This is the portable representation for a two-hand grip: one contact normally uses
`preserve` to own relative orientation while the other uses `pivot` as a positional
stabilizer, avoiding two angular motors fighting over the prop. Each bind activates,
breaks, and releases from its own contact and duration. The editor's two-contact
grasp macro only expands that pattern into two ordinary bind cues; gameplay and
video do not have a separate grasp runtime.

`createBreakableAssembly3D` is the shared gameplay/video builder over that
representation. It converts canonical chunk transforms into ordinary dynamic world
bodies, holds each body at its authored transform with one point seam, and excludes
the hidden static anchor from collisions. Collider shape/scale, per-chunk mass,
seam strength, fracture energy, and post-fracture energy retention are explicit
inputs. Material presets derive mass-scaled safe defaults, which expand into ordinary
portable numbers. The first-party editor adds only canonical scene
bindings and undo/UI concerns around that shared output. Removing the editor macro
output deletes only those bodies, bindings, seams, and dependent launch targets;
canonical meshes, materials, and scene entities are never copied or removed.

`createPhysicalPerformanceRuntime3D` is the sequential gameplay/Play path.
`compilePhysicalPerformance3D` drives that same runtime once and stores compact
Float32 body states for arbitrary-frame preview and export. `writeFrame` has no
playback-history dependency. Tests compare every compiled frame against sequential
stepping exactly, including the detected contact event. The simulation frequency
must be an integer multiple of the output frame rate so frame/subframe ownership is
unambiguous.

`createPhysicalPerformanceCompiler3D` is the latency-sensitive form of that same
compiler. It simulates only the causal prefix needed by the highest requested frame,
caches those states, and extends the prefix deterministically when the user scrubs
forward. Scrubbing backward is an immediate cache read. `ensureComplete` uses the
same runtime to finish the document before export and event-audio preflight; it is
not a lower-quality or preview-only simulation path.

When every free world body is static and all ragdolls take authority later than
frame zero, the compiler fast-forwards the quiescent prefix in one host slice. It
stores the same initial body state for every skipped frame, preserves checkpoint
frame/tick clocks, and begins ordinary fixed-step simulation on the exact first
activation or cue frame. Any dynamic world body, frame-zero ragdoll, or earlier cue
disables the optimization. This makes late range previews cheap without creating a
range-only physics path or changing arbitrary-frame results.

The first-party editor retains one such compiler across renderer invalidations when
the exact physical dependency fingerprint is unchanged. Editorial-only camera,
shot, material, lighting, post, title, and effect changes therefore do not restart
physics. The fingerprint includes simulation and bindings, motor-driving
performance/pose/IK data for physically bound actors, their stable rig and mesh
bindings, and the content metadata of the source animation assets. Any change to
those inputs builds a new compiler; explicit disposal and asset rehydration clear
the retained compiler. This cache changes work performed, never evaluated state.

For a late physical edit, the compiler also supports bounded deterministic resume
points. `RigidWorld3D.checkpoint` captures body motion, previous-step state,
contacts, constraint topology and telemetry, and diagnostics while requiring the
same body topology on restore. The ragdoll layer adds motor authority transitions,
pose targets, plants, settling and recovery state; the quality monitor adds prior
velocities, joint-saturation counters, and already-reported gates. The physical
performance layer adds its absolute frame/tick, active launch windows, active
contact binds, support and recovery deadlines, broken seams, poses,
contact/bind/break events, and diagnostics.

`createPhysicalPerformanceCompiler3D` can retain these checkpoints at a bounded
frame interval and produce a `resumePointBefore(frame)`. The resume point is always
strictly earlier than the first changed input, includes the already-compiled
Float32 prefix, and restores into a newly preflighted runtime for the revised
document. The editor fingerprints static physical topology separately from temporal
cues. Static world, body, ragdoll, binding, rig, mesh, or animation-asset changes
restart at frame zero; a changed launch/support/mode/recovery cue, performance
segment, pose layer, or IK trajectory resumes from the closest prior one-second
checkpoint. Tests compare the resumed suffix, events, breaks, and diagnostics with
a clean full compile exactly.

Hosts that cannot block a render or input thread use the same compiler's
`advance({ throughFrame, maximumFrames })` operation. Each call performs at most
the requested number of authored frames and reports exact completed/total frame
counts, ratio, target, and completion state. The engine does not own browser task
scheduling or `AbortSignal`; a host can yield between calls, stop issuing calls on
cancel, and later continue from the compiler's unchanged verified prefix. The 3D
runtime's `defer` compile option constructs and preflights this compiler without
advancing it. Synchronous `ensureFrame` and `ensureComplete` remain the small
baseline for gameplay, tests, workers, and non-interactive delivery hosts.

## Collision model

The narrowphase supports:

- sphere against sphere;
- sphere against the box's oriented local extents, including a sphere center inside it;
- box against box through all 15 separating axes of the two oriented boxes.

Box/box contact chooses the minimum-penetration separating axis. A face feature clips the incident face against the reference face and deterministically reduces the polygon to at most four spread solver points; edge/edge contact retains one representative point. The public contact stream remains one causal record per body pair, with `manifoldPointCount` exposing the number of solver points and the existing interval-centered point remaining authoritative for timing, break, audio, particles, and camera reactions. This prevents one broad punch or landing from becoming four presentation events while separated contact arms resist unsupported angular skating and transfer friction across the support area.

Each new manifold deterministically matches nearby prior-step points for the same body pair when their normals remain compatible. Matched points apply their cached normal and world-space friction impulses before bounded velocity iterations; `warmStartedPointCount` exposes the result without creating more presentation contacts. Normal impulses accumulate above zero, friction accumulation remains inside the geometric-mean Coulomb cone, and restitution is applied only to a new contact rather than repeatedly injecting bounce into sustained support. The point cache is fixed-capacity and checkpointed, so a restored step produces the same match, warm start, and result. Compatible older version-one checkpoints restore a cold cache. Pair lookup uses the previous contact slot when stable and lazily indexes larger contact sets in fixed scratch storage; small sets retain the linear path. The index is derived from each previous frame, is included in `numericStorageBytes`, and does not alter checkpoints. Removing a body invalidates its cached manifold points before its slot can be reused, so a replacement body never inherits the removed body's impulses.

Dynamic response uses inverse mass and world inverse inertia. Normal and friction effective mass include each contact arm. The public impulse telemetry sums final accumulated normal impulses across the manifold, while closing speed, effective mass, impact energy, and material failure use the highest-energy pre-solve point.

Position correction re-evaluates the current manifold on every bounded position iteration. It derives a pseudo-angular correction from every contact arm, clamps each body's correction to 0.2 radians per iteration, and uses translation only for the remaining average normal separation. This lets off-center limb, prop, debris, and terrain overlap rotate out through the actual contact geometry instead of lifting the entire body bodily. Symmetric face corrections cancel angular motion and retain the ordinary center translation. Position repair never changes linear or angular velocity. The long-duration acceptance case holds a two-box support stack below `1e-6` meters or radians per second after settling through a ten-second run.

Kinematic and static bodies contribute zero inverse mass and inertia. Triggers report the same bounded manifold but receive no cached impulse, velocity response, or position correction.

Collision requires both `(a.layer & b.mask)` and `(b.layer & a.mask)` to be non-zero. Broadphase uses deterministic typed-array merge-sort sweep-and-prune on X, followed by Y/Z AABB rejection. Once `maxCandidatePairs` is reached, the step stops admitting candidate work and increments `candidateOverflows`. Contacts beyond `maxContacts` are diagnosed and omitted rather than allocating.

Contacts are available after each step with `contactCount()` and `contact(index, callerTarget)`. They include handles, IDs, A-to-B normal, initial penetration, representative contact point, `manifoldPointCount`, `warmStartedPointCount`, and trigger status. The target is required so repeated inspection can remain allocation-free. Checkpoints retain the bounded manifold and accumulated impulse storage; compatible older version-one checkpoints restore their representative contact as a one-point cold manifold.

## Continuous collision detection

Finite platforms still require authored arena boundaries when characters must stay
inside them. CCD prevents crossing a collider; it does not create ground beyond
its extents. `rigid-ccd-resting.test.ts` covers landings at 20–500 m/s across an
18-by-14-meter, 0.4-meter-thick platform, plus airborne side and corner impacts
against a 12-meter enclosure. These regressions distinguish tunneling from the
Touch of Death demo's former open-edge escape: its visible floor and collider
matched, but an outward sprint jump could leave both behind. A separate three-body
regression covers a falling dynamic body hitting a grounded body: swept collision
must not carry the falling body's remaining travel through the floor. The demo's
seeded mixed-input stress reproduced that solver failure after 7,072 ticks.

Near-tangent rounded-corner sweeps nudge along the contact normal before the
discrete solve. A motion-direction nudge could leave the sphere outside contact
tolerance and repeatedly stop it at time zero. The two-body tangent regression in
`rigid-ccd-resting.test.ts` verifies continued motion; floor, enclosure and angular
CCD regressions retain their existing acceptance bounds.

Shallow same-face contacts on static solids can finish in the discrete solver
when normal travel is at most one percent of the sphere radius. This bound must
not depend on tangential speed: ordinary gravity otherwise stalls slow movement
along coplanar floor seams. `rigid/floor-seams.test.ts` reproduces the segmented
Touch of Death street regression with 1.9 gravity scale, compares movement against
one continuous floor at four speeds, and checks seam crossing and wall blocking.
Far-side endpoints and deeper impacts remain swept collisions.

Initial resting overlaps also retain CCD when inward travel crosses the entry
side and the endpoint contact normal faces the far side. An endpoint can still
overlap a thin wall or floor after crossing it; delegating that contact ejects
the fighter through the solid. `rigid/resting-crossing.test.ts` reproduces this
with both wall directions, rotated walls and grounded downward impulses.
The Touch of Death city authoring tests cover its concrete wall and street slab.
Tangential corner motion and ordinary stair climbing remain discrete contacts.

Set `continuous: true` on a dynamic non-trigger body to opt into linear and rotational CCD against static, dynamic, and kinematic bodies. Moving pairs use relative displacement, so a fast effector cannot tunnel merely because its target also moved during the step. Sphere/sphere sweeps are exact for this model. Mixed sphere/box sweeps transform relative travel into the oriented box and solve the exact rounded-box distance across slab intervals. This keeps empty corner space traversable instead of snagging spheres on the expanded broadphase box; `rigid-ccd-resting.test.ts` covers corner clearance, rotated edge impacts, floor support and enclosure retention. Box/box pairs with fixed orientation use continuous interval intersection across all 15 SAT axes; axis-aligned pairs retain the equivalent faster slab sweep.

A pair containing a rotating box also stores both prior quaternions and samples the bounded relative pose path even when the continuous body's center barely moves. Sample density derives from relative translation, both angular arcs, both body radii, and the smallest participating feature, caps at 128 per tested pair, and bisects the first exact narrow-phase interval for a stable contact time. The ordinary contact solver then measures point velocity including angular velocity, so a tool or limb transfers force at the contacted face rather than emitting a zero-speed timeline impact. `ccdAngularTests` reports the current step's pose samples and `ccdAngularHits` reports accepted rotational contacts. Prior rotations and both counters participate in deterministic checkpoint replay; older version-one checkpoints fall back to their current rotation and zero angular counters.

When both dynamic bodies are continuous, the lower stable handle owns the pair test so replay order cannot double-resolve the same crossing. A swept contact uses the ordinary inertia-aware impulse solver, transferring linear and off-center angular momentum to both dynamic bodies. Dynamic partners stop together at the time of impact; their unconsumed translation is discarded for this bounded step, preventing either partner from carrying the other through a third collider. Kinematic targets retain their prescribed translation, which the continuous body follows after impact. Initial overlap is handled at time zero.

`continuous` remains rejected on non-dynamic bodies and triggers, and CCD does not synthesize trigger crossing events. `maxCcdTests` caps potentially contacting pairs admitted to detailed CCD after conservative swept-bounds rejection; distant pairs do not consume that budget. The bounds include both bodies' translation and all intermediate orientations. Enumeration still scans capacity in stable slot order. Exhaustion increments `ccdTestOverflows` once for each body whose remaining search is stopped, while each rotational pair adds at most 128 deterministic narrow-phase samples. This is a single earliest-hit sweep per continuous body, not iterative time-of-impact island solving: a body does not consume and re-integrate the remainder of the step through multiple subsequent impacts. Rotational time of impact is bounded by that sampling density rather than an analytical general-convex solver. `ccdConservativeHits` remains checkpoint-compatible telemetry but stays zero for every currently supported solver pair. Use raycasts or authored swept queries when exact high-speed trigger crossings are gameplay-significant.

Per-step `ccdEligiblePairs` counts visited pairs passing body/layer/trigger filters;
`ccdBoundsRejects` counts those proved disjoint, and `ccdTests` counts admitted
detailed pairs. These replace the former meaning of `ccdTests` as visited eligible
pairs, so do not compare that counter across revisions without its source identity.
Eligible counts include the first denied plausible pair, but omit unvisited pairs
after exhaustion. Hits and overflow counters accumulate within a world lifetime.
Older version-one checkpoints restore absent eligible/reject counters as zero;
physical state and existing counters retain their stored values.

## Caller-owned queries and debug output

The world does not allocate query result lists:

- `queryAabb(..., Float64Array)` writes stable handles and returns the count written. A too-small output increments `queryTruncations`.
- `raycast(..., layerMask, target)` writes the closest sphere/box hit into a required caller object and returns a boolean.
- `sweepSphere(..., radius, layerMask, target)` finds the earliest stable contact for a moving spherical effector. Sphere targets are exact; box targets use a diagnosed expanded-AABB approximation.
- `debugSegmentCount()` reports required line capacity.
- `writeDebugSegments(Float32Array)` writes `x1,y1,z1,x2,y2,z2,tag` records for colliders and contact normals.

Debug tags distinguish static, dynamic, kinematic, trigger, and contact segments. Sphere debug density is explicitly bounded from 4 through 64 segments per great circle.

## Diagnostics and performance gate

The stable diagnostics object reports cumulative steps, current body/constraint/contact/candidate/CCD counts, overflow totals, linear and angular CCD work and hits, conservative box/box hits, and truncated queries. Integrations should alert on any candidate, contact, or CCD-test overflow because it means configured budgets are too small for the authored scene.

`src/physics/rigid-3d.performance.test.ts` is the controlled baseline: 1,000 fixed-capacity bodies, five warm-up steps, then 30 measured 60 Hz steps with a one-second ceiling. It also requires zero broadphase overflow. This is a regression gate for the checked-in workload, not a universal claim that every arrangement of 1,000 mutually overlapping bodies meets a frame budget.

## Explicitly unsupported

This slice does not pretend to solve features outside its model:

- no non-diagonal/custom inertia tensor or general-convex contact manifold;
- no positional revolute/prismatic joints, asymmetric elliptical swing cones, or compound shapes;
- no capsules, convex hulls, triangle meshes, height fields, or deforming colliders;
- no sleeping, contact islands, or block manifold solver;
- no iterative multiple-time-of-impact island solve;
- no general convex contact/sweep beyond exact oriented box/box SAT with a bounded
  clipped face manifold and a single edge/edge point;

Inline joint/constraint declarations and angle/torque scalar shortcuts are rejected
so callers use the explicit quaternion, torque-impulse, and constraint APIs. Face
geometry is regenerated each step; only nearby compatible points retain bounded
normal/friction impulse state. The solver does not preserve named contact features
or solve a manifold as one coupled block. Angular position repair is a bounded
per-point approximation rather than a coupled nonlinear complementarity solve.
Applications that need large production stacks, vehicles, or general convex
dynamics should not treat this slice as a general-purpose solver.
