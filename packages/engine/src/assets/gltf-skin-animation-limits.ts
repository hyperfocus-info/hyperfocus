const DEFAULT_LIMITS = {
  maxBuffers: 64,
  maxBufferBytes: 268435456,
  maxBufferViews: 100_000,
  maxAccessors: 100_000,
  maxNodes: 100_000,
  maxMeshes: 10_000,
  maxPrimitives: 50_000,
  maxVertices: 10_000_000,
  maxSkins: 4_096,
  maxJointsPerSkin: 1_024,
  maxAnimations: 4_096,
  maxChannels: 100_000,
  maxKeyframes: 10_000_000,
  maxOutputBytes: 536870912
} as const;

const HARD_LIMITS = {
  maxBuffers: 1_024,
  maxBufferBytes: 1073741824,
  maxBufferViews: 1_000_000,
  maxAccessors: 1_000_000,
  maxNodes: 1_000_000,
  maxMeshes: 100_000,
  maxPrimitives: 1_000_000,
  maxVertices: 100_000_000,
  maxSkins: 65_535,
  maxJointsPerSkin: 65_535,
  maxAnimations: 65_535,
  maxChannels: 1_000_000,
  maxKeyframes: 100_000_000,
  maxOutputBytes: 1073741824
} as const;

export type GltfSkinAnimationCookLimits = { [Key in keyof typeof DEFAULT_LIMITS]?: number };
export type ResolvedGltfSkinAnimationCookLimits = { -readonly [Key in keyof typeof DEFAULT_LIMITS]: number };

function boundedOption(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new RangeError(`${label} must be an integer from 1 through ${maximum}.`);
  }
  return resolved;
}

export function resolveGltfSkinAnimationCookLimits(options: GltfSkinAnimationCookLimits): ResolvedGltfSkinAnimationCookLimits {
  const resolve = (key: keyof typeof DEFAULT_LIMITS) => boundedOption(options[key], DEFAULT_LIMITS[key], HARD_LIMITS[key], key);
  return {
    maxBuffers: resolve("maxBuffers"),
    maxBufferBytes: resolve("maxBufferBytes"),
    maxBufferViews: resolve("maxBufferViews"),
    maxAccessors: resolve("maxAccessors"),
    maxNodes: resolve("maxNodes"),
    maxMeshes: resolve("maxMeshes"),
    maxPrimitives: resolve("maxPrimitives"),
    maxVertices: resolve("maxVertices"),
    maxSkins: resolve("maxSkins"),
    maxJointsPerSkin: resolve("maxJointsPerSkin"),
    maxAnimations: resolve("maxAnimations"),
    maxChannels: resolve("maxChannels"),
    maxKeyframes: resolve("maxKeyframes"),
    maxOutputBytes: resolve("maxOutputBytes")
  };
}
