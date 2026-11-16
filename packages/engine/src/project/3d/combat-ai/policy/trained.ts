import { object } from '../../gameplay-contracts.ts';
import type { TacticalCandidate } from './selection.ts';

/** Portable learned score offsets. Hosts own training, evaluation and storage. */
export type CombatAiPolicy = { version: 1; id: string; scores: Record<string, number> };
const movements = new Set(['grapple', 'approach', 'sprint', 'dash', 'flank', 'jump', 'space', 'recover']);

export function createCombatAiPolicy(options: { id: string; scores: Readonly<Record<string, number>> }): CombatAiPolicy {
  return readCombatAiPolicy({ version: 1, id: options.id, scores: options.scores })!;
}

/** Undefined is the baseline policy and supports checkpoints predating training. */
export function readCombatAiPolicy(value: unknown): CombatAiPolicy | undefined {
  if (value === undefined) return undefined;
  const row = object(value), scores = object(row.scores), keys = Object.keys(scores);
  if (Object.keys(row).some(key => !['version', 'id', 'scores'].includes(key)) || row.version !== 1
    || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 160 || keys.length > 64)
    throw new Error('Invalid trained combat AI policy.');
  const copy: Record<string, number> = {};
  for (const key of keys) {
    const score = scores[key];
    if (key.length > 160 || !movements.has(key) && !/^(attack|dash):[^\s:]+$/.test(key)
      || typeof score !== 'number' || !Number.isFinite(score) || score < -2 || score > 2)
      throw new Error('Invalid trained combat AI policy score.');
    copy[key] = score;
  }
  return { version: 1, id: row.id, scores: copy };
}

/** Called once for each fresh candidate pool, after ordinary legality filters. */
export function applyCombatAiPolicy(candidates: TacticalCandidate[], policy: CombatAiPolicy | undefined) {
  if (policy) for (const candidate of candidates) candidate.score += policy.scores[candidate.id] ?? 0;
}
