import { expect, test } from 'bun:test';
import { createBufferedFrames } from './buffered-frames.ts';

function setup(buffers: 1 | 2 | 3) {
  const jobs: Array<{ sequence: number; epoch: number; input: number; buffer: ArrayBuffer; resolve(value: { buffer: ArrayBuffer; output: number }): void; reject(error: unknown): void }> = [], errors: unknown[] = [];
  const frames = createBufferedFrames({ buffers, bufferBytes: 16, onError: error => errors.push(error), run: (job: { sequence: number; epoch: number; input: number; buffer: ArrayBuffer }) => new Promise<{ buffer: ArrayBuffer; output: number }>((resolve, reject) => {
    jobs.push({ ...job, buffer: structuredClone(job.buffer, { transfer: [job.buffer] }), resolve, reject });
  }) });
  const complete = async (index: number) => { const job = jobs[index]!;new Float64Array(job.buffer)[0] = job.input;job.resolve({ output: job.input, buffer: structuredClone(job.buffer, { transfer: [job.buffer] }) });await Promise.resolve(); };
  return { frames, jobs, errors, complete };
}

test('one through three transferred buffers bound admission and preserve exclusive read ownership', async () => {
  for (const count of [1, 2, 3] as const) {
    const { frames, jobs, complete } = setup(count);
    for (let i = 0; i < count; i++) expect(frames.submit(i + 1)).toBe(true);
    expect(frames.submit(999)).toBe(false);expect(jobs.length).toBe(count);
    await complete(0);const lease = frames.takeLatest()!;
    expect(new Float64Array(lease.buffer)[0]).toBe(1);expect(frames.submit(999)).toBe(false);
    lease.release();lease.release();expect(frames.submit(100)).toBe(true);
    expect(lease.buffer.byteLength).toBe(0); // Ownership moved back to the executor.
    expect(frames.snapshot().retainedBufferBytes).toBe(count * 16);frames.dispose();
  }
});

test('newer results replace ready frames and late completion cannot move presentation backwards', async () => {
  const { frames, complete } = setup(3);
  frames.submit(1);frames.submit(2);frames.submit(3);
  await complete(1);await complete(2);
  const newest = frames.takeLatest()!;expect(newest.output).toBe(3);newest.release();
  await complete(0);expect(frames.takeLatest()).toBeUndefined();
  expect(frames.snapshot()).toMatchObject({ superseded: 2, running: 0, ready: 0 });
});

test('reset fences in-flight results, disposal stops admission, and executor failures are observable', async () => {
  const { frames, jobs, errors, complete } = setup(2);
  frames.submit(1);frames.reset();frames.submit(2);
  await complete(0);expect(frames.takeLatest()).toBeUndefined();
  jobs[1]!.reject(Error('worker stopped'));await Promise.resolve();
  expect(errors).toHaveLength(1);expect(frames.snapshot().failed).toBe(true);expect(frames.submit(3)).toBe(false);
  frames.dispose();expect(frames.takeLatest()).toBeUndefined();
  const fresh = setup(1);fresh.frames.submit(1);fresh.frames.dispose();await fresh.complete(0);
  expect(fresh.frames.takeLatest()).toBeUndefined();expect(fresh.frames.submit(2)).toBe(false);
});

test('an invalid returned capacity fails closed rather than reusing a detached or undersized buffer', async () => {
  const { frames, jobs, errors } = setup(1);frames.submit(1);
  jobs[0]!.resolve({ buffer: new ArrayBuffer(8), output: 1 });await Promise.resolve();
  expect(errors).toHaveLength(1);expect(frames.snapshot().failed).toBe(true);expect(frames.takeLatest()).toBeUndefined();
});
