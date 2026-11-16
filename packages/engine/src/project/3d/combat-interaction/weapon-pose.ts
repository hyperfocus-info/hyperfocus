import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import { poseContactArm } from '../combat-visuals/contact-pose.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import type { CombatInteractions } from './config.ts';
import type { createCombatInteractions } from './session.ts';
import { sampleCombatAttackPose } from '../combat-visuals/attack-pose.ts';

type State = ReturnType<ReturnType<typeof createCombatInteractions>['capture']>;
type Point = [number, number, number];

/** The grip and blade share a fixed-tick arc; the contact frame points at the opponent. */
export function heldWeaponPose(frame: Hyperfocus3DEvaluatedFrame, item: State['weapons'][number], owner: CombatSnapshot['fighters'][number], config?: CombatConfig, weapon?: CombatInteractions['weapons'][number]): [Point, Point] {
  const yaw = atan2(owner.facing.x, owner.facing.z), move = config?.moves.find(move => move.id === owner.moveId);
  if (move?.weaponAttack) return roleWeaponPose(frame, item, owner, move, yaw);
  const heavy = owner.moveId === weapon?.heavyMoveId;
  const attacking = !!move && (owner.moveId === weapon?.lightMoveId || heavy);
  let sweep = -.3, lift = .12, extension = .1;
  if (attacking) {
    const startup = Math.min(1, owner.moveFrame / Math.max(1, move.startupFrames));
    const follow = Math.max(0, Math.min(1, (owner.moveFrame - move.startupFrames) / Math.max(1, move.activeFrames + move.recoveryFrames)));
    if (heavy) {
      // Chamber above the rear shoulder, strike downward, then finish across the body.
      const strike = Math.min(1, Math.max(0, (owner.moveFrame - move.startupFrames + 4) / 4));
      sweep = -.8 * startup * (1 - strike) + .7 * follow;
      lift = .85 * startup * (1 - strike) - .4 * follow;
      extension = .2 + .3 * strike * (1 - follow);
    } else {
      const strike = Math.min(1, Math.max(0, (owner.moveFrame - move.startupFrames + 3) / 3));
      sweep = -.3 * (1 - strike);lift = .05;
      extension = -.2 * startup * (1 - strike) + .45 * strike * (1 - follow);
    }
  }
  const dx = sin(yaw + sweep) * cos(lift), dy = sin(lift), dz = cos(yaw + sweep) * cos(lift);
  const start: Point = [owner.position.x + sin(yaw) * extension, owner.position.y + .35, owner.position.z + cos(yaw) * extension];
  const end: Point = [start[0] + dx * item.length, start[1] + dy * item.length, start[2] + dz * item.length];
  for (const [side, grip] of [[-1, .08], [1, .4]] as const) poseContactArm(frame, owner.id, side, yaw, [start[0] + dx * grip, start[1] + dy * grip, start[2] + dz * grip]);
  return [start, end];
}

function roleWeaponPose(frame: Hyperfocus3DEvaluatedFrame, item: State['weapons'][number], owner: CombatSnapshot['fighters'][number], move: NonNullable<CombatConfig['moves'][number]>, yaw: number): [Point, Point] {
  const pose = sampleCombatAttackPose(owner, move), t = Math.max(0, Math.min(1, owner.moveFrame / Math.max(1, Math.min(3, move.startupFrames))));
  const recovery = Math.max(0, Math.min(1, (owner.moveFrame - move.startupFrames - move.activeFrames) / Math.max(1, move.recoveryFrames)));
  const envelope = t * t * (3 - 2 * t) * (1 - recovery * recovery * (3 - 2 * recovery));
  const sweep = -.3 * (1 - envelope) + pose.yaw * .45 * envelope, lift = .12 * (1 - envelope);
  const dx = sin(yaw + sweep) * cos(lift), dy = sin(lift), dz = cos(yaw + sweep) * cos(lift);
  const ready: Point = [owner.position.x + sin(yaw) * .1 + sin(yaw - .3) * cos(.12) * item.length, owner.position.y + .35 + sin(.12) * item.length, owner.position.z + cos(yaw) * .1 + cos(yaw - .3) * cos(.12) * item.length];
  const localZ = pose.fist[2] + (1 - pose.force) * item.length * .6;
  const target: Point = [owner.position.x + pose.fist[0] * cos(yaw) + localZ * sin(yaw), owner.position.y + pose.fist[1], owner.position.z - pose.fist[0] * sin(yaw) + localZ * cos(yaw)];
  const end: Point = [ready[0] + (target[0] - ready[0]) * envelope, ready[1] + (target[1] - ready[1]) * envelope, ready[2] + (target[2] - ready[2]) * envelope];
  const start: Point = [end[0] - dx * item.length, end[1] - dy * item.length, end[2] - dz * item.length];
  for (const [side, grip] of [[-1, .08], [1, .4]] as const) poseContactArm(frame, owner.id, side, yaw, [start[0] + dx * grip, start[1] + dy * grip, start[2] + dz * grip]);
  return [start, end];
}

