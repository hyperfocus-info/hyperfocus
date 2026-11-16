import { expect, test } from 'bun:test';
import { parseGltfContainer, resolveAndCookGltfStaticMeshes } from '@hyperfocus/engine/assets/gltf-static';
import { cookCityVehicleModels } from './models.ts';

test('faceted vehicle shells have outward faces and stay inside the existing collider envelope', async () => {
  for (const bytes of Object.values(cookCityVehicleModels())) {
    const parsed = parseGltfContainer(bytes);
    const result = await resolveAndCookGltfStaticMeshes(parsed.document, { embeddedBuffers: parsed.embeddedBuffers });
    expect(result.ok).toBe(true);expect(result.meshes).toHaveLength(1);
    const mesh = result.meshes[0]!;
    if (!mesh.normals) throw new Error('Vehicle mesh is missing surface normals.');
    expect(mesh.positions.length / 3).toBeLessThan(200);
    expect(Math.max(...mesh.positions.map(Math.abs))).toBeLessThanOrEqual(1);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const dot = mesh.positions[i]! * mesh.normals[i]! + mesh.positions[i + 1]! * mesh.normals[i + 1]! + mesh.positions[i + 2]! * mesh.normals[i + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  }
});
