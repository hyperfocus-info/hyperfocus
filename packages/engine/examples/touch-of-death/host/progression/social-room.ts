import type { RoomType } from '@hyperfocus/engine/server';
import type { CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { socialReward } from '../../src/rewards/model.ts';
import type { RewardService } from './service.ts';

/** Participation receipts: accepted inputs and host time, never client-reported wins. */
export function withSocialProgression<S, I, T extends CombatRoomSnapshot>(options: {
  room: RoomType<S, I, unknown, T>; rewards: RewardService; now?: () => number;
}): RoomType<S, I, unknown, T> {
  const now = options.now ?? Date.now;
  const rooms = new Map<string, { pair: string; match: string; frame: number; time: number; elapsed: number;
    signatures: string[]; activeAt: number[]; cappedDay: number; pending?: { receiptId: string; userIds: string[]; retryAt: number } }>();
  return { ...options.room,
    async update(ctx, delta) {
      await options.room.update?.(ctx, delta);
      const time = now();if (!Number.isSafeInteger(time) || time < 0) throw Error('Invalid social activity clock.');
      let activity = rooms.get(ctx.roomId);
      if (!activity) { activity = { pair: '', match: '', frame: -1, time, elapsed: 0, signatures: ['', ''], activeAt: [-Infinity, -Infinity], cappedDay: -1 };rooms.set(ctx.roomId, activity);return; }
      if (time < activity.time) { activity.time = time;activity.elapsed = 0;activity.activeAt = [-Infinity, -Infinity];return; }
      if (time - activity.time < 1000) return;
      const elapsed = Math.min(1000, time - activity.time);activity.time = time;
      const report = (status: 'active' | 'idle' | 'waiting' | 'saving' | 'capped', recipients: string[]) => {
        if (recipients.length) ctx.broadcast({ type: 'social-activity', elapsedMs: Math.min(socialReward.intervalMs, activity!.elapsed), status }, { recipients, durability: 'transient' });
      };
      if (activity.pending && time >= activity.pending.retryAt) {
        activity.pending.retryAt = time + 5000;
        try {
          const granted = await options.rewards.awardSocial(activity.pending);
          if (granted.every(item => item.state.socialCoins >= socialReward.dailyLimit)) activity.cappedDay = options.rewards.day();
          for (const { userId, state } of granted) {
            const recipients = [...ctx.players.values()].filter(player => player.userId === userId).map(player => player.id);
            if (recipients.length) ctx.broadcast({ type: 'reward-result', requestId: 'social-progress', state, error: '', day: options.rewards.day() }, { recipients, durability: 'transient' });
          }
          activity.pending = undefined;
        } catch {
          const recipients = [...ctx.players.values()].filter(player => activity.pending?.userIds.includes(player.userId)).map(player => player.id);
          if (recipients.length) ctx.broadcast({ type: 'reward-result', requestId: 'social-progress', error: 'Social coins could not be saved yet. The host will retry while this room stays open.', day: options.rewards.day(), retryable: true }, { recipients, durability: 'transient' });
        }
      }
      const observer = ctx.players.values().next().value;if (!observer) return;
      let snapshot = options.room.getSnapshot(ctx, observer);
      if (!snapshot.seats.includes(observer.id)) { const fighter = ctx.players.get(snapshot.seats[0] ?? '');if (fighter) snapshot = options.room.getSnapshot(ctx, fighter); }
      const players = snapshot.seats.map(id => ctx.players.get(id));
      const userIds = players.flatMap(player => player ? [player.userId] : []);
      if (snapshot.status !== 'ready' || players.length !== 2 || players.some(player => !player || player.reconnectUntil !== undefined) || new Set(userIds).size !== 2) { activity.activeAt = [-Infinity, -Infinity];report('waiting', players.flatMap(player => player ? [player.id] : []));return; }
      const pair = JSON.stringify([...userIds].sort());
      if (pair !== activity.pair) { activity.pair = pair;activity.elapsed = 0;activity.match = '';activity.cappedDay = -1; }
      if (snapshot.matchId !== activity.match) { activity.match = snapshot.matchId;activity.frame = -1;activity.signatures = ['', ''];activity.activeAt = [-Infinity, -Infinity]; }
      const frames = Object.values(snapshot.frames).filter(frame => frame.frame > activity.frame && frame.frame <= snapshot.confirmedFrame).sort((a, b) => a.frame - b.frame);
      for (const frame of frames) {
        const signature = JSON.stringify([frame.actions, frame.direction.x, frame.direction.z]);
        const acting = frame.actions.some(action => !action.startsWith('match:')) || Math.hypot(frame.direction.x, frame.direction.z) > .1;
        if (acting && signature !== activity.signatures[frame.seat]) activity.activeAt[frame.seat] = time;
        activity.signatures[frame.seat] = signature;
      }
      const advancing = snapshot.confirmedFrame > activity.frame;activity.frame = snapshot.confirmedFrame;
      const participating = advancing && activity.activeAt.every(last => time - last <= socialReward.idleGraceMs);
      if (!activity.pending && activity.cappedDay !== options.rewards.day() && participating) activity.elapsed += elapsed;
      if (!activity.pending && activity.elapsed >= socialReward.intervalMs) {
        activity.elapsed -= socialReward.intervalMs;
        activity.pending = { receiptId: `social:${crypto.randomUUID()}`, userIds, retryAt: time };
      }
      report(activity.pending ? 'saving' : activity.cappedDay === options.rewards.day() ? 'capped' : participating ? 'active' : 'idle', snapshot.seats);
    },
    async onDispose(ctx, reason) { rooms.delete(ctx.roomId);await options.room.onDispose?.(ctx, reason); },
  };
}
