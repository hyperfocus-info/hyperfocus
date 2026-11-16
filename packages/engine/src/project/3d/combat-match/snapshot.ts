import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { CombatMatchSnapshot3D } from './index.ts';

let fields: ObjectReaders<CombatMatchSnapshot3D>;
export function readCombatMatchSnapshot3D(value: unknown): CombatMatchSnapshot3D { return structuredClone(readObject(value, (fields ??= {
  version: value => requireOneOf(value, [1]), phase: value => requireOneOf(value, ['menu', 'intro', 'countdown', 'fighting', 'practice', 'round-result', 'match-result']),
  difficulty: requireNumber, ticks: requireNumber, playerWins: requireNumber, opponentWins: requireNumber, winner: value => requireOneOf(value, ['', 'player', 'opponent', 'draw']),
  held: value => readList(value, requireText), introExit: optional(requireNumber), quick: optional(requireBoolean), theater: optional(requireBoolean), queueSeed: optional(requireNumber), matchIndex: optional(requireNumber), rematchVotes: optional(value => readTuple(value, [requireBoolean, requireBoolean])),
}))); }
