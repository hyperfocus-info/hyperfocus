import type { CombatEvent, CombatSnapshot } from '../../../../combat/state.ts';

export const preferenceKeys = ['reckless', 'fast', 'eager', 'defensive', 'items', 'positioning', 'jumping', 'dogfighter', 'whiffPunisher', 'bait', 'grappler'] as const;
type Preferences = Record<typeof preferenceKeys[number], number>;
type MoveRecord = { id: string; attempts: number; hits: number; parries: number; blocks: number; whiffs: number };
export type CombatAiPersonality = {
  version: 1; preferences: Preferences; moves: MoveRecord[];
  parried: number; enemyFeints: number; stuck: number; rounds: number;
  round: { hits: number; parries: number; whiffs: number; feints: number; stuck: number };
  transient: { frame: number; serial: number; move: string; contact: boolean; targetSerial: number; distance: number; x: number; z: number; stalled: number; eventIds: string[] };
};
const transient = (): CombatAiPersonality['transient'] => ({ frame: -1, serial: -1, move: '', contact: false, targetSerial: -1, distance: 0, x: 0, z: 0, stalled: 0, eventIds: [] });
const round = (): CombatAiPersonality['round'] => ({ hits: 0, parries: 0, whiffs: 0, feints: 0, stuck: 0 });
const bounded = (value: number) => Math.max(0, Math.min(32, value));

export function initialPersonality({ seed = 0, fighterId }: { seed?: number; fighterId: string }): CombatAiPersonality {
  let random = seed >>> 0;
  for (let i = 0; i < fighterId.length; i++) random = Math.imul(random ^ fighterId.charCodeAt(i), 16777619) >>> 0;
  random ||= 1;
  const preferences: Preferences = { reckless: 0, fast: 0, eager: 0, defensive: 0, items: 0, positioning: 0, jumping: 0, dogfighter: 0, whiffPunisher: 0, bait: 0, grappler: 0 };
  for (const key of preferenceKeys) {
    random ^= random << 13;random ^= random >>> 17;random ^= random << 5;
    preferences[key] = .3 + (random >>> 0) / 0xffffffff * 1.4;
  }
  return { version: 1, preferences, moves: [], parried: 0, enemyFeints: 0, stuck: 0, rounds: 0, round: round(), transient: transient() };
}

function moveRecord(memory: CombatAiPersonality, id: string) {
  let entry = memory.moves.find(item => item.id === id);
  if (!entry) {
    if (memory.moves.length === 24) memory.moves.shift();
    entry = { id, attempts: 0, hits: 0, parries: 0, blocks: 0, whiffs: 0 };memory.moves.push(entry);
  }
  return entry;
}

function incrementMove(entry: MoveRecord, key: Exclude<keyof MoveRecord, 'id'>) {
  // Decay the entire sample together so recent evidence keeps changing its rate.
  if (entry[key] + 1 > 32) {
    entry.attempts *= .5;entry.hits *= .5;entry.parries *= .5;entry.blocks *= .5;entry.whiffs *= .5;
  }
  entry[key]++;
}

/** Call once per committed observation; optional resolved events may also be delivered separately. */
export function observePersonality(memory: CombatAiPersonality, observation: { state: CombatSnapshot; fighterId: string; targetId: string; distance: number; moving: boolean; collision?: boolean; events?: readonly CombatEvent[] }) {
  const { state, fighterId, targetId } = observation;
  const self = state.fighters.find(f => f.id === fighterId), target = state.fighters.find(f => f.id === targetId);
  if (!self || !target) return;
  observePersonalityEvents(memory, observation.events ?? [], fighterId);
  const t = memory.transient;
  if (state.frame <= t.frame) return;
  t.frame = state.frame;
  if (t.move && (self.attackSerial !== t.serial || !self.moveId)) {
    if (!t.contact && !self.moveId.includes('feint')) { incrementMove(moveRecord(memory, t.move), 'whiffs');memory.round.whiffs = bounded(memory.round.whiffs + 1); }
    t.move = '';t.contact = false;
  }
  if (self.attackSerial !== t.serial && self.moveId && !self.moveId.includes('feint') && !self.moveId.includes('evade')) {
    t.move = self.moveId;t.contact = false;
    incrementMove(moveRecord(memory, t.move), 'attempts');
  }
  t.serial = self.attackSerial;t.contact ||= self.hitTargets.length > 0;
  if (target.attackSerial !== t.targetSerial && target.moveId.includes('feint')) {
    memory.enemyFeints = bounded(memory.enemyFeints + 1);memory.round.feints = bounded(memory.round.feints + 1);
  }
  t.targetSerial = target.attackSerial;
  const stalled = observation.moving && !self.moveId && !self.stunFrames && observation.distance > 2 && (observation.collision || Math.abs(self.position.x - t.x) + Math.abs(self.position.z - t.z) < .015);
  t.stalled = stalled ? Math.min(180, t.stalled + 1) : Math.max(0, t.stalled - 3);
  if (t.stalled === 90) { memory.stuck = bounded(memory.stuck + 1);memory.round.stuck = bounded(memory.round.stuck + 1); }
  t.distance = observation.distance;t.x = self.position.x;t.z = self.position.z;
}

/** Only resolved public contacts; bounded event IDs prevent duplicate frame feeds. */
export function observePersonalityEvents(memory: CombatAiPersonality, events: readonly CombatEvent[], fighterId: string) {
  for (const event of events) {
    if (event.attackerId !== fighterId || event.environmentId || !['hit', 'block', 'parry', 'guard-break'].includes(event.kind) || memory.transient.eventIds.includes(event.id)) continue;
    memory.transient.eventIds.push(event.id);
    if (memory.transient.eventIds.length > 64) memory.transient.eventIds.shift();
    const entry = moveRecord(memory, event.moveId || 'interaction');
    if (event.moveId === memory.transient.move) memory.transient.contact = true;
    if (event.kind === 'parry') { incrementMove(entry, 'parries');memory.parried = bounded(memory.parried + 1);memory.round.parries = bounded(memory.round.parries + 1); }
    else if (event.kind === 'block') incrementMove(entry, 'blocks');
    else if (event.damage > 0) { incrementMove(entry, 'hits');memory.round.hits = bounded(memory.round.hits + 1);memory.parried = bounded(memory.parried - .25); }
  }
}

export function resetPersonalityRound(memory: CombatAiPersonality) {
  memory.rounds = Math.min(10000, memory.rounds + 1);memory.round = round();memory.transient = transient();
  // Recent evidence matters more, but does not vanish at the round bell.
  memory.parried *= .8;memory.enemyFeints *= .8;memory.stuck *= .8;
}

export function personalityWeights(memory: CombatAiPersonality) {
  return { ...memory.preferences, grounded: 2 - memory.preferences.jumping,
    feint: Math.min(2, .15 + memory.parried * .22), parryCaution: Math.min(1, memory.enemyFeints * .15),
    reroute: Math.min(1, memory.stuck * .15 + memory.transient.stalled / 120) };
}
export function movePreference(memory: CombatAiPersonality, moveId: string) {
  const move = memory.moves.find(entry => entry.id === moveId);
  return move ? Math.max(.15, Math.min(1.8, 1 + (move.hits * .4 - move.parries * .9 - move.whiffs * .35) / Math.max(1, move.attempts))) : 1;
}

export function observeEvents(memory: CombatAiPersonality, observation: { state: CombatSnapshot; events: readonly CombatEvent[]; fighterId: string; targetId: string }) {
  observePersonalityEvents(memory, observation.events, observation.fighterId);
}
