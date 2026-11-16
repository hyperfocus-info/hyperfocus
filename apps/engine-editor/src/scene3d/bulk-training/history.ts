import { z } from 'zod';
import type { BulkTotals } from './pool.ts';
import { readPolicyExperiment } from '@hyperfocus/touch-of-death/learning/experiment';
import { readPendingTrialResults } from './learning/scheduler.ts';
import { readTrialEvidenceList } from '@hyperfocus/touch-of-death/trial-evidence';
import { readPipelineHistory } from './learning/pipeline-history.ts';
import { contextualHistory, readContextualHistory } from './adaptation/history.ts';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const amount = z.number().finite().nonnegative();
const historySchema = z.object({
  contentIdentity: z.string(), runSeed: count.max(0xffffffff).optional(), droppedMoveSummaries: count.optional(),
  fights: count, p1Wins: count, p2Wins: count, draws: count, capped: count, ticks: count,
  insights: z.array(z.string().max(512)).max(12),
  moves: z.array(z.object({ moveId: z.string().max(160), hits: amount, damage: amount,
    whiffs: amount, blocked: amount, parried: amount }).passthrough()).max(64),
  benchmark: z.object({ sets: count, points: amount, capped: count }).strict()
    .refine(value => value.points <= value.sets && Number.isInteger(value.points * 2)).optional(),
}).passthrough();

/** Keep totals and evaluation evidence; evict oldest detailed samples at the storage limit. */
export function serializeBulkHistory(options: { identity: string; totals: BulkTotals & { runSeed?: number } }) {
  const value = { contentIdentity: options.identity, ...options.totals, contextual: contextualHistory(options.totals.contextual), trials: options.totals.trials && [...options.totals.trials], experiments: options.totals.experiments && structuredClone(options.totals.experiments) };
  let text = JSON.stringify(value);
  while (text.length > 262144 && value.trials?.length) { value.trials.shift();text = JSON.stringify(value); }
  while (text.length > 262144 && value.experiments?.recent.length) { value.experiments.recent.shift();value.experiments.omitted++;text = JSON.stringify(value); }
  while (text.length > 262144 && value.experiments?.pending.length) { value.experiments.pending.pop();value.experiments.pendingOmitted = (value.experiments.pendingOmitted ?? 0) + 1;text = JSON.stringify(value); }
  if (text.length > 262144) throw Error('Training summary exceeds its storage limit.');
  return text;
}

export function readBulkHistory(identity: string, storage?: Pick<Storage, 'getItem'>): (BulkTotals & { runSeed?: number }) | undefined {
  try {
    const text = (storage ?? localStorage).getItem('tod-bulk-last-run');if (!text || text.length > 262144) return;
    const value = historySchema.parse(JSON.parse(text));
    if (value.contentIdentity !== identity || value.p1Wins + value.p2Wins + value.draws !== value.fights) return;
    const learning = value.learning === undefined ? undefined : readPolicyExperiment(value.learning);
    const benchmark = value.benchmark;
    const experiments = readPipelineHistory(value.experiments);
    if (value.pendingTrialResults !== undefined && !learning) return;
    const pendingTrialResults = value.pendingTrialResults === undefined ? undefined : readPendingTrialResults({ learning: learning!, value: value.pendingTrialResults });
    return { fights: value.fights, p1Wins: value.p1Wins, p2Wins: value.p2Wins, draws: value.draws, capped: value.capped, ticks: value.ticks, insights: value.insights, moves: value.moves,
      ...(value.runSeed === undefined ? {} : { runSeed: value.runSeed }), ...(value.droppedMoveSummaries === undefined ? {} : { droppedMoveSummaries: value.droppedMoveSummaries }),
      ...(learning === undefined ? {} : { learning }), ...(pendingTrialResults === undefined ? {} : { pendingTrialResults }),
      ...(experiments === undefined ? {} : { experiments }),
      ...(benchmark === undefined ? {} : { benchmark }),
      ...(value.contextual === undefined ? {} : { contextual: readContextualHistory(value.contextual) }),
      ...(value.trials === undefined ? {} : { trials: readTrialEvidenceList(value.trials) }) };
  } catch { return; }
}
