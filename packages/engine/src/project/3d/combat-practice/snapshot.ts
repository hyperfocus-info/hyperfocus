import { requireText } from '@hyperfocus/utilities/text';
import { optional, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { createCombatPractice3D } from './session.ts';

type Snapshot = ReturnType<ReturnType<typeof createCombatPractice3D>['capture']>;
let fields: ObjectReaders<Snapshot>;
export function readCombatPracticeState3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  preset: value => requireOneOf(value, ['neutral', 'outward', 'sideways', 'tech', 'escape', 'guard', 'parry-drill', 'tech-drill', 'di-drill', 'arena-lesson', 'combo-lesson', 'random']),
  random: optional(value => readObject(value, { seed: requireNumber, choice: requireNumber, tech: requireBoolean, serial: requireNumber, touching: requireBoolean })),
  lesson: optional(value => readObject(value, { stage: requireNumber, x: requireNumber, z: requireNumber, serial: requireNumber, move: requireText, retry: requireBoolean, branch: value => requireOneOf(value, ['upward', 'side', 'cashout']), learned: requireNumber })),
}))); }
