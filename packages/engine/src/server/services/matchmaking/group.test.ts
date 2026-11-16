import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDurableMmoServices, createMemoryDurableServiceStore, validateDurableServiceRecords } from '../durable-services.ts';
import { createSqliteDurableServiceStore } from '../durable-services-sqlite.ts';
import type { DurableServiceStore } from '../durable-service-types.ts';

async function fixture() {
  let now = 1000;
  const store = createMemoryDurableServiceStore(), services = createDurableMmoServices(store, { now: () => now });
  const tickets = await Promise.all(['alice', 'bob', 'cara'].map((id, index) => services.matchmaking.enqueue(id, 'duel', { idempotencyKey: id, attributes: { rating: 1000 + index * 200 } })));
  return { store, services, tickets, advance(ms: number) { now += ms; } };
}

test('complete selection is atomic, detached and excludes expired or already reserved tickets', async () => {
  const f = await fixture();
  const matched = await f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'one', capacity: 2, select({ tickets, now }) {
    expect(now).toBe(1000);expect(tickets).toHaveLength(3);
    tickets[0]!.attributes.rating = -999;
    return [tickets[0]!.id, tickets[2]!.id];
  } });
  expect(matched.map(ticket => ticket.playerId)).toEqual(['alice', 'cara']);expect(matched[0]!.attributes.rating).toBe(1000);
  expect(await f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'two', capacity: 2, select: ({ tickets }) => { expect(tickets.map(ticket => ticket.playerId)).toEqual(['bob']);return []; } })).toEqual([]);
  f.advance(300000);
  expect(await f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'two', capacity: 2, select: ({ tickets }) => { expect(tickets).toEqual([]);return []; } })).toEqual([]);
});

test('partial, duplicate, foreign and throwing selections preserve all tickets and audit records', async () => {
  const f = await fixture(), before = await f.store.exportRecords(), a = f.tickets[0]!.id;
  for (const ids of [[a], [a, a], [a, 'unknown'], [a, f.tickets[1]!.id, f.tickets[2]!.id]]) {
    await expect(f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'one', capacity: 2, select: () => ids })).rejects.toThrow();
    expect(await f.store.exportRecords()).toEqual(before);
  }
  await expect(f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'one', capacity: 2, select: () => { throw new Error('policy failure'); } })).rejects.toThrow('policy failure');
  expect(await f.store.exportRecords()).toEqual(before);
});

test('concurrent reservations cannot share a player and finalization releases claimed tickets exactly once', async () => {
  const f = await fixture();
  const results = await Promise.all(['one', 'two'].map(roomId => f.services.matchmaking.matchGroup({ queue: 'duel', roomId, capacity: 2, select: ({ tickets }) => tickets.length >= 2 ? tickets.slice(0, 2).map(ticket => ticket.id) : [] })));
  expect(results.map(tickets => tickets.length)).toEqual([2, 0]);
  const matched = results[0]!;
  for (const ticket of matched) await f.services.matchmaking.claim(ticket.playerId, ticket.id, ticket.handoff!.token, `claim-${ticket.playerId}`);
  const request = { ticketIds: matched.map(ticket => ticket.id), roomId: 'one', idempotencyKey: 'finish-one' };
  expect(await f.services.matchmaking.release({ ...request, roomId: 'wrong', idempotencyKey: 'wrong' })).toBe(false);
  expect(await f.services.matchmaking.release(request)).toBe(true);
  expect(await f.services.matchmaking.release(request)).toBe(true);
  await expect(f.services.matchmaking.release({ ...request, roomId: 'wrong' })).rejects.toThrow('different input');
  const next = await f.services.matchmaking.enqueue('alice', 'duel', { idempotencyKey: 'next' });
  expect(next.id).not.toBe(matched[0]!.id);expect(next.state).toBe('waiting');
  expect(await f.services.matchmaking.release(request)).toBe(true);
  expect((await f.services.matchmaking.ticketForPlayer('alice'))?.id).toBe(next.id);
  validateDurableServiceRecords(await f.store.exportRecords());
});

test('cancelled partner can finalize without removing a newer search', async () => {
  const f = await fixture();
  const matched = await f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'one', capacity: 2, select: ({ tickets }) => tickets.slice(0, 2).map(ticket => ticket.id) });
  await f.services.matchmaking.cancel('alice', 'cancel');
  const next = await f.services.matchmaking.enqueue('alice', 'duel', { idempotencyKey: 'again' });
  expect(await f.services.matchmaking.release({ ticketIds: matched.map(ticket => ticket.id), roomId: 'one', idempotencyKey: 'abandon' })).toBe(true);
  expect((await f.services.matchmaking.ticketForPlayer('alice'))?.id).toBe(next.id);
  expect(await f.services.matchmaking.release({ ticketIds: [next.id], roomId: 'one', idempotencyKey: 'waiting' })).toBe(false);
  validateDurableServiceRecords(await f.store.exportRecords());
});

