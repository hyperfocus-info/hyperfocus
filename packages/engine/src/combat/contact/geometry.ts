import type { CombatMove } from '../config.ts';
import type { CombatFighterState } from '../state.ts';
import { cos, hypot, sin } from '../../math/simulation.ts';

/** A finite planar sector extruded vertically; the hurt sphere rounds its boundary. */
export function overlapsAttackSector(attacker: CombatFighterState, target: CombatFighterState, move: CombatMove, hurtRadius: number, reach: number, degrees: number) {
  const facing = hypot(attacker.facing.x, attacker.facing.z);
  if (!facing) return false;
  const x = target.position.x - attacker.position.x, z = target.position.z - attacker.position.z;
  const along = (x * attacker.facing.x + z * attacker.facing.z) / facing;
  const across = Math.abs((z * attacker.facing.x - x * attacker.facing.z) / facing);
  const distance = hypot(along, across), half = degrees * Math.PI / 360;
  const c = cos(half), s = sin(half);
  let nearestAlong: number, nearestAcross: number;
  if (along >= distance * c) {
    const length = Math.min(distance, reach), scale = distance ? length / distance : 0;
    nearestAlong = along * scale;nearestAcross = across * scale;
  } else {
    const length = Math.max(0, Math.min(reach, along * c + across * s));
    nearestAlong = length * c;nearestAcross = length * s;
  }
  const dx = along - nearestAlong, dz = across - nearestAcross;
  const centerY = attacker.position.y + hypot(nearestAlong, nearestAcross) * attacker.facing.y / facing;
  const gap = target.position.y - centerY;
  const dy = gap < -move.hitRadius ? gap + move.hitRadius : Math.max(0, gap - (move.hitHeight ?? 0) - move.hitRadius);
  return dx * dx + dy * dy + dz * dz <= hurtRadius * hurtRadius + 1e-12;
}
