import { expect, test } from "bun:test";
import {
  aabbIntersectsFrustum3D,
  collectVisibleInstanceSpheres3D,
  composeMat4FromTrs,
  createFrustumPlanes3D,
  createInstanceVisibilityBuffer3D,
  createMat4,
  createTransformHierarchy3D,
  extractFrustumPlanes3D,
  lookAtViewMat4,
  multiplyMat4,
  orthographicMat4,
  perspectiveMat4,
  sphereIntersectsFrustum3D
} from "./3d-core.ts";

function transformPoint(matrix: ArrayLike<number>, x: number, y: number, z: number): [number, number, number, number] {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  ];
}

function cameraFrustum(): Float32Array {
  const view = createMat4();
  const projection = createMat4();
  const viewProjection = createMat4();
  lookAtViewMat4(view, [0, 0, 0], [0, 0, -1]);
  perspectiveMat4(projection, { fovYRadians: Math.PI / 2, aspect: 1, near: 1, far: 10 });
  multiplyMat4(viewProjection, projection, view);
  return extractFrustumPlanes3D(createFrustumPlanes3D(), viewProjection);
}

test("TRS composition and multiplication use column-major right-handed matrices", () => {
  const rotation = Math.sin(Math.PI / 4);
  const matrix = createMat4();
  composeMat4FromTrs(matrix, [2, 3, 4], [0, 0, rotation, rotation], [2, 1, 1]);
  const transformed = transformPoint(matrix, 1, 0, 0);
  expect(transformed[0]).toBeCloseTo(2);
  expect(transformed[1]).toBeCloseTo(5);
  expect(transformed[2]).toBeCloseTo(4);
  expect(transformed[3]).toBe(1);

  const translation = createMat4();
  composeMat4FromTrs(translation, [5, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  multiplyMat4(translation, translation, matrix);
  expect(transformPoint(translation, 0, 0, 0).slice(0, 3)).toEqual([7, 3, 4]);
});

test("camera matrices map the eye to the origin and expose explicit projection behavior", () => {
  const view = createMat4();
  lookAtViewMat4(view, [3, 2, 5], [3, 2, 4]);
  expect(transformPoint(view, 3, 2, 5)).toEqual([0, 0, 0, 1]);

  const perspective = createMat4();
  perspectiveMat4(perspective, { fovYRadians: Math.PI / 2, aspect: 2, near: 1, far: 11 });
  expect(perspective[0]).toBeCloseTo(0.5);
  expect(perspective[5]).toBeCloseTo(1);
  expect(perspective[11]).toBe(-1);

  const orthographic = createMat4();
  orthographicMat4(orthographic, { left: -2, right: 2, bottom: -1, top: 1, near: 1, far: 11 });
  const nearCorner = transformPoint(orthographic, -2, -1, -1);
  expect(nearCorner[0]).toBeCloseTo(-1);
  expect(nearCorner[1]).toBeCloseTo(-1);
  expect(nearCorner[2]).toBeCloseTo(-1);
});

test("camera math rejects ambiguous and invalid inputs with diagnostics", () => {
  expect(() => lookAtViewMat4(createMat4(), [0, 0, 0], [0, 0, 0])).toThrow("different points");
  expect(() => lookAtViewMat4(createMat4(), [0, 1, 0], [0, 0, 0], [0, 1, 0])).toThrow("parallel");
  expect(() => perspectiveMat4(createMat4(), { fovYRadians: 0, aspect: 1, near: 1, far: 10 })).toThrow("between 0 and PI");
  expect(() => perspectiveMat4(createMat4(), { fovYRadians: 1, aspect: 1, near: 10, far: 1 })).toThrow("0 < near < far");
});

test("frustum planes classify spheres and AABBs at deterministic boundaries", () => {
  const frustum = cameraFrustum();
  expect(sphereIntersectsFrustum3D(frustum, 0, 0, -5, 0.25)).toBe(true);
  expect(sphereIntersectsFrustum3D(frustum, 0, 0, 1, 0.25)).toBe(false);
  expect(sphereIntersectsFrustum3D(frustum, 0, 0, -11, 0.25)).toBe(false);
  expect(sphereIntersectsFrustum3D(frustum, 5.1, 0, -5, 0.2)).toBe(true);
  expect(sphereIntersectsFrustum3D(frustum, 6, 0, -5, 0.2)).toBe(false);
  expect(aabbIntersectsFrustum3D(frustum, [-0.5, -0.5, -5.5], [0.5, 0.5, -4.5])).toBe(true);
  expect(aabbIntersectsFrustum3D(frustum, [20, 20, -5], [21, 21, -4])).toBe(false);
  expect(() => aabbIntersectsFrustum3D(frustum, [1, 0, 0], [0, 1, 1])).toThrow("minimum");
});

test("bounded visibility preserves input order and reports overflow", () => {
  const frustum = cameraFrustum();
  const output = createInstanceVisibilityBuffer3D(2);
  const returned = collectVisibleInstanceSpheres3D(frustum, {
    centers: new Float32Array([
      0, 0, -3,
      20, 0, -3,
      1, 0, -4,
      -1, 0, -4,
      0, 0, -6
    ]),
    radii: new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1]),
    enabled: new Uint8Array([1, 1, 0, 1, 1])
  }, output);
  expect(returned).toBe(output);
  expect(Array.from(output.indices)).toEqual([0, 3]);
  expect(output.count).toBe(2);
  expect(output.tested).toBe(4);
  expect(output.visible).toBe(3);
  expect(output.truncated).toBe(1);

  collectVisibleInstanceSpheres3D(frustum, { centers: [0, 0, -2], radii: [0.1] }, output);
  expect(output.count).toBe(1);
  expect(output.indices[0]).toBe(0);
  expect(output.truncated).toBe(0);
});

