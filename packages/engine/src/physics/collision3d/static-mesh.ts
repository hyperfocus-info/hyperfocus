import { hypot } from '../../math/simulation.ts';
import type { Physics3DCapsuleCollider, Vec3Input } from "../3d.ts";
import { capsuleRadius } from "./capsule.ts";
import { along, cross, dot, point, queryCoordinate, rayTriangle, segmentTriangleDistance, subtract, type Point3 } from "./geometry.ts";

/** Owns a validated copy of world-space triangles. Queries are linear in triangle count. */
export function createStaticTriangleQueries3D(options: {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number>;
  maxTriangles?: number;
}) {
  const limit = options.maxTriangles ?? 100_000;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("maxTriangles must be a positive integer");
  if (options.positions.length % 3 !== 0) throw new RangeError("positions must contain xyz triples");
  const count = options.indices?.length ?? options.positions.length / 3;
  if (count % 3 !== 0 || count / 3 > limit) throw new RangeError("triangle count is invalid or exceeds maxTriangles");
  const vertices = Array.from(options.positions);
  for (const coordinate of vertices) queryCoordinate(coordinate);
  const indices = options.indices ? Array.from(options.indices) : Array.from({ length: count }, (_, index) => index);
  if (indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index * 3 >= vertices.length)) throw new RangeError("triangle index out of range");
  const triangles: Array<readonly [Point3, Point3, Point3]> = [];
  function vertex(index: number): Point3 { const offset = index * 3; return [vertices[offset], vertices[offset + 1], vertices[offset + 2]]; }
  for (let index = 0; index < indices.length; index += 3) triangles.push([vertex(indices[index]), vertex(indices[index + 1]), vertex(indices[index + 2])]);
  return {
    triangleCount: triangles.length,
    /** Returns the first intersected triangle in authored order, or null. Both faces collide. */
    intersectCapsule(query: { capsule: Physics3DCapsuleCollider }) {
      const a = point(query.capsule.a), b = point(query.capsule.b), radius = capsuleRadius(query.capsule.radius);
      for (let index = 0; index < triangles.length; index += 1) {
        const triangle = triangles[index];
        if (segmentTriangleDistance(a, b, ...triangle) <= radius * radius) return { triangleIndex: index };
      }
      return null;
    },
    /** Nearest two-sided hit; direction is normalized so distance is in world units. */
    raycast(query: { origin: Vec3Input; direction: Vec3Input; maxDistance?: number }) {
      const origin = point(query.origin), raw = point(query.direction), length = hypot(...raw);
      if (length === 0) throw new RangeError("ray direction must be non-zero");
      const direction: Point3 = [raw[0] / length, raw[1] / length, raw[2] / length];
      const maximum = query.maxDistance ?? Infinity;
      if (Number.isNaN(maximum) || maximum < 0) throw new RangeError("ray maxDistance must be non-negative");
      let nearest = maximum;
      let result: { triangleIndex: number; distance: number; point: Point3; normal: Point3 } | null = null;
      for (let index = 0; index < triangles.length; index += 1) {
        const [a, b, c] = triangles[index], distance = rayTriangle(origin, direction, a, b, c);
        if (distance === null || distance > nearest || result && distance === nearest) continue;
        const normal = cross(subtract(b, a), subtract(c, a)), magnitude = hypot(...normal);
        if (magnitude === 0) continue;
        const sign = dot(normal, direction) > 0 ? -1 : 1;
        nearest = distance;
        result = { triangleIndex: index, distance, point: along(origin, direction, distance), normal: [normal[0] / magnitude * sign + 0, normal[1] / magnitude * sign + 0, normal[2] / magnitude * sign + 0] };
      }
      return result;
    }
  };
}

/** Samples are row-major along X; each cell uses the (x,z) to (x+1,z+1) diagonal. */
export function createHeightfieldQueries3D(options: {
  columns: number;
  rows: number;
  heights: ArrayLike<number>;
  cellSize?: number;
  origin?: Vec3Input;
  maxTriangles?: number;
}) {
  const { columns, rows } = options, size = options.cellSize ?? 1, origin = point(options.origin ?? [0, 0, 0]);
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns < 2 || rows < 2) throw new RangeError("heightfield needs at least two rows and columns");
  if (options.heights.length !== rows * columns) throw new RangeError("heightfield sample count must match rows and columns");
  if (!Number.isFinite(size) || size <= 0) throw new RangeError("heightfield cellSize must be positive and finite");
  const maxTriangles = options.maxTriangles ?? 100_000;
  if (!Number.isSafeInteger(maxTriangles) || maxTriangles < 1 || 2 * (rows - 1) * (columns - 1) > maxTriangles) throw new RangeError("heightfield exceeds maxTriangles");
  const positions: number[] = [], indices: number[] = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < columns; x += 1) positions.push(origin[0] + x * size, origin[1] + options.heights[z * columns + x], origin[2] + z * size);
  }
  for (let z = 0; z < rows - 1; z += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      const a = z * columns + x, b = a + 1, c = a + columns, d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  return createStaticTriangleQueries3D({ positions, indices, maxTriangles });
}
