import type { CombatVector } from '../../../combat/config.ts';

export type CombatTraversalPlan = { surfaceId: string; point: CombatVector; takeoff: CombatVector; phase: 'approach' | 'launch' | 'air' | 'drop'; wait: number };
export type CombatTraversalRequest = { fighterId: string; targetId: string; grounded: boolean; stamina: number; delay: number; plan?: CombatTraversalPlan };
export type CombatTraversalDecision = { plan?: CombatTraversalPlan; direction: CombatVector; jump: boolean };

/** Optional AI save field; old saves resume without a committed traversal. */
export function readCombatTraversalPlan(value: unknown): CombatTraversalPlan | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !('surfaceId' in value) || typeof value.surfaceId !== 'string' || value.surfaceId.length > 160 || !('phase' in value) || !('wait' in value) || typeof value.wait !== 'number' || !Number.isInteger(value.wait) || value.wait < 0 || value.wait > 120 || !('point' in value) || !('takeoff' in value)) throw new Error('Invalid AI traversal plan.');
  const phase = value.phase;
  if (phase !== 'approach' && phase !== 'launch' && phase !== 'air' && phase !== 'drop') throw new Error('Invalid AI traversal phase.');
  const vector = (raw: unknown): CombatVector => {
    if (!raw || typeof raw !== 'object' || !('x' in raw) || !('y' in raw) || !('z' in raw) || typeof raw.x !== 'number' || typeof raw.y !== 'number' || typeof raw.z !== 'number' || ![raw.x, raw.y, raw.z].every(n => Number.isFinite(n) && Math.abs(n) <= 1e6)) throw new Error('Invalid AI traversal point.');
    return { x: raw.x, y: raw.y, z: raw.z };
  };
  return { surfaceId: value.surfaceId, phase, wait: value.wait, point: vector(value.point), takeoff: vector(value.takeoff) };
}
