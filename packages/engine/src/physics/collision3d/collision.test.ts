import { expect, test } from "bun:test";
import type { Physics3DCapsuleCollider } from "../3d.ts";
import { capsuleIntersectsBox3D, capsuleIntersectsSphere3D, capsuleIntersectsTriangle3D } from "./capsule.ts";
import { createHeightfieldQueries3D, createStaticTriangleQueries3D } from "./static-mesh.ts";

const capsule: Physics3DCapsuleCollider = { kind: "capsule", a: [0, 0, 0], b: [0, 2, 0], radius: .5 };

test('finite magnitudes that overflow distance arithmetic fail explicitly', () => {
  expect(() => capsuleIntersectsSphere3D({ capsule: { ...capsule, radius: 1e200 }, sphere: { kind: 'sphere', center: [1e250, 0, 0], radius: 1 } })).toThrow('1e30');
  expect(() => capsuleIntersectsTriangle3D({ capsule, a: [1e200, 0, 0], b: [0, 1, 0], c: [0, 0, 1] })).toThrow('1e30');
  expect(() => createStaticTriangleQueries3D({ positions: [0, 0, 0, 1e200, 0, 0, 0, 0, 1] })).toThrow('1e30');
  const mesh = createStaticTriangleQueries3D({ positions: [-1, 0, -1, 1, 0, -1, 0, 0, 1] });
  expect(() => mesh.raycast({ origin: [1e200, 1, 0], direction: [0, -1, 0] })).toThrow('1e30');
});

test("capsule sphere handles spherical caps rather than footprint false positives", () => {
  expect(capsuleIntersectsSphere3D({ capsule, sphere: { kind: "sphere", center: [.9, 2.9, 0], radius: .5 } })).toBe(false);
  expect(capsuleIntersectsSphere3D({ capsule, sphere: { kind: "sphere", center: [1, 1, 0], radius: .5 } })).toBe(true);
  expect(capsuleIntersectsSphere3D({ capsule: { ...capsule, b: capsule.a }, sphere: { kind: "sphere", center: [0, 0, 1], radius: .5 } })).toBe(true);
});

test("capsule box measures diagonal corner separation and supports yaw", () => {
  const box = { kind: "box" as const, center: [0, 0, 0], halfSize: [1, 1, 1] };
  expect(capsuleIntersectsBox3D({ capsule: { ...capsule, a: [1.4, 1.4, 0], b: [1.4, 2, 0] }, box })).toBe(false);
  expect(capsuleIntersectsBox3D({ capsule: { ...capsule, a: [-3, 0, 0], b: [3, 0, 0], radius: 0 }, box })).toBe(true);
  expect(capsuleIntersectsBox3D({ capsule: { ...capsule, a: [0, 0, 1.5], b: [0, 0, 1.5], radius: .1 }, box: { ...box, halfSize: [2, .2, .2], rotationY: Math.PI / 2 } })).toBe(true);
});

test("capsule triangle detects faces, edges, crossings, coplanar and degenerate triangles", () => {
  const triangle = { a: [-2, 0, -2], b: [2, 0, -2], c: [0, 0, 2] };
  expect(capsuleIntersectsTriangle3D({ capsule: { ...capsule, a: [0, 1, 0], b: [0, -1, 0], radius: 0 }, ...triangle })).toBe(true);
  expect(capsuleIntersectsTriangle3D({ capsule: { ...capsule, a: [0, 1, 0], b: [0, 2, 0] }, ...triangle })).toBe(false);
  expect(capsuleIntersectsTriangle3D({ capsule: { ...capsule, a: [-3, 0, 0], b: [3, 0, 0], radius: 0 }, ...triangle })).toBe(true);
  expect(capsuleIntersectsTriangle3D({ capsule, a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] })).toBe(true);
});

test("static triangle queries own input and return nearest two-sided ray hit", () => {
  const positions = [-2, 0, -2, 2, 0, -2, 0, 0, 2];
  const mesh = createStaticTriangleQueries3D({ positions });
  positions.fill(999);
  expect(mesh.intersectCapsule({ capsule })).toEqual({ triangleIndex: 0 });
  expect(mesh.raycast({ origin: [0, 3, 0], direction: [0, -2, 0] })).toMatchObject({ distance: 3, point: [0, 0, 0], normal: [0, 1, 0] });
  expect(mesh.raycast({ origin: [0, -3, 0], direction: [0, 1, 0] })?.distance).toBe(3);
  expect(mesh.raycast({ origin: [0, 3, 0], direction: [0, -1, 0], maxDistance: 2 })).toBeNull();
});

test("heightfield collision agrees with triangulated slope and validates bounds", () => {
  const field = createHeightfieldQueries3D({ columns: 2, rows: 2, heights: [0, 1, 0, 1], cellSize: 2 });
  expect(field.raycast({ origin: [1, 5, 1], direction: [0, -1, 0] })?.point[1]).toBeCloseTo(.5);
  expect(field.intersectCapsule({ capsule: { ...capsule, a: [1, .75, 1], b: [1, 2, 1] } })).not.toBeNull();
  expect(field.raycast({ origin: [4, 5, 1], direction: [0, -1, 0] })).toBeNull();
  expect(() => createStaticTriangleQueries3D({ positions: [0, 0, 0], indices: [0, 1, 2] })).toThrow("index");
  expect(() => createHeightfieldQueries3D({ columns: 2, rows: 2, heights: [0, 1, 2, 3], maxTriangles: 1 })).toThrow("maxTriangles");
  expect(() => capsuleIntersectsBox3D({ capsule: { ...capsule, radius: -1 }, box: { kind: "box", center: [0, 0, 0], halfSize: [1, 1, 1] } })).toThrow("radius");
});
