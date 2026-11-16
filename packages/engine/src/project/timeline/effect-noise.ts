/** Stable pseudo-random sample for camera offsets and particle directions. */

export function timelineEffectNoise2D(effectId: string, sample: number) {
  let hash = 2_166_136_261;
  const source = `${effectId}:${Math.floor(sample)}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  // Avalanche nearby suffixes: plain FNV clusters consecutive particle indices.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 0xffff_ffff) * 2 - 1;
}
