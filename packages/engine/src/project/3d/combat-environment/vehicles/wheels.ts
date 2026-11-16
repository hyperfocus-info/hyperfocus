import { atan2, cos, hypot, sin } from '../../../../math/simulation.ts';
import { createFrameRecordSelection } from '../../../../frame/record-selection.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import { circuitPoseDistance, sampleCircuitMotion3D } from '../../motion/circuit-motion.ts';
import type { VehicleStop } from './vehicle-motion.ts';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Road-car cosmetics share the real route and stop phase; no wheel physics or frame history. */
export function createTrafficWheelPresenter(options: { entities: readonly Entity[] }) {
  const cars = options.entities.filter(entity => /^tod:city:traffic:car-[^:]+:body$/.test(entity.id)).map(body => {
    const prefix = body.id.slice(0, -4);
    return { body, wheels: options.entities.filter(entity => entity.id.startsWith(prefix + 'wheel:')).map(wheel => ({ wheel, hub: options.entities.find(entity => entity.id === wheel.id.replace(':wheel:', ':hub:')) })) };
  });
  const ids = new Set(cars.flatMap(({ body, wheels }) => [body.id, ...wheels.flatMap(({ wheel, hub }) => hub ? [wheel.id, hub.id] : [wheel.id])]));
  const select = createFrameRecordSelection({ ids: options.entities.filter(entity => ids.has(entity.id)).map(entity => entity.id) });
  return (frame: Hyperfocus3DEvaluatedFrame, stopped: readonly VehicleStop[], seed: number) => {
    const evaluated = new Map(select(frame.entities).map(entity => [entity.id, entity]));
    for (const { body, wheels } of cars) {
      const root = evaluated.get(body.id), motion = body.animation;
      if (!root || motion?.kind !== 'ping-pong' || motion.turnRadius === undefined) continue;
      const stop = stopped.find(value => value.entityId === body.id), sampled = sampleCircuitMotion3D(body, frame.tick, seed)!;
      const yaw = atan2(root.rotation[1], root.rotation[3]) * 2, distance = stop ? stop.wheelDistance ?? circuitPoseDistance(body, stop.position, stop.rotationY ?? yaw) : sampled.distance;
      const radius = Math.abs(motion.turnRadius), side = Math.sign(motion.turnRadius), length = hypot(...motion.offset), loop = length * 2 + Math.PI * radius * 2;
      const lap = Math.floor(distance / loop), local = distance - lap * loop, arc = Math.PI * radius;
      const turnAt = local > length * 2 + arc ? local - length * 2 - arc : local - length;
      // Ease the visual steering over the first/last quarter metre of actual curvature.
      const steeringWeight = Math.max(0, Math.min(1, turnAt / .25, (arc - turnAt) / .25));
      for (const { wheel, hub } of wheels) {
        const part = evaluated.get(wheel.id);if (!part) continue;
        const x = wheel.position[0] - body.position[0], z = wheel.position[2] - body.position[2];
        const wheelRadius = hypot(radius + side * x, z), turnDistance = Math.min(arc, Math.max(0, local - length)) + Math.max(0, local - length * 2 - arc);
        const rolled = lap * (length * 2 + Math.PI * wheelRadius * 2) + local + turnDistance * (wheelRadius / radius - 1);
        const steering = z > 0 ? atan2(-side * z, radius + side * x) * steeringWeight : 0;
        const halfYaw = (yaw + steering) / 2, halfRoll = rolled / (Math.max(.01, wheel.scale[1]) * 2), sy = sin(halfYaw), cy = cos(halfYaw), sx = sin(halfRoll), cx = cos(halfRoll);
        part.rotation = [cy * sx, sy * cx, -sy * sx, cy * cx];
        const cap = hub && evaluated.get(hub.id);
        if (cap && hub) {
          const offset = hub.position[0] - wheel.position[0];
          cap.position = [part.position[0] + cos(yaw + steering) * offset, part.position[1], part.position[2] - sin(yaw + steering) * offset];
          cap.rotation = [...part.rotation];
        }
      }
    }
  };
}
