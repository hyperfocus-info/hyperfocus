import { defineSchema } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotDefinition, readCombatRoomSnapshot, type CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { isRecord as object } from '@hyperfocus/utilities/records';
import { readList, requireBoolean } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';
import { profileMetadataDefinition, readProfileMetadata, type ProfileMetadata } from '../../appearance/profile.ts';

export const quickPlayProtocolVersion = 10;
export type QuickPlayRoomSnapshot = CombatRoomSnapshot & ProfileMetadata & { quickPlay: {
  phase: 'idle' | 'searching' | 'ready' | 'playing' | 'saving' | 'result'; matchId: string; users: string[]; ready: boolean[];
  uploadsEnabled: boolean; blockedUserIds: string[]; connectionReady: boolean;
  deadline: number; rating: number; ratingDelta: number; outcome: 'none' | 'win' | 'loss' | 'draw' | 'aborted'; error: string;
} };
export type QuickPlayCommand = { type: 'quick-search' | 'quick-cancel'; requestId: string }
  | { type: 'quick-accept'; matchId: string };
export const quickPlayRoomSnapshotSchema = defineSchema<QuickPlayRoomSnapshot>({
  ...combatRoomSnapshotDefinition,
  ...profileMetadataDefinition,
  quickPlay: { uploadsEnabled: 'bool', connectionReady: 'bool', blockedUserIds: { type: 'array', item: 'string:128', maxLength: 64 }, phase: 'string:16', matchId: 'string:96', users: { type: 'array', item: 'string:128', maxLength: 2 },
    ready: { type: 'array', item: 'bool', maxLength: 2 }, deadline: 'f64', rating: 'f64', ratingDelta: 'f64', outcome: 'string:16', error: 'string:512' },
});
const encoder = new TextEncoder();
function text(value: unknown, maximum: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0) && encoder.encode(value).length <= maximum;
}
function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 2 && value.every(id => text(id, 128)) && new Set(value).size === value.length;
}
/** Search/accept intent only; identity, rating and results belong to the host. */
export function readQuickPlayCommand(value: unknown): QuickPlayCommand {
  if (!object(value)) throw new Error('Invalid Quick Play command.');
  const keys = Object.keys(value).sort().join(',');
  if ((value.type === 'quick-search' || value.type === 'quick-cancel') && keys === 'requestId,type' && text(value.requestId, 96)) return { type: value.type, requestId: value.requestId };
  if (value.type === 'quick-accept' && keys === 'matchId,type' && text(value.matchId, 96)) return { type: value.type, matchId: value.matchId };
  throw new Error('Invalid Quick Play command.');
}

/** Combat input contents remain the engine session's responsibility. */
export function readQuickPlaySnapshot(value: unknown): QuickPlayRoomSnapshot {
  const combat = readCombatRoomSnapshot(value);value = combat;
  if (!object(value) || !text(value.contentId, 128) || !text(value.matchId, 96, true) || !text(value.status, 16)
    || typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff
    || !ids(value.seats) || typeof value.confirmedFrame !== 'number' || !Number.isSafeInteger(value.confirmedFrame) || value.confirmedFrame < -1 || value.confirmedFrame > 0x7ffffffe
    || !object(value.frames) || Object.keys(value.frames).length > 512 || !object(value.quickPlay)) throw new Error('Invalid Quick Play snapshot.');
  const q = value.quickPlay;
  if (typeof q.connectionReady !== 'boolean') throw new Error('Invalid Quick Play connection readiness.');
  if (q.phase !== 'idle' && q.phase !== 'searching' && q.phase !== 'ready' && q.phase !== 'playing' && q.phase !== 'saving' && q.phase !== 'result' || !text(q.matchId, 96, true)
    || !ids(q.users) || !Array.isArray(q.ready) || q.ready.length > 2 || q.ready.some(ready => typeof ready !== 'boolean')
    || typeof q.deadline !== 'number' || !Number.isFinite(q.deadline) || q.deadline < 0
    || typeof q.rating !== 'number' || !Number.isFinite(q.rating) || typeof q.ratingDelta !== 'number' || !Number.isFinite(q.ratingDelta)
    || q.outcome !== 'none' && q.outcome !== 'win' && q.outcome !== 'loss' && q.outcome !== 'draw' && q.outcome !== 'aborted' || !text(q.error, 512, true)) throw new Error('Invalid Quick Play metadata.');
  if (typeof q.uploadsEnabled !== 'boolean' || !Array.isArray(q.blockedUserIds) || q.blockedUserIds.length > 64 || q.blockedUserIds.some(id => !text(id, 128)) || new Set(q.blockedUserIds).size !== q.blockedUserIds.length) throw new Error('Invalid Quick Play picture capability.');
  const paired = q.phase === 'ready' || q.phase === 'playing' || q.phase === 'saving' || q.phase === 'result';
  if (paired ? !q.matchId || q.users.length !== 2 || q.ready.length !== 2 : q.matchId !== '' || q.users.length !== 0 || q.ready.length !== 0) throw new Error('Invalid Quick Play pairing.');
  if (q.phase === 'result' ? q.outcome === 'none' : q.outcome !== 'none' || q.ratingDelta !== 0) throw new Error('Invalid Quick Play outcome.');
  if (q.phase === 'playing' && (value.matchId !== q.matchId || value.seats.length !== 2 || q.ready.some(ready => !ready))) throw new Error('Invalid Quick Play playing seats.');
  return { ...combat, ...readProfileMetadata(value), quickPlay: {
    ...q, phase: q.phase, matchId: q.matchId, users: q.users, ready: readList(q.ready, requireBoolean), uploadsEnabled: q.uploadsEnabled,
    blockedUserIds: readList(q.blockedUserIds, value => requireText(value)), connectionReady: q.connectionReady,
    deadline: q.deadline, rating: q.rating, ratingDelta: q.ratingDelta, outcome: q.outcome, error: q.error,
  } };
}
