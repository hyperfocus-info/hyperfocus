import type { CommunityState, CommunityTuning } from './policy.ts';
import { readObject, readList, readTuple, requireBoolean, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';

const id = (value: unknown) => { communityId(value);return value; };
const time = (value: unknown) => { communityTime(value);return value; };
const fields: ObjectReaders<CommunityState> = {
  version: value => requireOneOf(value, [1]), roomId: id, revision: time, nextMember: time, nextBattle: time,
  members: value => readList(value, value => readObject(value, { userId: id, joinedOrder: time, wantsQueue: requireBoolean, disconnectedUntil: value => value === null ? null : time(value) })),
  queue: value => readList(value, id),
  battle: value => value === null ? null : readObject(value, { id, phase: value => requireOneOf(value, ['ready', 'playing']), fighters: value => readTuple(value, [id, id]), ready: value => readTuple(value, [requireBoolean, requireBoolean]), deadline: time }),
  streak: value => value === null ? null : readObject(value, { userId: id, wins: time }),
  results: value => readList(value, value => readObject(value, { battleId: id, fighters: value => readTuple(value, [id, id]), winner: value => requireOneOf(value, [0, 1, null]) })),
};

export function communityId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error('Invalid community identity.');
}
export function communityRoomId(value: unknown): asserts value is string {
  communityId(value);if (value.length > 64) throw new Error('Community room ID must contain at most 64 characters.');
}
export function communityTime(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid community clock or counter.');
}
export function communityTuning(options: Partial<CommunityTuning>): CommunityTuning {
  const tuning = { maxMembers: options.maxMembers ?? 8, streakCap: options.streakCap ?? 3, readyTimeoutMs: options.readyTimeoutMs ?? 15000, disconnectGraceMs: options.disconnectGraceMs ?? 30000 };
  for (const [value, min, max] of [[tuning.maxMembers, 2, 32], [tuning.streakCap, 1, 100], [tuning.readyTimeoutMs, 1, 300000], [tuning.disconnectGraceMs, 1, 300000]]) {
    if (!Number.isSafeInteger(value) || value! < min! || value! > max!) throw new Error('Invalid community tuning.');
  }
  return tuning;
}
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join()) throw new Error('Invalid community record shape.');
}
function pair(value: unknown): asserts value is [string, string] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Invalid community fighter pair.');
  value.forEach(communityId);if (value[0] === value[1]) throw new Error('Duplicate community fighter.');
}
export function readCommunityState(value: unknown, roomId: string, tuning: CommunityTuning): CommunityState {
  communityRoomId(roomId);
  object(value, ['version', 'roomId', 'revision', 'nextMember', 'nextBattle', 'members', 'queue', 'battle', 'streak', 'results']);
  if (value.version !== 1 || value.roomId !== roomId) throw new Error('Unsupported community version or room.');
  for (const key of ['revision', 'nextMember', 'nextBattle']) communityTime(value[key]);
  if (value.nextMember === 0 || value.nextBattle === 0) throw new Error('Invalid community sequence.');
  if (!Array.isArray(value.members) || value.members.length > tuning.maxMembers || !Array.isArray(value.queue) || !Array.isArray(value.results) || value.results.length > 64) throw new Error('Invalid community collection bounds.');
  const memberValues = value.members;
  const members = new Set<string>(), orders = new Set<number>(), queued = new Set<string>();
  for (const member of value.members) {
    object(member, ['userId', 'joinedOrder', 'wantsQueue', 'disconnectedUntil']);communityId(member.userId);communityTime(member.joinedOrder);
    if (members.has(member.userId) || orders.has(member.joinedOrder) || member.joinedOrder === 0 || member.joinedOrder >= Number(value.nextMember) || typeof member.wantsQueue !== 'boolean') throw new Error('Invalid community member.');
    if (member.disconnectedUntil !== null) communityTime(member.disconnectedUntil);
    members.add(member.userId);orders.add(member.joinedOrder);
  }
  for (const id of value.queue) {
    communityId(id);if (!members.has(id) || queued.has(id) || !value.members.find(member => member.userId === id)?.wantsQueue) throw new Error('Invalid community queue.');queued.add(id);
  }
  if (value.battle !== null) {
    object(value.battle, ['id', 'phase', 'fighters', 'ready', 'deadline']);const battle = value.battle;
    if (typeof battle.id !== 'string' || !battle.id.startsWith(`${roomId}:`) || !['ready', 'playing'].includes(String(battle.phase))) throw new Error('Invalid community battle.');
    const sequence = Number(battle.id.slice(roomId.length + 1));communityTime(sequence);
    if (sequence < 1 || sequence >= Number(value.nextBattle) || `${roomId}:${sequence}` !== battle.id) throw new Error('Invalid community battle sequence.');
    pair(battle.fighters);communityTime(battle.deadline);
    if (battle.fighters.some(id => !members.has(id) || queued.has(id)) || !Array.isArray(battle.ready) || battle.ready.length !== 2 || battle.ready.some(item => typeof item !== 'boolean') || (battle.phase === 'playing' && battle.ready.some(item => !item))) throw new Error('Invalid community battle membership.');
    if (battle.phase === 'ready' && battle.fighters.some(id => !memberValues.find(member => member.userId === id)?.wantsQueue)) throw new Error('Ready fighters must want to queue.');
  }
  const parsed = readObject(value, fields);
  const active = parsed.battle?.fighters ?? [];
  if (parsed.members.some(member => member.wantsQueue && !queued.has(member.userId) && !active.some(id => id === member.userId))) throw new Error('Community member has no queue position.');
  if (value.streak !== null) {
    object(value.streak, ['userId', 'wins']);communityId(value.streak.userId);communityTime(value.streak.wins);
    if (!members.has(value.streak.userId) || value.streak.wins < 1 || value.streak.wins >= tuning.streakCap) throw new Error('Invalid community streak.');
  }
  const receipts = new Set<string>();let previousSequence = 0;
  for (const result of value.results) {
    object(result, ['battleId', 'fighters', 'winner']);pair(result.fighters);
    if (typeof result.battleId !== 'string' || !result.battleId.startsWith(`${roomId}:`) || receipts.has(result.battleId) || (result.winner !== 0 && result.winner !== 1 && result.winner !== null) || result.battleId === parsed.battle?.id) throw new Error('Invalid community result receipt.');
    const sequence = Number(result.battleId.slice(roomId.length + 1));communityTime(sequence);
    if (sequence <= previousSequence || sequence >= Number(value.nextBattle) || `${roomId}:${sequence}` !== result.battleId) throw new Error('Invalid community result sequence.');receipts.add(result.battleId);previousSequence = sequence;
  }
  return structuredClone(parsed);
}
