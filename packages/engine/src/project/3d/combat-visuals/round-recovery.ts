import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import { clamp01 as clamp } from "@hyperfocus/utilities/math";
import { map3, map4 } from '@hyperfocus/utilities/tuples';
import type { CombatVector } from '../../../combat/config.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import type { AppearanceStyle3D, ResolvedAppearancePose3D } from '../appearance/catalog.ts';
import { createAppearancePosePresenter3D } from '../appearance/pose.ts';
import { poseContactArm, poseContactLeg } from './contact-pose.ts';
import { poseCombatLimb } from './effects.ts';
import { presentCombatCamera3D } from './camera.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];


const bodyPart = /:(head|hair|face|belt|(?:left|right)-(?:hand|arm|forearm|thigh|shin|boot))$/;

/** Cosmetic recovery overlays the live KO rig, ending at the exact resumed body center. */
export function createCombatRoundRecovery3D() {
  const victory = createAppearancePosePresenter3D();
  const bases = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity>>();
  return (options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; ticks: number; winnerId: string; targets: ReadonlyMap<string, CombatVector>; poses?: readonly ResolvedAppearancePose3D[]; styles?: readonly (AppearanceStyle3D & { actorId: string })[]; reducedMotion?: boolean; viewportAspect?: number; allowRecovery?: boolean; celebrate?: boolean }) => {
    const { frame, state, ticks, winnerId, targets } = options;
    let originals = bases.get(frame);
    if (!originals) { originals = new Map(frame.entities.filter(entity => state.fighters.some(fighter => entity.id === fighter.id || entity.id.startsWith(fighter.id + ':') && bodyPart.test(entity.id))).map(entity => [entity.id, structuredClone(entity)]));bases.set(frame, originals); }
    for (const fighter of state.fighters) for (const entity of frame.entities) {
      if (entity.id !== fighter.id && (!entity.id.startsWith(fighter.id + ':') || !bodyPart.test(entity.id))) continue;
      const base = originals.get(entity.id)!;entity.position = [...base.position];entity.rotation = [...base.rotation];entity.scale = [...base.scale];entity.visible = base.visible;
    }
    if (winnerId && options.celebrate) {
      const selected = options.poses?.find(pose => pose.actorId === winnerId && pose.phase === 'victory');
      victory({ frame, actorId: winnerId, style: selected && selected.style !== 'default' ? selected.style : 'fists-up', progress: 1, settle: smooth((180 - ticks) / 30) });
    }
    if (options.allowRecovery === false) return;
    const progress = clamp((90 - ticks) / 90);
    if (!progress) return;
    for (const fighter of state.fighters) {
      if (fighter.health > 0 || fighter.id === winnerId) {
        const opponent = state.fighters.find(other => other.id !== fighter.id);
        if (opponent) turnStandingFighter(frame, fighter.id, targets.get(opponent.id) ?? opponent.position, smooth(progress));
        continue;
      }
      const target = targets.get(fighter.id), root = frame.entities.find(entity => entity.id === fighter.id);
      if (!root || !target) continue;
      const selected = options.styles?.find(style => style.actorId === fighter.id && style.channel === 'recovery')?.style ?? 'stand-up';
      const opponent = state.fighters.find(other => other.id !== fighter.id);
      const facing = atan2(fighter.facing.x, fighter.facing.z);
      const opponentPoint = opponent && (targets.get(opponent.id) ?? opponent.position);
      const readyFacing = opponentPoint ? atan2(opponentPoint.x - target.x, opponentPoint.z - target.z) : facing;
      const turn = atan2(sin(readyFacing - facing), cos(readyFacing - facing));
      const origin = originals.get(fighter.id)!.position;
      const travel = hypot(target.x - origin[0], target.z - origin[2]);
      const moving = travel > .15;
      const travelFacing = moving ? atan2(target.x - origin[0], target.z - origin[2]) : facing;
      const travelTurn = atan2(sin(readyFacing - travelFacing), cos(readyFacing - travelFacing));
      const yaw = moving ? travelFacing + travelTurn * smooth((progress - .55) / .45) : facing + turn * smooth(progress);
      const point = { x: origin[0] + (target.x - origin[0]) * smooth(progress), y: target.y, z: origin[2] + (target.z - origin[2]) * smooth(progress) };
      // A clearance move belongs to the whole get-up, not its short pose-entry blend.
      // Show an evasive roll for the baseline style instead of sliding a standing rig.
      const style = options.reducedMotion ? 'stand-up' : moving && selected === 'stand-up' ? 'roll-up' : selected;
      poseRecovery(frame, fighter.id, point, yaw, style, progress);
      const blend = smooth(progress / .18);
      for (const entity of frame.entities) {
        if (entity.id !== fighter.id && (!entity.id.startsWith(fighter.id + ':') || !bodyPart.test(entity.id))) continue;
        const base = originals.get(entity.id)!;
        if (/:(left|right)-(arm|forearm|thigh|shin)$/.test(entity.id)) {
          // Blending box centers and rotations independently separates their shared
          // knee/elbow anchors. Interpolate the joints, then reconstruct each bone.
          const from = limbEndpoints(base), to = limbEndpoints(entity);
          const points = to.map((point, end) => map3(point, (value, axis) => from[end]![axis]! + (value - from[end]![axis]!) * blend));
          poseCombatLimb(entity, points[0]!, points[1]!, 2 * (base.scale[0] + (entity.scale[0] - base.scale[0]) * blend));
          continue;
        }
        entity.position = map3(entity.position, (value, index) => base.position[index]! + (value - base.position[index]!) * blend);
        const sign = entity.rotation.reduce((sum, value, index) => sum + value * base.rotation[index]!, 0) < 0 ? -1 : 1;
        const q = map4(entity.rotation, (value, index) => base.rotation[index]! * (1 - blend) + value * sign * blend);
        const length = hypot(...q) || 1;entity.rotation = map4(q, value => value / length);
      }
      if (!options.reducedMotion) recoveryParticles(frame, fighter.id, point, progress, selected === 'materialize');
    }
    // Fit the rising visual body, not the still-fallen collision rig. Otherwise
    // the camera jumps to standing height on the first resumed simulation tick.
    // Wardrobe previews omit the aspect and retain their own camera composition.
    if (options.viewportAspect !== undefined) presentCombatCamera3D({ frame, state, viewportAspect: options.viewportAspect, reducedMotion: true });
  };
}

