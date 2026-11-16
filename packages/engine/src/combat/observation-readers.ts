import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import type { CombatVector } from './config.ts';
import type { CombatEvent, CombatInput } from './state.ts';

export const COMBAT_EVENT_KINDS = ['hit', 'block', 'parry', 'guard-break', 'tech', 'bounce', 'escape'] as const;

/** Detached observation values; configuration and fighter ownership belong to the simulation. */
export function readCombatVector(value: unknown): CombatVector {
  const row = requireRecord(value);
  return { ...row, x: requireNumber(row.x), y: requireNumber(row.y), z: requireNumber(row.z) };
}

export function readCombatInput(value: unknown): CombatInput {
  const row = requireRecord(value);
  const result: CombatInput = { fighterId: requireText(row.fighterId) };
  for (const key of ['pressed', 'held'] as const) if (row[key] !== undefined) result[key] = requireArray(row[key]).map(value => requireText(value));
  for (const key of ['guard', 'guardFresh', 'tech', 'dashing', 'dashStart', 'drive', 'airborne', 'idle'] as const) if (row[key] !== undefined) result[key] = requireBoolean(row[key]);
  for (const key of ['direction', 'influenceDirection'] as const) if (row[key] !== undefined) result[key] = readCombatVector(row[key]);
  if (row.locomotionCost !== undefined) result.locomotionCost = requireNumber(row.locomotionCost);
  return structuredClone({ ...row, ...result });
}

export function readCombatEvent(value: unknown): CombatEvent {
  const row = requireRecord(value);
  const result: CombatEvent = { id: requireText(row.id), frame: requireNumber(row.frame), moveId: requireText(row.moveId),
    attackerId: requireText(row.attackerId), targetId: requireText(row.targetId), kind: requireOneOf(row.kind, COMBAT_EVENT_KINDS),
    damage: requireNumber(row.damage), impulse: readCombatVector(row.impulse) };
  for (const key of ['guardDamage', 'hitstunFrames'] as const) if (row[key] !== undefined) result[key] = requireNumber(row[key]);
  for (const key of ['contactPoint', 'contactNormal', 'baseImpulse'] as const) if (row[key] !== undefined) result[key] = readCombatVector(row[key]);
  for (const key of ['counter', 'armored'] as const) if (row[key] !== undefined) result[key] = requireOneOf(row[key], [true]);
  if (row.environmentId !== undefined) result.environmentId = requireText(row.environmentId);
  if (row.defenseReason !== undefined) result.defenseReason = requireOneOf(row.defenseReason, ['guard-not-held', 'outside-guard-arc', 'guard-broken', 'attack-commitment', 'hit-recoil', 'parry-recoil', 'fresh-parry', 'held-block', 'surface-recovery', 'missed-surface-recovery', 'grapple-teched', 'grapple-not-teched', 'traffic-impact', 'fire-exposure', 'out-of-bounds']);
  return structuredClone({ ...row, ...result });
}
