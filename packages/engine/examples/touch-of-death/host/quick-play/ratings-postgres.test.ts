import { expect, test } from 'bun:test';
import { SQL } from 'bun';
import { createPostgresQuickPlayRatings } from './ratings-postgres.ts';
import { createPostgresRewardService } from '../progression/service-postgres.ts';
import { newRewardState } from '../../src/rewards/model.ts';
import { createQuickPlayMatchmaker } from './matchmaker.ts';
import { createQuickPlayCoordinator } from './coordinator.ts';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';

const urlFile = process.env.TOUCH_OF_DEATH_POSTGRES_TEST_URL_FILE;
test.skipIf(!urlFile)('PostgreSQL ratings and rewards commit atomically across concurrent retries and fresh pools', async () => {
  const url = (await Bun.file(urlFile!).text()).trim(), schema = `tod_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new SQL(url), sql = new SQL({ url, connection: { search_path: schema }, max: 4 });
  let reopened: SQL | undefined;
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    const ratings = await createPostgresQuickPlayRatings({ sql, now: () => 1000 });
    const reserve: Parameters<typeof ratings.reserve>[0] = { matchId: 'first', users: ['a', 'b'] };
    const reservations = await Promise.all(Array.from({ length: 6 }, () => ratings.reserve(reserve)));
    expect(reservations.every(value => JSON.stringify(value) === JSON.stringify(reservations[0]))).toBe(true);
    await expect(ratings.reserve({ matchId: 'overlap', users: ['b', 'c'] })).rejects.toThrow('unfinished');
    await sql`ALTER TABLE tod_pg_ratings_players ADD CONSTRAINT test_failure CHECK (user_id <> 'b' OR rating = 1000)`;
    await expect(ratings.complete({ matchId: 'first', winner: 0 })).rejects.toThrow();
    expect(await ratings.get({ userId: 'a' })).toBe(1000);expect((await ratings.pending()).map(value => value.matchId)).toEqual(['first']);
    await sql`ALTER TABLE tod_pg_ratings_players DROP CONSTRAINT test_failure`;
    const completed = await Promise.all(Array.from({ length: 6 }, () => ratings.complete({ matchId: 'first', winner: 0 })));
    expect(completed.every(value => value.after[0] === 1012 && value.after[1] === 988)).toBe(true);
    await expect(ratings.complete({ matchId: 'first', winner: 1 })).rejects.toThrow('Conflicting');
    expect(await ratings.pending()).toEqual([]);
    await ratings.reserve({ matchId: 'aborted', users: ['a', 'b'] });await ratings.abort({ matchId: 'aborted' });expect(await ratings.get({ userId: 'a' })).toBe(1012);

    let draws = 0;
    const rewards = await createPostgresRewardService({ sql, now: () => 86400000, random: () => { draws++;return .99; } });
    const daily = { type: 'reward-command', action: 'daily', requestId: 'daily' };
    await Promise.all(Array.from({ length: 6 }, () => rewards.command({ userId: 'a', command: daily })));
    expect(draws).toBe(1);expect((await rewards.read({ userId: 'a' })).coins).toBe(50);
    await rewards.command({ userId: 'a', command: { ...daily, action: 'next', requestId: 'next' } });
    await Promise.all(Array.from({ length: 6 }, () => rewards.command({ userId: 'a', command: { ...daily, action: 'wheel', requestId: 'wheel' } })));
    expect((await rewards.read({ userId: 'a' })).coins).toBe(300);
    await sql`INSERT INTO tod_pg_rewards (user_id,state) VALUES (${'b'},${{ ...newRewardState(), coins: 1000000000 }}::jsonb)`;
    await expect(rewards.awardMatch({ matchId: 'earned', userIds: ['a', 'b'], winnerId: 'a' })).rejects.toThrow();
    expect((await rewards.read({ userId: 'a' })).coins).toBe(300);
    expect((await sql`SELECT * FROM tod_pg_reward_matches WHERE match_id='earned'`).length).toBe(0);
    await sql`UPDATE tod_pg_rewards SET state=${newRewardState()}::jsonb WHERE user_id='b'`;
    await Promise.all(Array.from({ length: 6 }, () => rewards.awardMatch({ matchId: 'earned', userIds: ['a', 'b'], winnerId: 'a' })));
    expect((await rewards.read({ userId: 'a' })).coins).toBe(360);expect((await rewards.read({ userId: 'b' })).coins).toBe(40);
    await expect(rewards.awardMatch({ matchId: 'earned', userIds: ['a', 'b'], winnerId: 'b' })).rejects.toThrow('conflicts');

    reopened = new SQL({ url, connection: { search_path: schema }, max: 2 });
    const persisted = await createPostgresQuickPlayRatings({ sql: reopened });
    expect((await persisted.complete({ matchId: 'first', winner: 0 })).after).toEqual([1012, 988]);
    const persistedRewards = await createPostgresRewardService({ sql: reopened });
    const social = { receiptId: 'social:concurrent', userIds: ['social-a', 'social-b'] };
    await Promise.all(Array.from({ length: 6 }, () => rewards.awardSocial(social)));
    await persistedRewards.awardSocial(social);
    expect(await persistedRewards.read({ userId: 'social-a' })).toMatchObject({ coins: 25, matches: 0, wins: 0 });
    for (let index = 0; index < 5; index++) await rewards.awardSocial({ receiptId: `social:cap-${index}`, userIds: ['social-a', `social-${index}`] });
    expect((await rewards.read({ userId: 'social-a' })).coins).toBe(100);
    expect((await persistedRewards.command({ userId: 'a', command: daily })).coins).toBe(360);
    const services = createDurableMmoServices(createMemoryDurableServiceStore());
    const matchmaker = createQuickPlayMatchmaker({ services, ratings: persisted, region: 'local', contentId: 'test', latency: () => 10 });
    const coordinator = createQuickPlayCoordinator({ matchmaker, ratings: persisted, onResult: value => persistedRewards.awardMatch(value) });
    for (const userId of ['a', 'b']) { await coordinator.join({ userId, connectionId: userId });await coordinator.search({ userId, connectionId: userId, requestId: `queue-${userId}` }); }
    expect(coordinator.view({ userId: 'a' }).rating).toBe(1012);await coordinator.tick();const matchId = coordinator.view({ userId: 'a' }).matchId;
    for (const userId of ['a', 'b']) await coordinator.accept({ userId, connectionId: userId, matchId });
    await coordinator.complete({ matchId, winner: 0 });expect(coordinator.view({ userId: 'a' }).rating).toBe(await persisted.get({ userId: 'a' }));
    expect((await persistedRewards.read({ userId: 'a' })).matches).toBe(2);await coordinator.shutdown();
  } finally {
    await reopened?.close();await sql.close();
    // Generated test-owned schema only; never mutate the public application schema.
    if (!/^tod_test_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe test schema.');
    await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;await admin.close();
  }
}, 120000);
