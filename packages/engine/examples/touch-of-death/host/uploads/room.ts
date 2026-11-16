import type { RoomType, RoomContext, AuthoritativePlayer } from '@hyperfocus/engine/server';
import { readUploadCommand, readUploadResponse, type UploadResponse, type UploadMetadata as WireUpload } from '../../src/uploads/protocol.ts';
import { profileId } from '../../src/appearance/profile.ts';
import type { createUploadService, UploadMetadata } from './service.ts';
import type { createUploadReportService } from './report-service.ts';

function wire(upload: UploadMetadata): WireUpload {
  return { id: upload.id, hash: upload.contentId, width: upload.width, height: upload.height, status: upload.status, reason: upload.reason };
}
/** Authenticated low-rate gallery requests. No review authority is exposed to clients. */
export function withRoomUploads<S, I, T>(options: {
  room: RoomType<S, I, unknown, T>; uploads: ReturnType<typeof createUploadService>; now?: () => number;
  reports?: Pick<ReturnType<typeof createUploadReportService>, 'report'>;
  canEquip?(input: { ctx: RoomContext<S, I, unknown>; player: AuthoritativePlayer }): boolean;
  canView?(input: { ctx: RoomContext<S, I, unknown>; player: AuthoritativePlayer; ownerId: string }): boolean;
}): RoomType<S, I, unknown, T> {
  const { room, uploads } = options, rates = new Map<string, { at: number; count: number }>();
  const rooms = new Map<string, { ctx: RoomContext<S, I, unknown>; viewers: Map<string, Set<string>> }>();
  let unsubscribe: (() => void) | undefined;
  let invalidationRevision = 0;
  function invalidate(ownerId: string) {
    invalidationRevision++;
    for (const value of rooms.values()) {
      const recipients = new Set(value.viewers.get(ownerId));value.viewers.delete(ownerId);
      for (const player of value.ctx.players.values()) if (player.userId === ownerId) recipients.add(player.id);
      const live = [...recipients].filter(id => value.ctx.players.has(id));
      if (live.length) value.ctx.broadcast({ type: 'upload-invalidate', ownerId }, { recipients: live, durability: 'transient' });
    }
  }
  function register(ctx: RoomContext<S, I, unknown>) {
    let value = rooms.get(ctx.roomId);if (!value) { value = { ctx, viewers: new Map() };rooms.set(ctx.roomId, value); }else value.ctx = ctx;
    unsubscribe ??= uploads.onChange(invalidate);return value;
  }
  return {
    ...room,
    async onJoin(ctx, player, request) { await room.onJoin?.(ctx, player, request);register(ctx); },
    async onEvent(ctx, player, raw) {
      const local = register(ctx);
      if (!raw || typeof raw !== 'object' || !('type' in raw) || typeof raw.type !== 'string' || !raw.type.startsWith('upload-')) {
        await room.onEvent?.(ctx, player, raw);
        if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'social-block') {
          const owners = new Set([...rooms.values()].flatMap(value => [...value.viewers.keys()]));for (const ownerId of owners) invalidate(ownerId);
        }
        return;
      }
      if (ctx.players.get(player.id)?.userId !== player.userId) return;
      let requestId: string;
      try { if (!('requestId' in raw)) return;profileId(raw.requestId);requestId = raw.requestId; } catch { return; }
      const response: UploadResponse = { type: 'upload-result', requestId, error: '', ownerId: player.userId, revision: 0, uploads: [], uploadId: '', raster: null, equipment: {}, emblemEnabled: uploads.supportsSlot({ slotId: 'profile-emblem' }) };
      try {
        const command = readUploadCommand(raw), time = (options.now ?? Date.now)();
        if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid upload host clock.');
        const key = `${ctx.roomId}:${player.id}`, rate = rates.get(key);
        const budget = !rate || time - rate.at >= 10000 ? { at: time, count: 0 } : rate;rates.set(key, budget);
        if (++budget.count > 12) { response.error = 'Too many image requests. Try again shortly.';throw new Error('rate'); }
        const ownerId = 'ownerId' in command && command.ownerId ? command.ownerId : player.userId;
        if (ownerId !== player.userId && ![...ctx.players.values()].some(peer => peer.userId === ownerId)) { response.error = 'That person is no longer in this room.';throw new Error('membership'); }
        response.ownerId = ownerId;
        if (ownerId !== player.userId && options.canView?.({ ctx, player, ownerId }) === false) throw new Error('audience');
        if (command.type === 'upload-equip') {
          if (options.canEquip?.({ ctx, player }) !== true) { response.error = 'Change equipped pictures between fights.';throw new Error('equipment unavailable'); }
          const result = await uploads.equip({ ownerId: player.userId, requestId, expectedRevision: command.expectedRevision, slotId: command.slotId, uploadId: command.uploadId });
          response.revision = result.revision;response.uploads = result.uploads.map(wire);response.equipment = result.equipment;
        } else if (command.type === 'upload-report') {
          if (!options.reports) { response.error = 'Image reports are not available on this host.';throw new Error('unavailable'); }
          await options.reports.report({ reporterId: player.userId, roomId: ctx.roomId, ownerId, uploadId: command.uploadId, requestId, reason: command.reason });
          response.uploadId = command.uploadId;
        } else if (command.type === 'upload-submit') {
          const result = await uploads.submit({ ownerId: player.userId, requestId, expectedRevision: command.expectedRevision, raster: command.raster });
          response.revision = result.revision;response.uploads = result.uploads.map(wire);response.equipment = result.equipment;
        } else if (command.type === 'upload-remove') {
          const result = await uploads.remove({ ownerId: player.userId, requestId, expectedRevision: command.expectedRevision, uploadId: command.uploadId });
          response.revision = result.revision;response.uploads = result.uploads.map(wire);response.equipment = result.equipment;
        } else {
          if (command.type === 'upload-read') {
            const beforeRead = invalidationRevision;
            const result = await uploads.readWithList({ ownerId, viewerId: player.userId, roomId: ctx.roomId, uploadId: command.uploadId });
            const image = result.image;
            if (beforeRead !== invalidationRevision) { response.error = 'Images changed. Refresh and try again.';throw new Error('changed'); }
            response.revision = result.revision;response.uploads = result.uploads.map(wire);response.equipment = result.equipment;
            if (!image) { response.error = 'This image is unavailable.';throw new Error('visibility'); }
            response.uploadId = command.uploadId;response.raster = image.raster;
            const viewers = local.viewers.get(ownerId) ?? new Set<string>();viewers.add(player.id);local.viewers.set(ownerId, viewers);
          } else {
            const beforeRead = invalidationRevision;
            const result = await uploads.listForViewer({ ownerId, viewerId: player.userId, roomId: ctx.roomId });
            if (beforeRead !== invalidationRevision) { response.error = 'Images changed. Refresh and try again.';throw new Error('changed'); }
            response.revision = result.revision;response.uploads = result.uploads.map(wire);response.equipment = result.equipment;
            const viewers = local.viewers.get(ownerId) ?? new Set<string>();viewers.add(player.id);local.viewers.set(ownerId, viewers);
          }
        }
      } catch {
        response.error ||= 'Could not complete that image request. Refresh and try again.';response.raster = null;response.uploadId = '';
      }
      if (response.ownerId !== player.userId && (options.canView?.({ ctx, player, ownerId: response.ownerId }) === false
        || ![...ctx.players.values()].some(peer => peer.userId === response.ownerId))) {
        response.error = 'That image audience changed. Refresh and try again.';response.uploads = [];response.equipment = {};response.raster = null;response.uploadId = '';response.revision = 0;
      }
      if (ctx.players.get(player.id)?.userId === player.userId) ctx.broadcast(readUploadResponse(response), { recipients: [player.id], durability: 'transient' });
    },
    async onLeave(ctx, player, reason) {
      invalidate(player.userId);rates.delete(`${ctx.roomId}:${player.id}`);
      for (const value of rooms.values()) for (const [owner, viewers] of value.viewers) { viewers.delete(player.id);if (!viewers.size) value.viewers.delete(owner); }
      await room.onLeave?.(ctx, player, reason);
    },
    async onDispose(ctx, reason) {
      for (const key of rates.keys()) if (key.startsWith(`${ctx.roomId}:`)) rates.delete(key);rooms.delete(ctx.roomId);
      if (!rooms.size) { unsubscribe?.();unsubscribe = undefined; }await room.onDispose?.(ctx, reason);
    },
  };
}
