import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Conservative full-motion reservation used when stocking scenery around traffic. */
export function cityMotionEnvelope(entity: Pick<Entity, 'position' | 'scale' | 'animation'>) {
  const motion = entity.animation;
  const offset = motion?.kind === 'ping-pong' ? motion.offset : [0, 0, 0];
  const min = entity.position.map((value, axis) => Math.min(value, value + offset[axis]!) - entity.scale[axis]!);
  const max = entity.position.map((value, axis) => Math.max(value, value + offset[axis]!) + entity.scale[axis]!);
  if (motion?.kind === 'ping-pong' && motion.turnRadius !== undefined && motion.turnPivot) {
    const length = Math.hypot(offset[0]!, offset[2]!), radius = motion.turnRadius;
    const ux = offset[0]! / length, uz = offset[2]! / length, [px, , pz] = motion.turnPivot;
    const reach = Math.hypot(entity.position[0] - px, entity.position[2] - pz) + Math.hypot(entity.scale[0], entity.scale[2]);
    for (const axis of [0, 2]) {
      const pivot = motion.turnPivot[axis]!, along = offset[axis]!, across = (axis === 0 ? -uz : ux) * radius * 2;
      const turn = Math.abs(axis === 0 ? ux : uz) * Math.abs(radius);
      min[axis] = pivot + Math.min(0, along) + Math.min(0, across) - turn - reach;
      max[axis] = pivot + Math.max(0, along) + Math.max(0, across) + turn + reach;
    }
  }
  return { min, max };
}
