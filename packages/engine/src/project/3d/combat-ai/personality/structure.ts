import { requireText } from '@hyperfocus/utilities/text';
import { readList, readObject, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { CombatAiPersonality } from './index.ts';

const fields: ObjectReaders<CombatAiPersonality> = {
  version: value => requireOneOf(value, [1]),
  preferences: value => readObject(value, { reckless: requireNumber, fast: requireNumber, eager: requireNumber, defensive: requireNumber, items: requireNumber, positioning: requireNumber, jumping: requireNumber, dogfighter: requireNumber, whiffPunisher: requireNumber, bait: requireNumber, grappler: requireNumber }),
  moves: value => readList(value, value => readObject(value, { id: requireText, attempts: requireNumber, hits: requireNumber, parries: requireNumber, blocks: requireNumber, whiffs: requireNumber })),
  parried: requireNumber, enemyFeints: requireNumber, stuck: requireNumber, rounds: requireNumber,
  round: value => readObject(value, { hits: requireNumber, parries: requireNumber, whiffs: requireNumber, feints: requireNumber, stuck: requireNumber }),
  transient: value => readObject(value, { frame: requireNumber, serial: requireNumber, move: requireText, contact: requireBoolean, targetSerial: requireNumber, distance: requireNumber, x: requireNumber, z: requireNumber, stalled: requireNumber, eventIds: value => readList(value, requireText) }),
};
export function readCombatAiPersonalityStructure(value: unknown): CombatAiPersonality { return structuredClone(readObject(value, fields)); }
