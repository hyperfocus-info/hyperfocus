import type { MeshGeometry3D } from '../3d-scene.ts';

type CutawayMesh = MeshGeometry3D & { edgeCoordinates: Float32Array };
const cache = new WeakMap<MeshGeometry3D, CutawayMesh>();

/** Caller owns the returned buffer. Failed attribute setup leaves no allocation. */
export function uploadCutawayEdges3D(gl: WebGL2RenderingContext, mesh: MeshGeometry3D & { edgeCoordinates?: Float32Array }): WebGLBuffer | undefined {
  const edges = mesh.edgeCoordinates;if (!edges) return;
  const buffer = gl.createBuffer();if (!buffer) throw Error('WebGL2 failed to allocate cutaway edges.');
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(15);gl.vertexAttribPointer(15, 3, gl.FLOAT, false, 12, 0);return buffer;
  } catch (error) { gl.deleteBuffer(buffer);throw error; }
}

/** Immutable upload-time expansion. Coplanar triangle seams are not object edges. */
export function cutawayMesh3D(mesh: MeshGeometry3D): CutawayMesh {
  const previous = cache.get(mesh);if (previous) return previous;
  const count = mesh.indices?.length ?? mesh.positions.length / 3;
  const vertex = (index: number) => mesh.indices?.[index] ?? index;
  const positionKey = (index: number) => `${mesh.positions[index * 3]},${mesh.positions[index * 3 + 1]},${mesh.positions[index * 3 + 2]}`;
  const edges = new Map<string, Array<{ triangle: number; side: number; normal: number[] }>>();
  const masks = new Uint8Array(count).fill(1);
  for (let triangle = 0; triangle < count; triangle += 3) {
    const ids = [vertex(triangle), vertex(triangle + 1), vertex(triangle + 2)];
    const points = ids.map(id => mesh.positions.subarray(id * 3, id * 3 + 3));
    const a = points[1]!.map((v, i) => v - points[0]![i]!), b = points[2]!.map((v, i) => v - points[0]![i]!);
    const normal = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const length = Math.hypot(...normal);for (let i = 0; i < 3; i++) normal[i] = normal[i]! / (length || 1);
    for (let side = 0; side < 3; side++) {
      const key = [positionKey(ids[(side + 1) % 3]!), positionKey(ids[(side + 2) % 3]!)].sort().join('|');
      const entries = edges.get(key) ?? [];entries.push({ triangle, side, normal });edges.set(key, entries);
    }
  }
  for (const entries of edges.values()) {
    if (entries.length !== 2) continue;
    const [a, b] = entries;
    if (a!.normal.reduce((sum, v, i) => sum + v * b!.normal[i]!, 0) > .9999) {
      masks[a!.triangle + a!.side] = 0;masks[b!.triangle + b!.side] = 0;
    }
  }
  const expand = <T extends Float32Array | Uint16Array | Uint8Array>(source: T, stride: number): T => {
    // TypedArray.constructor is typed as Function. Preserve the source's actual
    // constructor (including subclass/overridden construction and subarray
    // species behavior). Its result is not independently validated as T: this
    // exact platform-typing bridge remains debt pending compatibility review.
    const output = Reflect.construct(source.constructor, [count * stride]);
    for (let i = 0; i < count; i++) output.set(source.subarray(vertex(i) * stride, (vertex(i) + 1) * stride), i * stride);
    return output;
  };
  const edgeCoordinates = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) for (let side = 0; side < 3; side++) {
    edgeCoordinates[i * 3 + side] = masks[i - i % 3 + side] ? Number(i % 3 === side) : 1;
  }
  const output: CutawayMesh = { ...mesh, indices: undefined, positions: expand(mesh.positions, 3),
    normals: mesh.normals && expand(mesh.normals, 3), uvs: mesh.uvs && expand(mesh.uvs, 2),
    joints: mesh.joints && expand(mesh.joints, 4), weights: mesh.weights && expand(mesh.weights, 4),
    morphPositions: mesh.morphPositions?.map(values => expand(values, 3)), edgeCoordinates };
  cache.set(mesh, output);return output;
}
