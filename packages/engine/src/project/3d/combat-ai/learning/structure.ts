import { requireText } from '@hyperfocus/utilities/text';
import { readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { CombatAiLearning } from './model.ts';

const pendingFields: ObjectReaders<NonNullable<CombatAiLearning['pending']>> = {
  frame: requireNumber, context: requireText, action: requireText, move: requireText, serial: requireNumber, started: requireNumber, ended: requireNumber, deadline: requireNumber, reach: requireNumber, distance: requireNumber, x: requireNumber, z: requireNumber,
  dealt: requireNumber, received: requireNumber, contacts: requireNumber, parries: requireNumber, blocks: requireNumber, interrupted: requireBoolean, armored: requireBoolean,
};
const traceFields: ObjectReaders<CombatAiLearning['traces'][number]> = {
  frame: requireNumber, context: requireText, candidates: value => readList(value, value => readObject(value, { id: requireText, score: requireNumber, probability: value => value === null ? null : requireNumber(value) })),
  omitted: requireNumber, chosen: requireText, probability: requireNumber, status: value => requireOneOf(value, ['pending', 'complete', 'censored']), outcome: requireText, reward: requireNumber, move: requireText,
};
const fields: ObjectReaders<CombatAiLearning> = {
  version: value => requireOneOf(value, [1]), opponentId: requireText,
  actions: value => readList(value, value => readObject(value, { context: requireText, action: requireText, samples: requireNumber, reward: requireNumber })),
  habits: value => readList(value, value => readObject(value, { context: requireText, samples: requireNumber, guard: requireNumber, retreat: requireNumber, attack: requireNumber })),
  traces: value => readList(value, value => readObject(value, traceFields)),
  pending: value => value === null ? null : readObject(value, pendingFields), next: value => value === null ? null : readObject(value, pendingFields),
  transient: value => readObject(value, { frame: requireNumber, serial: requireNumber, habitFrame: requireNumber, distance: requireNumber, x: requireNumber, z: requireNumber, eventIds: value => readList(value, requireText) }),
};
export function readCombatAiLearningStructure(value: unknown): CombatAiLearning { return structuredClone(readObject(value, fields)); }
