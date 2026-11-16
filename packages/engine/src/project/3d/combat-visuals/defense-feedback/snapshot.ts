import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readCombatVector } from '../../../../combat/observation-readers.ts';
import type { createDefenseFeedback3D } from '../defense-feedback.ts';

type Memory = ReturnType<ReturnType<typeof createDefenseFeedback3D>['capture']>[number];
let fields: ObjectReaders<Memory>;
export function readDefenseFeedbackState3D(value: unknown): Memory[] { return structuredClone(readList(value, value => readObject(value, (fields ??= {
  id: requireText, guard: requireBoolean, tech: requireBoolean, guardAt: requireNumber, techAt: requireNumber, hitAt: requireNumber, bounceAt: requireNumber,
  bouncePoint: optional(readCombatVector), bounceNormal: optional(readCombatVector),
  cue: optional(value => readObject(value, {
    action: value => requireOneOf(value, ['parry', 'tech']), result: value => requireOneOf(value, ['early', 'late', 'perfect']), frame: requireNumber,
    contactPoint: optional(readCombatVector), contactNormal: optional(readCombatVector),
  })),
  lastAttempt: optional(value => readObject(value, {
    fighterId: requireText, kind: value => requireOneOf(value, ['parry', 'tech']), inputFrame: requireNumber, impactFrame: optional(requireNumber), timing: value => requireOneOf(value, ['early', 'late', 'success', 'unavailable']),
  })),
})))); }
