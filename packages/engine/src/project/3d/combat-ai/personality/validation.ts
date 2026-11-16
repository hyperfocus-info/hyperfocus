import { isRecord } from '@hyperfocus/utilities/records';
import { requireText } from "@hyperfocus/utilities/text";
import { preferenceKeys, type CombatAiPersonality } from './index.ts';
import { readCombatAiPersonalityStructure } from './structure.ts';

function record(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw Error('Invalid AI personality object');
  const data = value;
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key))) throw Error('Invalid AI personality fields');
  return data;
}
function number(value: unknown, low: number, high: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isSafeInteger(value)) throw Error('Invalid AI personality number');
}
function text(value: unknown, max = 128): asserts value is string { requireText(value, { max, message: "Invalid AI personality text" }); }

/** Strict, bounded restore. Never retain caller-owned mutable arrays. */
export function readPersonality(value: unknown): CombatAiPersonality {
  const data = record(value, ['version', 'preferences', 'moves', 'parried', 'enemyFeints', 'stuck', 'rounds', 'round', 'transient']);
  if (data.version !== 1) throw Error('Unsupported AI personality version');
  if (!isRecord(data.preferences)) throw Error('Invalid AI preferences');
  const legacy = data.preferences;
  const preferences = record({ dogfighter: 1, whiffPunisher: 1, bait: 1, grappler: 1, ...legacy }, preferenceKeys);
  for (const key of preferenceKeys) number(preferences[key], .3, 1.7);
  for (const key of ['parried', 'enemyFeints', 'stuck']) number(data[key], 0, 32);
  number(data.rounds, 0, 10000, true);
  const round = record(data.round, ['hits', 'parries', 'whiffs', 'feints', 'stuck']);
  for (const value of Object.values(round)) number(value, 0, 32, true);
  if (!Array.isArray(data.moves) || data.moves.length > 24) throw Error('Invalid AI personality move history');
  const ids = new Set<string>();
  for (const value of data.moves) {
    const move = record(value, ['id', 'attempts', 'hits', 'parries', 'blocks', 'whiffs']);text(move.id);
    if (!move.id || ids.has(move.id)) throw Error('Invalid AI personality move identity');
    ids.add(move.id);
    for (const key of ['attempts', 'hits', 'parries', 'blocks', 'whiffs']) number(move[key], 0, 32);
  }
  const t = record(data.transient, ['frame', 'serial', 'move', 'contact', 'targetSerial', 'distance', 'x', 'z', 'stalled', 'eventIds']);
  for (const key of ['frame', 'serial', 'targetSerial']) number(t[key], -1, Number.MAX_SAFE_INTEGER, true);
  number(t.x, -Number.MAX_VALUE, Number.MAX_VALUE);number(t.z, -Number.MAX_VALUE, Number.MAX_VALUE);
  number(t.distance, 0, Number.MAX_VALUE);number(t.stalled, 0, 180, true);text(t.move);
  if (typeof t.contact !== 'boolean' || !Array.isArray(t.eventIds) || t.eventIds.length > 64 || new Set(t.eventIds).size !== t.eventIds.length) throw Error('Invalid AI personality events');
  for (const id of t.eventIds) text(id, 256);
  return readCombatAiPersonalityStructure({ ...data, preferences });
}
