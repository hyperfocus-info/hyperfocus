/** Private slots stay dense; public identities fit the existing Int32 query buffers. */
export function createPhysics2DHandles(alive: Uint8Array) {
  const capacity = alive.length;
  const generations = new Uint32Array(capacity);
  const maximum = 2_147_483_647;
  const at = (slot: number) => generations[slot] * capacity + slot;
  return {
    at,
    resolve(handle: number): number | undefined {
      if (!Number.isSafeInteger(handle) || handle < 0 || handle > maximum || capacity === 0) return undefined;
      const slot = handle % capacity;
      return alive[slot] && at(slot) === handle ? slot : undefined;
    },
    retire(slot: number) {
      if (at(slot) + capacity > maximum) return false;
      generations[slot] += 1;
      return true;
    },
    storageBytes: generations.byteLength
  };
}
