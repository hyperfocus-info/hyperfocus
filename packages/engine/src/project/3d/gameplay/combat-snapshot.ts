import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readCombatSnapshotStructure } from '../../../combat/snapshot.ts';
import { readCombatAiMemory3D } from '../combat-ai/memory-reader.ts';
import { readCombatEnvironmentState3D } from '../combat-environment/snapshot.ts';
import { readCombatInteractionState3D } from '../combat-interaction/snapshot.ts';
import { readCombatExchangeState3D } from '../combat-practice/exchange.ts';
import { readCombatPracticeState3D } from '../combat-practice/snapshot.ts';
import { readDefenseFeedbackState3D } from '../combat-visuals/defense-feedback/snapshot.ts';
import { readCombatKnockoutState3D } from '../combat-knockout/index.ts';
import { readCombatHitstopState3D } from '../combat-hitstop/snapshot.ts';
import { readCombatInfluenceState3D } from '../combat-influence.ts';
import { readCombatMotionState } from '../combat-motion/state.ts';
import { readCombatMatchSnapshot3D } from '../combat-match/snapshot.ts';
import type { GameplaySnapshot3D } from '../gameplay.ts';

type Snapshot = NonNullable<GameplaySnapshot3D['combat']>;
let fields: ObjectReaders<Snapshot>;
export function readGameplayCombatSnapshot3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  environment: optional(readCombatEnvironmentState3D), interactions: optional(readCombatInteractionState3D), exchange: readCombatExchangeState3D,
  fighterInputs: optional(value => readList(value, value => readObject(value, { held: value => readList(value, requireText), hitstop: readCombatHitstopState3D }))),
  practice: readCombatPracticeState3D, state: readCombatSnapshotStructure, defenseFeedback: readDefenseFeedbackState3D, knockout: readCombatKnockoutState3D,
  held: value => readList(value, requireText), hitstop: readCombatHitstopState3D, influence: readCombatInfluenceState3D, motion: value => readList(value, readCombatMotionState),
  match: optional(readCombatMatchSnapshot3D), ai: optional(readCombatAiMemory3D), playerAi: optional(readCombatAiMemory3D),
}))); }
