import type { SQL, TransactionSQL } from 'bun';
import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { applyRewardCommand, awardRewardMatch, awardSocialReward, newRewardState, rewardCommandSchema, rewardStateSchema } from '../../src/rewards/model.ts';

/** Borrowed pool; every mutation commits its receipt and balances in one transaction. */
export async function createPostgresRewardService(options: { sql: SQL; catalog?: AppearanceCatalog3D; now?: () => number; random?: () => number }) {
  const { sql } = options;
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('tod-rewards'))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_rewards (user_id TEXT PRIMARY KEY, state JSONB NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_reward_receipts (user_id TEXT NOT NULL, request_id TEXT NOT NULL, command TEXT NOT NULL, PRIMARY KEY(user_id,request_id))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_reward_matches (match_id TEXT PRIMARY KEY, outcome TEXT NOT NULL)`;
  });
  const items = options.catalog?.slots.flatMap(slot => slot.options.map(option => ({ slot: slot.id, option: option.id, label: `${slot.label}: ${option.label}`, ...(option.rarity ? { rarity: option.rarity } : {}) }))) ?? [];
  function user(value: string) { if (typeof value !== 'string' || !value || value.length > 128) throw Error('Invalid reward identity.'); }
  async function readIn(tx: SQL | TransactionSQL, userId: string) {
    const rows = await tx<{ state: unknown }[]>`SELECT state FROM tod_pg_rewards WHERE user_id=${userId}`;
    return rows[0] ? rewardStateSchema.parse(rows[0].state) : newRewardState();
  }
  async function save(tx: TransactionSQL, userId: string, state: ReturnType<typeof newRewardState>) {
    await tx`INSERT INTO tod_pg_rewards (user_id,state) VALUES (${userId},${state}::jsonb) ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state`;
  }
  function day() { const time = (options.now ?? Date.now)();if (!Number.isSafeInteger(time) || time < 0) throw Error('Invalid reward clock.');return Math.floor(time / 86400000); }
  return {
    day,
    read({ userId }: { userId: string }) { user(userId);return readIn(sql, userId); },
    async command({ userId, command: raw }: { userId: string; command: unknown }) {
      user(userId);const command = rewardCommandSchema.parse(raw), signature = JSON.stringify(command);
      if (command.action === 'read') return readIn(sql, userId);
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod-rewards'))`;
        const prior = await tx<{ command: string }[]>`SELECT command FROM tod_pg_reward_receipts WHERE user_id=${userId} AND request_id=${command.requestId}`;
        if (prior[0]) {
          if (prior[0].command !== signature) throw Object.assign(Error('Reward request ID already used.'), { definitive: true });
          return readIn(tx, userId);
        }
        const current = await readIn(tx, userId), today = day();
        const random = options.random?.() ?? crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
        let state;
        try { state = applyRewardCommand({ state: current, command, day: today, random, items }); }
        catch (cause) { if (cause instanceof Error) Object.assign(cause, { definitive: true });throw cause; }
        await save(tx, userId, state);
        await tx`INSERT INTO tod_pg_reward_receipts (user_id,request_id,command) VALUES (${userId},${command.requestId},${signature})`;
        return state;
      });
    },
    async awardMatch({ matchId, userIds, winnerId }: { matchId: string; userIds: readonly string[]; winnerId?: string }) {
      if (!matchId || matchId.length > 128 || userIds.length !== 2 || new Set(userIds).size !== 2 || winnerId !== undefined && !userIds.includes(winnerId)) throw Error('Invalid reward match.');
      for (const id of userIds) user(id);
      const outcome = JSON.stringify({ userIds: [...userIds].sort(), winnerId: winnerId ?? null });
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod-rewards'))`;
        const prior = await tx<{ outcome: string }[]>`SELECT outcome FROM tod_pg_reward_matches WHERE match_id=${matchId}`;
        if (prior[0]) { if (prior[0].outcome !== outcome) throw Error('Reward match result conflicts.');return; }
        for (const userId of userIds) await save(tx, userId, awardRewardMatch(await readIn(tx, userId), userId === winnerId));
        await tx`INSERT INTO tod_pg_reward_matches (match_id,outcome) VALUES (${matchId},${outcome})`;
      });
    },
    async awardSocial({ receiptId, userIds }: { receiptId: string; userIds: readonly string[] }) {
      if (!/^social:[a-zA-Z0-9:-]{1,120}$/.test(receiptId) || userIds.length !== 2 || new Set(userIds).size !== 2) throw Error('Invalid social reward receipt.');
      for (const id of userIds) user(id);
      const outcome = JSON.stringify({ kind: 'social', userIds: [...userIds].sort() });
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod-rewards'))`;
        const prior = await tx<{ outcome: string }[]>`SELECT outcome FROM tod_pg_reward_matches WHERE match_id=${receiptId}`;
        if (prior[0] && prior[0].outcome !== outcome) throw Error('Social reward receipt conflicts.');
        if (!prior[0]) {
          for (const userId of userIds) await save(tx, userId, awardSocialReward(await readIn(tx, userId), day()));
          await tx`INSERT INTO tod_pg_reward_matches (match_id,outcome) VALUES (${receiptId},${outcome})`;
        }
        return Promise.all(userIds.map(async userId => ({ userId, state: await readIn(tx, userId) })));
      });
    },
    close() {},
  };
}
