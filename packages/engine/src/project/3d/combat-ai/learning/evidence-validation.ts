import { isRecord } from '@hyperfocus/utilities/records';
import { requireText } from "@hyperfocus/utilities/text";
import { validContext } from './model.ts';
import type { CombatAiLearningEvidence, CombatAiLearningProbe } from './evidence.ts';
import { outcomeEvidenceFields, validateOutcomeEvidence } from './outcome-validation.ts';
import { optional, readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { LearningCandidate } from './model.ts';

const candidateFields: ObjectReaders<LearningCandidate> = {
  id: requireText, score: requireNumber, styleScore: optional(requireNumber), moveId: optional(requireText),
  probe: optional(requireBoolean), priority: optional(requireBoolean), contactFrames: optional(requireNumber),
  reach: optional(requireNumber), duration: optional(requireNumber),
  movement: optional(value => requireOneOf(value, ['toward', 'away', 'flank'])),
  sprint: optional(requireBoolean), dash: optional(requireBoolean), jump: optional(requireBoolean), grapple: optional(requireBoolean),
  probability: optional(requireNumber), observedMoveId: optional(requireText),
};
const probeFields: ObjectReaders<CombatAiLearningProbe> = {
  frame: requireNumber, context: requireText, difficulty: requireNumber, opponentId: requireText,
  candidates: value => readList(value, value => readObject(value, candidateFields)), exploration: optional(requireNumber),
};
const evidenceFields: ObjectReaders<CombatAiLearningEvidence> = {
  version: value => requireOneOf(value, [1]), opponentId: requireText,
  actions: value => readList(value, value => readObject(value, { context: requireText, action: requireText, decay: requireNumber, samples: requireNumber, reward: requireNumber })),
  habits: value => readList(value, value => readObject(value, { context: requireText, decay: requireNumber, samples: requireNumber, guard: requireNumber, retreat: requireNumber, attack: requireNumber })),
  probes: value => readList(value, value => readObject(value, probeFields)), omittedProbes: requireNumber,
  omittedActions: requireNumber, omittedHabits: requireNumber,
  outcomes: optional(value => readList(value, value => readObject(value, outcomeEvidenceFields))), omittedOutcomes: optional(requireNumber),
};

function object(value: unknown, keys: readonly string[], optional: readonly string[] = []) {
  if (!isRecord(value)) throw Error('Invalid contextual evidence object');
  const row = value;
  if (keys.some(key => !(key in row)) || Object.keys(row).some(key => !keys.includes(key) && !optional.includes(key))) throw Error('Invalid contextual evidence fields');
  return row;
}
function number(value: unknown, low: number, high: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isSafeInteger(value)) throw Error('Invalid contextual evidence number');
}
function text(value: unknown, max: number, empty = false): asserts value is string { requireText(value, { min: empty ? 0 : 1, max, message: "Invalid contextual evidence text" }); }
function rows(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw Error('Invalid contextual evidence bound');return value;
}
function context(value: unknown) { if (!validContext(value)) throw Error('Invalid contextual evidence context'); }

export function readCombatAiLearningProbe(value: unknown): CombatAiLearningProbe {
  const probe = object(value, ['frame', 'context', 'difficulty', 'opponentId', 'candidates'], ['exploration']);
  if (probe.exploration !== undefined) number(probe.exploration, 0, 1);
  number(probe.frame, 0, Number.MAX_SAFE_INTEGER, true);context(probe.context);number(probe.difficulty, 1, 9, true);text(probe.opponentId, 128, true);
  const candidates = rows(probe.candidates, 64), ids = new Set<string>();
  if (!candidates.length) throw Error('Empty contextual selector probe');
  const movements: Array<LearningCandidate['movement']> = [];
  for (const value of candidates) {
    const candidate = object(value, ['id', 'score'], ['styleScore', 'moveId', 'probe', 'priority', 'contactFrames', 'reach', 'duration', 'movement', 'sprint', 'dash', 'jump', 'grapple', 'probability', 'observedMoveId']);
    text(candidate.id, 160);number(candidate.score, -Number.MAX_VALUE, Number.MAX_VALUE);
    if (ids.has(String(candidate.id))) throw Error('Duplicate contextual probe alternative');ids.add(String(candidate.id));
    if (candidate.styleScore !== undefined) number(candidate.styleScore, -1.4, 1.4);
    for (const key of ['contactFrames', 'reach', 'duration']) if (candidate[key] !== undefined) number(candidate[key], 0, Number.MAX_VALUE);
    if (candidate.probability !== undefined) number(candidate.probability, 0, 1);
    for (const key of ['moveId', 'observedMoveId']) if (candidate[key] !== undefined) text(candidate[key], 128);
    for (const key of ['probe', 'priority', 'sprint', 'dash', 'jump', 'grapple']) if (candidate[key] !== undefined && typeof candidate[key] !== 'boolean') throw Error('Invalid contextual probe flag');
    let movement: LearningCandidate['movement'];
    if (candidate.movement !== undefined) {
      const coerced = String(candidate.movement);
      movement = (['toward', 'away', 'flank'] as const).find(value => value === coerced);
      if (movement === undefined) throw Error('Invalid contextual probe movement');
    }
    movements.push(movement);
  }
  const detached = structuredClone(probe);
  if (Array.isArray(detached.candidates)) for (const [index, candidate] of detached.candidates.entries()) {
    if (movements[index] !== undefined) Object.assign(candidate, { movement: movements[index] });
  }
  return readObject(detached, probeFields);
}

