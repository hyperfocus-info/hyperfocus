import { requireText } from '@hyperfocus/utilities/text';
import { optional, readDictionary, readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readCombatInput, readCombatVector } from '../../../combat/observation-readers.ts';
import { readCombatAiLearningStructure } from './learning/structure.ts';
import { readCombatAiPersonalityStructure } from './personality/structure.ts';
import type { createCombatAi3D } from '../combat-ai.ts';
import type { CombatAiTuning } from './policy/instrumentation.ts';
import type { TacticalCandidate } from './policy/selection.ts';

let tuningFields: ObjectReaders<CombatAiTuning>;
let candidateFields: ObjectReaders<TacticalCandidate>;
type Snapshot = ReturnType<ReturnType<typeof createCombatAi3D>['capture']>;
let fields: ObjectReaders<Snapshot>;
export function readCombatAiMemory3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  tick: requireNumber, guard: requireBoolean, tech: requireBoolean, drive: requireBoolean,
  queue: value => readList(value, value => readObject(value, { input: readCombatInput, direction: readCombatVector, jump: requireBoolean, dash: requireBoolean, sprint: requireBoolean })),
  navigation: optional(value => readObject(value, { surfaceId: requireText, point: readCombatVector, takeoff: readCombatVector, phase: value => requireOneOf(value, ['approach', 'launch', 'air', 'drop']), wait: requireNumber })),
  tactics: value => readObject(value, { random: requireNumber, seeded: requireBoolean, until: requireNumber, choice: requireNumber, distance: requireNumber, stalled: requireNumber, quiet: requireNumber, serial: requireNumber, move: requireText, contact: requireBoolean, failedMove: requireText, failures: requireNumber, probeAt: requireNumber }),
  personality: optional(readCombatAiPersonalityStructure),
  jumping: value => readObject(value, { retryAt: requireNumber, failures: requireNumber, attempt: optional(value => readObject(value, { x: requireNumber, y: requireNumber, z: requireNumber, distance: requireNumber, health: requireNumber, tick: requireNumber, airborne: requireBoolean })) }),
  policy: value => readObject(value, { random: requireNumber, choice: requireText, until: requireNumber, serial: requireNumber }),
  trainedPolicy: optional(value => readObject(value, { version: value => requireOneOf(value, [1]), id: requireText, scores: value => readDictionary(value, requireNumber) })),
  queuedPolicy: optional(value => readObject(value, { policy: optional(value => readObject(value, { version: value => requireOneOf(value, [1]), id: requireText, scores: value => readDictionary(value, requireNumber) })) })),
  tuning: optional(value => readObject(value, (tuningFields ??= { mode: optional(value => requireOneOf(value, ['baseline', 'adaptive'])), adaptation: optional(requireBoolean), compression: optional(requireBoolean), learningFrozen: optional(requireBoolean), opponentId: optional(requireText), exploration: optional(requireNumber) }))), learning: optional(readCombatAiLearningStructure), queuedLearning: optional(readCombatAiLearningStructure),
  plan: optional(value => readObject(value, { key: requireText, choice: value => readObject(value, (candidateFields ??= {
  id: requireText, score: requireNumber, styleScore: optional(requireNumber), moveId: optional(requireText), probe: optional(requireBoolean), priority: optional(requireBoolean), contactFrames: optional(requireNumber), reach: optional(requireNumber), duration: optional(requireNumber),
  movement: optional(value => requireOneOf(value, ['toward', 'away', 'flank'])), sprint: optional(requireBoolean), dash: optional(requireBoolean), jump: optional(requireBoolean), grapple: optional(requireBoolean),
})), until: requireNumber, serial: requireNumber })),
}))); }
