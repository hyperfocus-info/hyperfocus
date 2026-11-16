import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import type { DirectedFighter } from './contract.ts';
import type { presentArtFighter } from '../pose.ts';
import { map3 } from '@hyperfocus/utilities/tuples';

type Point = [number, number, number];
type Rotation = [number, number, number, number];
function rotate(point: Point, q: Rotation): Point {
  const [x, y, z] = point, [a, b, c, w] = q;
  const tx = 2 * (b * z - c * y), ty = 2 * (c * x - a * z), tz = 2 * (a * y - b * x);
  return [x + w * tx + b * tz - c * ty, y + w * ty + c * tx - a * tz, z + w * tz + a * ty - b * tx];
}
function yaw(q: Rotation, angle: number): Rotation {
  const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
  return [q[0] * c - q[2] * s, q[1] * c + q[3] * s, q[2] * c + q[0] * s, q[3] * c - q[1] * s];
}

// Native +Y points toward the distal joint; authored garments use +Y proximally.
// Remove the primitive overlap padding before recovering the actual joint anchors.
function endpoints(entity: Hyperfocus3DEvaluatedFrame['entities'][number]): [Point, Point] {
  const axis = rotate([0, Math.max(0, entity.scale[1] - entity.scale[0] * .35), 0], entity.rotation);
  return [map3(entity.position, (value, index) => value - axis[index]!),
    map3(entity.position, (value, index) => value + axis[index]!)];
}

function segment(entity: Hyperfocus3DEvaluatedFrame['entities'][number], start: Point, end: Point, restLength: number) {
  const dx = start[0] - end[0], dy = start[1] - end[1], dz = start[2] - end[2], length = Math.hypot(dx, dy, dz);
  const norm = Math.hypot(dz, -dx, length + dy);
  entity.position = map3(start, (value, index) => (value + end[index]!) / 2);
  entity.rotation = norm < .00001 ? [1, 0, 0, 0] : [dz / norm, 0, -dx / norm, (length + dy) / norm];
  entity.scale = [1, length / restLength, 1];entity.visible = true;
}

/** Skin the final native corpse/recovery pose; its torso is no longer a standing root. */
export function presentDirectedKnockout(frame: Hyperfocus3DEvaluatedFrame, fighter: DirectedFighter) {
  const source = (suffix: string) => {
    const part = frame.entities.find(entity => entity.id === fighter.entityId + suffix);
    if (!part) throw Error(`Knockout presentation is missing ${fighter.entityId}${suffix}.`);
    return part;
  };
  const torso = source(''), head = source(':head');
  for (const rest of fighter.rest) {
    const target = frame.entities.find(entity => entity.id === rest.id)!;
    const suffix = rest.id.slice(fighter.rigId.length + 1);
    const headPart = /^(head|hair|nose|mouth|brow:|eye:|eye-light:)/.test(suffix);
    const owner = headPart ? head : torso;
    const pivot: Point = [0, headPart ? 1.855 : fighter.rootHeight, 0];
    const local: Point = [rest.position[0] - pivot[0], rest.position[1] - pivot[1], rest.position[2] - pivot[2]];
    const translated = rotate(local, owner.rotation);
    target.position = [owner.position[0] + translated[0], owner.position[1] + translated[1], owner.position[2] + translated[2]];
    target.rotation = yaw(owner.rotation, rest.rotationY); target.scale = [...rest.scale]; target.visible = true;
  }
  const measurements: ReturnType<typeof presentArtFighter> = [];
  const neck = frame.entities.find(entity => entity.id === `${fighter.rigId}:neck`);
  if (neck) {
    const collar = map3(rotate([0, 1.665 - fighter.rootHeight, 0], torso.rotation), (value, index) => value + torso.position[index]!);
    const jaw = map3(rotate([0, -.112, 0], head.rotation), (value, index) => value + head.position[index]!);
    segment(neck, jaw, collar, .113);
    // The approved neck mesh is authored in model coordinates, not about zero.
    const offset = rotate([0, 1.6915 * neck.scale[1], 0], neck.rotation);
    neck.position = map3(neck.position, (value, index) => value - offset[index]!);
  }
  for (const side of ['left', 'right']) {
    const limb = (part: string, native: string, length: number) => {
      const target = frame.entities.find(entity => entity.id === `${fighter.rigId}:${side}-${part}`)!, original = source(`:${side}-${native}`);
      const [start, end] = endpoints(original);segment(target, start, end, length);
    };
    limb('sleeve', 'arm', Math.hypot(.105, .255, .035));
    limb('forearm', 'forearm', Math.hypot(.045, .26, .025));
    limb('thigh', 'thigh', Math.hypot(.045, .4935, .02));
    limb('shin', 'shin', Math.hypot(.035, .4165, .02));
    const hand = source(`:${side}-hand`), boot = source(`:${side}-boot`);
    for (const suffix of ['hand', 'thumb', 'wrist-wrap', 'knuckle-folds', 'shoe', 'sole', 'boot-detail']) {
      const target = frame.entities.find(entity => entity.id === `${fighter.rigId}:${side}-${suffix}`);
      if (!target) continue;
      const owner = suffix === 'shoe' || suffix === 'sole' || suffix === 'boot-detail' ? boot : hand;
      const local: Point = suffix === 'shoe' || suffix === 'sole' || suffix === 'boot-detail' ? [0, -.115, 0] : suffix === 'thumb' ? [side === 'left' ? .054 : -.054, .027, .037] : [0, 0, 0];
      const translated = rotate(local, owner.rotation);
      target.position = [owner.position[0] + translated[0], owner.position[1] + translated[1], owner.position[2] + translated[2]];
      target.rotation = [...owner.rotation]; target.scale = [1, 1, 1]; target.visible = true;
    }
    measurements.push({ side, foot: [...boot.position], ankle: [...boot.position], knee: endpoints(source(`:${side}-shin`))[0], hip: endpoints(source(`:${side}-thigh`))[0], wrist: [...hand.position], elbow: endpoints(source(`:${side}-forearm`))[0], shoulder: endpoints(source(`:${side}-arm`))[0], armClamped: false, legClamped: false });
  }
  return measurements;
}
