# Capsule and static surface queries

Use `capsuleIntersectsSphere3D`, `capsuleIntersectsBox3D`, and
`capsuleIntersectsTriangle3D` for exact three-dimensional overlap checks. Each takes
one options object and the existing `Physics3DCapsuleCollider` shape: segment
endpoints `a`, `b`, and `radius`. Endpoints can coincide to describe a sphere.
Contact at the surface counts as overlap. Boxes use the existing center,
halfSize, and optional rotationY convention.

```ts
const blocked = capsuleIntersectsBox3D({
  capsule: { kind: "capsule", a: [0, 0.5, 0], b: [0, 1.5, 0], radius: 0.5 },
  box: { kind: "box", center: [1, 1, 0], halfSize: [0.5, 1, 2] },
});
```

These checks measure the segment's actual 3D distance to the target. Unlike the
older `collidersOverlap3D` footprint/range helper, a capsule's spherical cap does
not collide merely because both the horizontal footprint and vertical range overlap.

For imported terrain or arena geometry, `createStaticTriangleQueries3D` accepts
flat xyz `positions` and optional triangle `indices`. The factory validates and
copies the input so later source-buffer edits cannot change collision results.
Its `intersectCapsule({ capsule })` returns the first overlapping triangle index
in authored order or `null`. `raycast({ origin, direction, maxDistance? })` returns
the nearest triangle, world-space point, distance, and normal facing the ray.
Both sides of a triangle participate; a parallel/coplanar ray has no unique hit.
Degenerate triangles still contribute their edges/points to capsule overlap, but
have no ray-intersectable surface.

For a grid, `createHeightfieldQueries3D({ columns, rows, heights })` uses unit
spacing by default; configure `cellSize` and `origin` when necessary. Heights are
row-major along X. Each grid cell uses the diagonal from its minimum X/Z corner
to its maximum X/Z corner, so rendering should use the same triangulation.
The returned query API is the same as the triangle factory.

Factories default to a maximum of 100,000 triangles and reject over-budget input
before creating triangles; configure `maxTriangles` explicitly for larger static
assets. Queries scan all triangles, with no hidden approximation or truncation.
Split large worlds into authored regions and query candidate regions. These helpers
do not provide a spatial acceleration structure, continuous collision detection,
penetration resolution, convex-hull collision, or rigid-body dynamics integration.

In an editor project, use capsule queries to validate fighter spawn clearance and
authored hit volumes, and static raycasts to place encounter markers or sample
terrain beneath a character. Keep visible geometry and queried geometry in the
same world coordinate system. These are TypeScript query primitives; the rigid
world's supported body shape list and visual shape authoring are unchanged.
Do not select a triangle/capsule query as though it were a physical rigid collider.

Verification: `bun test packages/engine/src/physics/collision3d/collision.test.ts`
covers cap/corner false positives, segment crossings, yaw boxes, degenerate and
coplanar geometry, ray sidedness/range, input ownership, and sloped heightfields.
