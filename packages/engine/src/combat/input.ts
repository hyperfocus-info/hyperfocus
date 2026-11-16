import { cos, hypot, sin } from '../math/simulation.ts';
import type { CombatDirection, CombatMove, CombatVector } from './config.ts';
import type { CombatFighterState, CombatInput } from './state.ts';

export function sampleInput(fighter: CombatFighterState, input: CombatInput | undefined, directionMode?: 'forward-back') {
  const vector = { ...(input?.direction ?? { x: 0, y: 0, z: 0 }) };
  const length = hypot(vector.x, vector.y, vector.z);
  if (length > 1) { vector.x /= length; vector.y /= length; vector.z /= length; }
  const horizontal = hypot(vector.x, vector.z);
  const facingLength = hypot(fighter.facing.x, fighter.facing.z) || 1;
  const along = (vector.x * fighter.facing.x + vector.z * fighter.facing.z) / facingLength;
  const across = (vector.z * fighter.facing.x - vector.x * fighter.facing.z) / facingLength;
  let direction: CombatDirection = horizontal < 0.3 ? 'neutral' : Math.abs(along) >= horizontal * 0.7071067811865476 ? (along > 0 ? 'toward' : 'away') : 'side';
  if (directionMode === 'forward-back' && horizontal >= .3) direction = along >= 0 ? 'toward' : 'away';
  return { vector, direction, side: across < 0 ? -1 : 1 };
}

export function influenceImpulse(attacker: CombatFighterState, target: CombatFighterState, move: CombatMove, magnitude: number, hit: boolean, strength: number, impact = 1) {
  const angle = hit ? (move.impulseAngle ?? 0) * (move.direction === 'side' ? attacker.attackSide : 1) : 0;
  const cosine = cos(angle), sine = sin(angle);
  const result = { x: (attacker.facing.x * cosine - attacker.facing.z * sine) * magnitude,
    y: hit && move.downwardImpulse ? -move.downwardImpulse : attacker.facing.y * magnitude + (hit ? move.verticalImpulse ?? 0 : 0),
    z: (attacker.facing.x * sine + attacker.facing.z * cosine) * magnitude };
  result.x *= impact;result.y *= impact;result.z *= impact;
  return hit ? steerCombatImpulse(result, target.influenceDirection, strength) : result;
}

export function steerCombatImpulse(impulse: CombatVector, direction: CombatVector, strength: number) {
  const result = { ...impulse }, speed = hypot(result.x, result.y, result.z);
  if (speed === 0 || strength === 0) return result;
  // Only perpendicular input rotates launch: holding backward cannot erase or reverse it.
  const dot = (direction.x * result.x + direction.y * result.y + direction.z * result.z) / (speed * speed);
  result.x += (direction.x - dot * result.x) * speed * strength;
  result.y += (direction.y - dot * result.y) * speed * strength;
  result.z += (direction.z - dot * result.z) * speed * strength;
  const scale = speed / hypot(result.x, result.y, result.z);
  result.x *= scale; result.y *= scale; result.z *= scale;
  return result;
}
