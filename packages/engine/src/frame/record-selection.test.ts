import { expect, test } from 'bun:test';
import { createFrameRecordSelection, createOrderedFrameRecordSelection } from './record-selection.ts';

test('selection borrows current records while avoiding scene reads after binding', () => {
  const select = createFrameRecordSelection({ ids: ['fighter', 'hand'] });
  const initial = Array.from({ length: 3420 }, (_, i) => ({ id: i === 20 ? 'fighter' : i === 30 ? 'hand' : `scenery-${i}`, value: i }));
  const first = select(initial);
  const next = initial.map(row => ({ ...row, value: row.value + 1 }));
  let reads = 0;
  const watched = new Proxy(next, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++;return Reflect.get(target, key, receiver); } });
  const second = select(watched);
  expect(reads).toBe(2);expect(second).not.toBe(first);
  expect(second[0]).toBe(next[20]);expect(second[1]).toBe(next[30]);
  second[0]!.value = 99;expect(next[20]!.value).toBe(99);expect(first[0]!.value).toBe(20);
});

test('reordering, same-length replacement, removal and reappearance never reuse stale records', () => {
  const ids = ['a', 'b'], select = createFrameRecordSelection({ ids });ids.push('c');
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, replacement = { id: 'a' };
  expect(select([c, a, b])).toEqual([a, b]);
  expect(select([b, c, replacement])).toEqual([replacement, b]);
  expect(select([b, c])).toEqual([b]);
  expect(select([a, c])).toEqual([a]);
  expect(select([c, b, a])).toEqual([a, b]);
  expect(select([])).toEqual([]);expect(select([b, a])).toEqual([a, b]);
  expect(createFrameRecordSelection({ ids: [] })([a])).toEqual([]);
  expect(() => createFrameRecordSelection({ ids: ['a', 'a'] })).toThrow('unique');
});

test('optional selection counters separate checked slots from rebuilt scene indexes', () => {
  const select = createFrameRecordSelection({ ids: ['a', 'b'], diagnostics: true });
  const rows = [{ id: 'other' }, { id: 'a' }, { id: 'b' }];
  select(rows);expect(select.readWork()).toEqual({ slotChecks: 2, indexBuilds: 1, indexVisits: 3, recordReads: 7, selectedRecords: 2, slotBytes: 8 });
  select(rows.map(row => ({ ...row })));expect(select.readWork()).toMatchObject({ slotChecks: 2, indexBuilds: 0, indexVisits: 0, recordReads: 2, selectedRecords: 2 });
  select([...rows].reverse());expect(select.readWork()).toMatchObject({ slotChecks: 2, indexBuilds: 1, indexVisits: 3, selectedRecords: 2 });
  select([]);expect(select.readWork()).toMatchObject({ slotChecks: 2, indexBuilds: 1, indexVisits: 0, selectedRecords: 0 });
  const quiet = createFrameRecordSelection({ ids: ['a'] });quiet(rows);
  expect(quiet.readWork()).toEqual({ slotChecks: 0, indexBuilds: 0, indexVisits: 0, recordReads: 0, selectedRecords: 0, slotBytes: 4 });
});

test('ordered slots preserve duplicates/current references and reject stale or malformed plans', () => {
  const indices = [1, 3], ids = ['same', 'same'], select = createOrderedFrameRecordSelection({ indices, ids, diagnostics: true });
  indices[0] = 0;ids[0] = 'other';
  const rows = [{ id: 'other' }, { id: 'same', value: 1 }, { id: 'other' }, { id: 'same', value: 2 }];
  expect(select(rows)).toEqual([rows[1]!, rows[3]!]);
  const fresh = rows.map(row => ({ ...row }));const output = select(fresh)!;
  expect(output[0]).toBe(fresh[1]);expect(output[1]).toBe(fresh[3]);expect(output[0]).not.toBe(rows[1]);
  expect(select.readWork()).toEqual({ slotChecks: 2, recordReads: 2, selectedRecords: 2, mismatches: 0, bindingEntries: 2, slotBytes: 8 });
  expect(select(rows.slice(0, 3))).toBeUndefined();expect(select.readWork()).toMatchObject({ slotChecks: 2, selectedRecords: 0, mismatches: 1 });
  expect(select([...rows].reverse())).toBeUndefined();expect(select(rows)).toHaveLength(2);
  for (const slots of [[-1], [1, 1], [2, 1], [.5], [0x80000000]]) expect(() => createOrderedFrameRecordSelection({ indices: slots, ids: slots.map(() => 'a') })).toThrow('increasing');
  expect(() => createOrderedFrameRecordSelection({ indices: [1], ids: [] })).toThrow('equal');
  expect(createOrderedFrameRecordSelection({ indices: [], ids: [] })(rows)).toEqual([]);
});
