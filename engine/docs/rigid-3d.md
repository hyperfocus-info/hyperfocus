# Bounded rigid 3D world

`src/physics/rigid-3d.ts` is a first-party, DOM-free rigid-body world for spheres and boxes. It includes quaternion/angular integration and bounded distance constraints while retaining a conservative AABB collision model for rotated boxes. It is intentionally a focused physics core rather than a thin wrapper over a hosted or third-party solver. The world owns fixed-capacity typed arrays and deterministic scratch buffers; games retain control of stepping, rendering, authored collision layers, and data persistence.

This module is separate from the existing general 3D geometry/character helpers and does not alter that API. It is published at `@hyperfocus/engine/physics/rigid-3d`, included in declaration/runtime parity and packed-consumer checks, and exercised by the portable `3d-action` starter.

## Create and step a world

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
world.addDistanceConstraint({ id: "tether", a: floor, b: ball, distance: 4, stiffness: 0.8 });
world.step(1 / 60);
```

Use a fixed timestep and replay the same body mutations in the same order for deterministic results. Sweep-and-prune sorting uses minimum X followed by the stable numeric handle, contact iteration is stable, and equal-time CCD hits choose the lowest handle. The tests replay a mixed operation stream for 120 steps and compare the complete resulting state exactly.

Determinism here means the same JavaScript numeric environment, inputs, options, and operation order. The module does not implement fixed-point arithmetic or promise bit-identical state across unrelated CPU/JavaScript implementations.

## Bodies and stable handles

Bodies are `static`, `dynamic`, or `kinematic`:

- Static bodies have infinite mass, reject non-zero linear/angular velocity and any mass declaration, and never move during a step.
- Dynamic bodies integrate gravity and angular velocity, accept linear and torque impulses, and receive velocity/position collision response.
- Kinematic bodies integrate their authored velocity and act as infinite-mass moving colliders. Impulses are rejected.

`addBody` returns a safe-integer generation handle. Removing and reusing a storage slot changes its generation, so an old handle cannot mutate the replacement body. IDs are unique convenience lookups; queries and contacts expose stable handles. A slot is retired instead of wrapping its generation after more than four billion reuses.

Body creation validates its complete definition before consuming capacity. Capacity, contact storage, broadphase candidates, CCD tests, solver iterations, step duration, identifiers, numeric inputs, layers, and masks are bounded. World-space scalars are limited to a magnitude of `1e12`, and positive extents/masses/distances must be at least `1e-12`, preventing overflow-prone near-zero mass or unbounded coordinates from entering the solver. `numericStorageBytes` is the exact sum of all permanently reserved numeric typed-array storage, including sort and contact scratch arrays. String IDs and the ID map are intentionally not counted as numeric storage.

## Rotation and constraints

Bodies accept a normalized `rotation: [x, y, z, w]`, `angularVelocity: [x, y, z]`, and bounded `angularDamping`. `setRotation`, `setAngularVelocity`, and `applyTorqueImpulse` mutate live dynamic state through stable handles. Quaternion integration is performed in the same deterministic body order as translation and renormalizes every step. Torque impulse currently changes angular velocity directly; the solver does not yet model an inertia tensor or angular contact impulse.

`addDistanceConstraint` joins two live bodies at a target center-to-center distance. The target defaults to their creation-time separation; stiffness is `0..1`. Constraints have their own fixed `maxConstraints` capacity, stable handles, lookup/removal/query methods, and `constraintIterations` from 1 through 32. Removing either body removes connected constraints. The positional solver is deterministic and bounded, but it is not a general joint system: it has no anchors, angular limits, motors, accumulated impulses, break forces, or warm starting.

## Collision model

The narrowphase supports:

- sphere against sphere;
- sphere against a box's conservative rotated world AABB, including a sphere center inside it;
- box against box through conservative rotated world AABBs.

Dynamic response uses inverse mass, the greater pair restitution, and a Coulomb friction impulse using the geometric mean of pair friction. Position correction uses a small slop and bounded iterations. Kinematic and static bodies contribute zero inverse mass. Triggers generate contacts but receive no impulse or position correction.

Collision requires both `(a.layer & b.mask)` and `(b.layer & a.mask)` to be non-zero. Broadphase uses deterministic typed-array merge-sort sweep-and-prune on X, followed by Y/Z AABB rejection. Once `maxCandidatePairs` is reached, the step stops admitting candidate work and increments `candidateOverflows`. Contacts beyond `maxContacts` are diagnosed and omitted rather than allocating.

Contacts are available after each step with `contactCount()` and `contact(index, callerTarget)`. They include handles, IDs, A-to-B normal, initial penetration, representative contact point, and trigger status. The target is required so repeated inspection can remain allocation-free.

## Continuous collision detection

Set `continuous: true` on a dynamic non-trigger body to opt into dynamic-versus-static translational CCD. Sphere/sphere sweeps are exact for this model. Box sweeps use the current rotated world AABB, while mixed sphere/box sweeps use a conservative expanded-AABB test: they prevent tunneling but can stop early near rotated faces or box corners. Such mixed accepted hits increment `ccdConservativeHits` so a game can measure reliance on the approximation.

CCD does not sweep against dynamic or kinematic bodies and does not synthesize trigger crossing events. `continuous` is rejected on non-dynamic bodies and triggers. Initial static overlap is handled at time zero. Work is capped by `maxCcdTests`; exhaustion increments `ccdTestOverflows` and keeps the remaining step bounded.

Use raycasts or authored swept queries when exact high-speed trigger crossings are gameplay-significant. Use smaller fixed timesteps or game-specific projectile tests when dynamic-versus-dynamic tunneling matters.

## Caller-owned queries and debug output

The world does not allocate query result lists:

- `queryAabb(..., Float64Array)` writes stable handles and returns the count written. A too-small output increments `queryTruncations`.
- `raycast(..., layerMask, target)` writes the closest sphere/box hit into a required caller object and returns a boolean.
- `debugSegmentCount()` reports required line capacity.
- `writeDebugSegments(Float32Array)` writes `x1,y1,z1,x2,y2,z2,tag` records for colliders and contact normals.

Debug tags distinguish static, dynamic, kinematic, trigger, and contact segments. Sphere debug density is explicitly bounded from 4 through 64 segments per great circle.

## Diagnostics and performance gate

The stable diagnostics object reports cumulative steps, current body/constraint/contact/candidate/CCD counts, overflow totals, CCD hits and conservative hits, and truncated queries. Integrations should alert on any candidate, contact, or CCD-test overflow because it means configured budgets are too small for the authored scene.

`src/physics/rigid-3d.performance.test.ts` is the controlled baseline: 1,000 fixed-capacity bodies, five warm-up steps, then 30 measured 60 Hz steps with a one-second ceiling. It also requires zero broadphase overflow. This is a regression gate for the checked-in workload, not a universal claim that every arrangement of 1,000 mutually overlapping bodies meets a frame budget.

## Explicitly unsupported

This slice does not pretend to solve features outside its model:

- no inertia tensor, angular contact/friction impulses, or exact oriented-box SAT/manifold collision;
- no anchored/revolute/prismatic constraints, limits, motors, ragdolls, or compound shapes;
- no capsules, convex hulls, triangle meshes, height fields, or deforming colliders;
- no sleeping, islands, warm-start cache, or persistent contact manifold;
- no dynamic-versus-dynamic or dynamic-versus-kinematic CCD;
- no exact rounded-corner mixed sphere/box sweep.

Inline joint/constraint declarations and angle/torque scalar shortcuts are rejected so callers use the explicit quaternion, torque-impulse, and constraint APIs. Rotated boxes deliberately expose conservative AABB contact behavior; applications that need exact stacking or vehicle/character joints should not treat this slice as a general-purpose production solver.
