import { expect, test } from 'bun:test';
import { cookStaticModel } from './static-model.ts';
import { parseGltfContainer, resolveAndCookGltfStaticMeshes } from './gltf-static.ts';

async function decode(bytes: Uint8Array) {
  const container = parseGltfContainer(bytes);
  const cooked = await resolveAndCookGltfStaticMeshes(container.document, { embeddedBuffers: container.embeddedBuffers });
  expect(cooked.ok).toBe(true);
  return cooked.meshes[0]!;
}

test('generated GLB retains geometry, surface streams and triangle indices across decoding', async () => {
  const streams = { label: 'Triangle', positions: [0, 0, 0, 2, 0, 0, 0, 3, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] };
  const bytes = cookStaticModel(streams), mesh = await decode(bytes);
  expect([...mesh.positions]).toEqual(streams.positions);
  expect([...mesh.normals!]).toEqual(streams.normals);
  expect([...mesh.uvs!]).toEqual(streams.uvs);
  expect([...mesh.indices]).toEqual(streams.indices);
  expect(cookStaticModel(streams)).toEqual(bytes);
  streams.positions.fill(10);
  expect((await decode(bytes)).positions[0]).toBe(0);
});

test.each([65_536, 65_537])('indices remain lossless at the 16-bit boundary with %s vertices', async count => {
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  positions[(count - 1) * 3] = 7;normals[(count - 1) * 3 + 1] = 1;
  const mesh = await decode(cookStaticModel({ label: 'Boundary', positions, normals, indices: [0, 1, count - 1] }));
  expect([...mesh.indices]).toEqual([0, 1, count - 1]);
  expect(mesh.positions[(count - 1) * 3]).toBe(7);
});

test('invalid indices fail before typed-array conversion can truncate or wrap them', () => {
  const streams = { label: 'Invalid', positions: new Float32Array(9), normals: new Float32Array(9) };
  for (const index of [-1, 0.5, NaN, 65_536]) expect(() => cookStaticModel({ ...streams, indices: [0, 1, index] })).toThrow('Invalid static mesh');
  expect(() => cookStaticModel({ ...streams, positions: [NaN, 0, 0, 1, 0, 0, 0, 1, 0] })).toThrow('Non-finite');
});
