import { expect, test } from 'bun:test';
import { cutawayMesh3D } from './cutaway-mesh.ts';

test('cutaway edges omit coplanar diagonals and retain boundaries across split UV vertices', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0]);
  const mesh = { positions, uvs: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]) };
  const output = cutawayMesh3D(mesh);
  expect(output.edgeCoordinates.slice(0, 9)).toEqual(new Float32Array([1, 0, 0, 1, 1, 0, 1, 0, 1]));
  expect(output.edgeCoordinates.slice(9)).toEqual(new Float32Array([1, 0, 1, 0, 1, 1, 0, 0, 1]));
  expect(output.positions).toEqual(positions);expect(output.positions).not.toBe(positions);
  expect(cutawayMesh3D(mesh)).toBe(output);expect(cutawayMesh3D({ ...mesh })).not.toBe(output);
});

test('indexed cutaway expansion retains articulated vertex and morph streams without mutating the source', () => {
  const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint16Array([2, 1, 0]),
    joints: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]), weights: new Float32Array(12).fill(.25),
    morphPositions: [new Float32Array([0, 0, 1, 0, 0, 2, 0, 0, 3])] };
  const original = structuredClone(mesh), output = cutawayMesh3D(mesh);
  expect(output.indices).toBeUndefined();expect(output.positions.slice(0, 3)).toEqual(new Float32Array([0, 1, 0]));
  expect(output.joints!.slice(0, 4)).toEqual(new Uint8Array([2, 0, 0, 0]));
  expect(output.morphPositions![0]!.slice(0, 3)).toEqual(new Float32Array([0, 0, 3]));expect(mesh).toEqual(original);
});