function limbEndpoints(entity: Entity): [Entity['position'], Entity['position']] {
  const [x, y, z, w] = entity.rotation, half = Math.max(0, entity.scale[1] - entity.scale[0] * .35);
  const axis = [2 * (x * y - z * w) * half, (1 - 2 * (x * x + z * z)) * half, 2 * (y * z + x * w) * half];
  return [map3(entity.position, (value, index) => value - axis[index]!),
    map3(entity.position, (value, index) => value + axis[index]!)];
}

function turnStandingFighter(frame: Hyperfocus3DEvaluatedFrame, id: string, target: CombatVector, progress: number) {
  const root = frame.entities.find(entity => entity.id === id);
  if (!root || hypot(target.x - root.position[0], target.z - root.position[2]) < .00001) return;
  const [x, y, z, w] = root.rotation, origin = [...root.position];
  const yaw = atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  const desired = atan2(target.x - origin[0]!, target.z - origin[2]!);
  const turn = atan2(sin(desired - yaw), cos(desired - yaw)) * progress;
  const c = cos(turn), s = sin(turn), halfC = cos(turn / 2), halfS = sin(turn / 2);
  for (const entity of frame.entities) {
    if (entity.id !== id && (!entity.id.startsWith(id + ':') || !bodyPart.test(entity.id))) continue;
    const dx = entity.position[0] - origin[0]!, dz = entity.position[2] - origin[2]!;
    entity.position[0] = origin[0]! + dx * c + dz * s;entity.position[2] = origin[2]! - dx * s + dz * c;
    const [qx, qy, qz, qw] = entity.rotation;
    entity.rotation = [halfC * qx + halfS * qz, halfC * qy + halfS * qw, halfC * qz - halfS * qx, halfC * qw - halfS * qy];
  }
}

