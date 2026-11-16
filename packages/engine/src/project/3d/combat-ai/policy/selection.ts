import { object } from '../../gameplay-contracts.ts';

export type TacticalCandidate = { id: string; score: number; styleScore?: number; moveId?: string; probe?: boolean; priority?: boolean; contactFrames?: number; reach?: number; duration?: number; movement?: 'toward' | 'away' | 'flank'; sprint?: boolean; dash?: boolean; jump?: boolean; grapple?: boolean };
export type TacticalMemory = { random: number; choice: string; until: number; serial: number };
export const initialPolicy = (): TacticalMemory => ({ random: 0, choice: '', until: 0, serial: -1 });

/** Difficulty changes decision noise, not the set of legal commands. */
export function candidateProbabilities(candidates: readonly TacticalCandidate[], difficulty: number, exploration = 0) {
  if (!candidates.length) return [];
  const priority = candidates.some(candidate => candidate.priority);
  const temperature = .45 + (9 - difficulty) * .25;
  const best = Math.max(...candidates.map(candidate => !priority || candidate.priority ? candidate.score : -Infinity));
  const weights = candidates.map(candidate => priority && !candidate.priority ? 0 : Math.exp(Math.max(-30, (candidate.score - best) / temperature)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const eligible = priority ? candidates.filter(candidate => candidate.priority).length : candidates.length;
  return weights.map((weight, index) => priority && !candidates[index]!.priority ? 0 : (1 - exploration) * weight / total + exploration / eligible);
}

export function chooseTactic(memory: TacticalMemory, candidates: readonly TacticalCandidate[], difficulty: number, tick: number, serial: number, seed: number, exploration = 0) {
  if (!candidates.length) return undefined;
  const current = candidates.find(candidate => candidate.id === memory.choice);
  const best = Math.max(...candidates.map(candidate => candidate.score));
  // Movement has a short intent window; visible new punish opportunities and
  // obsolete candidates interrupt it. Attacks remain subject to engine gates.
  if (current && (!candidates.some(candidate => candidate.priority) || current.priority) && memory.serial === serial && tick < memory.until && current.score >= best - 2) return current;
  let random = memory.random || seed || 1;
  random ^= random << 13;random ^= random >>> 17;random ^= random << 5;memory.random = random >>> 0;
  let draw = memory.random / 0x100000000;
  const probabilities = candidateProbabilities(candidates, difficulty, exploration);
  let index = 0;
  for (; index < candidates.length - 1; index++) { draw -= probabilities[index]!;if (draw < 0 && probabilities[index]! > 0) break; }
  const selected = candidates[index]!;
  memory.choice = selected.id;memory.serial = serial;memory.until = tick + (selected.movement ? 12 : 6);
  return selected;
}

export function readPolicy(value: unknown): TacticalMemory {
  if (value === undefined) return initialPolicy();
  const row = object(value);
  if (Object.keys(row).some(key => !['random', 'choice', 'until', 'serial'].includes(key))
    || typeof row.choice !== 'string' || row.choice.length > 160
    || typeof row.random !== 'number' || !Number.isSafeInteger(row.random) || row.random < 0 || row.random > 0xffffffff
    || typeof row.until !== 'number' || !Number.isSafeInteger(row.until) || row.until < 0
    || typeof row.serial !== 'number' || !Number.isSafeInteger(row.serial) || row.serial < -1) throw new Error('Invalid AI tactical policy memory.');
  return { random: row.random, choice: row.choice, until: row.until, serial: row.serial };
}
