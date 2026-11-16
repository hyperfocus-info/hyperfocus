import { expect, test } from 'bun:test';
import { createPortableMemoryPersistenceAdapter } from '@hyperfocus/engine/server';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommunityCoordinator } from './coordinator.ts';

const identity = (userId: string, connectionId = userId) => ({ userId, connectionId });
function fixture() {
  let clock = 0;const persistence = createPortableMemoryPersistenceAdapter();
  const coordinator = createCommunityCoordinator({ roomId: 'friends', persistence, now: () => clock });
  return { coordinator, persistence, advance(ms: number) { clock += ms; } };
}
async function playing(coordinator: ReturnType<typeof createCommunityCoordinator>) {
  const battle = coordinator.snapshot().battle!;
  for (const userId of battle.fighters) await coordinator.ready({ ...identity(userId), battleId: battle.id });
  expect(coordinator.snapshot().battle?.phase).toBe('playing');return coordinator.snapshot().battle!;
}

test('durable results retry reward delivery after failure without rotating twice', async () => {
  let attempts = 0;
  const coordinator = createCommunityCoordinator({ roomId: 'friends', persistence: createPortableMemoryPersistenceAdapter(),
    async onResult(result) { expect(result.userIds).toEqual(['a', 'b']);expect(result.winnerId).toBe('a');if (++attempts === 1) throw new Error('reward storage unavailable'); } });
  await coordinator.initialization;
  for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });
  const battle = await playing(coordinator);
  await expect(coordinator.complete({ battleId: battle.id, fighters: battle.fighters, winner: 0 })).rejects.toThrow('reward storage unavailable');
  expect(coordinator.snapshot().streak?.wins).toBe(1);
  await coordinator.tick();expect(attempts).toBe(2);expect(coordinator.snapshot().streak?.wins).toBe(1);
});

test('queue stays stable, trusted results are idempotent and third win rotates the champion', async () => {
  const { coordinator } = fixture();await coordinator.initialization;
  for (const userId of ['a', 'b', 'c', 'd']) await coordinator.join({ ...identity(userId), wantsQueue: true });
  expect(coordinator.snapshot().battle?.fighters).toEqual(['a', 'b']);expect(coordinator.snapshot().queue).toEqual(['c', 'd']);
  for (let win = 1; win <= 3; win++) {
    const battle = await playing(coordinator), result = { battleId: battle.id, fighters: battle.fighters, winner: 0 as const };
    await Promise.all([coordinator.complete(result), coordinator.complete(result)]);
    const state = coordinator.snapshot();expect(state.lastResult).toEqual(result);
    if (win < 3) { expect(state.streak).toEqual({ userId: 'a', wins: win });expect(state.battle?.fighters[0]).toBe('a'); }
    else { expect(state.streak).toBeNull();expect(state.battle?.fighters).toEqual(['b', 'c']);expect(state.queue).toEqual(['d', 'a']); }
    const before = coordinator.snapshot();await expect(coordinator.complete({ ...result, winner: 1 })).rejects.toThrow('Conflicting');expect(coordinator.snapshot()).toEqual(before);
  }
  const detached = coordinator.snapshot();detached.members.length = 0;expect(coordinator.snapshot().members).toHaveLength(4);
});

test('ready deadline skips AFK members until they deliberately requeue', async () => {
  const { coordinator, advance } = fixture();await coordinator.initialization;
  for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });
  const old = coordinator.snapshot().battle!;await coordinator.ready({ ...identity('a'), battleId: old.id });advance(15000);await coordinator.tick();
  expect(coordinator.snapshot().battle?.fighters).toEqual(['a', 'c']);expect(coordinator.snapshot().members.find(member => member.userId === 'b')?.wantsQueue).toBe(false);
  await expect(coordinator.ready({ ...identity('b'), battleId: old.id })).rejects.toThrow('stale');
  await coordinator.queue({ ...identity('b'), enabled: true });expect(coordinator.snapshot().queue).toEqual(['b']);
});

