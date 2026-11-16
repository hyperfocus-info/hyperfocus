import type { RoomType } from '@hyperfocus/engine/server';
import type { ProfileMetadata } from '../../src/appearance/profile.ts';
import type { createRoomSocialService } from '../community/social.ts';
import type { createUploadService } from './service.ts';
import type { createUploadReportService } from './report-service.ts';
import { withRoomUploads } from './room.ts';

export type FriendsRoomImages = {
  social?: ReturnType<typeof createRoomSocialService>; uploads?: ReturnType<typeof createUploadService>; reports?: ReturnType<typeof createUploadReportService>;
};
/** Private fighters and their spectators share pictures; simulation never consumes equipment. */
export function withFriendsRoomImages<S, I, T extends ProfileMetadata & { seats: string[] }>(options: FriendsRoomImages & { room: RoomType<S, I, unknown, T> }): RoomType<S, I, unknown, T> {
  const { room, social, uploads } = options;if (!uploads) return room;
  if (!social) throw new Error('Room images require authenticated social membership.');
  const errors = new Map<string, Map<string, string>>();
  const local = (id: string) => { let value = errors.get(id);if (!value) { value = new Map();errors.set(id, value); }return value; };
  const wrapped: RoomType<S, I, unknown, T> = { ...room,
    async onJoin(ctx, player, request) {
      await social.join({ roomId: ctx.roomId, userId: player.userId });
      try { await room.onJoin?.(ctx, player, request);local(ctx.roomId).delete(player.id); }
      catch (cause) { await social.leave({ roomId: ctx.roomId, userId: player.userId });throw cause; }
    },
    async onLeave(ctx, player, reason) { await social.leave({ roomId: ctx.roomId, userId: player.userId });local(ctx.roomId).delete(player.id);await room.onLeave?.(ctx, player, reason); },
    async onDispose(ctx, reason) { try { await room.onDispose?.(ctx, reason); } finally { await social.dispose({ roomId: ctx.roomId });errors.delete(ctx.roomId); } },
    async onEvent(ctx, player, raw) {
      if (ctx.players.get(player.id)?.userId !== player.userId) return;
      if (raw && typeof raw === 'object' && 'type' in raw && (raw.type === 'social-block' || raw.type === 'social-mute')) {
        try { const result = await social.handle({ roomId: ctx.roomId, userId: player.userId, command: raw });local(ctx.roomId).set(player.id, result.error); }
        catch { local(ctx.roomId).set(player.id, 'Could not save that image preference. Try again.'); }return;
      }
      await room.onEvent?.(ctx, player, raw);
    },
    getSnapshot(ctx, player) { return { ...room.getSnapshot(ctx, player), roomImages: { enabled: true, blockedUserIds: social.view({ roomId: ctx.roomId, userId: player.userId }).blocked, error: local(ctx.roomId).get(player.id) ?? '' } }; },
  };
  return withRoomUploads({ room: wrapped, uploads, reports: options.reports, canEquip: () => true,
    canView: ({ ctx, player, ownerId }) => room.getSnapshot(ctx, player).seats.some(id => ctx.players.get(id)?.userId === ownerId),
  });
}