test("transform hierarchy propagates parent changes without recursive calls", () => {
  const hierarchy = createTransformHierarchy3D(4);
  const root = hierarchy.create();
  const child = hierarchy.create(root);
  const grandchild = hierarchy.create(child);
  hierarchy.setPosition(root, 2, 0, 0);
  hierarchy.setPosition(child, 1, 0, 0);
  hierarchy.setPosition(grandchild, 1, 0, 0);
  expect(hierarchy.updateWorldMatrices()).toBe(3);
  expect(hierarchy.worldMatrices[grandchild * 16 + 12]).toBe(4);
  expect(hierarchy.updateWorldMatrices()).toBe(0);

  hierarchy.setPosition(root, 5, 0, 0);
  expect(hierarchy.updateWorldMatrices()).toBe(3);
  expect(hierarchy.worldMatrices[grandchild * 16 + 12]).toBe(7);

  hierarchy.setParent(grandchild, root);
  expect(hierarchy.updateWorldMatrices()).toBe(1);
  expect(hierarchy.worldMatrices[grandchild * 16 + 12]).toBe(6);
  expect(() => hierarchy.setParent(root, grandchild)).toThrow("cycle");
});

test("transform hierarchy is fixed-capacity, reuses leaf slots, and has bounded storage", () => {
  const capacity = 1_024;
  const hierarchy = createTransformHierarchy3D(capacity);
  let parent = -1;
  for (let index = 0; index < capacity; index += 1) {
    const transform = hierarchy.create(parent);
    hierarchy.setPosition(transform, 1, 0, 0);
    parent = transform;
  }
  expect(() => hierarchy.create()).toThrow("exhausted");
  expect(hierarchy.updateWorldMatrices()).toBe(capacity);
  expect(hierarchy.worldMatrices[parent * 16 + 12]).toBe(capacity);
  expect(hierarchy.positions.byteLength).toBe(capacity * 3 * Float32Array.BYTES_PER_ELEMENT);
  expect(hierarchy.worldMatrices.byteLength).toBe(capacity * 16 * Float32Array.BYTES_PER_ELEMENT);

  hierarchy.destroy(parent);
  const reused = hierarchy.create();
  expect(reused).toBe(parent);
  expect(hierarchy.count).toBe(capacity);
});

test('reapplying the same float32 pose does not dirty a subtree and real changes still propagate', () => {
  const hierarchy = createTransformHierarchy3D(2), parent = hierarchy.create(), child = hierarchy.create(parent);
  hierarchy.setPosition(parent, .1, .2, .3);hierarchy.setScale(parent, 1.1, 1.2, 1.3);hierarchy.setRotationQuaternion(parent, .1, .2, .3, .9);hierarchy.updateWorldMatrices();
  const bytes = new Uint8Array(hierarchy.worldMatrices.buffer).slice();
  hierarchy.setPosition(parent, .1, .2, .3);hierarchy.setScale(parent, 1.1, 1.2, 1.3);hierarchy.setRotationQuaternion(parent, .1, .2, .3, .9);
  expect(hierarchy.updateWorldMatrices()).toBe(0);expect(new Uint8Array(hierarchy.worldMatrices.buffer)).toEqual(bytes);
  hierarchy.setPosition(parent, .2, .2, .3);expect(hierarchy.updateWorldMatrices()).toBe(2);expect(hierarchy.worldMatrices[child * 16 + 12]).toBeCloseTo(.2);
  expect(() => hierarchy.setPosition(parent, Infinity, 0, 0)).toThrow();expect(() => hierarchy.setRotationQuaternion(parent, 0, 0, 0, 0)).toThrow();
});

test("fixed inputs produce byte-identical matrices and visibility indexes", () => {
  const first = cameraFrustum();
  const second = cameraFrustum();
  expect(new Uint8Array(first.buffer)).toEqual(new Uint8Array(second.buffer));
  const bounds = { centers: new Float32Array([0, 0, -2, 100, 0, -2, 0, 0, -4]), radii: new Float32Array([1, 1, 1]) };
  const a = createInstanceVisibilityBuffer3D(3), b = createInstanceVisibilityBuffer3D(3);
  collectVisibleInstanceSpheres3D(first, bounds, a);
  collectVisibleInstanceSpheres3D(second, bounds, b);
  expect(a).toEqual(b);
});
