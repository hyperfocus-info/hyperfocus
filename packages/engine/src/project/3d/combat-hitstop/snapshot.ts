import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readCombatVector } from '../../../combat/observation-readers.ts';
import type { createCombatHitstop3D } from '../combat-hitstop.ts';

type Snapshot = ReturnType<ReturnType<typeof createCombatHitstop3D>['capture']>;
let fields: ObjectReaders<Snapshot>;
export function readCombatHitstopState3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  remaining: requireNumber,
  buffered: value => readList(value, value => readList(value, requireText)),
  previous: value => readList(value, requireText),
  jumpPresses: value => readList(value, value => readObject(value, { action: requireText, frames: requireNumber })),
  jumpTaps: value => readList(value, requireText),
  directions: optional(value => readList(value, value => value === null ? requireOneOf(value, [null]) : readCombatVector(value))),
  previousDirection: optional(readCombatVector), jumpDirection: optional(readCombatVector),
}))); }
