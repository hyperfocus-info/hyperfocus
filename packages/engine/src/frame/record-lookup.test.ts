import { expect, test } from 'bun:test';
import { createFrameRecordLookup } from './record-lookup.ts';

test('slot lookups validate current identity and match linear reads across detached and changed topology', () => {
  const ids = ['a', 'b', 'c'], lookup = createFrameRecordLookup({ ids, strategy: 'slots', diagnostics: true });
  for (const order of [ids, ['c', 'a', 'b'], ['b'], [], ['x', 'b', 'a', 'c'], ids]) {
    const records = order.map(id => ({ id, value: Symbol(id) }));
    for (const id of [...ids, 'x', 'unplanned']) expect(lookup.get(records, id)).toBe(records.find(record => record.id === id));
  }
  const previous = ids.map(id => ({ id, old: true })), current = ids.map(id => ({ id, old: false }));
  for (const id of ids) lookup.get(previous, id);
  for (const id of ids) expect(lookup.get(current, id)).toBe(current.find(record => record.id === id));
  expect(lookup.work.indexBuilds).toBeGreaterThan(0);expect(lookup.work.retainedIds).toBe(3);expect(lookup.work.typedBytes).toBe(12);
});

test('lookup counters count actual scans, current slot checks, rebuilds and bounded storage', () => {
  const records = ['a', 'b', 'c'].map(id => ({ id }));
  const linear = createFrameRecordLookup({ ids: records.map(record => record.id), strategy: 'linear', diagnostics: true });
  const slots = createFrameRecordLookup({ ids: records.map(record => record.id), strategy: 'slots', diagnostics: true });
  for (const id of ['c', 'a']) { linear.get(records, id);slots.get(records, id); }
  expect(linear.work).toEqual({ requests: 2, linearVisits: 4, slotChecks: 0, indexBuilds: 0, indexVisits: 0, typedBytes: 0, retainedIds: 0 });
  expect(slots.work).toEqual({ requests: 2, linearVisits: 0, slotChecks: 2, indexBuilds: 0, indexVisits: 0, typedBytes: 12, retainedIds: 3 });
  const reversed = records.slice().reverse();expect(slots.get(reversed, 'a')).toBe(records[0]);
  expect(slots.work.indexBuilds).toBe(1);expect(slots.work.indexVisits).toBe(3);expect(slots.work.slotChecks).toBe(3);
  slots.resetWork();
  expect(slots.work).toEqual({ requests: 0, linearVisits: 0, slotChecks: 0, indexBuilds: 0, indexVisits: 0, typedBytes: 12, retainedIds: 3 });
  for (let index = 0; index < 1000; index++) slots.get([{ id: `transient:${index}` }], `transient:${index}`);
  expect(slots.work.linearVisits).toBe(1000);expect(slots.work.indexBuilds).toBe(0);
  expect(slots.work.retainedIds).toBe(3);expect(slots.work.typedBytes).toBe(12);
});

test('lookup plans reject unsupported strategies and duplicate authored identities', () => {
  expect(() => createFrameRecordLookup({ ids: ['a', 'a'], strategy: 'slots' })).toThrow('must be unique');
  expect(() => Reflect.apply(createFrameRecordLookup, undefined, [{ ids: ['a'], strategy: 'unbounded' }])).toThrow('Unsupported');
  const lookup = createFrameRecordLookup({ ids: ['a'], strategy: 'slots' });
  lookup.get([{ id: 'a' }], 'a');expect(lookup.work.requests).toBe(0);expect(lookup.work.slotChecks).toBe(0);
});
