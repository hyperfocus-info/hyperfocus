import { expect, test } from 'bun:test';
import { createDebouncedCallback } from './timing';

test('trailing debounce replaces pending args, supports reentry, flush and cancellation', () => {
  const queue = new Map<number, () => void>();
  const seen: string[] = [];
  let sequence = 0;
  const debounced = createDebouncedCallback({
    callback(value: string) { seen.push(value); if (value === 'again') debounced.invoke('reentry'); return value.length; },
    delay: 100,
    schedule(callback, delay) { expect(delay).toBe(100); const id = ++sequence; queue.set(id, callback); return () => { queue.delete(id); }; },
  });
  debounced.invoke('first'); debounced.invoke('last');
  expect(queue.size).toBe(1); expect(debounced.pending()).toBe(true);
  for (const [id, callback] of queue) { queue.delete(id); callback(); }
  expect(seen).toEqual(['last']); expect(debounced.pending()).toBe(false);
  debounced.invoke('cancel'); debounced.cancel(); expect(queue.size).toBe(0);
  debounced.invoke('again'); expect(debounced.flush()).toBe(5);
  expect(debounced.pending()).toBe(true); expect(queue.size).toBe(1);
  expect(debounced.flush()).toBe(7); expect(debounced.flush()).toBeUndefined();
  expect(seen).toEqual(['last', 'again', 'reentry']); expect(queue.size).toBe(0);
});

test('a disposed owner cancels a real scheduled callback', async () => {
  let called = false;
  const callback = createDebouncedCallback({ callback: () => { called = true; }, delay: 0 });
  callback.invoke(); callback.cancel();
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(called).toBe(false); expect(callback.pending()).toBe(false);
});

test('invalid delays fail before scheduling', () => {
  for (const delay of [-1, NaN, Infinity]) expect(() => createDebouncedCallback({ callback() {}, delay })).toThrow(RangeError);
});
