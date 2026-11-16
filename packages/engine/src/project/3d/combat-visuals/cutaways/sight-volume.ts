import { hypot } from '../../../../math/simulation.ts';

type Vec = readonly [number, number, number];

/** Conservative six-plane volume containing every eye-to-target segment. */
export function createSightVolumePlanes3D(eye: Vec, aim: Vec, targets: readonly Vec[]): Float64Array | undefined {
  const dx = aim[0] - eye[0], dy = aim[1] - eye[1], dz = aim[2] - eye[2], length = hypot(dx, dy, dz);
  if (!targets.length || !(length > 1e-8)) return;
  const fx = dx / length, fy = dy / length, fz = dz / length, horizontal = hypot(fx, fz);
  const rx = horizontal > 1e-8 ? fz / horizontal : 1, rz = horizontal > 1e-8 ? -fx / horizontal : 0;
  const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, far = 0;
  for (const target of targets) {
    const x = target[0] - eye[0], y = target[1] - eye[1], z = target[2] - eye[2], depth = fx * x + fy * y + fz * z;
    // A target behind/at the eye cannot share this finite perspective cone.
    if (!(depth > 1e-8)) return;
    const sx = (rx * x + rz * z) / depth, sy = (ux * x + uy * y + uz * z) / depth;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(depth)) return;
    minX = Math.min(minX, sx);maxX = Math.max(maxX, sx);minY = Math.min(minY, sy);maxY = Math.max(maxY, sy);far = Math.max(far, depth);
  }
  const planes = new Float64Array(24);
  const write = (offset: number, x: number, y: number, z: number, distance = 0) => {
    const norm = hypot(x, y, z), a = x / norm, b = y / norm, c = z / norm;
    const origin = a * eye[0] + b * eye[1] + c * eye[2];
    planes[offset] = a;planes[offset + 1] = b;planes[offset + 2] = c;
    // Relax planes for arithmetic roundoff, including large world coordinates.
    planes[offset + 3] = distance / norm - origin + (1 + Math.abs(origin)) * 1e-8;
  };
  write(0, rx - minX * fx, -minX * fy, rz - minX * fz);
  write(4, maxX * fx - rx, maxX * fy, maxX * fz - rz);
  write(8, ux - minY * fx, uy - minY * fy, uz - minY * fz);
  write(12, maxY * fx - ux, maxY * fy - uy, maxY * fz - uz);
  write(16, fx, fy, fz);write(20, -fx, -fy, -fz, far);
  return planes;
}
