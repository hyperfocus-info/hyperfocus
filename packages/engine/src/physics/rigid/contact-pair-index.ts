const INDEX_THRESHOLD = 128;

/** Bounded scratch index; rebuilt from the previous frame, never retained as state.
 * The owning world supplies equal-capacity arrays and a count within that capacity.
 * Encoded chain entries are previous-contact indices plus one; zero ends a chain.
 */
export function createContactPairIndex(a: Int32Array, b: Int32Array) {
  let capacity = 0;
  if (a.length >= INDEX_THRESHOLD) {
    capacity = 1;
    while (capacity < a.length * 2) capacity *= 2;
  }
  const heads = new Uint32Array(capacity);
  const next = new Uint32Array(capacity ? a.length : 0);
  let count = 0;
  let mask = 0;
  let indexed = false;

  function bucket(first: number, second: number) {
    const low = Math.min(first, second), high = Math.max(first, second);
    const hash = Math.imul(low + 1, 0x9e3779b1) ^ Math.imul(high + 1, 0x85ebca6b);
    return (hash ^ (hash >>> 16)) & mask;
  }

  return {
    storageBytes: heads.byteLength + next.byteLength,
    rebuild(length: number) {
      count = length;
      indexed = false;
    },
    find(first: number, second: number, hint = -1) {
      if (hint >= 0 && hint < count && (a[hint] === first && b[hint] === second || a[hint] === second && b[hint] === first)) return hint;
      if (count < INDEX_THRESHOLD) {
        for (let index = 0; index < count; index += 1) {
          if (a[index] === first && b[index] === second || a[index] === second && b[index] === first) return index;
        }
        return -1;
      }
      // Stable contact order needs no hash work. Build lazily on the first miss.
      if (!indexed) {
        let buckets = 1;
        while (buckets < count * 2) buckets *= 2;
        mask = buckets - 1;
        // Clear only the active range, even when maxContacts greatly exceeds usage.
        heads.fill(0, 0, buckets);
        for (let index = 0; index < count; index += 1) {
          const slot = bucket(a[index]!, b[index]!);
          next[index] = heads[slot]!;
          heads[slot] = index + 1;
        }
        indexed = true;
      }
      for (let entry = heads[bucket(first, second)]!; entry; entry = next[entry - 1]!) {
        const index = entry - 1;
        if (a[index] === first && b[index] === second || a[index] === second && b[index] === first) return index;
      }
      return -1;
    },
  };
}
