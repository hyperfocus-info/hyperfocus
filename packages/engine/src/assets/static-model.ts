/** Deterministic GLB encoding for generated geometry. No renderer, filesystem or host state. */
export function cookStaticModel(options: {
  label: string;
  positions: Float32Array | readonly number[];
  normals: Float32Array | readonly number[];
  uvs?: Float32Array | readonly number[];
  indices?: Uint16Array | Uint32Array | readonly number[];
  generator?: string;
}) {
  const { positions, normals, uvs, indices } = options, count = positions.length / 3;
  if (!Number.isInteger(count) || !count || count > 4_000_000 || normals.length !== positions.length
    || (uvs && uvs.length !== count * 2)
    || (indices ? !indices.length || indices.length % 3 || indices.some(n => !Number.isInteger(n) || n < 0 || n >= count) : count % 3)) {
    throw new Error('Invalid static mesh streams');
  }
  for (const stream of [positions, normals, uvs]) if (stream?.some(n => !Number.isFinite(n))) throw new Error('Non-finite static mesh');
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    minimum[i % 3] = Math.min(minimum[i % 3]!, positions[i]!);
    maximum[i % 3] = Math.max(maximum[i % 3]!, positions[i]!);
  }
  // Validate before conversion: Uint16Array silently wraps oversized indices.
  const indexStream = indices && (indices instanceof Uint32Array || count > 65_536 ? new Uint32Array(indices) : new Uint16Array(indices));
  const streams = [new Float32Array(positions), new Float32Array(normals), ...(uvs ? [new Float32Array(uvs)] : []), ...(indexStream ? [indexStream] : [])];
  let byteLength = 0;
  const bufferViews = streams.map(stream => {
    const view = { buffer: 0, byteOffset: byteLength, byteLength: stream.byteLength };
    byteLength += stream.byteLength;
    return view;
  });
  const document = {
    asset: { version: '2.0', generator: options.generator ?? 'Hyperfocus static streams v1' },
    buffers: [{ byteLength }], bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: minimum, max: maximum },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      ...(uvs ? [{ bufferView: 2, componentType: 5126, count, type: 'VEC2' }] : []),
      ...(indexStream ? [{ bufferView: streams.length - 1, componentType: indexStream instanceof Uint32Array ? 5125 : 5123, count: indexStream.length, type: 'SCALAR' }] : []),
    ],
    meshes: [{ name: options.label, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, ...(uvs ? { TEXCOORD_0: 2 } : {}) }, ...(indexStream ? { indices: streams.length - 1 } : {}), mode: 4 }] }],
  };
  const json = new TextEncoder().encode(JSON.stringify(document)), paddedJson = Math.ceil(json.length / 4) * 4, paddedBinary = Math.ceil(byteLength / 4) * 4;
  const output = new Uint8Array(28 + paddedJson + paddedBinary), header = new DataView(output.buffer);
  for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, output.length], [12, paddedJson], [16, 0x4e4f534a], [20 + paddedJson, paddedBinary], [24 + paddedJson, 0x004e4942]]) header.setUint32(offset!, value!, true);
  output.fill(32, 20, 20 + paddedJson);output.set(json, 20);
  let offset = 28 + paddedJson;
  for (const stream of streams) { output.set(new Uint8Array(stream.buffer, stream.byteOffset, stream.byteLength), offset);offset += stream.byteLength; }
  return output;
}