test('terminal concessions rotate once, while ready departures and shutdown never award a win', async () => {
  const { coordinator } = fixture();for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });
  const first = await playing(coordinator);await coordinator.disconnect({ ...identity('b', 'stale'), reason: 'leave' });expect(coordinator.snapshot().battle?.id).toBe(first.id);
  await coordinator.disconnect({ ...identity('b'), reason: 'reconnect-timeout' });expect(coordinator.snapshot()).toMatchObject({ lastResult: { battleId: first.id, winner: 0 }, streak: { userId: 'a', wins: 1 } });
  const next = coordinator.snapshot().battle!;expect(next.fighters).toEqual(['a', 'c']);await coordinator.disconnect({ ...identity('a'), reason: 'leave' });expect(coordinator.snapshot().lastResult?.battleId).toBe(first.id);
  await coordinator.shutdown();expect(coordinator.snapshot().battle).toBeNull();expect(coordinator.snapshot().lastResult?.battleId).toBe(first.id);
});

test('first terminal departure remains decisive across a failed write and a second departure', async () => {
  const persistence = createPortableMemoryPersistenceAdapter();let fail = false;
  const coordinator = createCommunityCoordinator({ roomId: 'friends', now: () => 0, persistence: { loadRoom: persistence.loadRoom, async saveRoom(id, value) { if (fail) throw new Error('disk failed');await persistence.saveRoom(id, value); } } });
  for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });const first = await playing(coordinator);
  fail = true;await expect(coordinator.disconnect({ ...identity('b'), reason: 'leave' })).rejects.toThrow('disk');fail = false;
  await coordinator.disconnect({ ...identity('a'), reason: 'leave' });expect(coordinator.snapshot().lastResult).toEqual({ battleId: first.id, fighters: first.fighters, winner: 0 });
  await coordinator.disconnect({ ...identity('b'), reason: 'leave' });expect(coordinator.snapshot().streak).toEqual({ userId: 'a', wins: 1 });
});

test('nonrecoverable connection closes concede only playing battles and cannot replace an existing result', async () => {
  for (const phase of ['ready', 'playing', 'judged']) {
    const { coordinator } = fixture();for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });
    const battle = coordinator.snapshot().battle!;
    if (phase !== 'ready') await playing(coordinator);
    if (phase === 'judged') await coordinator.complete({ battleId: battle.id, fighters: battle.fighters, winner: 0 });
    await coordinator.disconnect({ ...identity(phase === 'judged' ? 'a' : 'b'), reason: 'connection-close' });
    const result = coordinator.snapshot();
    if (phase === 'ready') { expect(result.lastResult).toBeNull();expect(result.streak).toBeNull(); }
    else { expect(result.lastResult).toEqual({ battleId: battle.id, fighters: battle.fighters, winner: 0 });expect(result.streak).toEqual({ userId: 'a', wins: 1 }); }
  }
});

test('replacement connections reject old controls and stale disconnect cannot remove current membership', async () => {
  const { coordinator, advance } = fixture();await coordinator.join({ ...identity('a', 'old'), wantsQueue: true });
  await coordinator.join({ ...identity('a', 'new'), wantsQueue: false });await coordinator.disconnect(identity('a', 'old'));
  expect(coordinator.snapshot().queue).toEqual(['a']);expect(coordinator.snapshot().members[0]?.wantsQueue).toBe(true);
  expect(coordinator.snapshot().members[0]?.online).toBe(true);await expect(coordinator.queue({ ...identity('a', 'old'), enabled: false })).rejects.toThrow('stale');
  await coordinator.disconnect(identity('a', 'new'));expect(coordinator.snapshot().queue).toEqual(['a']);advance(29999);await coordinator.tick();expect(coordinator.snapshot().members).toHaveLength(1);
  advance(1);await coordinator.tick();expect(coordinator.snapshot().members).toEqual([]);expect(coordinator.snapshot().queue).toEqual([]);
});

