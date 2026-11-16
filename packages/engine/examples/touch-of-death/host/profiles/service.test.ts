import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { createProfileService } from './service.ts';
import { createTouchOfDeathRecoverySlot } from '../../src/presentation/wardrobe.ts';

const catalog: AppearanceCatalog3D = { version: 1, actors: [{ entityId: 'fighter' }], slots: [{ id: 'outfit', label: 'Outfit', defaultOptionId: 'blue', options: ['blue', 'red'].map(id => ({ id, label: id, colors: [{ materialSuffix: ':body', baseColor: [1, 0, 0, 1] }] })) }] };
const command = (requestId = 'one', expectedRevision = 0) => ({ type: 'profile-save', requestId, expectedRevision, name: ' Alice ', icon: 'moon', selections: { outfit: 'red' } });

test('host ownership gates get-up publishing and first-visit device looks use the free fallback', async () => {
  const f = fixture(), collection: Array<{ slot: string; option: string; label: string }> = [];
  const service = createProfileService({ persistence: f.persistence, catalog: { ...catalog, slots: [...catalog.slots, createTouchOfDeathRecoverySlot()] }, rewards: { read: () => ({ collection }) } });
  const selections = { outfit: 'red', 'recovery-style': 'kip-up' };
  const first = await service.initialize({ userId: 'alice', appearance: { name: 'Alice', icon: 'moon', selections } });
  expect(first.selections).toEqual({ outfit: 'red', 'recovery-style': 'stand-up' });
  await expect(service.save({ userId: 'alice', command: { ...command('locked', 1), selections } })).rejects.toThrow('Unlock');
  collection.push({ slot: 'recovery-style', option: 'kip-up', label: 'Get up: Kip up' });
  const saved = await service.save({ userId: 'alice', command: { ...command('unlocked', 1), selections } });
  expect(saved.selections['recovery-style']).toBe('kip-up');expect(saved.revision).toBe(2);
});
function fixture() {
  const records = new Map<string, unknown>();let fail = false;
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, value: unknown) { if (fail) throw new Error('disk failed');records.set(id, structuredClone(value)); } };
  return { service: createProfileService({ persistence, catalog }), persistence, records, set fail(value: boolean) { fail = value; } };
}
test('default, durable retries, failed writes, concurrent edits and detached returns', async () => {
  const f = fixture();
  expect(await f.service.read({ userId: 'alice' })).toEqual({ userId: 'alice', name: 'Player', icon: 'fist', revision: 0, selections: {} });
  f.fail = true;await expect(f.service.save({ userId: 'alice', command: command() })).rejects.toThrow('disk failed');
  expect((await f.service.read({ userId: 'alice' })).revision).toBe(0);f.fail = false;
  const first = await f.service.save({ userId: 'alice', command: command() });expect(first.name).toBe('Alice');
  first.selections.outfit = 'corrupt';expect((await f.service.read({ userId: 'alice' })).selections.outfit).toBe('red');
  expect((await f.service.save({ userId: 'alice', command: command() })).revision).toBe(1);
  await expect(f.service.save({ userId: 'alice', command: { ...command(), icon: 'star' } })).rejects.toThrow('already used');
  const results = await Promise.allSettled(['two', 'three'].map(id => f.service.save({ userId: 'alice', command: command(id, 1) })));
  expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1);expect(results.filter(value => value.status === 'rejected')).toHaveLength(1);
  expect((await f.service.read({ userId: 'alice' })).revision).toBe(2);
  expect((await createProfileService({ persistence: f.persistence, catalog }).save({ userId: 'alice', command: command() })).revision).toBe(1);
  for (const selections of [{ unknown: 'red' }, { outfit: 'unknown' }]) await expect(f.service.save({ userId: 'alice', command: { ...command('invalid', 2), selections } })).rejects.toThrow();
  expect(() => f.service.save({ userId: 'alice', command: { ...command(), userId: 'bob' } })).toThrow();
  expect((await f.service.read({ userId: 'bob' })).revision).toBe(0);
});
test('receipt retention is bounded and malformed stored records fail closed', async () => {
  const f = fixture();
  for (let n = 0; n < 66; n++) await f.service.save({ userId: 'alice', command: command(`r${n}`, n) });
  expect(requireRecord(f.records.get('tod-profile:alice')).receipts).toHaveLength(64);
  await expect(f.service.save({ userId: 'alice', command: command('r0', 0) })).rejects.toThrow('Reload');
  f.records.set('tod-profile:bob', f.records.get('tod-profile:alice'));
  await expect(f.service.read({ userId: 'bob' })).rejects.toThrow('identity mismatch');
  f.records.set('tod-profile:alice', { version: 2 });await expect(f.service.read({ userId: 'alice' })).rejects.toThrow();
});

