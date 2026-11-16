import { defineSchema } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotDefinition, readCombatRoomSnapshot, type CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { isRecord as object } from '@hyperfocus/utilities/records';
import { readList, requireBoolean } from '@hyperfocus/utilities/validation';
import { socialSnapshotDefinition, readSocialSnapshot, type SocialSnapshot } from './social-protocol.ts';
import { profileMetadataDefinition, readProfileMetadata, type ProfileMetadata } from '../appearance/profile.ts';
import { voiceSnapshotDefinition, readVoiceSnapshot, type VoiceSnapshot } from './voice/protocol.ts';

export const communityProtocolVersion = 11;

export type CommunityRoomSnapshot = CombatRoomSnapshot & ProfileMetadata & { community: {
  revision: number; members: Array<{ userId: string; playerId: string; online: boolean; wantsQueue: boolean }>;
  queue: string[]; battleId: string; phase: 'waiting' | 'ready' | 'playing'; fighters: string[]; ready: boolean[];
  deadline: number; streakUserId: string; streakWins: number; streakCap: number; lastBattleId: string; lastFighters: string[]; lastWinner: number; error: string;
}; social: SocialSnapshot; voice: VoiceSnapshot };
export type CommunityCommand = { type: 'community-queue'; enabled: boolean }
  | { type: 'community-ready'; battleId: string }
  | { type: 'combat-spectator-cursor'; matchId: string; frame: number };
const ids = (maxLength: number) => ({ type: 'array', item: 'string:128', maxLength } as const);
export const communityRoomSnapshotSchema = defineSchema<CommunityRoomSnapshot>({
  ...combatRoomSnapshotDefinition,
  ...profileMetadataDefinition,
  voice: voiceSnapshotDefinition,
  community: { revision: 'u32', members: { type: 'array', maxLength: 32, item: {
    userId: 'string:128', playerId: 'string:128', online: 'bool', wantsQueue: 'bool',
  } }, queue: ids(32), battleId: 'string:96', phase: 'string:16', fighters: ids(2),
  ready: { type: 'array', item: 'bool', maxLength: 2 }, deadline: 'f64', streakUserId: 'string:128', streakWins: 'u32', streakCap: 'u32',
  lastBattleId: 'string:96', lastFighters: ids(2), lastWinner: 'u8', error: 'string:512' }, social: socialSnapshotDefinition,
});
const encoder = new TextEncoder();
function text(value: unknown, maximum: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.length > 0) && encoder.encode(value).length <= maximum;
}
function integer(value: unknown, maximum = 0xffffffff): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function identifiers(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(id => text(id, 128)) && new Set(value).size === value.length;
}

/** Low-rate controls convey intent only; neither result claims nor a client-selected fighter identity are accepted. */
export function readCommunityCommand(value: unknown): CommunityCommand {
  if (!object(value)) throw new Error('Invalid community command.');
  const keys = Object.keys(value).sort().join(',');
  if (value.type === 'community-queue' && keys === 'enabled,type' && typeof value.enabled === 'boolean') return { type: value.type, enabled: value.enabled };
  if (value.type === 'community-ready' && keys === 'battleId,type' && text(value.battleId, 96)) return { type: value.type, battleId: value.battleId };
  if (value.type === 'combat-spectator-cursor' && keys === 'frame,matchId,type' && text(value.matchId, 96) && integer(value.frame, 0x7fffffff)) {
    return { type: value.type, matchId: value.matchId, frame: value.frame };
  }
  throw new Error('Invalid community command.');
}

/** Validates community relationships without duplicating combat-frame validation owned by the engine session. */
export function readCommunitySnapshot(value: unknown): CommunityRoomSnapshot {
  const combat = readCombatRoomSnapshot(value);value = combat;
  if (!object(value) || !text(value.contentId, 128) || !text(value.matchId, 96, true) || !integer(value.seed)
    || !text(value.status, 16) || !identifiers(value.seats, 2) || typeof value.confirmedFrame !== 'number' || !Number.isSafeInteger(value.confirmedFrame)
    || value.confirmedFrame < -1 || value.confirmedFrame > 0x7ffffffe
    || !object(value.frames) || Object.keys(value.frames).length > 512 || !object(value.community)) throw new Error('Invalid community snapshot.');
  const c = value.community;
  if (!integer(c.revision) || !Array.isArray(c.members) || c.members.length > 32
    || !identifiers(c.queue, 32) || !identifiers(c.fighters, 2) || !identifiers(c.lastFighters, 2)
    || !text(c.battleId, 96, true) || c.phase !== 'waiting' && c.phase !== 'ready' && c.phase !== 'playing'
    || !Array.isArray(c.ready) || c.ready.some(ready => typeof ready !== 'boolean')
    || typeof c.deadline !== 'number' || !Number.isFinite(c.deadline) || c.deadline < 0
    || !text(c.streakUserId, 128, true) || !integer(c.streakWins) || !integer(c.streakCap, 100) || c.streakCap < 1 || !text(c.lastBattleId, 96, true)
    || c.lastWinner !== 0 && c.lastWinner !== 1 && c.lastWinner !== 255 || !text(c.error, 512, true)) throw new Error('Invalid community metadata.');
  const members = c.members.map(member => {
    if (!object(member) || !text(member.userId, 128) || !text(member.playerId, 128, true) || typeof member.online !== 'boolean' || typeof member.wantsQueue !== 'boolean') throw new Error('Invalid community metadata.');
    return { ...member, userId: member.userId, playerId: member.playerId, online: member.online, wantsQueue: member.wantsQueue };
  });
  const users = new Set(members.map(member => member.userId));
  const players = members.map(member => member.playerId).filter(Boolean);
  const fighters = c.fighters;
  if (users.size !== members.length || new Set(players).size !== players.length
    || [...c.queue, ...fighters].some(id => !users.has(id)) || c.queue.some(id => fighters.includes(id))
    || (c.battleId ? c.fighters.length !== 2 || c.ready.length !== 2 : c.fighters.length !== 0 || c.ready.length !== 0)
    || (c.phase !== 'waiting' && !c.battleId)
    || (c.lastBattleId ? c.lastFighters.length !== 2 : c.lastFighters.length !== 0 || c.lastWinner !== 255)) throw new Error('Invalid community membership or battle.');
  const seats = value.seats;
  if (c.phase === 'playing' && ['ready', 'recovering'].includes(value.status) && (value.matchId !== c.battleId || seats.length !== 2
    || fighters.some((id, seat) => members.find(member => member.userId === id)!.playerId !== seats[seat]))) {
    throw new Error('Invalid community playing seat assignment.');
  }
  return { ...combat, ...readProfileMetadata(value), social: readSocialSnapshot(value.social), voice: readVoiceSnapshot(value.voice), community: {
    ...c, revision: c.revision, members, queue: c.queue, battleId: c.battleId, phase: c.phase, fighters, ready: readList(c.ready, requireBoolean), deadline: c.deadline,
    streakUserId: c.streakUserId, streakWins: c.streakWins, streakCap: c.streakCap, lastBattleId: c.lastBattleId, lastFighters: c.lastFighters, lastWinner: c.lastWinner, error: c.error,
  } };
}
