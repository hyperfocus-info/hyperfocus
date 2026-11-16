import { expect, test } from 'bun:test';
import { createCollisionKernel } from './collision-kernel.ts';

test.each(['scalar', 'simd'] as const)('resident batches survive other allocations in the shipped %s module', async variant => {
  const bytes = await Bun.file(new URL(`../../wasm/collision-kernel.${variant}.wasm`, import.meta.url)).arrayBuffer();
  const kernel = await createCollisionKernel({ variant, scratchStrategy: 'grow', batchPolicy: { backend: 'wasm' },
    fetch: Object.assign(async () => new Response(bytes, { headers: { 'content-type': 'application/wasm' } }), { preconnect: globalThis.fetch.preconnect }) });
  const create = kernel.createResidentCircleRectBatch;
  if (!create) throw Error('Shipped WASM resident batch export is unavailable');
  const input = (count: number) => ({ count, cx: new Float32Array(count).fill(1), cy: new Float32Array(count).fill(1),
    radius: new Float32Array(count).fill(1), rx: new Float32Array(count), ry: new Float32Array(count),
    rw: new Float32Array(count).fill(4), rh: new Float32Array(count).fill(4) });
  const smallInput = input(8), largeInput = input(100_000);
  const first = create(smallInput);
  const before = new Uint8Array(8);
  expect(first.run()).toBe(8);
  first.copyMask(before);
  const other = create(largeInput);
  try {
    expect(first.run()).toBe(8);
    const mask = new Uint8Array(8);
    first.copyMask(mask);
    expect(mask).toEqual(before);
    first.write({ ...smallInput, cx: new Float32Array(8).fill(100) });
    expect(first.run()).toBe(0);
    first.copyMask(mask);
    expect([...mask]).toEqual(Array(8).fill(0));
    const scratch = new Uint8Array(largeInput.count);
    expect(kernel.testCircleRectOverlapBatch({ ...largeInput, out: scratch })).toBe(largeInput.count);
    expect(other.run()).toBe(largeInput.count);
    const otherMask = new Uint8Array(largeInput.count);
    other.copyMask(otherMask);
    expect(otherMask).toEqual(scratch);
    first.write(smallInput);
    expect(first.run()).toBe(8);
    first.copyMask(mask);
    expect(mask).toEqual(before);
  } finally { first.release(); other.release(); }
});
