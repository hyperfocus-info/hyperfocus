import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createQuickPlayRatings } from './ratings.ts';

test('reservations freeze ratings and participants, reject overlapping matches and apply results exactly once', () => {
  let now = 1000;const ledger = createQuickPlayRatings({ path: ':memory:', now: () => now });
  try {
    expect(ledger.get({ userId: 'alice' })).toBe(1000);
    const first = ledger.reserve({ matchId: 'one', users: ['alice', 'bob'] });
    expect(first).toMatchObject({ before: [1000, 1000], after: [1000, 1000], status: 'pending', winner: null });
    now++;expect(ledger.reserve({ matchId: 'one', users: ['alice', 'bob'] })).toEqual(first);
    expect(() => ledger.reserve({ matchId: 'one', users: ['bob', 'alice'] })).toThrow('participants');
    expect(() => ledger.reserve({ matchId: 'two', users: ['alice', 'cara'] })).toThrow('unfinished');
    const result = ledger.complete({ matchId: 'one', winner: 0 });expect(result.after).toEqual([1012, 988]);
    now++;expect(ledger.complete({ matchId: 'one', winner: 0 })).toEqual(result);
    expect(() => ledger.complete({ matchId: 'one', winner: 1 })).toThrow('Conflicting');
    expect(() => ledger.abort({ matchId: 'one' })).toThrow('Conflicting');
    expect(ledger.get({ userId: 'alice' })).toBe(1012);expect(ledger.get({ userId: 'bob' })).toBe(988);
    const next = ledger.reserve({ matchId: 'two', users: ['alice', 'cara'] });expect(next.before).toEqual([1012, 1000]);
    result.after[0] = 0;next.users[0] = 'tampered';expect(ledger.pending()[0]!.users).toEqual(['alice', 'cara']);
  } finally { ledger.close(); }
});

test('draw and explicit interruption are distinct durable outcomes and invalid identities never reserve users', () => {
  const ledger = createQuickPlayRatings({ path: ':memory:', now: () => 1000 });
  try {
    expect(() => ledger.reserve({ matchId: 'same', users: ['alice', 'alice'] })).toThrow('differ');
    expect(() => ledger.reserve({ matchId: 'a'.repeat(129), users: ['alice', 'bob'] })).toThrow('identity');
    expect(() => ledger.get({ userId: '' })).toThrow('identity');
    expect(() => ledger.complete({ matchId: 'missing', winner: null })).toThrow('Unknown');
    ledger.reserve({ matchId: 'draw', users: ['alice', 'bob'] });
    expect(ledger.complete({ matchId: 'draw', winner: null })).toMatchObject({ status: 'complete', winner: null, after: [1000, 1000] });
    ledger.reserve({ matchId: 'interrupted', users: ['alice', 'bob'] });
    const aborted = ledger.abort({ matchId: 'interrupted' });expect(aborted).toMatchObject({ status: 'aborted', after: [1000, 1000] });
    expect(ledger.abort({ matchId: 'interrupted' })).toEqual(aborted);
    expect(() => ledger.complete({ matchId: 'interrupted', winner: null })).toThrow('Conflicting');
    expect(ledger.pending()).toEqual([]);expect(ledger.get({ userId: 'alice' })).toBe(1000);
  } finally { ledger.close(); }
  expect(() => ledger.pending()).toThrow('closed');ledger.close();
});

test('SQLite rollback preserves both ratings and result receipt, and reopening recovers pending matches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tod-ratings-')), path = join(directory, 'ratings.sqlite');
  let ledger = createQuickPlayRatings({ path, now: () => 1000 });
  const inspection = new Database(path);
  try {
    const reserved = ledger.reserve({ matchId: 'one', users: ['alice', 'bob'] });ledger.close();
    ledger = createQuickPlayRatings({ path, now: () => 2000 });expect(ledger.pending()).toEqual([reserved]);
    const peer = createQuickPlayRatings({ path });
    try { expect(() => peer.reserve({ matchId: 'overlap', users: ['bob', 'cara'] })).toThrow('unfinished'); } finally { peer.close(); }
    inspection.run("CREATE TRIGGER fail_second_rating BEFORE INSERT ON tod_ratings_players WHEN NEW.user_id='bob' BEGIN SELECT RAISE(ABORT, 'injected second write failure'); END");
    expect(() => ledger.complete({ matchId: 'one', winner: 0 })).toThrow('injected');
    expect(ledger.get({ userId: 'alice' })).toBe(1000);expect(ledger.get({ userId: 'bob' })).toBe(1000);expect(ledger.pending()).toEqual([reserved]);
    inspection.run('DROP TRIGGER fail_second_rating');const result = ledger.complete({ matchId: 'one', winner: 0 });
    ledger.close();ledger = createQuickPlayRatings({ path, now: () => 3000 });
    expect(ledger.complete({ matchId: 'one', winner: 0 })).toEqual(result);expect(ledger.pending()).toEqual([]);
    expect(ledger.get({ userId: 'alice' })).toBe(1012);expect(ledger.get({ userId: 'bob' })).toBe(988);
    ledger.reserve({ matchId: 'abandoned', users: ['alice', 'bob'] });ledger.abort({ matchId: 'abandoned' });
    ledger.close();ledger = createQuickPlayRatings({ path });expect(ledger.abort({ matchId: 'abandoned' }).status).toBe('aborted');
    expect(ledger.get({ userId: 'alice' })).toBe(1012);
  } finally {
    ledger.close();inspection.close();
    if (resolve(dirname(directory)) !== resolve(tmpdir()) || !directory.includes('tod-ratings-')) throw new Error('Unsafe temporary test directory.');
    await rm(directory, { recursive: true, force: true });
  }
});