test('first-visit initialization is serialized, durable and never overwrites an existing profile', async () => {
  const f = fixture(), appearance = { name: ' First ', icon: 'moon', selections: { outfit: 'red' } };
  f.fail = true;await expect(f.service.initialize({ userId: 'alice', appearance })).rejects.toThrow('disk failed');
  expect((await f.service.read({ userId: 'alice' })).revision).toBe(0);f.fail = false;
  const [first, second] = await Promise.all([
    f.service.initialize({ userId: 'alice', appearance }),
    f.service.initialize({ userId: 'alice', appearance: { ...appearance, name: 'Second' } }),
  ]);
  expect(first).toEqual({ userId: 'alice', name: 'First', icon: 'moon', selections: { outfit: 'red' }, revision: 1 });
  expect(second).toEqual(first);first.selections.outfit = 'blue';
  expect((await createProfileService({ persistence: f.persistence, catalog }).initialize({ userId: 'alice', appearance })).selections.outfit).toBe('red');
  for (const invalid of [{ ...appearance, selections: { outfit: 'missing' } }, { ...appearance, userId: 'bob' }]) expect(() => f.service.initialize({ userId: 'alice', appearance: invalid })).toThrow();
  const saved = await f.service.save({ userId: 'bob', command: command() });
  expect(await f.service.initialize({ userId: 'bob', appearance })).toEqual(saved);
});

test('initialization retries an uncertain commit without overwriting its first look', async () => {
  const f = fixture();let uncertain = true;
  const service = createProfileService({ catalog, persistence: { loadPlayer: f.persistence.loadPlayer,
    async savePlayer(id, value) { await f.persistence.savePlayer(id, value);if (uncertain) { uncertain = false;throw new Error('reply lost'); } },
  } });
  const appearance = { name: 'First', icon: 'star', selections: {} };
  await expect(service.initialize({ userId: 'alice', appearance })).rejects.toThrow('reply lost');
  expect(await service.initialize({ userId: 'alice', appearance: { ...appearance, name: 'Other' } })).toMatchObject({ name: 'First', revision: 1 });
});

test('guest defaults are short and stable without replacing saved names or identity', async () => {
  const f = fixture(), userId = 'guest:224178b6-f0da-4b3c-b9b8-9218c7f83340';
  const first = await f.service.read({ userId });
  expect(first).toEqual({ userId, name: 'Guest 224178B6', icon: 'fist', revision: 0, selections: {} });
  expect(await createProfileService({ persistence: f.persistence, catalog }).read({ userId })).toEqual(first);
  expect(f.records.size).toBe(0);
  expect((await f.service.read({ userId: 'guest:6b388a00-f294-4171-9615-155781dab0f4' })).name).toBe('Guest 6B388A00');
  expect((await f.service.read({ userId: 'guest:custom-account' })).name).toBe('Player');
  await f.service.save({ userId, command: { ...command(), name: 'Player' } });
  expect((await createProfileService({ persistence: f.persistence, catalog }).read({ userId })).name).toBe('Player');
  await f.service.save({ userId, command: { ...command('rename', 1), name: 'Ember' } });
  expect((await f.service.read({ userId })).name).toBe('Ember');
});
test('uncertain committed write retries from storage without incrementing twice', async () => {
  const f = fixture();let uncertain = true;
  const service = createProfileService({ catalog, persistence: { loadPlayer: f.persistence.loadPlayer,
    async savePlayer(id, value) { await f.persistence.savePlayer(id, value);if (uncertain) { uncertain = false;throw new Error('reply lost after commit'); } },
  } });
  await expect(service.save({ userId: 'alice', command: command() })).rejects.toThrow('reply lost');
  expect((await service.save({ userId: 'alice', command: command() })).revision).toBe(1);
  expect((await service.read({ userId: 'alice' })).revision).toBe(1);
});
test('real SQLite reopen retains profile and exactly-once receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-profile-'));let db = createSqlitePersistenceAdapter({ path: join(dir, 'profiles.sqlite') });
  try {
    const saved = await createProfileService({ persistence: db, catalog }).save({ userId: 'alice', command: command() });
    db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'profiles.sqlite') });
    const service = createProfileService({ persistence: db, catalog });
    expect(await service.read({ userId: 'alice' })).toEqual(saved);expect(await service.save({ userId: 'alice', command: command() })).toEqual(saved);
  } finally { db.close();if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unsafe temporary directory.');await rm(dir, { recursive: true, force: true }); }
});
