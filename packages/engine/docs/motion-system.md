# Motion System

The motion system is a TypeScript-first procedural animation runtime for canonical humanoid motion. Its beginner path accepts a zero-clip GLB, auto-maps the skeleton, creates locomotion from four engine-owned gait poses, plants the feet, and applies the result to a Three.js skeleton. Its lower layers remain public so an advanced project can replace mapping, graph nodes, constraints, the motor, or memory ownership independently.

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

The canonical locomotion recipe stores Contact, Down, Passing, and Up as normalized semantic pose data. Distance traveled advances gait phase; stationary cycles use elapsed time. The recipe supports forward, backward, and strafing movement, with terrain targets and motor-resolved root travel layered over the four poses.

## Evaluation contract

Motion graphs use this frozen pass order:

1. inputs
2. reference pose
3. base locomotion
4. state/layer blending
5. full-body actions
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
