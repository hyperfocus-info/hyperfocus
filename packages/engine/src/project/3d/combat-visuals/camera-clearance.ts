import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';
import { cutawaySceneBindings } from './cutaways/scene-bindings.ts';

type Point = [number, number, number];

/** Fade sightline obstacles without retracting the fitted shot; solid support still protects the near plane. */
export function clearCombatCameraSurfaces(options: { frame: Pick<Hyperfocus3DEvaluatedFrame, 'camera'> & { materials?: readonly { id: string }[]; entities?: readonly { id: string }[] }; world: RigidWorld3D; bodyIds: readonly string[]; materialIds?: ReadonlyMap<string, string>; movingBodyIds?: ReadonlySet<string> }) {
  clearBoundCombatCameraSurfaces(options, cutawaySceneBindings(options.frame, options.materialIds));
}

/** Internal synchronous seam: bindings must be validated for this frame immediately before use. */
export function clearBoundCombatCameraSurfaces(options: Parameters<typeof clearCombatCameraSurfaces>[0], bindings: ReturnType<typeof cutawaySceneBindings>) {
  const { frame, world, bodyIds } = options;
  const { fading } = bindings;
  const fadeObstacle = (id: string, body: NonNullable<ReturnType<RigidWorld3D['body']>>) => {
    if (!fading.has(id) || body.shape.kind !== 'box') return false;
    // Animated vehicles/decks are already authored to fade. Their broad low
    // chassis must not be mistaken for the terrain and retract the whole shot.
    if (options.movingBodyIds?.has(id)) return true;
    const target = rotate([frame.camera.target[0] - body.x, frame.camera.target[1] - body.y, frame.camera.target[2] - body.z], [-body.rotationX, -body.rotationY, -body.rotationZ, body.rotationW]);
    const support = body.shape.halfY < Math.min(body.shape.halfX, body.shape.halfZ)
      && Math.abs(body.rotationX) + Math.abs(body.rotationZ) < .001
      && Math.abs(target[0]) <= body.shape.halfX && Math.abs(target[2]) <= body.shape.halfZ
      && frame.camera.target[1] >= body.y + body.shape.halfY;
    return !support;
  };
  const margin = Math.max(.3, frame.camera.near * 2);
  const origin = frame.camera.target, position = frame.camera.position;
  const delta: Point = [position[0] - origin[0], position[1] - origin[1], position[2] - origin[2]];
  let fraction = 1;
  for (const id of bodyIds) {
    const body = world.body(id);
    if (!body || body.type === 'dynamic' || body.trigger || body.collisionMask === 0 || body.shape.kind !== 'box' || fadeObstacle(id, body)) continue;
    const inverse: [number, number, number, number] = [-body.rotationX, -body.rotationY, -body.rotationZ, body.rotationW];
    const local = rotate([origin[0] - body.x, origin[1] - body.y, origin[2] - body.z], inverse);
    const hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
    if (refineSphereBoxSweep(local, rotate(delta, inverse), body.shape.halfX, body.shape.halfY, body.shape.halfZ, margin, hit) && hit.time > .0001) fraction = Math.min(fraction, Math.max(hit.time * .5, hit.time - .002));
  }
  if (fraction < 1) frame.camera.position = [origin[0] + delta[0] * fraction, origin[1] + delta[1] * fraction, origin[2] + delta[2] * fraction];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const id of bodyIds) {
      const body = world.body(id);
      if (!body || body.type === 'dynamic' || body.trigger || body.collisionMask === 0 || body.shape.kind !== 'box' || fadeObstacle(id, body)) continue;
      const q: [number, number, number, number] = [body.rotationX, body.rotationY, body.rotationZ, body.rotationW];
      const local = rotate([frame.camera.position[0] - body.x, frame.camera.position[1] - body.y, frame.camera.position[2] - body.z], [-q[0], -q[1], -q[2], q[3]]);
      const half = [body.shape.halfX + margin, body.shape.halfY + margin, body.shape.halfZ + margin];
      if (local.some((value, axis) => Math.abs(value) >= half[axis]!)) continue;
      let axis = 0;
      for (let next = 1; next < 3; next++) if (half[next]! - Math.abs(local[next]!) < half[axis]! - Math.abs(local[axis]!)) axis = next;
      // A floor/slab is cleared upward; choosing its underside creates a ground pop.
      if (body.shape.halfY < Math.min(body.shape.halfX, body.shape.halfZ) && Math.abs(q[0]) + Math.abs(q[2]) < .001) { axis = 1;local[axis] = half[axis]!; }
      else local[axis] = Math.sign(local[axis] || 1) * half[axis]!;
      const adjusted = rotate(local, q);
      frame.camera.position = [adjusted[0] + body.x, adjusted[1] + body.y, adjusted[2] + body.z];changed = true;
    }
    if (!changed) break;
  }
}

function rotate(point: Point, q: [number, number, number, number]): Point {
  const [x, y, z, w] = q, [px, py, pz] = point;
  const tx = 2 * (y * pz - z * py), ty = 2 * (z * px - x * pz), tz = 2 * (x * py - y * px);
  return [px + w * tx + y * tz - z * ty, py + w * ty + z * tx - x * tz, pz + w * tz + x * ty - y * tx];
}
