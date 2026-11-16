import { expect, test } from 'bun:test';
import { SQL } from 'bun';
import { createPostgresPersistenceAdapter } from './persistence.ts';
import { createPostgresDurableServiceStore } from './durable-store.ts';
import { createPostgresModerationIndex } from './moderation-index.ts';

const integration = process.env.TOD_POSTGRES_TEST_URL_FILE ? test : test.skip;

/** Each run owns a fresh schema; the configured service's existing records are never modified. */
integration('PostgreSQL adapters preserve bounds, rollback, reopen, concurrent sequences and account-scoped moderation', async () => {
  const url = (await Bun.file(process.env.TOD_POSTGRES_TEST_URL_FILE!).text()).trim();
  const schema = `tod_adapter_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const first = new SQL(url, { max: 1 }), second = new SQL(url, { max: 1 });
  await first.unsafe(`CREATE SCHEMA ${schema}`);
  try {
    await first.unsafe(`SET search_path TO ${schema}`);await second.unsafe(`SET search_path TO ${schema}`);
    const persistence = await createPostgresPersistenceAdapter({ sql: first, maxPlayers: 2, maxEvents: 2 });
    const other = await createPostgresPersistenceAdapter({ sql: second, maxPlayers: 2, maxEvents: 2 });
    const writes = await Promise.allSettled([persistence.savePlayer('one', { value: 1 }), other.savePlayer('two', { value: 2 }), persistence.savePlayer('three', {})]);
    expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(writes.filter(result => result.status === 'rejected')).toHaveLength(1);
    await persistence.savePlayer('one', { value: 4 });expect(await other.loadPlayer('one')).toEqual({ value: 4 });
    await persistence.appendEvents!([{ event: 1 }, { event: 2 }]);
    await expect(other.appendEvent!({ event: 3 })).rejects.toThrow('event limit');
    const snapshot = await persistence.exportPortableSnapshot();
    await expect(persistence.replacePortableSnapshotAtomic({ ...snapshot, players: [...snapshot.players, { id: 'overflow', record: {} }] })).rejects.toThrow();
    expect(await persistence.exportPortableSnapshot()).toEqual(snapshot);
    persistence.close();await expect(persistence.loadPlayer('one')).rejects.toThrow('closed');
    const reopened = await createPostgresPersistenceAdapter({ sql: first, maxPlayers: 2, maxEvents: 2 });expect(await reopened.exportPortableSnapshot()).toEqual(snapshot);
    await reopened.replacePortableSnapshotAtomic({ version: 1, players: [{ id: 'tod-uploads:alice', record: {} }, { id: 'tod-upload-reports:bob', record: {} }], rooms: [], events: [] });
    const index = createPostgresModerationIndex({ sql: first });expect(await index.page({ kind: 'owners', cursor: '' })).toEqual({ ids: ['alice'], nextCursor: '' });
    expect(await index.page({ kind: 'reporters', cursor: '' })).toEqual({ ids: ['bob'], nextCursor: '' });index.close();
    const store = await createPostgresDurableServiceStore({ sql: first }), peer = await createPostgresDurableServiceStore({ sql: second });
    const numbers = await Promise.all(Array.from({ length: 8 }, (_, n) => (n % 2 ? store : peer).transaction(tx => tx.nextSequence('test'))));
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    await store.transaction(tx => { tx.put('inventory', 'owner/a', { ownerId: 'owner', sku: 'a', quantity: 1, updatedAt: 1 });tx.put('inventory', 'owner/b', { ownerId: 'owner', sku: 'b', quantity: 2, updatedAt: 1 }); });
    const records = await peer.exportRecords();
    await expect(store.transaction(tx => { tx.put('inventory', 'owner/a', { quantity: 99 });tx.nextSequence('test');throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await peer.exportRecords()).toEqual(records);
    await expect(store.transaction(async tx => { tx.delete('inventory', 'owner/a'); })).rejects.toThrow('synchronous');
    expect(await peer.exportRecords()).toEqual(records);
    expect(await store.transaction(tx => tx.scan('inventory', { limit: 1, reverse: true }))).toMatchObject([{ key: 'owner/b' }]);
    await store.transaction(tx => { tx.delete('inventory', 'owner/a');tx.put('inventory', 'owner/b', { ownerId: 'owner', sku: 'b', quantity: 3, updatedAt: 1 }); });
    expect(await peer.transaction(tx => tx.get('inventory', 'owner/a'))).toBeUndefined();
    await store.replaceRecordsAtomic(records);expect(await peer.exportRecords()).toEqual(records);
    const bounded = await createPostgresDurableServiceStore({ sql: first, maxRecords: 3 });
    await expect(bounded.transaction(tx => tx.put('inventory', 'extra', {}))).rejects.toThrow('record limit');
    expect(await peer.exportRecords()).toEqual(records);
    store.close();await expect(store.exportRecords()).rejects.toThrow('closed');
    expect((await first`SELECT 1 AS value`)[0].value).toBe(1);
  } finally {
    await second.close();
    await first.unsafe(`DROP SCHEMA ${schema} CASCADE`);await first.close();
  }
}, 60_000);