/** Cosmetics own the final arm pose; the shaft follows its gripping hand. */
export function attachWeaponToPosedHand(frame: Hyperfocus3DEvaluatedFrame, item: State['weapons'][number], owner: CombatSnapshot['fighters'][number]): [Point, Point] {
  const hand = frame.entities.find(entity => entity.id === `${owner.id}:right-hand`);
  const shaft = frame.entities.find(entity => entity.id === item.id);
  const point = hand?.position ?? [owner.position.x, owner.position.y + .35, owner.position.z];
  // Retain the evaluated attack/ready shaft axis while the cosmetic hand blends.
  // Replacing it with the forearm axis would snap the weapon at blend weight zero.
  const [x, y, z, w] = shaft?.rotation ?? [0, 0, 0, 1];
  let dx = shaft ? 2 * (x * y - w * z) : owner.facing.x;
  let dy = shaft ? 1 - 2 * (x * x + z * z) : 0;
  let dz = shaft ? 2 * (y * z + w * x) : owner.facing.z;
  let length = hypot(dx, dy, dz);
  if (length < .00001) { dx = owner.facing.x;dy = 0;dz = owner.facing.z;length = hypot(dx, dy, dz) || 1; }
  dx /= length;dy /= length;dz /= length;
  const grip = Math.min(.4, item.length * .4);
  const start: Point = [point[0]! - dx * grip, point[1]! - dy * grip, point[2]! - dz * grip];
  return [start, [start[0] + dx * item.length, start[1] + dy * item.length, start[2] + dz * item.length]];
}

/** Authored scars and splinters make saved durability and shortening visible. */
export function presentWeaponWear(entities: ReadonlyMap<string, Hyperfocus3DEvaluatedFrame['entities'][number]>, item: State['weapons'][number], state: State, tick: number, start: Point, end: Point, weapon?: CombatInteractions['weapons'][number]) {
  const wear = weapon ? 1 - item.durability / weapon.durability : 0;
  for (let index = 0; index < 3; index++) {
    const scar = entities.get(`${item.id}:wear:${index}`);
    if (!scar) continue;
    scar.visible = item.durability > 0 && wear >= (index + 1) * .2;
    if (!scar.visible) continue;
    const t = .35 + index * .19, x = start[0] + (end[0] - start[0]) * t, y = start[1] + (end[1] - start[1]) * t + .112, z = start[2] + (end[2] - start[2]) * t;
    poseCombatLimb(scar, [x - .07, y, z - .08], [x + .07, y + .008, z + .08], .025);
  }
  let split: State['trace'][number] | undefined;
  for (const entry of state.trace) if (entry.target === item.id && (entry.kind === 'weapon-shortened' || entry.kind === 'weapon-broken')) split = entry;
  const age = split ? tick - split.frame : 120;
  for (let index = 0; index < 3; index++) {
    const fragment = entities.get(`${item.id}:fragment:${index}`);
    if (!fragment) continue;
    fragment.visible = age >= 0 && age < 45;
    if (!fragment.visible) continue;
    const t = age / 60, side = index - 1;
    const origin = split?.position ?? item.position;
    const x = origin.x + side * t * 2, y = origin.y + t * 2 - 4.9 * t * t, z = origin.z + t * (index % 2 ? 1 : -1);
    poseCombatLimb(fragment, [x, y, z], [x + .15 * side, y + cos(age * .3 + index) * .35, z + sin(age * .3 + index) * .35], .11);
  }
}
