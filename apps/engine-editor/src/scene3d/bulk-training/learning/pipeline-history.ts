import { isRecord } from '@hyperfocus/utilities/records';
import type { BulkTotals } from '../pool.ts';
import { readPolicyExperiment } from '@hyperfocus/touch-of-death/learning/experiment';
import { readPendingTrialResults } from './scheduler.ts';

/** Reports are inspection data. Recompute every retained experiment, never trust approval flags. */
export function readPipelineHistory(value: unknown): BulkTotals['experiments'] {
  if (value === undefined) return;
  const object = (row: unknown): Record<string, unknown> => {
    if (!isRecord(row)) throw Error('Invalid experiment history.');
    return row;
  };
  const count = (row: unknown) => { if (typeof row !== 'number' || !Number.isSafeInteger(row) || row < 0) throw Error('Invalid experiment count.');return row; };
  const input = object(value), started = count(input.started), completed = count(input.completed), canceled = count(input.canceled), omitted = count(input.omitted), pendingOmitted = count(input.pendingOmitted ?? 0);
  if (!Array.isArray(input.recent) || input.recent.length > 2 || !Array.isArray(input.pending) || input.pending.length > 1024) throw Error('Invalid retained experiments.');
  const recent = input.recent.map(readPolicyExperiment);
  if (recent.some(row => !['approved', 'rejected'].includes(row.status)) || completed !== omitted + recent.length) throw Error('Invalid completed experiments.');
  const sequences = new Set<number>(), seeds = new Set<number>(recent.map(row => row.seed));let prior = -1;
  if (seeds.size !== recent.length) throw Error('Duplicate completed experiment.');
  const pending = input.pending.map(row => {
    const item = object(row), sequence = count(item.sequence), learning = readPolicyExperiment(item.learning);
    if (sequence >= started || sequence <= prior || sequences.has(sequence) || seeds.has(learning.seed)) throw Error('Duplicate or unordered experiment.');
    prior = sequence;sequences.add(sequence);seeds.add(learning.seed);
    const pendingTrialResults = readPendingTrialResults({ learning, value: item.pendingTrialResults });
    return { sequence, learning, pendingTrialResults };
  });
  if (started !== completed + canceled + pending.length + pendingOmitted) throw Error('Incomplete experiment coverage.');
  return { started, completed, canceled, omitted, pendingOmitted, recent, pending };
}
