import { isRecord } from '@hyperfocus/utilities/records';
import type { ContextualTrainingReport } from './session.ts';
import { readTrainingOutcomes } from './outcomes.ts';

/** The durable bank owns models; last-run history retains bounded observed fight lessons. */
export function contextualHistory(value: ContextualTrainingReport | undefined) {
  if (!value) return;
  return { version: value.version, revision: value.revision, sets: value.sets, fragments: value.fragments,
    carried: value.carried, freshEvaluations: value.freshEvaluations, informative: value.informative,
    evicted: value.evicted, omitted: value.omitted + value.recent.length, recent: [], models: [],
    modelRecordsOmitted: (value.modelRecordsOmitted ?? 0) + value.models.length,
    outcomes: value.outcomes ?? [], omittedOutcomes: value.omittedOutcomes ?? 0, outcomeSets: value.outcomeSets ?? 0,
    investigations: value.investigations ?? 0, investigationWindows: value.investigationWindows ?? 0,
    ...(value.persistence ? { persistence: value.persistence } : {}), ...(value.storageRevision === undefined ? {} : { storageRevision: value.storageRevision }),
    ...(value.error ? { error: value.error } : {}) };
}

export function readContextualHistory(value: unknown): ContextualTrainingReport | undefined {
  if (value === undefined) return;
  if (!isRecord(value)) throw Error('Invalid contextual training summary.');
  const row = value;
  const counters = ['revision', 'sets', 'fragments', 'carried', 'freshEvaluations', 'informative', 'evicted', 'omitted', 'modelRecordsOmitted'] as const;
  const fields = new Set(['version', ...counters, 'recent', 'models', 'persistence', 'storageRevision', 'error', 'outcomes', 'omittedOutcomes', 'outcomeSets', 'investigations', 'investigationWindows']);
  if (Object.keys(row).some(key => !fields.has(key))) throw Error('Invalid contextual training fields.');
  if (row.version !== 1 || !Array.isArray(row.recent) || row.recent.length || !Array.isArray(row.models) || row.models.length) throw Error('Invalid contextual training summary.');
  const outcomes = readTrainingOutcomes(row.outcomes === undefined ? [] : row.outcomes, row.omittedOutcomes === undefined ? 0 : row.omittedOutcomes);
  function counter(key: string) {
    const value = row[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid contextual training count.');
    return value;
  }
  const persistence = row.persistence;
  if (persistence !== undefined && persistence !== 'loading' && persistence !== 'pending' && persistence !== 'saved' && persistence !== 'error') throw Error('Invalid contextual persistence state.');
  const error = row.error;
  if (error !== undefined && (typeof error !== 'string' || error.length > 2048)) throw Error('Invalid contextual training error.');
  // This diagnostic summary cannot resume jobs or supply learned weights.
  return { version: 1, revision: counter('revision'), sets: counter('sets'), fragments: counter('fragments'),
    carried: counter('carried'), freshEvaluations: counter('freshEvaluations'), informative: counter('informative'),
    evicted: counter('evicted'), omitted: counter('omitted'), modelRecordsOmitted: counter('modelRecordsOmitted'), recent: [], models: [],
    outcomes, omittedOutcomes: row.omittedOutcomes === undefined ? 0 : counter('omittedOutcomes'),
    outcomeSets: row.outcomeSets === undefined ? 0 : counter('outcomeSets'), investigations: row.investigations === undefined ? 0 : counter('investigations'),
    investigationWindows: row.investigationWindows === undefined ? 0 : counter('investigationWindows'),
    ...(persistence === undefined ? {} : { persistence }), ...(error === undefined ? {} : { error }),
    ...(row.storageRevision === undefined ? {} : { storageRevision: counter('storageRevision') }) };
}
