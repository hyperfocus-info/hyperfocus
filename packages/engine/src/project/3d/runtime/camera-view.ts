import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { lookAtViewMat4 } from '../../../render/3d-core.ts';

type Camera = Pick<Hyperfocus3DEvaluatedFrame['camera'], 'position' | 'target' | 'up'>;

/** Evaluated presentation can briefly collapse a shot; retain the authored direction without history. */
export function runtimeCameraView(out: Float32Array, camera: Camera, authored: Camera) {
  const eye = camera.position;
  let target = camera.target, up = camera.up;
  let x = eye[0] - target[0], y = eye[1] - target[1], z = eye[2] - target[2];
  if (Math.hypot(x, y, z) <= 1e-8) {
    x = authored.position[0] - authored.target[0];y = authored.position[1] - authored.target[1];z = authored.position[2] - authored.target[2];
    const length = Math.hypot(x, y, z);
    if (length > 1e-8) { x /= length;y /= length;z /= length; }
    else { x = 0;y = 0;z = 1; }
    target = [eye[0] - x, eye[1] - y, eye[2] - z];
  }
  const length = Math.hypot(x, y, z);x /= length;y /= length;z /= length;
  if (Math.hypot(up[1] * z - up[2] * y, up[2] * x - up[0] * z, up[0] * y - up[1] * x) <= 1e-8) up = Math.abs(y) < .9 ? [0, 1, 0] : [1, 0, 0];
  return lookAtViewMat4(out, eye, target, up);
}
