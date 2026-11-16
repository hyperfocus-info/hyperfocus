import { expect, test } from 'bun:test';
import { createPortableMemoryPersistenceAdapter } from '@hyperfocus/engine/server';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCommunityCoordinator } from './coordinator.ts';
import { initialCommunity } from './policy.ts';
import { communityTuning, readCommunityState } from './validation.ts';
import { requireRecord } from '@hyperfocus/utilities/records';

test('stored records reject orphan queue intent, overlapping rosters and reordered receipts', () => {
  const state = initialCommunity('friends');state.nextMember = 3;state.nextBattle = 4;
  state.members = ['a', 'b'].map((userId, index) => ({ userId, joinedOrder: index + 1, wantsQueue: true, disconnectedUntil: null }));state.queue = ['a', 'b'];
  const tuning = communityTuning({});expect(readCommunityState(state, 'friends', tuning)).toEqual(state);
  const orphan = structuredClone(state);orphan.queue.pop();expect(() => readCommunityState(orphan, 'friends', tuning)).toThrow('queue position');
  const overlap = structuredClone(state);overlap.battle = { id: 'friends:3', phase: 'ready', fighters: ['a', 'b'], ready: [false, false], deadline: 10 };
  expect(() => readCommunityState(overlap, 'friends', tuning)).toThrow('membership');
  overlap.queue = [];overlap.members[0]!.wantsQueue = false;expect(() => readCommunityState(overlap, 'friends', tuning)).toThrow('want to queue');
  const reversed = structuredClone(state);reversed.results = [2, 1].map(sequence => ({ battleId: `friends:${sequence}`, fighters: ['a', 'b'], winner: 0 }));
  expect(() => readCommunityState(reversed, 'friends', tuning)).toThrow('sequence');
});

test('64-character room IDs persist in SQLite and 65-character IDs reject before writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tod-community-id-'));const persistence = createSqlitePersistenceAdapter({ path: join(directory, 'room.sqlite') });
  try {
    const roomId = 'a'.repeat(64), coordinator = createCommunityCoordinator({ roomId, persistence, now: () => 0 });await coordinator.initialization;
    await coordinator.join({ userId: 'a', connectionId: 'a', wantsQueue: true });await coordinator.join({ userId: 'b', connectionId: 'b', wantsQueue: true });
    expect(coordinator.snapshot().battle!.id.length).toBeLessThanOrEqual(96);expect(await persistence.loadRoom(`tod-community:${roomId}`)).not.toBeNull();
    expect(() => createCommunityCoordinator({ roomId: `${roomId}a`, persistence })).toThrow('64');
    expect(() => readCommunityState(initialCommunity(`${roomId}a`), `${roomId}a`, communityTuning({}))).toThrow('64');
  } finally { persistence.close();rmSync(directory, { recursive: true, force: true }); }
});

test('result receipts are bounded and evicted stale results never reapply', async () => {
  const persistence = createPortableMemoryPersistenceAdapter(), coordinator = createCommunityCoordinator({ roomId: 'friends', persistence, now: () => 0 });
  for (const userId of ['a', 'b']) await coordinator.join({ userId, connectionId: userId, wantsQueue: true });
  let original: Parameters<typeof coordinator.complete>[0] | undefined;
  for (let index = 0; index < 65; index++) {
    const battle = coordinator.snapshot().battle!;
    for (const userId of battle.fighters) await coordinator.ready({ userId, connectionId: userId, battleId: battle.id });
    const result = { battleId: battle.id, fighters: battle.fighters, winner: 0 as const };original ??= result;await coordinator.complete(result);
  }
  const state = requireRecord(await persistence.loadRoom('tod-community:friends'));expect(state.results).toHaveLength(64);
  const before = coordinator.snapshot();await expect(coordinator.complete(original!)).rejects.toThrow('stale');expect(coordinator.snapshot()).toEqual(before);
});
