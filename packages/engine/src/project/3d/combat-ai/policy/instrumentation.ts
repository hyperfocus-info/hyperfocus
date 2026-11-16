import { isRecord } from '@hyperfocus/utilities/records';

export type CombatAiTuning = { mode?: 'baseline' | 'adaptive'; adaptation?: boolean; compression?: boolean; learningFrozen?: boolean; opponentId?: string; exploration?: number };
export type CombatAiProfile = (stage: 'features' | 'candidates' | 'scoring' | 'selection' | 'logging' | 'safety', milliseconds: number) => void;

/** Profiling is opt-in; disabled timers perform no clock reads. */
export function createDecisionTimer(profile?: CombatAiProfile) {
  let stage: Parameters<CombatAiProfile>[0] = 'features', started = 0, running = false;
  return {
    begin() { if (profile) { stage = 'features';started = performance.now();running = true; } },
    stage(next: typeof stage) {
      if (!profile || !running) return;
      const now = performance.now();profile(stage, now - started);stage = next;started = now;
    },
    end() { if (profile && running) { profile(stage, performance.now() - started);running = false; } },
  };
}

/** Ordinary play adapts continuously; baseline and frozen modes are explicit evaluation controls. */
export function readCombatAiTuning(value: unknown): CombatAiTuning {
  if (value === undefined) return { mode: 'adaptive', adaptation: true, compression: false };
  if (!isRecord(value)) throw new Error('Invalid combat AI tuning.');
  const row = value;
  if (Object.keys(row).some(key => !['mode', 'adaptation', 'compression', 'learningFrozen', 'opponentId', 'exploration'].includes(key))
    || row.mode !== undefined && row.mode !== 'baseline' && row.mode !== 'adaptive'
    || row.adaptation !== undefined && typeof row.adaptation !== 'boolean'
    || row.compression !== undefined && typeof row.compression !== 'boolean'
    || row.learningFrozen !== undefined && typeof row.learningFrozen !== 'boolean'
    || row.exploration !== undefined && (typeof row.exploration !== 'number' || !Number.isFinite(row.exploration) || row.exploration < 0 || row.exploration > 1)
    || row.opponentId !== undefined && (typeof row.opponentId !== 'string' || !row.opponentId || row.opponentId.length > 128)) throw new Error('Invalid combat AI tuning.');
  const mode = row.mode ?? 'adaptive';
  return { mode, adaptation: row.adaptation ?? mode === 'adaptive', compression: row.compression ?? false,
    ...(row.exploration === undefined ? {} : { exploration: row.exploration }),
    ...(row.learningFrozen === undefined ? {} : { learningFrozen: row.learningFrozen }), ...(row.opponentId === undefined ? {} : { opponentId: row.opponentId }) };
}
