# Seeded 3D particles

`createParticleSystem3D` and `validateParticleRecipe3D` are exported from
`@hyperfocus/engine/effects`. The simulation is framework/renderer neutral and
uses fixed-capacity storage, a seeded RNG and a fixed 120 Hz clock. Rendering does
not advance time or consume randomness. Dropped births, expiry, collisions and
high-water usage are explicit diagnostics.

Recipes declare capacity/seed, world or local space, lifetime/speed/size ranges,
point/sphere/box/ring emission, direction/cone, gravity, drag, bounded smooth
turbulence, size and RGBA lifetime curves, rotation/spin, optional regular atlas
animation and optional swept bounce/kill collision. Unknown fields and invalid
ranges reject. Collision requires a caller-owned swept provider; an optional
resolved center handles initial overlap. World-space gravity is not automatically
rotated into local emitter space; choose the recipe's simulation space deliberately.

`emit`, `setRate`, `setTransform`, `step`, `forEach`, `snapshot`, `restore`, `reset`
and `diagnostics` form the simulation interface. `forEach` reuses a sample object:
copy it if retaining samples. Snapshot restore preserves free-slot ordering and
future RNG results. `numericStorageBytes` counts typed-array storage only, not
the JS free list, snapshots, render buffers or total process memory. Capacity is
bounded to 65,536 per standalone emitter; gameplay has a smaller aggregate budget.

## First-party rendering

`createParticleSceneBinding3D` from `@hyperfocus/engine/render/3d-scene` binds an
emitter to preallocated scene instances with camera-facing, velocity-stretched
or mesh orientation. Disposal releases owned instances. Density thinning is
presentation-only and preserves the replay. The portable gameplay presenter
supplies the same particle appearance through ordinary evaluated frames.

Instanced RGBA and atlas rectangles reach the native WebGL2 shader. Materials
support opaque, mask, blend and additive alpha modes; authored additive mode
survives frame application. Transparent instances are sorted back-to-front across
materials by instance-center camera depth, retaining adjacent compatible batches.
This fixes ordinary overlapping particle-card ordering; it cannot exactly order
intersecting translucent geometry.

The directed generator cooks bounded soft-disc, paper-star, brush-dab and smoke
masks or accepts authored image maps. Shape, color, emission, material and motion
are independent data. Shooter sparks, voxel fragments, toy confetti, paper stars
and painted dabs exercise distinct treatments without global style presets.

## Evidence and limits

Unit coverage checks fixed-clock partitioning, capacity overflow, atomic restore,
recipe key reordering, world/local transforms, swept collision, lifetime/atlas
sampling, native instance appearance, global transparency ordering, facing poles,
pool reuse/disposal and pure density changes. Native gameplay clips demonstrate
three child treatments plus shooter and voxel events. This is implementation and
bounded rendering evidence, not a world-class visual or performance designation.

Simulation is CPU-based. GPU simulation, soft depth intersections, volumetric
smoke, ribbon trails, fluid behavior and production-scale GPU profiling are not
implemented here. Use the exact feature and budget requirements of a real game
to choose the next extension. Do not advertise universal style or scale support
from a handful of fixture effects.
