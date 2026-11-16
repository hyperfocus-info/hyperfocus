import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** A table may span joined slabs, but no uncovered patch may sit below its base. */
export function stationFootprintSupported(entities: Entity[], position: [number, number, number]) {
  const left = position[0] - 1.3, right = position[0] + 1.3, back = position[2] - .55, front = position[2] + .55;
  const floors = entities.filter(entity => entity.physics && !entity.animation
    && Math.abs(entity.position[1] + entity.scale[1] - position[1] + .45) < .001
    && entity.position[0] + entity.scale[0] > left && entity.position[0] - entity.scale[0] < right
    && entity.position[2] + entity.scale[2] > back && entity.position[2] - entity.scale[2] < front);
  const xs = [...new Set([left, right, ...floors.flatMap(entity => [Math.max(left, entity.position[0] - entity.scale[0]), Math.min(right, entity.position[0] + entity.scale[0])])])].sort((a, b) => a - b);
  const zs = [...new Set([back, front, ...floors.flatMap(entity => [Math.max(back, entity.position[2] - entity.scale[2]), Math.min(front, entity.position[2] + entity.scale[2])])])].sort((a, b) => a - b);
  for (let x = 1; x < xs.length; x++) for (let z = 1; z < zs.length; z++) {
    const px = (xs[x - 1]! + xs[x]!) / 2, pz = (zs[z - 1]! + zs[z]!) / 2;
    if (!floors.some(entity => Math.abs(entity.position[0] - px) <= entity.scale[0] + .001 && Math.abs(entity.position[2] - pz) <= entity.scale[2] + .001)) return false;
  }
  return floors.length > 0;
}
