export function createFixedSlotPool(capacity: number, label: string) {
  const active = new Uint8Array(capacity);
  const free = new Uint32Array(capacity);
  let freeCount = capacity;
  let count = 0;
  for (let index = 0; index < capacity; index += 1) free[index] = capacity - index - 1;
  function assert(handle: number) {
    if (!Number.isInteger(handle) || handle < 0 || handle >= active.length || active[handle] === 0) {
      throw new RangeError(`${label} handle ${handle} is not active.`);
    }
  }
  return {
    active,
    get count() { return count; },
    allocate() {
      if (freeCount === 0) throw new RangeError(`${label} registry capacity ${active.length} is exhausted.`);
      const handle = free[--freeCount];
      active[handle] = 1;
      count += 1;
      return handle;
    },
    release(handle: number) {
      assert(handle);
      active[handle] = 0;
      free[freeCount++] = handle;
      count -= 1;
    },
    assert
  };
}

export type FixedSlotPool = ReturnType<typeof createFixedSlotPool>;
