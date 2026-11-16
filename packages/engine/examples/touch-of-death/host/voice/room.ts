import type { ReplicationSchema } from '@hyperfocus/engine/protocol';
import type { RoomType } from '@hyperfocus/engine/server';
import { emptyVoiceSnapshot, readVoiceCommand, readVoiceReportCommand, readVoiceReportResult, readVoiceIceConfig, type VoicePeer, type VoiceSnapshot, type VoiceIceServer } from '../../src/network/voice/protocol.ts';
import type { createRoomSocialService } from '../community/social.ts';
import type { createVoiceReportService } from './report-service.ts';

type Member = VoicePeer;
type Receipt = { kind: 'join' | 'mic'; sessionId: string; enabled?: boolean };
type Budget = { at: number; controls: number; signals: number; descriptions: number; bytes: number; reports: number };
type VoiceState = { revision: number; members: Map<string, Member>; observed: Map<string, Set<string>>; receipts: Map<string, Map<string, Receipt>>; budgets: Map<string, Budget>; results: Map<string, { requestId: string; error: string }>; visibility: string };
/** App-owned opt-in voice authorization; media never enters this server or persistence. */
export function withRoomVoice<S, I, T>(options: {
  room: RoomType<S, I, unknown, T>; schema: ReplicationSchema<T & { voice: VoiceSnapshot }>; social: Pick<ReturnType<typeof createRoomSocialService>, 'allowCommunication'>; now?: () => number;
  iceServers?: VoiceIceServer[]; iceTransportPolicy?: 'all' | 'relay';
  reports?: Pick<ReturnType<typeof createVoiceReportService>, 'report' | 'receipt'>;
}): RoomType<S, I, unknown, T & { voice: VoiceSnapshot }> {
  const { room, social } = options, now = options.now ?? Date.now;
  const ice = readVoiceIceConfig({ iceServers: options.iceServers, iceTransportPolicy: options.iceTransportPolicy });
  if (room.getReplication) throw new Error('Voice requires ordinary snapshot replication.');
  const { getReplication: _custom, ...hooks } = room;
  const rooms = new Map<string, VoiceState>();
  function state(id: string) { let value = rooms.get(id);if (!value) { value = { revision: 0, members: new Map(), observed: new Map(), receipts: new Map(), budgets: new Map(), results: new Map(), visibility: '' };rooms.set(id, value); }return value; }
  function change(value: VoiceState) { if (value.revision === 0xffffffff) throw new Error('Voice revision exhausted. Rejoin another room.');value.revision++; }
  function allowed(roomId: string, a: VoicePeer, b: VoicePeer) { return a.playerId === b.playerId || social.allowCommunication({ roomId, userId: a.userId, otherUserId: b.userId }); }
  function refresh(roomId: string) {
    const value = state(roomId), members = [...value.members.values()];
    const visibility = members.map(a => `${a.playerId}:${members.filter(b => allowed(roomId, a, b)).map(b => b.sessionId).join(',')}`).join('|');
    if (visibility !== value.visibility) { value.visibility = visibility;change(value); }
  }
  function budget(value: VoiceState, playerId: string) {
    const time = now();if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid voice clock.');
    let result = value.budgets.get(playerId);if (!result || time - result.at >= 10000) { result = { at: time, controls: 0, signals: 0, descriptions: 0, bytes: 0, reports: 0 };value.budgets.set(playerId, result); }return result;
  }
  return {
    ...hooks,
    schema: options.schema,
    async onEvent(ctx, player, raw) {
      if (!raw || typeof raw !== 'object' || !('type' in raw) || typeof raw.type !== 'string' || !raw.type.startsWith('voice-')) { await room.onEvent?.(ctx, player, raw);refresh(ctx.roomId);return; }
      if (ctx.players.get(player.id)?.userId !== player.userId) return;
      const value = state(ctx.roomId), result = { requestId: value.results.get(player.id)?.requestId ?? '', error: '' };
      if (raw.type === 'voice-report') {
        let receipt;
        try { receipt = readVoiceReportResult({ type: 'voice-report-result', requestId: Reflect.get(raw, 'requestId'), error: '' }); } catch { return; }
        try {
          const command = readVoiceReportCommand(raw), member = value.members.get(player.id), target = value.members.get(command.targetPlayerId);
          if (!options.reports) throw Error('Voice reporting is unavailable on this host.');
          if (++budget(value, player.id).reports > 12) throw Error('Too many report attempts. Try again shortly.');
          const prior = await options.reports.receipt({ reporterId: player.userId, requestId: command.requestId }).catch(() => { throw Error('Could not save this report. Retry the same report.'); });
          if (prior) {
            if (prior.roomId !== ctx.roomId || prior.reporterSessionId !== command.sessionId || prior.targetSessionId !== command.targetSessionId || prior.reason !== command.reason
              || !value.observed.get(player.id)?.has(JSON.stringify([command.targetPlayerId, command.targetSessionId]))) throw Error('That report request ID was already used.');
            ctx.broadcast(receipt, { recipients: [player.id], durability: 'transient' });return;
          }
          if (!member || member.sessionId !== command.sessionId || !target || target.playerId === player.id || target.sessionId !== command.targetSessionId
            || ctx.players.get(target.playerId)?.userId !== target.userId || !value.observed.get(player.id)?.has(JSON.stringify([target.playerId, target.sessionId]))) throw Error('That voice participant or session is no longer available to report.');
          try { await options.reports.report({ reporterId: player.userId, roomId: ctx.roomId, reporterSessionId: member.sessionId, targetId: target.userId,
            targetSessionId: target.sessionId, requestId: command.requestId, reason: command.reason }); }
          catch { throw Error('Could not save this report. Retry the same report.'); }
        } catch (cause) { receipt.error = cause instanceof Error ? cause.message.slice(0, 160) : 'Could not save this report. Retry.'; }
        ctx.broadcast(receipt, { recipients: [player.id], durability: 'transient' });return;
      }
      try {
        const command = readVoiceCommand(raw), member = value.members.get(player.id), rate = budget(value, player.id);
        const receipts = value.receipts.get(player.id) ?? new Map<string, Receipt>();
        const remember = (requestId: string, receipt: Receipt) => { receipts.set(requestId, receipt);while (receipts.size > 32) receipts.delete(receipts.keys().next().value!);value.receipts.set(player.id, receipts); };
        if (command.type === 'voice-join' || command.type === 'voice-mic') result.requestId = command.requestId;
        if (command.type === 'voice-join') {
          const prior = receipts.get(command.requestId);
          if (prior) {
            if (prior.kind !== 'join') throw new Error('That voice request ID was already used.');
            if (!member || member.sessionId !== prior.sessionId) throw new Error('That voice session ended. Join again with a new request.');
          } else {
            if (++rate.controls > 20) throw new Error('Too many voice requests. Try again shortly.');
            if (!member) {
              if (value.members.size >= 8) throw new Error('Voice is full. Up to eight people can join.');
              if ([...value.members.values()].some(peer => peer.userId === player.userId)) throw new Error('This account already joined voice.');
              value.members.set(player.id, { playerId: player.id, userId: player.userId, sessionId: crypto.randomUUID(), mic: false });change(value);
            }
            remember(command.requestId, { kind: 'join', sessionId: value.members.get(player.id)!.sessionId });
          }
        } else {
          if (!member || member.sessionId !== command.sessionId) throw new Error('That voice session has ended. Join voice again.');
          if (command.type === 'voice-leave') { value.members.delete(player.id);value.observed.delete(player.id);change(value); }
          else if (command.type === 'voice-mic') {
            const prior = receipts.get(command.requestId);
            if (prior && (prior.kind !== 'mic' || prior.sessionId !== command.sessionId || prior.enabled !== command.enabled)) throw new Error('That voice request ID was already used.');
            if (prior && member.mic !== prior.enabled) throw new Error('That microphone request was superseded. Use a new request.');
            if (!prior) {
              if (command.enabled && ++rate.controls > 20) throw new Error('Too many microphone changes. Try again shortly.');
              if (member.mic !== command.enabled) { member.mic = command.enabled;change(value); }
              remember(command.requestId, { kind: 'mic', sessionId: member.sessionId, enabled: command.enabled });
            }
          } else {
            const target = value.members.get(command.targetPlayerId);
            if (!target || target.playerId === player.id || target.sessionId !== command.targetSessionId || !ctx.players.has(target.playerId) || !allowed(ctx.roomId, member, target)) throw new Error('That voice partner is unavailable.');
            const bytes = new TextEncoder().encode(command.data).length;
            if (++rate.signals > 120 || (command.kind !== 'ice' && ++rate.descriptions > 8) || (rate.bytes += bytes) > 262144) throw new Error('Voice negotiation is busy. Try again shortly.');
            ctx.broadcast({ type: 'voice-signal', fromPlayerId: player.id, fromUserId: player.userId, sessionId: member.sessionId,
              targetSessionId: target.sessionId, kind: command.kind, data: command.data }, { recipients: [target.playerId], durability: 'transient' });
          }
        }
      } catch (cause) { result.error = cause instanceof Error ? cause.message.slice(0, 160) : 'Voice request failed. Try again.'; }
      value.results.set(player.id, result);refresh(ctx.roomId);
    },
    async onLeave(ctx, player, reason) {
      const value = state(ctx.roomId);if (value.members.delete(player.id)) change(value);
      value.receipts.delete(player.id);value.budgets.delete(player.id);value.results.delete(player.id);refresh(ctx.roomId);
      value.observed.delete(player.id);
      await room.onLeave?.(ctx, player, reason);
    },
    async update(ctx, dt) { await room.update?.(ctx, dt);refresh(ctx.roomId); },
    getSnapshot(ctx, player) {
      refresh(ctx.roomId);const value = state(ctx.roomId), member = value.members.get(player.id), voice = emptyVoiceSnapshot();
      voice.revision = value.revision;Object.assign(voice, value.results.get(player.id));
      voice.reportingEnabled = !!options.reports;
      if (member) { Object.assign(voice, structuredClone(ice));voice.sessionId = member.sessionId;voice.mic = member.mic;voice.peers = [...value.members.values()].filter(peer => allowed(ctx.roomId, member, peer)).map(({ playerId, userId, sessionId, mic }) => ({ playerId, userId, sessionId, mic })); }
      if (member) {
        const observed = value.observed.get(player.id) ?? new Set<string>();
        for (const peer of voice.peers) observed.add(JSON.stringify([peer.playerId, peer.sessionId]));
        while (observed.size > 64) observed.delete(observed.values().next().value!);
        value.observed.set(player.id, observed);
      }
      return { ...room.getSnapshot(ctx, player), voice };
    },
    async onDispose(ctx, reason) { rooms.delete(ctx.roomId);await room.onDispose?.(ctx, reason); },
  };
}
