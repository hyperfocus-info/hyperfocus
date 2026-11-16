import { expect, test } from 'bun:test';
import { createVoxelVolume3D } from './voxel-volume.ts';

test('edits, collision and snapshot restore share the same occupancy', () => {
  const volume = createVoxelVolume3D({ size: [8, 4, 8], cellSize: .5 });
  expect(volume.edit({ min: [0, 0, 0], max: [8, 1, 8], solid: true })).toBe(64);
  const saved = volume.snapshot(), query = { min: [1, 0, 1], max: [1.4, .4, 1.4] } as const;
  expect(volume.intersects(query)).toBe(true);
  volume.edit({ min: [2, 0, 2], max: [3, 1, 3], solid: false });expect(volume.intersects(query)).toBe(false);
  volume.restore(JSON.parse(JSON.stringify(saved)));expect(volume.intersects(query)).toBe(true);expect(volume.snapshot()).toEqual(saved);
  expect(() => volume.restore({ ...saved, runs: [[0, 99999]] })).toThrow('Invalid');expect(volume.snapshot()).toEqual(saved);
});
test('meshing removes internal and chunk-boundary faces with outward winding', () => {
  const volume = createVoxelVolume3D({ size: [2, 1, 1] });volume.edit({ min: [0, 0, 0], max: [2, 1, 1], solid: true });
  const mesh = volume.mesh({ min: [0, 0, 0], max: [2, 1, 1] });expect(mesh.faces).toBe(10);
  expect(volume.mesh({ min: [0, 0, 0], max: [1, 1, 1] }).faces).toBe(5);
  expect(volume.mesh({ min: [1, 0, 0], max: [2, 1, 1] }).faces).toBe(5);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3, b = mesh.indices[i + 1]! * 3, c = mesh.indices[i + 2]! * 3, p = mesh.positions;
    const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!], v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    expect(cross.reduce((n, value, j) => n + value * mesh.normals[a + j]!, 0)).toBeGreaterThan(0);
  }
});
test('dense volume emits its surface only and rejects unbounded/invalid work', () => {
  const volume = createVoxelVolume3D({ size: [32, 32, 32] });volume.edit({ min: [0, 0, 0], max: [32, 32, 32], solid: true });
  expect(volume.mesh({ min: [0, 0, 0], max: [32, 32, 32] }).faces).toBe(6144);
  expect(() => volume.mesh({ min: [0, 0, 0], max: [32, 32, 32], maxFaces: 10 })).toThrow('budget');
  expect(() => volume.edit({ min: [-1, 0, 0], max: [2, 2, 2], solid: false })).toThrow();
  expect(() => createVoxelVolume3D({ size: [128, 128, 128] })).toThrow();
  expect(() => volume.intersects({ min: [NaN, 0, 0], max: [2, 2, 2] })).toThrow();
});
