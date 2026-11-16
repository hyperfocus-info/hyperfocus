import type { CombatVector } from '../../../../combat/config.ts';
import { hypot } from '../../../../math/simulation.ts';
import { object } from '../../gameplay-contracts.ts';

type Attempt = { x: number; y: number; z: number; distance: number; health: number; tick: number; airborne: boolean };
export type CombatAiJumping = { retryAt: number; failures: number; attempt?: Attempt };
export const initialJumping = (): CombatAiJumping => ({ retryAt: 0, failures: 0 });

/** Remember observed movement outcomes, never grant a movement permission. */
export function observeJumping(memory: CombatAiJumping, tick: number, grounded: boolean, body: CombatVector, distance: number, health: number) {
  const attempt = memory.attempt;
  if (!attempt) return;
  if (!grounded) attempt.airborne = true;
  if (!(grounded && (attempt.airborne || tick - attempt.tick >= 24)) && tick - attempt.tick < 240) return;
  const progress = body.y > attempt.y + .5 || hypot(body.x - attempt.x, body.z - attempt.z) > 1 && distance < attempt.distance - 1 || health < attempt.health;
  memory.failures = progress ? Math.max(0, memory.failures - 1) : Math.min(4, memory.failures + 1);
  memory.retryAt = tick + (progress ? 24 : 90 + memory.failures * 30);
  delete memory.attempt;
}

export function canJump(memory: CombatAiJumping, tick: number, body: CombatVector, wall: boolean) {
  if (tick < memory.retryAt) return false;
  const attempt = memory.attempt;
  // A new contacted wall can extend a useful jump. Repeated requests on the
  // same immobile contact cannot keep restarting the same failed jump choice.
  return !attempt || wall && tick - attempt.tick >= 18 && hypot(body.x - attempt.x, body.y - attempt.y, body.z - attempt.z) > 1.5;
}

export function recordJump(memory: CombatAiJumping, tick: number, body: CombatVector, distance: number, health: number) {
  memory.attempt = { x: body.x, y: body.y, z: body.z, distance, health, tick, airborne: false };
}

export function readJumping(value: unknown): CombatAiJumping {
  if (value === undefined) return initialJumping();
  const row = object(value);
  const integer = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (Object.keys(row).some(key => !['retryAt', 'failures', 'attempt'].includes(key)) || !integer(row.retryAt, Number.MAX_SAFE_INTEGER) || !integer(row.failures, 4)) throw new Error('Invalid AI jump memory.');
  let attempt: Attempt | undefined;
  if (row.attempt !== undefined) {
    const a = object(row.attempt);
    const { x, y, z, distance, health } = a;
    const coordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
    if (Object.keys(a).some(key => !['x', 'y', 'z', 'distance', 'health', 'tick', 'airborne'].includes(key)) || !integer(a.tick, Number.MAX_SAFE_INTEGER) || typeof a.airborne !== 'boolean'
      || !coordinate(x) || !coordinate(y) || !coordinate(z) || !coordinate(distance) || !coordinate(health)
      || distance < 0 || health < 0) throw new Error('Invalid AI jump attempt.');
    attempt = { x, y, z, distance, health, tick: a.tick, airborne: a.airborne };
  }
  return { retryAt: row.retryAt, failures: row.failures, ...(attempt ? { attempt } : {}) };
}
