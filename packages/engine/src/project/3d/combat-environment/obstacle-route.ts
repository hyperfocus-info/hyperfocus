import { createObstacleIndex } from './obstacle-index.ts';
import { hazardSegmentCost, type HazardRouteRegion } from './hazards/routes.ts';
import { hypot } from '../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';
import { combatObstacleBounds, combatSegmentMayMeetBox, type CombatObstacleBounds } from './obstacle-bounds.ts';

type Point = { x: number; z: number };
type Box = NonNullable<ReturnType<RigidWorld3D['body']>>;

export function createCombatObstacleRoute(options: { world: RigidWorld3D; bodyIds: readonly string[]; hazards?: (fighterId: string) => readonly HazardRouteRegion[] }) {
  const plan = createCombatObstaclePlanner(options);
  return (fighterId: string, targetId: string, destination?: { x: number; y: number; z: number }) => plan(fighterId, targetId, destination)?.direction;
}

/** Ground-level detours use the same live solids as movement; no authored route privileges. */
export function createCombatObstaclePlanner(options: { world: RigidWorld3D; bodyIds: readonly string[]; hazards?: (fighterId: string) => readonly HazardRouteRegion[] }) {
  let cacheKey = '', corners: Point[] = [], links: number[][] = [];
  return (fighterId: string, targetId: string, destination?: { x: number; y: number; z: number }, ignoredId?: string, directOnly = false) => {
    const actor = options.world.body(fighterId), target = destination ?? options.world.body(targetId);
    if (!actor || !target || Math.abs(actor.y - target.y) > 1.25) return undefined;
    const radius = actor.shape.kind === 'sphere' ? actor.shape.radius : Math.max(actor.shape.halfX, actor.shape.halfZ);
    const height = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
    const boxes: Box[] = [], blockers: Box[] = [], bounds: CombatObstacleBounds[] = [];
    for (const id of options.bodyIds) {
      const body = options.world.body(id);
      if (id === ignoredId || !body || body.type === 'dynamic' || body.trigger || body.collisionMask === 0 || body.shape.kind !== 'box') continue;
      if (body.y + body.shape.halfY <= actor.y - height + .15 || body.y - body.shape.halfY >= actor.y + height - .15) continue;
      blockers.push(body);
      bounds.push(combatObstacleBounds(body));
      const extent = hypot(body.shape.halfX, body.shape.halfZ);
      if (body.x + extent < Math.min(actor.x, target.x) - 12 || body.x - extent > Math.max(actor.x, target.x) + 12
        || body.z + extent < Math.min(actor.z, target.z) - 12 || body.z - extent > Math.max(actor.z, target.z) + 12) continue;
      boxes.push(body);
    }
    if (boxes.length > 64) return undefined;
    const index = createObstacleIndex(bounds);
    const regions = options.hazards?.(fighterId) ?? [];
    const cost = (a: Point, b: Point) => hazardSegmentCost(a, b, regions, radius + .1);
    const clear = (a: Point, b: Point) => clearSegment(a, b, actor.y, radius + .1, index);
    const directClear = clear(actor, target), direct = cost(actor, target);
    if (directClear && direct <= hypot(target.x - actor.x, target.z - actor.z) + .001) return { direction: undefined, distance: hypot(target.x - actor.x, target.z - actor.z) };
    if (directOnly) return undefined;
    const key = JSON.stringify([radius, height, actor.y, regions, boxes.map(body => body.id), blockers.map(body => [body.id, body.x, body.y, body.z, body.rotationX, body.rotationY, body.rotationZ, body.rotationW, body.shape])]);
    if (key !== cacheKey) {
      cacheKey = key;corners = [];
      for (const body of boxes) {
        if (body.shape.kind !== 'box') continue;
        const { halfX, halfZ } = body.shape, { rotationX: x, rotationY: y, rotationZ: z, rotationW: w } = body;
        const extentX = Math.abs(1 - 2 * (y * y + z * z)) * halfX + Math.abs(2 * (x * z + y * w)) * halfZ + radius + .3;
        const extentZ = Math.abs(2 * (x * z - y * w)) * halfX + Math.abs(1 - 2 * (x * x + y * y)) * halfZ + radius + .3;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const point = { x: body.x + sx * extentX, z: body.z + sz * extentZ };
          if (clear(point, { x: point.x + .001, z: point.z })) corners.push(point);
        }
      }
      for (const region of regions) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const point = { x: region.x + sx * (region.halfX + radius + .3), z: region.z + sz * (region.halfZ + radius + .3) };
        if (clear(point, { x: point.x + .001, z: point.z })) corners.push(point);
      }
      links = corners.map(() => []);
      for (let a = 0; a < corners.length; a++) for (let b = a + 1; b < corners.length; b++) if (clear(corners[a]!, corners[b]!)) { links[a]!.push(b);links[b]!.push(a); }
    }
    const distances = corners.map(point => clear(actor, point) ? cost(actor, point) : Infinity);
    const previous = corners.map(() => -1), visited = new Set<number>();
    let best = directClear ? direct : Infinity, waypoint = -1;
    for (let count = 0; count < corners.length; count++) {
      let current = -1;
      for (let index = 0; index < corners.length; index++) if (!visited.has(index) && distances[index]! < (current < 0 ? Infinity : distances[current]!)) current = index;
      if (current < 0 || distances[current]! >= best) break;
      visited.add(current);
      const point = corners[current]!;
      const finish = distances[current]! + cost(point, target);
      if (finish < best && clear(point, target)) { best = finish;waypoint = current; }
      for (const next of links[current]!) {
        const candidate = distances[current]! + cost(point, corners[next]!);
        if (candidate < distances[next]! - 1e-6) { distances[next] = candidate;previous[next] = current; }
      }
    }
    if (waypoint < 0) return directClear ? { direction: undefined, distance: direct } : undefined;
    while (previous[waypoint]! >= 0 && (!clearSegment(actor, corners[waypoint]!, actor.y, radius, index) || cost(actor, corners[waypoint]!) > distances[waypoint]! + .001)) waypoint = previous[waypoint]!;
    // Ease into tight corners rather than overshooting and reversing every tick.
    const point = corners[waypoint]!, length = Math.max(1, hypot(point.x - actor.x, point.z - actor.z));
    return { direction: { x: (point.x - actor.x) / length, y: 0, z: (point.z - actor.z) / length }, distance: best };
  };
}