test('withdrawing during ready returns the other fighter; withdrawing during play waits for its result', async () => {
  const { coordinator } = fixture();for (const userId of ['a', 'b', 'c']) await coordinator.join({ ...identity(userId), wantsQueue: true });
  await coordinator.queue({ ...identity('a'), enabled: false });expect(coordinator.snapshot().battle?.fighters).toEqual(['b', 'c']);
  const battle = await playing(coordinator);await coordinator.queue({ ...identity('b'), enabled: false });
  expect(coordinator.snapshot().battle?.id).toBe(battle.id);expect(coordinator.snapshot().battle?.phase).toBe('playing');
  await coordinator.complete({ battleId: battle.id, fighters: battle.fighters, winner: 0 });expect(coordinator.snapshot().queue).toEqual(['c']);expect(coordinator.snapshot().battle).toBeNull();
});

test('failed persistence publishes neither membership nor connection replacement and lane recovers', async () => {
  const memory = createPortableMemoryPersistenceAdapter();let fail = false;
  const coordinator = createCommunityCoordinator({ roomId: 'friends', now: () => 0, persistence: {
    loadRoom: memory.loadRoom, async saveRoom(id, state) { if (fail) throw new Error('disk full');await memory.saveRoom(id, state); },
  } });
  await coordinator.join({ ...identity('a', 'old'), wantsQueue: true });const before = coordinator.snapshot();fail = true;
  await expect(coordinator.join({ ...identity('a', 'new'), wantsQueue: false })).rejects.toThrow('disk full');expect(coordinator.snapshot()).toEqual(before);
  fail = false;await coordinator.queue({ ...identity('a', 'old'), enabled: false });expect(coordinator.snapshot().queue).toEqual([]);
});

test('SQLite reopen interrupts active battle, preserves identity order and awards no invented win', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tod-community-')), path = join(directory, 'rooms.sqlite');let store = createSqlitePersistenceAdapter({ path });
  try {
    const first = createCommunityCoordinator({ roomId: 'friends', persistence: store, now: () => 0 });
    for (const userId of ['a', 'b', 'c']) await first.join({ ...identity(userId), wantsQueue: true });await playing(first);store.close();
    store = createSqlitePersistenceAdapter({ path });const restored = createCommunityCoordinator({ roomId: 'friends', persistence: store, now: () => 100 });await restored.initialization;
    expect(restored.snapshot().battle).toBeNull();expect(restored.snapshot().queue).toEqual(['a', 'b', 'c']);expect(restored.snapshot().lastResult).toBeNull();
    expect(restored.snapshot().members.every(member => !member.online && member.disconnectedUntil === 30100)).toBe(true);
    await restored.join({ ...identity('a'), wantsQueue: true });await restored.join({ ...identity('b'), wantsQueue: true });expect(restored.snapshot().battle?.fighters).toEqual(['a', 'b']);
    expect(restored.snapshot().battle?.id).toBe('friends:2');
    await playing(restored);await restored.disconnect({ ...identity('b'), reason: 'leave' });const concession = restored.snapshot().lastResult;expect(concession?.winner).toBe(0);
    store.close();store = createSqlitePersistenceAdapter({ path });const final = createCommunityCoordinator({ roomId: 'friends', persistence: store, now: () => 200 });await final.initialization;
    expect(final.snapshot().lastResult).toEqual(concession);expect(final.snapshot().streak).toEqual({ userId: 'a', wins: 1 });
  } finally { store.close();rmSync(directory, { recursive: true, force: true }); }
});

test('invalid stored data, capacity and inputs fail closed', async () => {
  const persistence = createPortableMemoryPersistenceAdapter();await persistence.saveRoom('tod-community:friends', { version: 2 });
  const invalid = createCommunityCoordinator({ roomId: 'friends', persistence });await expect(invalid.initialization).rejects.toThrow();expect(() => invalid.snapshot()).toThrow('initialized');
  const coordinator = createCommunityCoordinator({ roomId: 'friends', persistence: createPortableMemoryPersistenceAdapter(), maxMembers: 2, now: () => 0 });
  await Promise.all(['a', 'b'].map(userId => coordinator.join({ ...identity(userId), wantsQueue: false })));
  await expect(coordinator.join({ ...identity('c'), wantsQueue: false })).rejects.toThrow('full');expect(coordinator.snapshot().members).toHaveLength(2);
  expect(() => coordinator.join({ ...identity('bad user'), wantsQueue: true })).toThrow('identity');
});
