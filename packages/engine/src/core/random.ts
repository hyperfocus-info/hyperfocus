export type SeedableRandomSnapshot = {
  seed: number;
  state: number;
};

export type SeedPathPart = number | string;

export interface SeedableRandom {
  readonly seed: number;
  next(): number;
  nextInt(maxExclusive: number): number;
  nextRange(min: number, max: number): number;
  fork(...path: readonly SeedPathPart[]): SeedableRandom;
  snapshot(): SeedableRandomSnapshot;
  restore(snapshot: SeedableRandomSnapshot): void;
}

const SEED_DOMAIN = 0x9e3779b9;

function avalanche32(value: number) {
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function mixSeedByte(hash: number, byte: number) {
  return Math.imul(hash ^ byte, 16777619) >>> 0;
}

export function hashSeed(seed: number | string | undefined) {
  if (seed === undefined) return 0xdecafbad;
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Derives a stable, domain-separated child seed without consuming a random
 * stream. Length and type markers prevent ambiguous paths such as ["ab", "c"]
 * and ["a", "bc"] from sharing a seed.
 */
export function deriveSeed(parent: number | string, ...path: readonly SeedPathPart[]) {
  let hash = avalanche32(hashSeed(parent) ^ SEED_DOMAIN);
  for (const part of path) {
    if (typeof part === "number") {
      if (!Number.isSafeInteger(part)) throw new RangeError("numeric seed path parts must be safe integers");
      hash = mixSeedByte(hash, 0x01);
      const normalized = BigInt(part);
      for (let shift = 0n; shift < 64n; shift += 8n) {
        hash = mixSeedByte(hash, Number((normalized >> shift) & 0xffn));
      }
    } else {
      hash = mixSeedByte(hash, 0x02);
      const bytes = new TextEncoder().encode(part);
      hash = mixSeedByte(hash, bytes.length & 0xff);
      hash = mixSeedByte(hash, (bytes.length >>> 8) & 0xff);
      hash = mixSeedByte(hash, (bytes.length >>> 16) & 0xff);
      hash = mixSeedByte(hash, (bytes.length >>> 24) & 0xff);
      for (const byte of bytes) hash = mixSeedByte(hash, byte);
    }
    hash = avalanche32(hash);
  }
  return hash >>> 0;
}

export function createSeedableRandom(source: number | string = 0xdecafbad): SeedableRandom {
  const seed = hashSeed(source);
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return Object.freeze({
    seed,
    next,
    nextInt(maxExclusive: number) {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    nextRange: (min: number, max: number) => min + next() * (max - min),
    /** Creates a child stream from this stream's root seed, independent of draw order. */
    fork: (...path: readonly SeedPathPart[]) => createSeedableRandom(deriveSeed(seed, ...path)),
    snapshot: (): SeedableRandomSnapshot => ({ seed, state }),
    restore(snapshot: SeedableRandomSnapshot) { state = snapshot.state >>> 0; },
  });
}
