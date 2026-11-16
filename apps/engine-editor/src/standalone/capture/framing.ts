import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
type Camera = Hyperfocus3DEvaluatedFrame['camera'];
type Position = Camera['position'];

function basis(camera: Camera) {
  const f = camera.target.map((value, axis) => value - camera.position[axis]!), length = Math.hypot(...f);
  if (!(length > .001)) throw Error('Capture camera has no view direction.');
  for (let axis = 0; axis < 3; axis++) f[axis]! /= length;
  const r = [f[1]! * camera.up[2] - f[2]! * camera.up[1], f[2]! * camera.up[0] - f[0]! * camera.up[2], f[0]! * camera.up[1] - f[1]! * camera.up[0]];
  const width = Math.hypot(...r);if (!(width > .001)) throw Error('Capture camera up is parallel to its view.');
  for (let axis = 0; axis < 3; axis++) r[axis]! /= width;
  const u = [r[1]! * f[2]! - r[2]! * f[1]!, r[2]! * f[0]! - r[0]! * f[2]!, r[0]! * f[1]! - r[1]! * f[0]!];
  return { f, r, u, tangent: Math.tan(camera.fovYRadians / 2) };
}

function corners(position: Position) {
  const points: Position[] = [];
  for (const x of [-.8, .8]) for (const y of [-1.1, 1.5]) for (const z of [-.8, .8]) points.push([position[0] + x, position[1] + y, position[2] + z]);
  return points;
}

/** Preserve requested orbit/target while backing off only enough to fit complete fighters. */
export function fitCaptureCamera(camera: Camera, positions: readonly Position[], aspect: number) {
  const { f, r, u, tangent } = basis(camera);
  let backoff = 0;
  for (const position of positions) for (const point of corners(position)) {
    const delta = point.map((value, axis) => value - camera.position[axis]!);
    const dot = (vector: number[]) => delta.reduce((sum, value, axis) => sum + value * vector[axis]!, 0);
    const depth = dot(f);
    backoff = Math.max(backoff, camera.near + .1 - depth, Math.abs(dot(r)) / (tangent * aspect * .86) - depth, Math.abs(dot(u)) / (tangent * .86) - depth);
  }
  for (let axis = 0; axis < 3; axis++) camera.position[axis]! -= f[axis]! * backoff;
}

export function captureSubjectBounds(camera: Camera, positions: readonly Position[], aspect: number) {
  const { f, r, u, tangent } = basis(camera);
  return positions.map(position => {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const point of corners(position)) {
      const delta = point.map((value, axis) => value - camera.position[axis]!);
      const dot = (vector: number[]) => delta.reduce((sum, value, axis) => sum + value * vector[axis]!, 0);
      const depth = dot(f);
      if (depth <= camera.near) throw Error('Capture fighter is behind the camera or near plane.');
      const x = .5 + dot(r) / (depth * tangent * aspect) * .5, y = .5 - dot(u) / (depth * tangent) * .5;
      left = Math.min(left, x);right = Math.max(right, x);top = Math.min(top, y);bottom = Math.max(bottom, y);
    }
    return { left, right, top, bottom };
  });
}

export function validateCaptureSubjects(bounds: ReturnType<typeof captureSubjectBounds>) {
  if (!bounds.length || bounds.some(rect => !Object.values(rect).every(Number.isFinite) || rect.left < .025 || rect.right > .975 || rect.top < .025 || rect.bottom > .975 || rect.bottom - rect.top < .08)) {
    throw Error('Capture framing loses, clips or makes the fight too small. Reduce pan/dolly or use an explicit scenery-only capture.');
  }
}
