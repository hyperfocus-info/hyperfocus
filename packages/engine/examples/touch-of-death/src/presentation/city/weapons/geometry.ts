import { cityLoft } from '../mesh-cooking.ts';

export type WeaponPoint = readonly [number, number, number];
export type WeaponFace = readonly WeaponPoint[];

/** Eight broad planes give small props useful highlights without smooth capsule blobs. */
export function vessel(profile: readonly (readonly [number, number])[], depth = 1, sides = 10, hollow = false): WeaponFace[] {
  const rings = profile.map(([y, radius]) => Array.from({ length: sides }, (_, index): WeaponPoint => {
    const angle = index / sides * 6.283185307179586;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius * depth];
  }));
  return hollow ? cityLoft([...rings, rings[0]!]).slice(0, -2) : cityLoft(rings);
}

export function block(x: number, y: number, z: number, sx: number, sy: number, sz: number, bevel = .12): WeaponFace[] {
  const ring = (height: number, width: number, depth: number): WeaponPoint[] => [
    [-width * .8, height, -depth], [width * .8, height, -depth], [width, height, -depth * .8], [width, height, depth * .8],
    [width * .8, height, depth], [-width * .8, height, depth], [-width, height, depth * .8], [-width, height, -depth * .8],
  ];
  return move(cityLoft([ring(-sy, sx * (1 - bevel), sz * (1 - bevel)), ring(-sy * (1 - bevel), sx, sz),
    ring(sy * (1 - bevel), sx, sz), ring(sy, sx * (1 - bevel), sz * (1 - bevel))]), x, y, z);
}

/** A shallow bevel around an XY outline catches light on broad tool and blade faces. */
export function plate(outline: readonly (readonly [number, number])[], thickness: number): WeaponFace[] {
  const faces: WeaponFace[] = [], count = outline.length;
  const center = outline.reduce(([x, y], point) => [x + point[0] / count, y + point[1] / count], [0, 0]);
  const outer = (index: number): WeaponPoint => [outline[index]![0], outline[index]![1], 0];
  const inset = (index: number, side: number): WeaponPoint => [center[0]! + (outline[index]![0] - center[0]!) * .88, center[1]! + (outline[index]![1] - center[1]!) * .96, side * thickness];
  faces.push(outline.map((_, index) => inset(index, 1)), outline.map((_, index) => inset(index, -1)).reverse());
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    faces.push([outer(index), outer(next), inset(next, 1), inset(index, 1)], [outer(next), outer(index), inset(index, -1), inset(next, -1)]);
  }
  return faces;
}

/** Explicit guard for authored service-tool plates sent to the fan facet cooker. */
export function convexPlate(outline: readonly (readonly [number, number])[], thickness: number): WeaponFace[] {
  let winding = 0;
  for (let i = 0; i < outline.length; i++) {
    const a=outline[i]!,b=outline[(i+1)%outline.length]!,c=outline[(i+2)%outline.length]!;
    const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if(Math.abs(cross)<1e-8)continue;
    if(winding && Math.sign(cross)!==winding)throw Error('Service-tool plates must be convex; split concave silhouettes before cooking.');
    winding=Math.sign(cross);
  }
  if(!winding)throw Error('Service-tool plate has no area.');
  return plate(outline,thickness);
}

export function move(faces: readonly WeaponFace[], x: number, y: number, z: number): WeaponFace[] {
  return faces.map(face => face.map(point => [point[0] + x, point[1] + y, point[2] + z]));
}

export function transform(faces: readonly WeaponFace[], sx: number, sy: number, sz: number, rx = 0, rz = 0): WeaponFace[] {
  return faces.map(face => face.map(([x, y, z]): WeaponPoint => {
    const py = y * sy * Math.cos(rx) - z * sz * Math.sin(rx), pz = y * sy * Math.sin(rx) + z * sz * Math.cos(rx);
    return [x * sx * Math.cos(rz) - py * Math.sin(rz), x * sx * Math.sin(rz) + py * Math.cos(rz), pz];
  }));
}

export function bar(x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0): WeaponFace[] {
  return move(transform(block(0, 0, 0, sx, sy, sz), 1, 1, 1, 0, rz), x, y, z);
}

export function hoop(x: number, y: number, z: number, width: number, height: number, thickness: number): WeaponFace[] {
  return [block(x - width, y, z, thickness, height, thickness), block(x + width, y, z, thickness, height, thickness),
    block(x, y + height, z, width, thickness, thickness), block(x, y - height, z, width, thickness, thickness)].flat();
}