test('expired ticket replacement and FIFO expiration retain restorable ownership indexes', async () => {
  const f = await fixture();f.advance(300000);
  const next = await f.services.matchmaking.enqueue('alice', 'duel', { idempotencyKey: 'after-expiry' });
  expect(next.id).not.toBe(f.tickets[0]!.id);
  validateDurableServiceRecords(await f.store.exportRecords());
  await f.services.matchmaking.match('duel', 'one', 2);
  expect(await f.services.matchmaking.ticketForPlayer('bob')).toBeUndefined();
  validateDurableServiceRecords(await f.store.exportRecords());
});

test('SQLite reopen preserves complete room assignments and finalization retries without deleting newer tickets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperfocus-match-group-')), path = join(directory, 'services.sqlite');
  let store = createSqliteDurableServiceStore({ path });
  try {
    let services = createDurableMmoServices(store, { now: () => 1000 });
    for (const player of ['alice', 'bob']) await services.matchmaking.enqueue(player, 'duel', { idempotencyKey: player, attributes: { rating: 1000 } });
    const matched = await services.matchmaking.matchGroup({ queue: 'duel', roomId: 'persisted', capacity: 2, select: ({ tickets }) => tickets.map(ticket => ticket.id) });
    const beforeClose = await store.exportRecords();validateDurableServiceRecords(beforeClose);
    store.close();store = createSqliteDurableServiceStore({ path });services = createDurableMmoServices(store, { now: () => 1000 });
    expect(await store.exportRecords()).toEqual(beforeClose);
    expect(await services.matchmaking.assignment({ roomId: 'persisted' })).toEqual(matched);
    expect(await services.matchmaking.assignment({ roomId: 'different' })).toEqual([]);
    for (const ticket of matched) await services.matchmaking.claim(ticket.playerId, ticket.id, ticket.handoff!.token, `claim-${ticket.playerId}`);
    const request = { roomId: 'persisted', ticketIds: matched.map(ticket => ticket.id), idempotencyKey: 'result-persisted' };
    expect(await services.matchmaking.release(request)).toBe(true);
    const next = await services.matchmaking.enqueue('alice', 'duel', { idempotencyKey: 'next-search' });
    const finalized = await store.exportRecords();validateDurableServiceRecords(finalized);
    store.close();store = createSqliteDurableServiceStore({ path });services = createDurableMmoServices(store, { now: () => 1000 });
    expect(await store.exportRecords()).toEqual(finalized);expect(await services.matchmaking.release(request)).toBe(true);
    expect(await services.matchmaking.assignment({ roomId: 'persisted' })).toEqual([]);
    expect((await services.matchmaking.ticketForPlayer('alice'))?.id).toBe(next.id);
    expect(await store.exportRecords()).toEqual(finalized);
    const restored = createMemoryDurableServiceStore();await restored.replaceRecordsAtomic(finalized);
    expect(await restored.exportRecords()).toEqual(finalized);validateDurableServiceRecords(await restored.exportRecords());
  } finally { store.close();rmSync(directory, { recursive: true, force: true }); }
});

test('SQLite failure after the first reservation write rolls back the whole group and permits retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperfocus-match-group-fault-'));
  const store = createSqliteDurableServiceStore({ path: join(directory, 'services.sqlite') });
  try {
    const ordinary = createDurableMmoServices(store, { now: () => 1000 });
    for (const player of ['alice', 'bob']) await ordinary.matchmaking.enqueue(player, 'duel', { idempotencyKey: player });
    const before = await store.exportRecords();let writes = 0;
    const faultStore: DurableServiceStore = { ...store, transaction(operation) {
      return store.transaction(tx => operation({ ...tx, put(bucket, key, value) {
        tx.put(bucket, key, value);
        if (bucket === 'ticket' && ++writes === 1) throw new Error('disk fault after first selected ticket');
      } }));
    } };
    const services = createDurableMmoServices(faultStore, { now: () => 1000 });
    const request = { queue: 'duel', roomId: 'atomic', capacity: 2, select: ({ tickets }: { tickets: readonly { id: string }[] }) => tickets.map(ticket => ticket.id) };
    await expect(services.matchmaking.matchGroup(request)).rejects.toThrow('disk fault');expect(writes).toBe(1);
    expect(await store.exportRecords()).toEqual(before);expect(await ordinary.matchmaking.assignment({ roomId: 'atomic' })).toEqual([]);
    validateDurableServiceRecords(await store.exportRecords());
    expect(await ordinary.matchmaking.matchGroup(request)).toHaveLength(2);validateDurableServiceRecords(await store.exportRecords());
  } finally { store.close();rmSync(directory, { recursive: true, force: true }); }
});

test('runtime async selectors are rejected before any durable mutation', async () => {
  const f = await fixture(), before = await f.store.exportRecords();
  await expect(f.services.matchmaking.matchGroup({ queue: 'duel', roomId: 'async', capacity: 2,
    // Deliberately emulate an untyped JavaScript host violating the synchronous selector contract.
    // @ts-expect-error Async selectors must be rejected at runtime as well as by TypeScript.
    select: async ({ tickets }) => { tickets[0]!.attributes.rating = 0;return tickets.slice(0, 2).map(ticket => ticket.id); },
  })).rejects.toThrow('synchronous');
  await Promise.resolve();expect(await f.store.exportRecords()).toEqual(before);
  expect(await f.services.matchmaking.assignment({ roomId: 'async' })).toEqual([]);validateDurableServiceRecords(await f.store.exportRecords());
});
