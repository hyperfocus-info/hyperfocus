import { expect, test } from 'bun:test';
import { createMemoryDurableServiceStore, validateDurableServiceRecords } from './durable-services.ts';

test('host-owned combat policy envelopes survive durable backup replacement without weakening social schemas', async () => {
  const records = [{ bucket: 'combat-policy', key: 'policy:content:head', value: 'host-validated-envelope' }];
  const first = createMemoryDurableServiceStore(), second = createMemoryDurableServiceStore();
  await first.replaceRecordsAtomic(records);
  await second.replaceRecordsAtomic(await first.exportRecords());
  expect(await second.exportRecords()).toEqual(records);
  expect(() => validateDurableServiceRecords([{ ...records[0]!, value: 7 }])).toThrow('encoded strings');
  expect(() => validateDurableServiceRecords([{ bucket: 'wallet', key: 'player/coins', value: 'opaque' }])).toThrow();
});

test('host replay envelopes retain strict metadata through backup replacement', async () => {
  const records = [{ bucket: 'replay-share', key: 'opaque-link', value: { owner: 'player', digest: 'a'.repeat(64), expires: 1000, payload: 'host-versioned-replay' } }];
  const first = createMemoryDurableServiceStore(), second = createMemoryDurableServiceStore();
  await first.replaceRecordsAtomic(records);await second.replaceRecordsAtomic(await first.exportRecords());expect(await second.exportRecords()).toEqual(records);
  expect(() => validateDurableServiceRecords([{ ...records[0]!, value: { ...records[0]!.value, digest: 'bad' } }])).toThrow('envelope');
});
