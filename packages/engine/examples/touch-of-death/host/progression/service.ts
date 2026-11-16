import { Database } from 'bun:sqlite';
import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { applyRewardCommand, awardRewardMatch, awardSocialReward, newRewardState, rewardCommandSchema, rewardStateSchema } from '../../src/rewards/model.ts';

export type RewardService = { [K in keyof ReturnType<typeof createRewardService>]: K extends 'read' | 'command' ? (...args: Parameters<ReturnType<typeof createRewardService>[K]>) => ReturnType<ReturnType<typeof createRewardService>[K]> | Promise<ReturnType<ReturnType<typeof createRewardService>[K]>> : ReturnType<typeof createRewardService>[K] };

/** Single-host SQLite authority: debit, draw and durable receipt commit together. */
export function createRewardService(options: { databasePath: string; catalog?: AppearanceCatalog3D; now?: () => number; random?: () => number }) {
  const db = new Database(options.databasePath, { create: true, strict: true });
  db.run('PRAGMA journal_mode=WAL');db.run('PRAGMA busy_timeout=5000');db.run('PRAGMA synchronous=FULL');
  db.run('CREATE TABLE IF NOT EXISTS tod_rewards (user_id TEXT PRIMARY KEY, state TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS tod_reward_receipts (user_id TEXT NOT NULL, request_id TEXT NOT NULL, command TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(user_id,request_id))');
  db.run('CREATE TABLE IF NOT EXISTS tod_reward_matches (match_id TEXT PRIMARY KEY, outcome TEXT NOT NULL)');
  const items = options.catalog?.slots.flatMap(slot => slot.options.map(option => ({ slot: slot.id, option: option.id, label: `${slot.label}: ${option.label}`, ...(option.rarity ? { rarity: option.rarity } : {}) }))) ?? [];
  function user(value: string) { if (!value || value.length > 128) throw Error('Invalid reward identity.'); }
  function read({ userId }: { userId: string }) {
    user(userId);const row = db.query<{ state: string }, [string]>('SELECT state FROM tod_rewards WHERE user_id=?').get(userId);
    return row ? rewardStateSchema.parse(JSON.parse(row.state)) : newRewardState();
  }
  function save(userId: string, state: ReturnType<typeof read>) { db.run('INSERT OR REPLACE INTO tod_rewards VALUES (?,?)', [userId, JSON.stringify(state)]); }
  function day() { const now = (options.now ?? Date.now)();if (!Number.isSafeInteger(now) || now < 0) throw Error('Invalid reward clock.');return Math.floor(now / 86400000); }
  return {
    read, day,
    command({ userId, command: raw }: { userId: string; command: unknown }) {
      user(userId);const command = rewardCommandSchema.parse(raw), signature = JSON.stringify(command);
      return db.transaction(() => {
        if (command.action === 'read') return read({ userId });
        const prior = db.query<{ command: string; state: string }, [string, string]>('SELECT command,state FROM tod_reward_receipts WHERE user_id=? AND request_id=?').get(userId, command.requestId);
        if (prior) { if (prior.command !== signature) throw Object.assign(Error('Reward request ID already used.'), { definitive: true });return read({ userId }); }
        const random = options.random?.() ?? crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
        const current = read({ userId }), today = day();
        let state;
        try { state = applyRewardCommand({ state: current, command, day: today, random, items }); }
        catch (cause) { if (cause instanceof Error) Object.assign(cause, { definitive: true });throw cause; }
        save(userId, state);db.run('INSERT INTO tod_reward_receipts VALUES (?,?,?,?)', [userId, command.requestId, signature, JSON.stringify(state)]);return state;
      }).immediate();
    },
    async awardMatch({ matchId, userIds, winnerId }: { matchId: string; userIds: readonly string[]; winnerId?: string }) {
      if (!matchId || matchId.length > 128 || userIds.length !== 2 || new Set(userIds).size !== 2 || winnerId && !userIds.includes(winnerId)) throw Error('Invalid reward match.');
      for (const id of userIds) user(id);
      const outcome = JSON.stringify({ userIds: [...userIds].sort(), winnerId: winnerId ?? null });
      db.transaction(() => {
        const prior = db.query<{ outcome: string }, [string]>('SELECT outcome FROM tod_reward_matches WHERE match_id=?').get(matchId);
        if (prior) { if (prior.outcome !== outcome) throw Error('Reward match result conflicts.');return; }
        for (const userId of userIds) save(userId, awardRewardMatch(read({ userId }), userId === winnerId));
        db.run('INSERT INTO tod_reward_matches VALUES (?,?)', [matchId, outcome]);
      }).immediate();
    },
    async awardSocial({ receiptId, userIds }: { receiptId: string; userIds: readonly string[] }) {
      if (!/^social:[a-zA-Z0-9:-]{1,120}$/.test(receiptId) || userIds.length !== 2 || new Set(userIds).size !== 2) throw Error('Invalid social reward receipt.');
      for (const id of userIds) user(id);
      const outcome = JSON.stringify({ kind: 'social', userIds: [...userIds].sort() });
      return db.transaction(() => {
        const prior = db.query<{ outcome: string }, [string]>('SELECT outcome FROM tod_reward_matches WHERE match_id=?').get(receiptId);
        if (prior && prior.outcome !== outcome) throw Error('Social reward receipt conflicts.');
        if (!prior) {
          for (const userId of userIds) save(userId, awardSocialReward(read({ userId }), day()));
          db.run('INSERT INTO tod_reward_matches VALUES (?,?)', [receiptId, outcome]);
        }
        return userIds.map(userId => ({ userId, state: read({ userId }) }));
      }).immediate();
    },
    close() { db.close(); },
  };
}