/** Bounded portable fresh-evidence operations; no seeded prior is present. */
export function readCombatAiLearningEvidence(value: unknown): CombatAiLearningEvidence {
  const raw = object(value, ['version', 'opponentId', 'actions', 'habits', 'probes', 'omittedProbes'], ['omittedActions', 'omittedHabits', 'outcomes', 'omittedOutcomes']);
  const evidence: Record<string, unknown> = { ...raw, omittedActions: raw.omittedActions === undefined ? 0 : raw.omittedActions, omittedHabits: raw.omittedHabits === undefined ? 0 : raw.omittedHabits };
  if (evidence.version !== 1) throw Error('Unsupported contextual evidence version');
  text(evidence.opponentId, 128, true);
  for (const key of ['omittedProbes', 'omittedActions', 'omittedHabits']) number(evidence[key], 0, Number.MAX_SAFE_INTEGER, true);
  const ids = new Set<string>();
  for (const value of rows(evidence.actions, Number.MAX_SAFE_INTEGER)) {
    const row = object(value, ['context', 'action', 'decay', 'samples', 'reward']);context(row.context);text(row.action, 160);
    number(row.decay, 0, 1);number(row.samples, 0, Number.MAX_SAFE_INTEGER);number(row.reward, -(row.samples), row.samples);
    const id = `${row.context}|${row.action}`;if (ids.has(id)) throw Error('Duplicate contextual evidence action');ids.add(id);
  }
  ids.clear();
  for (const value of rows(evidence.habits, 16)) {
    const row = object(value, ['context', 'decay', 'samples', 'guard', 'retreat', 'attack']);context(row.context);number(row.decay, 0, 1);number(row.samples, 0, 10.000001);
    if ((row.decay) > 0 && Math.abs((row.samples) - 10 * (1 - (row.decay))) > 1e-9) throw Error('Invalid contextual affine habit evidence');
    for (const key of ['guard', 'retreat', 'attack']) number(row[key], 0, row.samples);
    if (ids.has(String(row.context))) throw Error('Duplicate contextual evidence habit');ids.add(String(row.context));
  }
  const probes = rows(evidence.probes, 4).map(readCombatAiLearningProbe);
  const outcomes = evidence.outcomes !== undefined || evidence.omittedOutcomes !== undefined ? validateOutcomeEvidence(evidence.outcomes, evidence.omittedOutcomes) : undefined;
  const detached = structuredClone(evidence);
  if (Array.isArray(detached.probes)) for (const [index, probe] of detached.probes.entries()) {
    const normalized = probes[index];
    if (normalized && isRecord(probe) && Array.isArray(probe.candidates)) for (const [index, candidate] of probe.candidates.entries()) {
      const movement = normalized.candidates[index]?.movement;
      if (movement !== undefined) Object.assign(candidate, { movement });
    }
  }
  if (outcomes && Array.isArray(detached.outcomes)) for (const [index, row] of detached.outcomes.entries()) {
    if (isRecord(row) && isRecord(row.facts)) Object.assign(row.facts, outcomes[index]?.facts);
  }
  return readObject(detached, evidenceFields);
}
