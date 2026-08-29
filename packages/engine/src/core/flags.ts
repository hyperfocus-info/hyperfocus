export function createFlags<T extends number>(...flags: T[]): number {
  return flags.reduce((combined, flag) => combined | flag, 0);
}

export function addFlags(baseFlags: number, ...flagsToAdd: number[]): number {
  return flagsToAdd.reduce((combined, flag) => combined | flag, baseFlags);
}

export function subtractFlags(baseFlags: number, ...flagsToRemove: number[]): number {
  const removalMask = flagsToRemove.reduce((mask, flag) => mask | flag, 0);
  return baseFlags & ~removalMask;
}

export function hasFlag(mask: number | undefined, flag: number): boolean {
  if (flag === 0 || mask === undefined) return mask === 0;
  return (mask & flag) === flag;
}

export function hasAllFlags(mask: number, ...flags: number[]): boolean {
  if (flags.length === 0) return true;
  const combinedCheckFlags = createFlags(...flags);
  if (combinedCheckFlags === 0) return true;
  return (mask & combinedCheckFlags) === combinedCheckFlags;
}

export function hasAnyFlag(mask: number | undefined, ...flags: number[]): boolean {
  if (flags.length === 0 || mask === undefined) return false;
  const combinedCheckFlags = createFlags(...flags);
  if (combinedCheckFlags === 0) return false;
  return (mask & combinedCheckFlags) !== 0;
}

export function createBitEnum<T extends string>(...keys: T[]): { NONE: 0 } & Record<T, number>;
export function createBitEnum(...keys: string[]): { NONE: 0 } & Record<string, number> {
  const flags: { NONE: 0 } & Record<string, number> = { NONE: 0 };
  for (const [index, key] of keys.entries()) flags[key] = 1 << index;
  return flags;
}

export function displayFlags(mask = 0, flagEnum: Record<string, number>, separator = " | "): string {
  const zeroFlagName = Object.entries(flagEnum).find(([, value]) => value === 0)?.[0];
  if (mask === 0) return zeroFlagName ?? (Object.keys(flagEnum).length > 0 ? "[None]" : "");
  const setFlagNames = Object.entries(flagEnum)
    .filter(([, value]) => value !== 0 && hasFlag(mask, value))
    .map(([key]) => key);
  return setFlagNames.length > 0 ? setFlagNames.join(separator) : `[Unknown Flags: ${mask}]`;
}
