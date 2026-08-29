# First-party 2D physics

`@hyperfocus/engine/physics/2d` is the engine-owned, DOM-free 2D rigid-body foundation. It uses fixed-capacity struct-of-arrays storage, deterministic sweep-and-prune candidate ordering, reusable contact buffers, and caller-owned query output. Persistent projects store plain body/component data; the physics world does not introduce sidecar or generated files.

The current public shape supports:

- static, dynamic, and velocity-driven kinematic bodies with angular state and optional fixed rotation;
- oriented boxes and circles with SAT/closest-point narrowphase and angular contact impulses;
- gravity, mass, restitution, Coulomb friction, collision layers/masks, and triggers;
- bounded center-to-center distance and point-anchor revolute joints with stiffness, damping, optional connected collision, and debug segments;
- bounded impulse and positional contact resolution;
- deterministic per-body sleep/wake thresholds with explicit wake control and diagnostics;
- opt-in continuous box/circle motion against static boxes, including a second sliding pass;
- stable numeric body handles, explicit snapshots, reusable contact reads, caller-owned AABB query buffers, closest box/circle raycasts, box/circle casts against static oriented boxes, and renderer-neutral caller-owned debug segments;
- explicit body/contact capacities and overflow diagnostics.

`numericStorageBytes` reports the exact typed-array reservation (`133 * capacity + 49 * maxContacts + 71 * maxJoints + 24` bytes) so project tooling can enforce a memory budget before a world starts.

The repository gate advances 2,000 mixed box/circle bodies for 240 measured frames after warm-up and requires p95 simulation below 8 ms while the numeric reservation stays below 470 KB. The threshold is intentionally much looser than typical desktop results so it catches structural regressions without pretending that one CI CPU represents every target device.

Coordinates identify body centers and box sizes are half extents. `step` accepts a positive interval no larger than 0.25 seconds. A game should normally supply a fixed interval. The world allocates its major numeric storage once at construction; `body()` and a contact read without a supplied target create convenience objects, while the update/contact solver and caller-owned query path reuse memory.

Together with the bounded rigid 3D world, portable-runtime collision integrations, deterministic replay fixtures, debug output, and controlled body-count gates, this supports the current physics-heavy **8/10** assessment. It is not a claim of complete solver breadth: general convex shapes, prismatic constraints, sleep islands, broad continuous dynamic-vs-dynamic collision, casts against dynamic shapes, and more representative stacked/contact fixtures remain. The portable runtime's swept AABB character motion remains a focused gameplay path rather than a substitute for those general features.
