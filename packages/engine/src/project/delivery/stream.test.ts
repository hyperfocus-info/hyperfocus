import { expect, test } from 'bun:test';
import { readDeliveryStream } from './stream.ts';

test('known-size streaming owns bytes immediately and returns one exact buffer', async () => {
  const shared = new Uint8Array([1, 2]);let reads = 0;
  const progress: number[] = [];
  const reader = new ReadableStream<Uint8Array>({ pull(controller) {
    if (reads++ === 0) controller.enqueue(shared);
    else if (reads === 2) { shared.set([3, 4]);controller.enqueue(shared); }
    else controller.close();
  } }, { highWaterMark: 0 }).getReader();
  const bytes = await readDeliveryStream({ reader, maxBytes: 4, expectedBytes: 4, onProgress: count => progress.push(count) });
  expect([...bytes]).toEqual([1, 2, 3, 4]);expect(bytes.buffer.byteLength).toBe(4);expect(progress).toEqual([2, 4]);
});

test.each(['overflow', 'short', 'empty', 'error'] as const)('stream failure %s cancels and releases ownership', async mode => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    if (mode === 'error') controller.error(Error('Network interrupted'));
    else { controller.enqueue(new Uint8Array(mode === 'overflow' ? 3 : mode === 'empty' ? 0 : 1));if (mode === 'short') controller.close(); }
  }, cancel() { cancelled = true; } });
  await expect(readDeliveryStream({ reader: stream.getReader(), maxBytes: 2, expectedBytes: 2 })).rejects.toThrow();
  expect(stream.locked).toBe(false);
  if (mode === 'overflow' || mode === 'empty') expect(cancelled).toBe(true);
});

test('a stalled body times out, cancels the pending read and releases its lock', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await expect(readDeliveryStream({ reader: stream.getReader(), maxBytes: 2, expectedBytes: 2, idleTimeoutMs: 10 })).rejects.toThrow('stalled');
  expect(cancelled).toBe(true);expect(stream.locked).toBe(false);
});

test('unknown-size manifests grow within their bound and progress failure cancels', async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(70000).fill(7));controller.close(); } });
  const bytes = await readDeliveryStream({ reader: stream.getReader(), maxBytes: 100000 });
  expect(bytes.length).toBe(70000);expect(bytes[69999]).toBe(7);expect(bytes.buffer.byteLength).toBeLessThanOrEqual(100000);
  let cancelled = false;
  const failed = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } });
  await expect(readDeliveryStream({ reader: failed.getReader(), maxBytes: 2, onProgress() { throw Error('Disposed UI'); } })).rejects.toThrow('Disposed UI');
  expect(cancelled).toBe(true);expect(failed.locked).toBe(false);
});
