# First-party 2D physics

`@hyperfocus/engine/physics/2d` is the engine-owned, DOM-free 2D rigid-body foundation. It uses fixed-capacity struct-of-arrays storage, deterministic sweep-and-prune candidate ordering, reusable contact buffers, and caller-owned query output. Persistent projects store plain body/component data; the physics world does not introduce sidecar or generated files.

Numeric body/joint identities are generation-checked handles. They remain valid
only until removal; all lookup, contact, joint-endpoint and query results use the
same handle representation. `index`/`bodyIndex` names remain for compatibility,
but are not storage offsets. Handles fit nonnegative Int32 output; a slot retires
when its next generation would exceed that range. Removing a body invalidates
the previous contact list. Creation validates before claiming a slot.
The [adversarial audit](editor-engine-adversarial-audit.md) retains open Float32
and query-completeness findings (EEA-03/04).

The current public shape supports:

- static, dynamic, and velocity-driven kinematic bodies with angular state and optional fixed rotation;
- oriented boxes and circles with SAT/closest-point narrowphase and angular contact impulses;
- gravity, mass, restitution, Coulomb friction, collision layers/masks, and triggers;
- bounded center-to-center distance and point-anchor revolute joints with stiffness, damping, optional connected collision, and debug segments;
- bounded impulse and positional contact resolution;
- deterministic per-body sleep/wake thresholds with explicit wake control and diagnostics;
- opt-in continuous box/circle motion against static boxes, including a second sliding pass;
- numeric body handles, explicit snapshots, reusable contact reads, caller-owned AABB query buffers, closest box/circle raycasts, box/circle casts against static oriented boxes, and renderer-neutral caller-owned debug segments;
- explicit body/contact capacities and overflow diagnostics.

`numericStorageBytes` reports the exact typed-array reservation (at default Float64 precision: `137 * capacity + 49 * maxContacts + 75 * maxJoints + 24` bytes), including generation storage, so project tooling can enforce a memory budget before a world starts.

The repository gate advances 2,000 mixed box/circle bodies for 240 measured frames after warm-up and requires p95 simulation below 8 ms while the numeric reservation stays at most 470,024 bytes. Generation checks account for 8,000 bytes of that reservation (four bytes per body); the previous reservation was 462,024 bytes. The timing threshold is intentionally much looser than typical desktop results so it catches structural regressions without pretending that one CI CPU represents every target device. This is a correctness cost, not a measured speed improvement.

Coordinates identify body centers and box sizes are half extents. `step` accepts a positive interval no larger than 0.25 seconds. A game should normally supply a fixed interval. The world allocates its major numeric storage once at construction; `body()` and a contact read without a supplied target create convenience objects, while the update/contact solver and caller-owned query path reuse memory.

Together with the bounded rigid 3D world, portable-runtime collision integrations, deterministic replay fixtures, debug output, and controlled body-count gates, this supports the current physics-heavy **8/10** assessment. It is not a claim of complete solver breadth: general convex shapes, prismatic constraints, sleep islands, broad continuous dynamic-vs-dynamic collision, casts against dynamic shapes, and more representative stacked/contact fixtures remain. The portable runtime's swept AABB character motion remains a focused gameplay path rather than a substitute for those general features.
