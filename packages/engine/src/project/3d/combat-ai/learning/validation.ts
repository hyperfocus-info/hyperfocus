import { isRecord } from '@hyperfocus/utilities/records';
import { requireText } from "@hyperfocus/utilities/text";
import { initialLearning, validContext, type CombatAiLearning } from './model.ts';
import { readCombatAiLearningStructure } from './structure.ts';

function object(value: unknown, keys: readonly string[], optional: readonly string[] = []) {
  if (!isRecord(value)) throw Error('Invalid contextual learning object');
  const row = value;
  const names = Object.keys(row);
  if (keys.some(k => !names.includes(k)) || names.some(k => !keys.includes(k) && !optional.includes(k))) throw Error('Invalid contextual learning fields');
  return row;
}
function number(value: unknown, low: number, high: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isSafeInteger(value)) throw Error('Invalid contextual learning number');
}
function text(value: unknown, max: number, empty = true): asserts value is string { requireText(value, { min: empty ? 0 : 1, max, message: "Invalid contextual learning text" }); }
function rows(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw Error('Invalid contextual learning bound');return value;
}
function context(value: unknown) { if (!validContext(value)) throw Error('Invalid contextual learning context'); }
function unique(value: string, ids: Set<string>) { if (ids.has(value)) throw Error('Duplicate contextual learning identity');ids.add(value); }

/** Strict portable restore, including pending attribution and duplicate suppression for deterministic continuation. */
export function readLearning(value: unknown): CombatAiLearning {
  if (value === undefined) return initialLearning();
  const raw = object(value, ['version', 'opponentId', 'actions', 'habits', 'traces', 'pending', 'transient'], ['next']);
  const data: Record<string, unknown> = { ...raw, next: raw.next ?? null };
  if (data.version !== 1) throw Error('Unsupported contextual learning version');
  text(data.opponentId, 128);
  const actionIds = new Set<string>();
  for (const value of rows(data.actions, Number.MAX_SAFE_INTEGER)) {
    const row = object(value, ['context', 'action', 'samples', 'reward']);context(row.context);text(row.action, 160, false);
    number(row.samples, 0, Number.MAX_SAFE_INTEGER);number(row.reward, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    if (Math.abs(row.reward) > (row.samples) + 1e-10) throw Error('Invalid contextual reward total');
    unique(`${row.context}|${row.action}`, actionIds);
  }
  const habitIds = new Set<string>();
  for (const value of rows(data.habits, 16)) {
    const row = object(value, ['context', 'samples', 'guard', 'retreat', 'attack']);context(row.context);
    unique(String(row.context), habitIds);number(row.samples, 0, 10.000001);
    for (const key of ['guard', 'retreat', 'attack']) number(row[key], 0, row.samples);
  }
  for (const value of rows(data.traces, 64)) {
    const row = object(value, ['frame', 'context', 'candidates', 'omitted', 'chosen', 'probability', 'status', 'outcome', 'reward', 'move']);
    number(row.frame, 0, Number.MAX_SAFE_INTEGER, true);context(row.context);text(row.chosen, 160, false);number(row.probability, 0, 1);
    if (!['pending', 'complete', 'censored'].includes(String(row.status))) throw Error('Invalid contextual trace status');
    if (!['', 'hit', 'hit-armored-observed', 'parry', 'block', 'contact', 'movement', 'grapple-teched', 'partial-contact', 'interruption-observed', 'range-predicted', 'displacement-predicted', 'unknown-miss'].includes(String(row.outcome))) throw Error('Invalid contextual outcome');
    number(row.reward, -1, 1);text(row.move, 128);number(row.omitted, 0, 256, true);
    const ids = new Set<string>();let total = 0, complete = true;
    for (const item of rows(row.candidates, 64)) {
      const c = object(item, ['id', 'score', 'probability']);text(c.id, 160, false);number(c.score, -Number.MAX_VALUE, Number.MAX_VALUE);
      unique(String(c.id), ids);
      if (c.probability === null) complete = false;
      else { number(c.probability, 0, 1);total += c.probability; }
      if (c.id === row.chosen && c.probability !== row.probability) throw Error('Invalid contextual chosen probability');
    }
    if (!ids.has(String(row.chosen)) || total > 1.000001 || complete && row.omitted === 0 && Math.abs(total - 1) > .000001) throw Error('Invalid contextual alternatives');
  }
  const t = object(data.transient, ['frame', 'serial', 'habitFrame', 'distance', 'x', 'z', 'eventIds']);
  for (const key of ['frame', 'serial', 'habitFrame']) number(t[key], -1, Number.MAX_SAFE_INTEGER, true);
  number(t.distance, 0, Number.MAX_VALUE);number(t.x, -Number.MAX_VALUE, Number.MAX_VALUE);number(t.z, -Number.MAX_VALUE, Number.MAX_VALUE);
  const eventIds = new Set<string>();
  for (const value of rows(t.eventIds, 64)) { text(value, 256, false);unique(String(value), eventIds); }
  for (const key of ['pending', 'next'] as const) if (data[key] !== null) {
    const p = object(data[key], ['frame', 'context', 'action', 'move', 'serial', 'started', 'ended', 'deadline', 'reach', 'distance', 'x', 'z', 'dealt', 'received', 'contacts', 'parries', 'blocks', 'interrupted', 'armored']);
    context(p.context);text(p.action, 160, false);text(p.move, 128);
    number(p.serial, -1, Number.MAX_SAFE_INTEGER, true);number(p.started, -1, Number.MAX_SAFE_INTEGER, true);number(p.ended, -1, Number.MAX_SAFE_INTEGER, true);
    number(p.frame, 0, Number.MAX_SAFE_INTEGER, true);number(p.deadline, 0, Number.MAX_SAFE_INTEGER, true);number(p.contacts, 0, Number.MAX_SAFE_INTEGER, true);number(p.parries, 0, Number.MAX_SAFE_INTEGER, true);number(p.blocks, 0, Number.MAX_SAFE_INTEGER, true);
    for (const key of ['distance', 'dealt', 'received']) number(p[key], 0, Number.MAX_VALUE);
    number(p.reach, -1, Number.MAX_VALUE);number(p.x, -Number.MAX_VALUE, Number.MAX_VALUE);number(p.z, -Number.MAX_VALUE, Number.MAX_VALUE);
    if (typeof p.interrupted !== 'boolean' || typeof p.armored !== 'boolean' || (p.deadline) < (p.frame)
      || (p.started) >= 0 && (p.started) < (p.frame)
      || (p.deadline) > Math.max(p.frame, p.started) + (p.action === 'grapple' && (p.started) < 0 ? 292 : 180)
      || (p.ended) >= 0 && ((p.started) < 0 || (p.ended) < (p.started))
      || (p.parries) + (p.blocks) > (p.contacts)) throw Error('Invalid contextual pending attempt');
    if (key === 'next') {
      if (data.pending === null || !p.move || p.started !== -1 || p.ended !== -1 || p.dealt !== 0 || p.received !== 0
        || p.contacts !== 0 || p.parries !== 0 || p.blocks !== 0 || p.armored || p.interrupted) throw Error('Invalid contextual queued intention');
      const prior = data.pending;
      if (!isRecord(prior)) throw Error('Invalid contextual learning object');
      const frame = prior.frame;number(frame, 0, Number.MAX_SAFE_INTEGER, true);
      if (p.frame < frame) throw Error('Invalid contextual intention order');
    }
  }
  return readCombatAiLearningStructure(data);
}
