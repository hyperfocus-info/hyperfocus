type Vec3 = readonly [number, number, number];

/** Bounded editable occupancy. Hosts own materials, streaming and durable I/O. */
export function createVoxelVolume3D(options: { size: Vec3; cellSize?: number }) {
  const size = [...options.size], cellSize = options.cellSize ?? 1;
  if (size.length !== 3 || size.some(n => !Number.isSafeInteger(n) || n < 1 || n > 128) || size[0]! * size[1]! * size[2]! > 262144) throw new Error('Voxel volume requires 1–128 cells per axis and at most 262144 cells');
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Voxel cell size must be positive and finite');
  const cells = new Uint8Array(size[0]! * size[1]! * size[2]!);
  const index = (x: number, y: number, z: number) => x + size[0]! * (y + size[1]! * z);
  function occupied(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < size[0]! && y < size[1]! && z < size[2]! && cells[index(x, y, z)] === 1; }
  function bounds(min: Vec3, max: Vec3) {
    if (min.length !== 3 || max.length !== 3 || min.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n >= max[i]!) || max.some((n, i) => !Number.isSafeInteger(n) || n > size[i]!)) throw new Error('Voxel bounds must be valid half-open cell coordinates');
  }
  function edit({ min, max, solid }: { min: Vec3; max: Vec3; solid: boolean }) {
    bounds(min, max);if (typeof solid !== 'boolean') throw new Error('Voxel edit requires boolean occupancy');
    let changed = 0;
    for (let z = min[2]; z < max[2]; z++) for (let y = min[1]; y < max[1]; y++) for (let x = min[0]; x < max[0]; x++) {
      const at = index(x, y, z), value = solid ? 1 : 0;
      if (cells[at] !== value) { cells[at] = value;changed++; }
    }
    return changed;
  }
  /** Collision occupancy uses the same cells as meshing; bounds are local world units. */
  function intersects({ min, max }: { min: Vec3; max: Vec3 }) {
    if (min.length !== 3 || max.length !== 3 || min.some((n, i) => !Number.isFinite(n) || !Number.isFinite(max[i]) || n >= max[i]!)) throw new Error('Invalid voxel query');
    for (let z = Math.max(0, Math.floor(min[2] / cellSize)); z < Math.min(size[2]!, Math.ceil(max[2] / cellSize)); z++)
      for (let y = Math.max(0, Math.floor(min[1] / cellSize)); y < Math.min(size[1]!, Math.ceil(max[1] / cellSize)); y++)
        for (let x = Math.max(0, Math.floor(min[0] / cellSize)); x < Math.min(size[0]!, Math.ceil(max[0] / cellSize)); x++) if (occupied(x, y, z)) return true;
    return false;
  }
  /** Mesh a region while consulting neighbors across region boundaries. No hidden faces. */
  function mesh(region: { min: Vec3; max: Vec3; maxFaces?: number }) {
    bounds(region.min, region.max);const limit = region.maxFaces ?? 100000;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000000) throw new Error('Bound voxel mesh faces');
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    let faces = 0;
    for (let z = region.min[2]; z < region.max[2]; z++) for (let y = region.min[1]; y < region.max[1]; y++) for (let x = region.min[0]; x < region.max[0]; x++) {
      if (!occupied(x, y, z)) continue;
      const cell = [x, y, z];
      for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
        const neighbor = [...cell];neighbor[axis]! += sign;
        if (occupied(neighbor[0]!, neighbor[1]!, neighbor[2]!)) continue;
        if (++faces > limit) throw new Error('Voxel mesh exceeds face budget');
        const u = (axis + 1) % 3, v = (axis + 2) % 3, base = positions.length / 3;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const point = [...cell], normal = [0, 0, 0];point[axis]! += sign > 0 ? 1 : 0;point[u]! += a!;point[v]! += b!;normal[axis] = sign;
          positions.push(...point.map(n => n * cellSize));normals.push(...normal);uvs.push(a!, b!);
        }
        indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(n => base + n));
      }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices), faces };
  }
  function snapshot() {
    const runs: [number, number][] = [];
    for (let start = 0; start < cells.length; start++) if (cells[start]) {
      let end = start + 1;while (end < cells.length && cells[end]) end++;
      runs.push([start, end - start]);start = end - 1;
    }
    const dimensions: [number, number, number] = [size[0]!, size[1]!, size[2]!];
    return { version: 1 as const, size: dimensions, cellSize, runs };
  }
  function restore(value: ReturnType<typeof snapshot>) {
    if (value.version !== 1 || value.cellSize !== cellSize || value.size.some((n, i) => n !== size[i]) || value.size.length !== 3 || !Array.isArray(value.runs) || value.runs.length > cells.length) throw new Error('Incompatible voxel snapshot');
    let previous = 0;
    for (const run of value.runs) {
      const [start, count] = run;
      if (run.length !== 2 || !Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < previous || count <= 0 || start + count > cells.length) throw new Error('Invalid voxel snapshot run');
      previous = start + count;
    }
    cells.fill(0);for (const [start, count] of value.runs) cells.fill(1, start, start + count);
  }
  return { edit, intersects, mesh, snapshot, restore };
}
