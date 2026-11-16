import { defineSchema } from '@hyperfocus/engine/protocol';
import { combatRoomSnapshotDefinition, readCombatRoomSnapshot, type CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { isPlainRecord as object } from '@hyperfocus/utilities/records';
import { profileMetadataDefinition, readProfileMetadata, type ProfileMetadata } from '../appearance/profile.ts';

export const trainingProtocolVersion = 5;
export type TrainingRoomSnapshot = CombatRoomSnapshot & ProfileMetadata & { training: {
  version: typeof trainingProtocolVersion; mode: 'training'; revision: number; phase: 'waiting' | 'playing' | 'interrupted'; users: string[];
  proposalId: string; action: 'none' | 'reset' | 'swap'; requestedBy: string; deadline: number; error: string;
} };
export type TrainingCommand = { type: 'training-propose'; matchId: string; requestId: string; action: 'reset' | 'swap' }
  | { type: 'training-respond'; matchId: string; proposalId: string; accept: boolean };
export const trainingRoomSnapshotSchema = defineSchema<TrainingRoomSnapshot>({
  ...combatRoomSnapshotDefinition, ...profileMetadataDefinition,
  training: { version: 'u8', mode: 'string:16', revision: 'u32', phase: 'string:16', users: { type: 'array', item: 'string:128', maxLength: 2 },
    proposalId: 'string:128', action: 'string:16', requestedBy: 'string:128', deadline: 'f64', error: 'string:512' },
});
const encoder = new TextEncoder();
function text(value: unknown, max: number, empty = false): value is string { return typeof value === 'string' && (empty || value.trim().length > 0) && encoder.encode(value).length <= max; }
function integer(value: unknown, max = 0xffffffff): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max; }
function ids(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 2 && value.every(id => text(id, 128)) && new Set(value).size === value.length; }
export function readTrainingCommand(value: unknown): TrainingCommand {
  if (!object(value) || !text(value.matchId, 96)) throw new Error('Invalid training action.');
  const keys = Object.keys(value).sort().join(',');
  if (value.type === 'training-propose' && keys === 'action,matchId,requestId,type' && text(value.requestId, 128) && (value.action === 'reset' || value.action === 'swap')) {
    return { type: value.type, matchId: value.matchId, requestId: value.requestId, action: value.action };
  }
  if (value.type === 'training-respond' && keys === 'accept,matchId,proposalId,type' && text(value.proposalId, 128) && typeof value.accept === 'boolean') {
    return { type: value.type, matchId: value.matchId, proposalId: value.proposalId, accept: value.accept };
  }
  throw new Error('Invalid training action.');
}
export function readTrainingSnapshot(value: unknown): TrainingRoomSnapshot {
  const combat = readCombatRoomSnapshot(value);value = combat;
  if (!object(value) || !text(value.matchId, 96, true) || !text(value.contentId, 128) || !integer(value.seed) || !ids(value.seats)
    || value.status !== 'waiting' && value.status !== 'ready' && value.status !== 'recovering' && value.status !== 'interrupted' || typeof value.confirmedFrame !== 'number' || !Number.isSafeInteger(value.confirmedFrame) || value.confirmedFrame < -1
    || value.confirmedFrame > 0x7ffffffe || !object(value.frames) || Object.keys(value.frames).length > 512 || !object(value.training)) throw new Error('Invalid training snapshot.');
  const t = value.training;
  if (t.version !== trainingProtocolVersion || t.mode !== 'training' || !integer(t.revision) || t.phase !== 'waiting' && t.phase !== 'playing' && t.phase !== 'interrupted'
    || !ids(t.users) || !text(t.proposalId, 128, true) || t.action !== 'none' && t.action !== 'reset' && t.action !== 'swap' || !text(t.requestedBy, 128, true)
    || typeof t.deadline !== 'number' || !Number.isSafeInteger(t.deadline) || t.deadline < 0 || !text(t.error, 512, true)) throw new Error('Invalid training metadata.');
  if (t.phase === 'playing' && (!['ready', 'recovering'].includes(value.status) || !value.matchId || t.users.length !== 2 || value.seats.length !== 2)
    || t.phase === 'waiting' && value.status !== 'waiting' || t.phase === 'interrupted' && value.status !== 'interrupted'
    || (t.proposalId ? t.phase !== 'playing' || t.action === 'none' || !t.users.includes(t.requestedBy) || t.deadline === 0 : t.action !== 'none' || t.requestedBy !== '' || t.deadline !== 0)) throw new Error('Inconsistent training lifecycle.');
  return { ...combat, ...readProfileMetadata(value), training: {
    ...t, version: t.version, mode: t.mode, revision: t.revision, phase: t.phase, users: t.users, proposalId: t.proposalId, action: t.action, requestedBy: t.requestedBy, deadline: t.deadline, error: t.error,
  } };
}
