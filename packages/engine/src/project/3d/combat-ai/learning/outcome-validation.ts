import { isRecord } from '@hyperfocus/utilities/records';
import { validContext } from './model.ts';
import type { CombatAiLearningOutcomeEvidence } from './outcome-evidence.ts';
import { readDictionary, readList, readObject, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

export const outcomeEvidenceFields: ObjectReaders<CombatAiLearningOutcomeEvidence> = {
  context: requireText, action: requireText,
  facts: value => readObject(value, {
    targetStamina: value => requireOneOf(value, ['low', 'medium', 'high', 'unknown']),
    targetHealth: value => requireOneOf(value, ['low', 'medium', 'high', 'unknown']),
    targetMotion: value => requireOneOf(value, ['retreat', 'approach', 'stationary', 'unknown']),
    targetCorner: value => requireOneOf(value, ['unknown']),
  }),
  completeCount: requireNumber, partialCount: requireNumber, censoredCount: requireNumber, confidence: requireNumber,
  completeReward: requireNumber, completeDealt: requireNumber, completeReceived: requireNumber,
  partialReward: requireNumber, partialDealt: requireNumber, partialReceived: requireNumber,
  outcomeCounts: value => readDictionary(value, requireNumber),
};

const outcomes = ['grapple-teched', 'hit-armored-observed', 'hit', 'parry', 'block', 'contact', 'movement', 'interruption-observed',
  'range-predicted', 'displacement-predicted', 'unknown-miss', 'partial-contact', 'censored'];
function object(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw Error('Invalid tactical outcome object');
  const row = value;
  if (Object.keys(row).length !== keys.length || keys.some(key => !(key in row))) throw Error('Invalid tactical outcome fields');return row;
}
function number(value: unknown, low: number, high: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isSafeInteger(value)) throw Error('Invalid tactical outcome number');return value;
}

/** Exact fresh-window counts are distinct from fractional and decayed policy confidence. */
export function validateOutcomeEvidence(value: unknown, omitted: unknown) {
  number(omitted, 0, Number.MAX_SAFE_INTEGER, true);
  if (!Array.isArray(value) || value.length > 64) throw Error('Invalid tactical outcome bound');
  const ids = new Set<string>();
  const normalizedFacts: CombatAiLearningOutcomeEvidence['facts'][] = [];
  for (const item of value) {
    const row = object(item, ['context', 'action', 'facts', 'completeCount', 'partialCount', 'censoredCount', 'confidence', 'completeReward',
      'completeDealt', 'completeReceived', 'partialReward', 'partialDealt', 'partialReceived', 'outcomeCounts']);
    if (!validContext(row.context) || typeof row.action !== 'string' || !row.action || row.action.length > 160) throw Error('Invalid tactical outcome identity');
    const facts = object(row.facts, ['targetStamina', 'targetHealth', 'targetMotion', 'targetCorner']);
    const stamina = String(facts.targetStamina), targetStamina = (['low', 'medium', 'high', 'unknown'] as const).find(value => value === stamina);
    if (targetStamina === undefined) throw Error('Invalid tactical resource fact');
    const health = String(facts.targetHealth), targetHealth = (['low', 'medium', 'high', 'unknown'] as const).find(value => value === health);
    if (targetHealth === undefined) throw Error('Invalid tactical resource fact');
    const motion = String(facts.targetMotion), targetMotion = (['retreat', 'approach', 'stationary', 'unknown'] as const).find(value => value === motion);
    if (targetMotion === undefined || facts.targetCorner !== 'unknown') throw Error('Invalid tactical observed fact');
    normalizedFacts.push({ targetStamina, targetHealth, targetMotion, targetCorner: 'unknown' });
    const complete = number(row.completeCount, 0, Number.MAX_SAFE_INTEGER, true), partial = number(row.partialCount, 0, Number.MAX_SAFE_INTEGER, true);
    const censored = number(row.censoredCount, 0, Number.MAX_SAFE_INTEGER, true), total = complete + partial + censored;
    if (!Number.isSafeInteger(total) || total === 0) throw Error('Invalid tactical outcome total');
    if (Math.abs(number(row.confidence, 0, Number.MAX_SAFE_INTEGER) - complete - partial * .25) > 1e-9) throw Error('Invalid tactical outcome confidence');
    for (const [prefix, count] of [['complete', complete], ['partial', partial]] as const) {
      number(row[`${prefix}Reward`], -count, count);
      for (const suffix of ['Dealt', 'Received']) {
        const damage = number(row[`${prefix}${suffix}`], 0, Number.MAX_VALUE);
        if (!count && damage) throw Error('Damage without observed tactical outcomes');
      }
    }
    const counts = row.outcomeCounts;
    if (!isRecord(counts) || Object.keys(counts).length > outcomes.length) throw Error('Invalid tactical outcome counts');
    let countTotal = 0;
    for (const [key, count] of Object.entries(counts)) {
      if (!outcomes.includes(key)) throw Error('Invalid tactical outcome label');countTotal += number(count, 1, total, true);
    }
    const byOutcome = counts;
    if (countTotal !== total || (byOutcome['partial-contact'] ?? 0) !== partial || (byOutcome.censored ?? 0) !== censored) throw Error('Inconsistent tactical outcome counts');
    const id = [row.context, row.action, targetStamina, targetHealth, targetMotion].join('|');
    if (ids.has(id)) throw Error('Duplicate tactical outcome group');ids.add(id);
  }
  const detached: unknown[] = structuredClone(value);
  for (const [index, row] of detached.entries()) if (isRecord(row) && isRecord(row.facts)) Object.assign(row.facts, normalizedFacts[index]);
  return readList(detached, value => readObject(value, outcomeEvidenceFields));
}
