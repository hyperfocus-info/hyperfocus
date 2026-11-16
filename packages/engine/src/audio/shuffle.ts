/** Seeded shuffled bags keep every choice eligible without adjacent repeats across refills. */
export function createAudioShuffle(seed = 1) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('Audio shuffle seed must be an unsigned 32-bit integer.');
  let random = seed || 1;
  const bags = new Map<string, { indices: number[]; last: number }>();
  return {
    next(key: string, size: number) {
      let bag = bags.get(key);
      if (!bag) { if (bags.size >= 128) { const oldest = bags.keys().next().value;if (oldest !== undefined) bags.delete(oldest); }bag = { indices: [], last: -1 };bags.set(key, bag); }
      if (!bag.indices.length) {
        bag.indices = Array.from({ length: size }, (_, index) => index);
        for (let i = size - 1; i > 0; i--) { random ^= random << 13;random ^= random >>> 17;random ^= random << 5;random >>>= 0;const j = random % (i + 1), value = bag.indices[i]!;bag.indices[i] = bag.indices[j]!;bag.indices[j] = value; }
        if (size > 1 && bag.indices[0] === bag.last) { const value = bag.indices[0]!;bag.indices[0] = bag.indices[1]!;bag.indices[1] = value; }
      }
      const index = bag.indices.shift() ?? 0;bag.last = index;return index;
    },
    reset() { random = seed || 1;bags.clear(); },
  };
}
