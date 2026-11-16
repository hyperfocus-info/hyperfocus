import { atan2, cos, hypot, sin } from '../../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import { samplePlatformPosition3D, samplePlatformRotation3D } from '../../motion/platform-motion.ts';
import { circuitPoseDistance, sampleCircuitMotion3D } from '../../motion/circuit-motion.ts';
import type { CombatEnvironment } from '../config.ts';
import { isObject } from '@hyperfocus/utilities/records';
import { map3 } from '@hyperfocus/utilities/tuples';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
export type VehicleStop = { entityId: string; position: [number, number, number]; cause: 'impact' | 'blocked'; blockerId: string; rotationY?: number; wheelDistance?: number };

/** Wrecks and queued traffic retain their real static solids. Only authored linked motion stops. */
export function createVehicleMotion(options: { definition: CombatEnvironment; world: RigidWorld3D; entities: readonly Entity[] }) {
  const entities = new Map(options.entities.map(entity => [entity.id, entity]));
  const groups = new Map(options.definition.surfaces.filter(surface => surface.stopMotionIds).map(surface => [surface.entityId, [surface.entityId, ...surface.stopMotionIds!]]));
  const thresholds = new Map(options.definition.surfaces.filter(surface => surface.stopMotionIds && surface.trigger.kind === 'impact').map(surface => [surface.entityId, surface.trigger.kind === 'impact' ? surface.trigger.minSpeed : Infinity]));
  let stopped: VehicleStop[] = [];
  let motionTick = 0, motionSeed = 0;
  const impacts: Array<{ entityId: string; blockerId: string; speed: number }> = [];
  const positions = new Map<string, readonly number[]>();
  function rebuild() {
    positions.clear();
    for (const stop of stopped) {
      const root = entities.get(stop.entityId)!;
      const angle = (stop.rotationY ?? root.rotationY) - root.rotationY, c = cos(angle), s = sin(angle);
      for (const id of groups.get(stop.entityId)!) {
        const entity = entities.get(id)!, dx = entity.position[0] - root.position[0], dz = entity.position[2] - root.position[2];
        positions.set(id, [stop.position[0] + dx * c + dz * s, stop.position[1] + entity.position[1] - root.position[1], stop.position[2] - dx * s + dz * c]);
      }
    }
  }
  function stop(entityId: string, cause: VehicleStop['cause'] = 'impact', blockerId = '', position?: [number, number, number]) {
    if (!groups.has(entityId)) return;
    const existing = stopped.find(stop => stop.entityId === entityId);
    if (existing) { if (cause === 'impact') { existing.cause = cause;existing.blockerId = ''; }return; }
    const body = options.world.body(entityId);if (!body) return;
    const entity = entities.get(entityId)!;
    const at: [number, number, number] = position ?? [body.x, body.y, body.z], rotationY = atan2(body.rotationY, body.rotationW) * 2;
    const circuit = sampleCircuitMotion3D(entity, motionTick, motionSeed);
    let wheelDistance: number | undefined;
    if (circuit && entity.animation?.kind === 'ping-pong') {
      const withinLap = circuitPoseDistance(entity, at, rotationY), loop = hypot(...entity.animation.offset) * 2 + Math.PI * Math.abs(entity.animation.turnRadius!) * 2;
      wheelDistance = Math.max(0, withinLap + Math.round((circuit.distance - withinLap) / loop) * loop);
    }
    stopped.push({ entityId, cause, blockerId, position: at, ...(circuit ? { rotationY, wheelDistance } : {}) });rebuild();
  }
  function plan(tick: number, seed: number) {
    motionTick = tick;motionSeed = seed;
    if (!stopped.length) return positions;
    for (const traffic of options.definition.traffic ?? []) {
      if (!groups.has(traffic.entityId) || positions.has(traffic.entityId)) continue;
      const body = options.world.body(traffic.entityId), entity = entities.get(traffic.entityId)!;
      if (!body || body.shape.kind !== 'box') continue;
      const next = samplePlatformPosition3D(entity, tick, seed);
      const from: VehicleStop['position'] = [body.x, body.y, body.z];
      let first = 1, blockerId = '';
      for (const blocker of stopped) {
        const obstacle = options.world.body(blocker.entityId);if (!obstacle || obstacle.shape.kind !== 'box') continue;
        const a = extent(samplePlatformRotation3D(entity, tick, seed), body.shape), b = extent(blocker.rotationY ?? entities.get(blocker.entityId)!.rotationY, obstacle.shape);
        const time = intersection(from, next, blocker.position, a.map((value, axis) => value + b[axis]! + .12));
        if (time !== undefined && time < first) { first = time;blockerId = blocker.entityId; }
      }
      if (blockerId) {
        // Clip at the first solid before freezing every linked part. The environment
        // commits damage atomically with this plan using its persisted transition.
        stop(traffic.entityId, 'blocked', blockerId, map3(from, (value, axis) => value + (next[axis] - value) * Math.max(0, first - .001)));
        const speed = hypot(next[0] - body.x, next[1] - body.y, next[2] - body.z) * 60;
        if (speed >= Math.max(traffic.minSpeed, thresholds.get(traffic.entityId) ?? Infinity)) impacts.push({ entityId: traffic.entityId, blockerId, speed });
      }
    }
    return positions;
  }
  function validate(value: unknown): VehicleStop[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > groups.size) throw new Error('Invalid stopped traffic.');
    const seen = new Set<string>();
    const rows: readonly unknown[] = value;
    return rows.map(row => {
      if (!isObject(row) || typeof row.entityId !== 'string' || !groups.has(row.entityId) || seen.has(row.entityId) || !Array.isArray(row.position) || row.position.length !== 3) throw new Error('Invalid stopped vehicle state.');
      const position: readonly unknown[] = row.position;
      const coordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6;
      const x = position[0];if (!coordinate(x)) throw new Error('Invalid stopped vehicle state.');
      const y = position[1];if (!coordinate(y)) throw new Error('Invalid stopped vehicle state.');
      const z = position[2];if (!coordinate(z)) throw new Error('Invalid stopped vehicle state.');
      if (row.cause !== 'impact' && row.cause !== 'blocked' || typeof row.blockerId !== 'string' || row.cause === 'impact' && row.blockerId !== '' || row.cause === 'blocked' && (!groups.has(row.blockerId) || row.blockerId === row.entityId) || row.rotationY !== undefined && (typeof row.rotationY !== 'number' || !Number.isFinite(row.rotationY) || Math.abs(row.rotationY) > 100) || row.wheelDistance !== undefined && (typeof row.wheelDistance !== 'number' || !Number.isFinite(row.wheelDistance) || row.wheelDistance < 0 || row.wheelDistance > 1e12) || Object.keys(row).some(key => !['entityId', 'position', 'cause', 'blockerId', 'rotationY', 'wheelDistance'].includes(key))) throw new Error('Invalid stopped vehicle state.');
      if (row.cause === 'blocked' && !seen.has(row.blockerId)) throw new Error('Queued vehicle needs an earlier stopped blocker.');
      seen.add(row.entityId);return { entityId: row.entityId, position: [x, y, z], cause: row.cause, blockerId: row.blockerId, ...(row.rotationY === undefined ? {} : { rotationY: row.rotationY }), ...(row.wheelDistance === undefined ? {} : { wheelDistance: row.wheelDistance }) };
    });
  }
  return { stop, plan, validate, impacts, setClock(tick: number, seed: number) { motionTick = tick;motionSeed = seed; }, clearImpacts() { impacts.length = 0; }, has: (id: string) => positions.has(id), get positions() { return positions; }, capture: () => structuredClone(stopped), restore(value: VehicleStop[]) { stopped = structuredClone(value);impacts.length = 0;rebuild(); }, reset() { stopped = [];impacts.length = 0;positions.clear(); } };
}

function extent(rotationY: number, shape: { halfX: number; halfY: number; halfZ: number }) {
  const c = Math.abs(cos(rotationY)), s = Math.abs(sin(rotationY));return [shape.halfX * c + shape.halfZ * s, shape.halfY, shape.halfZ * c + shape.halfX * s];
}
function intersection(from: readonly number[], to: readonly number[], center: readonly number[], extent: readonly number[]) {
  let first = 0, last = 1;
  for (let axis = 0; axis < 3; axis++) {
    const a = from[axis]! - center[axis]!, d = to[axis]! - from[axis]!, half = extent[axis]!;
    if (Math.abs(d) < 1e-10) { if (Math.abs(a) > half) return;continue; }
    const enter = (-half - a) / d, leave = (half - a) / d;first = Math.max(first, Math.min(enter, leave));last = Math.min(last, Math.max(enter, leave));if (first > last) return;
  }
  return first;
}