function clearSegment(a: Point, b: Point, height: number, radius: number, index: ReturnType<typeof createObstacleIndex>) {
  return !index.some(a.x, a.z, b.x, b.z, radius, box => {
    if (!combatSegmentMayMeetBox(a.x, a.z, b.x, b.z, radius, box)) return false;
    const body = box.body;
    if (body.shape.kind !== 'box') return false;
    const x = -body.rotationX, y = -body.rotationY, z = -body.rotationZ, w = body.rotationW;
    const local = (dx: number, dy: number, dz: number) => {
      const tx = 2 * (y * dz - z * dy), ty = 2 * (z * dx - x * dz), tz = 2 * (x * dy - y * dx);
      return [dx + w * tx + y * tz - z * ty, dy + w * ty + z * tx - x * tz, dz + w * tz + x * ty - y * tx];
    };
    const origin = local(a.x - body.x, height - body.y, a.z - body.z);
    // Sweep normals are undefined inside the solid itself. Such points cannot
    // seed a route, even when they are corners of another overlapping collider.
    if (Math.abs(origin[0]!) <= body.shape.halfX && Math.abs(origin[1]!) <= body.shape.halfY && Math.abs(origin[2]!) <= body.shape.halfZ) return true;
    const delta = local(b.x - a.x, 0, b.z - a.z), hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
    if (refineSphereBoxSweep(origin, delta, body.shape.halfX, body.shape.halfY, body.shape.halfZ, radius, hit)) {
      if (hit.time === 0 && delta[0]! * hit.normalX + delta[1]! * hit.normalY + delta[2]! * hit.normalZ > 0) return false;
      return true;
    }
    return false;
  });
}
