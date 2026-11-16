import type { RoomType } from '@hyperfocus/engine/server';
import { rewardCommandSchema } from '../../src/rewards/model.ts';
import type { RewardService } from './service.ts';

export function withRoomProgression<S, I, T>(options: { room: RoomType<S, I, unknown, T>; rewards: RewardService }): RoomType<S, I, unknown, T> {
  const budgets = new Map<string, { start: number; count: number }>();
  return { ...options.room,
    async onEvent(ctx, player, raw) {
      if (!raw || typeof raw !== 'object' || !('type' in raw) || raw.type !== 'reward-command') return options.room.onEvent?.(ctx, player, raw);
      const parsed = rewardCommandSchema.safeParse(raw);
      if (!parsed.success || ctx.players.get(player.id)?.userId !== player.userId) return;
      const requestId = parsed.data.requestId, now = Date.now();let budget = budgets.get(player.id);
      if (!budget || now - budget.start >= 60000) { budget = { start: now, count: 0 };budgets.set(player.id, budget); }
      try {
        if (++budget.count > 60) throw Error('Too many reward requests. Try again shortly.');
        const state = await options.rewards.command({ userId: player.userId, command: parsed.data });
        ctx.broadcast({ type: 'reward-result', requestId, state, error: '', day: options.rewards.day() }, { recipients: [player.id], durability: 'transient' });
      } catch (cause) {
        const retryable = !(cause && typeof cause === 'object' && 'definitive' in cause && cause.definitive === true);
        ctx.broadcast({ type: 'reward-result', requestId, error: cause instanceof Error ? cause.message.slice(0, 240) : 'Could not save rewards. Retry.', day: options.rewards.day(), retryable }, { recipients: [player.id], durability: 'transient' });
      }
    },
    async onLeave(ctx, player, reason) { budgets.delete(player.id);await options.room.onLeave?.(ctx, player, reason); },
    async onDispose(ctx, reason) { for (const id of ctx.players.keys()) budgets.delete(id);await options.room.onDispose?.(ctx, reason); },
  };
}