function poseRecovery(frame: Hyperfocus3DEvaluatedFrame, id: string, target: CombatVector, yaw: number, style: string, progress: number) {
  const root = frame.entities.find(entity => entity.id === id)!;
  const rise = smooth((progress - .15) / .85), crouch = 1 - rise;
  const flip = style === 'kip-up' ? -Math.PI * sin(Math.PI * smooth(progress)) : style === 'roll-up' ? Math.PI * 1.4 * (1 - smooth(progress)) : .6 * crouch;
  const hop = style === 'kip-up' ? .42 * sin(Math.PI * rise) : 0;
  root.position = [target.x, target.y - .62 * crouch + hop, target.z];
  const sx = sin(flip / 2), cx = cos(flip / 2), sy = sin(yaw / 2), cy = cos(yaw / 2);
  root.rotation = [cy * sx, sy * cx, -sy * sx, cy * cx];root.scale = [1, 1, 1];
  const point = (x: number, y: number, z: number): Entity['position'] => {
    const py = y * cos(flip) - z * sin(flip), pz = y * sin(flip) + z * cos(flip);
    return [root.position[0] + x * cos(yaw) + pz * sin(yaw), root.position[1] + py, root.position[2] - x * sin(yaw) + pz * cos(yaw)];
  };
  for (const [name, x, y, z] of [['head', 0, .78, 0], ['hair', 0, 1, -.02], ['face', 0, .76, .22], ['belt', 0, -.17, 0]] as const) {
    const entity = frame.entities.find(item => item.id === `${id}:${name}`);
    if (entity) { entity.position = point(x, y, z);entity.rotation = [...root.rotation]; }
  }
  for (const side of [-1, 1]) {
    poseContactArm(frame, id, side, yaw, point(side * (.46 - crouch * .12), .2 - crouch * .42, .28 + crouch * .2), point(side * .32, .38, 0));
    poseContactLeg(frame, id, side, yaw, point(side * .19, -.54 + crouch * .3, .08 + crouch * .34), point(side * .18, -.82 + crouch * .62, .06), point(side * .16, -.26, 0));
  }
  if (style === 'roll-up') {
    let bottom = root.position[1] - .45 * Math.abs(cos(flip)) - .25 * Math.abs(sin(flip));
    for (const entity of frame.entities) {
      if (!entity.id.startsWith(id + ':')) continue;
      const radius = entity.id.endsWith(':head') ? .25 : /-(hand|boot)$/.test(entity.id) ? .12 : 0;
      if (radius) bottom = Math.min(bottom, entity.position[1] - radius);
    }
    const lift = Math.max(0, target.y - .94 - bottom);
    for (const entity of frame.entities) if (entity.id === id || entity.id.startsWith(id + ':') && bodyPart.test(entity.id)) entity.position[1] += lift;
  }
  if (style === 'materialize') {
    const scale = .08 + .92 * smooth(progress / .65);
    for (const entity of frame.entities) if (entity.id === id || entity.id.startsWith(id + ':') && bodyPart.test(entity.id)) entity.scale = map3(entity.scale, value => value * scale);
  }
}

function recoveryParticles(frame: Hyperfocus3DEvaluatedFrame, id: string, target: CombatVector, progress: number, materialize: boolean) {
  const fade = sin(Math.PI * progress);
  for (let index = 0; index < 12; index++) {
    const entity = frame.entities.find(item => item.id === `${id}:spark:${index}`);
    if (!entity) continue;
    const angle = index * Math.PI / 6 + (materialize ? progress * Math.PI * 2 : 0), radius = .4 + progress * .85;
    const y = target.y - .86 + (materialize ? (index % 3) * .45 * fade : .08);
    poseCombatLimb(entity, [target.x + cos(angle) * radius, y, target.z + sin(angle) * radius],
      [target.x + cos(angle) * (radius + .16 * fade), y + (materialize ? .2 * fade : .025), target.z + sin(angle) * (radius + .16 * fade)], .035 * fade);
  }
}
