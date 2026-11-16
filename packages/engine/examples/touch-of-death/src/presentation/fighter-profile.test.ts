import { expect, test } from 'bun:test';
import { parseGltfContainer, resolveAndCookGltfStaticMeshes } from '@hyperfocus/engine/assets/gltf-static';
import { cookFighterProfile } from './fighter-profile.ts';

test('posed profiles are closed surfaces with finite normals and no boundary edges', async () => {
  const container = parseGltfContainer(cookFighterProfile('Exposed sleeve ends', [[-.2, .06, .05, 0], [0, .09, .08, 0], [.2, .07, .06, .01]]));
  const result = await resolveAndCookGltfStaticMeshes(container.document, { embeddedBuffers: container.embeddedBuffers });
  expect(result.ok).toBe(true);
  const mesh = result.meshes[0]!, edges = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = Array.from(mesh.indices.slice(i, i + 3));
    for (let j = 0; j < 3; j++) {
      const a = triangle[j]!, b = triangle[(j + 1) % 3]!;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every(count => count === 2)).toBe(true);
  expect([...mesh.positions, ...mesh.normals!].every(Number.isFinite)).toBe(true);
});
